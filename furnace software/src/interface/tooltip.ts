import type { ReactNode } from 'react';

export interface InfoTooltipProps {
  label: string;
  message: string;
  children?: ReactNode;
  onActivate?: () => void;
  opensDialog?: boolean;
  controls?: string;
}
