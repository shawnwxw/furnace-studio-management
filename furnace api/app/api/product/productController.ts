import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ProductDetails, ProductGalleryPicture, ProductPictureChanges, ProductPictureDetails, ProductPictureSelection, ProductPictureType, ProductRecord } from '../../interface/product';
import { zipEntries, zipSize } from '../zipArchive';
import { buildProductDocument } from './productDocument';
import { readFinancialEntries } from '../financial-report/financialLedger';
import { inventoryUnitsSold, queueInventoryChange, stockOnHand } from './salesInventory';

const productDirectory = path.join(process.cwd(), 'data', 'product');
const productOrderFile = path.join(productDirectory, 'order.json');
const homeProductsFile = path.join(productDirectory, 'home-products.json');
const homeProductLimit = 2;
const productId = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const defaultDetails: ProductDetails = { note: '', stock: 0, manufacturingCostCents: null, packagingCostCents: null, shippingCostCents: null, saleValueCents: null, description: '', valueCurrency: 'AUD', includeInRevenue: true };
const valueFields = {
  manufacturingCost: 'manufacturingCostCents',
  packagingCost: 'packagingCostCents',
  shippingCost: 'shippingCostCents',
  saleValue: 'saleValueCents',
} as const;
const unitValueNames = Object.keys(valueFields) as (keyof typeof valueFields)[];
const maxNoteLength = 2000;
const maxDescriptionLength = 4000;
const maxGalleryPictures = 9;
const maxPictureBytes = 10 * 1024 * 1024;
const pictureExtensions = new Map<ProductPictureType, string>([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
]);

// Keeps the image filename usable on disk without trusting the uploaded filename.
function pictureFilename(type: ProductPictureType, version?: string) {
  return `picture${version ? '-' + version : ''}.${pictureExtensions.get(type)}`;
}

// Maps a validated gallery record to its unique filename in the product folder.
function galleryFilename(picture: ProductGalleryPicture) {
  return `gallery-${picture.id}.${pictureExtensions.get(picture.type)}`;
}

// Validates optional picture titles and notes, including older uncaptioned records.
function isPictureDetails(value: unknown): value is ProductPictureDetails {
  if (!value || typeof value !== 'object') return false;
  const { title, note } = value as ProductPictureDetails;
  return (title === undefined || (typeof title === 'string' && title.length <= 120)) &&
    (note === undefined || (typeof note === 'string' && note.length <= 1000));
}

// Validates gallery metadata before using it to resolve a file.
function isGalleryPicture(picture: unknown): picture is ProductGalleryPicture {
  if (!picture || typeof picture !== 'object') return false;
  const { id, type } = picture as Partial<ProductGalleryPicture>;
  return typeof id === 'string' && productId.test(id) && type !== undefined && pictureExtensions.has(type) && isPictureDetails(picture);
}

// Uses file signatures so an upload cannot choose its own response content type.
function pictureType(bytes: Buffer): ProductPictureType | undefined {
  if (bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'image/jpeg';
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  const signature = bytes.toString('ascii', 0, 6);
  if (signature === 'GIF87a' || signature === 'GIF89a') return 'image/gif';
}

// Checks that a stock count can be stored without rounding or losing precision.
function isStock(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

// Loads the metadata from a product folder published by the upload handler.
async function readProduct(id: string): Promise<ProductRecord> {
  const record = JSON.parse(await readFile(path.join(productDirectory, id, 'product.json'), 'utf8')) as Omit<ProductRecord, keyof ProductDetails | 'gallery'> & Partial<ProductDetails> & { gallery?: unknown };
  if (record.id !== id || typeof record.name !== 'string' || typeof record.submittedAt !== 'string' ||
      !Number.isFinite(Date.parse(record.submittedAt)) || !pictureExtensions.has(record.pictureType) ||
      (record.note !== undefined && typeof record.note !== 'string') ||
      (record.stock !== undefined && !isStock(record.stock)) ||
      (record.initialStock !== undefined && !isStock(record.initialStock)) ||
      (record.stockCountAt !== undefined && (typeof record.stockCountAt !== 'string' || !/^-?\d+$/.test(record.stockCountAt))) ||
      Object.values(valueFields).some(field => {
        const value = record[field];
        return value != null && (!isStock(value) || value > 99_999_999_999);
      }) ||
      (record.includeInRevenue !== undefined && typeof record.includeInRevenue !== 'boolean') ||
      (record.description !== undefined && typeof record.description !== 'string') ||
      (record.pictureVersion !== undefined && (typeof record.pictureVersion !== 'string' || !productId.test(record.pictureVersion)))) {
    throw new Error(`Invalid metadata for product ${id}`);
  }
  const gallery = record.gallery ?? [];
  if (!Array.isArray(gallery) || gallery.length > maxGalleryPictures || !gallery.every(isGalleryPicture) ||
      new Set(gallery.map(picture => picture.id)).size !== gallery.length) {
    throw new Error(`Invalid gallery for product ${id}`);
  }
  const mainPicturePosition = record.mainPicturePosition ?? 0;
  if (!isStock(mainPicturePosition) || mainPicturePosition > gallery.length ||
      (record.mainPictureDetails !== undefined && !isPictureDetails(record.mainPictureDetails))) {
    throw new Error(`Invalid main picture details for product ${id}`);
  }
  // Older product files can contain per-value currency metadata.
  for (const name of unitValueNames) Reflect.deleteProperty(record, `${name}Currency`);
  return { ...defaultDetails, ...record, valueCurrency: 'AUD', gallery, mainPicturePosition };
}

// Maps missing files to a normal empty or not-found response.
function isMissing(error: unknown) {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

// Keeps filesystem details in the server logs.
function storageError(error: unknown) {
  console.error('Product storage failed:', error);
  return Response.json({ error: 'Could not access product storage.' }, { status: 500 });
}

// Expose available stock and keep the internal inventory checkpoint private.
function withAvailableStock(product: ProductRecord, sold: bigint) {
  const { stockCountAt, ...details } = product;
  return {
    ...details, initialStock: product.initialStock ?? product.stock,
    stock: Number(stockOnHand({ stock: product.stock, stockCountAt }, sold)),
  };
}

// Accepts only unique product IDs in an order snapshot.
function isProductOrder(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(id => typeof id === 'string' && productId.test(id)) &&
    new Set(value).size === value.length;
}

// Reads a product ID list while distinguishing an unset list from an empty selection.
async function readProductIds(file: string): Promise<string[] | null> {
  const stored: unknown = await readFile(file, 'utf8')
    .then(body => JSON.parse(body))
    .catch(error => {
      if (isMissing(error)) return null;
      throw error;
    });
  if (stored !== null && !isProductOrder(stored)) throw new Error('Invalid product ID list');
  return stored;
}

// Publishes an ID list atomically so a reader always sees complete JSON.
async function writeProductIds(file: string, ids: string[]) {
  const temporary = file + '.' + randomUUID() + '.tmp';
  try {
    await writeFile(temporary, JSON.stringify(ids, null, 2) + '\n', { flag: 'wx' });
    await rename(temporary, file);
  } finally {
    await rm(temporary, { force: true });
  }
}

// Lists new products first and applies the saved order to products that have been arranged.
export async function readOrderedProducts() {
  const entries = await readdir(productDirectory, { withFileTypes: true }).catch(error => {
    if (isMissing(error)) return [];
    throw error;
  });
  const [records, financialEntries] = await Promise.all([
    Promise.all(entries.filter(entry => entry.isDirectory() && productId.test(entry.name))
    .map(entry => readProduct(entry.name).catch(error => {
      if (isMissing(error)) return undefined;
      throw error;
    }))),
    readFinancialEntries(),
  ]);
  const units = inventoryUnitsSold(financialEntries);
  const products = records.flatMap(record => record ? [withAvailableStock(record, units.get(record.id) ?? BigInt(0))] : []);
  const stored = await readProductIds(productOrderFile) ?? [];
  const positions = new Map(stored.map((id, index) => [id, index]));
  return products.sort((first, second) => (positions.get(first.id) ?? -1) - (positions.get(second.id) ?? -1) ||
    second.submittedAt.localeCompare(first.submittedAt) || first.id.localeCompare(second.id));
}

// Keeps an explicit Home selection even when all of its products have been removed.
async function readHomeProductIds(products: ProductRecord[]) {
  const featured = await readProductIds(homeProductsFile);
  const available = new Set(products.map(product => product.id));
  return featured?.filter(id => available.has(id)).slice(0, homeProductLimit) ?? null;
}

// Returns the saved order and Home selection in one snapshot.
async function productListResponse(products: ProductRecord[]) {
  return Response.json({ products, homeProductIds: await readHomeProductIds(products) }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}

// Returns the same saved product list to both pages.
export async function listProducts() {
  try {
    return await productListResponse(await readOrderedProducts());
  } catch (error) {
    return storageError(error);
  }
}

// Saves a new order atomically after checking that the displayed list is still current.
export async function saveProductOrder(request: Request) {
  const body = await request.json().catch(() => null);
  const ids: unknown = body?.ids;
  const previousIds: unknown = body?.previousIds;
  if (!isProductOrder(ids) || !isProductOrder(previousIds)) {
    return Response.json({ error: 'Expected an ordered list of unique product IDs.' }, { status: 400 });
  }

  try {
    return await queueInventoryChange(async () => {
      const products = await readOrderedProducts();
      const currentIds = products.map(product => product.id);
      if (JSON.stringify(ids) === JSON.stringify(currentIds)) {
        return productListResponse(products);
      }
      if (JSON.stringify(previousIds) !== JSON.stringify(currentIds)) {
        return Response.json({ error: 'Products changed before the order could be saved.' }, { status: 409 });
      }

      const recordsById = new Map(products.map(product => [product.id, product]));
      if (ids.length !== products.length || ids.some(id => !recordsById.has(id))) {
        return Response.json({ error: 'The order must include every current product.' }, { status: 400 });
      }
      await writeProductIds(productOrderFile, ids);
      return productListResponse(ids.map(id => recordsById.get(id)!));
    });
  } catch (error) {
    return storageError(error);
  }
}

// Adds new selections at the bottom and drops the oldest selection when Home is full.
export async function setHomeProduct(request: Request) {
  const body = await request.json().catch(() => null);
  const id: unknown = body?.id;
  const featured: unknown = body?.featured;
  if (typeof id !== 'string' || !productId.test(id) || typeof featured !== 'boolean') {
    return Response.json({ error: 'Expected a product ID and Home selection state.' }, { status: 400 });
  }
  try {
    return await queueInventoryChange(async () => {
      const products = await readOrderedProducts();
      if (!products.some(product => product.id === id)) {
        return Response.json({ error: 'Product not found.' }, { status: 404 });
      }
      const current = await readHomeProductIds(products) ?? products.slice(0, homeProductLimit).map(product => product.id);
      let next = current;
      if (!featured) {
        next = current.filter(productId => productId !== id);
      } else if (!current.includes(id)) {
        next = [...current, id].slice(-homeProductLimit);
      }
      await writeProductIds(homeProductsFile, next);
      return Response.json({ homeProductIds: next });
    });
  } catch (error) {
    return storageError(error);
  }
}

// Reads and validates one uploaded image before it can reach disk.
async function readUpload(picture: FormDataEntryValue) {
  if (typeof picture === 'string' || picture.size === 0) {
    return Response.json({ error: 'Select a valid product picture.' }, { status: 400 });
  }
  if (picture.size > maxPictureBytes) {
    return Response.json({ error: 'Product pictures must be 10 MB or smaller.' }, { status: 413 });
  }
  const bytes = Buffer.from(await picture.arrayBuffer());
  const type = pictureType(bytes);
  if (!type) {
    return Response.json({ error: 'Choose a JPEG, PNG, WebP, or GIF picture.' }, { status: 415 });
  }
  return { bytes, type };
}

// Validates the ordered picture list and reads the files attached to new entries.
async function readPictureSelection(form: FormData, raw: FormDataEntryValue): Promise<ProductPictureSelection | Response> {
  const invalid = () => Response.json({ error: 'Select one to ten pictures and choose a main picture.' }, { status: 400 });
  if (typeof raw !== 'string' || raw.length > 128 * 1024) return invalid();
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    return invalid();
  }
  if (!value || !Array.isArray(value.pictures) || value.pictures.length < 1 ||
      value.pictures.length > maxGalleryPictures + 1 || typeof value.mainId !== 'string' ||
      (value.expected !== undefined && typeof value.expected !== 'string')) return invalid();

  const pictures: ProductPictureSelection['pictures'] = [];
  const ids = new Set<string>();
  for (const entry of value.pictures) {
    if (!entry || typeof entry.id !== 'string' || typeof entry.upload !== 'boolean' ||
        (entry.id !== 'main' && !productId.test(entry.id)) || ids.has(entry.id)) return invalid();
    const { id, upload } = entry;
    if (!isPictureDetails(entry)) {
      return Response.json({ error: 'Picture titles can have up to 120 characters and notes up to 1,000.' }, { status: 400 });
    }
    const details: ProductPictureDetails = {};
    if (entry.title !== undefined) details.title = entry.title.trim();
    if (entry.note !== undefined) details.note = entry.note.trim();
    ids.add(id);
    if (upload) {
      const file = form.get(`picture:${id}`);
      if (id === 'main' || file === null) return invalid();
      const image = await readUpload(file);
      if (image instanceof Response) return image;
      pictures.push({ id: id, image, details });
    } else {
      pictures.push({ id: id, details });
    }
  }
  const mainIndex = pictures.findIndex(picture => picture.id === value.mainId);
  if (mainIndex < 0) return invalid();
  return { mainIndex, expected: value.expected, pictures };
}

// Resolves the selected main picture and preserves the gallery's submitted order.
async function resolvePictureSelection(selection: ProductPictureSelection, current?: ProductRecord): Promise<ProductPictureChanges | Response> {
  const invalid = () => Response.json({ error: 'A selected picture is no longer available.' }, { status: 409 });
  if (current && selection.expected !== JSON.stringify([
    current.pictureVersion ?? null, current.mainPicturePosition ?? 0, current.gallery.map(picture => picture.id),
    ...(current.pictureMetadataVersion ? [current.pictureMetadataVersion] : []),
  ])) return invalid();

  const gallery: ProductGalleryPicture[] = [];
  const uploads: ProductPictureChanges['uploads'] = [];
  let replacement: ProductPictureChanges['replacement'];
  let mainPictureDetails: ProductPictureDetails | undefined;
  const currentPictures = new Map(current?.gallery.map(picture => [picture.id, picture]));
  for (const [index, { id, image, details }] of selection.pictures.entries()) {
    const main = index === selection.mainIndex;
    if (image) {
      if (main) {
        replacement = image;
        mainPictureDetails = details;
      } else {
        const picture = { id: randomUUID(), type: image.type, ...details };
        gallery.push(picture);
        uploads.push({ ...picture, bytes: image.bytes });
      }
      continue;
    }
    if (!current) return invalid();
    const directory = path.join(productDirectory, current.id);
    if (id === 'main') {
      if (main) {
        mainPictureDetails = { ...current.mainPictureDetails, ...details };
      } else {
        const picture = { id: randomUUID(), type: current.pictureType, ...current.mainPictureDetails, ...details };
        const bytes = await readFile(path.join(directory, pictureFilename(current.pictureType, current.pictureVersion)));
        gallery.push(picture);
        uploads.push({ ...picture, bytes });
      }
    } else {
      const picture = currentPictures.get(id);
      if (!picture) return invalid();
      if (main) {
        replacement = { type: picture.type, bytes: await readFile(path.join(directory, galleryFilename(picture))) };
        mainPictureDetails = { title: picture.title, note: picture.note, ...details };
      } else {
        gallery.push({ ...picture, ...details });
      }
    }
  }
  const retained = new Set(gallery.map(picture => picture.id));
  const removed = current?.gallery.filter(picture => !retained.has(picture.id)) ?? [];
  return { gallery, uploads, removed, replacement, mainPictureDetails, mainPicturePosition: selection.mainIndex };
}

// Reads and validates the fields shared by product creation and editing.
async function readProductForm(request: Request) {
  if (Number(request.headers.get('content-length')) > (maxGalleryPictures + 1) * maxPictureBytes + 256 * 1024) {
    return Response.json({ error: 'The product picture upload is too large.' }, { status: 413 });
  }
  const form = await request.formData().catch(() => null);
  const rawName = form?.get('name');
  const name = typeof rawName === 'string' ? rawName.trim() : '';
  if (!name || name.length > 200) {
    return Response.json({ error: 'Enter a product name of up to 200 characters.' }, { status: 400 });
  }
  const note = form?.get('note');
  const description = form?.get('description');
  const rawStock = form?.get('stock');
  const rawInitialStock = form?.get('initialStock');
  const initialStock = typeof rawInitialStock === 'string' && rawInitialStock.trim() ? Number(rawInitialStock) : undefined;
  const rawExpectedInitialStock = form?.get('expectedInitialStock');
  const expectedInitialStock = typeof rawExpectedInitialStock === 'string' && rawExpectedInitialStock.trim()
    ? Number(rawExpectedInitialStock) : undefined;
  const rawExpectedStock = form?.get('expectedStock');
  const expectedStock = typeof rawExpectedStock === 'string' && rawExpectedStock.trim() ? Number(rawExpectedStock) : undefined;
  const includeInRevenue = form?.get('includeInRevenue');
  const stock = typeof rawStock === 'string' && rawStock.trim() ? Number(rawStock) : NaN;
  if (note != null && (typeof note !== 'string' || note.length > maxNoteLength)) {
    return Response.json({ error: 'Enter a note of up to 2,000 characters.' }, { status: 400 });
  }
  if (description != null && (typeof description !== 'string' || description.length > maxDescriptionLength)) {
    return Response.json({ error: 'Enter a description of up to 4,000 characters.' }, { status: 400 });
  }
  if (rawStock != null && !isStock(stock)) {
    return Response.json({ error: 'Enter a whole stock count of zero or more.' }, { status: 400 });
  }
  if (rawInitialStock != null && !isStock(initialStock)) {
    return Response.json({ error: 'Enter a whole initial stock count of zero or more.' }, { status: 400 });
  }
  if (rawExpectedInitialStock != null && !isStock(expectedInitialStock)) {
    return Response.json({ error: 'Invalid initial stock count for this edit.' }, { status: 400 });
  }
  if (rawExpectedStock != null && !isStock(expectedStock)) {
    return Response.json({ error: 'Invalid stock count for this edit.' }, { status: 400 });
  }

  if (includeInRevenue != null && includeInRevenue !== 'true' && includeInRevenue !== 'false') {
    return Response.json({ error: 'Invalid product revenue setting.' }, { status: 400 });
  }

  const valueCurrency = form?.get('valueCurrency');
  if (valueCurrency != null && valueCurrency !== 'AUD') {
    return Response.json({ error: 'Enter product values in Australian dollars (A$).' }, { status: 400 });
  }

  // Missing fields preserve stored values. A blank field clears its value.
  const details: Partial<ProductDetails> = {};
  if (note != null) details.note = note.trim();
  if (description != null) details.description = description.trim();
  if (rawStock != null) details.stock = stock;
  if (initialStock !== undefined) details.initialStock = initialStock;
  if (valueCurrency != null) details.valueCurrency = valueCurrency;
  for (const name of unitValueNames) {
    const currency = form?.get(`${name}Currency`);
    if (currency != null && currency !== 'AUD') {
      return Response.json({ error: 'Enter product values in Australian dollars (A$).' }, { status: 400 });
    }
    const value = form?.get(name);
    if (value == null) continue;
    const amount = typeof value === 'string' ? value.trim() : '';
    const parts = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(amount);
    if (typeof value !== 'string' || (amount && !parts)) {
      return Response.json({ error: 'Enter valid product values with up to two decimal places.' }, { status: 400 });
    }
    details[valueFields[name]] = parts ? Number(parts[1]) * 100 + Number((parts[2] ?? '').padEnd(2, '0')) : null;
  }
  if (includeInRevenue != null) details.includeInRevenue = includeInRevenue === 'true';

  const managedInput = form?.get('managedPictures');
  if (form && managedInput != null) {
    const managed = await readPictureSelection(form, managedInput);
    if (managed instanceof Response) return managed;
    return { name, details, expectedStock, expectedInitialStock, managed, picture: undefined, gallery: [], removedPictures: [], removeMainPicture: false };
  }

  const mainUpload = form?.get('picture');
  const picture = mainUpload == null ? undefined : await readUpload(mainUpload);
  if (picture instanceof Response) return picture;

  const galleryUploads = form?.getAll('gallery') ?? [];
  if (galleryUploads.length > maxGalleryPictures) {
    return Response.json({ error: 'A product can have up to nine additional gallery pictures.' }, { status: 400 });
  }
  const gallery = [];
  for (const upload of galleryUploads) {
    const image = await readUpload(upload);
    if (image instanceof Response) return image;
    gallery.push({ id: randomUUID(), ...image });
  }
  const removedPictures = form?.getAll('removeGallery') ?? [];
  if (!removedPictures.every(id => typeof id === 'string' && productId.test(id))) {
    return Response.json({ error: 'Invalid gallery picture selection.' }, { status: 400 });
  }
  return { name, details, expectedStock, expectedInitialStock, managed: undefined, picture, gallery, removedPictures, removeMainPicture: form?.get('removeMainPicture') === '1' };
}

// Saves a picture and timestamped metadata together before publishing their folder.
export async function createProduct(request: Request) {
  const submittedAt = new Date().toISOString();
  try {
    const form = await readProductForm(request);
    if (form instanceof Response) return form;
    const managed = form.managed ? await resolvePictureSelection(form.managed) : undefined;
    if (managed instanceof Response) return managed;
    const main = managed?.replacement ?? form.picture;
    if (!main) return Response.json({ error: 'Select a product picture.' }, { status: 400 });
    const { name, details } = form;
    const { bytes, type } = main;
    const uploads = managed?.uploads ?? form.gallery;
    const id = randomUUID();
    const initialStock = details.initialStock ?? details.stock ?? 0;
    const product: ProductRecord = {
      ...defaultDetails, ...details, id, name, submittedAt, pictureType: type,
      initialStock, stock: initialStock,
      gallery: managed?.gallery ?? uploads.map(({ id, type: imageType }) => ({ id, type: imageType })),
      mainPicturePosition: managed?.mainPicturePosition ?? 0,
      mainPictureDetails: managed?.mainPictureDetails,
    };
    await mkdir(productDirectory, { recursive: true });
    const temporary = await mkdtemp(path.join(productDirectory, '.upload-'));
    try {
      await writeFile(path.join(temporary, pictureFilename(type)), bytes);
      for (const picture of uploads) await writeFile(path.join(temporary, galleryFilename(picture)), picture.bytes);
      await writeFile(path.join(temporary, 'product.json'), JSON.stringify(product, null, 2) + '\n');
      await rename(temporary, path.join(productDirectory, id));
    } catch (error) {
      await rm(temporary, { recursive: true, force: true });
      throw error;
    }
    return Response.json(product, { status: 201 });
  } catch (error) {
    return storageError(error);
  }
}

// Applies the older picture fields for clients that do not send an ordered selection.
async function resolveLegacyPictureChanges(
  current: ProductRecord,
  form: Extract<Awaited<ReturnType<typeof readProductForm>>, { managed: undefined }>,
): Promise<ProductPictureChanges | Response> {
  const directory = path.join(productDirectory, current.id);
  const removed = current.gallery.filter(picture => form.removedPictures.includes(picture.id));
  const retained = current.gallery.filter(picture => !form.removedPictures.includes(picture.id));
  const uploads = [...form.gallery];
  let replacement = form.picture;
  let mainPictureDetails = replacement ? undefined : current.mainPictureDetails;
  if (form.removeMainPicture && !replacement) {
    const promoted = retained.shift();
    if (promoted) {
      replacement = { type: promoted.type, bytes: await readFile(path.join(directory, galleryFilename(promoted))) };
      mainPictureDetails = { title: promoted.title, note: promoted.note };
      removed.push(promoted);
    } else {
      replacement = uploads.shift();
      mainPictureDetails = undefined;
    }
    if (!replacement) {
      return Response.json({ error: 'Add a replacement picture or keep at least one gallery picture.' }, { status: 400 });
    }
  }
  if (retained.length + uploads.length > maxGalleryPictures) {
    return Response.json({ error: 'A product can have up to nine additional gallery pictures.' }, { status: 400 });
  }
  const gallery = [...retained, ...uploads.map(({ id, type }) => ({ id, type }))];
  const mainPicturePosition = Math.min(current.mainPicturePosition ?? 0, gallery.length);
  return { gallery, uploads, removed, replacement, mainPicturePosition, mainPictureDetails };
}

// Preserves the product ID and original submission date when editing.
export async function updateProduct(id: string, request: Request) {
  if (!productId.test(id)) return Response.json({ error: 'Product not found.' }, { status: 404 });
  try {
    const form = await readProductForm(request);
    if (form instanceof Response) return form;

    return await queueInventoryChange(async () => {
      const current = await readProduct(id);
      const sold = inventoryUnitsSold(await readFinancialEntries()).get(id) ?? BigInt(0);
      const previousInitial = current.initialStock ?? current.stock;
      const currentStock = stockOnHand(current, sold);
      if (form.details.stock !== undefined && form.expectedStock !== undefined &&
          currentStock !== BigInt(form.expectedStock)) {
        return Response.json({ error: 'Stock changed while this product was open.' }, { status: 412 });
      }
      if (form.details.initialStock !== undefined && form.expectedInitialStock !== undefined &&
          form.expectedInitialStock !== previousInitial) {
        return Response.json({ error: 'Initial stock changed while this product was open.' }, { status: 412 });
      }
      const initialStock = form.details.initialStock ?? previousInitial;
      const stockChanged = form.details.stock !== undefined || initialStock !== previousInitial;
      // Changing the initial count adjusts only the starting quantity. Recorded sales remain applied.
      const nextStock = form.details.stock !== undefined ? BigInt(form.details.stock)
        : currentStock + BigInt(initialStock) - BigInt(previousInitial);
      if (nextStock < BigInt(0) || nextStock > BigInt(Number.MAX_SAFE_INTEGER)) {
        return Response.json({ error: 'The initial stock change would put current stock out of range.' }, { status: 422 });
      }
      const directory = path.join(productDirectory, id);
      const pictures = form.managed
        ? await resolvePictureSelection(form.managed, current)
        : await resolveLegacyPictureChanges(current, form);
      if (pictures instanceof Response) return pictures;
      const { replacement, uploads, removed, gallery, mainPicturePosition, mainPictureDetails } = pictures;
      const next = {
        ...current, ...form.details, name: form.name, gallery, mainPicturePosition, mainPictureDetails,
        initialStock,
        stock: stockChanged ? Number(nextStock) : current.stock,
        stockCountAt: stockChanged ? String(sold) : current.stockCountAt,
        pictureMetadataVersion: form.managed ? randomUUID() : current.pictureMetadataVersion,
      };
      const version = randomUUID();
      const temporaryMetadata = path.join(directory, `.metadata-${version}.tmp`);
      let newPicture: string | undefined;
      const newGalleryFiles: string[] = [];
      try {
        if (replacement) {
          next.pictureType = replacement.type;
          next.pictureVersion = version;
          newPicture = path.join(directory, pictureFilename(next.pictureType, version));
          await writeFile(newPicture, replacement.bytes, { flag: 'wx' });
        }
        for (const picture of uploads) {
          const filename = path.join(directory, galleryFilename(picture));
          newGalleryFiles.push(filename);
          await writeFile(filename, picture.bytes, { flag: 'wx' });
        }
        await writeFile(temporaryMetadata, JSON.stringify(next, null, 2) + '\n', { flag: 'wx' });
        // Publish the metadata only after its replacement image is complete.
        await rename(temporaryMetadata, path.join(directory, 'product.json'));
      } catch (error) {
        await rm(temporaryMetadata, { force: true });
        if (newPicture) await rm(newPicture, { force: true });
        for (const filename of newGalleryFiles) await rm(filename, { force: true });
        throw error;
      }

      if (newPicture) {
        const oldPicture = path.join(directory, pictureFilename(current.pictureType, current.pictureVersion));
        await rm(oldPicture, { force: true }).catch(error => console.error('Could not remove previous picture:', error));
      }
      for (const picture of removed) {
        await rm(path.join(directory, galleryFilename(picture)), { force: true })
          .catch(error => console.error('Could not remove discarded gallery picture:', error));
      }
      return Response.json(withAvailableStock(next, sold));
    });
  } catch (error) {
    if (isMissing(error)) return Response.json({ error: 'Product not found.' }, { status: 404 });
    return storageError(error);
  }
}

// Unpublishes the whole product folder before removing its metadata and picture.
export async function deleteProduct(id: string) {
  if (!productId.test(id)) return Response.json({ error: 'Product not found.' }, { status: 404 });
  try {
    return await queueInventoryChange(async () => {
      const removed = path.join(productDirectory, `.removed-${randomUUID()}`);
      await rename(path.join(productDirectory, id), removed);
      await rm(removed, { recursive: true, force: true })
        .catch(error => console.error('Could not clean up removed product:', error));
      return new Response(null, { status: 204 });
    });
  } catch (error) {
    if (isMissing(error)) return Response.json({ error: 'Product not found.' }, { status: 404 });
    return storageError(error);
  }
}

// Resolves the image referenced by the current metadata.
async function readProductPicture(id: string) {
  const product = await readProduct(id);
  const filename = pictureFilename(product.pictureType, product.pictureVersion);
  const picture = await readFile(path.join(productDirectory, id, filename));
  return { product, picture };
}

// Serves the stored image by UUID without using any path supplied in the upload.
export async function getProductPicture(id: string, download = false) {
  if (!productId.test(id)) return new Response(null, { status: 404 });
  try {
    const { product, picture } = await readProductPicture(id).catch(error => {
      if (isMissing(error)) return readProductPicture(id);
      throw error;
    });
    const headers = new Headers({
      'Content-Type': product.pictureType,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
    });
    if (download) {
      const filename = `product-${id}.${pictureExtensions.get(product.pictureType)}`;
      headers.set('Content-Disposition', `attachment; filename="${filename}"`);
    }
    return new Response(new Uint8Array(picture), { headers });
  } catch (error) {
    if (isMissing(error)) return new Response(null, { status: 404 });
    return storageError(error);
  }
}


// Reads a gallery image only when the product metadata references it.
export async function getGalleryPicture(id: string, pictureId: string) {
  if (!productId.test(id) || !productId.test(pictureId)) return new Response(null, { status: 404 });
  try {
    const product = await readProduct(id);
    const picture = product.gallery.find(item => item.id === pictureId);
    if (!picture) return new Response(null, { status: 404 });
    const bytes = await readFile(path.join(productDirectory, id, galleryFilename(picture)));
    return new Response(new Uint8Array(bytes), {
      headers: { 'Content-Type': picture.type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    if (isMissing(error)) return new Response(null, { status: 404 });
    return storageError(error);
  }
}

const downloadClock = new Intl.DateTimeFormat('en-AU', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  hourCycle: 'h23', timeZone: 'Australia/Melbourne',
});

// Builds a cross-platform ZIP filename and preserves Unicode for modern browsers.
function archiveDisposition(name: string, now: Date) {
  const parts = Object.fromEntries(downloadClock.formatToParts(now).map(part => [part.type, part.value]));
  const timestamp = [parts.day, parts.month, parts.year, parts.hour, parts.minute].join('');
  const cleanName = name.replace(/[<>:"/\\|?*\u0000-\u001f\u007f\uD800-\uDFFF]/gu, '-')
    .trim().replace(/^[. ]+|[. ]+$/g, '');
  const filename = `${Array.from(cleanName).slice(0, 120).join('') || 'Product'}-${timestamp}.zip`;
  const fallback = filename.replace(/[^ -~]/g, '_');
  const encoded = encodeURIComponent(filename).replace(/['()*]/g, character =>
    '%' + character.charCodeAt(0).toString(16).toUpperCase());
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

// Supplies an exact ZIP size for confirmation or returns the downloadable archive.
export async function getProductArchive(id: string, mode: 'download' | 'metadata' | 'head') {
  if (!productId.test(id)) return new Response(null, { status: 404 });
  try {
    const [record, financialEntries] = await Promise.all([readProduct(id), readFinancialEntries()]);
    const product = withAvailableStock(record, inventoryUnitsSold(financialEntries).get(id) ?? BigInt(0));
    const directory = path.join(productDirectory, id);
    const pictures = product.gallery.map((picture, index) => ({
      name: `gallery-${index + 1}.${pictureExtensions.get(picture.type)}`,
      file: galleryFilename(picture),
      main: false,
      title: picture.title,
      note: picture.note,
    }));
    pictures.splice(product.mainPicturePosition ?? 0, 0, {
      name: `main.${pictureExtensions.get(product.pictureType)}`,
      file: pictureFilename(product.pictureType, product.pictureVersion),
      main: true,
      title: product.mainPictureDetails?.title,
      note: product.mainPictureDetails?.note,
    });
    const document = { name: 'Product details.pdf', bytes: await buildProductDocument(product, pictures) };
    const headers = new Headers({
      'Content-Type': 'application/zip',
      'Content-Disposition': archiveDisposition(product.name, new Date()),
      'Cache-Control': 'no-store',
    });
    if (mode !== 'download') {
      const entries = await Promise.all(pictures.map(async ({ name, file }) => ({
        name, size: (await stat(path.join(directory, file))).size,
      })));
      const byteCount = zipSize([...entries, { name: document.name, size: document.bytes.length }]);
      // Next.js can omit Content-Length on HTTP responses, so provide a JSON size for the UI.
      if (mode === 'metadata') {
        return Response.json({ byteCount }, { headers: { 'Cache-Control': 'no-store' } });
      }
      headers.set('Content-Length', String(byteCount));
      return new Response(null, { headers });
    }
    const entries = await Promise.all(pictures.map(async ({ name, file }) => ({
      name, bytes: await readFile(path.join(directory, file)),
    })));
    const archive = zipEntries([...entries, document]);
    headers.set('Content-Length', String(archive.length));
    return new Response(new Uint8Array(archive), { headers });
  } catch (error) {
    if (isMissing(error)) return new Response(null, { status: 404 });
    return storageError(error);
  }
}
