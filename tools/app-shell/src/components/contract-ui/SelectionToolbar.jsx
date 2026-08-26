import { Children, Fragment } from 'react';
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
 *   - a 1px divider drawn after every top-level child (including before the
 *     close button)
 *   - a trailing close (`X`) button that calls `onClose`
 *
 * Everything else — the selection counter, action buttons, a destructive
 * "Eliminar" button — is rendered by the caller as plain `children`; this
 * component does not know or care what they are. Pass your content as
 * top-level groups (e.g. one element for the counter, one for the action
 * buttons) — a dedicated divider element is rendered after each one,
 * matching the segmented "Floating Toolbar | Dark" Figma component
 * (counter | actions | Eliminar | X).
 *
 * Divider implementation note (ETP-4972 review round): the first cut used
 * Tailwind's `divide-x`/`divide-color`, which sets `border-left` directly on
 * each child. Confirmed via live DOM inspection that this DID apply (correct
 * width/color/padding), but it was invisible in practice for two reasons:
 * (1) the color was too faint (`/0.12` alpha blends to only a ~28/255
 * channel lift over the dark pill background) and (2) worse, on any child
 * that already has its own `border` (e.g. the hand-styled destructive
 * "Eliminar" buttons used at every call site), `border-left` from divide-x
 * silently overwrote that child's own left-edge border color — the divider
 * was fighting the child's own box model instead of sitting independently
 * between two boxes. Rendering the divider as its own dedicated element
 * (below) sidesteps both problems: guaranteed-visible contrast, and no
 * interaction with whatever the caller's content already draws.
 *
 * Contrast fix (ETP-4972 review round) — callers commonly inject a shared
 * shadcn `<Button>` (ListView's Print/Clone/Delete, `bulkActions`,
 * `selectionBarRightActions`) as children. That component's `default`/
 * `outline` variants assume a light card/page background (`bg-primary`,
 * `bg-background`, `border-input`), which either collapses into the pill's
 * own background (`--primary` === `--floating-toolbar-bg` in light theme,
 * literally) or renders as a near-white chip — both unreadable against the
 * dark pill. Rather than patch every call site's className, the `.selection-
 * toolbar` class below scopes a CSS override (in index.css) keyed off those
 * exact shadcn variant classes, so ANY caller's <Button> reads correctly for
 * free. Hand-styled buttons (e.g. the explicit `text-destructive` ones this
 * file's own callers already use) don't carry those classes and are
 * untouched by it.
 *
 * Figma Dev Mode measurement round (ETP-4972, second pass) — the coordinator
 * pulled exact values off the live "Floating Toolbar | Dark" component:
 *   - Radius: `radius/md` = 7px flat, NOT a stadium/pill shape. Measured off
 *     the close button's own corner radius (it's the rightmost segment, so
 *     it inherits the outer frame's corner rounding on its right side).
 *   - Outer frame `Gap: spacing/0` — zero gap between top-level children;
 *     all visual spacing comes from each segment's own padding, not from
 *     margin/gap at the container level. This is why the divider carries no
 *     `mx-*` and the container itself carries no vertical/right padding
 *     anymore — the close button and divider now reach the frame's own
 *     edges and rely on self-stretch to fill it, matching Figma's
 *     `height: Fill` on the divider and `Hug(48)×Hug(38)` on the close
 *     button.
 *
 * Props:
 *   visible     — mount/show the portal (caller gates by selection length)
 *   closing     — drives the slide-out animation class
 *   onClose     — trailing X button handler (clear selection / hide bar)
 *   closeTitle  — tooltip for the X button
 *   children    — the bar's middle content (counter + action buttons)
 */
function SelectionToolbarDivider() {
  return (
    <span
      aria-hidden="true"
      // `self-stretch` (not a fixed h-* + self-center) so this fills the
      // row's full cross-axis height regardless of which sibling ends up
      // tallest — matches Figma's `height: Fill`. Figma's own outer frame
      // gap is 0 (each Button-type segment there carries its own horizontal
      // padding baked in), but the plain-text counter segment every caller
      // passes here has none of its own — so the divider needs `mx-2` itself
      // or it sits flush against the counter text (ETP-4972 live-QA finding).
      // Reuses --floating-toolbar-fg (near-white, 210 20% 98%) instead of a
      // literal #FFFFFF — visually indistinguishable and keeps this on the
      // existing theme-invariant token instead of a new hardcoded literal.
      className="mx-2 w-px shrink-0 self-stretch bg-[hsl(var(--floating-toolbar-fg)/0.2)]"
    />
  );
}

export default function SelectionToolbar({ visible, closing, onClose, closeTitle, children }) {
  if (!visible) return null;

  // One divider after every top-level segment the caller passed, plus one
  // more before the built-in close button — see the divider implementation
  // note above for why this isn't done via divide-x on the children instead.
  const segments = Children.toArray(children).filter(Boolean);

  return createPortal(
    <div
      className="pointer-events-none fixed z-50"
      style={{ bottom: 24, left: '50%', transform: 'translateX(-50%)' }}
    >
      <div
        className={[
          'selection-toolbar',
          // radius/md = 7px flat (Figma Dev Mode measurement off the close
          // button's own corner), not a stadium/pill — see file header note.
          // h-[38px] fixed (Figma's own measured height) rather than letting
          // whichever child happens to be tallest decide it — callers differ
          // (ListView's counter row is h-10, DetailView's plain-text counter
          // has no explicit height), so without a fixed height here the pill
          // itself came out a visibly different size depending on which
          // screen it was on (ETP-4972 live-QA finding).
          'pointer-events-auto flex h-[38px] items-center rounded-[7px]',
          'bg-[hsl(var(--floating-toolbar-bg))] text-[hsl(var(--floating-toolbar-fg))]',
          // No vertical/right padding here anymore: the close button now
          // owns its own py-[7px]/pr-3 and is flush against the frame's
          // right/top/bottom edges so its rounded-r-[7px] lines up exactly
          // with this container's own rounded-[7px] corner (Figma's
          // zero-gap outer frame). pl-4 is kept — no Figma spec overrides
          // the leftmost segment's own left inset, and no segment supplies
          // its own left padding to replace it.
          'pl-4',
          closing ? 'lines-bar-dismiss' : 'lines-bar-appear',
        ].join(' ')}
        style={{ boxShadow: '0px 10px 30px hsl(var(--scrim) / 0.35), 0px 2px 8px hsl(var(--scrim) / 0.2)' }}
      >
        {segments.map((segment, i) => (
          <Fragment key={i}>
            {segment}
            <SelectionToolbarDivider />
          </Fragment>
        ))}
        <button
          type="button"
          onClick={onClose}
          title={closeTitle}
          aria-label={closeTitle}
          // Fills the pill's full height (self-stretch, not a small fixed
          // square) and only rounds its right corners — it's the rightmost
          // segment, flush against the frame edge, so its rounding is what
          // forms the outer pill's right corner. Padding is Figma's own
          // measured 7px top/bottom, 12px right, 4px left (asymmetric: the
          // divider immediately to its left already provides the visual
          // separation, so the icon doesn't need as much breathing room on
          // that side).
          className="flex items-center justify-center self-stretch rounded-r-[7px] py-[7px] pl-1 pr-3 text-[hsl(var(--floating-toolbar-muted))] transition-colors hover:bg-[hsl(var(--floating-toolbar-fg)/0.1)] hover:text-[hsl(var(--floating-toolbar-fg))]"
        >
          {/* ~12.5px per Figma (icon/outline/secondary, 50%-opacity white) —
              Tailwind has no exact class for a half-pixel size, so this is
              an arbitrary value. Color: kept on --floating-toolbar-muted
              (already a close visual match) rather than introducing a new
              hardcoded white/50% literal — see PR notes. */}
          <X className="h-[13px] w-[13px]" data-testid="SelectionToolbar__close" />
        </button>
      </div>
    </div>,
    document.body,
  );
}
