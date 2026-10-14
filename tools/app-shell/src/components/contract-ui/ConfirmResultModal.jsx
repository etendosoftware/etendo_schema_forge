import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronRight, FileText, ReceiptText, Truck, X } from 'lucide-react';
import { useUI } from '@/i18n';
import { StatusTag } from '@/components/ui/status-tag';
import { isOwnEscape, useDialogFocusTrap } from './ActionChoiceModal.jsx';

// ── Type config ───────────────────────────────────────────────────────────────
// One row per document type: card label, single-document title, «Ver ...» button label, card
// glyph and grammatical gender (drives the «Completado/Completada» badge).

const TYPE_CONFIG = {
  salida:               { labelKey: 'confirmResultModal.docType.salida',               titleKey: 'confirmResultModal.title.albaran',              viewKey: 'soViewShipment', Icon: Truck,       gender: 'masculine' },
  entrada:              { labelKey: 'confirmResultModal.docType.entrada',              titleKey: 'confirmResultModal.title.albaranCompra',         viewKey: 'poViewReceipt',  Icon: Truck,       gender: 'masculine' },
  facturaVenta:         { labelKey: 'confirmResultModal.docType.facturaVenta',         titleKey: 'confirmResultModal.title.factura',              viewKey: 'soViewInvoice',  Icon: ReceiptText, gender: 'feminine' },
  facturaCompra:        { labelKey: 'confirmResultModal.docType.facturaCompra',        titleKey: 'confirmResultModal.title.factura',              viewKey: 'poViewInvoice',  Icon: ReceiptText, gender: 'feminine' },
  facturaRectificativa: { labelKey: 'confirmResultModal.docType.facturaRectificativa', titleKey: 'confirmResultModal.title.facturaRectificativa', viewKey: 'soViewInvoice',  Icon: ReceiptText, gender: 'feminine' },
  pedidoVenta:          { labelKey: 'confirmResultModal.docType.pedidoVenta',          titleKey: 'confirmResultModal.title.pedido',               viewKey: 'sqViewOrder',    Icon: FileText,    gender: 'masculine' },
  // Purchases-side returns (return-to-vendor shipment and its rectificative invoice).
  devolucionCompra:           { labelKey: 'confirmResultModal.docType.devolucionCompra',           titleKey: 'confirmResultModal.title.devolucionCompra',           viewKey: 'confirmResultModal.view.devolucion', Icon: Truck,       gender: 'feminine' },
  facturaRectificativaCompra: { labelKey: 'confirmResultModal.docType.facturaRectificativaCompra', titleKey: 'confirmResultModal.title.facturaRectificativaCompra', viewKey: 'poViewInvoice',                     Icon: ReceiptText, gender: 'feminine' },
};

// Unknown types keep the historical fallback of this component.
const FALLBACK_TYPE = TYPE_CONFIG.facturaCompra;

const COMPLETED_KEY_BY_GENDER = {
  masculine: 'confirmResultModal.status.completedMasculine',
  feminine: 'confirmResultModal.status.completedFeminine',
};

export function getConfirmResultTypeConfig(type) {
  return TYPE_CONFIG[type] ?? FALLBACK_TYPE;
}

/** Title + banner copy for a set of created documents (pure, for reuse and tests). */
export function getConfirmResultCopy(docs, ui) {
  const count = docs.length;
  if (count === 1) {
    return {
      title: ui(getConfirmResultTypeConfig(docs[0].type).titleKey),
      banner: ui('confirmResultModal.bannerOne'),
      bannerHint: ui('confirmResultModal.bannerOneHint'),
    };
  }
  if (count > 1) {
    return {
      title: ui('confirmResultModal.title.many'),
      banner: ui('confirmResultModal.bannerMany', { count }),
      bannerHint: ui('confirmResultModal.bannerManyHint'),
    };
  }
  return { title: ui('followUpDocumentCreated'), banner: null, bannerHint: null };
}

// ── Doc card ──────────────────────────────────────────────────────────────────

function DocCard({ doc, index, ui, onOpen }) {
  const [hovered, setHovered] = useState(false);
  const cfg = getConfirmResultTypeConfig(doc.type);
  const { Icon } = cfg;
  const navigable = Boolean(doc.route);
  // ETP-5381: the badge follows the real status — invoices are confirmed on creation while a
  // shipment in the same popup is still a draft, so this is per document, never blanket.
  const completed = doc.documentStatus === 'CO';
  const statusLabel = ui(completed ? COMPLETED_KEY_BY_GENDER[cfg.gender] : 'confirmResultModal.status.draft');

  const content = (
    <>
      <span style={cardLeftStyle}>
        <span style={iconBoxStyle} aria-hidden="true">
          <Icon size={20} data-testid="Icon__a46cc0" />
        </span>
        <span style={cardTextStyle}>
          <span style={cardLabelRowStyle}>
            <span style={cardLabelStyle}>{ui(cfg.labelKey)}</span>
            <StatusTag tone={completed ? 'success' : 'neutral'} label={statusLabel} data-testid="StatusTag__a46cc0" />
          </span>
          <span style={cardNumberStyle}>{ui('confirmResultModal.docNumber', { number: doc.num })}</span>
        </span>
      </span>
      {navigable && (
        <span style={chevronBoxStyle} aria-hidden="true">
          <ChevronRight size={20} data-testid="ChevronRight__a46cc0" />
        </span>
      )}
    </>
  );

  const commonProps = {
    'data-testid': `confirm-result-card-${index}`,
    'data-doc-type': doc.type,
    'data-doc-status': completed ? 'CO' : 'DR',
  };

  if (!navigable) {
    return <div {...commonProps} style={{ ...cardStyle, cursor: 'default' }}>{content}</div>;
  }

  // A native button: Enter and Space open the document, and it is a natural Tab stop.
  return (
    <button
      type="button"
      {...commonProps}
      onClick={() => onOpen(doc)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={FOCUS_RING_CLS}
      style={{ ...cardStyle, background: hovered ? CARD_HOVER_BG : cardStyle.background }}
    >
      {content}
    </button>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Generated-documents popup (ETP-5674, Figma "SaaS Etendo 2025" node 7359:76164): the single
 * result modal every flow shows after it created one or more documents (confirming an order,
 * invoicing a shipment, a rectificative invoice from a return, a quotation turned into an order
 * or an invoice, a follow-up document...).
 *
 * Callers only describe WHAT was created (`docs`); everything the user reads is derived here
 * from that list, so two flows creating the same document can never word it differently:
 *   - title: one document → its per-type title («Albarán creado», «Factura creada»...);
 *     two or more → «Documentos creados»;
 *   - green banner: «Se ha generado un documento / Ábrelo para consultarlo.» or
 *     «Se han generado N documentos / Abre cualquiera de ellos para consultarlo.»;
 *   - one card per document: type label, status badge (real `documentStatus`, gendered by
 *     type: «Completada» for an invoice, «Completado» for an albarán/pedido), «Nº <number>»;
 *   - buttons: one navigable document → «Cerrar» (secondary) + «Ver albarán/factura/pedido»
 *     (primary, opens it); otherwise → only «Cerrar» (primary) and the cards navigate.
 *
 * Keyboard: focus moves to the primary button on open (so Enter runs the primary action), Tab
 * cycles inside the dialog, Esc closes, Enter/Space on a card opens that document, and focus
 * goes back to the opener on unmount. A click on the backdrop closes it too (same rule as the
 * PopUps choice modal, ActionChoiceModal); a click inside the dialog does not.
 *
 * @param {object} props
 * @param {Array<{type: string, num: string, documentStatus?: string|null, route?: string}>} props.docs
 *   Created documents. `type` is a TYPE_CONFIG key; `documentStatus === 'CO'` badges it as
 *   completed (anything else as draft); a doc without `route` is shown but not navigable.
 * @param {(route: string) => void} props.navigate Opens a document route.
 * @param {() => void} props.onClose Close button, close icon, Esc and backdrop click.
 * @param {() => void} [props.onNavigate] Runs instead of `onClose` right before navigating
 *   (defaults to `onClose`).
 */
export function ConfirmResultModal({ docs = [], navigate, onClose, onNavigate }) {
  const ui = useUI();
  const dialogRef = useRef(null);
  const primaryRef = useRef(null);
  const titleId = useId();

  const { title, banner, bannerHint } = getConfirmResultCopy(docs, ui);
  // Product decision (ETP-5674): a single navigable document gets «Cerrar» + «Ver ...»; with
  // two or more (or nothing to open) the cards are the way in and «Cerrar» is the primary.
  const singleDoc = docs.length === 1 && docs[0].route ? docs[0] : null;

  const openDoc = (doc) => { (onNavigate ?? onClose)(); navigate(doc.route); };
  const runPrimary = () => { if (singleDoc) openDoc(singleDoc); else onClose(); };

  useDialogFocusTrap(dialogRef);

  // Focus moves into the dialog on open — the primary button, so Enter runs it — and goes back
  // to whoever had it (the button that started the flow) when the popup unmounts.
  useEffect(() => {
    const opener = typeof document === 'undefined' ? null : document.activeElement;
    (primaryRef.current ?? dialogRef.current)?.focus?.();
    return () => {
      if (opener && opener !== document.body && opener.isConnected) opener.focus?.();
    };
  }, []);

  const handleKeyDown = (event) => {
    if (isOwnEscape(event, dialogRef.current)) {
      event.stopPropagation();
      onClose();
      return;
    }
    // Enter on the dialog itself (nothing inside focused) runs the primary action; Enter on a
    // button or card is left to that control.
    if (event.key === 'Enter' && event.target === dialogRef.current) {
      event.preventDefault();
      runPrimary();
    }
  };

  const closeButtonProps = {
    type: 'button',
    onClick: onClose,
    // Targeted by the create-sales-order walkthrough's final step (`confirmed-ack`). Renaming
    // it breaks a shipped tour -- see docs/walkthrough-flows.md. It stays on «Cerrar» in BOTH
    // footer variants (secondary next to «Ver ...», or the only, primary, button).
    'data-testid': 'action-confirm-result-close',
    className: FOCUS_RING_CLS,
  };

  return (
    // zIndex 50 = the app's modal tier. It was 9999, which put this notice above
    // EVERY global tool -- including the walkthrough overlay at z-70, whose step
    // card it covered completely while a tour pointed at this very modal.
    // Nothing needs to sit above a confirmation result except toasts, which are
    // already higher.
    <div data-testid="confirm-result-modal" onClick={onClose} style={overlayStyle}>
      {/*
        ETP-5108: no `fontFamily` here on purpose. The design system declares the
        family in exactly one place — `body` in the core's styles.css — and every
        component inherits it. This shell used to override it with a system-font
        stack, which silently took the whole modal (title, subtitle, doc card and
        buttons) off Inter and onto whatever sans the OS ships. It showed up worst
        on the document number, whose digit widths differ from Inter's.
      */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid="confirm-result-dialog"
        // Keeps a click inside the dialog from reaching the backdrop's close handler.
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        style={dialogStyle}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={ui('confirmResultModal.closeIcon')}
          data-testid="action-confirm-result-dismiss"
          className={FOCUS_RING_CLS}
          style={closeIconBtnStyle}
        >
          <X size={20} data-testid="X__a46cc0" />
        </button>

        <div style={headerStyle}>
          <h2 id={titleId} data-testid="confirm-result-title" style={titleStyle}>{title}</h2>
        </div>

        <div style={bodyStyle}>
          {banner && (
            <div style={bannerWrapperStyle}>
              <div role="status" data-testid="confirm-result-banner" style={bannerStyle}>
                {/* Figma: bare check mark (no circle) in a 24×24 box; lucide's glyph is ~16×11 at size 24. */}
                <Check size={24} strokeWidth={1.5} color={SUCCESS_ACCENT} style={{ flexShrink: 0 }} aria-hidden="true" data-testid="Check__a46cc0" />
                <div style={bannerTextStyle}>
                  <div style={bannerLineStyle}>{banner}</div>
                  <div style={bannerHintStyle}>{bannerHint}</div>
                </div>
              </div>
            </div>
          )}

          {docs.length > 0 && (
            <div style={cardsStyle}>
              {docs.map((doc, index) => (
                <DocCard
                  key={`${doc.type}-${doc.num}-${index}`}
                  doc={doc}
                  index={index}
                  ui={ui}
                  onOpen={openDoc}
                  data-testid="DocCard__a46cc0" />
              ))}
            </div>
          )}

          <div style={footerStyle}>
            {singleDoc ? (
              <>
                <button {...closeButtonProps} style={secondaryBtnStyle}>
                  {ui('soClose')}
                </button>
                <button
                  ref={primaryRef}
                  type="button"
                  onClick={() => openDoc(singleDoc)}
                  data-testid="action-confirm-result-view"
                  className={FOCUS_RING_CLS}
                  style={primaryBtnStyle}
                >
                  {ui(getConfirmResultTypeConfig(singleDoc.type).viewKey)}
                </button>
              </>
            ) : (
              <button {...closeButtonProps} ref={primaryRef} style={primaryBtnStyle}>
                {ui('soClose')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Styles (Figma "SaaS Etendo 2025" — generated documents popup) ───────────── */

// Inline styles cannot express :focus-visible, so the keyboard focus outline is a Tailwind
// utility (outline, not ring: the cards' inline box-shadow would override a ring). Same
// utility as ActionChoiceModal.
const FOCUS_RING_CLS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--focus-ring))]';

// Figma's Alert accent (left border + check glyph). The core has no token for this solid
// green — its success tokens are the banner's background/foreground used below.
const SUCCESS_ACCENT = '#2DCA72';
const SHADOW_XS = '0px 1px 2px hsl(var(--foreground) / 0.05)';
const CARD_HOVER_BG = 'var(--status-neutral-bg)';

const overlayStyle = {
  position: 'fixed', inset: 0, zIndex: 50,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'hsl(var(--foreground) / 0.3)',
};

// Shadow "Overlay/Light": four soft layers plus a 1px ring acting as the border.
const dialogStyle = {
  position: 'relative', boxSizing: 'border-box',
  display: 'flex', flexDirection: 'column',
  width: 500, maxWidth: 'calc(100vw - 32px)', maxHeight: 'calc(100vh - 32px)', overflowY: 'auto',
  padding: '8px 0', gap: 8, borderRadius: 8, outline: 'none',
  background: 'hsl(var(--card))', color: 'hsl(var(--foreground))',
  boxShadow: '0px 0px 0px 1px hsl(var(--foreground) / 0.1), 0px 24px 48px hsl(var(--foreground) / 0.03), 0px 10px 18px hsl(var(--foreground) / 0.03), 0px 5px 8px hsl(var(--foreground) / 0.04), 0px 2px 4px hsl(var(--foreground) / 0.04)',
};

const closeIconBtnStyle = {
  position: 'absolute', top: 10, right: 16,
  width: 24, height: 24, padding: 2, borderRadius: 360, border: 'none', background: 'transparent',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: 'hsl(var(--icon-secondary))', cursor: 'pointer',
};

// Right padding keeps a long (wrapping) title clear of the close icon.
const headerStyle = { padding: '8px 48px 8px 20px' };

const titleStyle = {
  margin: 0, textAlign: 'left',
  fontSize: 20, lineHeight: '28px', fontWeight: 600, color: 'hsl(var(--foreground))',
  overflowWrap: 'anywhere',
};

const bodyStyle = { display: 'flex', flexDirection: 'column', padding: '4px 20px 8px' };

// Wrapper padding (8) + cards margin (8) = the 16px Figma gap between the alert and the cards.
const bannerWrapperStyle = { paddingBottom: 8 };

const bannerStyle = {
  display: 'flex', alignItems: 'flex-start', gap: 4, padding: 16,
  borderLeft: `2px solid ${SUCCESS_ACCENT}`, borderRadius: '0 8px 8px 0',
  background: 'var(--status-success-bg)', color: 'var(--status-success-fg)',
};

const bannerTextStyle = { display: 'flex', flexDirection: 'column', padding: '0 8px', minWidth: 0 };

const bannerLineStyle = { fontSize: 14, lineHeight: '24px', fontWeight: 500 };

const bannerHintStyle = { fontSize: 14, lineHeight: '20px', fontWeight: 400, letterSpacing: '-0.14px' };

const cardsStyle = { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 };

const cardStyle = {
  boxSizing: 'border-box', width: '100%',
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
  padding: 16, borderRadius: 12,
  border: '1px solid hsl(var(--border-subtle))', background: 'hsl(var(--card))', boxShadow: SHADOW_XS,
  color: 'hsl(var(--foreground))', textAlign: 'left', cursor: 'pointer',
  transition: 'background .15s',
};

const cardLeftStyle = { display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 };

const iconBoxStyle = {
  boxSizing: 'border-box', width: 32, height: 32, flexShrink: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  borderRadius: 8, border: '1px solid hsl(var(--border-control))', background: 'hsl(var(--card))',
  boxShadow: SHADOW_XS, color: 'hsl(var(--icon-secondary))',
};

const cardTextStyle = { display: 'flex', flexDirection: 'column', minWidth: 0 };

const cardLabelRowStyle = { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4 };

const cardLabelStyle = { fontSize: 14, lineHeight: '20px', fontWeight: 500, color: 'hsl(var(--foreground))' };

const cardNumberStyle = {
  fontSize: 14, lineHeight: '20px', fontWeight: 400, letterSpacing: '-0.14px',
  color: 'hsl(var(--muted-foreground))', overflowWrap: 'anywhere',
};

const chevronBoxStyle = {
  width: 32, height: 32, flexShrink: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: 'hsl(var(--icon-secondary))',
};

// Cards → footer: 20px. No background, padding or border of its own.
const footerStyle = { display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 20 };

const pillBaseStyle = {
  boxSizing: 'border-box', height: 40, padding: '8px 20px', borderRadius: 360,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 14, lineHeight: '24px', fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap',
};

const primaryBtnStyle = {
  ...pillBaseStyle,
  border: 'none', background: 'hsl(var(--foreground))', color: 'hsl(var(--card))',
};

const secondaryBtnStyle = {
  ...pillBaseStyle,
  border: '1px solid hsl(var(--border-control))', background: 'hsl(var(--card))',
  color: 'hsl(var(--foreground))', boxShadow: SHADOW_XS,
};
