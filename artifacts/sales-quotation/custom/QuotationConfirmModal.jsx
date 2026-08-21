import { useState, useEffect, useMemo } from 'react';
import { ClipboardList, FileText } from 'lucide-react';
import { useUI } from '@/i18n';
import { fetchOptionalJson } from '@/windows/custom/shared/pdfUtils.js';
import { formatCurrency } from '@/lib/formatCurrency.js';

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
  const headers = useMemo(() => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }), [token]);

  const [freshData, setFreshData] = useState(null);

  // Fetch fresh record + line count on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [recRes, linesRes] = await Promise.all([
          fetch(`${entityUrl}/${quotationId}`, { headers }),
          fetch(`${apiBaseUrl}/quotationLine?parentId=${quotationId}&_startRow=0&_endRow=999`, { headers }),
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
  }, [quotationId, entityUrl, apiBaseUrl, headers]);

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
          const session = await fetchOptionalJson(`${baseNeoUrl}/session`);
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
        const res = await fetch(
          `${entityUrl}/${quotationId}/action/Convertquotation`,
          { method: 'POST', headers, body: JSON.stringify({ fieldValues: {} }) },
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
        const orderRes = await fetch(
          `${baseNeoUrl}/sales-order/header?${new URLSearchParams({ criteria, _limit: '5' })}`,
          { headers },
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
                const reactRes = await fetch(
                  `${baseNeoUrl}/sales-order/header/${order.id}/action/DocAction`,
                  { method: 'POST', headers, body: JSON.stringify({ docAction: 'RE' }) },
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
        const res = await fetch(
          `${entityUrl}/${quotationId}/action/createDraftInvoice`,
          { method: 'POST', headers, body: JSON.stringify({}) },
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
          status: 'Draft',
        });
      }
    } catch (err) {
      setError(err.message || ui('soErrorOccurred'));
    } finally {
      setLoading(false);
    }
  };

  const primaryLabel = selected === 'order'
    ? ui('sqConfirmActionOrder')
    : ui('soConfirmActionInvoice');

  const handleGoToDoc = () => {
    if (!createdDoc?.id) { handleCloseAfterCreate(); return; }
    const basePath = window.location.pathname.replace(/\/sales-quotation\/.*$/, '');
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
            padding: '12px 16px', borderTop: '0.5px solid hsl(var(--card))',
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

        {/* Blue card header */}
        <div style={{ padding: '14px 16px 0', position: 'relative' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              position: 'absolute', top: 10, right: 12,
              fontSize: 18, lineHeight: 1, padding: '2px 6px', borderRadius: 4,
              background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--muted-foreground))',
            }}
          >
            &times;
          </button>
          <div style={{ fontSize: 10, color: 'hsl(var(--muted-foreground))', letterSpacing: '0.04em', marginBottom: 8 }}>
            {ui('quotationDocumentLabel')} #{documentNo}
          </div>
          <div style={{
            background: 'var(--status-info-bg)', border: '0.5px solid var(--status-info-border)', borderRadius: 10,
            padding: '14px 16px', marginBottom: 14,
          }}>
            <div style={{ fontSize: 11, color: 'var(--status-info-border)' }}>
              {bpName}
            </div>
            <div data-testid="confirm-summary-total" style={{ fontSize: 28, fontWeight: 500, color: 'var(--status-info-fg)', lineHeight: 1, marginTop: 4, marginBottom: 6 }}>
              {formatCurrency(currency, grandTotal)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--status-info-fg)' }}>
              {lineCount != null ? ui('soLines', { count: lineCount }) : '...'} <span style={{ color: 'var(--status-info-fg)' }}>·</span> {ui('soSubtotal')} <span data-testid="confirm-summary-subtotal" style={{ fontWeight: 500, color: 'var(--status-info-fg)' }}>{formatCurrency(currency, totalLines)}</span>
            </div>
          </div>
        </div>

        {/* Options */}
        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8, borderBottom: '0.5px solid hsl(var(--card))' }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'hsl(var(--muted-foreground))', marginBottom: 2 }}>
            {ui('sqWhatToDo')}
          </div>
          <OptionCard
            testId="confirm-option-order"
            selected={selected === 'order'}
            onClick={() => setSelected('order')}
            icon={<ClipboardList size={16} />}
            title={ui('sqCreateOrder')}
            badge={ui('soRecommended')}
            subtitle={ui('sqCreateOrderDesc')}
          />
          <OptionCard
            testId="confirm-option-invoice"
            selected={selected === 'invoice'}
            onClick={() => setSelected('invoice')}
            icon={<FileText size={16} />}
            title={ui('soInvoiceDirectly')}
            subtitle={ui('sqInvoiceDirectlyDesc')}
          />
        </div>

        {/* Error */}
        {error && (
          <div style={{ padding: '8px 16px', fontSize: 12, color: 'hsl(var(--destructive))', background: 'hsl(var(--card))', borderTop: '0.5px solid hsl(var(--destructive))' }}>
            {error}
          </div>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, padding: '12px 16px' }}>
          <button type="button" onClick={onClose} disabled={loading}
            style={{ ...btnSecondary, opacity: loading ? 0.5 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}>
            {ui('cancel')}
          </button>
          <button type="button" data-testid="action-confirm-modal" onClick={handleConfirm} disabled={loading}
            style={{
              ...btnPrimary,
              opacity: loading ? 0.6 : 1, cursor: loading ? 'not-allowed' : 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
            {loading && (
              <svg style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }}
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
            )}
            {loading ? ui('soProcessing') : primaryLabel}
          </button>
          <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
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
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10,
        border: selected ? '2px solid var(--status-info-border)' : '0.5px solid hsl(var(--border-subtle))',
        borderRadius: 8, padding: selected ? '11px 13px' : '12px 14px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        background: selected ? 'hsl(var(--card))' : 'hsl(var(--card))',
        opacity: disabled ? 0.5 : 1,
        transition: 'border-color 0.15s, background 0.15s',
      }}
    >
      <div style={{
        width: 32, height: 32, borderRadius: 6, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: selected ? 'hsl(var(--card))' : 'hsl(var(--card))',
        color: selected ? 'var(--status-info-fg)' : 'hsl(var(--muted))',
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: selected ? 'var(--status-info-border)' : 'hsl(var(--foreground))' }}>
            {title}
          </span>
          {badge && (
            <span style={{
              fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 99,
              background: 'var(--status-success-bg)', color: 'var(--status-success-fg)',
              letterSpacing: '0.3px',
            }}>
              {badge}
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', marginTop: 3, lineHeight: 1.4 }}>
          {subtitle}
        </div>
      </div>
      <div style={{
        width: 18, height: 18, borderRadius: '50%', flexShrink: 0, marginTop: 2,
        border: selected ? 'none' : '1.5px solid hsl(var(--border-subtle))',
        background: selected ? 'var(--status-info-fg)' : 'hsl(var(--card))',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {selected && <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'hsl(var(--card))' }} />}
      </div>
    </div>
  );
}

/* ── Shared styles ─────────────────────────────────────────────── */

const overlayStyle = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  backgroundColor: 'hsl(var(--foreground) / 0.3)',
};

const cardStyle = {
  width: 480, maxHeight: '80vh', display: 'flex', flexDirection: 'column',
  overflow: 'hidden', borderRadius: 12, backgroundColor: 'hsl(var(--card))',
  boxShadow: '0 8px 30px hsl(var(--foreground) / 0.12)', border: '0.5px solid hsl(var(--border-subtle))',
};

const btnSecondary = {
  fontSize: 12, padding: '7px 14px', borderRadius: 6,
  border: '1px solid hsl(var(--border-subtle))', background: 'transparent', color: 'hsl(var(--muted-foreground))', cursor: 'pointer',
};

const btnPrimary = {
  fontSize: 12, fontWeight: 500, padding: '7px 16px', borderRadius: 6,
  border: 'none', background: 'var(--status-info-fg)', color: 'hsl(var(--card))', cursor: 'pointer',
};
