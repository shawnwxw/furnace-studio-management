import { useEffect, useId, useRef } from 'react';
import { closeDialogOnBackdrop } from '../../../common/dialogBackdrop';
import { formatAustralianDollars } from '../../../formatAustralianDollars';
import type { TransactionDetailsDialogProps } from '../../../interface/financialReport';
import { isProductSale, transactionDateLabel, transactionProductLinks, transactionTitle, transactionTypeLabel } from '../financialData';
import './TransactionDetailsDialog.css';

// Show the complete transaction without crowding its ledger row.
export default function TransactionDetailsDialog({ entry, productsById, inProject, onClose }: TransactionDetailsDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (entry && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [entry]);

  const links = entry ? transactionProductLinks(entry) : [];

  return (
    <dialog className="plan-dialog transaction-details" ref={dialog} aria-labelledby={titleId}
      onClick={closeDialogOnBackdrop} onClose={onClose}>
      {entry && <>
        <header>
          <h2 id={titleId}>{transactionTitle(entry)}</h2>
          <button type="button" autoFocus onClick={() => dialog.current?.close()}>Close</button>
        </header>
        <dl>
          <dt>Date</dt><dd><time dateTime={entry.date}>{transactionDateLabel.format(new Date(entry.date))}</time></dd>
          <dt>Type</dt><dd>{transactionTypeLabel(entry)}</dd>
          <dt>Amount</dt><dd>{formatAustralianDollars(entry.cents)}</dd>
          <dt>Current project</dt><dd>{inProject ? 'Included' : 'Not included'}</dd>
          {links.length > 0 && <>
            <dt>{links.length === 1 ? 'Product' : 'Products'}</dt>
            <dd><ul>
              {links.map(link => {
                const product = productsById.get(link.productId);
                return <li key={link.productId}>
                  {product?.name ?? 'Unavailable product'}
                  {links.length > 1 && link.cents !== undefined && ` · ${formatAustralianDollars(link.cents)}`}
                  {link.quantitySold !== undefined && ` · ${link.quantitySold.toLocaleString('en-AU')} sold`}
                  {product?.includeInRevenue === false && isProductSale(entry.kind) && ' · Excluded from revenue'}
                </li>;
              })}
            </ul></dd>
          </>}
          <dt>Note</dt><dd className="transaction-note">{entry.description || 'No note'}</dd>
        </dl>
      </>}
    </dialog>
  );
}
