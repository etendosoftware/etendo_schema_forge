import { toast } from 'sonner';
import { extractErrorMessage, PROCESS_FAILURE_TOAST_DURATION_MS } from '@/hooks/useEntity.js';

// ETP-5445 — the ONE implementation of Internal Consumption's "Anular" (Void), shared by the
// detail kebab (artifacts/internal-consumption/custom/InternalConsumptionActions.jsx, which
// imports it via '@/windows/custom/internal-consumption/…') and the grid row-hover kebab
// (./index.jsx). Void runs the same `processNow` AD button the Confirm uses, with the
// M_Internal_Consumption_Post `action` parameter flat at the request root.

export const VOID_BODY = JSON.stringify({ action: 'VO' });

/** Void is only offered on completed documents. */
export function isVoidableRow(row) {
  return row?.status === 'CO';
}

/**
 * POSTs the Void and toasts the outcome. Never throws: a network error / abort is reported
 * like any other failure. Refreshing (and closing a menu) is left to the caller, whose
 * surfaces differ.
 *
 * @param {object}   params
 * @param {Function} params.apiFetch  an apiFetch (useApiFetch) instance
 * @param {string}   [params.basePath=''] prefix for the path — the spec-scoped apiBaseUrl when
 *   `apiFetch` was created with an empty base, '' when it is already scoped
 * @param {string}   params.recordId  M_Internal_Consumption_ID
 * @param {Function} params.ui        useUI() translator
 * @returns {Promise<{success: boolean, message?: string}>}
 */
export async function voidInternalConsumption({ apiFetch, basePath = '', recordId, ui }) {
  let res;
  try {
    res = await apiFetch(`${basePath}/internalConsumption/${encodeURIComponent(recordId)}/action/processNow`, {
      method: 'POST',
      body: VOID_BODY,
    });
  } catch {
    toast.error(ui('actionFailed'), { duration: PROCESS_FAILURE_TOAST_DURATION_MS });
    return { success: false };
  }
  if (!res.ok) {
    // Same extractor the form uses for process rejections (routes through translateBackendError).
    const message = await extractErrorMessage(res, ui);
    toast.error(
      ui('internalConsumptionVoidError').replace('{error}', message || ui('actionFailed')),
      { duration: PROCESS_FAILURE_TOAST_DURATION_MS },
    );
    return { success: false, message };
  }
  toast.success(ui('internalConsumptionVoided'));
  return { success: true };
}
