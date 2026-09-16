import React, { useState, useMemo, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { createPortal } from 'react-dom';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, Inbox, X, Trash2, Copy, Loader2, Pencil, Check, ArrowUpRight } from 'lucide-react';
import { toast } from 'sonner';
import { useLabel, useUI, useLocale, useMenuLabel, useLocaleSwitch } from '@/i18n';
import { buildUrlWithParams } from '@/lib/buildUrlWithParams.js';
import { getCatalogOptions } from '@/lib/selectorCatalog.js';
import { resolveIdentifier } from '@/lib/resolveIdentifier.js';
import { resolveColumnLabel } from '@/lib/resolveColumnLabel.js';
import { formatCurrency } from '@/lib/formatCurrency.js';
import { resolveRowCurrency } from '@/lib/rowCurrency.js';
import { useCurrency } from '@/hooks/useCurrency.jsx';
import { applyCalloutUpdates } from '@/lib/applyCalloutUpdates.js';
import { columnMinWidthPx, columnFlex, isLineGridColumn } from '@/lib/linesColumnWidth.js';
import { CHEVRON_COLUMN_WIDTH, renderBalanceFooterRow, buildLineCellStyle } from './InlineLinesPanel.jsx';
import { ACTION_SLOT_WIDTH_PX, reservesActionSlot } from '@/lib/linesActionSlot.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DateField } from '@/components/ui/date-field';
import { CELL_RENDERERS } from './DataTable.cellRenderers.jsx';
import { resolveFkNavigation } from './fkNavigation.js';
import { getEmailFieldError, getPhoneFieldError, getWebsiteFieldError } from './recipientEdits.js';
import { getContactsTextFieldError, filterContactsInputValue } from './contactsFieldValidation.js';
import { isCapabilityVisible } from '@/lib/capabilityVisibility.js';
import { useCapabilitiesSafe } from '@/hooks/useCapabilitiesSafe.js';
import { parseBackendErrorMessage, translateBackendError } from '@/lib/backendErrors.js';
import { MaskedAmountInput } from '@/components/forms/fields.jsx';
import { NUMERIC_FIELD_TYPES, TWO_DECIMAL_FIELD_TYPES } from '@/lib/numericFieldTypes.js';
import { parseLocaleNumber } from '@/lib/parseLocaleNumber.js';

// ETP-5268 — pixel geometry of one canonical RowQuickActions button, mirrored
// from its own className (`h-10 px-3` container, `gap-0.5` between `h-8 w-8`
// buttons) — used below to size the reserved column to the buttons THIS
// window's `rowQuickActions` will actually render, not a fixed worst-case.
const QUICK_ACTIONS_BUTTON_PX = 32;
const QUICK_ACTIONS_GAP_PX = 2;
const QUICK_ACTIONS_CONTAINER_PADDING_PX = 24; // px-3 on both sides

// ETP-5268 — counts the canonical buttons RowQuickActions will render for
// ANY row of this window, from the same `rowQuickActions` config DataTable
// already has — mirrors RowQuickActions' own gates (readOnly hides Edit/
// Clone/Delete; Email needs documentPreview or an enabled sendDocument;
// the kebab needs a non-empty menuActions array, or a function since we
// can't know statically whether it'll produce items for the current row).
// Deliberately ignores the remaining PER-ROW gates (`visibleWhen`,
// `hideDeleteWhenComplete`/`statusField` on Delete) — those can only ever
// HIDE a button on a given row, never add one beyond this static maximum,
// and every row in one column must share a single width, so sizing off the
// per-window maximum is the safe (if occasionally slightly generous) choice.
function estimateQuickActionsButtonCount(rowQuickActions) {
  if (!rowQuickActions) return 0;
  const readOnly = !!rowQuickActions.readOnly;
  const hasEmail = rowQuickActions.sendDocument
    ? rowQuickActions.sendDocument.enabled !== false
    : !!rowQuickActions.documentPreview;
  const hasMenu = typeof rowQuickActions.menuActions === 'function'
    || (Array.isArray(rowQuickActions.menuActions) && rowQuickActions.menuActions.length > 0);
  return (readOnly ? 0 : 1) // Edit
    + (!readOnly && rowQuickActions.onClone ? 1 : 0) // Clone
    + (hasEmail ? 1 : 0)
    + (hasMenu ? 1 : 0)
    + (!readOnly && !rowQuickActions.hideDeleteButton ? 1 : 0); // Delete
}

// ETP-5268 — reserved width (px) for the quick-actions cell — always
// applied now (see quickActionsColumnStyle), exactly enough for THIS
// window's own button count, not a fixed worst-case guess — a window with
// only Edit + Delete (2 buttons) no longer reserves room for 5. Returns 0
// when nothing will render (isQuickActionsEnabled already skips the column
// entirely in that case, via estimateQuickActionsButtonCount agreeing there
// are 0 buttons — see its readOnly-with-no-email/menu branch there).
// RowQuickActions itself stays `position: absolute` in every case (never
// affects row height — see its own className comment), so this cell needs an
// explicit CSS `width` regardless: an unconstrained cell would collapse to
// ~0 since absolutely positioned content contributes nothing to intrinsic
// sizing. Applied as an inline style (not a Tailwind class) because the
// value is computed per-window, not one of a small static set Tailwind's
// build-time scanner could pick up from a literal class string.
function quickActionsReservedWidthPx(rowQuickActions) {
  const count = estimateQuickActionsButtonCount(rowQuickActions);
  if (count <= 0) return 0;
  return count * QUICK_ACTIONS_BUTTON_PX
    + Math.max(count - 1, 0) * QUICK_ACTIONS_GAP_PX
    + QUICK_ACTIONS_CONTAINER_PADDING_PX;
}

// ETP-5268 — the quick-actions column is ALWAYS rendered at its own full
// reserved width (quickActionsReservedWidthPx), and sits in NORMAL TABLE
// FLOW by default — not sticky, never floats or pins to the scroll
// container's edge on its own. Earlier revisions tried two other approaches
// here: (1) the column stayed pinned narrow while scrolling then widened
// back to full width at the true end — went through three separate
// live-verified flicker/dead-zone bugs, all variants of the same root
// cause: that design changed the table's own rendered WIDTH in reaction to
// scroll state, which the very scroll-state detection then re-measured — a
// circular dependency ("se va y viene") that resurfaced in a new shape
// every time the previous shape got patched; (2) `position: sticky; right:
// 0` UNCONDITIONALLY, the classic "frozen last column" spreadsheet pattern,
// kept the layout-width problem from (1) from recurring but traded it for a
// DIFFERENT one: a sticky column has no idea how much of the real data
// column it's currently floating over is actually still off-screen, so it
// always painted its own full reserved width over whatever sat underneath —
// live-verified overlapping far more of the neighboring column than was
// ever actually hidden, and doing so on every render, not just when the
// user asked for it ("se come la columna del costado ... no forma parte de
// una columna ... va con la pantalla").
//
// `group-hover/row:sticky` is the fix for both at once: `position: sticky`
// is a pure paint-time effect (never touches the table's LAYOUT width — see
// (1) above), and gating it behind `group-hover` means the pinning/
// floating-over-data effect from the original design ("los botones
// superpuestos ... al final a la derecha de la vista") is back, but ONLY
// while the user is actively hovering that row. Outside a hover, the column
// is exactly the plain in-flow column described above: never paints over
// another column's content.
//
// One thing sticky-on-its-own does NOT give us for free: it only becomes a
// true no-op at the EXACT pixel where the column's natural position already
// satisfies `right: 0` (remaining scrollable distance === 0). Short of that
// — even 1px short — sticky still pulls the column's FULL width left into a
// floating overlay, same as before: live-verified ("aun aparece el hover
// cuando ya es visible la columna, es cuando apenas es visible un pixel").
// `allowHoverSticky` is that gap's fix — computed in
// useHorizontalScrollGeometry with a small EPSILON tolerance, false once
// there's nothing MEANINGFUL left to scroll to (not literally nothing at
// all). Below that threshold this function omits `group-hover/row:sticky`
// entirely, so hovering a row whose actions column already reads as "fully
// visible" to the eye does nothing — no floating overlay for a sliver of
// remaining scroll nobody can perceive anyway.
// ETP-5268 follow-up — "se nota como una diferencia en los colores": the
// mask/background used to live on RowQuickActions' own pill (a SOLID
// `bg-muted`, needed so it can fully hide whatever real column it floats
// over while hover-sticky) — but the row's own hover tint is `bg-muted/50`,
// a translucent wash over whatever's behind it, which is a visibly LIGHTER
// gray than the same color at full strength. Since the pill is narrower
// than this cell's own reserved width, that mismatch showed up as a seam
// INSIDE one cell: the pill's solid gray next to the cell's own gutter,
// showing the lighter row tint through its (until now) transparent
// background — live-verified, two different grays side by side.
//
// The fix moves the background here, to the WHOLE cell, and only when
// hover-sticky can actually happen (`allowHoverSticky`): in that case a
// solid `bg-muted` is genuinely needed (masking real data while floating
// beats matching the row's exact tint), applied to the full cell so
// there's no narrower pill-shaped patch of a different shade inside it.
// When hover-sticky can't happen (already visible enough — see
// useHorizontalScrollGeometry), this cell has NO background of its own at
// all, at rest or on hover: it just stays transparent and lets the row's
// OWN `hover:bg-muted/50` (the exact same paint, not a copy) show through
// uniformly across the whole cell, pill included (see RowQuickActions.jsx,
// which no longer sets a background either) — pixel-identical to the rest
// of the row because it's literally the same background, not a matched one.
function quickActionsColumnClassName(extraClassName, allowHoverSticky) {
  // `relative` (not `sticky`) is the resting state — gives RowQuickActions'
  // `position: absolute` pill a containing block scoped to this cell either
  // way. `right-0`/`z-10` are harmless no-ops while merely `relative` (no
  // effect until `position` is non-static) and become load-bearing the
  // moment `group-hover/row:sticky` kicks in.
  return [
    'relative right-0 z-10',
    // Solid, not `bg-muted/50` — while floating this cell masks whatever row
    // content is scrolled underneath it, so it can't be translucent or that
    // content would show through. But a flat `bg-muted` (241/245/249) is
    // visibly darker than the row's own `hover:bg-muted/50` OVER WHITE
    // (≈248/250/252 — averaging bg-muted and white at 50/50), so the two
    // states read as different shades of grey side by side. This is that same
    // composited value, kept solid — matches the eye, still fully opaque.
    // (Literal RGB, not a token — see DATA_COLOR_LITERALS in
    // semanticThemeUsage.test.js for why this file is scoped-exempt.)
    allowHoverSticky ? 'group-hover/row:sticky group-hover/row:bg-[rgb(248,250,252)] transition-colors' : '',
    extraClassName,
  ].filter(Boolean).join(' ');
}

// ETP-5268 — see quickActionsColumnClassName just above: this is its `style`
// counterpart, carrying the one piece of per-window-computed geometry
// (quickActionsReservedWidthPx) that can't be a static Tailwind class.
function quickActionsColumnStyle(reservedWidthPx) {
  return { width: `${reservedWidthPx}px` };
}

// ETP-5268 follow-up — "el scroll horizontal no se ve, si no hasta el final
// del scroll vertical ... deberia aparecer siempre": this list's own scroll
// container has no bounded height (by design — it stays under ListView's
// default ScrollPane/infinite-scroll ownership, not `tableOwnsScroll`, so
// "load more as you near the bottom" keeps working), so with enough rows the
// <table> itself grows taller than the viewport and its native horizontal
// scrollbar — rendered at the table's own bottom edge — ends up scrolled
// off-screen until the user scrolls all the way down. Horizontal scrolling
// itself already works from anywhere via wheel/trackpad (verified live —
// this was never actually broken), but there's no visible, always-reachable
// scrollbar to grab with a mouse.
//
// Fixed with a second, thin "mirror" scrollbar — a hand-built, pointer-
// draggable thumb (see computeThumbMetrics/handleThumbPointer* below) —
// `position: sticky; bottom: 0` within DataTable's own render, so it stays
// pinned to the bottom of whichever ancestor actually scrolls vertically
// (ListView's bounded viewport) regardless of how tall the table grows.
// Deliberately NOT a `tableOwnsScroll`-style bounded-height rewrite of the
// table's own scroll container: that would require giving up (or
// reimplementing against a different scroll boundary) the "load more on
// reach bottom" pagination this window relies on for large datasets — this
// approach touches nothing about how or when data loads, purely a second
// draggable strip kept in sync with the real one.
//
// ETP-5268 follow-up — "en sales-invoice se ve mas fino": for a SHORT list
// (the real scroll wrapper's own bottom edge — and its native scrollbar —
// already sits inside the viewport, no vertical scrolling needed to reach
// it), the mirror used to hide itself and let the real wrapper's native
// scrollbar show through instead — reachable, but rendered by the browser's
// own `::-webkit-scrollbar` (this app's global 8px thumb, a different,
// lighter gray than ScrollPane's `#C1C5CF`), so short lists and long lists
// visibly disagreed on what a horizontal scrollbar looks like. The real
// wrapper's native scrollbar is now hidden unconditionally
// (`[&::-webkit-scrollbar]:hidden [scrollbar-width:none]` on the ref'd div
// below) and this hand-built thumb is the ONLY horizontal scrollbar,
// rendered any time there's overflow regardless of scroll position — one
// mechanism, one look, everywhere.
// ETP-5268 follow-up — walks up from the table's scroll wrapper to find the
// nearest ancestor that actually scrolls vertically (ListView's bounded
// viewport, `overflow-y: auto`/`scroll`) and returns ITS OWN
// `padding-bottom`. `position: sticky; bottom: 0` sticks a child to that
// ancestor's PADDING edge, not its true outer edge — so with the viewport's
// own `pb-6` (or whatever a given window's `tablePaddingBottom` sets)
// underneath it, the mirror scrollbar was sticking correctly but leaving
// that padding's worth of empty space visible below it: "el scroll esta en
// el aire ... tiene que estar abajo". Feeding this back as a NEGATIVE
// `bottom` offset on the mirror cancels exactly that gap, regardless of
// what the padding actually is for a given caller — no hardcoded px value.
function findScrollingAncestor(el) {
  let node = el?.parentElement;
  for (let i = 0; i < 12 && node; i++) {
    const overflowY = getComputedStyle(node).overflowY;
    if (overflowY === 'auto' || overflowY === 'scroll') return node;
    node = node.parentElement;
  }
  return null;
}

// ETP-5268 follow-up — "pointer-events-auto absolute right-0 cursor-grab
// touch-none rounded-full bg-[#C1C5CF] active:cursor-grabbing ... EL SCROLL
// HORIZONTAL SIGUE VIENDOSE IGUAL": the vertical scrollbar being compared
// against is never a native/webkit one — it's ScrollPane's own hand-built
// "shadow scrollbar" thumb (see schema_forge_core's scroll-pane.jsx), which
// ignores `::-webkit-scrollbar` CSS entirely. Matching its pixel dimensions
// on a real `overflow-x-auto` div can therefore never look the same, because
// the two are rendered by different mechanisms. These constants and
// `computeThumbMetrics` mirror ScrollPane's own exactly, so the mirror strip
// below is built the same way — a plain absolutely-positioned, pointer-
// draggable div — instead of relying on the browser to draw one.
const SHADOW_SCROLLBAR_MIN_THUMB = 24;
const SHADOW_SCROLLBAR_THICKNESS = 8;

function computeThumbMetrics(scrollSize, clientSize, scrollOffset) {
  if (clientSize <= 0 || scrollSize <= clientSize) return null;
  const rawThumbSize = (clientSize / scrollSize) * clientSize;
  const thumbSize = Math.max(SHADOW_SCROLLBAR_MIN_THUMB, Math.min(rawThumbSize, clientSize));
  const maxScrollOffset = scrollSize - clientSize;
  const maxThumbOffset = clientSize - thumbSize;
  const thumbOffset = maxScrollOffset > 0 ? (scrollOffset / maxScrollOffset) * maxThumbOffset : 0;
  return { thumbSize, thumbOffset };
}

// ETP-5268 follow-up — tracks the real horizontal scroll container's
// geometry: `stickyBottomPx` (padding compensation for the mirror
// scrollbar below), `elRef`/`attachSeq` (so HorizontalScrollThumb can find
// and re-subscribe to the actual scrolling element — see its own doc
// comment for why that state lives there instead of here), and
// `allowHoverSticky` — see quickActionsColumnClassName's doc comment for
// why the hover-float still needs ONE piece of scroll-position state even
// though the column itself is plain/in-flow.
//
// `visibleThresholdPx` (the actions column's own reserved width) is WHEN
// that state flips: "el hover desaparece ... es cuando apenas se vea la
// columna" — the moment ANY part of the actions column would naturally be
// visible in flow (`remaining <= reservedWidth`, i.e. this column's own
// static position has started to peek past the viewport edge), hovering
// stops floating it — no more sticky/covering at all past that point, just
// however much of the column has genuinely scrolled into view, same as any
// other column. This is safe in a way the very first "settle early" attempt
// (ETP-5268: `touchTolerancePx` on icon opacity, while the column stayed
// UNCONDITIONALLY sticky) was not: that one kept covering the neighbor at
// full reserved width regardless of the threshold, because sticky itself
// never turned off. Here, once `allowHoverSticky` is false, `sticky` is
// never applied at all (see quickActionsColumnClassName) — nothing to
// cover, by construction, not by convention.
function useHorizontalScrollGeometry(visibleThresholdPx = 0) {
  const [stickyBottomPx, setStickyBottomPx] = useState(0);
  const [allowHoverSticky, setAllowHoverSticky] = useState(false);
  // ETP-5268 follow-up — perf: bumped only when `containerRef` actually
  // attaches to a NEW DOM node (a real structural event — e.g. DataTable
  // leaving its `loading` skeleton — not a per-scroll one). This is the only
  // reason `HorizontalScrollThumb` below needs to know about, so its own
  // scroll-tracking effect can re-subscribe to the right element; everything
  // scroll-position-related from here on is that component's own local
  // state, never lifted into this hook (see its doc comment for why).
  const [attachSeq, setAttachSeq] = useState(0);
  const cleanupRef = useRef(null);
  const elRef = useRef(null);

  // Same callback-ref reasoning as the removed useHorizontalScrollEdge had:
  // DataTable early-returns a skeleton while `loading`, so an object-ref
  // effect would attach to nothing on the one render that matters and never
  // retry. A callback ref reruns setup every time this exact node mounts.
  const containerRef = useCallback((outerEl) => {
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
    const el = outerEl?.firstElementChild;
    elRef.current = el ?? null;
    setAttachSeq((prev) => prev + 1);
    if (!el) return;
    const scrollingAncestor = findScrollingAncestor(outerEl);
    setStickyBottomPx(scrollingAncestor
      ? -(parseFloat(getComputedStyle(scrollingAncestor).paddingBottom) || 0)
      : 0);

    const measure = () => {
      const remaining = el.scrollWidth - el.clientWidth - el.scrollLeft;
      const next = remaining > visibleThresholdPx;
      setAllowHoverSticky((prev) => (prev === next ? prev : next));
    };
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    resizeObserver?.observe(el);
    if (el.firstElementChild) resizeObserver?.observe(el.firstElementChild);

    cleanupRef.current = () => {
      el.removeEventListener('scroll', measure);
      resizeObserver?.disconnect();
    };
  }, [visibleThresholdPx]);

  return { stickyBottomPx, allowHoverSticky, containerRef, elRef, attachSeq };
}

// ETP-5268 follow-up — perf isolation: moving the thumb on scroll needs a
// React state update every scroll frame (its `transform: translateX` has no
// other way to track the real container's `scrollLeft`), but DataTable
// renders every row inline with no memoization (`filteredData.map(...)`,
// no `React.memo` on `TableDataRow` — see scroll-pane.jsx's own comment:
// "matches the rest of the app, which renders every loaded row", i.e. this
// table was never virtualized to begin with). An earlier revision kept
// `thumbMetrics` in `useHorizontalScrollGeometry` itself, which DataTable's
// own render calls directly — every scroll tick re-rendered the entire
// table, rows included, exactly the kind of jank a hand-rolled scrollbar
// should never introduce on a long list. Splitting this one piece of
// per-scroll state into its own leaf component means a scroll frame
// re-renders only these two divs: `elRef` is a stable ref object (mutating
// `.current` triggers nothing on its own) and `attachSeq` only changes when
// the real scrolling element itself is replaced (see useHorizontalScrollGeometry
// above), never on scroll — so nothing here ever forces DataTable, or any
// row, to re-render.
function HorizontalScrollThumb({ elRef, attachSeq, bottomOffsetPx }) {
  const [metrics, setMetrics] = useState(null);
  const dragStateRef = useRef(null);

  useEffect(() => {
    const el = elRef.current;
    if (!el || typeof ResizeObserver === 'undefined') {
      setMetrics(null);
      return undefined;
    }
    const measure = () => {
      setMetrics(computeThumbMetrics(el.scrollWidth, el.clientWidth, el.scrollLeft));
    };
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(el);
    if (el.firstElementChild) resizeObserver.observe(el.firstElementChild);
    return () => {
      el.removeEventListener('scroll', measure);
      resizeObserver.disconnect();
    };
    // `attachSeq` is the intentional re-subscribe trigger — see its own
    // doc comment on useHorizontalScrollGeometry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elRef, attachSeq]);

  // Same drag mechanics as ScrollPane's own `handleThumbPointerDown/Move/Up`
  // (schema_forge_core's scroll-pane.jsx): capture drag-start geometry once,
  // then translate pointer movement into `el.scrollLeft` directly. That
  // write is picked up by this component's OWN 'scroll' listener above, so
  // there's no separate update path for drag vs. native scroll/wheel/keyboard
  // — and, per this component's own doc comment, that update stays local.
  const handleThumbPointerDown = useCallback((event) => {
    const el = elRef.current;
    if (!el || !metrics) return;
    event.preventDefault();
    dragStateRef.current = {
      pointerId: event.pointerId,
      startPointerX: event.clientX,
      startScrollLeft: el.scrollLeft,
      thumbSize: metrics.thumbSize,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [elRef, metrics]);

  const handleThumbPointerMove = useCallback((event) => {
    const drag = dragStateRef.current;
    const el = elRef.current;
    if (!drag || !el || drag.pointerId !== event.pointerId) return;
    const deltaPointer = event.clientX - drag.startPointerX;
    const trackRange = drag.clientWidth - drag.thumbSize;
    const scrollRange = drag.scrollWidth - drag.clientWidth;
    if (trackRange <= 0 || scrollRange <= 0) return;
    const deltaScroll = deltaPointer * (scrollRange / trackRange);
    el.scrollLeft = Math.min(scrollRange, Math.max(0, drag.startScrollLeft + deltaScroll));
  }, [elRef]);

  const handleThumbPointerUp = useCallback((event) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    dragStateRef.current = null;
  }, []);

  if (!metrics) return null;

  return (
    <div
      className="sticky pointer-events-none z-20"
      style={{ height: SHADOW_SCROLLBAR_THICKNESS, bottom: bottomOffsetPx }}
      aria-hidden="true"
      data-testid="horizontal-scroll-mirror"
    >
      <div
        className="pointer-events-auto absolute bottom-0 cursor-grab touch-none rounded-full bg-[#C1C5CF] active:cursor-grabbing"
        style={{
          height: SHADOW_SCROLLBAR_THICKNESS,
          width: metrics.thumbSize,
          transform: `translateX(${metrics.thumbOffset}px)`,
        }}
        onPointerDown={handleThumbPointerDown}
        onPointerMove={handleThumbPointerMove}
        onPointerUp={handleThumbPointerUp}
        data-testid="horizontal-scroll-mirror-thumb"
      />
    </div>
  );
}

// Extracts grow flag and basis (px) from a columnFlex() shorthand string.
function flexSpec(col, idx) {
  const [g, , b] = columnFlex(col, idx).split(' ');
  return { grow: parseInt(g, 10), basis: parseInt(b, 10) };
}

// Reproduces flexbox's exact width formula for `flex-grow: 1` columns when
// mirrored into an HTML `<table style="table-layout: fixed">` colgroup.
// Flexbox distributes leftover space EQUALLY among growing items ON TOP OF
// each item's own basis (own basis + leftover/N). But a width-less <col> in
// a fixed-layout table splits the leftover space equally while IGNORING each
// column's own basis — so two grow columns with different bases (e.g. 192px
// vs 224px) render as EQUAL width in the table, even though the real flex
// rows always keep them a fixed 32px apart. This calc() expression restores
// that per-column basis so both layouts match pixel-for-pixel.
//
// Deliberately a bare calc(), not wrapped in max(basisPx, ...): the ONE
// caller (renderLinesColgroup, hideHeader mode — the InlineLinesPanel add-row
// companion table) renders inside a wrapper that's forced `overflow-visible`
// (never `overflow-x-auto` — see linesLayout === 'inlineEditable' in this
// component's own render body), i.e. by design it's never expected to
// genuinely run out of room, so the bare calc()'s leftover-space assumption
// always holds here. (An earlier revision wrapped this in `max()` to guard a
// DIFFERENT caller — the quick-actions column — against exactly that
// scenario; that caller no longer uses this function at all, see
// quickActionsColumnStyle, so the guard moved with it rather than staying
// here as unneeded complexity jsdom's `cssstyle` can't even represent: it
// doesn't implement the CSS `max()` function, silently no-oping the whole
// `width` property when it's used — see linesAddRowColumnAlignment.vitest.jsx
// and DataTable.etp4603Coverage.vitest.jsx for the read-back tests that rely
// on this staying a plain calc().)
export function growColumnWidth(basisPx, fixedTotalPx, growCount) {
  if (!growCount) return undefined;
  return `calc((100% - ${fixedTotalPx}px) / ${growCount} + ${basisPx}px)`;
}
import { SelectorInput } from './SelectorInput.jsx';
import { InlineSearchCombo } from './InlineSearchCombo.jsx';
import { ComputedFreshnessHint } from './ComputedFreshnessHint.jsx';
import { PillToggle } from '@/components/PillToggle';
import RowQuickActions from './RowQuickActions.jsx';
import { trackSearchResultSelected } from '@/lib/productUsageTelemetry.js';
import { LOOKUP_DRAWERS } from './lookupDrawers.js';

import { apiFetch } from '@/auth/api.js';
/**
 * Resolve a value from an object using a dotted path (e.g. `_aux._LOC`).
 */
function getByPath(obj, path) {
  if (obj == null || !path) return undefined;
  return path.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
}

/**
 * Resolves a field's declarative `onSelectMappings` against a selected lookup
 * item into a plain list of `{ to, value, label }` results — pure, no React
 * side effects. Each mapping copies a value into another field on the row —
 * either read from the selected `item` (`from`, a dot path) or a fixed
 * literal (`value`, used as-is, no `item` lookup) — optionally with a display
 * label resolved from one of several keys. Replaces window-specific branches
 * like `if (entity === 'internalConsumptionLine')` with metadata declared in
 * the contract.
 *
 * Shared by both places a lookup selection lands: the add-line form
 * (`applyOnSelectMappings` below, which also updates local row state) and the
 * persisted-line inline-edit PATCH (`DetailView.jsx`'s
 * `buildInlineRowUpdateHandler`, which folds these into the write body).
 *
 * @param {object} field Field whose `onSelectMappings` are applied
 * @param {object} item  Item selected in the lookup
 * @returns {Array<{to: string, value: unknown, label: unknown}>}
 */
export function resolveOnSelectMappings(field, item) {
  const mappings = field?.onSelectMappings;
  if (!Array.isArray(mappings) || mappings.length === 0) return [];
  const results = [];
  for (const m of mappings) {
    if (!m?.to || (m.from == null && m.value === undefined)) continue;
    const value = m.value !== undefined ? m.value : getByPath(item, m.from);
    if (value == null) continue;
    const labelKeys = getLabelArray(m);
    let label;
    for (const key of labelKeys) {
      const v = getByPath(item, key);
      if (v != null && v !== '') { label = v; break; }
    }
    results.push({ to: m.to, value, label });
  }
  return results;
}

/**
 * Apply a field's declarative `onSelectMappings` after a lookup selection,
 * updating the add-line form's local row state. See `resolveOnSelectMappings`
 * for the resolution rules.
 *
 * ETP-5039: every mapped target is reported through the optional `markTouched`
 * callback. A value the user selected in the lookup drawer is an explicit user
 * choice, so a callout fired by the same selection (e.g. the product callout
 * returning the default locator) must not overwrite it — see
 * `applyCalloutUpdates`, which skips touched fields and their `$_identifier`
 * companions. This is also what makes a `value` mapping (ETP-5037, Goods
 * Movements: force Cantidad to `0` on every product selection) stick — the
 * classic product callout separately returns the on-hand quantity at the
 * auto-filled locator, but the touched-guard blocks it from overwriting the
 * `0` this mapping just set.
 *
 * @param {object}   field        Field whose `onSelectMappings` are applied
 * @param {object}   item         Item selected in the lookup
 * @param {Function} handleChange (key, value) row-state setter
 * @param {Function} [markTouched] (key) called for every mapped target field
 */
export function applyOnSelectMappings(field, item, handleChange, markTouched) {
  for (const { to, value, label } of resolveOnSelectMappings(field, item)) {
    handleChange(`${to}$_identifier`, label == null ? value : label);
    handleChange(to, value);
    markTouched?.(to);
  }
}

/**
 * Get an array of label keys from a mapping object.
 */
function getLabelArray(m) {
  if (Array.isArray(m.labelFrom)) {
    return m.labelFrom;
  }
  return m.labelFrom ? [m.labelFrom] : [];
}

/**
 * Build display-override maps for every column whose contract field declares
 * `displayFromCatalog: true`. For each such column we read its add-row catalog
 * options and produce a `Map<optionId, optionLabel>`, used by `renderCellValue`
 * to swap a raw FK id for its catalog label (e.g. show warehouse name instead
 * of locator id). Without the flag, no map is built and nothing changes.
 */
export function buildDisplayCatalogMaps(visibleColumns, addRow, entity) {
  const out = new Map();
  const fields = addRow?.fields || [];
  const catalogs = addRow?.catalogs;
  if (!entity || !catalogs || fields.length === 0) return out;
  for (const col of visibleColumns) {
    const field = fields.find(f => f.key === col.key);
    if (!field?.displayFromCatalog) continue;
    const options = getCatalogOptions(catalogs, entity, field);
    if (!options || options.length === 0) continue;
    const map = new Map();
    for (const opt of options) {
      if (!opt?.id) continue;
      map.set(String(opt.id), opt.name || opt.label || opt._identifier || String(opt.id));
    }
    if (map.size > 0) out.set(col.key, map);
  }
  return out;
}


const INLINE_ADD_IGNORED_PORTAL_SELECTORS = [
  '[role="dialog"]',
  '[data-inline-add-portal="true"]',
  '[role="listbox"]',
  '[data-radix-popper-content-wrapper]',
];

function isClickInsideIgnoredPortal(target) {
  // Radix primitives that render via a DismissableLayer with
  // disableOutsidePointerEvents (e.g. <Select>, <Dialog>) set
  // document.body.style.pointerEvents = 'none' while open, so a click meant
  // for an underlying field never reaches it — the browser resolves the
  // event target to <html> instead. That target matches none of the
  // selectors below (it isn't a descendant of the listbox/dialog), so
  // without this check it reads as "genuinely outside, nothing touched" and
  // wrongly discards the row. Treat any click while such a layer is active
  // as belonging to that layer, regardless of what element it resolves to.
  if (document.body.style.pointerEvents === 'none') return true;
  if (!(target instanceof Element)) return false;
  return INLINE_ADD_IGNORED_PORTAL_SELECTORS.some(sel => target.closest(sel));
}

function applyLocalSearch(rows, filters, searchQuery) {
  if (!searchQuery) return rows;
  const q = searchQuery.toLowerCase();
  return rows.filter(row =>
    filters.some(key => String(resolveIdentifier(row, key) ?? '').toLowerCase().includes(q)),
  );
}

// Exported (ETP-4830) so window-scoped topbar/header controls that need the exact
// same PATCH + optimistic-update + error-toast behavior as a grid inline toggle
// (e.g. `windows/custom/user/index.jsx`'s detail-header "Activo" Switch) can reuse
// it instead of re-implementing the request/rollback/toast logic. Generic by
// design already — every dependency is passed in as a param, none are closed over
// component state — so exporting adds no coupling.
export async function runInlineToggleRequest({
  apiBaseUrl, entity, row, col, token, checked,
  toggleKey, setOptimisticToggles, setSavingToggles, onDataMutated, ui,
}) {
  setOptimisticToggles(prev => ({ ...prev, [toggleKey]: checked }));
  setSavingToggles(prev => ({ ...prev, [toggleKey]: true }));
  try {
    const res = await apiFetch(`${apiBaseUrl}/${entity}/${row.id}`, {
      method: 'PATCH',
      baseUrl: '',
      token,
      body: JSON.stringify({ [col.key]: checked }),
    });
    if (!res.ok) {
      const raw = await parseBackendErrorMessage(res);
      throw new Error(translateBackendError(raw ?? `Error ${res.status}`, ui));
    }
    onDataMutated?.();
  } catch (error) {
    setOptimisticToggles(prev => {
      const next = { ...prev };
      delete next[toggleKey];
      return next;
    });
    toast.error(error?.message || 'Failed to update record');
  } finally {
    setSavingToggles(prev => {
      const next = { ...prev };
      delete next[toggleKey];
      return next;
    });
  }
}

/**
 * Loading skeleton that mimics a table layout.
 */
function TableSkeleton({ columns }) {
  return (
    <div className="space-y-2">
      {/* Header skeleton */}
      <div className="flex gap-3 px-2">
        {columns.map(col => (
          <Skeleton key={col.key} className="h-4 flex-1" data-testid="Skeleton__eb5261" />
        ))}
      </div>
      {/* Row skeletons */}
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex gap-3 px-2">
          {columns.map(col => (
            <Skeleton
              key={col.key}
              className="h-8 flex-1"
              style={{ opacity: 1 - i * 0.15 }}
              data-testid="Skeleton__eb5261" />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Empty state shown when the table has no data (or all rows are filtered out).
 */
function EmptyState({ hasFilter, totalCount }) {
  const ui = useUI();
  return (
    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
      <Inbox className="h-10 w-10 mb-3 opacity-40" data-testid="Inbox__eb5261" />
      {hasFilter ? (
        <>
          <p className="text-sm font-medium">{ui('noMatchingRecords')}</p>
          <p className="text-xs mt-1">{ui('adjustFilters')}</p>
        </>
      ) : (
        <>
          <p className="text-sm font-medium">{ui('noRecordsYet')}</p>
          <p className="text-xs mt-1">{ui('createNewRecord')}</p>
        </>
      )}
    </div>
  );
}

function isMissingRequired(f, valuesRef, fields = []) {
  if (!f.required) return false;
  // A boolean/checkbox always carries a valid value (false = deliberately
  // unchecked), so it can never be "missing". Mirrors the header guard in
  // useEntity.handleSave and stops a required checkbox left off (e.g. a journal
  // line's Open Items) from blocking the row.
  if (f.type === 'checkbox' || f.type === 'boolean') return false;
  const hasVal = (key) => {
    const v = valuesRef.current[key];
    return !(v == null || v === '' || (typeof v === 'string' && v.trim() === ''));
  };
  if (hasVal(f.key)) return false;
  // clearsField forms a mutually-exclusive group (e.g. a journal line is a debit
  // OR a credit, never both). The requirement is "one of the group", so the empty
  // member must not be flagged while a sibling it clears — or that clears it —
  // carries a value.
  if (f.clearsField && hasVal(f.clearsField)) return false;
  for (const g of fields) {
    if (g.clearsField === f.key && hasVal(g.key)) return false;
  }
  return true;
}

function isBelowMin(f, valuesRef) {
  if (f.min === undefined) return false;
  const v = valuesRef.current[f.key];
  if (v == null || v === '') return false;
  return !isNaN(Number(v)) && Number(v) < f.min;
}

// Format guard for the inline add-row (email + phone + website, plus the
// Contacts-only text-field checks). Empty is valid (these fields are optional —
// never made required); only a non-empty malformed value is flagged. Returns
// `{ key, params }` (never a bare string) so a parameterized message like
// `fieldMaxLengthError` can interpolate correctly; the email/phone/website
// helpers return a plain key string, wrapped here into the same shape for a
// uniform call site. ETP-5031 added the website check (previously missing here
// even though the form already validated it) and the Contacts text-field gate.
function getFieldFormatError(f, valuesRef, specName) {
  const v = valuesRef.current[f.key];
  const emailErr = getEmailFieldError(f, v);
  if (emailErr) return { key: emailErr, params: {} };
  const phoneErr = getPhoneFieldError(f, v);
  if (phoneErr) return { key: phoneErr, params: {} };
  const websiteErr = getWebsiteFieldError(f, v);
  if (websiteErr) return { key: websiteErr, params: {} };
  return getContactsTextFieldError(specName, f, v);
}

function buildSelectorUrl(apiBaseUrl, entity, field) {
  return apiBaseUrl ? `${apiBaseUrl}/${entity}/selectors/${field.column}` : null;
}

function displayOrDash(displayVal) {
  return displayVal != null && displayVal !== '' ? displayVal : '—';
}

function getNumericCellAlignClass(isNumeric) {
  return isNumeric ? ' text-right tabular-nums' : '';
}

function resolveNumericInputMode(field, isNumeric) {
  let numericInputMode = field.inputMode;
  if (!numericInputMode && isNumeric) {
    numericInputMode = field.type === 'integer' ? 'numeric' : 'decimal';
  }
  return numericInputMode;
}

function isLookupSearchField(field) {
  return field.type === 'search' && field.lookup;
}

// Human-readable label for a picked lookup item, trying the common shapes in
// priority order (label > name > _identifier).
function resolveLookupItemLabel(item) {
  return item.label || item.name || item._identifier;
}

// Conditional visibility: a field with `displayIf` is hidden while its
// controlling sibling field is falsy (not 'Y'/true/'true').
function isColumnHidden(field, values) {
  if (!field?.displayIf) return false;
  const ctrlVal = values[field.displayIf];
  return !(ctrlVal === true || ctrlVal === 'Y' || ctrlVal === 'true');
}

function isStaticSelectField(field) {
  return field.type === 'select' && field.options?.length;
}

/**
 * Renders the inline-add-row cell for a `selector` field. Always uses the
 * searchable <InlineSearchCombo>, preloaded with the catalog's options (if any)
 * and backed by the selector URL for server-side search / lazy loading —
 * mirroring the `search`-type add-row cell and the header's unified selector.
 */
function renderSelectorCell({
  catalogs, entity, field, apiBaseUrl, col, values, touchedFieldsRef,
  handleChange, handleFieldChange, handleKeyDown, isFirst, firstInputRef,
  fieldLabel, selectorContext, token,
}) {
  const allOptions = getCatalogOptions(catalogs, entity, field);
  const selectorUrl = buildSelectorUrl(apiBaseUrl, entity, field);
  // Exclude the option equal to the current value of a sibling field on this add-line row
  // (e.g. newStorageBin can't equal storageBin). Applies to both the preloaded catalog and
  // any server-side search results.
  const excludeId = field.excludeValueOf ? (values[field.excludeValueOf] ?? null) : null;
  const options = excludeId != null ? allOptions.filter(o => o.id !== excludeId) : allOptions;

  if (options.length === 0 && !selectorUrl) {
    return (
      <TableCell
        key={col.key}
        className="py-1 px-2"
        data-testid={"TableCell__" + field.id} />
    );
  }

  return (
    <TableCell key={col.key} data-testid={`inline-add-cell-${col.key}`} className="py-1 px-2">
      <InlineSearchCombo
        field={field}
        value={values[field.key] ?? ''}
        displayLabel={values[field.key + '$_identifier'] || ''}
        options={options}
        onChange={(id, label, selectedItem) => {
          touchedFieldsRef.current.add(field.key);
          handleChange(field.key + '$_identifier', label || '');
          handleFieldChange(field.key, id, selectedItem);
        }}
        onKeyDown={handleKeyDown}
        inputRef={isFirst ? firstInputRef : undefined}
        placeholder={fieldLabel}
        selectorUrl={selectorUrl}
        selectorContext={selectorContext}
        excludeId={excludeId}
        token={token}
        data-testid={"InlineSearchCombo__" + field.id} />
    </TableCell>
  );
}

// ETP-5107 — the numeric branch of the inline-add-row cell now renders
// MaskedAmountInput (digit + single configured-decimal-separator keystroke
// filtering, live thousands-grouping for amount/price fields); this stays
// the plain, contacts-aware text branch for everything else. Split out of
// the old single `renderInputCell` so the numeric/non-numeric paths don't
// share one over-branched function — see plan §6.3.4 for why the gate must
// be the field's declared TYPE, never the string's shape.
function renderNumericInputCell({
  field, col, values, invalidFields, isFirst, firstInputRef,
  handleFieldChange, handleKeyDown, fieldLabel,
}) {
  // ETP-5107 QA follow-up — `field.type` comes from `addLineFields.entry`
  // (add-new-line metadata), which for price-like fields is often declared
  // as generic 'number' rather than 'amount'/'price'. `col` (the matching
  // entry from the `columns` list, used by the existing-line editor) is
  // already available here and carries the more specific type — mirror
  // `renderDerivedAddCell`'s `col.type` check below so a new line's price
  // input groups live the same way an existing line's does.
  const isTwoDecimal = TWO_DECIMAL_FIELD_TYPES.has(field.type) || TWO_DECIMAL_FIELD_TYPES.has(col?.type);
  const numericInputMode = resolveNumericInputMode(field, true);
  const onBlur = () => {
    const raw = values[field.key];
    if (raw === '' || raw == null) {
      // Empty numeric → restore defaultValue (or min) so the POST body never
      // omits the field and lets the backend apply a wrong implicit default.
      if (field.defaultValue !== undefined) handleFieldChange(field.key, String(field.defaultValue));
      else if (field.min !== undefined) handleFieldChange(field.key, String(field.min));
      return;
    }
    // `raw` here is always the CLEAN value MaskedAmountInput's onChange
    // reported (digits + at most one '.' + optional leading '-'), never a
    // grouped display string — plain Number() keeps working unchanged.
    const num = Number(raw);
    if (isNaN(num)) return;
    if (field.max !== undefined && num > field.max) handleFieldChange(field.key, String(field.max));
    if (field.min !== undefined && num < field.min) handleFieldChange(field.key, String(field.min));
  };
  return (
    <TableCell key={col.key} data-testid={`inline-add-cell-${col.key}`} className="py-1 px-2">
      <MaskedAmountInput
        bare
        grouping={isTwoDecimal}
        inputMode={numericInputMode}
        inputRef={isFirst ? firstInputRef : undefined}
        value={values[field.key]}
        onChange={(raw) => handleFieldChange(field.key, raw)}
        onBlur={onBlur}
        onKeyDown={handleKeyDown}
        placeholder={fieldLabel}
        required={field.required}
        className={`w-full h-8 text-sm rounded-md border bg-card px-2 focus:ring-2 focus:outline-none${invalidFields.has(field.key) ? ' border-destructive focus:ring-destructive' : ' border-input focus:ring-primary'}`}
        data-testid={`inline-add-field-${field.key}`} />
    </TableCell>
  );
}

function renderInputCell({
  field, col, values, invalidFields, isFirst, firstInputRef,
  handleFieldChange, handleKeyDown, fieldLabel, specName,
}) {
  const isNumeric = NUMERIC_FIELD_TYPES.has(field.type);
  if (isNumeric) {
    return renderNumericInputCell({
      field, col, values, invalidFields, isFirst, firstInputRef, handleFieldChange, handleKeyDown, fieldLabel,
    });
  }
  const onChange = (e) => {
    // ETP-5031 — Contacts phone-like fields never even display a disallowed
    // character (filtered at keystroke time). No-op for every window/field
    // this doesn't apply to — filterContactsInputValue returns the raw value
    // unchanged.
    const raw = filterContactsInputValue(specName, field, e.target.value);
    handleFieldChange(field.key, raw);
  };
  return (
    <TableCell key={col.key} data-testid={`inline-add-cell-${col.key}`} className="py-1 px-2">
      <input
        data-testid={`inline-add-field-${field.key}`}
        ref={isFirst ? firstInputRef : undefined}
        type="text"
        value={values[field.key] ?? ''}
        onChange={onChange}
        onKeyDown={handleKeyDown}
        placeholder={fieldLabel}
        required={field.required}
        className={`w-full h-8 text-sm rounded-md border bg-card px-2 focus:ring-2 focus:outline-none${invalidFields.has(field.key) ? ' border-destructive focus:ring-destructive' : ' border-input focus:ring-primary'}`}
      />
    </TableCell>
  );
}

// Renders the derived (contract-computed, non-editable) cell shown when a column
// has no matching editable field — a read-only display of the callout result.
function renderDerivedAddCell(col, values) {
  const rawVal = values[col.key];
  const identVal = values[col.key + '$_identifier'];
  const isNumericDerived = NUMERIC_FIELD_TYPES.has(col.type);
  const isTwoDecimalDerived = TWO_DECIMAL_FIELD_TYPES.has(col.type);
  const displayVal = formatDerivedCellValue(identVal, rawVal, isTwoDecimalDerived);
  return (
    <TableCell key={col.key} data-testid={`inline-add-cell-${col.key}`} className={`text-muted-foreground text-sm${getNumericCellAlignClass(isNumericDerived)}`}>
      {displayOrDash(displayVal)}
    </TableCell>
  );
}

// Date cell of the inline-add row. Split out of renderInlineAddFieldControl so that
// function stays under the cognitive-complexity budget: the dispatch chain there is long
// enough that each branch has to earn its place, and this one is self-contained.
// `h-8` matches the height of the other add-row controls (tailwind-merge wins over
// DateField's own FIELD_HEIGHT).
function renderInlineAddDateField(col, field, { values, handleFieldChange, invalidFields }) {
  return (
    <TableCell key={col.key} data-testid={`inline-add-cell-${col.key}`} className="py-1 px-2">
      <DateField
        id={`inline-add-field-${field.key}`}
        name={field.key}
        data-testid={`inline-add-field-${field.key}`}
        value={values[field.key] ?? ''}
        onChange={(iso) => handleFieldChange(field.key, iso)}
        required={field.required}
        className={`h-8${invalidFields.has(field.key) ? ' border-destructive focus-within:ring-destructive' : ''}`}
      />
    </TableCell>
  );
}

// Renders the interactive control for an editable inline-add field, dispatching
// on its type (lookup, search, static select, selector, boolean, or plain input).
function renderInlineAddFieldControl(col, field, isFirst, fieldLabel, {
  values, firstInputRef, selectorContext, token, apiBaseUrl, entity, catalogs,
  handleChange, handleFieldChange, handleKeyDown, touchedFieldsRef, invalidFields, locale, specName,
}) {
  if (isLookupSearchField(field)) {
    const selectorUrl = buildSelectorUrl(apiBaseUrl, entity, field);
    const displayLabel = values[field.key + '$_identifier'] || '';
    const drawerKey = field.lookupDrawer || 'default';
    const lookupTitle = field.lookupTitle || fieldLabel;
    return (
      <TableCell key={col.key} data-testid={`inline-add-cell-${col.key}`} className="py-1 px-2">
        <LookupField
          value={displayLabel}
          fieldKey={field.key}
          placeholder={fieldLabel}
          selectorUrl={selectorUrl}
          selectorContext={selectorContext}
          token={token}
          inputRef={isFirst ? firstInputRef : undefined}
          isInvalid={invalidFields.has(field.key)}
          onSelect={(item) => {
            touchedFieldsRef.current.add(field.key);
            handleChange(field.key + '$_identifier', resolveLookupItemLabel(item));
            handleFieldChange(field.key, item.id, item);
            applyOnSelectMappings(field, item, handleChange, (key) => touchedFieldsRef.current.add(key));
          }}
          onKeyDown={handleKeyDown}
          title={lookupTitle}
          drawerKey={drawerKey}
          data-testid="LookupField__eb5261" />
      </TableCell>
    );
  }
  if (field.type === 'search') {
    const options = getCatalogOptions(catalogs, entity, field);
    const selectorUrl = buildSelectorUrl(apiBaseUrl, entity, field);
    const excludeId = field.excludeValueOf ? (values[field.excludeValueOf] ?? null) : null;
    return (
      <TableCell key={col.key} data-testid={`inline-add-cell-${col.key}`} className="py-1 px-2">
        <InlineSearchCombo
          field={field}
          value={values[field.key] ?? ''}
          displayLabel={values[field.key + '$_identifier'] || ''}
          options={options}
          excludeId={excludeId}
          inputRef={isFirst ? firstInputRef : undefined}
          placeholder={fieldLabel}
          onChange={(id, label, selectedItem) => {
            touchedFieldsRef.current.add(field.key);
            handleChange(field.key + '$_identifier', label);
            handleFieldChange(field.key, id, selectedItem);
          }}
          onKeyDown={handleKeyDown}
          selectorUrl={selectorUrl}
          selectorContext={selectorContext}
          token={token}
          data-testid="InlineSearchCombo__eb5261" />
      </TableCell>
    );
  }
  if (isStaticSelectField(field)) {
    return (
      <TableCell key={col.key} data-testid={`inline-add-cell-${col.key}`} className="py-1 px-2">
        <Select
          value={values[field.key] || undefined}
          onValueChange={(val) => handleFieldChange(field.key, val === '__empty__' ? '' : val)}
          required={field.required}
          data-testid="Select__eb5261">
          <SelectTrigger
            ref={isFirst ? firstInputRef : undefined}
            data-testid={`inline-add-field-${field.key}`}
            onKeyDown={(e) => { if (e.key === 'Escape') handleKeyDown(e); }}
            className="w-full h-8 text-sm bg-card focus:ring-2 focus:ring-primary"
          >
            <SelectValue placeholder={field.label ?? field.key} data-testid="SelectValue__eb5261" />
          </SelectTrigger>
          <SelectContent data-testid="SelectContent__eb5261">
            {!field.required && <SelectItem value="__empty__" data-testid="SelectItem__eb5261">&nbsp;</SelectItem>}
            {field.options.map(opt => (
              // ETP-4685 — each option carries a per-locale `labels` map (same shape
              // the form view already resolves) alongside the raw AD `label`; prefer
              // it or this always shows the raw English name regardless of locale.
              (<SelectItem key={opt.value} value={opt.value} data-testid="SelectItem__eb5261">{opt.labels?.[locale] ?? opt.label}</SelectItem>)
            ))}
          </SelectContent>
        </Select>
      </TableCell>
    );
  }
  if (field.type === 'selector') {
    return renderSelectorCell({
      catalogs, entity, field, apiBaseUrl, col, values, touchedFieldsRef,
      handleChange, handleFieldChange, handleKeyDown, isFirst, firstInputRef,
      fieldLabel, selectorContext, token,
    });
  }
  // ETP-5245 — date columns get the app's own date picker (calendar icon + masked,
  // locale-formatted text input), the SAME control EntityForm's `renderDateField`
  // uses for a form-mode date. Without this branch a `type: 'date'` add-row field
  // fell through to `renderInputCell` and rendered a bare text box with the field
  // label as its placeholder: no calendar, no mask, and whatever free text the user
  // typed went straight into the POST body. `DateField.onChange` always emits
  // `yyyy-MM-dd` (or '' when cleared) — the exact wire format the rest of the add-row
  // pipeline already assumes for a date (see normalizeCreationDefaults in
  // hooks/useEntity.js, "dd-MM-yyyy → yyyy-MM-dd (HTML date input)").
  //
  // Two deliberate gaps, both pre-existing for the other rich controls in this
  // dispatcher: DateField takes no `ref`, so a date column that happens to be the
  // FIRST add-row field does not receive `firstInputRef` autofocus (same as the
  // PillToggle branch below); and it takes no `onKeyDown`, so row-level Enter/Escape
  // does not fire from inside it — DateField binds both itself (Enter commits and
  // blurs, Escape reverts and blurs).
  if (field.type === 'date') {
    return renderInlineAddDateField(col, field, { values, handleFieldChange, invalidFields });
  }
  if (field.type === 'checkbox' || field.type === 'boolean') {
    const checked = values[field.key] === true || values[field.key] === 'Y' || values[field.key] === 'true';
    return (
      <TableCell key={col.key} data-testid={`inline-add-cell-${col.key}`} className="py-1 px-2">
        <PillToggle
          checked={checked}
          onCheckedChange={(next) => {
            touchedFieldsRef.current.add(field.key);
            handleFieldChange(field.key, next);
          }}
          data-testid={`inline-add-field-${field.key}`} />
      </TableCell>
    );
  }
  return renderInputCell({
    field, col, values, invalidFields, isFirst, firstInputRef,
    handleFieldChange, handleKeyDown, fieldLabel, specName,
  });
}

function renderInlineAddCell(col, ctx) {
  const { fieldMap, values, t, locale, firstInputCtx } = ctx;
  const field = fieldMap[col.key];
  const fieldLabel = getFieldLabel(field, t, col, locale);
  if (isColumnHidden(field, values)) {
    return <TableCell key={col.key} aria-hidden="true" data-testid={`inline-add-cell-${col.key}`} />;
  }
  if (!field) {
    return renderDerivedAddCell(col, values);
  }
  const isFirst = !firstInputCtx.assigned;
  if (isFirst) firstInputCtx.assigned = true;
  return renderInlineAddFieldControl(col, field, isFirst, fieldLabel, ctx);
}

/**
 * Inline editable row rendered at the bottom of the table for rapid line entry.
 * Controlled by the `addRow` prop on DataTable.
 */
// Stable empty seed: a fresh `{}` default would change identity every render and
// make buildEmpty's effect re-run, wiping in-progress input. Share one frozen ref.
const EMPTY_SEED = {};

// First pass of buildEmpty: seed every field with its literal default, the
// auto-computed lineNo, or '' when neither applies.
function buildFieldDefaults(fields, defaultLineNo) {
  const empty = {};
  for (const f of fields) {
    if (f.key === 'lineNo') {
      empty[f.key] = defaultLineNo;
    } else if (f.defaultValue !== undefined && !/^@[^@]+@$/.test(String(f.defaultValue))) {
      empty[f.key] = f.defaultValue;
    } else {
      empty[f.key] = '';
    }
  }
  return empty;
}

// Seed display-only (non-editable) columns — e.g. a parent-derived currency —
// so they render their value immediately instead of "—" until the row is saved.
// Editable fields are never overwritten; the seed only fills keys with no input.
function applyDisplaySeed(empty, seedValues, fieldMap) {
  for (const [key, val] of Object.entries(seedValues)) {
    if (!fieldMap[key]) empty[key] = val;
  }
  return empty;
}

// HandleDefaults: fill EMPTY editable fields from backend-resolved line
// defaults (e.g. a macro default like @DESCRIPTION1@ → the parent's value).
// Fill-empties-only: never override a literal default, the client lineNo, a
// display seed, or a field opted out via skipDefault.
function applyResolvedFieldDefaults(empty, resolvedDefaults, fieldMap) {
  for (const [key, val] of Object.entries(resolvedDefaults)) {
    if (key.endsWith('$_identifier')) continue; // handled by applyResolvedIdentifiers
    const f = fieldMap[key];
    if (!f || f.skipDefault) continue;
    const cur = empty[key];
    if ((cur == null || cur === '') && val != null && val !== '') {
      empty[key] = val;
    }
  }
  return empty;
}

// Companion `<key>$_identifier` labels (e.g. country$_identifier: "Spain") have no
// entry in `fieldMap` — they're display text for a selector field, not a field of
// their own — so applyResolvedFieldDefaults always skips them. Without this, a
// selector/search field resolved from resolvedDefaults (e.g. country: "106") renders
// a chip with a working Clear button but an EMPTY label, because InlineSearchCombo's
// `displayLabel` reads `values[field.key + '$_identifier']` and finds nothing. Only
// seed the identifier when its base field actually received ITS value from
// resolvedDefaults (not from a literal decisions.json defaultValue or a seeded
// display column) so a stale label never gets attached to an unrelated value.
function applyResolvedIdentifiers(empty, resolvedDefaults, fieldMap) {
  for (const [key, val] of Object.entries(resolvedDefaults)) {
    if (!key.endsWith('$_identifier')) continue;
    const baseKey = key.slice(0, -'$_identifier'.length);
    const f = fieldMap[baseKey];
    if (!f || f.skipDefault) continue;
    if (empty[baseKey] === resolvedDefaults[baseKey] && val != null && val !== '') {
      empty[key] = val;
    }
  }
  return empty;
}

const InlineAddRow = forwardRef(function InlineAddRow({ columns, fields, onAdd, onCancel, data, catalogs, onFieldChange, onValuesChange, selectable, hasDeleteColumn, hasCloneColumn, hoverRowActions, hoverRowHasDelete, hasQuickActionsColumn, token, apiBaseUrl, entity, specName, selectorContext, seedValues = EMPTY_SEED, resolvedDefaults = EMPTY_SEED, ilpReservesActionSlot = false, ilpTrailing = false, labelOverrides, convertOptimisticPrice, hasDimensionsPanel = false }, ref) {
  const t = useLabel(labelOverrides);
  const ui = useUI();
  const { locale } = useLocaleSwitch();
  const fieldMap = useMemo(() => {
    const map = {};
    for (const f of fields) map[f.key] = f;
    return map;
  }, [fields]);

  // Auto-compute lineNo default
  const defaultLineNo = useMemo(() => {
    const nums = (data || []).map(r => Number(r.lineNo) || 0);
    return (nums.length > 0 ? Math.max(...nums) : 0) + 10;
  }, [data]);

  const buildEmpty = useCallback(() => {
    let empty = buildFieldDefaults(fields, defaultLineNo);
    empty = applyDisplaySeed(empty, seedValues, fieldMap);
    empty = applyResolvedFieldDefaults(empty, resolvedDefaults, fieldMap);
    empty = applyResolvedIdentifiers(empty, resolvedDefaults, fieldMap);
    return empty;
  }, [fields, defaultLineNo, seedValues, fieldMap, resolvedDefaults]);

  const [values, setValues] = useState(buildEmpty);
  const [isSaving, setIsSaving] = useState(false);
  const [invalidFields, setInvalidFields] = useState(new Set());
  const firstInputRef = useRef(null);
  const rowRef = useRef(null);
  const touchedFieldsRef = useRef(new Set());
  const inflightRef = useRef(null);
  const valuesRef = useRef(null);
  const pendingCalloutsRef = useRef([]);

  // Keep valuesRef in sync on every render so submitLine never reads a stale closure.
  valuesRef.current = values;

  // Reset values when fields or data change
  useEffect(() => {
    const empty = buildEmpty();
    valuesRef.current = empty;
    pendingCalloutsRef.current = [];
    setValues(empty);
    touchedFieldsRef.current = new Set();
  }, [buildEmpty]);

  // Notify parent on every values change so it can compute live totals (pendingLine).
  useEffect(() => {
    onValuesChange?.(values);
  }, [values, onValuesChange]);

  // Auto-focus first input when row appears. preventScroll avoids the browser's
  // instant snap-to-input scroll, leaving the parent's smooth scroll animation
  // (DetailView linesScrollRef) free to run without being preempted.
  useEffect(() => {
    firstInputRef.current?.focus({ preventScroll: true });
  }, []);

  const handleChange = (key, val) => {
    valuesRef.current = { ...valuesRef.current, [key]: val };
    setValues(prev => ({ ...prev, [key]: val }));
  };

  const submitLine = useCallback(({ closeAfterSave = false } = {}) => {
    // Dedupe concurrent submits: outside-click + parent flushPendingLines can fire
    // in the same tick; both callers must observe the same outcome.
    if (inflightRef.current) return inflightRef.current;
    // Validate required fields BEFORE entering the in-flight state — a missing
    // value should leave the row open for the user to complete. Reads from the
    // valuesRef so an in-flight callout cannot mask a still-empty user field.
    const missing = fields.filter(f => isMissingRequired(f, valuesRef, fields));
    if (missing.length > 0) {
      setInvalidFields(new Set(missing.map(f => f.key)));
      toast.error(ui('requiredFieldsMissing'));
      const firstMissing = missing[0];
      const inputEl = document.querySelector(`[data-testid="field-${firstMissing.key}"]`);
      inputEl?.focus?.({ preventScroll: true });
      return Promise.resolve(false);
    }
    // Clamp any above-max values before validation so submitLine is consistent
    // with the onBlur autocorrect (guards the mousedown-before-blur race).
    for (const f of fields) {
      if (f.max === undefined) continue;
      const num = Number(valuesRef.current[f.key]);
      if (!isNaN(num) && num > f.max) valuesRef.current = { ...valuesRef.current, [f.key]: String(f.max) };
    }
    const belowMin = fields.filter(f => isBelowMin(f, valuesRef));
    if (belowMin.length > 0) {
      setInvalidFields(new Set(belowMin.map(f => f.key)));
      // Interpolate the offending field's `min` so the message is precise
      // ("Value must be at least 1") rather than the imprecise negative wording.
      toast.error(ui('fieldMinValueError', { min: belowMin[0].min }));
      const firstInvalid = belowMin[0];
      const inputEl = document.querySelector(`[data-testid="field-${firstInvalid.key}"]`);
      inputEl?.focus?.({ preventScroll: true });
      return Promise.resolve(false);
    }
    // Format validation (email + phone) — mirrors the required/min checks: flag the
    // cell (red border via invalidFields), toast the specific error, focus, and block
    // the commit. Empty stays valid, so an untouched optional field never blocks the row.
    const formatInvalid = fields
      .map(f => ({ f, err: getFieldFormatError(f, valuesRef, specName) }))
      .filter(({ err }) => err !== null);
    if (formatInvalid.length > 0) {
      setInvalidFields(new Set(formatInvalid.map(({ f }) => f.key)));
      toast.error(ui(formatInvalid[0].err.key, formatInvalid[0].err.params));
      const firstInvalid = formatInvalid[0].f;
      const inputEl = document.querySelector(`[data-testid="field-${firstInvalid.key}"]`);
      inputEl?.focus?.({ preventScroll: true });
      return Promise.resolve(false);
    }
    setIsSaving(true);
    const run = (async () => {
      try {
        // Wait for any in-flight callouts (e.g. product → taxRate → lineGrossAmount)
        // before reading values. Without this, pressing Enter immediately after
        // selecting a product would POST with taxRate=null and lineGrossAmount=0.
        if (pendingCalloutsRef.current.length > 0) {
          await Promise.all(pendingCalloutsRef.current);
        }
        // Read from ref (always current) instead of the stale `values` closure.
        const coercedValues = coerceFieldValues(valuesRef, fields);

        const result = await onAdd(coercedValues);
        if (result === false || result == null) {
          return false;
        }
        if (closeAfterSave) {
          onCancel();
          return true;
        }
        // Reset for next rapid entry — recompute lineNo. Reuses buildEmpty() (single
        // source of truth for the macro-defaultValue guard, resolvedDefaults fill and
        // its $_identifier companion pass) instead of re-deriving field defaults here —
        // a prior duplicated loop applied `f.defaultValue` unconditionally, so an
        // unresolved AD macro token (e.g. '@COUNTRYDEF@') on a selector/search field
        // would leak into the next line's value, and resolvedDefaults (with its
        // identifier labels) was never reapplied at all.
        const nums = [...(data || []).map(r => Number(r.lineNo) || 0), Number(valuesRef.current.lineNo) || 0];
        const nextLineNo = Math.max(...nums) + 10;
        const next = buildEmpty();
        next.lineNo = nextLineNo;

        valuesRef.current = next;
        setValues(next);
        touchedFieldsRef.current = new Set();
        // Re-focus first input for rapid entry
        setTimeout(() => firstInputRef.current?.focus({ preventScroll: true }), 0);
        return true;
      } finally {
        inflightRef.current = null;
        setIsSaving(false);
      }
    })();
    inflightRef.current = run;
    return run;
  }, [data, fields, onAdd, onCancel, ui, buildEmpty]);

  // Enter → confirm without closing (rapid entry). Outside-click / parent flush close.
  const handleConfirm = useCallback(() => submitLine({ closeAfterSave: false }), [submitLine]);

  // Expose imperative flush for parent (e.g. auto-commit pending line on header Save).
  // If no field has been touched, silently cancel. Otherwise confirm and return success.
  useImperativeHandle(ref, () => ({
    flush: async ({ closeAfterSave = true } = {}) => {
      if (inflightRef.current) {
        return (await inflightRef.current) !== false;
      }
      if (touchedFieldsRef.current.size === 0) {
        onCancel();
        return true;
      }
      const ok = await submitLine({ closeAfterSave });
      return ok !== false;
    },
    setFieldValues: (updates) => {
      setValues(prev => ({ ...prev, ...updates }));
    },
  }), [onCancel, submitLine]);

  // Auto-commit when the user clicks outside the row (mirrors the green-check behavior).
  // Skips clicks inside the row itself, inside any open dialog/drawer (role="dialog"),
  // and inside whitelisted portals (combo dropdown marked with data-inline-add-portal).
  useEffect(() => {
    const handler = (e) => {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (rowRef.current?.contains(target)) return;
      // Skip whitelisted portals: open dialog/drawer, inline-add combo portal, and
      // Radix Select dropdowns (rendered outside the row via portal). Treating
      // these as part of the row prevents silent saves when the user is still
      // interacting with a popover/listbox (e.g. switching the tax).
      if (isClickInsideIgnoredPortal(target)) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (inflightRef.current) return;
      if (touchedFieldsRef.current.size === 0) {
        onCancel();
      } else {
        submitLine({ closeAfterSave: true }).catch((err) => {
          // Errors are surfaced to the user via toast inside onAdd; log for diagnostics.
          console.error('Failed to submit inline line on outside click:', err);
        });
      }
    };
    // Listen for `pointerdown` (not `mousedown`): elements that call
    // preventDefault() on pointerdown — e.g. Radix SelectTrigger and the header
    // selector controls — suppress the browser's compatibility mouse events for
    // that interaction, so a `mousedown` listener would never fire on the FIRST
    // click on such a control and the new line would silently not be saved.
    // `pointerdown` itself is never suppressed. Mirrors the identical fix in
    // InlineLinesPanel.jsx (flush-pending-edit-on-outside-pointerdown).
    document.addEventListener('pointerdown', handler, true);
    return () => document.removeEventListener('pointerdown', handler, true);
  }, [onCancel, submitLine]);

  // Wrap handleChange to also notify parent (for callout triggering)
  const handleFieldChange = useCallback((key, val, selectedItem) => {
    touchedFieldsRef.current.add(key);
    setInvalidFields(prev => {
      if (!prev.has(key)) return prev;
      const n = new Set(prev);
      n.delete(key);
      return n;
    });
    // Build a snapshot of current + new values for the callout formState
    const snapshot = { ...values, [key]: val };
    handleChange(key, val);
    // Mutual-exclusion: zero the paired field when a non-zero value is entered (e.g. debit ↔ credit).
    // Use '0' not '' so the sibling still passes required-field validation.
    // Gate on a FINITE non-zero value: renderInputCell permits partial numeric
    // input ('-', '.', '-.') where Number(val) is NaN — without the isFinite
    // check the paired field would be cleared mid-typing.
    const clearsKey = fieldMap[key]?.clearsField;
    const clearsNumVal = Number(val);
    if (clearsKey && val !== '' && val !== null && val !== undefined
        && Number.isFinite(clearsNumVal) && clearsNumVal !== 0) {
      handleChange(clearsKey, '0');
      snapshot[clearsKey] = '0';
    }
    // Store _aux data from selector items as auxiliaryValues (e.g., product_UOM, product_PSTD)
    if (selectedItem?._aux) {
      for (const [suffix, auxVal] of Object.entries(selectedItem._aux)) {
        snapshot[key + suffix] = auxVal;
        handleChange(key + suffix, auxVal);
      }
    }
    // Also fire top-level display fields from selectedItem (mirrors EntityForm behavior).
    // Skips structural/object fields; fires e.g. product_uOM = "Unit" for identifier resolution.
    if (selectedItem && typeof selectedItem === 'object') {
      updateSnapshotWithSelectedItem(selectedItem, snapshot, handleChange, touchedFieldsRef, key, convertOptimisticPrice);
    }
    // Notify parent for callout execution — pass computed snapshot (not stale React state).
    // applyUpdates updates valuesRef synchronously so submitLine always reads the latest
    // values even if React hasn't re-rendered yet when Enter is pressed.
    const calloutPromise = onFieldChange?.(key, val, snapshot, (updates, forceFields = new Set()) => {
      // Don't let the callout overwrite the field being typed: a cascade can echo
      // it back normalized (e.g. rate "11." -> 11), erasing in-progress decimals.
      const derived = { ...updates };
      delete derived[key];
      const next = applyCalloutUpdates(valuesRef.current, derived, forceFields, key, touchedFieldsRef.current);
      valuesRef.current = next;
      setValues(next);
    });
    if (calloutPromise instanceof Promise) {
      pendingCalloutsRef.current.push(calloutPromise);
      calloutPromise.finally(() => {
        pendingCalloutsRef.current = pendingCalloutsRef.current.filter(p => p !== calloutPromise);
      });
    }
  }, [handleChange, onFieldChange, values, fieldMap, convertOptimisticPrice]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleConfirm();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  // Mutable flag shared into renderInlineAddCell so only the FIRST rendered input
  // gets the autofocus ref. An object (not a bare boolean) so the callee can flip it.
  const firstInputCtx = { assigned: false };

  return (
    <TableRow ref={rowRef} data-testid="inline-add-row" className="bg-status-info/30 border-t border-primary/20">
      {/* ETP-4735 — matches the leading CHEVRON_COLUMN_WIDTH <col> renderLinesColgroup
          reserves when hasDimensionsPanel. A <col> alone doesn't reserve visual space —
          table column widths/positions are driven by the actual cells present in a row,
          so without this empty cell every cell after it (product, movementQuantity, …)
          renders one column-slot too far left relative to InlineLinesPanel's rows above. */}
      {hasDimensionsPanel && <TableCell aria-hidden="true" style={{ width: CHEVRON_COLUMN_WIDTH }} data-testid="TableCell__eb5261" />}
      {/* Saving spinner — aligned with selection checkbox column (empty when idle). */}
      {selectable && (
        <TableCell className="w-10 px-1" data-testid="TableCell__eb5261">
          <div className="flex items-center justify-center h-7">
            {isSaving && <Loader2
              className="h-4 w-4 animate-spin text-muted-foreground"
              aria-label="Saving line"
              data-testid="Loader2__eb5261" />}
          </div>
        </TableCell>
      )}
      {columns.map(col => renderInlineAddCell(col, {
        fieldMap, values, t, locale, firstInputCtx, firstInputRef,
        selectorContext, token, apiBaseUrl, entity, catalogs,
        handleChange, handleFieldChange, handleKeyDown,
        touchedFieldsRef, invalidFields, specName,
      }))}
      {/* Skip action cells in inlineEditable add-row mode — actions belong to
          InlineLinesPanel's 160px slot, not to separate columns here. */}
      {!ilpTrailing && (hoverRowActions ? (
        <>
          <TableCell className="w-10" data-testid="TableCell__eb5261" />
          {hoverRowHasDelete && <TableCell className="w-10" data-testid="TableCell__eb5261" />}
        </>
      ) : (
        <>
          {hasDeleteColumn && <TableCell className="w-10" data-testid="TableCell__eb5261" />}
          {hasCloneColumn && <TableCell className="w-10" data-testid="TableCell__eb5261" />}
        </>
      ))}
      {!ilpTrailing && hasQuickActionsColumn && <TableCell className="w-10" data-testid="TableCell__eb5261" />}
      {ilpReservesActionSlot && <TableCell aria-hidden="true" data-testid="TableCell__eb5261" />}
      {ilpTrailing && <TableCell aria-hidden="true" data-testid="TableCell__eb5261" />}
    </TableRow>
  );
});

function getFieldLabel(field, t, col, locale) {
  const f = field ?? col;
  const pinned = f?.labels?.[locale] ?? f?.labels?.en_US;
  if (pinned) return pinned;
  return field ? (t(field.column) ?? field.label ?? field.key) : (t(col.column) ?? col.label ?? col.key);
}

function formatDerivedCellValue(identVal, rawVal, isTwoDecimalDerived) {
  let displayVal = identVal || rawVal;
  if (isTwoDecimalDerived && displayVal != null && displayVal !== '') {
    const n = typeof displayVal === 'string' ? Number.parseFloat(displayVal) : displayVal;
    if (Number.isFinite(n)) {
      displayVal = n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true });
    }
  }
  return displayVal;
}

function updateSnapshotWithSelectedItem(selectedItem, snapshot, handleChange, touchedFieldsRef, key, convertOptimisticPrice) {
  for (const [topField, topVal] of Object.entries(selectedItem)) {
    if (topField === 'id' || topField === '_aux' || topField === 'label'
      || topField === 'name' || topField === 'searchKey'
      || typeof topVal === 'object' || topVal === null) continue;
    // Price from the document's price list. Mapping depends on price list type:
    //   - Gross list (isTaxIncluded=true): standardPrice is the gross price → grossUnitPrice
    //   - Net list   (isTaxIncluded=false): standardPrice is the net price   → unitPrice
    // Mark the target field as touched so the callout does not overwrite it (some callouts
    // look up the price themselves and may return a different value from another price list).
    if (topField === 'standardPrice' && topVal != null) {
      // Apply the header's currency conversion (if any) up front so the price never
      // renders in the org base currency for a beat before the callout corrects it.
      const priceVal = convertOptimisticPrice ? convertOptimisticPrice(topVal) : topVal;
      const isGross = selectedItem?.isTaxIncluded !== false;
      if (isGross) {
        snapshot['grossUnitPrice'] = priceVal;
        handleChange('grossUnitPrice', priceVal);
        snapshot['grossListPrice'] = priceVal;
        handleChange('grossListPrice', priceVal);
        touchedFieldsRef.current.add('grossUnitPrice');
        touchedFieldsRef.current.add('grossListPrice');
      } else {
        snapshot['unitPrice'] = priceVal;
        handleChange('unitPrice', priceVal);
        snapshot['listPrice'] = priceVal;
        handleChange('listPrice', priceVal);
        touchedFieldsRef.current.add('unitPrice');
        touchedFieldsRef.current.add('listPrice');
      }
      continue;
    }
    const ctxKey = `${key}_${topField}`;
    if (!(ctxKey in snapshot)) {
      // Keep display hints only in the callout snapshot.
      // Persisting these transient keys in row state can leak them into POST payloads.
      snapshot[ctxKey] = topVal;
    }
  }
}

function resolveNumericFieldValue(f, val) {
  if (val === '' || val == null) {
    if (f.defaultValue !== undefined) return f.defaultValue;
    if (f.min !== undefined) return f.min;
    return val;
  }
  const raw = String(val);
  if (f.type === 'integer') {
    const parsed = Number.parseInt(raw, 10);
    return Number.isNaN(parsed) ? val : parsed;
  }
  // ETP-5107 — comma-aware: raw may still be a user-typed string that
  // bypassed MaskedAmountInput's own masking (e.g. a value set outside the
  // input, or a pasted value coerced elsewhere upstream).
  const { value, isValid } = parseLocaleNumber(raw);
  return isValid && value != null ? value : val;
}

function coerceFieldValues(valuesRef, fields) {
  const coercedValues = { ...valuesRef.current };
  for (const f of fields) {
    if (!NUMERIC_FIELD_TYPES.has(f.type)) continue;
    coercedValues[f.key] = resolveNumericFieldValue(f, coercedValues[f.key]);
  }
  return coercedValues;
}

/**
 * Inline field that shows selected value and opens modal on click/focus.
 */
function LookupField({ value, fieldKey, placeholder, selectorUrl, selectorContext, token, onSelect, onKeyDown, inputRef, title, drawerKey = 'default', isInvalid }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const Drawer = LOOKUP_DRAWERS[drawerKey] || LOOKUP_DRAWERS.default;

  // Forward ref so parent can focus this field
  useEffect(() => {
    if (inputRef) inputRef.current = btnRef.current;
  }, [inputRef]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        data-testid={fieldKey ? `inline-add-field-${fieldKey}` : undefined}
        // Marks "nothing picked yet" the way Radix's own triggers do. The
        // button's text is its PLACEHOLDER while empty ("Producto"), so
        // anything reading the rendered text as the current value — the
        // walkthrough's `targetValue` gate, an e2e assertion — would read a
        // placeholder as a filled field. Presence of the attribute is the
        // signal; its value is deliberately empty.
        {...(value ? {} : { 'data-placeholder': '' })}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          // Once a value is selected, Enter should bubble up so the row's
          // handleKeyDown can save the line. Space still re-opens the picker
          // for re-selection.
          if (e.key === 'Enter' && value) {
            if (onKeyDown) onKeyDown(e);
            return;
          }
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(true); }
          else if (onKeyDown) onKeyDown(e);
        }}
        className={`w-full h-8 text-sm rounded-md border bg-card px-2 text-left flex items-center gap-2 focus:ring-2 focus:outline-none transition-colors${isInvalid ? ' border-destructive focus:ring-destructive' : ' border-input hover:border-primary/50 focus:ring-primary'}`}
      >
        <Search
          className="h-3.5 w-3.5 text-muted-foreground shrink-0"
          data-testid="Search__eb5261" />
        {value ? (
          <span className="truncate text-foreground">{value}</span>
        ) : (
          <span className="truncate text-muted-foreground">{placeholder}</span>
        )}
      </button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        onSelect={(item) => {
          onSelect(item);
          setOpen(false);
          // Restore focus to the field button so keyboard users do not lose
          // tab position after the picker closes (Enter then saves the row).
          setTimeout(() => btnRef.current?.focus(), 0);
        }}
        selectorUrl={selectorUrl}
        selectorContext={selectorContext}
        token={token}
        title={title || undefined}
        data-testid="Drawer__eb5261" />
    </>
  );
}

/**
 * Small button that opens the default product lookup drawer for lookup-enabled fields.
 */
function LookupButton({ selectorUrl, selectorContext, token, onSelect, title }) {
  const [open, setOpen] = useState(false);
  const DefaultDrawer = LOOKUP_DRAWERS.default;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-8 w-8 flex items-center justify-center rounded border border-input hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors shrink-0"
        title={title || ''}
      >
        <Search className="h-3.5 w-3.5" data-testid="Search__eb5261" />
      </button>
      <DefaultDrawer
        open={open}
        onClose={() => setOpen(false)}
        onSelect={(item) => { onSelect(item); setOpen(false); }}
        selectorUrl={selectorUrl}
        selectorContext={selectorContext}
        token={token}
        title={title || undefined}
        data-testid="ProductSearchDrawer__eb5261" />
    </>
  );
}

function computeSelectionState(filteredData, selectedRows, isRowSelectable) {
  const allSelected = filteredData.length > 0 && selectedRows.size === filteredData.length;
  const someSelected = selectedRows.size > 0 && !allSelected;

  const selectableData = isRowSelectable ? filteredData.filter(isRowSelectable) : filteredData;
  return { allSelected, someSelected, selectableData };
}

function oneIfTrue(bool) {
  return bool ? 1 : 0;
}

// ETP-5182 — column widths used to jump on every sort/re-fetch in normal
// list-header mode (`hideHeader` false, e.g. Contacts): this returned
// `undefined` for that mode, so the `<Table>` element got no `table-layout`
// at all and the browser fell back to `table-layout: auto`, which recomputes
// every column's width from ALL currently-rendered body-row content on every
// re-render. Sorting re-fetches a different page of rows (backend-driven sort
// via `onFilterChange`, see `filteredData` below), so the visible content per
// column changed and every column width recalculated and visibly jumped.
// `table-layout: fixed` derives column widths from the first row's cells
// (here, the header row — `<TableHeader>` precedes `<TableBody>` in the DOM)
// ONCE, and does not recompute them from body content afterward, so applying
// it unconditionally (not just when hideHeader) stops the resize in both
// modes. Exported so `DataTable.helpers.vitest.jsx` can assert this directly.
export function getTableContainerStyle() {
  return { tableLayout: 'fixed', width: '100%' };
}

function renderRowActionHeaderCells(hoverRowActions, onDeleteRow, legacyDeleteEnabled, onCloneRow, quickActionsEnabled) {
  return hoverRowActions ? (
    <>
      <TableHead className="w-10 px-2" data-testid="TableHead__eb5261" />
      {onDeleteRow && <TableHead className="w-10 px-2" data-testid="TableHead__eb5261" />}
    </>
  ) : (
    <>
      {legacyDeleteEnabled && <TableHead className="w-10 px-2" data-testid="TableHead__eb5261" />}
      {onCloneRow && !quickActionsEnabled && <TableHead className="w-10 px-2" data-testid="TableHead__eb5261" />}
    </>
  );
}

function renderRowActionFooterCells(hoverRowActions, onDeleteRow, legacyDeleteEnabled, onCloneRow, quickActionsEnabled) {
  return hoverRowActions ? (
    <>
      <TableCell data-testid="TableCell__eb5261" />
      {onDeleteRow && <TableCell data-testid="TableCell__eb5261" />}
    </>
  ) : (
    <>
      {legacyDeleteEnabled && <TableCell data-testid="TableCell__eb5261" />}
      {onCloneRow && !quickActionsEnabled && <TableCell data-testid="TableCell__eb5261" />}
    </>
  );
}

function isQuickActionsEnabled(rowQuickActions) {
  if (!rowQuickActions || rowQuickActions.enabled === false) return false;
  // ETP-5268 — a window that gates every mutating action behind `readOnly`
  // (e.g. a view-only GO tenant window) and configures neither an
  // email/send gate nor any menuActions ends up mounting a RowQuickActions
  // pill that renders ZERO buttons for every row: Edit/Clone/Delete are
  // unconditionally hidden by `readOnly` (see RowQuickActions.jsx), and
  // Email/the kebab are the only actions `readOnly` doesn't touch. Reserving
  // a whole actions column — width, header cell, the last data column's
  // hover-fade — for a pill that will never show anything left a dead
  // ~200px gap at the end of every genuinely read-only window (caught live
  // on /matched-purchase-invoices). Skip the column entirely in that case.
  if (rowQuickActions.readOnly) {
    const hasEmailAction = !!rowQuickActions.documentPreview
      || (!!rowQuickActions.sendDocument && rowQuickActions.sendDocument.enabled !== false);
    const hasMenuActions = typeof rowQuickActions.menuActions === 'function'
      || (Array.isArray(rowQuickActions.menuActions) && rowQuickActions.menuActions.length > 0);
    if (!hasEmailAction && !hasMenuActions) return false;
  }
  return true;
}

/**
 * `rowHoverStyle` picks how a clickable row reacts to hover:
 *   - `tint` (default) tints the background, the behaviour every grid has today.
 *   - `elevated` lifts the row instead — an opaque background plus a drop shadow
 *     and `z-10`, so the shadow spills over the neighbouring row separators. Used
 *     by card-like lists (Accounts) where the row reads as a raised surface.
 * Selection always wins over hover, in both styles.
 */
function getRowClassName({
  onRowClick, onNavigate, isChecked, selectedRowBg, selectedId, row, isSelectedLine,
  rowHoverStyle = 'tint',
}) {
  const clickable = onRowClick || onNavigate;
  const elevated = rowHoverStyle === 'elevated';
  // `bg-card` is what makes the drop shadow readable, but it competes with the
  // selection backgrounds below on the same CSS property (Tailwind resolves that
  // by stylesheet order, not by class order), so only opt in when no selection
  // state is painting the row.
  const selectionPainted = isChecked || isSelectedLine || (selectedId != null && row.id === selectedId);
  let hoverClass;
  if (isSelectedLine) {
    hoverClass = 'hover:bg-muted';
  } else if (!clickable) {
    hoverClass = '';
  } else if (elevated) {
    hoverClass = 'hover:z-10 hover:bg-card hover:shadow-lg';
  } else {
    hoverClass = 'hover:bg-muted/50';
  }
  return [
    'h-12 group/row',
    elevated ? 'relative transition-shadow' : 'transition-colors',
    elevated && !selectionPainted ? 'bg-card' : '',
    clickable ? 'cursor-pointer' : 'cursor-default',
    isChecked ? selectedRowBg : '',
    selectedId != null && row.id === selectedId ? 'bg-primary/10' : '',
    isSelectedLine ? 'bg-muted ring-1 ring-focus-ring' : '',
    hoverClass,
  ].filter(Boolean).join(' ');
}

// Sums the pixel widths reserved in the fixed-layout <colgroup> for the
// selection checkbox column and every row-action slot (hover actions, legacy
// delete/clone, quick actions), mirroring the 40px/48px/160px slots rendered
// by InlineLinesPanel and the row-action cells in the table body. Extracted
// from a single chained sum of ternaries so each conditional slot keeps its
// own branch instead of adding flat complexity to the caller.
function computeActionColsWidthPx({
  selectable, ilpTrailing, hoverRowActions, onDeleteRow, legacyDeleteEnabled,
  onCloneRow, quickActionsEnabled, ilpReservesActionSlot, hasDimensionsPanel,
  // ETP-5268 follow-up — the quick-actions slot is no longer always 40px (see
  // quickActionsReservedWidthPx): when it isn't allowed to float over the last
  // column, it reserves exactly this window's own button count. Defaults to 40
  // (the floating/pinned-icon width) so callers that never pass it — none left
  // today, but keeps this function's own contract honest — still get the old
  // literal-pixel answer instead of NaN.
  quickActionsColWidthPx = 40,
}) {
  const showHoverActions = !ilpTrailing && hoverRowActions;
  const showHoverDelete = showHoverActions && onDeleteRow;
  const showLegacyDelete = !ilpTrailing && !hoverRowActions && legacyDeleteEnabled;
  const showLegacyClone = !ilpTrailing && !hoverRowActions && onCloneRow && !quickActionsEnabled;
  const showQuickActions = !ilpTrailing && quickActionsEnabled;

  // ETP-4735's leading CHEVRON_COLUMN_WIDTH <col> (see renderLinesColgroup) is a
  // real, literal-pixel column too — omitting it here would leave growColumnWidth()
  // computing grow columns as if that 44px were still free, overflowing the table
  // by 44px in every hasDimensionsPanel window (table-layout: fixed doesn't clamp
  // <col> widths back down to the table's own 100%).
  return oneIfTrue(hasDimensionsPanel) * CHEVRON_COLUMN_WIDTH
    + oneIfTrue(selectable) * 40
    + oneIfTrue(showHoverActions) * 40
    + oneIfTrue(showHoverDelete) * 40
    + oneIfTrue(showLegacyDelete) * 40
    + oneIfTrue(showLegacyClone) * 40
    + oneIfTrue(showQuickActions) * quickActionsColWidthPx
    + oneIfTrue(ilpReservesActionSlot) * ACTION_SLOT_WIDTH_PX
    + oneIfTrue(ilpTrailing) * 48;
}

/**
 * Renders the <colgroup> that drives column widths in add-row-only mode
 * (hideHeader=true), mirroring InlineLinesPanel's flex layout with fixed
 * pixel widths for flex-grow:0 columns and calc()-based widths (via
 * growColumnWidth) for flex-grow:1 columns — see growColumnWidth() above for
 * why grow columns can't be left width-less. Returns null when the table
 * renders its own header instead (renderColumnHeaderCell drives widths via
 * the real <TableHead> cells there — see its own comment for why that path
 * deliberately never uses a percentage/`calc()` width the way this one
 * does: those only resolve reliably when the table is fed by a colgroup
 * whose own container isn't itself waiting on the very widths being
 * computed — true here, NOT true of the header path, which must also work
 * when the table needs to grow past its container). Extracted from
 * DataTable's render body so this mode's branching doesn't add nesting to
 * the parent's complexity.
 *
 * ETP-4735 — when the entity has a dimensionsPanel column, InlineLinesPanel's rows
 * reserve a leading CHEVRON_COLUMN_WIDTH slot (expand-chevron) before the checkbox.
 * This colgroup must reserve the identical slot so the add-row's inputs land under
 * the same columns as the rows above instead of drifting left by that width.
 */
export function renderLinesColgroup({
  hideHeader, selectable, visibleColumns, colFlexSpecs, fixedColsTotalPx, growCount,
  ilpTrailing, hoverRowActions, onDeleteRow, legacyDeleteEnabled, onCloneRow,
  quickActionsEnabled, ilpReservesActionSlot, hasDimensionsPanel,
  // ETP-5268 follow-up — see computeActionColsWidthPx's own doc: the
  // quick-actions slot isn't always 40px once reserved-width mode sizes it to
  // this window's own button count. Defaults to 40 so every existing hideHeader
  // caller (none of which mount RowQuickActions in their companion table today)
  // keeps its old literal-pixel answer unchanged.
  quickActionsColWidthPx = 40,
}) {
  if (!hideHeader) return null;
  return (
    <colgroup>
      {hasDimensionsPanel && <col style={{ width: CHEVRON_COLUMN_WIDTH }} />}
      {selectable && <col style={{ width: 40 }} />}
      {visibleColumns.map((col, colIdx) => {
        if (col.headClass) return <col key={col.key} />;
        const { grow, basis } = colFlexSpecs[colIdx];
        return grow === 0
          ? <col key={col.key} style={{ width: basis }} />
          : <col key={col.key} style={{ width: growColumnWidth(basis, fixedColsTotalPx, growCount) }} />;
      })}
      {/* In inlineEditable add-row mode (ilpTrailing), all row actions live
          inside InlineLinesPanel's 160px action slot — never add separate
          action cols here or the flex columns shrink by 40px. */}
      {!ilpTrailing && hoverRowActions && <col style={{ width: 40 }} />}
      {!ilpTrailing && hoverRowActions && onDeleteRow && <col style={{ width: 40 }} />}
      {!ilpTrailing && !hoverRowActions && legacyDeleteEnabled && <col style={{ width: 40 }} />}
      {!ilpTrailing && !hoverRowActions && onCloneRow && !quickActionsEnabled && <col style={{ width: 40 }} />}
      {!ilpTrailing && quickActionsEnabled && <col style={{ width: quickActionsColWidthPx }} />}
      {ilpReservesActionSlot && <col style={{ width: ACTION_SLOT_WIDTH_PX }} />}
      {ilpTrailing && <col style={{ width: 48 }} />}
    </colgroup>
  );
}

/**
 * Renders the <colgroup> that drives column widths for the plain document-list
 * mode (real header, own scroll) once its header row moves out of this table —
 * see StickyHeaderRow just below for why. Mirrors renderColumnHeaderCell's own
 * width computation (`columnMinWidthPx`, `col.headClass` opt-out) exactly, one
 * <col> per header cell in the same order, so the two tables' columns land at
 * identical pixel widths without the header row needing to be present here to
 * drive table-layout: fixed.
 */
function renderMainColgroup({
  hasDimensionsPanel, selectable, visibleColumns, hoverRowActions, onDeleteRow,
  legacyDeleteEnabled, onCloneRow, quickActionsEnabled, quickActionsColWidthPx,
}) {
  return (
    <colgroup>
      {hasDimensionsPanel && <col style={{ width: CHEVRON_COLUMN_WIDTH }} />}
      {selectable && <col style={{ width: 40 }} />}
      {visibleColumns.map((col, colIdx) => (
        <col key={col.key} style={col.headClass ? undefined : { width: columnMinWidthPx(col, colIdx) }} />
      ))}
      {hoverRowActions && <col style={{ width: 40 }} />}
      {hoverRowActions && onDeleteRow && <col style={{ width: 40 }} />}
      {!hoverRowActions && legacyDeleteEnabled && <col style={{ width: 40 }} />}
      {!hoverRowActions && onCloneRow && !quickActionsEnabled && <col style={{ width: 40 }} />}
      {quickActionsEnabled && <col style={{ width: quickActionsColWidthPx }} />}
    </colgroup>
  );
}

/**
 * Keeps the document-list header visible while its body scrolls vertically —
 * "necesito que se quede siempre visible los nombres de las columnas [...] sin
 * romper paginación ni nada" (ETP-5268 follow-up).
 *
 * WHY A SEPARATE TABLE, NOT `sticky` ON THIS TABLE'S OWN <thead>: this list's
 * vertical scroll is owned by an ANCESTOR (ScrollPane, outside DataTable
 * entirely — its own `min-h-0 flex-1 overflow-auto` is what actually scrolls;
 * see ListView.jsx's ListTableRegion doc comment). Between `<thead>` and that
 * real scroll container sits THIS table's own horizontal-scroll wrapper
 * (schema_forge_core's table.jsx, `overflow-auto`) — required for the
 * mirror-scrollbar mechanism above. Per the CSS overflow spec, when one axis is
 * `visible` and the other isn't, the `visible` one is silently forced to `auto`
 * too (verified live: even `overflow-y: visible !important` inline on that
 * exact node still computed as `auto`) — so that wrapper can never be made a
 * horizontal-only scroller. `position: sticky` resolves against the NEAREST
 * such container regardless of whether it ever actually overflows, so `<thead
 * sticky>` inside it just travels with the page instead of pinning (confirmed
 * live: it scrolled fully off-screen, top: -419px).
 *
 * The only way around that without giving this element a bounded height (which
 * would make it start scrolling body content itself, an `ownScroll`-style
 * layout that disables ScrollPane's `onReachBottom` infinite-load — explicitly
 * out of scope, see the git history on this function) is to keep the header
 * OUTSIDE that wrapper's DOM subtree entirely. This renders it in its own
 * `<table>`, sticky against ScrollPane directly, and mirrors the body's
 * horizontal scroll position onto it via a transform — imperatively, via a
 * plain scroll listener, not React state, for the same reason
 * HorizontalScrollThumb below is its own component: a state update on every
 * scroll frame would re-render the whole (unmemoized) row list.
 */
function StickyHeaderRow({ elRef, attachSeq, children }) {
  const tableRef = useRef(null);

  useEffect(() => {
    const el = elRef.current;
    const tableEl = tableRef.current;
    if (!el || !tableEl) return undefined;
    const sync = () => {
      tableEl.style.transform = `translateX(${-el.scrollLeft}px)`;
    };
    sync();
    el.addEventListener('scroll', sync, { passive: true });
    return () => el.removeEventListener('scroll', sync);
    // `attachSeq` bumps whenever useHorizontalScrollGeometry's callback ref
    // re-attaches to a new scrolling element (e.g. after a remount) — re-run
    // to bind the listener to the current `el`, exactly like
    // HorizontalScrollThumb's own effect below.
  }, [elRef, attachSeq]);

  return (
    <div
      className="sticky top-0 z-20 overflow-hidden bg-card"
      data-testid="StickyHeaderRow__eb5261">
      {/* `width: '100%'` matches getTableContainerStyle() on the body table below —
          needed for more than symmetry: with `table-layout: fixed`, a <colgroup>
          whose widths sum to LESS than the table's own width gets stretched
          proportionally to fill it (verified live), so without this the header's
          columns sized to the raw colgroup sum while the body's — width: 100% —
          stretched wider, drifting further apart column by column. */}
      <table ref={tableRef} style={{ tableLayout: 'fixed', width: '100%', willChange: 'transform' }}>
        {children}
      </table>
    </div>
  );
}

/**
 * Renders the header for a `multiField` column as N independently sortable
 * segments joined by `col.partSeparator` (default ' & '). Each segment sorts on
 * its own `part.key` (a real NEO field), reusing the same none→asc→desc→clear
 * cycle as any other column via `onSort(part.key)`. The direction arrow shows
 * only on the currently active part (single active part at a time).
 */
function renderMultiFieldHeaderCell(col, { sortColumn, sortDirection, onSort, locale, t, headStyle }) {
  const separator = col.partSeparator ?? ' & ';
  return (
    <TableHead
      key={col.key}
      data-testid={`column-header-${col.key}`}
      // `col.headClass` is honoured here for the same reason the single-label branch below
      // honours it: a window that pins column widths (financial-account's Figma layout) must
      // keep them when the header gains segments. Dropping it silently collapsed the column
      // to auto width, which no Product test caught because Product declares no headClass.
      className={['align-middle', col.headClass || ''].filter(Boolean).join(' ')}
      style={headStyle}
    >
      {/* ETP-5281 — same cap as the single-label branch (renderColumnHeaderCell):
          a multiField header ("Tipo & IBAN") had no width ceiling either, so it
          could overflow into the next header cell exactly like a plain label.
          Truncating the whole joined string as one unit (rather than shrinking
          each part individually) is a deliberate, proportionate fix — this
          layout is niche (today, only financial-account's headClass-pinned
          340px "Tipo & IBAN" column uses it) and per-part truncation would need
          restructuring every part into its own flex item, not worth it for a
          case that isn't the reported overlap. */}
      <span className="inline-flex max-w-full min-w-0 items-center overflow-hidden text-ellipsis whitespace-nowrap text-xs leading-4 font-semibold text-text-primary tracking-normal">
        {col.parts.map((part, partIdx) => {
          const partLabel = resolveColumnLabel(part, locale, t);
          const partSorted = sortColumn === part.key;
          const partSortable = onSort && part.sortable !== false;
          const arrow = partSorted
            ? <span className="text-primary/70 pointer-events-none ml-0.5">{sortDirection === 'asc' ? '▲' : '▼'}</span>
            : null;
          return (
            <span key={part.key} className="inline-flex items-center">
              {partIdx > 0 && (
                <span className="mx-0.5 font-normal text-text-primary/40 select-none">{separator}</span>
              )}
              {partSortable ? (
                <button
                  type="button"
                  data-testid={`column-header-sort-${part.key}`}
                  className="inline-flex items-center cursor-pointer select-none transition-colors bg-transparent border-0 p-0 font-semibold text-inherit"
                  onClick={() => onSort(part.key)}
                >
                  {partLabel}
                  {arrow}
                </button>
              ) : (
                <span
                  data-testid={`column-header-sort-${part.key}`}
                  className="inline-flex items-center"
                >
                  {partLabel}
                  {arrow}
                </span>
              )}
            </span>
          );
        })}
      </span>
    </TableHead>
  );
}

/**
 * Renders the label + optional computed-freshness-hint + optional sort-arrow
 * markup shared by both the sortable (`<button>`) and non-sortable (`<span>`)
 * variants of a single-label column header in `renderColumnHeaderCell`.
 * Extracted to remove the ~22-line duplicated block SonarQube flagged
 * between the two branches — pure JSX extraction, renders the exact same
 * DOM as before in both call sites.
 */
function renderHeaderLabelContent(colLabel, col, isSorted, sortDirection, sortArrowClass) {
  return (
    <>
      <span className="inline-flex max-w-full min-w-0 items-center gap-1 align-middle">
        <span className="min-w-0 truncate" title={typeof colLabel === 'string' ? colLabel : undefined}>{colLabel}</span>
        {col.computed?.mode === 'stored' && (
          <span className="shrink-0">
            <ComputedFreshnessHint computed={col.computed} data-testid="ComputedFreshnessHint__eb5261" />
          </span>
        )}
      </span>
      {isSorted && (
        <span className={`absolute top-1/2 -translate-y-1/2 text-primary/70 pointer-events-none ${sortArrowClass}`}>{sortDirection === 'asc' ? '▲' : '▼'}</span>
      )}
    </>
  );
}

/**
 * Renders a single sortable column header cell, including the sort-direction
 * arrow. Extracted from the `visibleColumns.map(...)` callback in DataTable's
 * header row so its onSort/isSorted branching lives in its own function.
 */
function renderColumnHeaderCell(col, colIdx, { sortColumn, sortDirection, onSort, locale, t }) {
  const colLabel = resolveColumnLabel(col, locale, t);
  const isSorted = sortColumn === col.key;
  const isSortable = col.sortable !== false;
  // Hoisted once (was repeated inline 4x below): a plain lookup, not a branch,
  // just avoids recomputing `NUMERIC_FIELD_TYPES.has(col.type)` at every call
  // site and keeps the ternaries that use it readable.
  const isNumeric = NUMERIC_FIELD_TYPES.has(col.type);
  // ETP-5281, follow-up ETP-5268 — a real `width` (not `minWidth`, which
  // `table-layout: fixed` ignores entirely — verified live: every column
  // rendered at an identical equal share of the container regardless of its
  // minWidth, silently truncating labels like "Nº documento" the moment the
  // viewport got tight). Deliberately a plain pixel value, never a
  // percentage/`calc()`: also verified live, a `calc(100% - Npx)` width set
  // on a <th> (or even on a <col> in this table's own <colgroup>) resolves
  // to a flat 0px the moment the column's minimums genuinely need the table
  // to grow past its container — the container's own width is `width: 100%`
  // of ITS parent, so once the table's used width depends on the very
  // column widths being resolved from a percentage OF that width, the
  // browser hits a circular reference and gives up at 0 instead of erring
  // toward the specified minimum. A plain px value has no such dependency,
  // so it floors reliably in every case, including the one this whole fix
  // exists for. The cost: on a wide viewport, columns no longer stretch to
  // fill leftover space and just leave it blank after the last one — an
  // acceptable, honest trade-off next to silently losing the last column's
  // data or every column's width collapsing to 0.
  // Skipped when `col.headClass` is set: that opt-in chrome already pins the
  // column's own width (e.g. financial-account's Figma-pinned Cuentas grid,
  // artifacts/financial-account/custom/AccountsHeaderTable.jsx, which narrows
  // `currency`/`country` below this type's generic floor) — CSS always renders
  // at least `min-width` regardless of a smaller `width`, so a competing
  // default here would silently widen a deliberately narrower pinned column.
  const headStyle = col.headClass ? undefined : { width: columnMinWidthPx(col, colIdx) };
  // `multiField` columns expose N constituent fields as independently
  // sortable header segments (e.g. "Identifier & Name"); each part cycles the
  // sort on its own NEO field key. Non-multiField columns keep the single-label
  // branch below untouched.
  if (Array.isArray(col.parts) && col.parts.length > 0) {
    return renderMultiFieldHeaderCell(col, { sortColumn, sortDirection, onSort, locale, t, headStyle });
  }
  const sortArrowClass = isNumeric
    ? 'left-0 -translate-x-full pr-0.5'
    : 'right-0 translate-x-full pl-0.5';
  return (
    <TableHead
      key={col.key}
      data-testid={`column-header-${col.key}`}
      className={[
        'align-middle',
        isNumeric ? 'text-right' : '',
        // Opt-in fixed-width / per-column header styling. Needed by list windows
        // whose design pins column widths (e.g. financial-account's Figma layout,
        // where the "Cuenta" header must align with the row avatar). Absent =
        // unchanged auto layout, so every existing window is unaffected.
        col.headClass || '',
      ].filter(Boolean).join(' ')}
      style={headStyle}
    >
      {onSort && isSortable ? (
        <button
          type="button"
          // ETP-5281 — `max-w-full` caps this at the header cell's (now
          // minWidth-floored) available width WITHOUT changing `inline-block`'s
          // shrink-to-fit sizing: a label that already fits is completely
          // unaffected (the cap never engages, so the sort arrow — anchored to
          // this element's own edge below — stays exactly where it always was,
          // right next to the label). Only a label that would otherwise overflow
          // gets capped, at which point the inner label span's own `truncate`
          // (below) shows the "…". Do NOT swap this to `block`/`w-full` — that
          // would ALSO stretch the (common, non-overflowing) short-label case to
          // the cell's full width, dragging the arrow away from the label.
          className={`relative inline-block max-w-full text-xs leading-4 font-semibold text-text-primary tracking-normal cursor-pointer select-none transition-colors bg-transparent border-0 p-0 ${isNumeric ? 'text-right' : 'text-left'}`}
          onClick={() => onSort(col.key)}
        >
          {renderHeaderLabelContent(colLabel, col, isSorted, sortDirection, sortArrowClass)}
        </button>
      ) : (
        <span className={`relative inline-block max-w-full text-xs leading-4 font-semibold text-text-primary tracking-normal${isNumeric ? ' text-right' : ''}`}>
          {renderHeaderLabelContent(colLabel, col, isSorted, sortDirection, sortArrowClass)}
        </span>
      )}
    </TableHead>
  );
}

// Shared delete-click handler for both the hover-actions delete button and
// the legacy delete button: marks the row as "deleting" for the spinner,
// awaits the caller's onDeleteRow, then always clears the flag. Extracted
// so the try/finally bookkeeping isn't duplicated (and doesn't add nested
// complexity) in each button's onClick in TableDataRow.
async function handleDeleteRowClick(row, onDeleteRow, setDeletingRows) {
  const deleteKey = row.id;
  setDeletingRows(prev => ({ ...prev, [deleteKey]: true }));
  try {
    await onDeleteRow(row);
  } finally {
    setDeletingRows(prev => {
      const next = { ...prev };
      delete next[deleteKey];
      return next;
    });
  }
}

/**
 * Renders a single data row: the selection checkbox, visible-column cells,
 * row-action cells (hover edit/delete, or legacy delete/clone), and the
 * quick-actions overlay cell. Extracted from the `filteredData.map(...)` body
 * that used to live inside `DataTable` so per-row branching does not nest
 * inside — and inflate — the parent component's cognitive complexity.
 */
function TableDataRow({
  row,
  idx,
  selectable,
  isRowSelectable,
  isChecked,
  toggleRow,
  visibleColumns,
  renderCellValue,
  onRowClick,
  onNavigate,
  selectedRowBg,
  selectedId,
  selectedRowId,
  rowHoverStyle,
  editingRowId,
  handleRowActivation,
  hoverRowActions,
  onSaveRow,
  onCancelEdit,
  onEditRow,
  onDeleteRow,
  deletingRows,
  setDeletingRows,
  ui,
  legacyDeleteEnabled,
  onCloneRow,
  quickActionsEnabled,
  rowQuickActions,
  entity,
  apiBaseUrl,
  token,
  hasDimensionsPanel = false,
  quickActionsAllowHoverSticky = false,
  quickActionsColWidthPx = 0,
}) {
  const isSelectedLine = selectedRowId != null && row.id === selectedRowId;
  const rowDisabled = isRowSelectable && !isRowSelectable(row);

  return (
    <TableRow
      role="row"
      data-testid={`row-${row.id ?? idx}`}
      data-row-status={row.documentStatus}
      onClick={() => {
        if (editingRowId === row.id) return;
        handleRowActivation(row, idx);
      }}
      className={getRowClassName({
        onRowClick, onNavigate, isChecked, selectedRowBg, selectedId, row, isSelectedLine, rowHoverStyle,
      })}
    >
      {/* ETP-4735 — see the matching comment on InlineAddRow's leading cell. */}
      {hasDimensionsPanel && <TableCell aria-hidden="true" style={{ width: CHEVRON_COLUMN_WIDTH }} data-testid="TableCell__eb5261" />}
      {selectable && (
        <TableCell
          className="w-10 px-3"
          onClick={(e) => e.stopPropagation()}
          data-testid="TableCell__eb5261">
          <Checkbox
            checked={isChecked}
            disabled={rowDisabled}
            onChange={(e) => toggleRow(e, row)}
            onClick={(e) => e.stopPropagation()}
            data-testid="Checkbox__eb5261" />
        </TableCell>
      )}
      {visibleColumns.map((col, colIdx) => {
        return (
          <TableCell
            key={col.key}
            data-testid={`cell-${row.id ?? idx}-${col.key}`}
            data-value={row[col.key] ?? ''}
            className={[
              'text-sm',
              NUMERIC_FIELD_TYPES.has(col.type) ? 'text-right tabular-nums' : '',
              // Opt-in per-column cell styling, the body-side counterpart of
              // `col.headClass` (see renderColumnHeaderCell). Lets a window pin a
              // column's width so header and cells stay aligned. Absent = unchanged.
              col.cellClass || '',
            ].filter(Boolean).join(' ')}
            // ETP-5281 — mirrors the header's minWidth floor (renderColumnHeaderCell).
            // Body cells previously had NO width constraint in normal list mode, so
            // a long value in one column could push into the next column's space.
            // Skipped when `col.cellClass` is set (same reasoning as `headClass`
            // above): CSS always renders at least `min-width` regardless of a
            // smaller `width` class, so this default would otherwise override a
            // column that deliberately pins itself narrower (e.g. financial-account's
            // `currency`/`country` columns, pinned to 120px/160px below this type's
            // 192px selector-baseline floor).
            style={col.cellClass ? undefined : { minWidth: columnMinWidthPx(col, colIdx) }}
          >
            {renderCellValue(row, col)}
          </TableCell>
        );
      })}
      {hoverRowActions ? (
        <>
          <TableCell
            className="w-10 px-2"
            onClick={(e) => e.stopPropagation()}
            data-testid="TableCell__eb5261">
            {editingRowId === row.id ? (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onSaveRow?.(); }}
                className="h-8 w-8 flex items-center justify-center rounded-full text-[var(--status-success-fg)] hover:bg-[var(--status-success-bg)] transition-all"
                aria-label={ui('save')}
              >
                <Check className="h-5 w-5" aria-hidden="true" data-testid="Check__eb5261" />
              </button>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onEditRow) { onEditRow(row); }
                  else { handleRowActivation(row, idx); }
                }}
                className="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 h-8 w-8 flex items-center justify-center rounded-full text-[hsl(var(--text-disabled))] hover:bg-[hsl(var(--muted))] transition-all"
                aria-label={ui('edit')}
              >
                <Pencil className="h-5 w-5" aria-hidden="true" data-testid="Pencil__eb5261" />
              </button>
            )}
          </TableCell>
          {onDeleteRow && (
            <TableCell
              className="w-10 px-2"
              onClick={(e) => e.stopPropagation()}
              data-testid="TableCell__eb5261">
              {editingRowId === row.id ? (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onCancelEdit?.(); }}
                  className="h-8 w-8 flex items-center justify-center rounded-full text-[hsl(var(--text-disabled))] hover:bg-[hsl(var(--muted))] transition-all"
                  aria-label={ui('cancel')}
                >
                  <X className="h-5 w-5" aria-hidden="true" data-testid="X__eb5261" />
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!!deletingRows[row.id]}
                  onClick={async (e) => {
                    e.stopPropagation();
                    await handleDeleteRowClick(row, onDeleteRow, setDeletingRows);
                  }}
                  className="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 h-8 w-8 flex items-center justify-center rounded-full text-[hsl(var(--destructive))] hover:bg-[var(--status-destructive-bg)] transition-all"
                  aria-label={ui('deleteRowTooltip')}
                  data-testid={`row-delete-${row.id}`}
                >
                  {deletingRows[row.id]
                    ? <Loader2
                    className="h-5 w-5 animate-spin"
                    aria-hidden="true"
                    data-testid="Loader2__eb5261" />
                    : <Trash2 className="h-5 w-5" aria-hidden="true" data-testid="Trash2__eb5261" />}
                </button>
              )}
            </TableCell>
          )}
        </>
      ) : (
        <>
          {legacyDeleteEnabled && (
            <TableCell
              className="w-10 px-2"
              onClick={(e) => e.stopPropagation()}
              data-testid="TableCell__eb5261">
              <button
                type="button"
                disabled={!!deletingRows[row.id]}
                onClick={async () => {
                  await handleDeleteRowClick(row, onDeleteRow, setDeletingRows);
                }}
                className="h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                title={ui('deleteRowTooltip')}
                aria-label={ui('deleteRowTooltip')}
                data-testid={`row-delete-${row.id}`}
              >
                {deletingRows[row.id] ? <Loader2
                  className="h-3.5 w-3.5 animate-spin"
                  aria-hidden="true"
                  data-testid="Loader2__eb5261" /> : <Trash2 className="h-3.5 w-3.5" aria-hidden="true" data-testid="Trash2__eb5261" />}
              </button>
            </TableCell>
          )}
          {onCloneRow && !quickActionsEnabled && (
            // ETP-5281 — `overflow-visible` overrides the shared TableCell's new
            // default `overflow-hidden` (see packages/app-shell-core ui/table.jsx):
            // the tooltip below is `absolute bottom-full`, deliberately escaping
            // this cell's own box to float above the button, and would otherwise
            // get silently clipped.
            (<TableCell
              className="w-10 px-2 overflow-visible"
              onClick={(e) => e.stopPropagation()}
              data-testid="TableCell__eb5261">
              <div className="relative group/clonebtn flex items-center justify-center">
                <button
                  type="button"
                  onClick={() => onCloneRow(row)}
                  className="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 flex items-center justify-center rounded border border-border bg-card text-muted-foreground hover:text-foreground hover:border-border/80 transition-all"
                  style={{ width: 26, height: 26 }}
                  aria-label={ui('cloneOrderBtn')}
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" data-testid="Copy__eb5261" />
                </button>
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 text-xs font-medium text-primary-foreground bg-foreground rounded whitespace-nowrap opacity-0 group-hover/clonebtn:opacity-100 pointer-events-none transition-opacity z-10">
                  {ui('cloneOrderBtn')}
                </div>
              </div>
            </TableCell>)
          )}
        </>
      )}
      {quickActionsEnabled && (
        // ETP-5268 — the cell is always full-width, in normal flow (see
        // quickActionsColumnClassName's doc comment), which already carries
        // `relative` as RowQuickActions' `position: absolute; right-0` pill
        // containing block. `quickActionsColWidthPx` comes in as a prop
        // (computed ONCE in DataTable's own render) rather than
        // recalling `quickActionsReservedWidthPx(rowQuickActions)` here —
        // that read the same window-level `rowQuickActions` config on
        // every row, on every render, for an identical result each time.
        (<TableCell
          className={quickActionsColumnClassName('px-2', quickActionsAllowHoverSticky)}
          style={quickActionsColumnStyle(quickActionsColWidthPx)}
          onClick={(e) => e.stopPropagation()}
          data-testid="TableCell__eb5261">
          <RowQuickActions
            row={row}
            entity={entity}
            apiBaseUrl={apiBaseUrl}
            token={token}
            documentPreview={rowQuickActions.documentPreview}
            sendDocument={rowQuickActions.sendDocument}
            menuActions={rowQuickActions.menuActions}
            hideDeleteWhenComplete={rowQuickActions.hideDeleteWhenComplete}
            hideDeleteButton={rowQuickActions.hideDeleteButton}
            readOnly={rowQuickActions.readOnly}
            statusField={rowQuickActions.statusField}
            onEdit={rowQuickActions.onEdit}
            onClone={rowQuickActions.onClone}
            onEmail={rowQuickActions.onEmail}
            onDelete={rowQuickActions.onDelete}
            onMenuActionExecuted={rowQuickActions.onMenuActionExecuted}
            actionsConfig={rowQuickActions.actions}
            data-testid="RowQuickActions__eb5261" />
        </TableCell>)
      )}
    </TableRow>
  );
}

/**
 * Renders the table body content: the shared empty-state row when there is
 * no data (and no active add-row), otherwise one `TableDataRow` per visible
 * record. Extracted so the empty/rows branch and the per-row nesting it used
 * to wrap don't count against DataTable's own cognitive complexity.
 */
function renderTableRows({
  hideDataRows, filteredData, addRow, colSpan, hasActiveFilter, data, selectedRows,
  ...rowProps
}) {
  if (hideDataRows) return null;
  if (filteredData.length === 0 && !addRow?.active) {
    return (
      <TableRow data-empty-state="" data-testid="TableRow__eb5261">
        <TableCell colSpan={colSpan} className="p-0" data-testid="TableCell__eb5261">
          <EmptyState
            hasFilter={hasActiveFilter}
            totalCount={data.length}
            data-testid="EmptyState__eb5261" />
        </TableCell>
      </TableRow>
    );
  }
  return filteredData.map((row, idx) => (
    <TableDataRow
      key={row.id ?? idx}
      row={row}
      idx={idx}
      isChecked={selectedRows.has(row.id)}
      {...rowProps}
      data-testid="TableDataRow__eb5261"
    />
  ));
}

/**
 * Renders the footer row showing per-column totals (currently only `amount`
 * columns) plus the matching row-action spacer cells. Returns null when
 * there is nothing to total or the caller opted out via `showFooterTotals`.
 * Extracted so its column-mapping branches don't nest inside DataTable.
 */
function renderFooterRow({
  totals, showFooterTotals, selectable, visibleColumns, filteredData,
  hoverRowActions, onDeleteRow, legacyDeleteEnabled, onCloneRow, quickActionsEnabled,
  hasDimensionsPanel = false, sessionCurrency,
}) {
  if (!totals || !showFooterTotals) return null;
  return (
    <TableFooter data-testid="TableFooter__eb5261">
      <TableRow className="font-medium" data-testid="TableRow__eb5261">
        {/* ETP-4735 — see the matching comment on InlineAddRow's leading cell. */}
        {hasDimensionsPanel && <TableCell aria-hidden="true" style={{ width: CHEVRON_COLUMN_WIDTH }} data-testid="TableCell__eb5261" />}
        {selectable && <TableCell data-testid="TableCell__eb5261" />}
        {visibleColumns.map((col) => (
          <TableCell
            key={col.key}
            className={col.type === 'amount' ? 'tabular-nums text-right font-semibold' : ''}
            data-testid="TableCell__eb5261">
            {/* ETP-5245 — an `amount` column excluded from the total (summable: false)
                has no entry in `totals`, so its footer cell stays blank instead of
                printing a formatted `undefined`. The currency comes from the same
                resolver the cells use, so the total is labelled with the code the
                rows actually carry. */}
            {col.type === 'amount' && totals[col.key] !== undefined
              ? formatCurrency(resolveRowCurrency(filteredData[0], col, sessionCurrency), totals[col.key])
              : ''}
          </TableCell>
        ))}
        {renderRowActionFooterCells(hoverRowActions, onDeleteRow, legacyDeleteEnabled, onCloneRow, quickActionsEnabled)}
        {quickActionsEnabled && <TableCell data-testid="TableCell__eb5261" />}
      </TableRow>
    </TableFooter>
  );
}

/**
 * Generic data table driven by column/filter declarations.
 *
 * Props:
 *  - columns: Array<{ key, label, type }>  (type can be 'string' | 'amount' | 'status')
 *  - filters: string[] of column keys that are searchable
 *  - data: array of row objects
 *  - onRowSelect: (row) => void
 *  - onNavigate: (row) => void — when provided, clicking a row calls onNavigate instead of onRowSelect
 *  - selectedId: string | number
 *  - compact: boolean (reserved for narrower layout)
 *  - loading: boolean (shows skeleton when true)
 *  - addRow: { active, fields, onAdd, onCancel, catalogs, onFieldChange } — inline add row config
 *  - onDeleteRow: (row) => void — when provided, renders a per-row delete button (trash icon)
 *      that appears on row hover and on keyboard focus. Invoked with the row object; click
 *      propagation is stopped so it does not trigger row selection or navigation.
 *  - balanceFooter: object | null — presence (not shape) suppresses this table's own generic
 *      per-amount-column footer-totals row, regardless of showFooterTotals. Set when a caller
 *      renders a specialized, grid-aligned totals row elsewhere (e.g. InlineLinesPanel's
 *      balanceFooter row) so the two do not stack (ETP-5210).
 */
export function DataTable({
  entity,
  specName,
  columns = [],
  filters = [],
  data = [],
  onRowSelect,
  onNavigate,
  onRowClick,
  // ETP-5075 — router navigate, for FK columns in the fkNavigation registry. Passed in
  // rather than pulled from useNavigate() so DataTable stays Router-agnostic (same reason
  // onNavigate is a prop); absent ⇒ no cell is clickable.
  navigate,
  selectedRowId,
  selectedId,
  rowHoverStyle = 'tint',
  compact,
  loading,
  addRow,
  selectable = true,
  isRowSelectable,
  onSelectionChange,
  sortColumn,
  sortDirection,
  onSort,
  onColumnsReady,
  token,
  apiBaseUrl,
  showFooterTotals = true,
  // ETP-5210 — when a window has opted into the specialized balanceFooter
  // totals row (InlineLinesPanel's grid-aligned debit/credit totals), this
  // same balanceFooter object is also spread into the hidden, add-row-only
  // DataTable instance rendered alongside it (see GLJournalLineTable). That
  // instance must NOT also render its own generic per-amount-column footer
  // totals — doing so produced two stacked totals rows (one €-formatted and
  // aligned, one unformatted) whenever "Añadir línea" was active. A truthy
  // balanceFooter always suppresses the generic footer, regardless of the
  // showFooterTotals prop's own value.
  balanceFooter = null,
  selectorContext,
  onDataMutated,
  labelOverrides,
  onDeleteRow,
  onCloneRow,
  /**
   * Row Quick Actions overlay (ETP-3914 slice 2).
   * Optional. When provided and `enabled !== false`, renders a hover-revealed
   * overlay anchored to the right edge of each row, mirroring DetailView toolbar
   * actions. Independent of `onDeleteRow` / `onCloneRow` — those continue to work
   * for legacy callers that have not migrated yet.
   *
   * Shape (all keys optional except `enabled`):
   *   {
   *     enabled?: boolean,                  // defaults to true when object is present
   *     editMode?: 'navigate' | 'inline',   // forwarded from decisions.json (slice 3)
   *     onEdit?: (row) => void,
   *     onClone?: (row) => void,
   *     onEmail?: (row) => void,
   *     onDelete?: (row) => void,
   *     menuActions?: Array<MenuAction>,    // forwarded to RowQuickActions' kebab
   *     documentPreview?: boolean | object, // truthy ⇒ show Email button
   *     statusField?: string,
   *     hideDeleteWhenComplete?: boolean,
   *     hideDeleteButton?: boolean,          // unconditional Delete opt-out (window.hideDeleteButton)
   *     onMenuActionExecuted?: (action, result) => void,
   *     // Per-action overrides from decisions.json → window.rowQuickActions.actions.
   *     // Keyed by canonical name ('edit', 'duplicate', 'email', 'delete') or processKey.
   *     // Each entry: { show: boolean | 'fixed' | 'kebab', visibleWhen?: string }
   *     actions?: Record<string, { show?: boolean|'fixed'|'kebab', visibleWhen?: string }>,
   *   }
   */
  rowQuickActions,
  onFilterChange,
  onClearAllFilters,
  columnFilters = {},
  rowFilter,
  hiddenColumns = [],
  linesLayout,
  hoverRowActions = false,
  onEditRow = null,
  editingRowId = null,
  onSaveRow = null,
  onCancelEdit = null,
  clearSelectionTrigger = 0,
  // ETP-4656 — partial bulk-delete outcome: bump `deselectTrigger` with the ids
  // of the rows that succeeded (`deselectRowIds`) so only those drop out of the
  // internal selection Set, leaving the failed rows checked. A dedicated pair
  // instead of overloading `clearSelectionTrigger` (which always clears
  // everything) so existing full-clear callers stay untouched.
  deselectTrigger = 0,
  deselectRowIds = [],
  hideHeader = false,
  hideDataRows = false,
}) {
  const t = useLabel(labelOverrides);
  const tMenu = useMenuLabel();
  const ui = useUI();
  const dictionary = useLocale();
  const { locale } = useLocaleSwitch();
  // ETP-4520 — capability map for visibleWhenCapability-gated columns (below).
  const capabilities = useCapabilitiesSafe();
  // ETP-5245 — last-resort currency for `amount` cells whose row carries none of
  // its own. Safe without a CurrencyProvider (the context defaults to null), and
  // deliberately the LOWEST-priority source: grids like M_Costing mix currencies
  // per row, so the row's own value must always win. See lib/rowCurrency.js.
  const sessionCurrency = useCurrency();
  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale.replace('_', '-'), { year: 'numeric', month: '2-digit', day: '2-digit' }),
    [locale]
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRows, setSelectedRows] = useState(new Set());

  useEffect(() => {
    if (!clearSelectionTrigger) return;
    setSelectedRows(new Set());
  }, [clearSelectionTrigger]);

  useEffect(() => {
    if (!deselectTrigger || !deselectRowIds?.length) return;
    setSelectedRows(prev => {
      const next = new Set(prev);
      deselectRowIds.forEach((id) => next.delete(id));
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deselectTrigger]);

  const [optimisticToggles, setOptimisticToggles] = useState({});
  const [savingToggles, setSavingToggles] = useState({});
  const [deletingRows, setDeletingRows] = useState({});

  // Track add-row live values so displayIf-controlled columns can auto-hide
  // their headers when neither any saved row nor the add-row activates them.
  const [addRowValues, setAddRowValues] = useState({});
  useEffect(() => { if (!addRow?.active) setAddRowValues({}); }, [addRow?.active]);

  useEffect(() => {
    setOptimisticToggles({});
    setSavingToggles({});
    setDeletingRows({});
  }, [data]);

  // Report columns to parent (e.g., ListView sort popover)
  useEffect(() => {
    if (onColumnsReady && columns.length > 0) {
      onColumnsReady(columns);
    }
  }, [columns, onColumnsReady]);

  const hasColumnFilter = useMemo(() => Object.values(columnFilters).some(v => v), [columnFilters]);
  const hasActiveFilter = searchQuery.length > 0 || hasColumnFilter;

  const filteredData = useMemo(() => {
    // If onFilterChange is provided, column filters/sort are handled by the backend;
    // skip local search loop. Otherwise apply it client-side.
    const searched = onFilterChange ? data : applyLocalSearch(data, filters, searchQuery);
    // Row-level predicate (e.g. numeric conditions like outstandingAmount > 0)
    // is always applied locally — the backend cannot evaluate arbitrary JS predicates.
    return rowFilter ? searched.filter(rowFilter) : searched;
  }, [data, filters, searchQuery, onFilterChange, rowFilter]);

  // Build a map of { columnKey → controllerKey } from addLineFields displayIf entries.
  // addRow.fields is the entry array directly (set by DetailView as addLineFields.entry).
  const displayIfControllers = useMemo(() => {
    const map = {};
    for (const f of (addRow?.fields ?? [])) {
      if (f.displayIf) map[f.key] = f.displayIf;
    }
    return map;
  }, [addRow?.fields]);

  // ETP-4735 — a `dimensionsPanel` column is never a real grid column: InlineLinesPanel
  // excludes it too and instead renders its own leading expand-chevron + sub-row UX (see
  // hasDimensionsPanel there). DataTable previously had no equivalent exclusion, so its
  // add-row-only companion table (rendered under InlineLinesPanel when addRow.active) rendered
  // a real ~120px placeholder cell for it — both cluttering the row and, via
  // growColumnWidth()'s fixedColsTotalPx, shrinking the grow column ahead of it (e.g. product),
  // shifting every column after it (e.g. movementQuantity) out of alignment with the rows above.
  const hasDimensionsPanel = useMemo(
    () => (columns || []).some(c => c.type === 'dimensionsPanel'),
    [columns]
  );

  const visibleColumns = useMemo(() => {
    // ETP-4803 — drop columns that never render as a grid column in either
    // lines renderer (e.g. `dimensionsPanel`) BEFORE any other filter. This
    // must mirror InlineLinesPanel's own `visibleColumns` exactly, since
    // DataTable's hidden `hideHeader` colgroup replicates that flex layout's
    // math — a phantom column here desyncs `growColumnWidth()` for every
    // subsequent column in the inline add-row form.
    let base = columns.filter(isLineGridColumn);
    // Start from explicit hiddenColumns prop
    base = hiddenColumns.length > 0 ? base.filter(col => !hiddenColumns.includes(col.key)) : base;
    // Auto-hide columns whose controlling field (displayIf) is inactive in ALL
    // saved rows AND in the current add-row values.
    if (Object.keys(displayIfControllers).length > 0) {
      const isTruthy = (v) => v === true || v === 'Y' || v === 'true';
      base = base.filter(col => {
        const ctrl = displayIfControllers[col.key];
        if (!ctrl) return true;
        const anyDataRow = (data ?? []).some(row => isTruthy(row[ctrl]));
        const addRowActive = isTruthy(addRowValues[ctrl]);
        return anyDataRow || addRowActive;
      });
    }
    // ETP-4520 — drop columns gated by a capability the current role doesn't
    // hold (e.g. `posted` on sales-invoice/purchase-invoice, restricted to
    // "showAccountingFields"). Absent visibleWhenCapability ⇒ always kept.
    base = base.filter(col => isCapabilityVisible(capabilities, col.visibleWhenCapability));
    return base;
  }, [columns, hiddenColumns, displayIfControllers, data, addRowValues, capabilities]);

  // Columns that feed the footer total. `amount` is a FORMATTING type (decimals,
  // separators, symbol, right alignment, numeric filter) — it does not by itself
  // mean the values are addable. ETP-5245 splits the two: an explicit
  // `summable: false` (decisions.json) keeps the money formatting and drops the
  // column from the total. `undefined` MUST keep summing — that is the historical
  // behavior every existing amount column relies on.
  const amountColumns = useMemo(
    () => visibleColumns.filter(col => col.type === 'amount' && col.summable !== false),
    [visibleColumns]
  );

  const displayCatalogMaps = useMemo(
    () => buildDisplayCatalogMaps(visibleColumns, addRow, entity),
    [visibleColumns, entity, addRow?.fields, addRow?.catalogs],
  );

  // ETP-5268 — the quick-actions column's reserved width, used by the
  // colgroup further down AND as useHorizontalScrollGeometry's
  // "apenas se vea la columna" threshold (see that hook's own doc comment).
  const quickActionsColWidthPx = quickActionsReservedWidthPx(rowQuickActions);

  const {
    stickyBottomPx: horizontalScrollMirrorBottomPx,
    allowHoverSticky: quickActionsAllowHoverSticky,
    containerRef: scrollContainerRef,
    elRef: horizontalScrollElRef,
    attachSeq: horizontalScrollAttachSeq,
  } = useHorizontalScrollGeometry(quickActionsColWidthPx);

  const totals = useMemo(() => {
    if (amountColumns.length === 0) return null;
    const sums = {};
    for (const col of amountColumns) {
      sums[col.key] = filteredData.reduce((sum, row) => sum + (Number(row[col.key]) || 0), 0);
    }
    return sums;
  }, [filteredData, amountColumns]);

  const handleInlineToggle = useCallback(async (row, col, checked) => {
    if (!apiBaseUrl || !entity || !row?.id || !token) {
      toast.error('Inline toggle is not available in this context');
      return;
    }
    await runInlineToggleRequest({
      apiBaseUrl, entity, row, col, token, checked,
      toggleKey: `${row.id}:${col.key}`,
      setOptimisticToggles, setSavingToggles, onDataMutated, ui,
    });
  }, [apiBaseUrl, entity, onDataMutated, token, ui]);

  const renderCellValue = (row, col) => {
    if (typeof col.render === 'function') return col.render(row, { entity, token, apiBaseUrl });

    const { display, rawValue, toggleKey } = resolveCellDisplay(row, col, optimisticToggles, displayCatalogMaps);
    const renderer = CELL_RENDERERS[col.type] ?? CELL_RENDERERS.default;
    // ETP-5075 — wrap at the dispatch point, not inside each renderer, so a navigable FK
    // column works whatever cell type it resolves to. Fails closed: no registry entry, no
    // resolvable id, or no `navigate` prop (DataTable is deliberately Router-agnostic) all
    // fall through to the renderer's own output, untouched.
    const navigateTo = navigate ? resolveFkNavigation(col.column, row) : null;
    const rendered = renderer({
      row,
      col,
      display,
      rawValue,
      toggleKey,
      visibleColumns,
      tMenu,
      dictionary,
      savingToggles,
      handleInlineToggle,
      locale,
      t,
      ui,
      dateFormatter,
      token,
      apiBaseUrl,
      sessionCurrency,
    });
    if (!navigateTo) return rendered;
    return (
      // stopPropagation is load-bearing: without it the row's own onNavigate/onRowClick
      // also fires and wins, sending the user to this window's record instead.
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); navigate(navigateTo); }}
        className="inline-flex items-center gap-1 text-left underline decoration-[hsl(var(--border-control))] underline-offset-4 hover:decoration-[hsl(var(--foreground))]"
        data-testid={`fk-link-${col.key}`}>
        {rendered}
        <ArrowUpRight className="h-3 w-3 shrink-0" data-testid="ArrowUpRight__eb5261" />
      </button>
    );
  };

  const handleRowActivation = useCallback((row, idx) => {
    if (hasActiveFilter) {
      trackSearchResultSelected({
        entity,
        specName,
        source: hasColumnFilter ? 'table_filter' : 'table_search',
        type: hasColumnFilter ? 'filter' : 'search',
        position: idx + 1,
      });
    }
    if (onRowClick) onRowClick(row);
    else if (onNavigate) onNavigate(row);
    else onRowSelect?.(row);
  }, [entity, specName, hasActiveFilter, hasColumnFilter, onRowClick, onNavigate, onRowSelect]);

  if (loading) {
    return (
      <div className="space-y-4">
        <TableSkeleton
          columns={visibleColumns.length > 0 ? visibleColumns : [{ key: '_1' }, { key: '_2' }, { key: '_3' }]}
          data-testid="TableSkeleton__eb5261" />
      </div>
    );
  }
  const { allSelected, someSelected, selectableData } = computeSelectionState(filteredData, selectedRows, isRowSelectable);

  const toggleAll = (e) => {
    e.stopPropagation();
    if (allSelected) {
      setSelectedRows(new Set());
      onSelectionChange?.([]);
    } else {
      const allIds = new Set(selectableData.map(r => r.id));
      setSelectedRows(allIds);
      onSelectionChange?.(selectableData);
    }
  };

  const toggleRow = (e, row) => {
    e.stopPropagation();
    if (isRowSelectable && !isRowSelectable(row)) return;
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (next.has(row.id)) next.delete(row.id);
      else next.add(row.id);
      onSelectionChange?.(filteredData.filter(r => next.has(r.id)));
      return next;
    });
  };

  const quickActionsEnabled = isQuickActionsEnabled(rowQuickActions);
  const legacyDeleteEnabled = !!onDeleteRow && (hoverRowActions || !quickActionsEnabled);
  const deleteCol = oneIfTrue(legacyDeleteEnabled);
  const cloneCol = oneIfTrue(onCloneRow && !quickActionsEnabled);
  const quickActionsCol = oneIfTrue(quickActionsEnabled);
  const actionCols = hoverRowActions ? 1 + deleteCol : deleteCol + cloneCol;
  const colSpan = visibleColumns.length + oneIfTrue(selectable) + actionCols + quickActionsCol;
  // ETP-5030 — InlineLinesPanel's `computeRowClassName` mirrors the `bg-primary/5` literal for tab grids; keep the two in sync.
  const selectedRowBg = hoverRowActions ? 'bg-[hsl(var(--muted))]' : 'bg-primary/5';

  // In inlineEditable add-row mode (hideHeader=true), the DataTable only renders
  // the new-line form while InlineLinesPanel owns the existing rows. InlineLinesPanel
  // always appends a 48px right spacer, plus an ACTION_SLOT_WIDTH_PX action slot when
  // no column can be swapped for the hover action strip. Mirror those here so flexible
  // columns grow to the same width in both.
  //
  // ETP-5245 — this MUST be `reservesActionSlot()`, the same predicate
  // InlineLinesPanel uses, not a local "is there any amount column?" guess: the panel
  // only ever swaps the LAST column, so a tab whose amount sits earlier (Producto >
  // Costo: `cost`, `startingDate`, `endingDate`) reserves the slot there while this
  // table did not — handing those 160px to `growColumnWidth()`'s grow columns and
  // pushing every add-row input right of its header.
  const ilpReservesActionSlot = hideHeader && linesLayout === 'inlineEditable'
    && reservesActionSlot(visibleColumns);
  const ilpTrailing = hideHeader && linesLayout === 'inlineEditable';

  // Precompute the flex specs once so the colgroup below can both build the
  // fixed/grow <col> widths AND feed growColumnWidth() the totals it needs
  // (sum of every fixed-width slot + count of growing columns) — see the
  // colgroup comment for why growing columns can't just be left width-less.
  const colFlexSpecs = hideHeader ? visibleColumns.map((col, colIdx) => flexSpec(col, colIdx)) : [];
  const growCount = colFlexSpecs.filter((s) => s.grow > 0).length;
  const fixedColsBasisPx = colFlexSpecs.filter((s) => s.grow === 0).reduce((sum, s) => sum + s.basis, 0);
  // ETP-5268 follow-up — the quick-actions slot's width is this window's own
  // button count (see quickActionsReservedWidthPx), always — see
  // quickActionsColumnStyle for why it's no longer ever narrower. Feeding
  // the real value into the grow-column denominator keeps growing columns
  // from claiming space the actions column actually needs, which would
  // understate the table's true content width and mask genuine overflow
  // that should scroll instead of squeeze. (`quickActionsColWidthPx` itself
  // is computed earlier, alongside the useHorizontalScrollGeometry() call.)
  const fixedColsTotalPx = fixedColsBasisPx + computeActionColsWidthPx({
    selectable, ilpTrailing, hoverRowActions, onDeleteRow, legacyDeleteEnabled,
    onCloneRow, quickActionsEnabled, ilpReservesActionSlot, hasDimensionsPanel,
    quickActionsColWidthPx,
  });

  // ETP-5268 follow-up — see StickyHeaderRow's own doc comment for the full
  // rationale: the plain document-list mode's header can't be made `sticky`
  // in place (it's inside a wrapper that's unavoidably a scroll container on
  // both axes, per the CSS overflow spec, so `sticky` there just travels with
  // the page), so it moves to its own table, sticky against the ScrollPane
  // ancestor that actually owns this list's vertical scroll. hideHeader
  // (add-row-only) and inlineEditable (already sticky via a bounded flex box
  // elsewhere) are unaffected — both keep the header exactly where it was.
  const useOwnStickyHeader = !hideHeader && linesLayout !== 'inlineEditable';
  const headerRowContent = (
    <TableRow className="border-b border-border/40" data-testid="TableRow__eb5261">
      {/* ETP-4735 — mirrors the leading chevron cell added to InlineAddRow/TableDataRow
          below: keeps this table's own header self-consistent with its body whenever a
          dimensionsPanel column is present (only actually exercised in hideHeader mode,
          where InlineLinesPanel's rows are what this table's add-row must align with —
          see renderLinesColgroup's leading <col>). */}
      {hasDimensionsPanel && <TableHead aria-hidden="true" style={{ width: CHEVRON_COLUMN_WIDTH }} data-testid="TableHead__eb5261" />}
      {selectable && (
        <TableHead
          className="w-10 px-3 align-middle"
          onClick={(e) => e.stopPropagation()}
          data-testid="TableHead__eb5261">
          <Checkbox
            checked={allSelected}
            indeterminate={someSelected}
            onChange={toggleAll}
            onClick={(e) => e.stopPropagation()}
            data-testid="Checkbox__eb5261" />
        </TableHead>
      )}
      {visibleColumns.map((col, colIdx) => renderColumnHeaderCell(col, colIdx, { sortColumn, sortDirection, onSort, linesLayout, locale, t }))}
      {renderRowActionHeaderCells(hoverRowActions, onDeleteRow, legacyDeleteEnabled, onCloneRow, quickActionsEnabled)}
      {quickActionsEnabled && (
        <TableHead
          className={quickActionsColumnClassName('px-2')}
          style={quickActionsColumnStyle(quickActionsColWidthPx)}
          aria-hidden="true"
          data-testid="TableHead__eb5261" />
      )}
    </TableRow>
  );

  return (
    <div className="space-y-0">
      {useOwnStickyHeader && (
        <StickyHeaderRow elRef={horizontalScrollElRef} attachSeq={horizontalScrollAttachSeq}>
          <TableHeader data-testid="TableHeader__eb5261">{headerRowContent}</TableHeader>
        </StickyHeaderRow>
      )}
      {/*
        `overflow-y-visible` next to `overflow-x-auto` is computed as `auto` by the CSS
        spec, so this wrapper does clip vertically. With `rowHoverStyle="elevated"` the
        hovered row's `shadow-lg` reaches ~22px below it (10px offset + 15px blur - 3px
        spread); for the LAST row that lands past the table and got clipped away, which
        read as "hover doesn't work on the last row". Overflow clips at the PADDING box,
        so 24px of bottom padding gives the shadow room inside the visible area.
      */}
      <div
        ref={scrollContainerRef}
        className={[
          linesLayout === 'inlineEditable'
            ? '[&>div]:!overflow-visible'
            // ETP-5268 follow-up — the hand-built thumb below is the ONLY
            // horizontal scrollbar this wrapper ever shows (see its own doc
            // comment for why): the browser's own is hidden so short lists
            // (real scrollbar reachable without scrolling) and long lists
            // (real scrollbar off-screen) render identically instead of
            // disagreeing on what a scrollbar looks like. The scrolling
            // element that actually needs this is `<Table>`'s own hardcoded
            // wrapper div (schema_forge_core's table.jsx: `<div
            // className="relative w-full overflow-auto">`), the direct
            // child this hook's `containerRef` already reads as `el` — NOT
            // this outer div, which never itself overflows. Targeting `&`
            // here hid nothing (there was no scrollbar on this element to
            // hide), leaving the child's own native one to reappear right
            // above this thumb once scrolled into view ("al final se ven
            // 2") — the `[&>div]` combinator reaches into that child instead.
            : 'overflow-x-auto overflow-y-visible [&>div]:[scrollbar-width:none] [&>div::-webkit-scrollbar]:hidden',
          rowHoverStyle === 'elevated' ? 'pb-6' : '',
        ].filter(Boolean).join(' ')}
      >
        <Table style={getTableContainerStyle()} data-testid="Table__eb5261">
          {/* When hideHeader is true (add-row-only mode), or the header just moved out to
              StickyHeaderRow above, a <colgroup> drives column widths instead of the (now
              absent-from-this-table, or hidden) header row's own cell widths. */}
          {useOwnStickyHeader
            ? renderMainColgroup({
              hasDimensionsPanel, selectable, visibleColumns, hoverRowActions, onDeleteRow,
              legacyDeleteEnabled, onCloneRow, quickActionsEnabled, quickActionsColWidthPx,
            })
            : renderLinesColgroup({
              hideHeader, selectable, visibleColumns, colFlexSpecs, fixedColsTotalPx, growCount,
              ilpTrailing, hoverRowActions, onDeleteRow, legacyDeleteEnabled, onCloneRow,
              quickActionsEnabled, ilpReservesActionSlot, hasDimensionsPanel,
              quickActionsColWidthPx,
            })}
          {!useOwnStickyHeader && (
            <TableHeader
              className={linesLayout === 'inlineEditable' ? 'sticky top-0 z-20 bg-card' : ''}
              aria-hidden={hideHeader || undefined}
              style={hideHeader ? { display: 'none' } : undefined}
              data-testid="TableHeader__eb5261">
              {headerRowContent}
            </TableHeader>
          )}
          <TableBody data-testid="TableBody__eb5261">
            {renderTableRows({
              hideDataRows, filteredData, addRow, colSpan, hasActiveFilter, data, selectedRows,
              selectable, isRowSelectable, toggleRow, visibleColumns,
              renderCellValue, onRowClick, onNavigate, selectedRowBg, selectedId, selectedRowId,
              rowHoverStyle,
              editingRowId, handleRowActivation, hoverRowActions, onSaveRow, onCancelEdit,
              onEditRow, onDeleteRow, deletingRows, setDeletingRows, ui, legacyDeleteEnabled,
              onCloneRow, quickActionsEnabled, rowQuickActions, entity, apiBaseUrl, token,
              hasDimensionsPanel, quickActionsAllowHoverSticky, quickActionsColWidthPx,
            })}
            {addRow?.active && (
              <InlineAddRow
                ref={addRow.ref}
                columns={visibleColumns}
                fields={addRow.fields}
                onAdd={addRow.onAdd}
                onCancel={addRow.onCancel}
                data={data}
                catalogs={addRow.catalogs}
                onFieldChange={addRow.onFieldChange}
                onValuesChange={(vals) => { setAddRowValues(vals ?? {}); addRow.onValuesChange?.(vals); }}
                seedValues={addRow.seedValues}
                resolvedDefaults={addRow.resolvedDefaults}
                convertOptimisticPrice={addRow.convertOptimisticPrice}
                selectable={selectable}
                hasDeleteColumn={!hoverRowActions && legacyDeleteEnabled}
                hasCloneColumn={!hoverRowActions && !!onCloneRow && !quickActionsEnabled}
                hoverRowActions={hoverRowActions}
                hoverRowHasDelete={hoverRowActions && !!onDeleteRow}
                hasQuickActionsColumn={quickActionsEnabled}
                token={token}
                apiBaseUrl={apiBaseUrl}
                entity={entity}
                specName={specName}
                selectorContext={selectorContext}
                ilpReservesActionSlot={ilpReservesActionSlot}
                ilpTrailing={ilpTrailing}
                labelOverrides={labelOverrides}
                hasDimensionsPanel={hasDimensionsPanel}
                data-testid="InlineAddRow__eb5261" />
            )}
          </TableBody>
          {renderFooterRow({
            totals, showFooterTotals: showFooterTotals && !balanceFooter, selectable, visibleColumns, filteredData,
            hoverRowActions, onDeleteRow, legacyDeleteEnabled, onCloneRow, quickActionsEnabled,
            hasDimensionsPanel, sessionCurrency,
          })}
        </Table>
      </div>
      {/* ETP-5268 follow-up — the "mirror" horizontal scrollbar: see
          useHorizontalScrollGeometry's own doc comment for the full
          rationale (this list's own scroll container has no bounded height,
          so its native scrollbar can end up scrolled off-screen at the
          bottom of a long list). `position: sticky; bottom` keeps THIS strip
          pinned to the bottom of whichever ancestor actually scrolls
          vertically, regardless of how tall the table above it grows — the
          negative `bottom` offset is what actually seats it flush against
          that ancestor's true edge instead of floating above its own bottom
          padding ("el scroll esta en el aire"). Built as a hand-rolled thumb
          (`SHADOW_SCROLLBAR_THICKNESS`/`SHADOW_SCROLLBAR_MIN_THUMB`,
          `computeThumbMetrics`, pointer-drag via `setPointerCapture`) that
          exactly replicates ScrollPane's own shadow-scrollbar pattern
          (schema_forge_core's scroll-pane.jsx) instead of a native
          `overflow-x-auto` div — the vertical scrollbar it's meant to match
          is ITSELF one of ScrollPane's hand-built thumbs, never a
          native/webkit one, so only rendering it the same way can actually
          look the same ("hacele el scroll horizontal igual de ancho que el
          scroll vertical"). Rendered any time there's real overflow to
          mirror, regardless of scroll position — the real wrapper's own
          native scrollbar is hidden unconditionally (see the
          `[&::-webkit-scrollbar]:hidden` on its className above), so
          there's never a second one to be redundant with ("en sales-invoice
          se ve mas fino" — a short list's native scrollbar, visible without
          scrolling, used to show through instead of this thumb, in the
          browser's own lighter gray). Extracted into its own component
          (`HorizontalScrollThumb`, see its doc comment) purely for perf:
          moving the thumb on scroll needs a state update every scroll
          frame, and DataTable renders every row with no memoization —
          keeping that state here would re-render the whole row list on
          every scroll tick. Skipped entirely for the inlineEditable lines
          layout, which uses a different overflow strategy
          (`[&>div]:!overflow-visible` above) and was never the case any of
          this fixes. */}
      {linesLayout !== 'inlineEditable' && (
        <HorizontalScrollThumb
          elRef={horizontalScrollElRef}
          attachSeq={horizontalScrollAttachSeq}
          bottomOffsetPx={horizontalScrollMirrorBottomPx}
        />
      )}
      {addRow?.active && (
        <p className="text-xs text-muted-foreground mt-1 text-center">
          {ui('inlineAddHint')}
        </p>
      )}
      {/* ETP-5210 follow-up — this DataTable instance is InlineLinesPanel's
          hidden add-row-only companion table (hideHeader + hideDataRows, see
          the generated *LineTable wrapper's `addRow?.active` branch). While
          that add-row form is showing, InlineLinesPanel suppresses its own
          balanceFooter row (its `lineFormActive` prop, set from the very same
          addRow.active value in DetailView.jsx) so it renders here instead —
          always AFTER the add-row form (this element sits below it), never
          between the saved lines and it. Reuses InlineLinesPanel's exact
          renderer + cell typography so the two never drift in alignment. */}
      {hideDataRows && addRow?.active && balanceFooter && renderBalanceFooterRow({
        balanceFooter,
        visibleColumns,
        hasDimensionsPanel,
        reserveActionSlot: ilpReservesActionSlot,
        cellStyle: buildLineCellStyle(),
      })}
    </div>
  );
}
function resolveCellDisplay(row, col, optimisticToggles, displayCatalogMaps) {
  const toggleKey = `${row.id}:${col.key}`;
  const rawValue = Object.hasOwn(optimisticToggles, toggleKey)
    ? optimisticToggles[toggleKey]
    : row[col.key];
  let display = resolveIdentifier(row, col.key);
  const displayMap = displayCatalogMaps.get(col.key);
  if (displayMap) {
    const fkId = row?.[col.key];
    if (fkId != null) {
      const mapped = displayMap.get(String(fkId));
      if (mapped) display = mapped;
    }
  }
  return { display, rawValue, toggleKey };
}
