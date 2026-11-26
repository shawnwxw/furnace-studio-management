import { formatAustralianDollars } from '../../../formatAustralianDollars';
import InfoTooltip from '../../../common/InfoTooltip/InfoTooltip';
import type { FinancialTotals } from '../../../interface/financialReport';
import './FinancialTotalsCards.css';

// Display the same four totals on the report and the Home dashboard.
export default function FinancialTotalsCards({ budget, spending, revenue, productCost, hasUncostedSales }: FinancialTotals) {
  const net = BigInt(revenue) - BigInt(spending) - productCost;
  const cards = [
    { label: 'Budget', amount: budget },
    { label: 'Cost', amount: spending },
    { label: 'Revenue', amount: revenue },
    { label: 'Net', amount: net },
  ];

  return (
    <dl className="finance-stat-grid">
      {cards.map(({ label, amount }) => (
        <div className="finance-stat-card" key={label}>
          <dt>{label}{label === 'Net' && <InfoTooltip label="How Net is calculated"
            message={`Revenue minus recorded spending and ${formatAustralianDollars(productCost)} in product costs. Product costs use current manufacturing, packaging, and shipping costs per unit multiplied by units sold.${hasUncostedSales ? ' Some sales are missing product or quantity information, so their costs are excluded.' : ''}`} />}
          </dt>
          <dd className="finance-stat-value" data-negative={amount < 0}>{formatAustralianDollars(amount)}</dd>
          {label === 'Net' && hasUncostedSales && <dd className="finance-stat-cost-note">Some product costs unavailable</dd>}
        </div>
      ))}
    </dl>
  );
}
