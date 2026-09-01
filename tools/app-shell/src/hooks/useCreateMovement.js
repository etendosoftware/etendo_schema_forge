import { useCallback, useState } from 'react';
import { getApiBase } from './useNeoResource';
import { useApiFetch } from '@/auth/useApiFetch.js';

/** POSTs a JSON payload to a financial-account-transactions action and returns data. */
async function postAction(apiFetch, action, payload) {
  const res = await apiFetch(`/sws/neo/financial-account-transactions?action=${action}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const detail = text ? `: ${text}` : '';
    throw new Error(`HTTP ${res.status}${detail}`);
  }
  const json = await res.json();
  return json?.response?.data ?? {};
}

/** Wraps a POST action into a `{ run, busy, error }` triple. */
function usePostAction(action) {
  const apiFetch = useApiFetch(getApiBase());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const run = useCallback(async (payload) => {
    setBusy(true);
    setError(null);
    try {
      return await postAction(apiFetch, action, payload);
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setBusy(false);
    }
  }, [apiFetch, action]);

  return { run, busy, error };
}

/**
 * Hook for creating a single FIN_Finacc_Transaction (manual movement).
 *
 * POST /sws/neo/financial-account-transactions?action=create
 * body: {
 *   FIN_Financial_Account_ID, trxType, transactionDate, accountingDate,
 *   amount, currencyId, description?, bpartnerId?, glItemId?,
 *   foreignCurrencyId?, foreignAmount?
 * }
 *
 * Returns `{ createMovement, creating, error }`. On success resolves with the
 * `{ id, trxType, status }` shape returned by the backend.
 */
export function useCreateMovement() {
  const { run, busy, error } = usePostAction('create');
  return { createMovement: run, creating: busy, error };
}

/**
 * Hook for editing an existing DRAFT FIN_Finacc_Transaction.
 *
 * POST /sws/neo/financial-account-transactions?action=update
 * body: { id, trxType, transactionDate, accountingDate, depositAmount,
 *         paymentAmount, currencyId, description?, glItemId?, bpartnerId?,
 *         projectId?, costcenterId?, productId?, process? }
 *
 * `process: true` edits AND processes (Borrador → Procesado) in one call.
 * Returns `{ updateMovement, updating, error }`.
 */
export function useUpdateMovement() {
  const { run, busy, error } = usePostAction('update');
  return { updateMovement: run, updating: busy, error };
}

/**
 * Hook for registering a payment (replicating Classic "Add Payment").
 *
 * POST /sws/neo/financial-account-transactions?action=create-payment
 * body: {
 *   FIN_Financial_Account_ID, isReceipt, bpartnerId, paymentMethodId, amount,
 *   paymentDate, referenceNo?, description?, organizationId?,
 *   selectedInvoices: { <psdId>: amount }, writeoffs: { <psdId>: bool },
 *   glItems: [{ glItemId, receivedIn, paidOut }], overpaymentAction
 * }
 *
 * Returns `{ createPayment, creating, error }`. On success resolves with the
 * `{ id, documentNo, status, refundPaymentId? }` shape returned by the backend.
 */
export function useCreatePayment() {
  const { run, busy, error } = usePostAction('create-payment');
  return { createPayment: run, creating: busy, error };
}

/**
 * Hook for transferring funds between two financial accounts (ETP-4272).
 *
 * POST /sws/neo/financial-account-transactions?action=transfer
 * body: {
 *   sourceAccountId, destinationAccountId, amount, glItemId?, transferDate?,
 *   conversionRate?, bankFee?, bankFeeFrom?, bankFeeTo?, description?
 * }
 *
 * The backend validates and delegates to Etendo Classic's funds-transfer flow,
 * creating the paired withdrawal/deposit (+ optional bank fee) transactions.
 *
 * Returns `{ transfer, transferring, error }`.
 */
export function useFundsTransfer() {
  const { run, busy, error } = usePostAction('transfer');
  return { transfer: run, transferring: busy, error };
}

/**
 * Hook for confirming a Draft transaction (Borrador → Procesado).
 *
 * POST /sws/neo/financial-account-transactions?action=process
 * body: { id }
 *
 * Returns `{ processMovement, processing, error }`.
 */
export function useProcessMovement() {
  const { run, busy, error } = usePostAction('process');
  return { processMovement: run, processing: busy, error };
}

/**
 * Hook for reactivating a Processed transaction (Procesado → Borrador). Undoes
 * posting and reconciliation in reverse order (Payment Removal).
 *
 * POST /sws/neo/financial-account-transactions?action=reactivate
 * body: { id }
 *
 * Returns `{ reactivateMovement, reactivating, error }`.
 */
export function useReactivateMovement() {
  const { run, busy, error } = usePostAction('reactivate');
  return { reactivateMovement: run, reactivating: busy, error };
}

/**
 * Hook for deleting a transaction. A Draft is removed directly; a Processed one
 * is reactivated and removed via Payment Removal (the backend decides by state).
 *
 * POST /sws/neo/financial-account-transactions?action=delete
 * body: { id }
 *
 * Returns `{ deleteMovement, deleting, error }`.
 */
export function useDeleteMovement() {
  const { run, busy, error } = usePostAction('delete');
  return { deleteMovement: run, deleting: busy, error };
}

/**
 * Hook for posting a transaction's accounting (contabilizar).
 *
 * POST /sws/neo/financial-account-transactions?action=post
 * body: { id }
 *
 * Runs the Etendo accounting engine server-side. Returns `{ postMovement, posting, error }`.
 */
export function usePostMovement() {
  const { run, busy, error } = usePostAction('post');
  return { postMovement: run, posting: busy, error };
}
