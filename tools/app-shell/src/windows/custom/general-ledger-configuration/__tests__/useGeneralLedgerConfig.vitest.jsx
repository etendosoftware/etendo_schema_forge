import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// ── Mocks ────────────────────────────────────────────────────────────────────
// useAuth.selectedOrg gates load()/save(); useApiFetch is the network boundary.
let mockSelectedOrg = null;
const mockApiFetch = vi.fn();

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ selectedOrg: mockSelectedOrg }),
}));

vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: () => mockApiFetch,
}));

import { useGeneralLedgerConfig } from '../useGeneralLedgerConfig.js';
import { GENERAL_SEED, DEFAULTS_SEED, DIMENSIONS_SEED, GLC_SEED_PAYLOAD } from '../mockCatalogs.js';

function okJson(payload) {
  return { ok: true, json: async () => ({ response: { data: [payload] } }) };
}

beforeEach(() => {
  mockSelectedOrg = null;
  mockApiFetch.mockReset();
  // Default: any load() GET resolves to "no record" → seed fallback.
  mockApiFetch.mockResolvedValue(okJson(null));
});

describe('useGeneralLedgerConfig — seed + dirty diff', () => {
  // No org / no apiBaseUrl ⇒ load() short-circuits to the seed and never fetches.
  const renderSeeded = () => renderHook(() => useGeneralLedgerConfig(undefined));

  it('initialises every entity from the mock seed', () => {
    const { result } = renderSeeded();
    expect(result.current.general).toEqual(GENERAL_SEED);
    expect(result.current.defaults).toEqual(DEFAULTS_SEED);
    expect(result.current.dimensions).toEqual(DIMENSIONS_SEED);
    expect(result.current.isDirty).toBe(false);
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('tracks a dirty General field and exposes only the changed key', () => {
    const { result } = renderSeeded();
    act(() => result.current.setGeneralField('name', 'New schema name'));
    expect(result.current.isDirty).toBe(true);
    expect(result.current.dirty.general).toEqual({ name: 'New schema name' });
    expect(result.current.dirty.defaults).toEqual({});
    expect(result.current.dirty.dimensions).toEqual([]);
  });

  it('tracks a dirty Defaults field independently', () => {
    const { result } = renderSeeded();
    act(() => result.current.setDefaultField('bankAsset', 'acc-999'));
    expect(result.current.dirty.defaults).toEqual({ bankAsset: 'acc-999' });
    expect(result.current.dirty.general).toEqual({});
  });

  it('tracks a toggled dimension as {id, active, mandatory}', () => {
    const { result } = renderSeeded();
    // dim-pr (Producto) is active+optional in the seed → turn it off.
    act(() => result.current.setDimensionField('dim-pr', 'active', false));
    expect(result.current.dirty.dimensions).toEqual([
      { id: 'dim-pr', active: false, mandatory: false },
    ]);
    expect(result.current.isDirty).toBe(true);
  });

  it('clears dirty state when a field is set back to its baseline value', () => {
    const { result } = renderSeeded();
    act(() => result.current.setGeneralField('name', 'changed'));
    expect(result.current.isDirty).toBe(true);
    act(() => result.current.setGeneralField('name', GENERAL_SEED.name));
    expect(result.current.isDirty).toBe(false);
  });

  it('round-trips the inverted automaticPeriodControl raw boolean into the dirty payload', () => {
    const { result } = renderSeeded();
    // The UI binds the "closed periods" toggle inverted; the hook stores the raw
    // AD value. Seed is true → allowing closed periods writes false.
    expect(GENERAL_SEED.automaticPeriodControl).toBe(true);
    act(() => result.current.setGeneralField('automaticPeriodControl', false));
    expect(result.current.dirty.general).toEqual({ automaticPeriodControl: false });
  });

  it('reset() reverts all pending edits', () => {
    const { result } = renderSeeded();
    act(() => result.current.setGeneralField('description', 'edited'));
    act(() => result.current.setDimensionField('dim-pr', 'active', false));
    act(() => result.current.reset());
    expect(result.current.isDirty).toBe(false);
    expect(result.current.general).toEqual(GENERAL_SEED);
    expect(result.current.dimensions).toEqual(DIMENSIONS_SEED);
  });
});

describe('useGeneralLedgerConfig — NEO fallback on load', () => {
  it('falls back to the seed when the aggregate GET rejects (NEO unreachable)', async () => {
    mockSelectedOrg = { id: 'ES', name: 'España S.A.' };
    mockApiFetch.mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() => useGeneralLedgerConfig('/sws/neo/general-ledger-configuration'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockApiFetch).toHaveBeenCalled();
    // Seed is still rendered — the window never blanks out.
    expect(result.current.general).toEqual(GENERAL_SEED);
    expect(result.current.isDirty).toBe(false);
  });
});

describe('useGeneralLedgerConfig — save() payload', () => {
  it('POSTs only the dirty fields per entity plus selectedOrgId', async () => {
    mockSelectedOrg = { id: 'ES', name: 'España S.A.' };
    // Mount GET → seed baseline; subsequent POST → echoes back a saved record.
    mockApiFetch.mockResolvedValue(okJson(null));

    const { result } = renderHook(() => useGeneralLedgerConfig('/sws/neo/general-ledger-configuration'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    mockApiFetch.mockClear();

    act(() => result.current.setGeneralField('name', 'Updated name'));
    act(() => result.current.setDimensionField('dim-pr', 'active', false));

    // POST must echo back a valid aggregate so the guard in save() doesn't throw.
    mockApiFetch.mockResolvedValueOnce(okJson(GLC_SEED_PAYLOAD));
    await act(async () => {
      await result.current.save();
    });

    // Find the POST call and assert the body shape.
    const postCall = mockApiFetch.mock.calls.find(([, opts]) => opts?.method === 'POST');
    expect(postCall).toBeTruthy();
    const [url, opts] = postCall;
    expect(url).toContain('/general-ledger-configuration/General');
    const body = JSON.parse(opts.body);
    expect(body).toEqual({
      general: { name: 'Updated name' },
      defaults: {},
      dimensions: [{ id: 'dim-pr', active: false, mandatory: false }],
      selectedOrgId: 'ES',
    });
  });

  it('returns the dirty payload without POSTing when no org is selected', async () => {
    mockSelectedOrg = null;
    const { result } = renderHook(() => useGeneralLedgerConfig(undefined));
    act(() => result.current.setGeneralField('currency', 'USD'));
    mockApiFetch.mockClear();

    let returned;
    await act(async () => {
      returned = await result.current.save();
    });

    expect(returned.general).toEqual({ currency: 'USD' });
    const posted = mockApiFetch.mock.calls.some(([, opts]) => opts?.method === 'POST');
    expect(posted).toBe(false);
  });
});
