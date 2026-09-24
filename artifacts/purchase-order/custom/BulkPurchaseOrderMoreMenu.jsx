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
// (Create Purchase Invoices / Create Goods Receipts) for selected Purchase
// Orders. Mirrors artifacts/sales-order/custom/BulkOrderMoreMenu.jsx — same
// per-record fan-out, same fail-open pre-checks, same aggregated toast, and (ETP-5302)
// the same in-place list refetch instead of a full page reload.

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
import { showBulkActionToast, persistBulkActionResult } from '@/hooks/useBulkActionToast';
const COMPLETED = 'CO';
const DRAFT = 'DR';

const buildBase = (apiBaseUrl) => apiBaseUrl.replace(/\/[^/]+$/, '');
const orderCriteria = (orderId) => encodeURIComponent(JSON.stringify([
  { fieldName: 'salesOrder', operator: 'equals', value: orderId },
]));

// No checkDraftPurchaseInvoice endpoint exists, so we query the
// purchase-invoice header entity filtered by the originating order — same
// pattern used in PurchaseOrderActions.jsx for the single-record flow.
async function hasDraftPurchaseInvoice(orderId, apiBaseUrl) {
  try {
    const res = await moduleApiFetch(
      `${buildBase(apiBaseUrl)}/purchase-invoice/header?criteria=${orderCriteria(orderId)}&_limit=50`,
      {},
    );
    if (!res.ok) return false;
    const invoices = (await res.json())?.response?.data ?? [];
    return invoices.some((i) => i.documentStatus === DRAFT);
  } catch {
    return false;
  }
}

async function hasDraftGoodsReceipt(orderId, apiBaseUrl) {
  try {
    const res = await moduleApiFetch(
      `${buildBase(apiBaseUrl)}/goods-receipt/goodsReceipt?criteria=${orderCriteria(orderId)}&_limit=50`,
      {},
    );
    if (!res.ok) return false;
    const receipts = (await res.json())?.response?.data ?? [];
    return receipts.some((r) => r.documentStatus === DRAFT);
  } catch {
    return false;
  }
}

async function runBulkPurchaseOrderAction({ rows, action, apiBaseUrl, token, ui }) {
  const isInvoice = action === 'createPurchaseInvoice';

  const outcomes = await Promise.allSettled(
    rows.map(async (row) => {
      const status = row.documentStatus || row.docStatus;
      if (status !== COMPLETED) {
        throw new Error(
          ui('poBulkOrderNotCompleted').replace('{documentNo}', row.documentNo || row.id),
        );
      }

      // Skip orders that already have a DR invoice/receipt to avoid generating
      // duplicate drafts. Orders with only CO documents and pending qty/amount
      // proceed; the backend handler then rejects with "no pending lines" for
      // fully-fulfilled orders, which we surface as the row failure message.
      const alreadyHasDraft = isInvoice
        ? await hasDraftPurchaseInvoice(row.id, apiBaseUrl)
        : await hasDraftGoodsReceipt(row.id, apiBaseUrl);
      if (alreadyHasDraft) {
        const messageKey = isInvoice ? 'poBulkOrderHasDraftInvoice' : 'poBulkOrderHasDraftReceipt';
        throw new Error(ui(messageKey).replace('{documentNo}', row.documentNo || row.id));
      }

      const res = await moduleApiFetch(`${apiBaseUrl}/header/${row.id}/action/${action}`, {
        method: 'POST',
        
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message || err?.response?.message || `Error (${res.status})`);
      }
      trackDocumentCreated(isInvoice ? 'purchase-invoice' : 'goods-receipt');
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

  // ETP-5302 — returns the result instead of persisting it. Persisting is only needed
  // by the legacy reload path; when the list can refetch in place the caller shows the
  // toast directly and sessionStorage never comes into play.
  return { ok, failed };
}

export default function BulkPurchaseOrderMoreMenu({ selectedRows, clearSelection, token, apiBaseUrl, refresh, windowReadOnly }) {
  const ui = useUI();
  const [running, setRunning] = useState(false);

  if (!selectedRows || selectedRows.length === 0 || windowReadOnly) return null;

  const handleSelect = (action) => async () => {
    if (running) return;
    setRunning(true);
    const result = await runBulkPurchaseOrderAction({ rows: selectedRows, action, apiBaseUrl, token, ui });
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

  return (
    <DropdownMenu data-testid="DropdownMenu__c24331">
      <DropdownMenuTrigger asChild data-testid="DropdownMenuTrigger__c24331">
        <Button
          variant="ghost"
          size="icon"
          title={ui('more')}
          disabled={running}
          data-testid="Button__c24331">
          <MoreVertical className="h-4 w-4" data-testid="MoreVertical__c24331" />
          <span className="sr-only">{ui('more')}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" data-testid="DropdownMenuContent__c24331">
        <DropdownMenuItem
          onSelect={handleSelect('createPurchaseInvoice')}
          disabled={running}
          data-testid="DropdownMenuItem__c24331">
          <Receipt className="h-4 w-4" data-testid="Receipt__c24331" />
          {ui('poBulkCreateInvoices')} ({selectedRows.length})
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={handleSelect('createGoodsReceipt')}
          disabled={running}
          data-testid="DropdownMenuItem__c24331">
          <Truck className="h-4 w-4" data-testid="Truck__c24331" />
          {ui('poBulkCreateReceipts')} ({selectedRows.length})
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
