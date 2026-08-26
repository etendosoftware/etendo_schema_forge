import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/**
 * Floating, viewport-fixed bulk-selection toolbar (ETP-4972).
 *
 * Portaled to `document.body` with TRUE `position: fixed` coordinates
 * (bottom-center of the viewport) — never anchored to a measured DOM rect.
 * The previous implementation (`LinesSelectionBar`, now a thin re-export
 * shim of this file) computed `top`/`left` from `getBoundingClientRect()`
 * on a sentinel placed at the end of a scrollable list; once that list grew
 * tall enough for the sentinel to scroll off-screen, the "fixed" bar
 * rendered off-screen too. This component owns its position outright so
 * that bug class cannot recur.
 *
 * Deliberately a dumb positioning/chrome "shell", not a data-driven
 * `actions[]` API:
 *   - portal to `document.body`
 *   - true viewport-fixed placement
 *   - the dark-pill visual chrome (background, radius, box-shadow, enter/
 *     exit slide animation)
 *   - a trailing close (`X`) button that calls `onClose`
 *
 * Everything else — the selection counter, action buttons, a destructive
 * "Eliminar" button — is rendered by the caller as plain `children`; this
 * component does not know or care what they are. Pass your content as
 * top-level groups (e.g. one element for the counter, one for the action
 * buttons) — the `divide-x` rule on the inner row draws a 1px divider
 * between each top-level group automatically, matching the segmented
 * "Floating Toolbar | Dark" Figma component (counter | actions | Eliminar | X).
 *
 * Props:
 *   visible     — mount/show the portal (caller gates by selection length)
 *   closing     — drives the slide-out animation class
 *   onClose     — trailing X button handler (clear selection / hide bar)
 *   closeTitle  — tooltip for the X button
 *   children    — the bar's middle content (counter + action buttons)
 */
export default function SelectionToolbar({ visible, closing, onClose, closeTitle, children }) {
  if (!visible) return null;

  return createPortal(
    <div
      className="pointer-events-none fixed z-50"
      style={{ bottom: 24, left: '50%', transform: 'translateX(-50%)' }}
    >
      <div
        className={[
          'pointer-events-auto flex items-center rounded-full',
          'divide-x divide-[hsl(var(--floating-toolbar-fg)/0.12)] [&>*+*]:pl-3',
          'bg-[hsl(var(--floating-toolbar-bg))] text-[hsl(var(--floating-toolbar-fg))]',
          'py-2 pl-4 pr-2',
          closing ? 'lines-bar-dismiss' : 'lines-bar-appear',
        ].join(' ')}
        style={{ boxShadow: '0px 10px 30px hsl(var(--scrim) / 0.35), 0px 2px 8px hsl(var(--scrim) / 0.2)' }}
      >
        {children}
        <button
          type="button"
          onClick={onClose}
          title={closeTitle}
          aria-label={closeTitle}
          className="flex h-8 w-8 items-center justify-center rounded-full text-[hsl(var(--floating-toolbar-muted))] transition-colors hover:bg-[hsl(var(--floating-toolbar-fg)/0.1)] hover:text-[hsl(var(--floating-toolbar-fg))]"
        >
          <X className="h-4 w-4" data-testid="SelectionToolbar__close" />
        </button>
      </div>
    </div>,
    document.body,
  );
}
