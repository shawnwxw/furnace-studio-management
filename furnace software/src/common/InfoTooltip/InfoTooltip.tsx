import { useEffect, useId, useState } from 'react';
import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { InfoTooltipProps } from '../../interface/tooltip';
import './InfoTooltip.css';

// Render above scrollable tables so their overflow does not clip the help text.
export default function InfoTooltip({ label, message, children, onActivate, opensDialog, controls }: InfoTooltipProps) {
  const id = useId();
  const [position, setPosition] = useState<{ host: HTMLElement; style: CSSProperties } | null>(null);

  useEffect(() => {
    if (!position) return;
    const hide = () => setPosition(null);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, [position]);

  function show(trigger: HTMLButtonElement) {
    const bounds = trigger.getBoundingClientRect();
    const halfWidth = Math.min(144, window.innerWidth / 2 - 12);
    setPosition({
      // Tooltips triggered inside a modal must render in its top layer.
      host: trigger.closest('dialog[open]') ?? document.body,
      style: {
        left: Math.max(halfWidth + 12, Math.min(bounds.left + bounds.width / 2, window.innerWidth - halfWidth - 12)),
        top: bounds.top < 80 ? bounds.bottom + 6 : bounds.top - 6,
        transform: bounds.top < 80 ? 'translateX(-50%)' : undefined,
      },
    });
  }

  return <>
    <button type="button" className="info-tooltip-trigger" aria-label={label} aria-describedby={id}
      aria-haspopup={opensDialog ? 'dialog' : undefined} aria-controls={controls}
      onMouseEnter={event => show(event.currentTarget)}
      onMouseLeave={event => { if (document.activeElement !== event.currentTarget) setPosition(null); }}
      onFocus={event => show(event.currentTarget)} onBlur={() => setPosition(null)}
      onClick={event => {
        if (onActivate) {
          setPosition(null);
          onActivate();
        } else show(event.currentTarget);
      }}
      onKeyDown={event => { if (event.key === 'Escape') setPosition(null); }}>
      {children ?? <span aria-hidden="true">ⓘ</span>}
    </button>
    {createPortal(
      <span id={id} className="info-tooltip-text" role="tooltip" hidden={!position} style={position?.style}>
        {message}
      </span>, position?.host ?? document.body,
    )}
  </>;
}
