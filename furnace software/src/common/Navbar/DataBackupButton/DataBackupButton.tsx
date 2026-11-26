import { useRef, useState } from 'react';
import InfoTooltip from '../../InfoTooltip/InfoTooltip';
import { usePopups } from '../../Popup/PopupProvider';
import { apiUrl } from '../../../dataService';

// Download the API archive and keep the current page open if the request fails.
export default function DataBackupButton() {
  const { confirm, showMessage } = usePopups();
  const pending = useRef(false);
  const [downloading, setDownloading] = useState(false);

  async function downloadBackup() {
    if (pending.current) return;
    pending.current = true;
    try {
      const confirmed = await confirm({
        title: 'Download data backup',
        message: 'Download the full Furnace Studio data folder as a ZIP file?',
        confirmLabel: 'Download',
      });
      if (!confirmed) return;
      setDownloading(true);
      const response = await fetch(apiUrl('data-backup'));
      if (!response.ok || response.headers.get('Content-Type') !== 'application/zip') {
        throw new Error('Data backup unavailable');
      }
      const filename = /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') ?? '')?.[1] ?? 'furnace-data.zip';
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch {
      showMessage({ title: 'Backup unavailable', message: 'Could not download the data backup. Try again.' });
    } finally {
      pending.current = false;
      setDownloading(false);
    }
  }

  return (
    <InfoTooltip label={downloading ? 'Preparing data backup' : 'Download data backup'}
      message="Download the full Furnace Studio data folder as a ZIP file."
      opensDialog
      onActivate={() => void downloadBackup()}>
      <svg className="navbar__backup-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4" />
      </svg>
    </InfoTooltip>
  );
}
