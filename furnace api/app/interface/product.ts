export type ProductPictureType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

export interface ProductDetails {
  valueCurrency: 'AUD';
  includeInRevenue: boolean;
  note: string;
  stock: number;
  initialStock?: number;
  manufacturingCostCents: number | null;
  packagingCostCents: number | null;
  shippingCostCents: number | null;
  saleValueCents: number | null;
  description: string;
}

export interface ProductPictureDetails {
  title?: string;
  note?: string;
}

export interface ProductGalleryPicture extends ProductPictureDetails {
  id: string;
  type: ProductPictureType;
}

export interface ProductRecord extends ProductDetails {
  stockCountAt?: string;
  id: string;
  name: string;
  submittedAt: string;
  pictureType: ProductPictureType;
  pictureVersion?: string;
  mainPicturePosition?: number;
  mainPictureDetails?: ProductPictureDetails;
  pictureMetadataVersion?: string;
  gallery: ProductGalleryPicture[];
}

export interface ProductImageUpload {
  bytes: Buffer;
  type: ProductPictureType;
}

export interface ProductPictureSelection {
  mainIndex: number;
  expected?: string;
  pictures: { id: string; image?: ProductImageUpload; details: ProductPictureDetails }[];
}

export interface ProductPictureChanges {
  gallery: ProductGalleryPicture[];
  uploads: (ProductGalleryPicture & ProductImageUpload)[];
  removed: ProductGalleryPicture[];
  mainPicturePosition: number;
  mainPictureDetails?: ProductPictureDetails;
  replacement?: ProductImageUpload;
}

export interface ProductDocumentPicture extends ProductPictureDetails {
  name: string;
  main: boolean;
}
