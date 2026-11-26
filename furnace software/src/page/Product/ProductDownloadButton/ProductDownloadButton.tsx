import { useEffect, useRef, useState } from 'react';
import type { ProductDownloadButtonProps, ProductRecord } from '../../../interface/product';
import { usePopups } from '../../../common/Popup/PopupProvider';
import { productArchiveInfo, productArchiveUrl } from '../productData';

// Shares the ZIP size check, confirmation, and download across both entry points.
export function useProductDownload() {
  const { confirm, showMessage } = usePopups();
  const pending = useRef<AbortController | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => () => pending.current?.abort(), []);

  // Cancels the size request when the details dialog closes.
  function resetDownload() {
    pending.current?.abort();
    pending.current = null;
    setDownloading(false);
  }

  // Confirm the archive size before handing the download off to the browser.
  async function downloadPictures(product: ProductRecord) {
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setDownloading(true);
    try {
      const { byteCount } = await productArchiveInfo(product, controller.signal);
      if (controller.signal.aborted) return;
      if (!Number.isSafeInteger(byteCount) || byteCount <= 0) throw new Error('Download size unavailable');
      const size = byteCount >= 1_000_000
        ? `${(byteCount / 1_000_000).toFixed(1)} MB (${byteCount.toLocaleString()} bytes)`
        : `${byteCount.toLocaleString()} bytes`;
      const confirmed = await confirm({
        title: 'Download product ZIP',
        message: `Download the pictures and product details for “${product.name}” (${size})?`,
        confirmLabel: 'Download',
      });
      if (!confirmed || controller.signal.aborted) return;
      const link = document.createElement('a');
      link.href = productArchiveUrl(product);
      link.download = '';
      document.body.append(link);
      link.click();
      link.remove();
    } catch {
      if (!controller.signal.aborted) {
        showMessage({ title: 'Download unavailable', message: 'Could not prepare the product ZIP. Try again.' });
      }
    } finally {
      if (pending.current === controller) {
        pending.current = null;
        if (!controller.signal.aborted) setDownloading(false);
      }
    }
  }

  return { downloading, downloadPictures, resetDownload };
}

// Provides a consistent download icon and accessible label.
export default function ProductDownloadButton({ product, disabled, onDownload }: ProductDownloadButtonProps) {
  return (
    <button type="button" className="product-icon" disabled={disabled}
      onClick={() => onDownload(product)}
      aria-label={`Download pictures and details for ${product.name} as a ZIP`} title="Download product ZIP">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4" />
      </svg>
    </button>
  );
}
