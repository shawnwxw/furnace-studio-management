import { useEffect, useState } from 'react';
import TrashIcon from '../../../common/TrashIcon/TrashIcon';
import type { ProductPictureTileProps } from '../../../interface/product';

// Uses the saved URL or a temporary local preview for an image waiting to be uploaded.
export default function ProductPictureTile({
  picture, main, busy, dragged, onEdit, onSetMain, onRemove, onDrag, onDrop, onDragEnd, onMove,
}: ProductPictureTileProps) {
  const [localUrl, setLocalUrl] = useState('');
  useEffect(() => {
    if (!picture.file) return;
    const url = URL.createObjectURL(picture.file);
    setLocalUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [picture.file]);

  const url = picture.url ?? localUrl;
  return (
    <li className="product-picture-tile" data-dragging={dragged}
      onDragOver={event => {
        if (busy || main || !event.dataTransfer.types.includes('application/x-product-picture')) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
      }}
      onDrop={event => {
        if (!event.dataTransfer.types.includes('application/x-product-picture')) return;
        event.preventDefault();
        onDrop();
      }}>
      <div className="product-tile-image">
        <button type="button" className="product-edit-picture" aria-haspopup="dialog"
          aria-label={`Edit details for ${picture.label}`} aria-description={main ? undefined : 'Drag or use arrow keys to reorder'}
          title={main ? 'Edit main picture details' : 'Click to edit. Drag to reorder.'} draggable={!main && !busy && Boolean(url)}
          disabled={busy || !url} onClick={() => onEdit(url)}
          onDragStart={event => {
            event.dataTransfer.setData('application/x-product-picture', picture.id);
            event.dataTransfer.effectAllowed = 'move';
            onDrag();
          }}
          onDragEnd={onDragEnd}
          onKeyDown={event => {
            if (main || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
            event.preventDefault();
            onMove(event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1);
          }}>
          {url && <img src={url} alt="" draggable={false} />}
        </button>
        {main && <span className="product-tile-crown" title="Main picture" aria-hidden="true">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m3 7 4.5 4L12 4l4.5 7L21 7l-2 11H5L3 7Z" />
          </svg>
        </span>}
        <button type="button" className="product-icon product-trash product-tile-remove"
          aria-label={`Remove ${picture.label}`} title="Remove picture" disabled={busy} onClick={onRemove}>
          <TrashIcon />
        </button>
      </div>
      <span className="product-upload-name">{picture.title || picture.label}</span>
      <label>
        <input type="checkbox" checked={main} disabled={busy} onChange={onSetMain}
          aria-label={`Use ${picture.label} as the main picture`} />
        Main picture
      </label>
    </li>
  );
}
