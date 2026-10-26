import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { CloseIcon } from './icons';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Pinned under the scrolling content (for the main action). */
  footer?: ReactNode;
  /** When false the sheet cannot be dismissed by the backdrop, the Escape key, or dragging. */
  dismissible?: boolean;
}

const CLOSE_MS = 220;

/** Bottom sheet: slides up over the app, closes on backdrop tap, Escape, the close button, or a downward drag. */
export function Sheet({ open, onClose, title, children, footer, dismissible = true }: Props) {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const [drag, setDrag] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ y0: number; t0: number; dy: number } | null>(null);
  const returnFocus = useRef<Element | null>(null);

  useEffect(() => {
    if (open) {
      returnFocus.current = document.activeElement;
      setMounted(true);
      setClosing(false);
      setDrag(0);
      return;
    }
    if (!mounted) return;
    setClosing(true);
    const id = window.setTimeout(() => {
      setMounted(false);
      setClosing(false);
      if (returnFocus.current instanceof HTMLElement) returnFocus.current.focus({ preventScroll: true });
    }, CLOSE_MS);
    return () => window.clearTimeout(id);
  }, [open, mounted]);

  useEffect(() => {
    if (!mounted) return;
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = 'hidden';
    panelRef.current?.focus({ preventScroll: true });
    return () => {
      html.style.overflow = prev;
    };
  }, [mounted]);

  const request = useCallback(() => {
    if (dismissible) onClose();
  }, [dismissible, onClose]);

  useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') request();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mounted, request]);

  if (!mounted) return null;

  const onPointerDown = (e: React.PointerEvent) => {
    if (!dismissible) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { y0: e.clientY, t0: performance.now(), dy: 0 };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    d.dy = Math.max(0, e.clientY - d.y0);
    setDrag(d.dy);
  };
  const onPointerUp = () => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    const velocity = d.dy / Math.max(1, performance.now() - d.t0);
    if (d.dy > 120 || (d.dy > 40 && velocity > 0.6)) onClose();
    else setDrag(0);
  };

  return (
    <div className={`sheet-root${closing ? ' closing' : ''}`}>
      <div className="sheet-backdrop" onClick={request} />
      <div
        ref={panelRef}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        style={drag > 0 ? { transform: `translateY(${drag}px)`, transition: 'none' } : undefined}
      >
        <div
          className="sheet-grab"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <span className="sheet-handle" aria-hidden="true" />
        </div>
        <header className="sheet-head">
          <h2>{title}</h2>
          {dismissible && (
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
              <CloseIcon size={18} />
            </button>
          )}
        </header>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>
  );
}
