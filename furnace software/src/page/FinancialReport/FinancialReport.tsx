import { formatAustralianDollars } from '../../formatAustralianDollars';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import LoadingSpinner from '../../common/LoadingSpinner/LoadingSpinner';
import InfoTooltip from '../../common/InfoTooltip/InfoTooltip';
import TrashIcon from '../../common/TrashIcon/TrashIcon';
import { usePopups } from '../../common/Popup/PopupProvider';
import { ApiError, dataService } from '../../dataService';
import type {
  CurrentProject, FinancialEntry, FinancialEntryEdit, FinancialLedger, TransactionSaleDraft,
} from '../../interface/financialReport';
import type { ProductList, ProductRecord } from '../../interface/product';
import { productEndpoint, productValueFields } from '../Product/productData';
import {
  currentProjectData, financialReportEndpoint, financialTotals, isProductSale, loadFinancialReport, productValueBreakdown,
  transactionDateLabel, transactionProductLinks, transactionTitle, transactionTypeLabel, transactionTypes,
} from './financialData';
import CurrentProjectProducts from './CurrentProjectProducts/CurrentProjectProducts';
import BudgetCostChart from './BudgetCostChart/BudgetCostChart';
import FinancialTotalsCards from './FinancialTotalsCards/FinancialTotalsCards';
import TransactionProductPicker from './TransactionProductPicker/TransactionProductPicker';
import TransactionDetailsDialog from './TransactionDetailsDialog/TransactionDetailsDialog';
import './FinancialReport.css';

const localDateInput = new Intl.DateTimeFormat('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit' });

// Converts an amount to whole cents without floating-point arithmetic.
function parseCents(value: string) {
  const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) return undefined;
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
}

// Compare fields for no-op edits and to reuse the same ID when retrying a new transaction.
function sameTransactionDetails(previous: FinancialEntry, next: Omit<FinancialEntry, 'id'>) {
  const nextLinks = new Map(next.productLinks?.map(link => [link.productId, link]));
  return previous.kind === next.kind && previous.date === next.date &&
    transactionTitle(previous) === next.title &&
    previous.description.trim() === next.description && previous.cents === next.cents &&
    previous.productId === next.productId && previous.quantitySold === next.quantitySold &&
    previous.forCurrentProject === next.forCurrentProject &&
    (previous.productLinks?.length ?? 0) === nextLinks.size &&
    (previous.productLinks ?? []).every(link => {
      const other = nextLinks.get(link.productId);
      return other && other.cents === link.cents && other.quantitySold === link.quantitySold;
    });
}

const emptySaleLine: TransactionSaleDraft = { amount: '', quantity: '' };

// Displays recorded transactions for the selected reporting period.
export default function FinancialReport() {
  const { confirm, showMessage } = usePopups();
  const [ledger, setLedger] = useState<FinancialLedger | null>(null);
  const [editing, setEditing] = useState<FinancialEntryEdit | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [entryKind, setEntryKind] = useState<FinancialEntry['kind']>('product-sale');
  const [linkedProductIds, setLinkedProductIds] = useState<string[]>([]);
  const [saleDrafts, setSaleDrafts] = useState<Record<string, TransactionSaleDraft>>({});
  const [productPickerVersion, setProductPickerVersion] = useState(0);
  const [entryDate, setEntryDate] = useState('');
  const [amount, setAmount] = useState('');
  const [overrideSalePrice, setOverrideSalePrice] = useState(false);
  const [overrideAmount, setOverrideAmount] = useState('');
  const [entryNote, setEntryNote] = useState('');
  const [projectSelection, setProjectSelection] = useState<boolean | undefined>(false);
  const [view, setView] = useState<'lifetime' | 'project' | 'transactions'>('project');
  const [project, setProject] = useState<CurrentProject | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const pending = useRef(false);
  const transactionDialog = useRef<HTMLDialogElement>(null);
  const draft = useRef<FinancialEntry | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    loadFinancialReport(controller.signal)
      .then(result => {
        if (!controller.signal.aborted) {
          setLedger(result.ledger);
          setProducts(result.products);
          setProject(result.project);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadFailed(true);
      });
    return () => controller.abort();
  }, [attempt]);

  const showProject = view === 'project';
  const showTransactions = view === 'transactions';
  const productsById = new Map(products.map(product => [product.id, product]));
  const linkedProducts = products.filter(product => product.includeInRevenue === true);
  const entries = ledger?.entries ?? [];
  const viewedEntry = entries.find(entry => entry.id === viewingId) ?? null;
  const projectReport = currentProjectData(entries, products, project);
  const report = showProject ? projectReport : { entries, products };
  const projectEntryIds = new Set(projectReport.entries.map(entry => entry.id));
  const visible = showTransactions ? [...entries].sort((first, second) => second.date.localeCompare(first.date)) : [];
  const totals = financialTotals(report.entries, report.products);
  const productValues = productValueBreakdown(report.products, report.entries);
  const selectedIds = entryKind === 'other' ? [] : linkedProductIds;
  const productId = selectedIds.length === 1 ? selectedIds[0] : undefined;
  const isSale = isProductSale(entryKind);
  const isMultiSale = isSale && selectedIds.length > 1;
  const productInProject = projectReport.products.some(product => selectedIds.includes(product.id));
  const pickerProducts = [
    ...linkedProducts,
    ...selectedIds.filter(id => !linkedProducts.some(product => product.id === id)).map(id => ({
      id, name: productsById.get(id)?.name ?? 'Unavailable product',
    })),
  ];
  const saleLinks = isSale ? selectedIds.map(id => {
    const line = saleDrafts[id] ?? emptySaleLine;
    return { productId: id, cents: parseCents(line.amount.trim()), quantitySold: line.quantity ? Number(line.quantity) : undefined };
  }) : [];
  const quantitySold = productId ? saleLinks[0]?.quantitySold : undefined;
  const unitSalePrice = productId ? productsById.get(productId)?.saleValueCents : undefined;
  const defaultSaleTotal = unitSalePrice != null && quantitySold !== undefined ? unitSalePrice * quantitySold : undefined;
  const existingUnlinkedSale = editing && isProductSale(editing.entry.kind) && !transactionProductLinks(editing.entry).length;
  const requiresQuantity = Boolean(productId && (editing?.entry.productId !== productId || editing.entry.quantitySold !== undefined));
  const cents = isMultiSale ? saleLinks.reduce((total, line) => total + (line.cents ?? 0), 0)
    : isSale && !overrideSalePrice ? defaultSaleTotal ?? 0
    : parseCents((isSale ? overrideAmount : amount).trim()) ?? 0;
  const showSaleTotal = isSale && cents > 0 && Number.isSafeInteger(cents) && saleLinks.length > 0 &&
    saleLinks.every(line => (!isMultiSale || line.cents !== undefined) &&
      line.quantitySold !== undefined && Number.isSafeInteger(line.quantitySold) && line.quantitySold > 0);
  const saleTotalAmount = showSaleTotal ? <>A$<strong>{formatAustralianDollars(cents).slice(2)}</strong></> : null;
  const productLinks = selectedIds.length > 1
    ? (isSale ? saleLinks : selectedIds.map(id => ({ productId: id }))) : undefined;
  const title = isSale
    ? (editing && isProductSale(editing.entry.kind) && editing.entry.productId === productId
      ? transactionTitle(editing.entry)
      : (productId ? productsById.get(productId)?.name : undefined)?.slice(0, 100).trim() || 'Product sales')
    : editing ? transactionTitle(editing.entry) : transactionTypes.find(type => type.value === entryKind)?.label ?? 'Transaction';
  const entryDetails = {
    kind: entryKind, date: entryDate, title, description: entryNote.trim(), cents, productId, quantitySold, productLinks,
    forCurrentProject: isSale ? undefined : projectSelection,
  };
  const canSaveEntry = Boolean(ledger && !saving && entryDate && cents &&
    cents <= 99_999_999_999 &&
    (!isSale || isMultiSale || ((productId || existingUnlinkedSale) && (!requiresQuantity || quantitySold !== undefined))) &&
    saleLinks.every(line => (!isMultiSale || line.cents !== undefined) &&
      (line.quantitySold === undefined || (Number.isSafeInteger(line.quantitySold) && line.quantitySold > 0))) &&
    (!editing || (editing.revision === ledger.revision && !sameTransactionDetails(editing.entry, entryDetails))));

  function editTransaction(entry: FinancialEntry) {
    if (!ledger || pending.current) return;
    setEditing({ entry, revision: ledger.revision });
    setEntryKind(entry.kind);
    const links = transactionProductLinks(entry);
    setLinkedProductIds(links.map(link => link.productId));
    setSaleDrafts(Object.fromEntries(links.map(link => [link.productId, {
      amount: link.cents === undefined ? '' : (link.cents / 100).toFixed(2),
      quantity: link.quantitySold?.toString() ?? '',
    }])));
    setEntryDate(entry.date);
    setAmount((entry.cents / 100).toFixed(2));
    const listedPrice = entry.productId ? productsById.get(entry.productId)?.saleValueCents : undefined;
    setOverrideSalePrice(isProductSale(entry.kind) &&
      (listedPrice == null || entry.quantitySold === undefined || listedPrice * entry.quantitySold !== entry.cents));
    setOverrideAmount(isProductSale(entry.kind) ? (entry.cents / 100).toFixed(2) : '');
    setEntryNote(entry.description);
    setProjectSelection(isProductSale(entry.kind) ? false : entry.forCurrentProject);
    setSaveError('');
    transactionDialog.current?.showModal();
  }

  // Budget and Spending transactions can link multiple products.
  function toggleProduct(id: string, selected: boolean) {
    setLinkedProductIds(current => selected ? [...current, id] : current.filter(product => product !== id));
  }

  function updateSaleLine(id: string, update: Partial<TransactionSaleDraft>) {
    setSaleDrafts(current => ({ ...current, [id]: { ...emptySaleLine, ...current[id], ...update } }));
  }

  // Refresh after a conflict so a repeat action uses the latest ledger revision.
  async function refreshLedger() {
    try {
      const [latest, productList] = await Promise.all([
        dataService.get<FinancialLedger>(financialReportEndpoint),
        dataService.get<ProductList>(productEndpoint),
      ]);
      setLedger(latest);
      setProducts(productList.products);
      return true;
    } catch {
      return false;
    }
  }

  // Show the stock calculated by the same write that saved the sale.
  function applySavedLedger(saved: FinancialLedger) {
    setLedger(saved);
    const updates = saved.stockUpdates;
    if (updates) {
      setProducts(current => current.map(product => updates[product.id] === undefined
        ? product : { ...product, stock: updates[product.id] }));
    }
  }

  // Retains the entry ID if the user retries an identical submission.
  async function saveEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || !canSaveEntry) return;
    pending.current = true;
    setSaving(true);
    setSaveError('');
    try {
      const previous = draft.current;
      const id = editing?.entry.id ?? (previous && sameTransactionDetails(previous, entryDetails) ? previous.id : crypto.randomUUID());
      const entry: FinancialEntry = { id, ...entryDetails };
      if (!editing) draft.current = entry;
      applySavedLedger(editing
        ? await dataService.put<FinancialLedger>(`${financialReportEndpoint}/${id}`, entry, {
          headers: { 'If-Match': editing.revision },
        })
        : await dataService.post<FinancialLedger>(financialReportEndpoint, entry));
      if (!editing) draft.current = null;
      transactionDialog.current?.close();
      showMessage({ title: 'Transaction saved', message: editing
        ? 'The transaction has been updated.' : 'The entry has been added to the Financial Report.' });
    } catch (error) {
      if (error instanceof ApiError && (error.status === 412 || error.status === 404)) {
        setSaveError(await refreshLedger()
          ? 'The transaction list changed. Close this form and reopen the transaction to edit the latest version.'
          : 'Could not refresh the transaction list. Reload the page before editing.');
      } else {
        setSaveError(error instanceof ApiError && error.status === 409
          ? 'This sale could not be saved. Check the linked product and available stock.'
          : error instanceof ApiError && error.status === 400
            ? 'Check the transaction details and try again.' : 'Could not save the transaction. Try again.');
      }
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  async function removeTransaction(entry: FinancialEntry) {
    if (!ledger || pending.current) return;
    pending.current = true;
    setSaving(true);
    try {
      const confirmed = await confirm({
        title: 'Remove transaction',
        message: `Remove “${transactionTitle(entry)}” (${formatAustralianDollars(entry.cents)}) from the Financial Report?`,
        confirmLabel: 'Remove',
        destructive: true,
      });
      if (!confirmed) return;
      const saved = await dataService.delete<FinancialLedger>(`${financialReportEndpoint}/${entry.id}`, {
        headers: { 'If-Match': ledger.revision },
      });
      applySavedLedger(saved);
      if (!Object.keys(saved.stockUpdates ?? {}).length) await refreshLedger();
    } catch (error) {
      const refreshed = error instanceof ApiError && error.status === 412 && await refreshLedger();
      showMessage({
        title: 'Transaction could not be removed',
        message: refreshed ? 'The transaction list changed. Review the latest transactions and try again.'
          : 'The transaction could not be removed. Try again.',
      });
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  return (
    <section className="financial-report-page page-frame">
      <header className="page-header">
        <h1>Financial Report</h1>
        <div className="finance-header-actions">
          <div className="finance-period-switch" role="group" aria-label="Financial Report view">
            <button type="button" aria-pressed={showProject} onClick={() => setView('project')}>Current Project</button>
            <button type="button" aria-pressed={view === 'lifetime'} onClick={() => setView('lifetime')}>Business</button>
            <button type="button" aria-pressed={showTransactions} onClick={() => setView('transactions')}>Transactions</button>
          </div>
          <button type="button" className="page-add" aria-label="Add transaction" title="Add transaction"
            aria-haspopup="dialog" disabled={!ledger || saving} onClick={() => {
              setEntryDate(localDateInput.format(new Date()));
              transactionDialog.current?.showModal();
            }}>+</button>
        </div>
      </header>

      <div className="page-panel panel-frame">
        {loadFailed && <p role="alert">Could not load the Financial Report. <button type="button" onClick={() => {
          setLoadFailed(false);
          setAttempt(current => current + 1);
        }}>Try again</button></p>}
        {!ledger && !loadFailed && <LoadingSpinner label="Loading Financial Report…" />}
        {ledger && !showTransactions && <>
          <section className="finance-panel" aria-labelledby="finance-statistics-title">
            <header className="finance-period">
              <h2 id="finance-statistics-title">{showProject ? 'Current project statistics' : 'Business statistics'}</h2>
              {showProject && project && <CurrentProjectProducts project={project} products={linkedProducts}
                onSave={setProject} />}
            </header>
            <FinancialTotalsCards {...totals} />
            <BudgetCostChart budget={totals.budget} cost={totals.spending} />
          </section>
          <section className="finance-panel finance-product-values" aria-labelledby="finance-products-title">
            <header>
              <h2 id="finance-products-title">Product values</h2>
            </header>
            <small className="finance-product-value-note">{showProject
              ? 'Current inventory and recorded sales for products assigned to this project.'
              : 'Current inventory and all-time sales for included products.'}</small>
            {productValues.rows.length === 0 ? <p>{showProject ? 'No products assigned yet.' : 'No linked products.'}</p> : (
              <div className="finance-table-scroll" tabIndex={0} role="region" aria-label="Product value breakdown">
                <table>
                  <thead><tr>
                    <th scope="col">Product</th>
                    <th scope="col">Stock on hand</th>
                    <th scope="col">Cost per unit</th>
                    <th scope="col">Unit sale value</th>
                    <th scope="col">Sales revenue</th>
                    <th scope="col">Product net revenue <InfoTooltip label="How product net revenue is calculated"
                      message="Recorded sales revenue minus the product’s current cost per unit multiplied by units sold. When costs are set and the quantity sold is missing, net revenue is unavailable." /></th>
                    <th scope="col">Units sold</th>
                  </tr></thead>
                  <tbody>{productValues.rows.map(row => <tr key={row.id}>
                    <th scope="row">{row.name}{' '}
                      <InfoTooltip label={`Per-unit values for ${row.name}`}
                        message={productValueFields.map(({ key, label }) => {
                          const value = productsById.get(row.id)?.[key];
                          return `${label} ${value == null ? '—' : formatAustralianDollars(value)}`;
                        }).join('\n')} />
                    </th>
                    <td>{row.stock.toLocaleString('en-AU')}</td>
                    <td>{row.unitCostCents === null ? '—' : formatAustralianDollars(row.unitCostCents)}</td>
                    <td>{row.saleValueCents === null ? '—' : formatAustralianDollars(row.saleValueCents)}</td>
                    <td>{formatAustralianDollars(row.soldValue)}</td>
                    <td>{row.netRevenue === null ? '—' : formatAustralianDollars(row.netRevenue)}</td>
                    <td>{row.soldNumber === null
                      ? <InfoTooltip label="Why units sold is unknown"
                        message="One or more linked sales have no recorded quantity.">Unknown</InfoTooltip>
                      : row.soldNumber.toLocaleString('en-AU')}</td>
                  </tr>)}</tbody>
                </table>
              </div>
            )}
          </section>
        </>}
        {ledger && showTransactions && (
          <section className="finance-panel finance-ledger" aria-labelledby="finance-ledger-title">
            <h2 id="finance-ledger-title">Transactions</h2>
            {visible.length === 0 ? <p>No transactions yet.</p> : (
              <div className="finance-table-scroll">
                <table>
                  <thead><tr>
                    <th scope="col">Date</th><th scope="col">Title</th><th scope="col">Type</th>
                    <th scope="col" className="finance-ledger-amount">Amount</th>
                    <th scope="col" aria-label="Transaction actions" />
                  </tr></thead>
                  <tbody>{visible.map(entry => {
                    const name = transactionTitle(entry);
                    return <tr key={entry.id} className="finance-ledger-row" onClick={() => setViewingId(entry.id)}>
                    <td><time dateTime={entry.date}>{transactionDateLabel.format(new Date(entry.date))}</time></td>
                    <th scope="row"><button type="button" className="finance-ledger-title" aria-haspopup="dialog">
                      {name}
                    </button></th>
                    <td>{transactionTypeLabel(entry)}</td>
                    <td className="finance-ledger-amount">{formatAustralianDollars(entry.cents)}</td>
                    <td onClick={event => event.stopPropagation()}>
                      <div className="finance-ledger-actions">
                        <button type="button" className="finance-ledger-icon" title="Edit transaction" aria-haspopup="dialog"
                          aria-label={`Edit transaction: ${name}`} disabled={saving} onClick={() => editTransaction(entry)}>
                          <span aria-hidden="true">✎</span>
                        </button>
                        <button type="button" className="finance-ledger-icon finance-ledger-remove" title="Remove transaction"
                          aria-label={`Remove transaction: ${name}`} disabled={saving} onClick={() => void removeTransaction(entry)}>
                          <TrashIcon />
                        </button>
                      </div>
                    </td>
                  </tr>;
                  })}</tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </div>
      <dialog className="plan-dialog finance-entry-dialog" ref={transactionDialog} aria-labelledby="finance-entry-title"
        onCancel={event => event.preventDefault()}
        onClose={() => {
          setEditing(null);
          setEntryKind('product-sale');
          setLinkedProductIds([]);
          setSaleDrafts({});
          setProductPickerVersion(current => current + 1);
          setEntryDate('');
          setAmount('');
          setOverrideSalePrice(false);
          setOverrideAmount('');
          setEntryNote('');
          setProjectSelection(false);
          setSaveError('');
        }}>
        <form className="plan-form finance-entry" onSubmit={saveEntry}>
          <h2 id="finance-entry-title">{editing ? 'Edit transaction' : 'Add transaction'}</h2>
          <div className="finance-entry-fields">
            {saveError && <p role="alert">{saveError}</p>}
            <fieldset disabled={saving}>
              <label>Type<select name="kind" value={entryKind}
                onChange={event => {
                  const value = event.target.value;
                  const nextKind = value === 'revenue' ? value : transactionTypes.find(option => option.value === value)?.value;
                  if (!nextKind) return;
                  setEntryKind(nextKind);
                  if (nextKind === 'other') {
                    setLinkedProductIds([]);
                    setSaleDrafts({});
                  } else if (isProductSale(nextKind) && !isSale && linkedProductIds.length > 1) {
                    setLinkedProductIds([]);
                  }
                }}>
                {editing?.entry.kind === 'revenue' && <option value="revenue">
                  {transactionProductLinks(editing.entry).length ? 'Product sales (legacy)' : 'Revenue (legacy)'}
                </option>}
                {transactionTypes.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
              </select></label>
              <label>Date<input name="date" type="date" required
                value={entryDate} onChange={event => setEntryDate(event.target.value)} /></label>
              {!isSale && entryKind !== 'other' && <TransactionProductPicker key={productPickerVersion} products={pickerProducts}
                selectedIds={selectedIds} onToggle={toggleProduct} />}
              {isSale && !isMultiSale && <label>Product
                <select name="productId" value={productId ?? ''} required={!existingUnlinkedSale} onChange={event => {
                  const id = event.target.value;
                  setLinkedProductIds(id ? [id] : []);
                  if (id && !saleDrafts[id]) updateSaleLine(id, { quantity: '1' });
                }}>
                  <option value="">{existingUnlinkedSale ? 'No linked product' : 'Select a product'}</option>
                  {pickerProducts.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}
                </select>
              </label>}
              {(!isSale || selectedIds.length > 0) && <label className="finance-project-option">
                <input type="checkbox" checked={productInProject || (!isSale && projectSelection === true)}
                  disabled={isSale || productInProject}
                  onChange={event => {
                    const selected = event.target.checked;
                    const legacyAssignment = editing && !isProductSale(editing.entry.kind) &&
                      editing.entry.forCurrentProject === undefined;
                    setProjectSelection(legacyAssignment && !selected ? undefined : selected);
                  }} />
                Include in current project
              </label>}
              {isSale && productId && <div className="finance-sale-field">
                <div className="finance-sale-field-label">
                  <label htmlFor="finance-quantity-sold">Quantity sold</label>
                  {!overrideSalePrice && saleTotalAmount && <>
                    <span aria-hidden="true">|</span>
                    <output className="finance-sale-total">
                      Sale total {saleTotalAmount}
                    </output>
                  </>}
                </div>
                <input id="finance-quantity-sold" name="quantitySold" type="number" min="1" step="1" max={Number.MAX_SAFE_INTEGER}
                  required={requiresQuantity}
                  value={saleDrafts[productId]?.quantity ?? ''}
                  onChange={event => updateSaleLine(productId, { quantity: event.target.value })} />
              </div>}
              {isSale && !isMultiSale && <>
                <div className="finance-sale-override">
                  <label className="finance-project-option">
                    <input type="checkbox" checked={overrideSalePrice}
                      onChange={event => setOverrideSalePrice(event.target.checked)} />
                    Override the sale total
                  </label>
                  <InfoTooltip label="How sale pricing works"
                    message="The default total is the product’s saved unit sale price multiplied by the quantity sold. Tick the checkbox to enter the actual amount charged for the whole sale." />
                </div>
                {overrideSalePrice && <div className="finance-sale-field">
                  <div className="finance-sale-field-label">
                    <label htmlFor="finance-actual-sale-total">Actual sale total (A$)</label>
                    {saleTotalAmount && <>
                      <span aria-hidden="true">|</span>
                      <output className="finance-sale-total">{saleTotalAmount}</output>
                    </>}
                  </div>
                  <input id="finance-actual-sale-total" type="number" min="0.01" step="0.01" max="999999999.99" required
                    value={overrideAmount} onChange={event => setOverrideAmount(event.target.value)} />
                </div>}
                {productId && unitSalePrice == null && !overrideSalePrice &&
                  <small>This product has no saved unit sale price. Tick the override checkbox to enter the actual sale total.</small>}
              </>}
              {isMultiSale && <div className="finance-sale-lines">
                <small>This sale includes multiple products. Its total is the sum of the amounts below.</small>
                {selectedIds.map(id => {
                  const line = saleDrafts[id] ?? emptySaleLine;
                  return <fieldset className="finance-sale-line" key={id}>
                    <legend>{productsById.get(id)?.name ?? 'Unavailable product'}</legend>
                    <label>Amount (A$)
                      <input type="number" min="0" step="0.01" max="999999999.99" required value={line.amount}
                        onChange={event => updateSaleLine(id, { amount: event.target.value })} />
                    </label>
                    <label>Quantity sold (optional)
                      <input type="number" min="1" step="1" max={Number.MAX_SAFE_INTEGER} value={line.quantity}
                        onChange={event => updateSaleLine(id, { quantity: event.target.value })} />
                    </label>
                  </fieldset>;
                })}
              </div>}
              {isMultiSale && saleTotalAmount && <output className="finance-sale-total">
                Sale total {saleTotalAmount}
              </output>}
              {!isSale && <label>Amount (A$)
                <input name="amount" type="number" min="0.01" step="0.01" max="999999999.99" required
                  value={amount}
                  onChange={event => setAmount(event.target.value)} />
              </label>}
              <label>Note (optional)<textarea name="note" rows={3} maxLength={200}
                value={entryNote} onChange={event => setEntryNote(event.target.value)} /></label>
            </fieldset>
          </div>
          <footer className="plan-actions">
            <button type="submit" className="finance-submit" disabled={!canSaveEntry}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Save transaction'}
            </button>
            <button type="button" disabled={saving} onClick={() => transactionDialog.current?.close()}>Cancel</button>
          </footer>
        </form>
      </dialog>
      <TransactionDetailsDialog entry={viewedEntry} productsById={productsById}
        inProject={viewedEntry !== null && projectEntryIds.has(viewedEntry.id)} onClose={() => setViewingId(null)} />
    </section>
  );
}
