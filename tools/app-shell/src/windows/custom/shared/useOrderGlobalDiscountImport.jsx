import { useCallback, useMemo } from 'react';
import { useUI } from '@/i18n';
import { Switch } from '@/components/ui/switch';
import { ImportNotice } from '@/components/contract-ui/ImportLinesModal.jsx';
import { formatGroupedNumber } from '@/lib/formatCurrency.js';
import {
  normalizeGlobalDiscountPct,
  resolveOrderGlobalDiscount,
  isCarryingGlobalDiscount,
} from './orderGlobalDiscountRule.js';

const orderPct = (sharedContext, docId) => normalizeGlobalDiscountPct(sharedContext?.orderDiscountMap?.[docId]);

/**
 * Global discount carry-over for the invoice "Import from order" popup (ETP-5828), used by the
 * one order-import modal of sales AND purchase invoices (`InvoiceOrderImportModal`). Returns the
 * generic `ImportLinesModal` extension props (`initialExtraState`, `renderDocAdornment`,
 * `getDocTotal`, `renderSelectionPanel`, `getSuccessToast`) plus `serverCarry`, so the shared
 * modal stays unaware of discounts.
 *
 * Nothing is written from the browser: the import is ONE `importOrderLines` server action that
 * applies the global discount itself; `serverCarry(selection)` says whether to ask it to.
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
export default function useOrderGlobalDiscountImport() {
  const ui = useUI();

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
          className="inline-flex items-center whitespace-nowrap rounded-lg bg-sidebar-accent px-2 py-1 text-xs leading-4 text-sidebar-accent-foreground"
        >
          {/* Figma «% Dto. global 10%»: the leading % is text in the label, not an icon. */}
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
          <ImportNotice
            tone="warning"
            role="status"
            title={title}
            // «invoice has lines» already says the lines import without a global discount (its
            // Figma body), so the closing sentence would repeat it.
            body={decision.kind === 'invoiceHasLines' ? body : `${body} ${warningClosing(decision.invoicePct)}`}
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

    const getSuccessToast = ({ count, afterImportResult, partial }) => {
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
      getSuccessToast,
    };
  }, [ui, fmtPct, decide]);
}
