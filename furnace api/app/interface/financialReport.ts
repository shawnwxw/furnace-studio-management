export interface TransactionProductLink {
  productId: string;
  cents?: number;
  quantitySold?: number;
}

export interface FinancialEntry {
  id: string;
  kind: 'product-sale' | 'budget' | 'spending' | 'other' | 'revenue';
  date: string;
  title?: string;
  description: string;
  cents: number;
  productId?: string;
  quantitySold?: number;
  productLinks?: TransactionProductLink[];
  forCurrentProject?: boolean;
  inventoryBaseline?: Record<string, number>;
}

export interface ProjectProduct {
  id: string;
}
