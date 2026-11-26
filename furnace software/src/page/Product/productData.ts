import { apiUrl, dataService } from '../../dataService';
import type { ProductArchiveInfo, ProductRecord } from '../../interface/product';

export const productEndpoint = 'product';
export const productValueFields = [
  { name: 'manufacturingCost', key: 'manufacturingCostCents', label: 'Manufacturing cost' },
  { name: 'packagingCost', key: 'packagingCostCents', label: 'Packaging cost' },
  { name: 'shippingCost', key: 'shippingCostCents', label: 'Shipping cost' },
  { name: 'saleValue', key: 'saleValueCents', label: 'Sale value' },
] as const;

// Returns the configured per-unit costs, distinguishing a blank estimate from zero.
export function productUnitCostCents(product: ProductRecord) {
  const costs = [product.manufacturingCostCents, product.packagingCostCents, product.shippingCostCents];
  return costs.every(cost => cost == null) ? null : costs.reduce<number>((total, cost) => total + (cost ?? 0), 0);
}

// Uses the saved Home order, or the first two cards until Home is configured.
export function selectHomeProducts(products: ProductRecord[], homeProductIds: string[] | null) {
  if (homeProductIds == null) return products.slice(0, 2);
  return homeProductIds.flatMap(id => {
    const product = products.find(item => item.id === id);
    return product ? [product] : [];
  }).slice(0, 2);
}

// Uses the picture version to refresh the URL after an edit.
export function productPictureUrl(product: ProductRecord, galleryPictureId?: string) {
  const base = `${productEndpoint}/${product.id}/picture`;
  if (galleryPictureId) return apiUrl(`${base}/${galleryPictureId}`);
  return apiUrl(`${base}${product.pictureVersion ? `?v=${product.pictureVersion}` : ''}`);
}

// Builds the route for the product's ZIP archive.
function productArchivePath(product: ProductRecord) {
  return `${productEndpoint}/${product.id}/archive`;
}

// Reads the exact archive size before the browser starts the download.
export function productArchiveInfo(product: ProductRecord, signal?: AbortSignal) {
  return dataService.get<ProductArchiveInfo>(`${productArchivePath(product)}?size=1`, { cache: 'no-store', signal });
}

// Builds the download URL after the user confirms.
export function productArchiveUrl(product: ProductRecord) {
  return apiUrl(productArchivePath(product));
}
