import { renderHook } from '@testing-library/react';
import { EmbeddedWindowContext } from '@/lib/embeddedWindow.js';

// ETP-5332 — `useUnsavedChangesGuard` must tag its registry entry `embedded: true` ONLY when
// it is mounted inside a `RecordCreateModal` popup (i.e. under `EmbeddedWindowContext`), so
// `saveEmbeddedUnsavedChanges()` (the function behind the popup's "Completado" button) can
// save exactly that DetailView instance and never the document behind the dialog.
//
// The registry itself is mocked here — its own contract (stop-at-first-refusal, the embedded
// scoping guard) is covered by unsavedChanges.vitest.js. What this suite pins is the WIRING:
// which `embedded` value this hook passes to `setUnsavedChanges` for a given context.

const mocks = vi.hoisted(() => ({
  setUnsavedChanges: vi.fn(),
  clearUnsavedChanges: vi.fn(),
}));

vi.mock('@/lib/unsavedChanges.js', () => ({
  setUnsavedChanges: mocks.setUnsavedChanges,
  clearUnsavedChanges: mocks.clearUnsavedChanges,
}));

import { useUnsavedChangesGuard } from '../useUnsavedChangesGuard.js';

function renderWithoutEmbeddedContext(isDirty, save) {
  return renderHook(({ dirty, saveFn }) => useUnsavedChangesGuard(dirty, saveFn), {
    initialProps: { dirty: isDirty, saveFn: save },
  });
}

function renderWithEmbeddedContext(isDirty, save, embeddedValue = true) {
  return renderHook(({ dirty, saveFn }) => useUnsavedChangesGuard(dirty, saveFn), {
    initialProps: { dirty: isDirty, saveFn: save },
    wrapper: ({ children }) => (
      <EmbeddedWindowContext.Provider value={embeddedValue}>
        {children}
      </EmbeddedWindowContext.Provider>
    ),
  });
}

describe('useUnsavedChangesGuard — embedded tagging (ETP-5332)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers with a falsy embedded flag when mounted with no EmbeddedWindowContext ancestor', () => {
    renderWithoutEmbeddedContext(true, vi.fn());

    expect(mocks.setUnsavedChanges).toHaveBeenCalledTimes(1);
    const [, dirty, , embedded] = mocks.setUnsavedChanges.mock.calls[0];
    expect(dirty).toBe(true);
    expect(embedded).toBeFalsy();
  });

  it('registers with embedded: true when mounted inside EmbeddedWindowContext.Provider(true)', () => {
    renderWithEmbeddedContext(true, vi.fn(), true);

    expect(mocks.setUnsavedChanges).toHaveBeenCalledTimes(1);
    const [, , , embedded] = mocks.setUnsavedChanges.mock.calls[0];
    expect(embedded).toBe(true);
  });

  it('registers with a falsy embedded flag inside a provider explicitly set to false', () => {
    // EmbeddedWindowContext defaults to `false` (see embeddedWindow.js); a provider re-stating
    // that must behave exactly like having no provider at all.
    renderWithEmbeddedContext(true, vi.fn(), false);

    expect(mocks.setUnsavedChanges).toHaveBeenCalledTimes(1);
    const [, , , embedded] = mocks.setUnsavedChanges.mock.calls[0];
    expect(embedded).toBeFalsy();
  });

  it('re-registers with the new embedded value when isDirty changes, keyed by the same id', () => {
    const { result, rerender } = renderWithEmbeddedContext(false, vi.fn(), true);
    void result;
    mocks.setUnsavedChanges.mockClear();

    rerender({ dirty: true, saveFn: vi.fn() });

    expect(mocks.setUnsavedChanges).toHaveBeenCalledTimes(1);
    const [key, dirty, , embedded] = mocks.setUnsavedChanges.mock.calls[0];
    expect(typeof key).toBe('string');
    expect(dirty).toBe(true);
    expect(embedded).toBe(true);
  });

  it('clears its entry on unmount regardless of embedded status', () => {
    const { unmount } = renderWithEmbeddedContext(true, vi.fn(), true);
    const [key] = mocks.setUnsavedChanges.mock.calls[0];

    unmount();

    expect(mocks.clearUnsavedChanges).toHaveBeenCalledWith(key);
  });
});
