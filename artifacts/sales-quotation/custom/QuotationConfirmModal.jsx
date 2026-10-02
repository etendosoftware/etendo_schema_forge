import { useState, useEffect } from 'react';
import { useUI } from '@/i18n';
import ActionChoiceModal from '@/components/contract-ui/ActionChoiceModal.jsx';
import { fetchOptionalJson } from '@/windows/custom/shared/pdfUtils.js';
import { formatCurrency } from '@/lib/formatCurrency.js';
import { useApiFetch } from '@/auth/useApiFetch.js';

const OPTION_ORDER = 'order';
const OPTION_INVOICE = 'invoice';
// Shown in the summary table while the line count is still being fetched.
const LINE_COUNT_PENDING = '...';

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

  const handleConfirm = async (optionId) => {
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

      if (optionId === OPTION_ORDER) {
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
              type: OPTION_ORDER, id: order.id,
              documentNo: order.documentNo,
              total: formatCurrency(currency, order.grandTotalAmount ?? order.grandTotal),
              status,
            });
            return;
          }
        }
        setCreatedDoc({ type: OPTION_ORDER, id: null, documentNo: '?', total: '', status: 'Draft' });

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
          type: OPTION_INVOICE,
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
    const target = createdDoc.type === OPTION_ORDER ? 'sales-order' : 'sales-invoice';
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
    const docLabel = createdDoc.type === OPTION_ORDER ? ui('sqOrderCreated') : ui('soInvoiceCreated');
    const goLabel  = createdDoc.type === OPTION_ORDER ? ui('sqViewOrder')    : ui('soViewInvoice');
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
                  {ui(createdDoc.type === OPTION_INVOICE ? 'invoiceDoc' : 'orderDoc',
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
  const summaryColumns = [
    { key: 'documentNo', label: ui('quotation') },
    { key: 'contact', label: ui('contact') },
    { key: 'lines', label: ui('lines') },
    { key: 'subtotal', label: ui('subtotal'), testId: 'confirm-summary-subtotal' },
    { key: 'total', label: ui('total'), testId: 'confirm-summary-total' },
  ];
  const summaryData = {
    documentNo,
    contact: bpName,
    lines: lineCount ?? LINE_COUNT_PENDING,
    subtotal: formatCurrency(currency, totalLines),
    total: formatCurrency(currency, grandTotal),
  };
  const options = [
    {
      id: OPTION_ORDER,
      label: ui('sqCreateOrder'),
      description: ui('sqCreateOrderDesc'),
      badge: ui('soRecommended'),
      testId: 'confirm-option-order',
    },
    {
      id: OPTION_INVOICE,
      label: ui('soInvoiceDirectly'),
      description: ui('sqInvoiceDirectlyDesc'),
      testId: 'confirm-option-invoice',
    },
  ];

  return (
    <ActionChoiceModal
      title={ui('sqConfirmQuotationTitle')}
      summaryColumns={summaryColumns}
      summaryData={summaryData}
      question={ui('sqWhatToDo')}
      options={options}
      defaultOptionId={OPTION_ORDER}
      onCancel={onClose}
      onContinue={handleConfirm}
      loading={loading}
      error={error}
    />
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
