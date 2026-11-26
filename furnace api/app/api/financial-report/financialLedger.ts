import type { FinancialEntry, TransactionProductLink } from '../../interface/financialReport';
import { jsonStore, revision } from '../plans/planStorage';
import { inventoryUnitsSold, queueInventoryChange, readStockCheckpoint, saleQuantities, stockOnHand } from '../product/salesInventory';

const productIdPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const maxCents = 999_999_999_99;

function isQuantity(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

// Multi-product sales allocate the full amount across unique products.
function validProductLinks(entry: Partial<FinancialEntry>, isSale: boolean, canLinkProduct: boolean) {
  if (entry.productLinks === undefined) return true;
  const links: unknown = entry.productLinks;
  if (!canLinkProduct || entry.productId !== undefined || entry.quantitySold !== undefined ||
      !Array.isArray(links) || links.length < 2) return false;
  const ids = new Set<string>();
  let allocatedCents = 0;
  for (const value of links) {
    if (!value || typeof value !== 'object') return false;
    const link = value as Partial<TransactionProductLink>;
    if (typeof link.productId !== 'string' || !productIdPattern.test(link.productId) || ids.has(link.productId)) return false;
    ids.add(link.productId);
    if (isSale) {
      if (typeof link.cents !== 'number' || !Number.isSafeInteger(link.cents) || link.cents < 0 || link.cents > maxCents ||
          (link.quantitySold !== undefined && !isQuantity(link.quantitySold))) return false;
      allocatedCents += link.cents;
      if (allocatedCents > maxCents) return false;
    } else if (link.cents !== undefined || link.quantitySold !== undefined) return false;
  }
  return !isSale || allocatedCents === entry.cents;
}

// Validates ledger entries before they are written or used in the report.
function isEntry(value: unknown): value is FinancialEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<FinancialEntry>;
  const date = typeof entry.date === 'string' ? Date.parse(entry.date) : NaN;
  const isSale = entry.kind === 'product-sale' || entry.kind === 'revenue';
  const canLinkProduct = isSale || entry.kind === 'budget' || entry.kind === 'spending';
  return typeof entry.id === 'string' && /^[\da-f-]{36}$/i.test(entry.id) &&
    (canLinkProduct || entry.kind === 'other') &&
    (entry.productId === undefined || (canLinkProduct && typeof entry.productId === 'string' &&
      productIdPattern.test(entry.productId))) &&
    (entry.quantitySold === undefined || (isSale && entry.productId !== undefined && isQuantity(entry.quantitySold))) &&
    validProductLinks(entry, isSale, canLinkProduct) &&
    (entry.inventoryBaseline === undefined || (entry.inventoryBaseline !== null &&
      typeof entry.inventoryBaseline === 'object' && !Array.isArray(entry.inventoryBaseline) &&
      Object.entries(entry.inventoryBaseline).every(([id, count]) => productIdPattern.test(id) && isQuantity(count)))) &&
    (entry.forCurrentProject === undefined || (!isSale && typeof entry.forCurrentProject === 'boolean')) &&
    typeof entry.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(entry.date) && Number.isFinite(date) &&
    new Date(date).toISOString().slice(0, 10) === entry.date &&
    (entry.title === undefined ||
      (typeof entry.title === 'string' && !!entry.title.trim() && entry.title.length <= 100)) &&
    typeof entry.description === 'string' && entry.description.length <= 200 &&
    (entry.title !== undefined || !!entry.description.trim()) &&
    typeof entry.cents === 'number' && Number.isSafeInteger(entry.cents) && entry.cents > 0 && entry.cents <= maxCents;
}

const ledger = jsonStore('financial-report.json', isEntry);

export const readFinancialEntries = ledger.read;

function ledgerResponse(entries: FinancialEntry[], status = 200, stockUpdates?: Record<string, number>) {
  return Response.json({ entries, revision: revision(entries), stockUpdates }, {
    status, headers: { 'Cache-Control': 'no-store' },
  });
}

// Publish the sale and its inventory movement together in the ledger's atomic write.
function updateLedger(
  change: (current: FinancialEntry[]) => Response | { entries: FinancialEntry[]; affected: FinancialEntry[] },
  status = 200,
) {
  return queueInventoryChange(async () => {
    const stockUpdates: Record<string, number> = {};
    const result = await ledger.update(async current => {
      const next = change(current);
      if (next instanceof Response) return next;
      const ids = new Set(next.affected.flatMap(entry => [
        ...saleQuantities(entry).keys(), ...Object.keys(entry.inventoryBaseline ?? {}),
      ]));
      if (!ids.size) return next.entries;

      const before = inventoryUnitsSold(current);
      const after = inventoryUnitsSold(next.entries);
      for (const id of ids) {
        const count = await readStockCheckpoint(id);
        const sold = after.get(id) ?? BigInt(0);
        if (!count) {
          if (sold > (before.get(id) ?? BigInt(0))) {
            return Response.json({ error: 'A product linked to this sale is no longer available.' }, { status: 409 });
          }
          continue;
        }
        const remaining = stockOnHand(count, sold);
        if (remaining < BigInt(0) || remaining > BigInt(Number.MAX_SAFE_INTEGER)) {
          return Response.json({ error: `This change exceeds the available stock range for ${count.name}.` }, { status: 409 });
        }
        stockUpdates[id] = Number(remaining);
      }
      return next.entries;
    });
    return result instanceof Response ? result : ledgerResponse(result, status, stockUpdates);
  });
}

function sameEntry(first: FinancialEntry, second: FinancialEntry) {
  const secondLinks = new Map(second.productLinks?.map(link => [link.productId, link]));
  return first.kind === second.kind && first.date === second.date && first.title === second.title &&
    first.description === second.description &&
    first.cents === second.cents && first.productId === second.productId &&
    first.quantitySold === second.quantitySold && first.forCurrentProject === second.forCurrentProject &&
    (first.productLinks?.length ?? 0) === secondLinks.size &&
    (first.productLinks ?? []).every(link => {
      const other = secondLinks.get(link.productId);
      return other && other.cents === link.cents && other.quantitySold === link.quantitySold;
    });
}

// Returns recorded transactions for the report.
export async function getFinancialLedger() {
  try {
    return ledgerResponse(await ledger.read());
  } catch (error) {
    console.error('Could not read the financial ledger:', error);
    return Response.json({ error: 'Could not load financial entries.' }, { status: 500 });
  }
}

// Appends a transaction once, including when the caller retries the same entry.
export async function addFinancialEntry(request: Request) {
  const entry: unknown = await request.json().catch(() => null);
  if (!isEntry(entry)) return Response.json({ error: 'Invalid financial entry.' }, { status: 400 });
  try {
    return await updateLedger(current => {
      const existing = current.find(item => item.id === entry.id);
      if (existing) {
        return sameEntry(existing, entry) ? { entries: current, affected: [existing] }
          : Response.json({ error: 'This entry was already saved.' }, { status: 409 });
      }
      const added = { ...entry, inventoryBaseline: saleQuantities(entry).size ? {} : undefined };
      return { entries: [...current, added], affected: [added] };
    }, 201);
  } catch (error) {
    console.error('Could not save the financial entry:', error);
    return Response.json({ error: 'Could not save the entry.' }, { status: 500 });
  }
}

// Update or delete one entry under the same revision check as the ledger write.
async function changeFinancialEntry(id: string, request: Request, replacement?: FinancialEntry) {
  try {
    return await updateLedger(current => {
      const existing = current.find(entry => entry.id === id);
      if (!existing) return replacement ? Response.json({ error: 'Transaction not found.' }, { status: 404 })
        : { entries: current, affected: [] };
      if (replacement && sameEntry(existing, replacement)) return { entries: current, affected: [existing] };
      if (request.headers.get('If-Match') !== revision(current)) {
        return Response.json({ error: 'The transactions have changed. Reload before updating them.' }, { status: 412 });
      }
      if (!replacement) return { entries: current.filter(entry => entry.id !== id), affected: [existing] };
      const previousQuantities = saleQuantities(existing);
      const inventoryBaseline = existing.inventoryBaseline ??
        (previousQuantities.size || saleQuantities(replacement).size ? Object.fromEntries(previousQuantities) : undefined);
      const updated = { ...replacement, inventoryBaseline };
      return { entries: current.map(entry => entry.id === id ? updated : entry), affected: [existing, updated] };
    });
  } catch (error) {
    console.error('Could not update the financial ledger:', error);
    return Response.json({ error: 'Could not update the transaction.' }, { status: 500 });
  }
}

// Validates the full replacement, including when optional fields are cleared.
export async function updateFinancialEntry(id: string, request: Request) {
  const entry: unknown = await request.json().catch(() => null);
  if (!isEntry(entry) || entry.id !== id) return Response.json({ error: 'Invalid financial entry.' }, { status: 400 });
  return changeFinancialEntry(id, request, entry);
}

export function removeFinancialEntry(id: string, request: Request) {
  return changeFinancialEntry(id, request);
}
