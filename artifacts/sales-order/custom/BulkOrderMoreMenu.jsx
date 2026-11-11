/*
 * *************************************************************************
 * The contents of this file are subject to the Etendo License
 * (the "License"), you may not use this file except in compliance with
 * the License.
 * You may obtain a copy of the License at
 * https://github.com/etendosoftware/etendo_core/blob/main/legal/Etendo_license.txt
 * Software distributed under the License is distributed on an
 * "AS IS" basis, WITHOUT WARRANTY OF ANY KIND, either express or
 * implied. See the License for the specific language governing rights
 * and limitations under the License.
 * All portions are Copyright (C) 2021-2026 FUTIT SERVICES, S.L
 * All Rights Reserved.
 * Contributor(s): Futit Services S.L.
 * *************************************************************************
 */

// Kebab menu in the list selection toolbar that groups bulk creation actions
// (Create Invoices / Create Shipments) for selected Sales Orders. Each action
// fans out to the per-record NeoHandler endpoint and aggregates the results into a
// single toast. ETP-5302 — the aggregate is shown directly and the list refetches in
// place via the `refresh` handed to the `bulkActions` slot; the sessionStorage-then-
// full-reload handoff survives only as a fallback for hosts outside that slot.

import { useState } from 'react';
import { createPortal } from 'react-dom';
// ETP-4576 - module-level helpers cannot hold a hook, so they take the module-level
// apiFetch: same credential, same CSRF proof, resolved from the published session.
import { apiFetch as moduleApiFetch } from '@/auth/api.js';
import { MoreVertical, Receipt, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu.jsx';
import { useUI } from '@/i18n';
import { trackDocumentCreated } from '@/lib/observability/health-events.js';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { showBulkActionToast, persistBulkActionResult } from '@/hooks/useBulkActionToast';
import { joinWithConjunction, translateBackendErrorBody, translateQuotaRefusalBody } from '@/lib/backendErrors.js';
import {
  InvoiceSifStepModal, readOnlySifStep, resolveBulkSifPreview,
} from '@/windows/custom/shared/InvoiceSifStep.jsx';
const COMPLETED = 'CO';
const DRAFT = 'DR';

// No checkDraftShipment endpoint exists yet, so we query the goods-shipment
// entity directly filtered by salesOrder — same pattern used in
// OrderCreateInvoice.jsx for the single-record flow.
async function hasDraftShipment(orderId, apiBaseUrl) {
  try {
    const base = apiBaseUrl.replace(/\/[^/]+$/, '');
    const criteria = encodeURIComponent(JSON.stringify([
      { fieldName: 'salesOrder', operator: 'equals', value: orderId },
    ]));
    const res = await moduleApiFetch(`${base}/goods-shipment/goodsShipment?criteria=${criteria}&_limit=50`);
    if (!res.ok) return false;
    const shipments = (await res.json())?.response?.data ?? [];
    return shipments.some((s) => s.documentStatus === DRAFT);
  } catch {
    return false;
  }
}

// ETP-6179: the fiscal systems' display names, in the order the preview lists them.
const SYSTEM_LABEL_KEYS = {
  SII: 'sifDataTabs.tab.sii',
  TicketBAI: 'sifDataTabs.tab.tbai',
  Verifactu: 'sifDataTabs.tab.verifactu',
};

/**
 * ETP-6179: the preview of the invoices this run would create — one `sifDefaults` per COMPLETED
 * selected order (the others fail before reaching the backend anyway).
 */
function previewBulkInvoices(rows, apiBaseUrl) {
  const urls = rows
    .filter(row => (row.documentStatus || row.docStatus) === COMPLETED)
    .map(row => `${apiBaseUrl}/header/${row.id}/action/sifDefaults`);
  return resolveBulkSifPreview(moduleApiFetch, urls);
}

async function runBulkOrderAction({ rows, action, apiBaseUrl, token, ui, sifFields }) {
  const isInvoice = action === 'createDraftInvoice';

  const outcomes = await Promise.allSettled(
    rows.map(async (row) => {
      const status = row.documentStatus || row.docStatus;
      if (status !== COMPLETED) {
        throw new Error(
          ui('soBulkOrderNotCompleted').replace('{documentNo}', row.documentNo || row.id),
        );
      }

      // Skip orders that already have a DR shipment to avoid generating duplicate drafts.
      // ETP-5828 — invoices are NOT pre-skipped any more: the backend is the source of truth and
      // invoices what is pending net of the order's draft invoices. An order whose drafts hold only
      // part of it is invoiced for the rest; one whose drafts hold everything left is refused with
      // the translated "a draft invoice … already covers what is left" sentence, and a fully
      // invoiced one with "no lines to invoice", both surfaced as the row failure message.
      if (!isInvoice && await hasDraftShipment(row.id, apiBaseUrl)) {
        throw new Error(ui('soBulkOrderHasDraftShipment').replace('{documentNo}', row.documentNo || row.id));
      }

      const res = await moduleApiFetch(`${apiBaseUrl}/header/${row.id}/action/${action}`, {
        method: 'POST',
        
        // ETP-6179: the fiscal data the summary showed, the same for every invoice of the run.
        body: JSON.stringify(isInvoice && sifFields ? { sifFields } : {}),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        // ETP-5051 — a plan-quota refusal reads as the translated quota sentence, and is flagged so
        // a multi-row summary can still name it (useBulkActionToast).
        const quotaText = translateQuotaRefusalBody(err, ui);
        if (quotaText) throw Object.assign(new Error(quotaText), { quotaRefusal: true });
        // ETP-5714: read error.message too and translate it. ETP-5828: the draft-covers 400 arrives
        // as { status, message } with the draft numbers in the sentence (backendErrors.js).
        throw new Error(translateBackendErrorBody(err, ui, `Error (${res.status})`));
      }
      trackDocumentCreated(isInvoice ? 'sales-invoice' : 'goods-shipment');
      return row;
    }),
  );

  const failed = outcomes
    .map((o, i) => ({ o, row: rows[i] }))
    .filter(({ o }) => o.status === 'rejected')
    .map(({ o, row }) => ({
      documentNo: row.documentNo || row.id,
      message: o.reason?.message || 'Unknown error',
      ...(o.reason?.quotaRefusal ? { quotaRefusal: true } : {}),
    }));
  const ok = outcomes.length - failed.length;

  // ETP-5302 — returns the result instead of persisting it. Persisting is only needed
  // by the legacy reload path; when the list can refetch in place the caller shows the
  // toast directly and sessionStorage never comes into play.
  return { ok, failed };
}

export default function BulkOrderMoreMenu({ selectedRows, clearSelection, token, apiBaseUrl, refresh, windowReadOnly }) {
  const ui = useUI();
  const [running, setRunning] = useState(false);
  // ETP-6179: the read-only fiscal-data summary shown before creating the invoices.
  const [sifSummary, setSifSummary] = useState(null);

  if (!selectedRows || selectedRows.length === 0 || windowReadOnly) return null;

  const run = async (action, sifFields) => {
    setRunning(true);
    const result = await runBulkOrderAction({ rows: selectedRows, action, apiBaseUrl, token, ui, sifFields });
    setRunning(false);

    // ETP-5302 — refetch the rows in place rather than reloading the whole browser page,
    // matching BulkDocumentAction's button right next to this menu in the same bar.
    if (refresh) {
      clearSelection();
      showBulkActionToast(ui, result);
      refresh();
      return;
    }

    // No refetch available (mounted outside ListView's `bulkActions` slot): legacy path.
    persistBulkActionResult(result);
    setTimeout(() => {
      clearSelection();
      window.location.reload();
    }, 600);
  };

  // ETP-6179: before creating one invoice per order, show the fiscal data they will all get —
  // only when a fiscal system is active and every order would get the SAME data. Otherwise
  // (none active, a preview not readable, or orders whose data differ) the run goes on as
  // before and each invoice gets its own backend defaults.
  const handleSelect = (action) => async () => {
    if (running) return;
    if (action === 'createDraftInvoice') {
      setRunning(true);
      const bulk = await previewBulkInvoices(selectedRows, apiBaseUrl);
      setRunning(false);
      if (bulk.kind === 'same') {
        setSifSummary(bulk.preview);
        return;
      }
    }
    await run(action);
  };

  const confirmSifSummary = async () => {
    const preview = sifSummary;
    await run('createDraftInvoice', preview?.fields);
    setSifSummary(null);
  };

  const summaryNotice = sifSummary
    ? ui('invoiceSifStep.bulkNotice', {
      systems: joinWithConjunction(
        (sifSummary.systems ?? []).map(system => ui(SYSTEM_LABEL_KEYS[system] ?? system)), ui),
    })
    : null;

  return (
    <>
    <DropdownMenu data-testid="DropdownMenu__3f1293">
      <DropdownMenuTrigger asChild data-testid="DropdownMenuTrigger__3f1293">
        <Button
          variant="ghost"
          size="icon"
          title={ui('more')}
          disabled={running}
          data-testid="Button__3f1293">
          <MoreVertical className="h-4 w-4" data-testid="MoreVertical__3f1293" />
          <span className="sr-only">{ui('more')}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" data-testid="DropdownMenuContent__3f1293">
        <DropdownMenuItem
          onSelect={handleSelect('createDraftInvoice')}
          disabled={running}
          data-testid="DropdownMenuItem__3f1293">
          <Receipt className="h-4 w-4" data-testid="Receipt__3f1293" />
          {ui('soBulkCreateInvoices')} ({selectedRows.length})
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={handleSelect('createShipment')}
          disabled={running}
          data-testid="DropdownMenuItem__3f1293">
          <Truck className="h-4 w-4" data-testid="Truck__3f1293" />
          {ui('soBulkCreateShipments')} ({selectedRows.length})
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    {sifSummary && createPortal(
      <InvoiceSifStepModal
        sif={readOnlySifStep(sifSummary)}
        readOnly
        notice={summaryNotice}
        confirmLabel={`${ui('soBulkCreateInvoices')} (${selectedRows.length})`}
        loading={running}
        onConfirm={confirmSifSummary}
        onCancel={() => setSifSummary(null)}
        onClose={() => setSifSummary(null)}
        data-testid="InvoiceSifStepModal__bulk6179" />,
      document.body,
    )}
    </>
  );
}
