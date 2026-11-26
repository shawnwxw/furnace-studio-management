import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { FinancialEntry } from '../../interface/financialReport';
import type { ProductRecord } from '../../interface/product';

let pendingChange: Promise<unknown> = Promise.resolve();

// Serialize stock counts and sales so both use the same inventory snapshot.
export function queueInventoryChange<T>(change: () => Promise<T>) {
  const pending = pendingChange.then(change);
  pendingChange = pending.catch(() => {});
  return pending;
}

export function saleQuantities(entry: FinancialEntry) {
  const quantities = new Map<string, number>();
  if (entry.kind !== 'product-sale' && entry.kind !== 'revenue') return quantities;
  if (entry.productId && entry.quantitySold !== undefined) quantities.set(entry.productId, entry.quantitySold);
  for (const link of entry.productLinks ?? []) {
    if (link.quantitySold !== undefined) quantities.set(link.productId, link.quantitySold);
  }
  return quantities;
}

// Convert each tracked sale into a net movement from its original inventory baseline.
export function inventoryUnitsSold(entries: FinancialEntry[]) {
  const totals = new Map<string, bigint>();
  for (const entry of entries) {
    if (!entry.inventoryBaseline) continue;
    for (const [id, count] of Object.entries(entry.inventoryBaseline)) {
      totals.set(id, (totals.get(id) ?? BigInt(0)) - BigInt(count));
    }
    for (const [id, count] of saleQuantities(entry)) {
      totals.set(id, (totals.get(id) ?? BigInt(0)) + BigInt(count));
    }
  }
  return totals;
}

// A manual stock count is a checkpoint. Apply only the movement since that count.
export function stockOnHand(product: Pick<ProductRecord, 'stock' | 'stockCountAt'>, sold: bigint) {
  return BigInt(product.stock) + BigInt(product.stockCountAt ?? '0') - sold;
}

// Read the stock checkpoint without loading pictures or projecting the ledger a second time.
export async function readStockCheckpoint(id: string) {
  try {
    const file = path.join(process.cwd(), 'data', 'product', id, 'product.json');
    const record = JSON.parse(await readFile(file, 'utf8')) as Partial<ProductRecord>;
    const stock = record.stock ?? 0;
    const stockCountAt = record.stockCountAt;
    if (!Number.isSafeInteger(stock) || stock < 0 ||
        (stockCountAt !== undefined && (typeof stockCountAt !== 'string' || !/^-?\d+$/.test(stockCountAt)))) {
      throw new Error(`Invalid stock checkpoint for product ${id}`);
    }
    return { stock, stockCountAt, name: record.name ?? 'the selected product' };
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}
