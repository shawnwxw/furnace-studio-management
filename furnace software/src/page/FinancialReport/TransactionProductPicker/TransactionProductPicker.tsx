import type { TransactionProductPickerProps } from '../../../interface/financialReport';
import './TransactionProductPicker.css';

// Checkboxes allow multiple selections without modifier keys.
export default function TransactionProductPicker({ products, selectedIds, onToggle }: TransactionProductPickerProps) {
  if (!products.length) return null;
  const selected = new Set(selectedIds);

  return (
    <details className="transaction-product-picker">
      <summary>Products (optional){selected.size > 0 && ` · ${selected.size} selected`}</summary>
      <div className="transaction-product-options">
        {products.map(product => (
          <label key={product.id}>
            <input type="checkbox" checked={selected.has(product.id)}
              onChange={event => onToggle(product.id, event.target.checked)} />
            <span>{product.name}</span>
          </label>
        ))}
      </div>
    </details>
  );
}
