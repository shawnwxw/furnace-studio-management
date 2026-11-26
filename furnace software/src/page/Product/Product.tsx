import { formatAustralianDollars } from '../../formatAustralianDollars';
import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, FormEvent } from 'react';
import LoadingSpinner from '../../common/LoadingSpinner/LoadingSpinner';
import TrashIcon from '../../common/TrashIcon/TrashIcon';
import { usePopups } from '../../common/Popup/PopupProvider';
import { ApiError, dataService } from '../../dataService';
import type {
  HomeProductSelection, ProductDropTarget, ProductEditorPicture, ProductList, ProductPictureEditorDraft,
  ProductRecord, ProductUnitValuesDraft,
} from '../../interface/product';
import ProductDetailsDialog from './ProductDetailsDialog/ProductDetailsDialog';
import ProductDownloadButton, { useProductDownload } from './ProductDownloadButton/ProductDownloadButton';
import ProductPictureTile from './ProductPictureTile/ProductPictureTile';
import { productEndpoint, productPictureUrl, productValueFields, selectHomeProducts } from './productData';
import ProductValueSummary from './ProductValueSummary/ProductValueSummary';
import '../Plan/Plan.css';
import './Product.css';

// Uses the pointer's position within a card to place the dragged product above or below it.
function cardDropPosition(event: DragEvent<HTMLLIElement>): ProductDropTarget['position'] {
  const { top, height } = event.currentTarget.getBoundingClientRect();
  return event.clientY < top + height / 2 ? 'before' : 'after';
}

// Builds the editor's picture list with the main picture first.
function getEditorPictures(product: ProductRecord | null): ProductEditorPicture[] {
  if (!product) return [];
  return [
    { id: 'main', label: 'Saved main picture', url: productPictureUrl(product), ...product.mainPictureDetails },
    ...(product.gallery ?? []).map((picture, index) => ({
      id: picture.id, label: `Picture ${index + 1}`, url: productPictureUrl(product, picture.id),
      title: picture.title, note: picture.note,
    })),
  ];
}

// Displays saved products and reuses one form for adding and editing them.
export default function Product() {
  const { confirm, showMessage } = usePopups();
  const [products, setProducts] = useState<ProductRecord[] | null>(null);
  const [homeProductIds, setHomeProductIds] = useState<string[] | null>(null);
  const [savingHome, setSavingHome] = useState(false);
  const [homeError, setHomeError] = useState('');
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [orderError, setOrderError] = useState('');
  const [cardDropTarget, setCardDropTarget] = useState<ProductDropTarget | null>(null);
  const [formError, setFormError] = useState('');
  const [editingProduct, setEditingProduct] = useState<ProductRecord | null>(null);
  const [viewProduct, setViewProduct] = useState<ProductRecord | null>(null);
  const [pictureDraft, setPictureDraft] = useState<ProductPictureEditorDraft | null>(null);
  const { downloading, downloadPictures } = useProductDownload();
  const [name, setName] = useState('');
  const [initialStock, setInitialStock] = useState('0');
  const unitValuesDialog = useRef<HTMLDialogElement>(null);
  const [unitValueDraft, setUnitValueDraft] = useState<ProductUnitValuesDraft | null>(null);
  const [productValues, setProductValues] = useState<Record<string, string>>({});
  const [includeInRevenue, setIncludeInRevenue] = useState(true);
  const [description, setDescription] = useState('');
  const [note, setNote] = useState('');
  const [pictures, setPictures] = useState<ProductEditorPicture[]>([]);
  const mainPicture = pictures[0]?.id ?? null;
  const [draggedPicture, setDraggedPicture] = useState<string | null>(null);
  const pictureInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pictureEditorRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const draggedProduct = useRef<string | null>(null);
  const savingOrder = useRef(false);
  const busy = saving || removing || reordering || savingHome;
  const savedPictures = getEditorPictures(editingProduct);
  const savedInitialStock = editingProduct?.initialStock ?? editingProduct?.stock ?? 0;
  const initialStockCount = Number(initialStock);
  const currentStockPreview = (editingProduct?.stock ?? 0) + (initialStockCount - savedInitialStock);
  // Compare normalized values so number formatting and surrounding whitespace do not count as edits.
  const hasProductChanges = editingProduct !== null && (
    name.trim() !== editingProduct.name.trim() ||
    description.trim() !== (editingProduct.description ?? '').trim() ||
    note.trim() !== (editingProduct.note ?? '').trim() ||
    !initialStock.trim() || initialStockCount !== savedInitialStock ||
    includeInRevenue !== (editingProduct.includeInRevenue !== false) ||
    productValueFields.some(({ name: field, key }) => {
      const value = productValues[field]?.trim();
      const cents = editingProduct[key];
      return value ? cents == null || Number(value) !== cents / 100 : cents != null;
    }) ||
    pictures.length !== savedPictures.length ||
    savedPictures.some((saved, index) => {
      const picture = pictures[index];
      return picture.id !== saved.id || Boolean(picture.file) ||
        (picture.title ?? '').trim() !== (saved.title ?? '').trim() ||
        (picture.note ?? '').trim() !== (saved.note ?? '').trim();
    })
  );
  const canSaveProduct = !busy && Boolean(name.trim()) && (editingProduct === null || hasProductChanges);
  const canApplyUnitValues = unitValueDraft !== null && productValueFields.some(({ name: field }) => {
    const original = productValues[field]?.trim() ?? '';
    const updated = unitValueDraft.values[field]?.trim() ?? '';
    return !original || !updated ? original !== updated : Number(original) !== Number(updated);
  });
  const editedPicture = pictures.find(picture => picture.id === pictureDraft?.id);
  const canApplyPictureDetails = pictureDraft !== null && editedPicture !== undefined && (
    pictureDraft.title.trim() !== (editedPicture.title ?? '').trim() ||
    pictureDraft.note.trim() !== (editedPicture.note ?? '').trim()
  );
  const displayedOnHome = new Set(selectHomeProducts(products ?? [], homeProductIds).map(product => product.id));

  useEffect(() => {
    const controller = new AbortController();
    dataService.get<ProductList>(productEndpoint, { signal: controller.signal })
      .then(result => {
        if (!controller.signal.aborted) {
          setProducts(result.products);
          setHomeProductIds(result.homeProductIds);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadFailed(true);
      });
    return () => controller.abort();
  }, [attempt]);

  // Persists the new card order and reloads it when another session changed the list.
  async function moveProduct(id: string, targetId: string, position: ProductDropTarget['position']) {
    if (!products || busy || savingOrder.current || id === targetId) return;
    const previousIds = products.map(product => product.id);
    const ids = previousIds.filter(productId => productId !== id);
    const target = ids.indexOf(targetId);
    if (target < 0 || !previousIds.includes(id)) return;
    ids.splice(target + (position === 'after' ? 1 : 0), 0, id);
    if (ids.every((productId, index) => productId === previousIds[index])) return;

    savingOrder.current = true;
    setReordering(true);
    setOrderError('');
    try {
      const result = await dataService.put<ProductList>(productEndpoint, { ids, previousIds });
      setProducts(result.products);
      setHomeProductIds(result.homeProductIds);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        try {
          const latest = await dataService.get<ProductList>(productEndpoint);
          setProducts(latest.products);
          setHomeProductIds(latest.homeProductIds);
          setOrderError('The product list changed. Review the latest order and try again.');
        } catch {
          setOrderError('Could not refresh the product list. Reload the page and try again.');
        }
      } else {
        setOrderError('Could not save the product order. Try again.');
      }
    } finally {
      savingOrder.current = false;
      setReordering(false);
    }
  }

  // Toggles a product on Home while retaining the other saved selection.
  async function toggleHomeProduct(id: string) {
    if (busy) return;
    setHomeError('');
    setSavingHome(true);
    try {
      const selection = await dataService.put<HomeProductSelection>(`${productEndpoint}/home`, {
        id, featured: !displayedOnHome.has(id),
      });
      setHomeProductIds(selection.homeProductIds);
    } catch {
      setHomeError('Could not update the Home products. Try again.');
    } finally {
      setSavingHome(false);
    }
  }

  // Opens the editor with the selected product's details and a fresh file input.
  function openProductForm(product: ProductRecord | null) {
    formRef.current?.reset();
    setEditingProduct(product);
    setName(product?.name ?? '');
    setInitialStock(String(product?.initialStock ?? product?.stock ?? 0));
    setProductValues(Object.fromEntries(productValueFields.map(({ name, key }) => {
      const cents = product?.[key];
      return [name, cents == null ? '' : (cents / 100).toFixed(2)];
    })));
    setIncludeInRevenue(product?.includeInRevenue !== false);
    setDescription(product?.description ?? '');
    setNote(product?.note ?? '');
    setPictures(getEditorPictures(product));
    setDraggedPicture(null);
    setFormError('');
    dialogRef.current?.showModal();
  }

  // Adds selected files to the same list as saved pictures.
  function selectPictures(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = '';
    if (!files.length || busy) return;
    if (files.some(file => file.size === 0 || file.size > 10 * 1024 * 1024)) {
      setFormError('Choose picture files between 1 byte and 10 MB.');
      return;
    }
    if (pictures.length + files.length > 10) {
      setFormError('A product can have up to ten pictures.');
      return;
    }
    const selected = files.map(file => ({ id: crypto.randomUUID(), label: file.name, file }));
    setPictures(current => [...current, ...selected]);
    setFormError('');
  }

  // Puts the chosen main picture first and preserves the order of the others.
  function chooseMainPicture(id: string) {
    setPictures(current => {
      const selected = current.find(picture => picture.id === id);
      if (!selected || current[0]?.id === id) return current;
      return [selected, ...current.filter(picture => picture.id !== id)];
    });
  }

  // Removing the first picture makes the next picture the main one.
  function removePicture(id: string) {
    setPictures(current => current.filter(picture => picture.id !== id));
    setFormError('');
  }

  // Reorders the gallery while keeping the main picture in the first slot.
  function movePicture(id: string, targetId: string) {
    if (busy || id === targetId) return;
    setPictures(current => {
      const from = current.findIndex(picture => picture.id === id);
      const to = current.findIndex(picture => picture.id === targetId);
      if (from <= 0 || to <= 0) return current;
      const updated = [...current];
      const [picture] = updated.splice(from, 1);
      updated.splice(to, 0, picture);
      return updated;
    });
  }

  // Keeps the form populated if the save fails so the user can retry.
  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSaveProduct) return;
    if (!initialStock.trim() || !Number.isSafeInteger(initialStockCount) || initialStockCount < 0) {
      setFormError('Enter a whole initial stock count of zero or more.');
      return;
    }
    if (!Number.isSafeInteger(currentStockPreview) || currentStockPreview < 0) {
      setFormError('The initial stock change would put current stock out of range.');
      return;
    }
    const form = event.currentTarget;
    const payload = new FormData(form);
    if (editingProduct) {
      if (initialStockCount === savedInitialStock) payload.delete('initialStock');
      else payload.set('expectedInitialStock', String(savedInitialStock));
    }
    for (const { name: field } of productValueFields) {
      payload.set(field, productValues[field] ?? '');
    }
    payload.set('includeInRevenue', String(includeInRevenue));
    if (mainPicture === null) {
      setFormError('Add at least one product picture.');
      return;
    }
    // Send the original picture revision so concurrent gallery edits cannot overwrite each other.
    payload.set('managedPictures', JSON.stringify({
      mainId: mainPicture,
      pictures: pictures.map(picture => ({
        id: picture.id, upload: Boolean(picture.file), title: picture.title ?? '', note: picture.note ?? '',
      })),
      expected: editingProduct ? JSON.stringify([
        editingProduct.pictureVersion ?? null, editingProduct.mainPicturePosition ?? 0,
        (editingProduct.gallery ?? []).map(picture => picture.id),
        ...(editingProduct.pictureMetadataVersion ? [editingProduct.pictureMetadataVersion] : []),
      ]) : undefined,
    }));
    for (const picture of pictures) {
      if (picture.file) payload.set(`picture:${picture.id}`, picture.file);
    }
    setSaving(true);
    setFormError('');
    try {
      const product = editingProduct
        ? await dataService.patchForm<ProductRecord>(`${productEndpoint}/${editingProduct.id}`, payload)
        : await dataService.postForm<ProductRecord>(productEndpoint, payload);
      setProducts(current => editingProduct
        ? (current ?? []).map(item => item.id === product.id ? product : item)
        : [product, ...(current ?? [])]);
      form.reset();
      dialogRef.current?.close();
    } catch (error) {
      if (error instanceof ApiError && error.status === 413) {
        setFormError('Choose a picture that is 10 MB or smaller.');
      } else if (error instanceof ApiError && error.status === 415) {
        setFormError('Choose a JPEG, PNG, WebP, or GIF picture.');
      } else if (error instanceof ApiError && error.status === 400) {
        setFormError('Check the product fields and try again.');
      } else if (error instanceof ApiError && error.status === 409) {
        setFormError('The saved pictures changed. Reload the product list before trying again.');
      } else if (error instanceof ApiError && error.status === 412) {
        try {
          const latest = await dataService.get<ProductList>(productEndpoint);
          setProducts(latest.products);
          setHomeProductIds(latest.homeProductIds);
          setFormError('Stock changed while this product was open. Reopen the product to check the current count.');
        } catch {
          setFormError('Stock changed while this product was open. Reload the product list before trying again.');
        }
      } else if (error instanceof ApiError && error.status === 404) {
        setFormError('This product could not be found. Reload the page and try again.');
      } else {
        setFormError('Could not save the product. Try again.');
      }
    } finally {
      setSaving(false);
    }
  }

  // Confirms removal before asking the API to delete the saved product folder.
  async function removeProduct({ id, name }: ProductRecord) {
    if (busy) return;
    const confirmed = await confirm({
      title: 'Remove product',
      message: `Permanently remove “${name}” and all its pictures?`,
      confirmLabel: 'Remove product',
      destructive: true,
    });
    if (!confirmed) return;
    setRemoving(true);
    setFormError('');
    try {
      await dataService.delete(`${productEndpoint}/${id}`);
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 404)) {
        showMessage({ title: 'Product removal failed', message: 'Could not remove the product. Try again.' });
        return;
      }
    } finally {
      setRemoving(false);
    }
    setProducts(current => current?.filter(product => product.id !== id) ?? null);
    setHomeProductIds(current => current?.filter(productId => productId !== id) ?? null);
    dialogRef.current?.close();
  }

  // Edits a copy of the product values so Cancel leaves the product draft intact.
  function openUnitValues() {
    setUnitValueDraft({ values: productValues });
    unitValuesDialog.current?.showModal();
  }

  // Applies the values to the product form for its next save.
  function applyUnitValues(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!unitValueDraft || !canApplyUnitValues) return;
    setProductValues(unitValueDraft.values);
    unitValuesDialog.current?.close();
  }

  // Opens the selected picture's fields without closing the product editor.
  function openPictureEditor(picture: ProductEditorPicture, url: string) {
    setPictureDraft({ id: picture.id, label: picture.label, url, title: picture.title ?? '', note: picture.note ?? '' });
    pictureEditorRef.current?.showModal();
  }

  // Applies the picture details to the product draft so one product save persists everything.
  function applyPictureDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pictureDraft || !canApplyPictureDetails) return;
    const { id, title, note } = pictureDraft;
    setPictures(current => current.map(picture => picture.id === id ? { ...picture, title, note } : picture));
    pictureEditorRef.current?.close();
  }

  return (
    <section className="product-page plan-page page-frame">
      <header className="page-header">
        <h1>Products</h1>
        <button type="button" className="page-add" aria-label="Add product" title="Add product" aria-haspopup="dialog"
          disabled={busy || !products} onClick={() => openProductForm(null)}>+</button>
      </header>
      <div className="product-panel page-panel panel-frame">
        {loadFailed && <p role="alert">Could not load products. <button type="button" onClick={() => {
          setLoadFailed(false);
          setAttempt(current => current + 1);
        }}>Try again</button></p>}
        {!products && !loadFailed && <LoadingSpinner label="Loading products…" />}
        {orderError && <p role="alert">{orderError}</p>}
        {homeError && <p role="alert">{homeError}</p>}
        {products && (products.length === 0 ? <p>No products yet.</p> : (
          <ul className="product-list" aria-label="Products" aria-busy={reordering} tabIndex={0}>
            {products.map((product, index) => (
              <li className="product-item" key={product.id} tabIndex={products.length > 1 ? 0 : undefined}
                aria-description="Drag to reorder or use the up and down arrow keys"
                draggable={!busy && products.length > 1}
                data-drop-position={cardDropTarget?.id === product.id ? cardDropTarget.position : undefined}
                onDragStart={event => {
                  draggedProduct.current = product.id;
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', product.id);
                }}
                onDragOver={event => {
                  const id = draggedProduct.current;
                  if (busy || !id || id === product.id) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                  const position = cardDropPosition(event);
                  setCardDropTarget(current => current?.id === product.id && current.position === position
                    ? current : { id: product.id, position });
                }}
                onDragLeave={event => {
                  if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
                  setCardDropTarget(current => current?.id === product.id ? null : current);
                }}
                onDrop={event => {
                  const id = draggedProduct.current;
                  if (!id) return;
                  event.preventDefault();
                  draggedProduct.current = null;
                  setCardDropTarget(null);
                  void moveProduct(id, product.id, cardDropPosition(event));
                }}
                onDragEnd={() => {
                  draggedProduct.current = null;
                  setCardDropTarget(null);
                }}
                onKeyDown={event => {
                  if (event.target !== event.currentTarget || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
                  const up = event.key === 'ArrowUp';
                  const neighbor = products[index + (up ? -1 : 1)];
                  if (!neighbor) return;
                  event.preventDefault();
                  void moveProduct(product.id, neighbor.id, up ? 'before' : 'after');
                }}>
                <div className="product-picture">
                  <img src={productPictureUrl(product)} alt={product.name} loading="lazy" draggable={false} />
                </div>
                <div className="product-details">
                  <div className="product-title-row">
                    <h2>{product.name}</h2>
                    <div className="product-title-actions">
                      <button type="button" className="product-icon product-home-toggle"
                        aria-label={`Show ${product.name} on Home`} aria-pressed={displayedOnHome.has(product.id)}
                        title={displayedOnHome.has(product.id) ? 'Remove from Home' : 'Show on Home'}
                        disabled={busy} onClick={() => void toggleHomeProduct(product.id)}>
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="m3 10 9-7 9 7M5 9v11h5v-6h4v6h5V9" />
                        </svg>
                      </button>
                      <button type="button" className="product-icon" aria-haspopup="dialog"
                        aria-label={`View details and gallery for ${product.name}`} title="View details"
                        onClick={() => setViewProduct(product)}>
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6Z" />
                          <circle cx="12" cy="12" r="2.5" />
                        </svg>
                      </button>
                      <button type="button" className="product-icon" aria-haspopup="dialog"
                        aria-label={`Edit ${product.name}`} title="Edit product"
                        disabled={busy} onClick={() => openProductForm(product)}>
                        <span aria-hidden="true">✎</span>
                      </button>
                      <ProductDownloadButton product={product} disabled={downloading || busy} onDownload={downloadPictures} />
                      <button type="button" className="product-icon product-trash"
                        aria-label={`Remove ${product.name}`} title="Remove product"
                        disabled={busy} onClick={() => void removeProduct(product)}>
                        <TrashIcon />
                      </button>
                    </div>
                  </div>
                  <div className="product-meta">
                    <span className="product-stock">Initial stock <strong>{(product.initialStock ?? product.stock).toLocaleString()}</strong></span>
                    <span className="product-stock">Current stock <strong>{product.stock.toLocaleString()}</strong></span>
                    {product.saleValueCents != null && <span className="product-stock">
                      Sale value <strong>{formatAustralianDollars(product.saleValueCents)}</strong>
                    </span>}
                    <time dateTime={product.submittedAt}>
                      Added {new Date(product.submittedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                    </time>
                  </div>
                  <dl className="product-attributes">
                    <dt>Description</dt>
                    <dd>{product.description || 'No description'}</dd>
                  </dl>
                </div>
              </li>
            ))}
          </ul>
        ))}
      </div>
      <dialog className="plan-dialog product-editor" ref={dialogRef} aria-labelledby="product-form-title"
        onClose={() => {
          setPictures([]);
          setDraggedPicture(null);
        }}
        onCancel={event => event.preventDefault()}>
        <form className="plan-form product-editor-form" ref={formRef} onSubmit={saveProduct}>
          <header className="product-editor-header">
            <div className="product-editor-heading">
              <h2 id="product-form-title">
                {editingProduct ? <>Edit <span className="product-editor-name">{editingProduct.name}</span></> : 'Add product'}
              </h2>
              <div className="product-revenue-setting">
                <input id="product-revenue-option" type="checkbox" checked={includeInRevenue} disabled={busy}
                  aria-describedby="product-revenue-help" onChange={event => setIncludeInRevenue(event.target.checked)} />
                <button type="button" className="product-revenue-info" aria-label="How this product affects the Financial Report"
                  aria-describedby="product-revenue-help" onClick={event => event.currentTarget.focus()}>
                  <span aria-hidden="true">ⓘ</span>
                </button>
                <label htmlFor="product-revenue-option">Link to Financial Report</label>
                <span id="product-revenue-help" className="product-revenue-tip" role="tooltip">
                  Select this checkbox to include linked sales in revenue and make the product available for the current project.
                  If you set a unit sale value, the report multiplies it by the current stock to calculate the product’s stock value.
                  Clear the checkbox to exclude these values from the totals. Recorded transactions stay visible.
                </span>
              </div>
            </div>
            {formError && <p role="alert">{formError}</p>}
          </header>
          <div className="product-editor-body">
            <div className="product-editor-fields">
              <label htmlFor="product-name">Name</label>
              <input id="product-name" name="name" maxLength={200} value={name}
                onChange={event => setName(event.target.value)} required autoFocus readOnly={busy} />
              <div className="product-editor-stock">
                <label>Initial stock
                  <input name="initialStock" type="number" min={0} step={1} value={initialStock}
                    onChange={event => setInitialStock(event.target.value)} required readOnly={busy} />
                </label>
                <label>Current stock
                  <input type="text" readOnly value={initialStock.trim() && Number.isSafeInteger(currentStockPreview) &&
                    currentStockPreview >= 0 ? currentStockPreview.toLocaleString() : '—'} />
                </label>
              </div>
              <label htmlFor="product-description">Description</label>
              <textarea id="product-description" name="description" value={description} rows={2} maxLength={4000}
                onChange={event => setDescription(event.target.value)} readOnly={busy} />
              <label htmlFor="product-note">Note</label>
              <textarea id="product-note" name="note" value={note} rows={2} maxLength={2000}
                onChange={event => setNote(event.target.value)} readOnly={busy} />
              <ProductValueSummary values={Object.fromEntries(productValueFields.map(({ key, name: field }) => {
                const value = productValues[field]?.trim();
                return [key, value ? Math.round(Number(value) * 100) : null];
              }))} action={
                <button type="button" className="product-icon" aria-label="Edit per-unit values"
                  title="Edit per-unit values" aria-haspopup="dialog" disabled={busy} onClick={openUnitValues}>
                  <span aria-hidden="true">✎</span>
                </button>
              } />
            </div>
            <div className="product-editor-fields">
              <fieldset className="product-gallery-edit">
                <legend>Product pictures</legend>
                <div className="product-picture-manager-header">
                  <small>Add up to ten pictures, each no larger than 10 MB. The main picture stays first. Drag the other pictures to reorder them.</small>
                  <button type="button" className="plan-primary product-add-picture" aria-label="Add pictures"
                    title="Add pictures" disabled={busy || pictures.length >= 10}
                    onClick={() => pictureInputRef.current?.click()}>+</button>
                  <input ref={pictureInputRef} type="file" multiple hidden accept="image/jpeg,image/png,image/webp,image/gif"
                    disabled={busy} onChange={selectPictures} />
                </div>
                {pictures.length > 0 && <ul tabIndex={0} aria-label="Product pictures">
                  {pictures.map((picture, index) => (
                    <ProductPictureTile key={picture.id} picture={picture} main={mainPicture === picture.id} busy={busy}
                      dragged={draggedPicture === picture.id} onEdit={url => openPictureEditor(picture, url)}
                      onSetMain={() => chooseMainPicture(picture.id)} onRemove={() => removePicture(picture.id)}
                      onDrag={() => setDraggedPicture(picture.id)} onDragEnd={() => setDraggedPicture(null)}
                      onDrop={() => {
                        if (draggedPicture) movePicture(draggedPicture, picture.id);
                        setDraggedPicture(null);
                      }}
                      onMove={step => {
                        const neighbor = pictures[index + step];
                        if (neighbor) movePicture(picture.id, neighbor.id);
                      }} />
                  ))}
                </ul>}
              </fieldset>
            </div>
          </div>
          <footer className="plan-actions product-editor-footer">
            <button type="submit" className="plan-primary" disabled={!canSaveProduct}>
              {saving ? 'Saving…' : editingProduct ? 'Save changes' : 'Add product'}
            </button>
            <button type="button" disabled={busy} onClick={() => dialogRef.current?.close()}>Cancel</button>
            {editingProduct && <button type="button" className="product-editor-remove" disabled={busy}
              aria-label={removing ? 'Removing product' : `Remove ${editingProduct.name}`} title="Remove product"
              onClick={() => void removeProduct(editingProduct)}>
              <TrashIcon />
            </button>}
          </footer>
        </form>
      </dialog>
      <dialog className="plan-dialog" ref={unitValuesDialog} aria-labelledby="product-unit-values-title"
        onCancel={event => event.preventDefault()} onClose={() => setUnitValueDraft(null)}>
        <form className="plan-form" onSubmit={applyUnitValues}>
          <h2 id="product-unit-values-title">Per-unit values (A$)</h2>
          <div className="product-unit-values">
            {productValueFields.map(({ name, label }, index) => (
              <div className="product-unit-field" key={name}>
                <label htmlFor={`product-unit-${name}`}>{label}</label>
                <div className="product-unit-amount">
                  <span aria-hidden="true">A$</span>
                  <input id={`product-unit-${name}`} type="text" inputMode="decimal" autoFocus={index === 0}
                    pattern="\d{1,9}(\.\d{1,2})?"
                    title="Enter a non-negative amount with up to two decimal places"
                    value={unitValueDraft?.values[name] ?? ''} onChange={event => {
                      const value = event.target.value;
                      setUnitValueDraft(current => current && {
                        ...current, values: { ...current.values, [name]: value },
                      });
                    }} />
                </div>
              </div>
            ))}
          </div>
          <div className="plan-actions">
            <button type="submit" className="plan-primary" disabled={!canApplyUnitValues}>Apply values</button>
            <button type="button" onClick={() => unitValuesDialog.current?.close()}>Cancel</button>
          </div>
        </form>
      </dialog>
      <dialog className="plan-dialog" ref={pictureEditorRef} aria-labelledby="product-picture-editor-title"
        onCancel={event => event.preventDefault()}
        onClose={() => setPictureDraft(null)}>
        <form className="plan-form" onSubmit={applyPictureDetails}>
          <h2 id="product-picture-editor-title">Picture details</h2>
          {pictureDraft && <img className="product-caption-image" src={pictureDraft.url} alt={pictureDraft.label} />}
          <label htmlFor="product-picture-title">Title</label>
          <input id="product-picture-title" value={pictureDraft?.title ?? ''} maxLength={120} autoFocus
            onChange={event => {
              const title = event.target.value;
              setPictureDraft(current => current && { ...current, title });
            }} />
          <label htmlFor="product-picture-note">Note</label>
          <textarea id="product-picture-note" value={pictureDraft?.note ?? ''} maxLength={1000} rows={3}
            onChange={event => {
              const note = event.target.value;
              setPictureDraft(current => current && { ...current, note });
            }} />
          <div className="plan-actions">
            <button type="submit" className="plan-primary" disabled={!canApplyPictureDetails}>Apply details</button>
            <button type="button" onClick={() => pictureEditorRef.current?.close()}>Cancel</button>
          </div>
        </form>
      </dialog>
      <ProductDetailsDialog product={viewProduct} onClose={() => setViewProduct(null)} />
    </section>
  );
}
