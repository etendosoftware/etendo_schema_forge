import { translateBackendErrorBody } from './backendErrors.js';

/**
 * Parses a non-ok fetch Response and extracts a human-readable error message.
 * With `t` (the `ui` from `useUI()`), the message is run through the backend-error translator.
 * Supports NEO Headless and Etendo JsonDataService error shapes.
 */
export async function extractApiErrorMessage(res, t) {
  try {
    const data = await res.json();
    if (typeof t === 'function') return translateBackendErrorBody(data, t, `Error ${res.status}`);
    if (data?.error?.message) return data.error.message;
    const err = data?.response?.error;
    if (err?.message) return err.message;
    if (typeof err === 'string') return err;
    if (data?.message) return data.message;
  } catch {
    // non-JSON body
  }
  return `Error ${res.status}`;
}
