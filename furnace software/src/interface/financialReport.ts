import type { ProductRecord } from './product';

export type FinancialEntryKind = 'product-sale' | 'budget' | 'spending' | 'other' | 'revenue';

export interface TransactionProductLink {
  productId: string;
  cents?: number;
  quantitySold?: number;
}

export interface FinancialEntry {
  id: string;
  kind: FinancialEntryKind;
  date: string;
  title?: string;
  description: string;
  cents: number;
  productId?: string;
  quantitySold?: number;
  productLinks?: TransactionProductLink[];
  forCurrentProject?: boolean;
}

export interface TransactionDetailsDialogProps {
  entry: FinancialEntry | null;
  productsById: ReadonlyMap<string, ProductRecord>;
  inProject: boolean;
  onClose: () => void;
}

export interface TransactionSaleDraft {
  amount: string;
  quantity: string;
}

export interface TransactionProductPickerProps {
  products: Pick<ProductRecord, 'id' | 'name'>[];
  selectedIds: string[];
  onToggle: (id: string, selected: boolean) => void;
}

export interface FinancialLedger {
  entries: FinancialEntry[];
  revision: string;
  stockUpdates?: Record<string, number>;
}

export interface FinancialEntryEdit {
  entry: FinancialEntry;
  revision: string;
}

export interface CurrentProject {
  productIds: string[];
  revision: string;
}
export interface CurrentProjectProductsProps {
  project: CurrentProject;
  products: ProductRecord[];
  onSave: (project: CurrentProject) => void;
}

export interface BudgetCostChartProps {
  budget: number;
  cost: number;
}

export interface FinancialTotals {
  budget: number;
  spending: number;
  revenue: number;
  productCost: bigint;
  hasUncostedSales: boolean;
}
