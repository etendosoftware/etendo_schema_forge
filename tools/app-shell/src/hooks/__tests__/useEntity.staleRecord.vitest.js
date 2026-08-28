// ETP-5073 / DOC-04 — the client half of the P0.
//
// The server now refuses an update whose `updated` no longer matches the stored row, answering
// 409 with `error: "stale_record"`. Before this ticket that write SUCCEEDED and silently erased
// the other person's change; the whole point is that the outcome is now impossible to miss.
//
// `handleSaveErrorResponse` is exported from useEntity.js precisely so this branch can be
// exercised without mounting a window.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const toast = { error: vi.fn(), success: vi.fn(), info: vi.fn() };
vi.mock('sonner', () => ({ toast }));
vi.mock('@/lib/backendErrors.js', () => ({ translateBackendError: (m) => m }));

const { handleSaveErrorResponse } = await import('../useEntity.js');

/** A minimal stand-in for a `Response`, including the `clone()` the parser uses. */
function jsonResponse(body, status = 409) {
  return {
    ok: false,
    status,
    clone: () => ({ json: async () => body }),
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: { get: () => 'application/json' },
  };
}

const ui = (key) => key;

describe('handleSaveErrorResponse — concurrency conflict (ETP-5073)', () => {
  beforeEach(() => {
    toast.error.mockClear();
    toast.info.mockClear();
  });

  it('reports the conflict with the dedicated message, not a generic backend error', async () => {
    const setFieldErrors = vi.fn();
    const setSaveError = vi.fn();
    await handleSaveErrorResponse(
      jsonResponse({ status: 409, error: 'stale_record', detail: 'x' }),
      ui, setFieldErrors, setSaveError, vi.fn(),
    );
    expect(setSaveError).toHaveBeenCalledWith('saveConflictRecordChanged');
    expect(toast.error).toHaveBeenCalled();
    expect(toast.error.mock.calls[0][0]).toBe('saveConflictRecordChanged');
  });

  it('offers a reload action wired to the callback, so the user can recover in place', async () => {
    const onStaleRecord = vi.fn();
    await handleSaveErrorResponse(
      jsonResponse({ error: 'stale_record' }), ui, vi.fn(), vi.fn(), onStaleRecord,
    );
    const options = toast.error.mock.calls[0][1];
    expect(options.action.label).toBe('saveConflictReload');
    options.action.onClick();
    expect(onStaleRecord).toHaveBeenCalledTimes(1);
  });

  it('never auto-dismisses — a silently vanishing data-loss warning is the original defect', async () => {
    await handleSaveErrorResponse(
      jsonResponse({ error: 'stale_record' }), ui, vi.fn(), vi.fn(), vi.fn(),
    );
    expect(toast.error.mock.calls[0][1].duration).toBe(Infinity);
  });

  it('does not offer an action when no reload callback was supplied', async () => {
    // A caller without a reload path must still SEE the conflict; a dead button would be worse.
    await handleSaveErrorResponse(
      jsonResponse({ error: 'stale_record' }), ui, vi.fn(), vi.fn(), undefined,
    );
    expect(toast.error.mock.calls[0][1].action).toBeUndefined();
  });

  it('does not set field errors — no single field is at fault in a conflict', async () => {
    const setFieldErrors = vi.fn();
    await handleSaveErrorResponse(
      jsonResponse({ error: 'stale_record' }), ui, setFieldErrors, vi.fn(), vi.fn(),
    );
    expect(setFieldErrors).not.toHaveBeenCalled();
  });

  it('keys off the error discriminator, not the 409 status', async () => {
    // A duplicate-key rejection is ALSO a 409 and its remedy is the opposite (change your data,
    // not your baseline). Treating them alike would send the user round a useless reload loop.
    const setSaveError = vi.fn();
    await handleSaveErrorResponse(
      jsonResponse({ status: 409, error: 'conflict', detail: 'must be unique' }),
      ui, vi.fn(), setSaveError, vi.fn(),
    );
    expect(setSaveError).not.toHaveBeenCalledWith('saveConflictRecordChanged');
  });

  it('leaves the existing MISSING_REQUIRED_FIELDS branch intact', async () => {
    const setFieldErrors = vi.fn();
    const setSaveError = vi.fn();
    await handleSaveErrorResponse(
      jsonResponse({ error: { code: 'MISSING_REQUIRED_FIELDS', fields: ['partnerAddress'] } }, 400),
      ui, setFieldErrors, setSaveError, vi.fn(),
    );
    expect(setFieldErrors).toHaveBeenCalledWith({ partnerAddress: 'fieldRequired' });
    expect(setSaveError).toHaveBeenCalledWith('requiredFieldsMissing');
  });
});
