import { createPortal } from 'react-dom';
import { Trash2, X } from 'lucide-react';

/**
 * Floating selection toolbar shown while one or more rows are checked in an
 * inline-editable lines table. Portaled to <body> with `position: fixed`
 * coordinates taken from `barRect` so the downward shadow is never clipped
 * by an ancestor `overflow-auto`.
 *
 * The bar overlays the "+ Añadir línea" wrapper measured upstream. Layout
 * (size, position, animation direction) is owned by the caller — this
 * component only knows how to render the bar's content.
 *
 * Props:
 *   visible        — show/hide the portal (caller already gated by selection length)
 *   closing        — drives the slide-out animation class
 *   barRect        — { top, left, width, height } from getBoundingClientRect
 *   count          — selected row count
 *   totalLabel     — optional pre-formatted total string ("25.30 EUR"). null hides the line.
 *   selectedLabel  — i18n string for "{n} Selected"
 *   deleting       — busy flag for the delete button
 *   onDelete       — confirm + bulk delete handler
 *   onClose        — clear-selection handler
 *   deleteTitle    — tooltip for trash button
 *   closeTitle     — tooltip for X button
 */
export default function LinesSelectionBar({
  visible,
  closing,
  barRect,
  count,
  totalLabel,
  selectedLabel,
  deleting,
  onDelete,
  onClose,
  deleteTitle,
  closeTitle,
  compact = false,
}) {
  if (!visible || !barRect) return null;

  // Compact mode shrinks the action buttons so the bar can sit over the
  // taller-than-the-button toolbars (e.g. secondary tab AddLineButton, which
  // has no surrounding padding so the wrapper is ~36 px tall instead of ~56).
  const btnSize = compact ? 28 : 40;
  const trashIcon = compact ? 14 : 18;
  const closeIcon = compact ? 16 : 20;
  const labelFontSize = compact ? 14 : 16;
  const labelLineHeight = compact ? '20px' : '24px';

  return createPortal(
    <div
      className="z-50 pointer-events-none"
      style={{
        position: 'fixed',
        top: barRect.top,
        left: barRect.left,
        width: barRect.width,
        height: barRect.height,
      }}
    >
      <div
        className={`pointer-events-auto h-full ${closing ? 'lines-bar-dismiss' : 'lines-bar-appear'}`}
        style={{
          background: '#FFFFFF',
          boxShadow: '0px 10px 15px -3px rgba(18,18,23,0.08), 0px 4px 6px -2px rgba(18,18,23,0.05)',
          padding: 8,
        }}
      >
        <div className="flex items-center justify-between h-full">
          <div className="flex flex-col items-start pl-1">
            <span style={{ fontFamily: 'Inter', fontSize: labelFontSize, fontWeight: 600, lineHeight: labelLineHeight, color: '#121217' }}>
              {selectedLabel}
            </span>
            {totalLabel != null && (
              <span style={{ fontFamily: 'Inter', fontSize: 12, fontWeight: 400, lineHeight: '16px', color: '#121217' }}>
                {totalLabel}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={deleting}
              title={deleteTitle}
              onClick={onDelete}
              className="bg-white hover:bg-[#FEF0F4] disabled:opacity-50 transition-colors"
              style={{
                width: btnSize,
                height: btnSize,
                border: '1px solid #FBB1C4',
                boxShadow: '0px 1px 2px rgba(18,18,23,0.05)',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Trash2
                style={{ width: trashIcon, height: trashIcon, color: '#F3164E' }}
                data-testid="Trash2__220f68" />
            </button>
            <button
              type="button"
              title={closeTitle}
              onClick={onClose}
              className="transition-colors hover:bg-[#F5F7F9]"
              style={{
                width: btnSize,
                height: btnSize,
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: 'none',
              }}
            >
              <X
                style={{ width: closeIcon, height: closeIcon, color: '#828FA3' }}
                data-testid="X__220f68" />
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
