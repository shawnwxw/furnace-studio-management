import type { ReactNode } from 'react';

export interface ProductUnitValuesDraft {
  values: Record<string, string>;
}

export interface ProductUnitValueAmounts {
  manufacturingCostCents: number | null;
  packagingCostCents: number | null;
  shippingCostCents: number | null;
  saleValueCents: number | null;
}

export interface ProductValueSummaryProps {
  values: Partial<ProductUnitValueAmounts>;
  action?: ReactNode;
}

export interface ProductRecord extends ProductUnitValueAmounts {
  id: string;
  name: string;
  note: string;
  stock: number;
  initialStock?: number;
  includeInRevenue: boolean;
  description: string;
  submittedAt: string;
  pictureVersion?: string;
  mainPicturePosition?: number;
  mainPictureDetails?: ProductPictureDetails;
  pictureMetadataVersion?: string;
  gallery?: ProductGalleryPicture[];
}

export interface ProductPictureDetails {
  title?: string;
  note?: string;
}

export interface ProductGalleryPicture extends ProductPictureDetails {
  id: string;
}

export interface ProductPicturePreview {
  url: string;
  label: string;
}

export interface ProductDetailsDialogProps {
  product: ProductRecord | null;
  onClose: () => void;
}

export interface ProductDownloadButtonProps {
  product: ProductRecord;
  disabled?: boolean;
  onDownload: (product: ProductRecord) => void;
}

export interface ProductPictureEditorDraft extends ProductPicturePreview {
  id: string;
  title: string;
  note: string;
}

export interface ProductEditorPicture extends ProductPictureDetails {
  id: string;
  label: string;
  url?: string;
  file?: File;
}

export interface ProductPictureTileProps {
  picture: ProductEditorPicture;
  main: boolean;
  busy: boolean;
  dragged: boolean;
  onEdit: (url: string) => void;
  onSetMain: () => void;
  onRemove: () => void;
  onDrag: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
  onMove: (step: number) => void;
}

export interface HomeProductSelection {
  homeProductIds: string[] | null;
}

export interface ProductList extends HomeProductSelection {
  products: ProductRecord[];
}

export interface ProductDropTarget {
  id: string;
  position: 'before' | 'after';
}

export interface ProductArchiveInfo {
  byteCount: number;
}
