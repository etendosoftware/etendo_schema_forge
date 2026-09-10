// ETP-5027 — `invalidateFiscalComputeCache`: the escape hatch for side-effects that
// change what `computeFn` would return WITHOUT touching anything `checkModifiedFn` looks at.
//
// The VIES revalidation button is exactly that case. It updates the business partners'
// VIES status, while `checkModified349` only asks whether the period's INVOICES changed —
// so it answers `false`, the cached pre-validation payload is restored, and the OLD VIES
// badges get repainted over the fresh ones. The first test below reproduces that stale
// repaint; the rest pin the fix.
//
// The mocking conventions follow useFiscalAutoCompute.vitest.js (same stable-array-ref
// requirement: a new array identity on every render re-runs the effect).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import useFiscalAutoCompute, { invalidateFiscalComputeCache } from '../useFiscalAutoCompute.js';

const DECL = { id: '349-2026-T1', model: '349', year: 2026, period: 'T1' };
const DECL_LIST = [DECL];
const CACHE_KEY = `fiscal_ac_v3_${DECL.id}`;

// Pre-validation payload: the NIF is `pending`. This is what sits in sessionStorage
// at the moment the user presses "Validar VIES".
const STALE = { operators: [{ bpId: 'bp-fr', nif: 'FR12487773327', key: 'S', vies: 'pending' }] };
// What the server returns once the revalidation has run.
const FRESH = { operators: [{ bpId: 'bp-fr', nif: 'FR12487773327', key: 'S', vies: 'valid' }] };

function makeOpts(overrides) {
  return {
    token: 'tok',
    apiBaseUrl: 'http://host/neo/fiscal-models',
    enabled: true,
    pollIntervalMs: 100_000,
    ...overrides,
  };
}

function seedCache() {
  sessionStorage.setItem(
    CACHE_KEY,
    JSON.stringify({ result: STALE, computedAt: Date.now() - 60_000 }),
  );
}

beforeEach(() => sessionStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('invalidateFiscalComputeCache — the stale-repaint hazard it exists to close', () => {
  it('WITHOUT invalidation the stale pre-validation payload is repainted', async () => {
    seedCache();
    const computeFn = vi.fn().mockResolvedValue(FRESH);
    // A VIES revalidation does not touch invoices, so checkModified349 answers false.
    const checkModifiedFn = vi.fn().mockResolvedValue(false);

    const { result } = renderHook(() =>
      useFiscalAutoCompute(DECL_LIST, makeOpts({ computeFn, checkModifiedFn })),
    );

    await waitFor(() => expect(result.current.computedMap[DECL.id]).toBeDefined());
    // The bug: `pending` comes back even though the server now says `valid`.
    expect(result.current.computedMap[DECL.id].operators[0].vies).toBe('pending');
    expect(computeFn).not.toHaveBeenCalled();
  });

  it('WITH invalidation the hook is forced to recompute and shows the fresh statuses', async () => {
    seedCache();
    const computeFn = vi.fn().mockResolvedValue(FRESH);
    const checkModifiedFn = vi.fn().mockResolvedValue(false);

    invalidateFiscalComputeCache(DECL.id);

    const { result } = renderHook(() =>
      useFiscalAutoCompute(DECL_LIST, makeOpts({ computeFn, checkModifiedFn })),
    );

    await waitFor(() => expect(computeFn).toHaveBeenCalled());
    await waitFor(() =>
      expect(result.current.computedMap[DECL.id]?.operators[0].vies).toBe('valid'),
    );
    // With no cache entry there is nothing to compare against, so the modified-check
    // is never even consulted for this declaration.
    expect(checkModifiedFn).not.toHaveBeenCalled();
  });
});

describe('invalidateFiscalComputeCache — mechanics', () => {
  it('removes exactly the entry for the given declaration', () => {
    seedCache();
    sessionStorage.setItem('fiscal_ac_v3_other-decl', JSON.stringify({ result: STALE, computedAt: 1 }));

    invalidateFiscalComputeCache(DECL.id);

    expect(sessionStorage.getItem(CACHE_KEY)).toBeNull();
    expect(sessionStorage.getItem('fiscal_ac_v3_other-decl')).not.toBeNull();
  });

  it('is a no-op for a null/undefined id instead of clearing anything', () => {
    seedCache();
    invalidateFiscalComputeCache(null);
    invalidateFiscalComputeCache(undefined);
    expect(sessionStorage.getItem(CACHE_KEY)).not.toBeNull();
  });

  it('never throws when sessionStorage is unavailable (private mode / SSR)', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(() => invalidateFiscalComputeCache(DECL.id)).not.toThrow();
  });
});
