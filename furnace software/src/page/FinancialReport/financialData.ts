import { dataService } from '../../dataService';
import type {
  CurrentProject, FinancialEntry, FinancialEntryKind, FinancialLedger, FinancialTotals, TransactionProductLink,
} from '../../interface/financialReport';
import type { ProductList, ProductRecord } from '../../interface/product';
import { productEndpoint, productUnitCostCents } from '../Product/productData';

export const financialReportEndpoint = 'financial-report';
export const currentProjectEndpoint = `${financialReportEndpoint}/current-project`;
export const transactionDateLabel = new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeZone: 'UTC' });
export const transactionTypes = [
  { value: 'product-sale', label: 'Product sales' },
  { value: 'budget', label: 'Budget' },
  { value: 'spending', label: 'Spending' },
  { value: 'other', label: 'Other' },
] as const;

// Use the transaction type as the title for older entries so notes only appear in the popup.
export function transactionTitle(entry: FinancialEntry) {
  return entry.title ?? transactionTypeLabel(entry);
}

export function transactionTypeLabel(entry: FinancialEntry) {
  if (entry.kind === 'revenue' && transactionProductLinks(entry).length) return 'Product sales';
  return transactionTypes.find(type => type.value === entry.kind)?.label ?? 'Revenue';
}

export function isProductSale(kind: FinancialEntryKind) {
  return kind === 'product-sale' || kind === 'revenue';
}

// Read legacy single-product transactions through the same interface as multi-product transactions.
export function transactionProductLinks(entry: FinancialEntry): TransactionProductLink[] {
  if (entry.productLinks) return entry.productLinks;
  if (!entry.productId) return [];
  return [{
    productId: entry.productId,
    cents: isProductSale(entry.kind) ? entry.cents : undefined,
    quantitySold: entry.quantitySold,
  }];
}

// Include transactions linked to assigned products and manually selected non-sales.
export function currentProjectData(entries: FinancialEntry[], products: ProductRecord[], project: CurrentProject | null) {
  const assignedIds = new Set(project?.productIds);
  const assignedProducts = products.filter(product => product.includeInRevenue === true && assignedIds.has(product.id));
  const eligibleIds = new Set(assignedProducts.map(product => product.id));
  return {
    products: assignedProducts,
    entries: entries.flatMap(entry => {
      const links = transactionProductLinks(entry).filter(link => eligibleIds.has(link.productId));
      if (!isProductSale(entry.kind)) return links.length > 0 || entry.forCurrentProject === true ? [entry] : [];
      if (!links.length) return [];
      // A mixed sale contributes only the lines for products assigned to the project.
      return [{
        ...entry, productId: undefined, quantitySold: undefined, productLinks: links,
        cents: links.reduce((sum, link) => sum + (link.cents ?? 0), 0),
      }];
    }),
  };
}

// Combines current inventory values with linked sales in the selected period.
export function productValueBreakdown(products: ProductRecord[], entries: FinancialEntry[]) {
  const sales = new Map<string, { cents: bigint; units: bigint; missingQuantity: boolean }>();
  for (const entry of entries) {
    if (!isProductSale(entry.kind)) continue;
    for (const link of transactionProductLinks(entry)) {
      const sale = sales.get(link.productId) ?? { cents: BigInt(0), units: BigInt(0), missingQuantity: false };
      sale.cents += BigInt(link.cents ?? 0);
      sale.units += BigInt(link.quantitySold ?? 0);
      // A partial unit count would understate sales when an entry has no quantity.
      sale.missingQuantity ||= link.quantitySold === undefined;
      sales.set(link.productId, sale);
    }
  }

  const rows = [];
  for (const product of products) {
    if (product.includeInRevenue !== true) continue;
    const sale = sales.get(product.id);
    const saleValueCents = product.saleValueCents ?? null;
    const unitCostCents = productUnitCostCents(product);
    const soldValue = sale?.cents ?? BigInt(0);
    const soldNumber = sale?.missingQuantity ? null : sale?.units ?? BigInt(0);
    const netRevenue = unitCostCents && soldNumber === null ? null
      : soldValue - BigInt(unitCostCents ?? 0) * (soldNumber ?? BigInt(0));
    rows.push({
      id: product.id, name: product.name, stock: product.stock, saleValueCents,
      unitCostCents, soldValue, soldNumber, netRevenue,
    });
  }
  return { rows };
}

// Loads the ledger, reporting settings, and current project assignments.
export async function loadFinancialReport(signal: AbortSignal) {
  const [ledger, productList, project] = await Promise.all([
    dataService.get<FinancialLedger>(financialReportEndpoint, { signal }),
    dataService.get<ProductList>(productEndpoint, { signal }),
    dataService.get<CurrentProject>(currentProjectEndpoint, { signal }),
  ]);
  return { ledger, products: productList.products, project };
}

// Count sales and their product costs in the same scope, using current unit costs.
export function financialTotals(entries: FinancialEntry[], products: ProductRecord[]): FinancialTotals {
  const productsById = new Map(products.map(product => [product.id, product]));
  const totals: FinancialTotals = {
    budget: 0, revenue: 0, spending: 0, productCost: BigInt(0), hasUncostedSales: false,
  };
  for (const entry of entries) {
    if (entry.kind === 'budget') totals.budget += entry.cents;
    if (entry.kind === 'spending') totals.spending += entry.cents;
    if (!isProductSale(entry.kind)) continue;
    const links = transactionProductLinks(entry);
    if (links.length === 0) {
      totals.revenue += entry.cents;
      totals.hasUncostedSales ||= entry.kind === 'product-sale';
    }
    for (const link of links) {
      const product = productsById.get(link.productId);
      if (product?.includeInRevenue === false) continue;
      totals.revenue += link.cents ?? 0;
      if (!product) {
        totals.hasUncostedSales = true;
        continue;
      }
      const unitCost = productUnitCostCents(product) ?? 0;
      if (link.quantitySold === undefined) {
        totals.hasUncostedSales ||= unitCost > 0;
        continue;
      }
      totals.productCost += BigInt(unitCost) * BigInt(link.quantitySold);
    }
  }
  return totals;
}
