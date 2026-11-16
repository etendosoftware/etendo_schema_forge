// @covers tools/app-shell/src/windows/custom/shared/useImportLoadFailureToast.js
const { toastError, uiState } = vi.hoisted(() => ({
  toastError: vi.fn(),
  uiState: { prefix: 'ES' },
}));

vi.mock('sonner', () => ({ toast: { error: toastError } }));
vi.mock('@/i18n', () => ({
  // A new `ui` per render that captures the prefix of THAT render, as a locale switch would.
  useUI: () => {
    const prefix = uiState.prefix;
    return (key) => `${prefix} ${key}`;
  },
}));

import { renderHook } from '@testing-library/react';
import useImportLoadFailureToast from '../useImportLoadFailureToast.js';
import { ImportLoadError } from '../importActionClient.js';

const REFUSAL = { error: { code: 'importTargetNotDraft' } };

describe('useImportLoadFailureToast', () => {
  beforeEach(() => {
    toastError.mockClear();
    uiState.prefix = 'ES';
  });

  it.each([
    ['a server refusal toasts its translated code', new ImportLoadError(REFUSAL), 'ES backendError.importTargetNotDraft'],
    ['an unreadable refusal toasts documentsLoadError', new ImportLoadError(null), 'ES documentsLoadError'],
    ['a network failure toasts its own message', Object.assign(new Error('Sin conexión'), { name: 'NetworkError' }), 'Sin conexión'],
  ])('fetchDocuments: %s and resolves to no documents', async (_name, err, message) => {
    const fetchDocuments = vi.fn().mockRejectedValue(err);
    const { result } = renderHook(() => useImportLoadFailureToast(fetchDocuments, vi.fn()));
    const out = await result.current.fetchDocuments({ invoiceId: 'inv1', bpId: 'bp1' });
    expect(fetchDocuments).toHaveBeenCalledWith({ invoiceId: 'inv1', bpId: 'bp1' });
    expect(toastError).toHaveBeenCalledWith(message);
    expect(out).toEqual({
      documents: [],
      sharedContext: { targetId: 'inv1', invoiceId: 'inv1' },
      excludedByCurrency: false,
    });
  });

  it('fetchLines: toasts the failure and resolves to []', async () => {
    const fetchLines = vi.fn().mockRejectedValue(new ImportLoadError(REFUSAL));
    const { result } = renderHook(() => useImportLoadFailureToast(vi.fn(), fetchLines));
    await expect(result.current.fetchLines({ docId: 'o1' })).resolves.toEqual([]);
    expect(toastError).toHaveBeenCalledWith('ES backendError.importTargetNotDraft');
  });

  it('a successful read passes through without a toast', async () => {
    const answer = { documents: [{ id: 'o1' }], sharedContext: { targetId: 't1' }, excludedByCurrency: false };
    const lines = [{ id: 'l1' }];
    const { result } = renderHook(() =>
      useImportLoadFailureToast(vi.fn().mockResolvedValue(answer), vi.fn().mockResolvedValue(lines)));
    await expect(result.current.fetchDocuments({})).resolves.toBe(answer);
    await expect(result.current.fetchLines({})).resolves.toBe(lines);
    expect(toastError).not.toHaveBeenCalled();
  });

  it('keeps the handlers identity across re-renders when ui changes, and toasts with the latest ui', async () => {
    const fetchDocuments = vi.fn().mockRejectedValue(new ImportLoadError(null));
    const fetchLines = vi.fn();
    const { result, rerender } = renderHook(() => useImportLoadFailureToast(fetchDocuments, fetchLines));
    const before = result.current;
    uiState.prefix = 'EN';
    rerender();
    expect(result.current.fetchDocuments).toBe(before.fetchDocuments);
    expect(result.current.fetchLines).toBe(before.fetchLines);
    await result.current.fetchDocuments({});
    expect(toastError).toHaveBeenCalledWith('EN documentsLoadError');
  });

  it('new handlers when the wrapped fetchDocuments changes', () => {
    const fetchLines = vi.fn();
    const { result, rerender } = renderHook(({ fd }) => useImportLoadFailureToast(fd, fetchLines),
      { initialProps: { fd: vi.fn() } });
    const before = result.current.fetchDocuments;
    rerender({ fd: vi.fn() });
    expect(result.current.fetchDocuments).not.toBe(before);
  });
});
