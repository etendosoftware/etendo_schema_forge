// @covers artifacts/business-partner-category/custom/useAssociatedContactsNotice.js
/**
 * After a contact category is SAVED, and only when it already has contacts, the user is told
 * that the change does not reach them (a category's type and accounts are copied into a contact
 * when it is created). A save is a change of the record's `updated` token for the same id; the
 * first value seen for an id is a load. The lookup is advisory: a failure stays silent. The
 * notice replaces the generic "record saved" toast (same toast id) instead of stacking on it.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn(), toastInfo: vi.fn(), ui: (key) => key }));
vi.mock('@/i18n', () => ({ useUI: () => mocks.ui }));
vi.mock('@/auth/useApiFetch.js', () => ({ useApiFetch: () => mocks.apiFetch }));
vi.mock('sonner', () => ({ toast: { info: mocks.toastInfo } }));

import { useNotifyOnHeaderSave } from '@generated/business-partner-category/custom/useAssociatedContactsNotice.js';
import { RECORD_SAVE_TOAST_ID } from '@/hooks/useEntity';

const contacts = (rows) => ({ ok: true, json: async () => ({ response: { data: rows } }) });

/** Renders the hook through a sequence of header records; returns how many notices were shown. */
async function runSequence(records) {
  const { rerender } = renderHook(({ record }) => useNotifyOnHeaderSave(record), { initialProps: { record: records[0] } });
  for (const record of records.slice(1)) {
    await act(async () => { rerender({ record }); });
  }
  await act(async () => {});
  return mocks.toastInfo.mock.calls.length;
}

beforeEach(() => {
  mocks.apiFetch.mockReset();
  mocks.toastInfo.mockReset();
});

describe('useNotifyOnHeaderSave', () => {
  const A1 = { id: 'G-1', updated: 't1' };
  const A2 = { id: 'G-1', updated: 't2' };
  const B = { id: 'G-2', updated: 't9' };

  it.each([
    ['a save of a category with contacts', [A1, A2], [{ id: 'BP-1' }], 1],
    ['a save of a category without contacts', [A1, A2], [], 0],
    ['a plain load (first token seen)', [A1], [{ id: 'BP-1' }], 0],
    ['a re-render with the same token', [A1, { ...A1 }], [{ id: 'BP-1' }], 0],
    ['navigating to another category', [A1, B], [{ id: 'BP-1' }], 0],
    ['a new, unsaved category', [{ id: null, updated: null }, { id: null, updated: 't1' }], [{ id: 'BP-1' }], 0],
  ])('%s -> %i notice(s)', async (_label, records, rows, expected) => {
    mocks.apiFetch.mockResolvedValue(contacts(rows));
    expect(await runSequence(records)).toBe(expected);
  });

  it('asks for at most one contact of that category', async () => {
    mocks.apiFetch.mockResolvedValue(contacts([{ id: 'BP-1' }]));
    await runSequence([A1, A2]);
    await waitFor(() => expect(mocks.toastInfo).toHaveBeenCalledWith('bpCategorySavedWithContacts', expect.any(Object)));
    const url = decodeURIComponent(mocks.apiFetch.mock.calls[0][0]);
    expect(url).toMatch(/^\/businessPartner\?criteria=/);
    expect(url).toContain('"fieldName":"businessPartnerCategory","operator":"equals","value":"G-1"');
    expect(url).toContain('_endRow=1');
  });

  it('replaces the generic save toast instead of stacking a second one', async () => {
    mocks.apiFetch.mockResolvedValue(contacts([{ id: 'BP-1' }]));
    await runSequence([A1, A2]);
    await waitFor(() => expect(mocks.toastInfo).toHaveBeenCalledWith(
      'bpCategorySavedWithContacts', expect.objectContaining({ id: RECORD_SAVE_TOAST_ID })));
  });

  it.each([
    ['refused', () => Promise.resolve({ ok: false, json: async () => ({}) })],
    ['throws', () => Promise.reject(new Error('down'))],
  ])('stays silent when the contacts lookup is %s', async (_label, impl) => {
    mocks.apiFetch.mockImplementation(impl);
    expect(await runSequence([A1, A2])).toBe(0);
    expect(mocks.apiFetch).toHaveBeenCalledTimes(1);
  });
});
