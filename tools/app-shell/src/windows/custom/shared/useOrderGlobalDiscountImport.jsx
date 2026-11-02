import { useCallback, useMemo } from 'react';
import { AlertTriangle, Percent } from 'lucide-react';
import { useUI } from '@/i18n';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { Switch } from '@/components/ui/switch';
import { formatGroupedNumber } from '@/lib/formatCurrency.js';
import {
  normalizeGlobalDiscountPct,
  resolveOrderGlobalDiscount,
  isCarryingGlobalDiscount,
  shouldPatchInvoiceGlobalDiscount,
} from './orderGlobalDiscountRule.js';

const orderPct = (sharedContext, docId) => normalizeGlobalDiscountPct(sharedContext?.orderDiscountMap?.[docId]);

/**
 * Global discount carry-over for the invoice "Add from order" popups (ETP-5828), shared by the
 * sales-invoice and purchase-invoice modals. Returns the generic `ImportLinesModal` extension
 * props (`initialExtraState`, `renderDocAdornment`, `getDocTotal`, `renderSelectionPanel`,
 * `getSelectionHint`, `afterImport`, `getSuccessToast`), so the shared modal stays unaware of
 * discounts.
 *
 * It expects the caller's `fetchDocuments` to put in `sharedContext`:
 *  - `orderDiscountMap`: `{ [orderId]: pct }` (orders without a global discount may be absent);
 *  - `invoiceGlobalDiscount`: the invoice header's current `etgoTotalDiscount` (null when none);
 *  - `invoiceHasLines`: whether the invoice already has lines;
 *  - `invoiceStateKnown`: `true` only when BOTH the invoice header and its lines were read. Any
 *    other value (a failed GET, or a caller that does not set it) means unknown: no toggle, no
 *    warning, no PATCH — the lines still import normally.
 *
 * The decision itself is the pure `resolveOrderGlobalDiscount` (orderGlobalDiscountRule.js).
 *
 * @param {object} options
 * @param {string} options.headerEndpoint the invoice header spec path, e.g. `sales-invoice/header`
 */
export default function useOrderGlobalDiscountImport({ headerEndpoint }) {
  const ui = useUI();
  // Empty base on purpose, like the modals: the URL already carries `base`.
  const apiFetch = useApiFetch('');

  const fmtPct = useCallback((value) => formatGroupedNumber(value, { maximumFractionDigits: 2 }), []);

  const decide = useCallback(({ selectedDocuments, sharedContext }) => resolveOrderGlobalDiscount({
    selectedOrders: (selectedDocuments || []).map(d => ({
      docNo: d.documentNo || d.id,
      pct: orderPct(sharedContext, d.id),
    })),
    invoicePct: sharedContext?.invoiceGlobalDiscount,
    invoiceHasLines: !!sharedContext?.invoiceHasLines,
    invoiceStateKnown: sharedContext?.invoiceStateKnown === true,
  }), []);

  return useMemo(() => {
    const carryOnOf = (extraState) => extraState?.carryGlobalDiscount !== false;

    const renderDocAdornment = (doc, { sharedContext }) => {
      const pct = orderPct(sharedContext, doc.id);
      if (pct <= 0) return null;
      return (
        <span
          data-testid="ImportGlobalDiscount__tag"
          className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-px text-[11px] font-semibold"
          style={{ background: 'var(--status-info-bg)', color: 'var(--status-info-fg)' }}
        >
          <Percent
            size={10}
            strokeWidth={2.4}
            aria-hidden="true"
            data-testid="Percent__b75e6e" />
          {ui('importGlobalDiscountTag', { pct: fmtPct(pct) })}
        </span>
      );
    };

    const getDocTotal = ({ doc, total, sharedContext }) => {
      const pct = orderPct(sharedContext, doc.id);
      return pct > 0 ? total * (1 - pct / 100) : total;
    };

    const warningClosing = (invoicePct) => (invoicePct > 0
      ? ui('importGlobalDiscountKeepsInvoice', { invoicePct: fmtPct(invoicePct) })
      : ui('importGlobalDiscountNotCarried'));

    const warningTexts = (decision) => {
      if (decision.kind === 'mixed') {
        const orders = decision.orders
          .map(o => ui('importGlobalDiscountOrderEntry', { docNo: o.docNo, pct: fmtPct(o.pct) }))
          .join(' · ');
        return {
          title: ui('importGlobalDiscountMixedTitle'),
          body: ui('importGlobalDiscountMixedBody', { orders }),
        };
      }
      if (decision.kind === 'invoiceMismatch') {
        const invoicePct = fmtPct(decision.invoicePct);
        return {
          title: ui('importGlobalDiscountInvoiceMismatchTitle', { invoicePct }),
          body: ui('importGlobalDiscountInvoiceMismatchBody', { pct: fmtPct(decision.pct), invoicePct }),
        };
      }
      return {
        title: ui('importGlobalDiscountInvoiceHasLinesTitle'),
        body: ui('importGlobalDiscountInvoiceHasLinesBody', { pct: fmtPct(decision.pct) }),
      };
    };

    const renderSelectionPanel = (selection) => {
      const decision = decide(selection);
      if (decision.kind === 'none') return null;

      if (decision.kind !== 'carry') {
        const { title, body } = warningTexts(decision);
        return (
          <div
            data-testid="ImportGlobalDiscount__warning"
            role="status"
            className="flex items-start gap-2.5 px-4 py-3"
            style={{ background: 'var(--status-warning-bg)', borderTop: '1px solid var(--status-warning-border)' }}
          >
            <AlertTriangle
              size={16}
              className="mt-px shrink-0"
              style={{ color: 'var(--status-warning-fg)' }}
              aria-hidden="true"
              data-testid="AlertTriangle__b75e6e" />
            <div>
              <strong className="block text-[13px] text-foreground">{title}</strong>
              <p className="mt-0.5 text-xs leading-normal text-foreground">
                {body} {warningClosing(decision.invoicePct)}
              </p>
            </div>
          </div>
        );
      }

      const carryOn = carryOnOf(selection.extraState);
      const pct = fmtPct(decision.pct);
      let subtitle;
      // OFF while the invoice already holds the same %: the header % still applies to every line,
      // so the "line discount only" wording would be false (Jira CP12 keeps the toggle visible).
      if (!carryOn && decision.matchesInvoice) subtitle = ui('importGlobalDiscountKeepsInvoice', { invoicePct: pct });
      else if (!carryOn) subtitle = ui('importGlobalDiscountCarryOff');
      else if (decision.matchesInvoice) subtitle = ui('importGlobalDiscountCarryMatchesInvoice', { pct });
      else subtitle = ui('importGlobalDiscountCarryApplies');
      const title = ui('importGlobalDiscountCarryTitle', { pct });
      return (
        <div
          data-testid="ImportGlobalDiscount__toggle"
          className="flex items-start gap-2.5 px-4 py-3"
          style={carryOn
            ? { background: 'var(--status-info-bg)', borderTop: '1px solid var(--status-info-border)' }
            : { background: 'hsl(var(--muted))', borderTop: '1px solid hsl(var(--border-subtle))' }}
        >
          <Switch
            checked={carryOn}
            onCheckedChange={checked => selection.setExtraState(prev => ({ ...(prev || {}), carryGlobalDiscount: checked }))}
            aria-label={title}
            className="mt-px"
            data-testid="ImportGlobalDiscount__switch"
          />
          <div>
            <strong className="block text-[13px] text-foreground">{title}</strong>
            <p className="mt-0.5 text-xs leading-normal text-muted-foreground">{subtitle}</p>
          </div>
        </div>
      );
    };

    const getSelectionHint = (selection) => {
      const decision = decide(selection);
      if (!isCarryingGlobalDiscount(decision, carryOnOf(selection.extraState))) return null;
      const key = selection.selectedCount === 1 ? 'importGlobalDiscountSelectedOne' : 'importGlobalDiscountSelectedMany';
      return ui(key, { count: selection.selectedCount, pct: fmtPct(decision.pct) });
    };

    // Writes the header % only when the toggle is offered, ON, and the invoice has none yet.
    // The decision is the one the user SAW: it is taken on the selected orders, never on the
    // imported subset — a failed line POST must not turn a warning into a carry. The imported
    // subset is only an extra guard that can drop the PATCH (nothing imported), never enable it.
    // Always a %, never an amount; line discounts are never touched.
    const afterImport = async ({ importedDocIds, selectedDocIds, documents, sharedContext, base, invoiceId, extraState }) => {
      const docs = documents || [];
      const decision = decide({ selectedDocuments: docs.filter(d => selectedDocIds?.has(d.id)), sharedContext });
      const carryOn = carryOnOf(extraState);
      if (!isCarryingGlobalDiscount(decision, carryOn)) return { carried: false };
      const imported = decide({ selectedDocuments: docs.filter(d => importedDocIds?.has(d.id)), sharedContext });
      if (imported.kind !== 'carry' || imported.pct !== decision.pct) return { carried: false };
      if (!shouldPatchInvoiceGlobalDiscount(decision, carryOn)) return { carried: true, pct: decision.pct };
      const headerUrl = `${base}/${headerEndpoint}/${invoiceId}`;
      try {
        // The line POSTs recalculate the header server-side, so the `updated` remembered when the
        // modal opened is stale (409 stale_record, ETP-5073): re-read it and send the fresh one.
        const readRes = await apiFetch(headerUrl);
        if (!readRes.ok) return { carried: false, failedPct: decision.pct };
        const header = (await readRes.json())?.response?.data?.[0];
        if (!header) return { carried: false, failedPct: decision.pct };
        // Someone set a % meanwhile: never overwrite it.
        if (normalizeGlobalDiscountPct(header.etgoTotalDiscount) !== decision.invoicePct) {
          return { carried: false, failedPct: decision.pct };
        }
        const res = await apiFetch(headerUrl, {
          method: 'PATCH',
          body: JSON.stringify({ etgoTotalDiscount: decision.pct, updated: header.updated }),
        });
        return res.ok ? { carried: true, pct: decision.pct } : { carried: false, failedPct: decision.pct };
      } catch {
        return { carried: false, failedPct: decision.pct };
      }
    };

    const getSuccessToast = ({ count, afterImportResult, partial }) => {
      if (afterImportResult?.failedPct != null) {
        return {
          message: ui('importGlobalDiscountPatchFailed', { pct: fmtPct(afterImportResult.failedPct) }),
          variant: 'warning',
        };
      }
      // Some lines failed: the modal already shows its own warning; only a failed PATCH is added.
      if (partial || !afterImportResult?.carried) return null;
      const key = count === 1 ? 'importGlobalDiscountImportedOne' : 'importGlobalDiscountImportedMany';
      return { message: ui(key, { count, pct: fmtPct(afterImportResult.pct) }) };
    };

    // For a caller whose import is ONE server action that applies the discount itself (the sales
    // order import, ETP-6002): whether to ask the server to carry it, and the result to toast once
    // the server accepted. Nothing is patched from the browser on this path.
    const serverCarry = (selection) => {
      const decision = decide(selection);
      const carry = isCarryingGlobalDiscount(decision, carryOnOf(selection?.extraState));
      return {
        carryGlobalDiscount: carry,
        afterImportResult: carry ? { carried: true, pct: decision.pct } : { carried: false },
      };
    };

    return {
      serverCarry,
      initialExtraState: { carryGlobalDiscount: true },
      renderDocAdornment,
      getDocTotal,
      renderSelectionPanel,
      getSelectionHint,
      afterImport,
      getSuccessToast,
    };
  }, [ui, fmtPct, decide, apiFetch, headerEndpoint]);
}
