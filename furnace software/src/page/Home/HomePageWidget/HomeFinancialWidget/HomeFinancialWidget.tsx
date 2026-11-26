import { useEffect, useState } from 'react';
import LoadingSpinner from '../../../../common/LoadingSpinner/LoadingSpinner';
import InfoTooltip from '../../../../common/InfoTooltip/InfoTooltip';
import type { FinancialTotals } from '../../../../interface/financialReport';
import FinancialTotalsCards from '../../../FinancialReport/FinancialTotalsCards/FinancialTotalsCards';
import { currentProjectData, financialTotals, loadFinancialReport } from '../../../FinancialReport/financialData';

// Shows the same totals as the Current Project tab in Financial Report.
export default function HomeFinancialWidget() {
  const [totals, setTotals] = useState<FinancialTotals | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    loadFinancialReport(controller.signal)
      .then(({ ledger, products, project }) => {
        if (controller.signal.aborted) return;
        const current = currentProjectData(ledger.entries, products, project);
        setTotals(financialTotals(current.entries, current.products));
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadFailed(true);
      });
    return () => controller.abort();
  }, []);

  return (
    <section className="home-financial panel-frame" aria-labelledby="home-financial-title">
      <header>
        <h2 id="home-financial-title">Financial Report</h2>
        <InfoTooltip label="About these totals"
          message="These totals include sales of products assigned to the current project and other transactions included in the project." />
      </header>
      {loadFailed && <p role="alert">Could not load financial totals.</p>}
      {!totals && !loadFailed && <LoadingSpinner label="Loading financial totals…" />}
      {totals && <FinancialTotalsCards {...totals} />}
    </section>
  );
}
