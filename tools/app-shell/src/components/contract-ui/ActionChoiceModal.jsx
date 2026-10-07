import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ArrowRight, Loader2, ReceiptText, X } from 'lucide-react';
import { useUI } from '@/i18n';
import { MODAL_STYLES } from './modal-styles.js';

/**
 * Generic "summary + pick one option" confirmation modal (ETP-5398, Figma frame "PopUps").
 *
 * Everything that varies between windows arrives through props: the title, the summary
 * table (headers and values), the question, the selectable options and both button actions.
 * Layout and styling are part of the component and are deliberately NOT overridable — there
 * is no className/style prop — so a consumer cannot deform the modal.
 *
 * ETP-5576 — extended, backward-compatibly, so the follow-up document flow
 * (FollowUpDocumentModal) can reuse it:
 *   - Esc cancels (never while `loading`, and never an Esc a layer on top already handled),
 *     the backdrop is ignored while `loading`, and Tab stays inside the dialog (focus parks
 *     on the dialog itself while every control is disabled); focus returns to the element
 *     that opened it on unmount.
 *   - The option cards are a roving-tabindex radio group: one Tab stop, Arrow keys (and
 *     Home/End) move the selection, Enter on a card selects it AND continues with it, every
 *     card shows a visible :focus-visible outline.
 *   - Responsive: the dialog never exceeds `calc(100vw - 32px)`, the summary wraps and the
 *     cards stack below 640px.
 *   - Single-option mode: with exactly ONE option there is nothing to choose, so the radio
 *     group is replaced by a direct confirmation in the same shell — the question, then ONE
 *     static option card (same border, radius, icon box and badge as a choice card, icon on
 *     the left, but no radio indicator, no `role="radio"`, no radiogroup and no Tab stop),
 *     and a primary button labelled with the option's `actionLabel` (falls back to
 *     `primaryLabel` / `continue`) with no arrow icon. Initial focus goes to the primary
 *     button, so Enter confirms and Esc cancels; the dialog is described by the card's
 *     description. Callers with two or more options (sales-quotation) keep the card layout
 *     unchanged.
 *   - Per-option `badgeTone`: 'success' (default — the green «Recomendado») or 'info'
 *     (blue, e.g. «Borrador»).
 *   - Optional per-option `icon`, optional summary, `primaryLabel` / `loadingLabel`
 *     overrides (defaults are the original `continue` / `soProcessing` keys) and an
 *     optional `testId` for the dialog. The dialog is named through `aria-labelledby`.
 *   - Optional `children`, rendered below the option(s) and above the error — extra input
 *     the action needs (e.g. the follow-up flow's backend-requested selector) — and
 *     `primaryDisabled`, which keeps the primary button disabled until that input is
 *     complete (the caller must also refuse a submit from Enter on a choice card). Both may
 *     be a function of the selected option id (the single option's id in single-option mode)
 *     when the extra input belongs to one option only; `onSelectionChange(id)` reports every
 *     later change of the selected option (not the initial one). When
 *     loading ends and the caller already moved focus to a control inside the dialog (an
 *     input that just appeared), that focus is kept instead of going back to the primary.
 *
 * @param {object} props
 * @param {string} props.title Modal title.
 * @param {Array<{key: string, label: string, testId?: string}>} [props.summaryColumns] Summary table headers; the table is omitted when empty.
 * @param {Object<string, import('react').ReactNode>} [props.summaryData] Already-formatted value per column key.
 * @param {string} [props.question] Text shown above the options (also above the static card in single-option mode; omitted there when empty).
 * @param {Array<{id: string, label: string, description: string, badge?: string, badgeTone?: 'success'|'info', testId?: string, icon?: import('react').ComponentType<{size?: number}>, actionLabel?: string}>} props.options
 *   One option renders the single-option confirmation; two or more render the choice cards.
 * @param {string} [props.defaultOptionId] Option selected on mount; the first option when omitted.
 * @param {() => void} props.onCancel Cancel button, close icon, Esc and backdrop action.
 * @param {(optionId: string) => void} props.onContinue Continue button action, receives the selected option id.
 * @param {boolean} [props.loading] Shows the processing state and blocks a second submit and every way of closing.
 * @param {string|null} [props.error] Error message shown above the buttons.
 * @param {string} [props.primaryLabel] Primary button text; defaults to `ui('continue')`.
 * @param {string} [props.loadingLabel] Primary button text while loading; defaults to `ui('soProcessing')`.
 * @param {string} [props.testId] data-testid of the dialog element.
 * @param {boolean|((selectedId: string) => boolean)} [props.primaryDisabled] Disables the primary button (e.g. a required input is empty).
 * @param {import('react').ReactNode|((selectedId: string) => import('react').ReactNode)} [props.children] Extra content between the option(s) and the error.
 * @param {(selectedId: string) => void} [props.onSelectionChange] Called when the selected option changes (not on mount).
 */
export default function ActionChoiceModal({
  title,
  summaryColumns = [],
  summaryData = {},
  question,
  options,
  defaultOptionId,
  onCancel,
  onContinue,
  loading = false,
  error = null,
  primaryLabel,
  loadingLabel,
  testId,
  primaryDisabled = false,
  children,
  onSelectionChange,
}) {
  const ui = useUI();
  const titleId = useId();
  const questionId = useId();
  const descriptionId = useId();
  const dialogRef = useRef(null);
  const [selectedId, setSelectedId] = useState(defaultOptionId ?? options[0]?.id);
  const optionRefs = useRef({});
  const primaryRef = useRef(null);
  const singleOption = options.length === 1 ? options[0] : null;
  const currentId = singleOption ? singleOption.id : selectedId;
  const extraContent = typeof children === 'function' ? children(currentId) : children;
  const primaryBlocked = Boolean(typeof primaryDisabled === 'function' ? primaryDisabled(currentId) : primaryDisabled);

  // Report selection changes (not the initial selection) to the caller.
  const reportedIdRef = useRef(selectedId);
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;
  useEffect(() => {
    if (reportedIdRef.current === selectedId) return;
    reportedIdRef.current = selectedId;
    onSelectionChangeRef.current?.(selectedId);
  }, [selectedId]);

  // Latest values for the window-level key listener, so it is registered once.
  const stateRef = useRef({ loading, onCancel });
  stateRef.current = { loading, onCancel };

  const cancelUnlessLoading = useCallback(() => {
    if (!stateRef.current.loading) stateRef.current.onCancel?.();
  }, []);

  useDialogFocusTrap(dialogRef);

  // W3 — while loading every control is disabled, and a focused button that turns disabled
  // drops focus to <body> (Tab and Esc would then act behind the overlay). Park focus on
  // the dialog itself (tabIndex -1) until the controls are usable again.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!loading || !dialog || typeof document === 'undefined') return;
    const active = document.activeElement;
    if (!dialog.contains(active) || active?.disabled) dialog.focus?.();
  }, [loading]);

  // When loading ends (typically a failed request: the error is shown and the modal stays),
  // give focus back to the control that submits — the primary button in single-option
  // mode, the selected card otherwise — so Enter retries. Skipped on mount (wasLoading).
  const wasLoadingRef = useRef(loading);
  useEffect(() => {
    const wasLoading = wasLoadingRef.current;
    wasLoadingRef.current = loading;
    if (!wasLoading || loading) return;
    const active = typeof document === 'undefined' ? null : document.activeElement;
    if (active && active !== dialogRef.current && dialogRef.current?.contains(active)) return;
    const target = singleOption ? primaryRef.current : optionRefs.current[selectedId];
    target?.focus?.();
    // Only the loading transition matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // Initial focus: the selected card, so the arrow keys work straight away and a single
  // Tab reaches the buttons — or, in single-option mode, the primary button, so Enter
  // confirms. Focus goes back to the opener when the modal unmounts.
  useEffect(() => {
    const opener = typeof document !== 'undefined' ? document.activeElement : null;
    const initial = singleOption
      ? primaryRef.current
      : optionRefs.current[defaultOptionId ?? options[0]?.id];
    (initial ?? dialogRef.current)?.focus?.();
    return () => { opener?.focus?.(); };
    // Mount/unmount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRadioKeyDown = (event) => {
    // ETP-5576 product decision — Enter on a focused option card ACCEPTS: it selects that
    // card and continues with it. (Space keeps the native button behaviour: select only.)
    if (event.key === 'Enter') {
      const optionId = event.target?.closest?.('[data-option-id]')?.getAttribute('data-option-id');
      if (!optionId) return;
      event.preventDefault();
      if (loading) return;
      setSelectedId(optionId);
      onContinue(optionId);
      return;
    }
    const next = nextOptionId(options, selectedId, event.key);
    if (!next) return;
    event.preventDefault();
    setSelectedId(next);
    optionRefs.current[next]?.focus?.();
  };

  const hasSummary = Array.isArray(summaryColumns) && summaryColumns.length > 0;

  return (
    <div onClick={cancelUnlessLoading} style={overlayStyle}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={singleOption ? descriptionId : undefined}
        tabIndex={-1}
        data-testid={testId}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (isOwnEscape(e, dialogRef.current)) { e.stopPropagation(); cancelUnlessLoading(); } }}
        style={dialogStyle}
      >
        <button
          type="button"
          onClick={cancelUnlessLoading}
          disabled={loading}
          aria-label={ui('close')}
          className={FOCUS_RING_CLS}
          style={closeBtnStyle}
        >
          <X size={20} data-testid="X__6f7a22" />
        </button>

        <div style={headerStyle}>
          <h2 id={titleId} style={titleStyle}>{title}</h2>
        </div>

        <div style={bodyStyle}>
          {hasSummary && (
            <SummaryTable
              columns={summaryColumns}
              data={summaryData}
              data-testid="SummaryTable__6f7a22" />
          )}

          <div style={sectionStyle}>
            {singleOption ? (
              <div style={choiceGroupStyle}>
                {question && <p style={questionStyle}>{question}</p>}
                <StaticOptionCard
                  option={singleOption}
                  descriptionId={descriptionId}
                  data-testid="StaticOptionCard__6f7a22" />
              </div>
            ) : (
            <div style={choiceGroupStyle}>
              <p id={questionId} style={questionStyle}>{question}</p>
              <div
                role="radiogroup"
                aria-labelledby={questionId}
                className="flex flex-col sm:flex-row"
                style={cardsRowStyle}
                onKeyDown={handleRadioKeyDown}
              >
                {options.map((option) => (
                  <OptionCard
                    key={option.id}
                    option={option}
                    selected={option.id === selectedId}
                    disabled={loading}
                    buttonRef={(el) => { optionRefs.current[option.id] = el; }}
                    onSelect={() => setSelectedId(option.id)}
                    data-testid="OptionCard__6f7a22" />
                ))}
              </div>
            </div>
            )}

            {extraContent}

            {error && <div role="alert" style={errorStyle}>{error}</div>}

            <div style={footerStyle}>
              <button type="button" onClick={onCancel} disabled={loading} className={FOCUS_RING_CLS} style={cancelBtnStyle}>
                {ui('cancel')}
              </button>
              <button
                ref={primaryRef}
                type="button"
                data-testid="action-confirm-modal"
                onClick={() => onContinue(currentId)}
                disabled={loading || primaryBlocked}
                className={FOCUS_RING_CLS}
                style={getPrimaryBtnStyle(loading, Boolean(singleOption), primaryBlocked)}
              >
                <PrimaryIcon loading={loading} showArrow={!singleOption} data-testid="PrimaryIcon__6f7a22" />
                {loading
                  ? (loadingLabel ?? ui('soProcessing'))
                  : (singleOption?.actionLabel ?? primaryLabel ?? ui('continue'))}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * True when an Esc keydown belongs to THIS dialog: the key is Escape, nothing handled it
 * first (`defaultPrevented` — a Radix select/popover or nested dialog that consumed it), and
 * it happened inside the dialog's DOM subtree. Read from the dialog's own (bubble-phase)
 * `onKeyDown`, so any layer opened on top gets the key first; a layer portalled outside the
 * dialog (React still bubbles portal events through the component tree) fails the
 * `contains` check and keeps its Esc.
 */
export function isOwnEscape(event, dialog) {
  if (event.key !== 'Escape') return false;
  const prevented = event.defaultPrevented || event.nativeEvent?.defaultPrevented;
  return !prevented && Boolean(dialog?.contains?.(event.target));
}

/**
 * Tab trap for a modal dialog: Tab / Shift+Tab cycle through the dialog's enabled controls
 * so keyboard focus never leaks behind the overlay. Window CAPTURE phase so it also pulls
 * focus back when it is already outside. Esc is NOT handled here (see isOwnEscape).
 */
export function useDialogFocusTrap(dialogRef) {
  useEffect(() => {
    const handler = (event) => {
      if (event.key === 'Tab') trapTab(event, dialogRef.current);
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [dialogRef]);
}

// Elements reachable with Tab. `[tabindex="-1"]` is excluded explicitly everywhere, so the
// dialog itself and the unselected radio cards (roving tabindex) are never Tab stops, and a
// disabled element is never one either (a selected card is disabled while loading).
const FOCUSABLE_SELECTOR = [
  'button:not([disabled])', '[href]', 'input:not([disabled])', 'select:not([disabled])',
  'textarea:not([disabled])', '[tabindex]:not([disabled])',
].map(sel => `${sel}:not([tabindex="-1"])`).join(', ');

function trapTab(event, dialog) {
  if (!dialog) return;
  const focusable = Array.from(dialog.querySelectorAll(FOCUSABLE_SELECTOR));
  if (focusable.length === 0) {
    // Everything is disabled (loading): keep focus on the dialog itself.
    event.preventDefault();
    dialog.focus?.();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;
  if (!dialog.contains(active) || active === dialog) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  } else if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

const NEXT_KEYS = new Set(['ArrowRight', 'ArrowDown']);
const PREV_KEYS = new Set(['ArrowLeft', 'ArrowUp']);

/**
 * Roving-tabindex radio navigation (WAI-ARIA radio group pattern): returns the option id
 * the key moves the selection to, wrapping around, or null when the key is not a
 * navigation key.
 */
export function nextOptionId(options, currentId, key) {
  const count = options.length;
  if (count === 0) return null;
  const index = Math.max(0, options.findIndex(o => o.id === currentId));
  if (NEXT_KEYS.has(key)) return options[(index + 1) % count].id;
  if (PREV_KEYS.has(key)) return options[(index - 1 + count) % count].id;
  if (key === 'Home') return options[0].id;
  if (key === 'End') return options[count - 1].id;
  return null;
}

/**
 * Single-option mode body: the only option as a STATIC card — visually an idle choice card
 * (border, radius, icon box, title + badge, description) laid out icon-left, but plain
 * content: no radio indicator, no role, not focusable, not clickable. Its description is the
 * dialog's `aria-describedby` target.
 */
function StaticOptionCard({ option, descriptionId }) {
  const Icon = option.icon ?? ReceiptText;
  return (
    <div data-testid={option.testId} style={staticCardStyle}>
      <span style={iconBoxStyle} aria-hidden="true">
        <Icon size={24} data-testid="Icon__6f7a22" />
      </span>
      <span style={staticCardTextStyle}>
        <span style={optionLabelRowStyle}>
          <span style={optionLabelStyle}>{option.label}</span>
          <OptionBadge option={option} data-testid="OptionBadge__6f7a22" />
        </span>
        <span id={descriptionId} style={optionDescriptionStyle}>{option.description}</span>
      </span>
    </div>
  );
}

/** Option badge pill; the tone picks the status colours ('success' when omitted/unknown). */
function OptionBadge({ option }) {
  if (!option.badge) return null;
  const tone = Object.hasOwn(BADGE_TONES, option.badgeTone ?? '') ? option.badgeTone : 'success';
  return (
    <span data-badge-tone={tone} style={BADGE_TONES[tone]}>
      {option.badge}
    </span>
  );
}

function SummaryTable({ columns, data }) {
  return (
    <div style={summaryTableStyle}>
      {columns.map(({ key, label, testId }) => (
        <div key={key} style={summaryCellStyle}>
          <span style={summaryLabelStyle}>{label}</span>
          <span data-testid={testId} style={summaryValueStyle}>{data[key]}</span>
        </div>
      ))}
    </div>
  );
}

function OptionCard({ option, selected, disabled, onSelect, buttonRef }) {
  const variant = selected ? CARD_VARIANTS.selected : CARD_VARIANTS.idle;
  const Icon = option.icon ?? ReceiptText;
  return (
    <button
      ref={buttonRef}
      type="button"
      role="radio"
      aria-checked={selected}
      tabIndex={selected ? 0 : -1}
      data-option-id={option.id}
      data-testid={option.testId}
      onClick={onSelect}
      disabled={disabled}
      className={FOCUS_RING_CLS}
      style={variant.card}
    >
      <span style={iconBoxStyle} aria-hidden="true">
        <Icon size={24} data-testid="Icon__6f7a22" />
      </span>
      <span style={{ ...radioSlotStyle, top: variant.radioInset, right: variant.radioInset }} aria-hidden="true">
        <span style={variant.radioRing}>
          {selected && <span style={radioDotStyle} />}
        </span>
      </span>
      <span style={optionTextStyle}>
        <span style={optionLabelRowStyle}>
          <span style={optionLabelStyle}>{option.label}</span>
          <OptionBadge option={option} data-testid="OptionBadge__6f7a22" />
        </span>
        <span style={optionDescriptionStyle}>{option.description}</span>
      </span>
    </button>
  );
}

function PrimaryIcon({ loading, showArrow }) {
  if (loading) {
    return <Loader2 size={24} className="animate-spin" data-testid="Loader2__6f7a22" />;
  }
  if (!showArrow) return null;
  return <ArrowRight size={24} style={{ opacity: 0.9 }} data-testid="ArrowRight__6f7a22" />;
}

// Single-option mode: label-only pill (no arrow), so the padding is symmetric — except
// while loading, when the spinner takes the arrow's place on the left.
function getPrimaryBtnStyle(loading, labelOnly, disabled = false) {
  const base = labelOnly && !loading ? { ...primaryBtnStyle, padding: '8px 20px' } : primaryBtnStyle;
  if (loading || disabled) {
    return { ...base, opacity: 0.6, cursor: 'not-allowed' };
  }
  return base;
}

/* ── Styles (Figma "PopUps" — Confirmar) ─────────────────────────── */

const FONT_FAMILY = 'Inter, sans-serif';
const SHADOW_XS = '0px 1px 1px hsl(var(--foreground) / 0.05)';
const SHADOW_LG = '0px 10px 15px -3px hsl(var(--foreground) / 0.08), 0px 4px 6px -2px hsl(var(--foreground) / 0.05)';

const overlayStyle = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  backgroundColor: 'hsl(var(--foreground) / 0.3)',
};

// Inline styles cannot express :focus-visible, so the keyboard focus outline is a Tailwind
// utility (outline, not ring: Tailwind's ring is a box-shadow and the cards' own inline
// box-shadow would override it). The colour is the theme's focus-ring token.
const FOCUS_RING_CLS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--focus-ring))]';

const dialogStyle = {
  ...MODAL_STYLES.dialog,
  position: 'relative',
  width: 720,
  maxWidth: 'calc(100vw - 32px)',
  maxHeight: 'calc(100vh - 32px)',
  overflowY: 'auto',
  outline: 'none',
  fontFamily: FONT_FAMILY,
};

const closeBtnStyle = {
  position: 'absolute', top: 6, right: 8,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 2, borderRadius: 360, border: 'none', background: 'transparent',
  color: 'hsl(var(--icon-secondary))', cursor: 'pointer',
};

const headerStyle = {
  display: 'flex', flexDirection: 'column', gap: 2,
  // Right padding keeps a long (wrapping) title clear of the close icon.
  padding: '8px 40px 8px 20px', alignSelf: 'stretch',
};

const titleStyle = { ...MODAL_STYLES.title, flexShrink: 1, overflowWrap: 'anywhere' };

const bodyStyle = {
  display: 'flex', flexDirection: 'column', gap: 12,
  padding: '4px 20px 8px', alignSelf: 'stretch',
};

const summaryTableStyle = {
  display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 20,
  padding: '8px 12px', borderRadius: 8,
  border: '1px solid hsl(var(--border-subtle))',
};

// A 96px basis keeps a 5-column summary on one row at full width and lets it wrap on a
// narrow screen instead of squeezing every value into an unreadable column.
const summaryCellStyle = {
  flex: '1 1 96px', minWidth: 0,
  display: 'flex', flexDirection: 'column',
};

const summaryLabelStyle = {
  fontSize: 12, lineHeight: '16px', letterSpacing: '-0.06px',
  color: 'var(--status-neutral-fg)',
};

const summaryValueStyle = {
  fontSize: 16, lineHeight: '24px', fontWeight: 500,
  color: 'hsl(var(--foreground))', overflowWrap: 'anywhere',
};

const sectionStyle = { display: 'flex', flexDirection: 'column', gap: 20 };

const choiceGroupStyle = { display: 'flex', flexDirection: 'column', gap: 8 };

const questionStyle = {
  margin: 0, fontSize: 14, lineHeight: '24px', fontWeight: 500,
  color: 'hsl(var(--foreground))',
};

// flexDirection comes from the `flex flex-col sm:flex-row` classes (the cards stack below
// 640px); an inline flexDirection would override the breakpoint.
const cardsRowStyle = { alignItems: 'stretch', gap: 20 };

const cardBaseStyle = {
  position: 'relative', flex: '1 0 0', minWidth: 0,
  display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12,
  borderRadius: 12, background: 'hsl(var(--card))',
  textAlign: 'left', fontFamily: FONT_FAMILY, cursor: 'pointer',
};

// Single-option static card: the idle choice card, laid out icon-left, not interactive.
const staticCardStyle = {
  ...cardBaseStyle,
  flex: 'none', flexDirection: 'row', alignItems: 'center',
  padding: 16, border: '1px solid hsl(var(--border-subtle))', boxShadow: SHADOW_XS,
  cursor: 'default',
};

const radioRingBaseStyle = {
  boxSizing: 'border-box', width: 16, height: 16, borderRadius: '50%',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'hsl(var(--card))',
};

// The selected card has a 2px border and the idle one 1px: its padding drops by the extra
// pixel so the content does not shift when the selection changes. The radio insets are the
// Figma offsets (6 / 7 from the outer edge) minus each variant's border width.
const CARD_VARIANTS = {
  selected: {
    card: { ...cardBaseStyle, padding: 15, border: '2px solid hsl(var(--foreground))', boxShadow: SHADOW_LG },
    radioRing: { ...radioRingBaseStyle, border: '1.5px solid hsl(var(--foreground))' },
    radioInset: 4,
  },
  idle: {
    card: { ...cardBaseStyle, padding: 16, border: '1px solid hsl(var(--border-subtle))', boxShadow: SHADOW_XS },
    radioRing: { ...radioRingBaseStyle, border: '1.5px solid hsl(var(--border-control))', boxShadow: SHADOW_XS },
    radioInset: 6,
  },
};

const iconBoxStyle = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 8, borderRadius: 8, background: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border-control))', boxShadow: SHADOW_XS,
  color: 'hsl(var(--icon-secondary))',
};

const radioSlotStyle = {
  position: 'absolute', width: 24, height: 24,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};

const radioDotStyle = {
  width: 8, height: 8, borderRadius: '50%', background: 'hsl(var(--foreground))',
};

const optionTextStyle = { display: 'flex', flexDirection: 'column', alignSelf: 'stretch' };

const staticCardTextStyle = { display: 'flex', flexDirection: 'column', flex: '1 1 auto', minWidth: 0 };

const optionLabelRowStyle = { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 };

const optionLabelStyle = {
  fontSize: 14, lineHeight: '20px', fontWeight: 500, color: 'hsl(var(--foreground))',
};

const badgeBaseStyle = {
  fontSize: 12, lineHeight: '16px', letterSpacing: '-0.06px',
  padding: '4px 10px', borderRadius: 360,
};

// Status tokens from app-shell-core styles.css (light + dark).
const BADGE_TONES = {
  success: { ...badgeBaseStyle, background: 'var(--status-success-bg)', color: 'var(--status-success-fg)' },
  info: { ...badgeBaseStyle, background: 'var(--status-info-bg)', color: 'var(--status-info-fg)' },
};

const optionDescriptionStyle = {
  fontSize: 14, lineHeight: '20px', letterSpacing: '-0.14px',
  color: 'hsl(var(--muted-foreground))',
};

const errorStyle = {
  fontSize: 12, padding: '8px 0', color: 'hsl(var(--destructive))',
  borderTop: '0.5px solid hsl(var(--destructive))',
};

const footerStyle = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 };

const cancelBtnStyle = {
  ...MODAL_STYLES.btnCancel,
  width: 'auto', padding: '8px 20px', lineHeight: '24px',
};

const primaryBtnStyle = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  height: 40, padding: '8px 20px 8px 12px', borderRadius: 360, border: 'none',
  background: 'hsl(var(--foreground))', color: 'hsl(var(--card))',
  fontFamily: FONT_FAMILY, fontSize: 14, fontWeight: 500, lineHeight: '24px',
  cursor: 'pointer',
};
