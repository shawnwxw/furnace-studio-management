import { createContext, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { ConfirmationPopupOptions, MessagePopupOptions, PopupActions, PopupDialogProps } from '../../interface/popup';
import { closeDialogOnBackdrop } from '../dialogBackdrop';
import './Popup.css';

type PopupRequest =
  | { id: number; type: 'confirmation'; options: ConfirmationPopupOptions; resolve: (confirmed: boolean) => void }
  | { id: number; type: 'message'; options: MessagePopupOptions };

const PopupContext = createContext<PopupActions | null>(null);

// Renders an accessible dialog and only allows backdrop dismissal for messages.
function PopupDialog({ title, message, confirmLabel, destructive, onClose }: PopupDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const messageId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog className="app-popup" ref={dialogRef} role={confirmLabel ? 'alertdialog' : undefined}
      aria-labelledby={titleId} aria-describedby={messageId}
      onClick={event => closeDialogOnBackdrop(event, !confirmLabel)}
      onClose={event => onClose(event.currentTarget.returnValue === 'confirm')}>
      <h2 id={titleId}>{title}</h2>
      <p id={messageId}>{message}</p>
      <form method="dialog" className="app-popup-actions">
        {confirmLabel
          ? <>
            <button value="cancel" autoFocus>Cancel</button>
            <button className={destructive ? 'app-popup-danger' : 'app-popup-primary'} value="confirm">{confirmLabel}</button>
          </>
          : <button className="app-popup-primary" value="close" autoFocus>OK</button>}
      </form>
    </dialog>
  );
}

// Gives callers a promise for confirmations and queues overlapping popup requests.
export function PopupProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<PopupRequest[]>([]);
  const nextId = useRef(0);
  const actions = useMemo<PopupActions>(() => ({
    confirm: options => new Promise(resolve => {
      const id = nextId.current++;
      setQueue(current => [...current, { id, type: 'confirmation', options, resolve }]);
    }),
    showMessage: options => {
      const id = nextId.current++;
      setQueue(current => [...current, { id, type: 'message', options }]);
    },
  }), []);
  const active = queue[0];

  return (
    <PopupContext.Provider value={actions}>
      {children}
      {active && <PopupDialog key={active.id} {...active.options} onClose={confirmed => {
        setQueue(current => current.filter(request => request.id !== active.id));
        if (active.type === 'confirmation') active.resolve(confirmed);
      }} />}
    </PopupContext.Provider>
  );
}

// Returns the shared popup actions from the app's popup provider.
export function usePopups() {
  const actions = useContext(PopupContext);
  if (!actions) throw new Error('PopupProvider is missing.');
  return actions;
}
