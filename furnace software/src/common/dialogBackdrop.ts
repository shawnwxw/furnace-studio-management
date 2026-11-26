import type { MouseEvent } from 'react';

// Native modal dialogs receive backdrop clicks on the dialog element itself.
// Check the bounds so clicking padding inside the dialog does not close it.
export function closeDialogOnBackdrop(event: MouseEvent<HTMLDialogElement>, canClose = true) {
  const dialog = event.currentTarget;
  if (!canClose || event.target !== dialog) return false;
  const { left, right, top, bottom } = dialog.getBoundingClientRect();
  if (event.clientX >= left && event.clientX <= right && event.clientY >= top && event.clientY <= bottom) return false;
  dialog.close();
  return true;
}
