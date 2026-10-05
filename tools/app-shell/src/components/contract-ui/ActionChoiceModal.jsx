import { useState } from 'react';
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
 * @param {object} props
 * @param {string} props.title Modal title.
 * @param {Array<{key: string, label: string, testId?: string}>} props.summaryColumns Summary table headers.
 * @param {Object<string, import('react').ReactNode>} props.summaryData Already-formatted value per column key.
 * @param {string} props.question Text shown above the options.
 * @param {Array<{id: string, label: string, description: string, badge?: string, testId?: string}>} props.options
 * @param {string} [props.defaultOptionId] Option selected on mount; the first option when omitted.
 * @param {() => void} props.onCancel Cancel button, close icon and backdrop action.
 * @param {(optionId: string) => void} props.onContinue Continue button action, receives the selected option id.
 * @param {boolean} [props.loading] Shows the processing state and blocks a second submit.
 * @param {string|null} [props.error] Error message shown above the buttons.
 */
export default function ActionChoiceModal({
  title,
  summaryColumns,
  summaryData,
  question,
  options,
  defaultOptionId,
  onCancel,
  onContinue,
  loading = false,
  error = null,
}) {
  const ui = useUI();
  const [selectedId, setSelectedId] = useState(defaultOptionId ?? options[0]?.id);

  return (
    <div onClick={onCancel} style={overlayStyle}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        style={dialogStyle}
      >
        <button type="button" onClick={onCancel} aria-label={ui('close')} style={closeBtnStyle}>
          <X size={20} data-testid="X__6f7a22" />
        </button>

        <div style={headerStyle}>
          <h2 style={MODAL_STYLES.title}>{title}</h2>
        </div>

        <div style={bodyStyle}>
          <SummaryTable
            columns={summaryColumns}
            data={summaryData}
            data-testid="SummaryTable__6f7a22" />

          <div style={sectionStyle}>
            <div style={choiceGroupStyle}>
              <p style={questionStyle}>{question}</p>
              <div role="radiogroup" aria-label={question} style={cardsRowStyle}>
                {options.map((option) => (
                  <OptionCard
                    key={option.id}
                    option={option}
                    selected={option.id === selectedId}
                    disabled={loading}
                    onSelect={() => setSelectedId(option.id)}
                    data-testid="OptionCard__6f7a22" />
                ))}
              </div>
            </div>

            {error && <div role="alert" style={errorStyle}>{error}</div>}

            <div style={footerStyle}>
              <button type="button" onClick={onCancel} disabled={loading} style={cancelBtnStyle}>
                {ui('cancel')}
              </button>
              <button
                type="button"
                data-testid="action-confirm-modal"
                onClick={() => onContinue(selectedId)}
                disabled={loading}
                style={getPrimaryBtnStyle(loading)}
              >
                <PrimaryIcon loading={loading} data-testid="PrimaryIcon__6f7a22" />
                {loading ? ui('soProcessing') : ui('continue')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
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

function OptionCard({ option, selected, disabled, onSelect }) {
  const variant = selected ? CARD_VARIANTS.selected : CARD_VARIANTS.idle;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      data-testid={option.testId}
      onClick={onSelect}
      disabled={disabled}
      style={variant.card}
    >
      <span style={iconBoxStyle}>
        <ReceiptText size={24} data-testid="ReceiptText__6f7a22" />
      </span>
      <span style={{ ...radioSlotStyle, top: variant.radioInset, right: variant.radioInset }}>
        <span style={variant.radioRing}>
          {selected && <span style={radioDotStyle} />}
        </span>
      </span>
      <span style={optionTextStyle}>
        <span style={optionLabelRowStyle}>
          <span style={optionLabelStyle}>{option.label}</span>
          {option.badge && <span style={badgeStyle}>{option.badge}</span>}
        </span>
        <span style={optionDescriptionStyle}>{option.description}</span>
      </span>
    </button>
  );
}

function PrimaryIcon({ loading }) {
  if (loading) {
    return <Loader2 size={24} className="animate-spin" data-testid="Loader2__6f7a22" />;
  }
  return <ArrowRight size={24} style={{ opacity: 0.9 }} data-testid="ArrowRight__6f7a22" />;
}

function getPrimaryBtnStyle(loading) {
  if (loading) {
    return { ...primaryBtnStyle, opacity: 0.6, cursor: 'not-allowed' };
  }
  return primaryBtnStyle;
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

const dialogStyle = {
  ...MODAL_STYLES.dialog,
  position: 'relative',
  width: 720,
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
  padding: '8px 20px', alignSelf: 'stretch',
};

const bodyStyle = {
  display: 'flex', flexDirection: 'column', gap: 12,
  padding: '4px 20px 8px', alignSelf: 'stretch',
};

const summaryTableStyle = {
  display: 'flex', alignItems: 'flex-start', gap: 20,
  padding: '8px 12px', borderRadius: 8,
  border: '1px solid hsl(var(--border-subtle))',
};

const summaryCellStyle = {
  flex: '1 0 0', minWidth: 0,
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

const cardsRowStyle = { display: 'flex', alignItems: 'stretch', gap: 20 };

const cardBaseStyle = {
  position: 'relative', flex: '1 0 0', minWidth: 0,
  display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12,
  borderRadius: 12, background: 'hsl(var(--card))',
  textAlign: 'left', fontFamily: FONT_FAMILY, cursor: 'pointer',
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

const optionLabelRowStyle = { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 };

const optionLabelStyle = {
  fontSize: 14, lineHeight: '20px', fontWeight: 500, color: 'hsl(var(--foreground))',
};

const badgeStyle = {
  fontSize: 12, lineHeight: '16px', letterSpacing: '-0.06px',
  padding: '4px 10px', borderRadius: 360,
  background: 'var(--status-success-bg)', color: 'var(--status-success-fg)',
};

const optionDescriptionStyle = {
  fontSize: 14, lineHeight: '20px', letterSpacing: '-0.14px',
  color: 'hsl(var(--muted-foreground))',
};

const errorStyle = {
  fontSize: 12, padding: '8px 0', color: 'hsl(var(--destructive))',
  borderTop: '0.5px solid hsl(var(--destructive))',
};

const footerStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between' };

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
