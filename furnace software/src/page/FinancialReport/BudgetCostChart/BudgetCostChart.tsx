import { formatAustralianDollars } from '../../../formatAustralianDollars';
import type { BudgetCostChartProps } from '../../../interface/financialReport';
import './BudgetCostChart.css';

// Shows the budget and cost as proportional segments for the current reporting scope.
export default function BudgetCostChart({ budget, cost }: BudgetCostChartProps) {
  return (
    <figure className="budget-cost-chart">
      <div className="budget-cost-track" aria-hidden="true">
        <span className="budget-cost-budget" style={{ flexGrow: budget }} />
        <span className="budget-cost-cost" style={{ flexGrow: cost }} />
      </div>
      <figcaption>
        <span><i className="budget-cost-budget" aria-hidden="true" />Budget {formatAustralianDollars(budget)}</span>
        <span><i className="budget-cost-cost" aria-hidden="true" />Cost {formatAustralianDollars(cost)}</span>
      </figcaption>
    </figure>
  );
}
