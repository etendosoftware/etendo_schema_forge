import { useCallback, useMemo } from 'react';
import { useUI } from '@/i18n';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { Switch } from '@/components/ui/switch';
import { ImportNotice } from '@/components/contract-ui/ImportLinesModal.jsx';
import { formatGroupedNumber } from '@/lib/formatCurrency.js';
import {
  normalizeGlobalDiscountPct,
  resolveOrderGlobalDiscount,
  isCarryingGlobalDiscount,
  shouldPatchInvoiceGlobalDiscount,
} from './orderGlobalDiscountRule.js';

const orderPct = (sharedContext, docId) => normalizeGlobalDiscountPct(sharedContext?.orderDiscountMap?.[docId]);

/**
 * Global discount carry-over for the invoice "Import from order" popup (ETP-5828), used by the
 * one order-import modal of sales AND purchase invoices (`InvoiceOrderImportModal`). Returns the
 * generic `ImportLinesModal` extension props (`initialExtraState`, `renderDocAdornment`,
 * `renderSelectionPanel`, `getSuccessToast`) plus `serverCarry`, so the shared
 * modal stays unaware of discounts.
 *
 * Two import paths, chosen per direction by `INVOICE_ORDER_IMPORT[direction].importVia`:
 *  - `'server'` (sales): ONE `importOrderLines` server action applies the global discount itself;
 *    `serverCarry(selection)` says whether to ask it to. Nothing is written from the browser.
 *  - `'client'` (purchases, until QA decides the draft-pending rule, MCP-2): the lines are POSTed
 *    from the browser and `afterImport` (returned only when `headerEndpoint` is given) PATCHes the
 *    header %; `getSuccessToast` also reports a failed PATCH (`failedPct`).
 *
 * It expects the caller's `fetchDocuments` to put in `sharedContext`:
 *  - `orderDiscountMap`: `{ [orderId]: pct }` (orders without a global discount may be absent);
 *  - `invoiceGlobalDiscount`: the invoice header's current `etgoTotalDiscount` (null when none);
 *  - `invoiceHasLines`: whether the invoice already has lines;
 *  - `invoiceStateKnown`: `true` only when BOTH the invoice header and its lines were read. Any
 *    other value (a failed GET, or a caller that does not set it) means unknown: no toggle, no
 *    warning, no carry — the lines still import normally.
 *
 * The decision itself is the pure `resolveOrderGlobalDiscount` (orderGlobalDiscountRule.js).
 */
export default function useOrderGlobalDiscountImport({ headerEndpoint } = {}) {
  const ui = useUI();
  // Empty base on purpose, like the modals: the URL already carries `base`. Only the client import
  // path (purchases for now, `importVia: 'client'`) writes through it.
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
          className="inline-flex items-center whitespace-nowrap rounded-lg bg-[#EBEFFF] px-2 py-1 text-xs leading-4 text-[#2B48BC] dark:bg-primary/25 dark:text-sidebar-accent-foreground"
        >
          {/* Figma «% Dto. global 10%»: the leading % is text in the label, not an icon.
              Literal Figma colours on purpose: bg-sidebar-accent resolves to #F0F3FF, which is
              indistinguishable from the selected row's background, so the pill vanished there.
              Under `.dark` a translucent brand blue with the dark accent text (near white). */}
          {ui('importGlobalDiscountTag', { pct: fmtPct(pct) })}
        </span>
      );
    };

    // Each warning is ONE sentence pair from ONE key, never a body plus an appended closing, so
    // it fits the notice's single line (ETP-5828). The orders are not listed (QA): with many
    // orders that became a long list; the MCP 422 payload still names them.
    const warningTexts = (decision) => {
      if (decision.kind === 'mixed') {
        return {
          title: ui('importGlobalDiscountMixedTitle'),
          body: decision.invoicePct > 0
            ? ui('importGlobalDiscountMixedBodyKeepsInvoice', { invoicePct: fmtPct(decision.invoicePct) })
            : ui('importGlobalDiscountMixedBody'),
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
          <ImportNotice
            tone="warning"
            role="status"
            title={title}
            body={body}
            data-testid="ImportGlobalDiscount__warning" />
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
      // Not in the Figma: the toggle sits in the same fixed notice area, in its neutral tone, with
      // the switch where the info icon goes (ETP-5828 decision 1).
      return (
        <ImportNotice
          tone="neutral"
          title={title}
          body={subtitle}
          data-testid="ImportGlobalDiscount__toggle"
          control={(
            <Switch
              checked={carryOn}
              onCheckedChange={checked => selection.setExtraState(prev => ({ ...(prev || {}), carryGlobalDiscount: checked }))}
              aria-label={title}
              data-testid="ImportGlobalDiscount__switch"
            />
          )} />
      );
    };

    // The order import always says what happened to the global discount (QA): carried with its %,
    // or «sin descuento global» — never the generic «Líneas importadas desde pedido».
    const getSuccessToast = ({ count, afterImportResult, partial }) => {
      // Client path only: the lines went in but the header PATCH did not (shown even when some
      // lines failed, next to the modal's own partial warning).
      if (afterImportResult?.failedPct != null) {
        return {
          message: ui('importGlobalDiscountPatchFailed', { pct: fmtPct(afterImportResult.failedPct) }),
          variant: 'warning',
        };
      }
      if (partial || !afterImportResult) return null;
      if (!afterImportResult.carried) {
        const key = count === 1 ? 'importGlobalDiscountNotCarriedOne' : 'importGlobalDiscountNotCarriedMany';
        return { message: ui(key, { count }) };
      }
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

    // For a caller that creates the lines from the browser (`importVia: 'client'`, purchases until
    // QA decides the draft-pending rule, MCP-2): after the per-line POSTs, writes the header % when
    // the toggle is offered, ON, and the invoice has none yet. The decision is the one the user
    // SAW: taken on the selected orders, never on the imported subset — a failed line POST must
    // not turn a warning into a carry. The imported subset is only an extra guard that can drop the
    // PATCH (nothing imported), never enable it. Always a %, never an amount; line discounts are
    // never touched. Known: until the PATCH lands the totals show the lines without it (QA UI-1).
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

    return {
      serverCarry,
      initialExtraState: { carryGlobalDiscount: true },
      renderDocAdornment,
      renderSelectionPanel,
      getSuccessToast,
      // Only with a headerEndpoint: the browser-side header write of the client import path.
      ...(headerEndpoint ? { afterImport } : {}),
    };
  }, [ui, fmtPct, decide, apiFetch, headerEndpoint]);
}
