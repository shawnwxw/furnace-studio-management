export interface MessagePopupOptions {
  title: string;
  message: string;
}

export interface ConfirmationPopupOptions extends MessagePopupOptions {
  confirmLabel: string;
  destructive?: boolean;
}

export interface PopupActions {
  confirm: (options: ConfirmationPopupOptions) => Promise<boolean>;
  showMessage: (options: MessagePopupOptions) => void;
}

export interface PopupDialogProps extends MessagePopupOptions {
  onClose: (confirmed: boolean) => void;
  confirmLabel?: string;
  destructive?: boolean;
}
