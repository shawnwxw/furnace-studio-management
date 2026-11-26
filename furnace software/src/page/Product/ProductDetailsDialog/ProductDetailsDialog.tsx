import { useEffect, useId, useRef, useState } from 'react';
import { closeDialogOnBackdrop } from '../../../common/dialogBackdrop';
import { formatAustralianDollars } from '../../../formatAustralianDollars';
import type { ProductDetailsDialogProps, ProductPicturePreview } from '../../../interface/product';
import ProductDownloadButton, { useProductDownload } from '../ProductDownloadButton/ProductDownloadButton';
import ProductValueSummary from '../ProductValueSummary/ProductValueSummary';
import { productPictureUrl } from '../productData';
import '../../Plan/Plan.css';
import '../Product.css';

// Shows the same read-only product record and gallery from Home and Product.
export default function ProductDetailsDialog({ product: viewProduct, onClose }: ProductDetailsDialogProps) {
  const viewRef = useRef<HTMLDialogElement>(null);
  const previewRef = useRef<HTMLDialogElement>(null);
  const [previewPicture, setPreviewPicture] = useState<ProductPicturePreview | null>(null);
  const viewTitleId = useId();
  const previewTitleId = useId();
  const { downloading, downloadPictures, resetDownload } = useProductDownload();

  useEffect(() => {
    const dialog = viewRef.current;
    if (viewProduct && dialog && !dialog.open) dialog.showModal();
  }, [viewProduct]);

  // Opens a picture over the details dialog and returns focus to the gallery when closed.
  function openPicture(url: string, label: string) {
    setPreviewPicture({ url, label });
    previewRef.current?.showModal();
  }

  return (
    <div className="plan-page product-dialogs">
      <dialog className="plan-dialog product-preview" ref={viewRef} aria-labelledby={viewTitleId}
        onClick={closeDialogOnBackdrop}
        onClose={() => {
          resetDownload();
          onClose();
        }}>
        <header>
          <div className="product-preview-title-actions">
            <h2 id={viewTitleId}>{viewProduct?.name ?? 'Product details'}</h2>
            {viewProduct && <ProductDownloadButton product={viewProduct} disabled={downloading} onDownload={downloadPictures} />}
          </div>
          <button type="button" autoFocus onClick={() => viewRef.current?.close()}>Close</button>
        </header>
        {viewProduct && <>
          <div className="product-view-summary">
            <div>
              <time dateTime={viewProduct.submittedAt}>Added {new Date(viewProduct.submittedAt).toLocaleString([], {
                dateStyle: 'medium', timeStyle: 'short',
              })}</time>
              <dl className="product-attributes">
                <dt>Initial stock</dt><dd>{(viewProduct.initialStock ?? viewProduct.stock).toLocaleString()}</dd>
                <dt>Current stock</dt><dd>{viewProduct.stock.toLocaleString()}</dd>
                <dt>Remaining value in stock</dt>
                <dd>{viewProduct.saleValueCents == null ? '—'
                  : formatAustralianDollars(BigInt(viewProduct.stock) * BigInt(viewProduct.saleValueCents))}</dd>
                <dt>Description</dt><dd>{viewProduct.description || 'No description'}</dd>
                {viewProduct.note && <><dt>Note</dt><dd>{viewProduct.note}</dd></>}
              </dl>
              <ProductValueSummary values={viewProduct} />
            </div>
            <div>
              <button type="button" className="product-main-picture" aria-haspopup="dialog" aria-label="Zoom in on main picture"
                onClick={() => openPicture(productPictureUrl(viewProduct), viewProduct.mainPictureDetails?.title || 'Main picture')}>
                <img src={productPictureUrl(viewProduct)} alt="" />
                <span>{viewProduct.mainPictureDetails?.title || 'Main picture'}</span>
              </button>
              {viewProduct.mainPictureDetails?.note && <p className="product-picture-note">{viewProduct.mainPictureDetails.note}</p>}
            </div>
          </div>
          {!!viewProduct.gallery?.length && <>
            <h3>Gallery</h3>
            <ul className="product-gallery">
              {viewProduct.gallery.map((picture, index) => {
                const url = productPictureUrl(viewProduct, picture.id);
                const label = picture.title || `Gallery picture ${index + 1}`;
                return (
                  <li key={picture.id}>
                    <button type="button" aria-haspopup="dialog" aria-label={`Zoom in on ${label.toLowerCase()}`}
                      onClick={() => openPicture(url, label)}>
                      <img src={url} alt="" loading="lazy" />
                      <span>{label}</span>
                    </button>
                    {picture.note && <p className="product-picture-note">{picture.note}</p>}
                  </li>
                );
              })}
            </ul>
          </>}
        </>}
      </dialog>
      <dialog className="plan-dialog product-preview" ref={previewRef} aria-labelledby={previewTitleId}
        onClick={closeDialogOnBackdrop}
        onClose={() => setPreviewPicture(null)}>
        <header>
          <h2 id={previewTitleId}>{previewPicture?.label ?? 'Product picture'}</h2>
          <button type="button" autoFocus onClick={() => previewRef.current?.close()}>Close</button>
        </header>
        {previewPicture && <img src={previewPicture.url} alt={previewPicture.label} />}
      </dialog>
    </div>
  );
}
