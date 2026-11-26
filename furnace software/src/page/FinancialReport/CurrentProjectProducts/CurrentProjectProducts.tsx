import { useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import InfoTooltip from '../../../common/InfoTooltip/InfoTooltip';
import { ApiError, dataService } from '../../../dataService';
import type { CurrentProject, CurrentProjectProductsProps } from '../../../interface/financialReport';
import { currentProjectEndpoint } from '../financialData';
import './CurrentProjectProducts.css';

// Keep selection changes local until the API accepts them.
export default function CurrentProjectProducts({ project, products, onSave }: CurrentProjectProductsProps) {
  const [draft, setDraft] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const dialogId = useId();
  const titleId = useId();
  const selected = new Set(draft ?? project.productIds);
  const changed = selected.size !== project.productIds.length || project.productIds.some(id => !selected.has(id));

  async function saveAssignments(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!changed || saving) return;
    setSaving(true);
    setMessage('');
    try {
      onSave(await dataService.put<CurrentProject>(currentProjectEndpoint, [...selected].map(id => ({ id })), {
        headers: { 'If-Match': project.revision },
      }));
      dialog.current?.close();
    } catch (error) {
      if (error instanceof ApiError && error.status === 412) {
        try {
          onSave(await dataService.get<CurrentProject>(currentProjectEndpoint));
          setDraft(null);
          setMessage('The project changed in another session. Review the latest selection.');
          return;
        } catch {
          setMessage('Could not refresh the project selection.');
          return;
        }
      }
      setMessage(error instanceof ApiError && error.status === 400
        ? 'Only products currently linked to Financial Report can be saved.'
        : 'Could not save project products. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <InfoTooltip label="Assign products"
        message="Choose which products linked to Financial Report belong to this project."
        opensDialog controls={dialogId} onActivate={() => dialog.current?.showModal()}>
        <svg className="finance-assign-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="m3 7 8-4 8 4-8 4-8-4v10l8 4 4-2m4-12v5m-8 9V11m8 3v6m-3-3h6" />
        </svg>
      </InfoTooltip>
      <dialog className="plan-dialog project-products-dialog" id={dialogId} ref={dialog} aria-labelledby={titleId}
        onCancel={event => event.preventDefault()}
        onClose={() => {
          setDraft(null);
          setMessage('');
        }}>
        <form className="plan-form project-products" onSubmit={saveAssignments}>
          <h2 id={titleId}>Assign products</h2>
          <div className="project-products-body">
            {products.length === 0 ? <p>On the Products page, link a product to Financial Report before assigning it here.</p> : (
              <fieldset disabled={saving}>
                <legend>Products linked to Financial Report</legend>
                <div className="project-product-list">
                  {products.map(product => (
                    <label key={product.id}>
                      <input type="checkbox" checked={selected.has(product.id)} onChange={event => {
                        if (event.target.checked) selected.add(product.id);
                        else selected.delete(product.id);
                        setDraft([...selected]);
                        setMessage('');
                      }} />
                      <span>{product.name}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            {message && <p className="project-products-status" role="status">{message}</p>}
          </div>
          <footer className="plan-actions">
            <button type="submit" className="finance-submit" disabled={!changed || saving}>
              {saving ? 'Saving…' : 'Save products'}
            </button>
            <button type="button" disabled={saving} onClick={() => dialog.current?.close()}>Cancel</button>
          </footer>
        </form>
      </dialog>
    </>
  );
}
