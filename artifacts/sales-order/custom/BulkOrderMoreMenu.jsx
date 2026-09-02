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
// fans out to the per-record NeoHandler endpoint and aggregates results via
// sessionStorage, consumed by useBulkActionToast on next page load.

import { useState } from 'react';
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

const STORAGE_KEY = 'bulkActionResult';
const COMPLETED = 'CO';
const DRAFT = 'DR';

// Reuses the existing checkDraftInvoice NeoHandler endpoint that returns
// { exists, count, id?, documentNo? } for a single sales-order ID. On a network
// error the check fails open (lets the create call proceed) — matching the
// "fail-open" pattern in OrderCreateInvoice.jsx.
async function hasDraftInvoice(orderId, apiBaseUrl) {
  try {
    const res = await moduleApiFetch(`${apiBaseUrl}/header/${orderId}/action/checkDraftInvoice`);
    if (!res.ok) return false;
    const data = (await res.json())?.response?.data;
    return Boolean(data?.exists);
  } catch {
    return false;
  }
}

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

async function runBulkOrderAction({ rows, action, apiBaseUrl, token, ui }) {
  const apiFetch = useApiFetch(apiBaseUrl);
  const isInvoice = action === 'createDraftInvoice';

  const outcomes = await Promise.allSettled(
    rows.map(async (row) => {
      const status = row.documentStatus || row.docStatus;
      if (status !== COMPLETED) {
        throw new Error(
          ui('soBulkOrderNotCompleted').replace('{documentNo}', row.documentNo || row.id),
        );
      }

      // Skip orders that already have a DR invoice/shipment to avoid generating
      // duplicate drafts. Orders with only CO documents and pending qty/amount
      // proceed; the backend handler then rejects with "no pending lines" for
      // fully-fulfilled orders, which we surface as the row failure message.
      const alreadyHasDraft = isInvoice
        ? await hasDraftInvoice(row.id, apiBaseUrl)
        : await hasDraftShipment(row.id, apiBaseUrl);
      if (alreadyHasDraft) {
        const messageKey = isInvoice ? 'soBulkOrderHasDraftInvoice' : 'soBulkOrderHasDraftShipment';
        throw new Error(ui(messageKey).replace('{documentNo}', row.documentNo || row.id));
      }

      const res = await apiFetch(`${apiBaseUrl}/header/${row.id}/action/${action}`, {
        method: 'POST',
        
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.response?.message || `Error (${res.status})`);
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
    }));
  const ok = outcomes.length - failed.length;

  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ok, failed }));
}

export default function BulkOrderMoreMenu({ selectedRows, clearSelection, token, apiBaseUrl }) {
  const ui = useUI();
  const [running, setRunning] = useState(false);

  if (!selectedRows || selectedRows.length === 0) return null;

  const handleSelect = (action) => async () => {
    if (running) return;
    setRunning(true);
    await runBulkOrderAction({ rows: selectedRows, action, apiBaseUrl, token, ui });
    setRunning(false);
    setTimeout(() => {
      clearSelection();
      window.location.reload();
    }, 600);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" title={ui('more')} disabled={running}>
          <MoreVertical className="h-4 w-4" />
          <span className="sr-only">{ui('more')}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onSelect={handleSelect('createDraftInvoice')} disabled={running}>
          <Receipt className="h-4 w-4" />
          {ui('soBulkCreateInvoices')} ({selectedRows.length})
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={handleSelect('createShipment')} disabled={running}>
          <Truck className="h-4 w-4" />
          {ui('soBulkCreateShipments')} ({selectedRows.length})
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
