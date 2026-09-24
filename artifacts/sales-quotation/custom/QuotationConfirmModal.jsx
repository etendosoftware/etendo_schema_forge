import { useState, useEffect } from 'react';
import { ClipboardList, FileText } from 'lucide-react';
import { useUI } from '@/i18n';
import { fetchOptionalJson } from '@/windows/custom/shared/pdfUtils.js';
import { formatCurrency } from '@/lib/formatCurrency.js';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { MODAL_STYLES } from '@/components/contract-ui/modal-styles.js';
import { ActionModalSummary } from '@/components/contract-ui/ActionModalSummary.jsx';

/**
 * Confirmation modal for Sales Quotation in Under Evaluation (UE) state.
 * Lets the user create the final Sales Order or Invoice from the quotation.
 * Assumes the quotation is already UE — the DR → UE transition lives in SendToEvaluationModal.
 */
export default function QuotationConfirmModal({
  quotationId,
  data,
  token,
  apiBaseUrl,
  onClose,
  onSave,
  onRefresh,
}) {
  const ui = useUI();
  const [selected, setSelected] = useState('order');
  const [loading, setLoading] = useState(false);
  const [createdDoc, setCreatedDoc] = useState(null);
  const [error, setError] = useState(null);
  const [lineCount, setLineCount] = useState(null);

  const entityUrl = `${apiBaseUrl}/quotation`;
  // ETP-4576 - the credential belongs to apiFetch, not to the component: it picks the
  // active scheme's headers, and the CSRF proof on every unsafe method.
  // Empty base ON PURPOSE: every URL below is already absolute, and several address a
  // DIFFERENT spec than this window's. resolveApiUrl only skips the prefix when the path
  // starts with that same base, so a configured base turns a cross-spec call into
  // /sws/neo/<this>/sws/neo/<other>/... and a 404.
  const apiFetch = useApiFetch('');

  const [freshData, setFreshData] = useState(null);

  // Fetch fresh record + line count on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [recRes, linesRes] = await Promise.all([
          apiFetch(`${entityUrl}/${quotationId}`),
          apiFetch(`${apiBaseUrl}/quotationLine?parentId=${quotationId}&_startRow=0&_endRow=999`),
        ]);
        if (cancelled) return;
        if (recRes.ok) {
          const recJson = await recRes.json();
          const rec = recJson?.response?.data?.[0] ?? recJson;
          setFreshData(rec);
        }
        if (linesRes.ok) {
          const linesJson = await linesRes.json();
          setLineCount(linesJson?.response?.data?.length ?? 0);
        }
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, [quotationId, entityUrl, apiBaseUrl, apiFetch]);

  // ETP-4468 — the in-memory `data` prop (which already reflects any unsaved
  // header edit the user made before clicking Confirm) must win over the
  // server-fetched `freshData` (stale because nothing was saved yet). The
  // fresh fetch is only a fallback for the very first render before `data`
  // arrives, or if `data` is genuinely empty.
  const d              = data || freshData || {};
  const documentNo     = d.documentNo || '';
  const bpName         = d['businessPartner$_identifier'] || '';
  // Trust the server totals: once the quotation reached UE, TotalDiscountService
  // materialized the ETGO_DTO discount line and grandTotalAmount / summedLineAmount
  // already reflect etgoTotalDiscount. The earlier client-side discountFactor
  // multiplication double-applied the discount on top of the already-discounted
  // server values (visible once the ETGO_DTO product was installed).
  const grandTotal     = Number(d.grandTotalAmount ?? d.grandTotal ?? 0) || 0;
  const totalLines     = Number(d.summedLineAmount ?? d.totalLines ?? d.grandTotalAmount ?? 0) || 0;
  const currency       = d['currency$_identifier'] || '';

  // ETP-5398 — the summary strip's columns, same shape as SendToEvaluationModal. The two
  // testIds are unchanged and still land on the amounts: two E2E specs read their text.
  const summaryItems = [
    { label: ui('quotationDocumentLabel'), value: documentNo },
    { label: ui('contact'), value: bpName },
    { label: ui('lines'), value: lineCount ?? '…' },
    { label: ui('soSubtotal'), value: formatCurrency(currency, totalLines), testId: 'confirm-summary-subtotal' },
    { label: ui('total'), value: formatCurrency(currency, grandTotal), testId: 'confirm-summary-total' },
  ];

  const handleConfirm = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);

    // ETP-4468 — force-save any unsaved header edit before either conversion
    // path (order or invoice). Both convert the quotation using whatever
    // header state is current, so an unsaved edit would otherwise be
    // silently discarded.
    if (onSave) {
      const saved = await onSave();
      if (!saved?.id) {
        setError(ui('sqSaveBeforeConfirmError'));
        setLoading(false);
        return;
      }
    }

    try {
      const baseNeoUrl = apiBaseUrl.replace(/\/sales-quotation$/, '');

      // Exchange rate check: if currencies differ, verify a rate exists for the document date
      const docCurrency = d['currency$_identifier'];
      const docDate = d.orderDate;
      if (docCurrency && docDate) {
        try {
          const session = await fetchOptionalJson(`${baseNeoUrl}/session`, token);
          const orgCurrency = session?.organization?.['currency$_identifier'];
          const orgCurrencyId = session?.organization?.currency;
          if (orgCurrency && docCurrency !== orgCurrency) {
            const fromCurrency = d.currency || docCurrency;
            const toCurrency = orgCurrencyId ?? orgCurrency;
            const rateData = await fetchOptionalJson(
              `${baseNeoUrl}/validate-exchange-rate?fromCurrency=${encodeURIComponent(fromCurrency)}&toCurrency=${encodeURIComponent(toCurrency)}&date=${encodeURIComponent(docDate)}`,
              token,
            );
            if (rateData && !rateData.hasRate) {
              setError(ui('noExchangeRateAvailable'));
              setLoading(false);
              return;
            }
          }
        } catch { /* non-fatal — allow confirmation to proceed */ }
      }

      if (selected === 'order') {
        const res = await apiFetch(
          `${entityUrl}/${quotationId}/action/Convertquotation`,
          { method: 'POST', body: JSON.stringify({ fieldValues: {} }) },
        );
        if (!res.ok) {
          const err = await res.json().catch(() => null);
          throw new Error(
            ui('sqOrderConfirmedError')
            + (err?.response?.message || err?.message || `Error (${res.status})`)
          );
        }
        // ETP-4779 — the sales order now exists; let the "Documentos" section
        // refetch immediately instead of requiring a full page reload (mirrors
        // sales-order:document-created / purchase-order:document-created).
        window.dispatchEvent(new CustomEvent('sales-quotation:document-created'));

        // Fetch created order by quotation link
        const criteria = JSON.stringify([{ fieldName: 'quotation', operator: 'equals', value: quotationId }]);
        const orderRes = await apiFetch(
          `${baseNeoUrl}/sales-order/header?${new URLSearchParams({ criteria, _limit: '5' })}`,
          {},
        );
        if (orderRes.ok) {
          const orderJson = await orderRes.json();
          const rows = orderJson?.response?.data ?? [];
          if (rows.length > 0) {
            const order = rows[0];

            // Step 3: If order was auto-completed, reactivate to Draft
            let finalStatus = order.documentStatus;
            if (order.documentStatus === 'CO') {
              try {
                const reactRes = await apiFetch(
                  `${baseNeoUrl}/sales-order/header/${order.id}/action/DocAction`,
                  { method: 'POST', body: JSON.stringify({ docAction: 'RE' }) },
                );
                if (reactRes.ok) finalStatus = 'DR';
              } catch { /* best-effort */ }
            }

            const status = finalStatus === 'DR' ? 'Draft' : 'Completed';
            setCreatedDoc({
              type: 'order', id: order.id,
              documentNo: order.documentNo,
              total: formatCurrency(currency, order.grandTotalAmount ?? order.grandTotal),
              status,
            });
            return;
          }
        }
        setCreatedDoc({ type: 'order', id: null, documentNo: '?', total: '', status: 'Draft' });

      } else {
        const res = await apiFetch(
          `${entityUrl}/${quotationId}/action/createDraftInvoice`,
          { method: 'POST', body: JSON.stringify({}) },
        );
        if (!res.ok) {
          const err = await res.json().catch(() => null);
          throw new Error(
            err?.response?.message || err?.message || `Error (${res.status})`
          );
        }
        // ETP-4779 — see rationale above (order path).
        window.dispatchEvent(new CustomEvent('sales-quotation:document-created'));
        const doc = (await res.json())?.response?.data;
        setCreatedDoc({
          type: 'invoice',
          id: doc?.id ?? null,
          documentNo: doc?.documentNo ?? '',
          total: formatCurrency(currency, doc?.grandTotalAmount ?? grandTotal),
          // ETP-5381: the invoice is created AND confirmed in one step now, so this must read
          // the real status instead of the hardcoded 'Draft' it used to assume — otherwise the
          // badge below says "Borrador" over a confirmed invoice.
          status: doc?.documentStatus === 'CO' ? 'Completed' : (doc?.documentStatus ?? 'Draft'),
        });
      }
    } catch (err) {
      setError(err.message || ui('soErrorOccurred'));
    } finally {
      setLoading(false);
    }
  };

  const handleGoToDoc = () => {
    if (!createdDoc?.id) { handleCloseAfterCreate(); return; }
    // ETP-5378 — this modal now also opens from the LIST row kebab, whose path is
    // bare `/sales-quotation` (no trailing record id), not just the form's
    // `/sales-quotation/{recordId}`. The old regex required a `/` right after
    // "sales-quotation" to strip anything, so from the list it matched nothing,
    // basePath stayed `/sales-quotation`, and the built URL doubled up into
    // `/sales-quotation/sales-order/{id}` — a dead route (reported live: "Ver
    // pedido" from a list-confirmed quotation). The trailing segment is optional
    // now, so both origins strip to the same, correct app-root basePath.
    const basePath = window.location.pathname.replace(/\/sales-quotation(\/.*)?$/, '');
    const target = createdDoc.type === 'order' ? 'sales-order' : 'sales-invoice';
    window.location.href = `${basePath}/${target}/${createdDoc.id}`;
  };

  // ETP-4779 — after creating a document, refresh the header state (badge,
  // readonly, etc.) via onRefresh instead of a full page reload. The
  // "Documentos" section already refetched off the sales-quotation:document-created
  // event dispatched in handleConfirm above.
  const handleCloseAfterCreate = () => {
    onClose();
    onRefresh?.();
  };

  // ── Success state ──────────────────────────────────────────
  if (createdDoc) {
    const docLabel = createdDoc.type === 'order' ? ui('sqOrderCreated') : ui('soInvoiceCreated');
    const goLabel  = createdDoc.type === 'order' ? ui('sqViewOrder')    : ui('soViewInvoice');
    const isDraft = createdDoc.status === 'Draft';
    const badgeColor = isDraft ? { bg: 'var(--status-warning-bg)', text: 'var(--status-warning-fg)' } : { bg: 'var(--status-success-bg)', text: 'var(--status-success-fg)' };
    const badgeLabel = isDraft ? ui('statusDraft') : ui('statusCompleted');

    return (
      <div style={overlayStyle}>
        <div onClick={e => e.stopPropagation()} style={{ ...cardStyle, width: 400 }}>
          <div style={{ padding: '28px 24px', textAlign: 'center' }}>
            <div style={{
              width: 48, height: 48, borderRadius: '50%', margin: '0 auto 14px',
              background: 'var(--status-success-bg)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--status-success-fg)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div style={{ fontSize: 15, fontWeight: 500, color: 'hsl(var(--foreground))' }}>
              {docLabel}
            </div>
            <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              {createdDoc.documentNo && (
                <span>
                  {ui(createdDoc.type === 'invoice' ? 'invoiceDoc' : 'orderDoc',
                      { number: createdDoc.documentNo })}
                </span>
              )}
              {createdDoc.total && <><span style={{ color: 'hsl(var(--foreground))' }}>·</span> <span>{createdDoc.total}</span></>}
              <span style={{
                fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 99,
                background: badgeColor.bg, color: badgeColor.text,
              }}>
                {badgeLabel}
              </span>
            </div>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8,
            padding: '12px 16px', borderTop: '0.5px solid hsl(var(--border-subtle))',
          }}>
            <button type="button" onClick={handleCloseAfterCreate} style={btnSecondary}>
              {ui('soClose')}
            </button>
            {createdDoc.id && (
              <button type="button" onClick={handleGoToDoc} style={btnPrimary}>
                {goLabel} →
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Selection state ────────────────────────────────────────
  return (
    <div onClick={onClose} style={overlayStyle}>
      <div onClick={e => e.stopPropagation()} style={cardStyle}>

        {/* ETP-5398 — the title is the ACTION, not the document reference. The document
            number moved into the summary strip below, alongside the contact and amounts. */}
        <div style={headerStyle}>
          <span style={MODAL_STYLES.title}>{ui('sqConfirmSaleTitle')}</span>
          <button type="button" onClick={onClose} aria-label={ui('cancel')} style={MODAL_STYLES.closeBtn}>
            &times;
          </button>
        </div>

        <div style={bodyStyle}>
          <ActionModalSummary items={summaryItems} />

          <div style={optionsBlockStyle}>
            <div style={questionStyle}>{ui('sqWhatToDo')}</div>
            {/* ETP-5398 — the two choices sit SIDE BY SIDE, each one a column: icon and
                radio on the top row, then the title, then the description. Stacked full
                width they read as a list of settings rather than as one either/or pick. */}
            <div style={optionsRowStyle}>
              <OptionCard
                testId="confirm-option-order"
                selected={selected === 'order'}
                onClick={() => setSelected('order')}
                icon={<ClipboardList size={20} />}
                title={ui('sqCreateOrder')}
                badge={ui('soRecommended')}
                subtitle={ui('sqCreateOrderDesc')}
              />
              <OptionCard
                testId="confirm-option-invoice"
                selected={selected === 'invoice'}
                onClick={() => setSelected('invoice')}
                icon={<FileText size={20} />}
                title={ui('soInvoiceDirectly')}
                subtitle={ui('sqInvoiceDirectlyDesc')}
              />
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{ padding: '8px 20px', fontSize: 12, color: 'hsl(var(--destructive))', background: 'hsl(var(--card))', borderTop: '0.5px solid hsl(var(--destructive))' }}>
            {error}
          </div>
        )}

        {/* Footer is space-between: Cancelar anchors left, the primary right. No padding
            on top: the body's own 20px bottom padding is the gap to the option cards. */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '0 20px 20px' }}>
          <button type="button" onClick={onClose} disabled={loading}
            style={{ ...btnSecondary, cursor: loading ? 'not-allowed' : 'pointer' }}>
            {ui('cancel')}
          </button>
          {/* The label is the generic "Continuar": which document gets created is the
              option card the user just picked, and repeating it on the button made the
              two read as two different decisions. The arrow leads the label, per frame. */}
          <button type="button" data-testid="action-confirm-modal" onClick={handleConfirm} disabled={loading}
            style={loading ? btnPrimaryDisabled : btnPrimary}>
            {loading && (
              <svg style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }}
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
            )}
            {!loading && <span aria-hidden="true">→</span>}
            {loading ? ui('soProcessing') : ui('continue')}
          </button>
        </div>
        {/* Outside the footer on purpose: it is a flex child there, and under
            `space-between` a third child pushes the primary button to the centre. */}
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}

/* ── Option card ───────────────────────────────────────────────── */

function OptionCard({ selected, onClick, icon, title, badge, subtitle, disabled, testId }) {
  return (
    <div
      data-testid={testId}
      onClick={disabled ? undefined : onClick}
      style={optionCardStyle(selected, disabled)}
    >
      <div style={optionTopRowStyle}>
        <div style={optionIconBoxStyle}>{icon}</div>
        <OptionRadio selected={selected} />
      </div>
      <div style={optionTitleRowStyle}>
        <span style={optionTitleStyle}>{title}</span>
        {badge && <span style={optionBadgeStyle}>{badge}</span>}
      </div>
      <div style={optionSubtitleStyle}>{subtitle}</div>
    </div>
  );
}

/**
 * ETP-5398 — selection is expressed by the NEUTRAL palette, not by the status-info blue
 * the card used to paint its border, its icon and even its title with. `--status-info-*`
 * is banner messaging; a picked option is not a status, and in dark theme that family
 * reads as a saturated blue against the very buttons this ticket just turned black.
 *
 * Split in two returns rather than a chain of ternaries inside one object: the selected
 * card carries a 2px border, so its padding drops by 1px to keep both cards the same
 * outer size and stop the row from twitching as the user switches option.
 */
function optionCardStyle(selected, disabled) {
  const base = {
    ...OPTION_CARD_BASE,
    opacity: disabled ? 0.5 : 1,
    cursor: disabled ? 'not-allowed' : 'pointer',
  };
  if (selected) return { ...base, border: '2px solid hsl(var(--foreground))', padding: '15px' };
  return { ...base, border: '1px solid hsl(var(--border-control))', padding: '16px' };
}

function OptionRadio({ selected }) {
  if (selected) {
    return (
      <span style={{ ...OPTION_RADIO_BASE, border: '1.5px solid hsl(var(--foreground))' }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'hsl(var(--foreground))' }} />
      </span>
    );
  }
  return <span style={{ ...OPTION_RADIO_BASE, border: '1.5px solid hsl(var(--border-control))' }} />;
}

/* ── Shared styles ─────────────────────────────────────────────── */

const overlayStyle = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  backgroundColor: 'hsl(var(--foreground) / 0.3)',
};

// ETP-5398 — widened from 480: the summary strip carries five columns AND the two option
// cards now sit side by side, so the frame needs room for both. Widths stay per-modal,
// not normalised (SendToEvaluationModal has no option row and stays at 620).
const cardStyle = {
  width: 720, maxWidth: '92vw', maxHeight: '80vh', display: 'flex', flexDirection: 'column',
  overflow: 'hidden', borderRadius: 8, backgroundColor: 'hsl(var(--card))',
  boxShadow: MODAL_STYLES.dialog.boxShadow, border: '0.5px solid hsl(var(--border-subtle))',
};

// The divider belongs under the header.
const headerStyle = {
  display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  gap: 20, padding: '16px 20px', borderBottom: '1px solid hsl(var(--border-subtle))',
};

const bodyStyle = {
  display: 'flex', flexDirection: 'column', gap: 20, padding: '20px',
};

const optionsBlockStyle = {
  display: 'flex', flexDirection: 'column', gap: 10,
};

const questionStyle = {
  fontFamily: 'Inter, sans-serif', fontSize: '14px', fontWeight: 500, lineHeight: '20px',
  color: 'hsl(var(--foreground))',
};

// `alignItems: stretch` is what keeps the shorter card as tall as the longer one, so the
// two radios stay on the same line whatever the description length.
const optionsRowStyle = {
  display: 'flex', flexDirection: 'row', alignItems: 'stretch', gap: 12,
};

const OPTION_CARD_BASE = {
  boxSizing: 'border-box',
  flex: '1 1 0', minWidth: 0,
  display: 'flex', flexDirection: 'column', gap: 6,
  borderRadius: 12,
  background: 'hsl(var(--card))',
  transition: 'border-color 0.15s',
};

const optionTopRowStyle = {
  display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  gap: 8, marginBottom: 6,
};

// `--muted` is a BACKGROUND token, which is exactly what this tile is. The icon on top of
// it takes `--foreground`; the card used to do the reverse and paint the icon itself with
// `--muted`, which made it invisible against the card.
const optionIconBoxStyle = {
  width: 40, height: 40, borderRadius: 8, flexShrink: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'hsl(var(--muted))', color: 'hsl(var(--foreground))',
};

const OPTION_RADIO_BASE = {
  boxSizing: 'border-box',
  width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'hsl(var(--card))',
};

const optionTitleRowStyle = {
  display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap',
};

const optionTitleStyle = {
  fontFamily: 'Inter, sans-serif', fontSize: '15px', fontWeight: 600, lineHeight: '20px',
  color: 'hsl(var(--foreground))',
};

const optionBadgeStyle = {
  fontFamily: 'Inter, sans-serif', fontSize: '11px', fontWeight: 500, lineHeight: '16px',
  padding: '2px 8px', borderRadius: 99,
  background: 'var(--status-success-bg)', color: 'var(--status-success-fg)',
};

const optionSubtitleStyle = {
  fontFamily: 'Inter, sans-serif', fontSize: '13px', fontWeight: 400, lineHeight: '18px',
  color: 'hsl(var(--muted-foreground))',
};

// ETP-5398 — buttons come from MODAL_STYLES, the canonical action-modal palette. The
// primary used to be `--status-info-fg` (blue) and the secondary a transparent box with a
// divider-role border and muted-role label. `width` is overridden to 'auto' on purpose:
// MODAL_STYLES pins the widths of one Figma frame, and modal button widths are NOT
// normalised by this ticket — each modal hugs its own label.
const btnSecondary = { ...MODAL_STYLES.btnCancel, width: 'auto' };

const btnPrimary = { ...MODAL_STYLES.btnSaveEnabled, width: 'auto', display: 'inline-flex', gap: 6 };

// Disabled swaps the whole object — never `opacity` on the fill. This modal dimming the
// same blue by 0.6 while SendToEvaluationModal dimmed it by 0.5 is what the reporter saw
// as "two different blues"; there was never a second blue token.
const btnPrimaryDisabled = { ...MODAL_STYLES.btnSaveDisabled, width: 'auto', display: 'inline-flex', gap: 6 };
