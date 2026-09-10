import { useCallback, useState } from 'react';
import { getApiBase } from './useNeoResource';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { parseBackendErrorMessage } from '@/lib/backendErrors.js';

/**
 * POSTs a JSON payload to a financial-account-transactions action and returns data.
 *
 * On failure it throws the backend's OWN business message (`{"error":{"message":…}}`), read with the
 * shared `parseBackendErrorMessage`, so the caller can run it through `translateBackendError` and
 * show it translated. It used to throw `HTTP <status>: <raw body>`, which is how ETP-5085's error
 * reached the user as `HTTP 500: {"error":{"message":"Could not delete the movement…"}}`. The status
 * is attached to the error for callers that branch on it; `HTTP <status>` stays as the fallback for
 * a response with no readable message (empty or non-JSON body).
 */
async function postAction(apiFetch, action, payload) {
  const res = await apiFetch(`/sws/neo/financial-account-transactions?action=${action}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const raw = await parseBackendErrorMessage(res);
    const error = new Error(raw || `HTTP ${res.status}`);
    error.status = res.status;
    // Whether `message` is something the backend actually said, or the synthesized
    // `HTTP <status>` placeholder. Callers cannot tell them apart from the string alone,
    // and translateBackendError passes the placeholder through as a truthy value, so a
    // `translate(...) || friendlyFallback` chain would silently show the HTTP code
    // instead of the fallback (PSD-23).
    error.hasBackendMessage = Boolean(raw);
    throw error;
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
 * Builds a full `update` payload for a dimension-only inline edit (ETP-5101 — the
 * "Más información" row-expand panel's Project/Cost center/Product fields). The `update`
 * action has no partial-patch support (see the doc block above): every call must resend
 * the movement's own current amount/type/currency/etc. unchanged, with only the ONE
 * dimension actually being edited differing. Deliberately NOT shared with
 * NewTransactionModal's own `formFromMovement`/`handleSave` — that full edit form owns
 * its own direction-toggle/validation concerns this narrower, single-field path doesn't
 * need, so keeping them separate avoids coupling two different editing surfaces.
 *
 * `process: false` matches what the modal's own "Guardar" button already sends when
 * editing an already-Processed movement (its "Confirmar" is hidden in that case) — this
 * is the proven-safe idempotent value, it does not revert a Processed/Posted movement.
 *
 * @param {object} movement - a row as returned by GET .../financial-account-transactions
 *   (`{ id, trxType, date, depositAmount, withdrawalAmount, description, glItemId,
 *   bpartnerId, costcenterId, projectId, productId, ... }`)
 * @param {string} accountCurrencyId - the account's currency id. Movement rows carry only
 *   `currencyIso` (display), never the id — a movement is always in its account's
 *   currency, so the account's own id is always correct here.
 * @param {{ costcenterId?: string|null, projectId?: string|null, productId?: string|null }} overrides
 *   the dimension field(s) actually changing; the other two pass through unchanged.
 */
export function buildDimensionUpdatePayload(movement, accountCurrencyId, overrides) {
  return {
    id: movement.id,
    trxType: movement.trxType,
    transactionDate: movement.date,
    accountingDate: movement.date,
    depositAmount: movement.depositAmount ?? 0,
    paymentAmount: movement.withdrawalAmount ?? 0,
    currencyId: accountCurrencyId,
    description: movement.description ?? '',
    glItemId: movement.glItemId || null,
    bpartnerId: movement.bpartnerId || null,
    costcenterId: movement.costcenterId || null,
    projectId: movement.projectId || null,
    productId: movement.productId || null,
    process: false,
    ...overrides,
  };
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
