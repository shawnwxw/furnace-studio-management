import { useId } from 'react';
import { formatAustralianDollars } from '../../../formatAustralianDollars';
import type { ProductValueSummaryProps } from '../../../interface/product';
import { productValueFields } from '../productData';
import './ProductValueSummary.css';

// Display the same per-unit values in both the form and the read-only details popup.
export default function ProductValueSummary({ values, action }: ProductValueSummaryProps) {
  const titleId = useId();
  return (
    <section className="product-unit-summary" aria-labelledby={titleId}>
      <div className="product-unit-summary-header">
        <h3 id={titleId}>Per-unit values</h3>
        {action}
      </div>
      <dl>
        {productValueFields.map(({ key, label }) => {
          const cents = values[key];
          return (
            <div key={key}>
              <dt>{label}</dt>
              <dd>{cents == null ? '—' : formatAustralianDollars(cents)}</dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
