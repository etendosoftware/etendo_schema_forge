import { useCallback, useState } from 'react';
import { useAuth } from '@/auth/AuthContext.jsx';
import { getApiBase } from './useNeoResource';

/** POSTs a JSON payload to a financial-account-transactions action and returns data. */
async function postAction(token, action, payload) {
  const url = `${getApiBase()}/sws/neo/financial-account-transactions?action=${action}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
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
  const { token } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const run = useCallback(async (payload) => {
    setBusy(true);
    setError(null);
    try {
      return await postAction(token, action, payload);
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setBusy(false);
    }
  }, [token]);

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
