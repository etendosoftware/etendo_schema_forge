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
// per-record fan-out, same fail-open pre-checks, same sessionStorage toast
// aggregation consumed by useBulkActionToast.

import { useState } from 'react';
import { MoreVertical, Receipt, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu.jsx';
import { useUI } from '@/i18n';

const STORAGE_KEY = 'bulkActionResult';
const COMPLETED = 'CO';
const DRAFT = 'DR';

const buildBase = (apiBaseUrl) => apiBaseUrl.replace(/\/[^/]+$/, '');
const orderCriteria = (orderId) => encodeURIComponent(JSON.stringify([
  { fieldName: 'salesOrder', operator: 'equals', value: orderId },
]));

// No checkDraftPurchaseInvoice endpoint exists, so we query the
// purchase-invoice header entity filtered by the originating order — same
// pattern used in PurchaseOrderActions.jsx for the single-record flow.
async function hasDraftPurchaseInvoice(orderId, apiBaseUrl, headers) {
  try {
    const res = await fetch(
      `${buildBase(apiBaseUrl)}/purchase-invoice/header?criteria=${orderCriteria(orderId)}&_limit=50`,
      { headers },
    );
    if (!res.ok) return false;
    const invoices = (await res.json())?.response?.data ?? [];
    return invoices.some((i) => i.documentStatus === DRAFT);
  } catch {
    return false;
  }
}

async function hasDraftGoodsReceipt(orderId, apiBaseUrl, headers) {
  try {
    const res = await fetch(
      `${buildBase(apiBaseUrl)}/goods-receipt/goodsReceipt?criteria=${orderCriteria(orderId)}&_limit=50`,
      { headers },
    );
    if (!res.ok) return false;
    const receipts = (await res.json())?.response?.data ?? [];
    return receipts.some((r) => r.documentStatus === DRAFT);
  } catch {
    return false;
  }
}

async function runBulkPurchaseOrderAction({ rows, action, apiBaseUrl, token, ui }) {
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
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
        ? await hasDraftPurchaseInvoice(row.id, apiBaseUrl, headers)
        : await hasDraftGoodsReceipt(row.id, apiBaseUrl, headers);
      if (alreadyHasDraft) {
        const messageKey = isInvoice ? 'poBulkOrderHasDraftInvoice' : 'poBulkOrderHasDraftReceipt';
        throw new Error(ui(messageKey).replace('{documentNo}', row.documentNo || row.id));
      }

      const res = await fetch(`${apiBaseUrl}/header/${row.id}/action/${action}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message || err?.response?.message || `Error (${res.status})`);
      }
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

export default function BulkPurchaseOrderMoreMenu({ selectedRows, clearSelection, token, apiBaseUrl }) {
  const ui = useUI();
  const [running, setRunning] = useState(false);

  if (!selectedRows || selectedRows.length === 0) return null;

  const handleSelect = (action) => async () => {
    if (running) return;
    setRunning(true);
    await runBulkPurchaseOrderAction({ rows: selectedRows, action, apiBaseUrl, token, ui });
    setRunning(false);
    setTimeout(() => {
      clearSelection();
      window.location.reload();
    }, 600);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 w-9 p-0" disabled={running}>
          <MoreVertical className="h-4 w-4" />
          <span className="sr-only">{ui('more')}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onSelect={handleSelect('createPurchaseInvoice')} disabled={running}>
          <Receipt className="h-4 w-4" />
          {ui('poBulkCreateInvoices')} ({selectedRows.length})
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={handleSelect('createGoodsReceipt')} disabled={running}>
          <Truck className="h-4 w-4" />
          {ui('poBulkCreateReceipts')} ({selectedRows.length})
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
