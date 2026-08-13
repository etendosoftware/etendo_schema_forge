import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockApiFetch = vi.fn();
vi.mock('@/auth/useApiFetch', () => ({ useApiFetch: () => mockApiFetch }));
vi.mock('@/components/related-documents/helpers.js', () => ({ neoBase: (url) => url }));
vi.mock('../../fiscal-config/fiscalConfig.utils.js', () => ({
  detectProfile: vi.fn(),
}));

import { detectProfile } from '../../fiscal-config/fiscalConfig.utils.js';
import { useFiscalMonitor } from '../useFiscalMonitor.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function okJson(data) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(data) });
}

function errorResponse(status = 500) {
  return Promise.resolve({ ok: false, status });
}

const ORG = 'org-1';
const API = 'http://host/neo';

const SII_CFG_RESP   = { response: { data: [{ id: 'sii-cfg-1' }] } };
const TBAI_CFG_RESP  = { response: { data: [] } };
const VF_CFG_RESP    = { response: { data: [] } };
const EMPTY_RESP     = { response: { data: [], totalRows: 0 } };
const SII_ORG_RESP   = { response: { data: [{ id: 'sii-parent-1' }], totalRows: 1 } };
const COUNT_10_RESP  = { response: { totalRows: 10 } };
const COUNT_5_RESP   = { response: { totalRows: 5 } };

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  detectProfile.mockReturnValue('unconfigured');
});
afterEach(() => vi.restoreAllMocks());

describe('useFiscalMonitor — no orgId', () => {
  it('sets profile to unconfigured immediately when orgId is falsy', async () => {
    const { result } = renderHook(() => useFiscalMonitor(null, API));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.profile).toBe('unconfigured');
    expect(result.current.error).toBeNull();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('sets profile to unconfigured when orgId is empty string', async () => {
    const { result } = renderHook(() => useFiscalMonitor('', API));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.profile).toBe('unconfigured');
  });
});

describe('useFiscalMonitor — unconfigured profile', () => {
  beforeEach(() => {
    detectProfile.mockReturnValue('unconfigured');
    mockApiFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(SII_CFG_RESP) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(TBAI_CFG_RESP) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(VF_CFG_RESP) });
  });

  it('resolves with profile=unconfigured when no config found', async () => {
    const { result } = renderHook(() => useFiscalMonitor(ORG, API));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.profile).toBe('unconfigured');
    expect(result.current.monitorData).toEqual({});
    expect(result.current.error).toBeNull();
  });
});

describe('useFiscalMonitor — sii profile', () => {
  beforeEach(() => {
    detectProfile.mockReturnValue('sii');
    mockApiFetch
      // Config fetches (3 parallel)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(SII_CFG_RESP) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(TBAI_CFG_RESP) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(VF_CFG_RESP) })
      // fetchSiiParentId
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(SII_ORG_RESP) })
      // fetchCount x4 (issued, received, issuedPrev, receivedPrev)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(COUNT_10_RESP) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(COUNT_5_RESP) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(COUNT_10_RESP) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(COUNT_5_RESP) });
  });

  it('loads sii monitor data with counts', async () => {
    const { result } = renderHook(() => useFiscalMonitor(ORG, API));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.profile).toBe('sii');
    expect(result.current.monitorData.sii).toBeDefined();
    expect(result.current.monitorData.sii.issued.totalCount).toBe(10);
    expect(result.current.monitorData.sii.received.totalCount).toBe(5);
    expect(result.current.siiParentId).toBe('sii-parent-1');
  });

  it('populates kpis for sii', async () => {
    const { result } = renderHook(() => useFiscalMonitor(ORG, API));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.kpis.sii).toBeDefined();
    expect(result.current.kpis.sii.issued).toBe(10);
    expect(result.current.kpis.sii.received).toBe(5);
  });

  it('siiParentId is null when organizations returns empty', async () => {
    mockApiFetch.mockReset();
    detectProfile.mockReturnValue('sii');
    mockApiFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(SII_CFG_RESP) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(TBAI_CFG_RESP) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(VF_CFG_RESP) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ response: { data: [] } }) });
    const { result } = renderHook(() => useFiscalMonitor(ORG, API));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.siiParentId).toBeNull();
    expect(result.current.monitorData.sii?.issued.totalCount).toBe(0);
  });
});

describe('useFiscalMonitor — verifactu profile', () => {
  beforeEach(() => {
    detectProfile.mockReturnValue('verifactu');
    mockApiFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(VF_CFG_RESP) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(SII_CFG_RESP) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(TBAI_CFG_RESP) })
      // fetchCount x4 (accepted, partial, rejected, invalid)
      .mockResolvedValue({ ok: true, json: () => Promise.resolve(COUNT_10_RESP) });
  });

  it('loads verifactu counts', async () => {
    const { result } = renderHook(() => useFiscalMonitor(ORG, API));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.profile).toBe('verifactu');
    expect(result.current.monitorData.verifactu).toBeDefined();
    expect(result.current.siiParentId).toBeNull();
    expect(result.current.monitorData.sii).toBeUndefined();
  });
});

describe('useFiscalMonitor — tbai profile', () => {
  beforeEach(() => {
    detectProfile.mockReturnValue('tbai');
    mockApiFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(SII_CFG_RESP) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(TBAI_CFG_RESP) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(VF_CFG_RESP) })
      // total count
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ response: { totalRows: 20 } }) })
      // 4 fetchCountByCriteria (received, rejected, error, pending)
      .mockResolvedValue({ ok: true, json: () => Promise.resolve(COUNT_5_RESP) });
  });

  it('loads tbai counts', async () => {
    const { result } = renderHook(() => useFiscalMonitor(ORG, API));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.profile).toBe('tbai');
    expect(result.current.monitorData.tbai).toBeDefined();
    expect(result.current.monitorData.tbai.totalCount).toBe(20);
    expect(result.current.monitorData.sii).toBeUndefined();
  });
});

describe('useFiscalMonitor — error handling', () => {
  it('treats config fetch failure as unconfigured (errors are silenced per design)', async () => {
    // fetchConfigRecord catches all errors and returns null — missing modules must not
    // crash the fiscal monitor, so config failures resolve as profile='unconfigured'.
    mockApiFetch.mockResolvedValue({ ok: false, status: 500 });
    const { result } = renderHook(() => useFiscalMonitor(ORG, API));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.profile).toBe('unconfigured');
    expect(result.current.error).toBeNull();
  });
});

describe('useFiscalMonitor — sii+tbai profile', () => {
  beforeEach(() => {
    detectProfile.mockReturnValue('sii+tbai');
    mockApiFetch
      // Config fetches (3 parallel)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(SII_CFG_RESP) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(TBAI_CFG_RESP) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(VF_CFG_RESP) })
      // fetchSiiParentId
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(SII_ORG_RESP) })
      // fetchCount x4 for sii
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(COUNT_10_RESP) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(COUNT_5_RESP) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(COUNT_10_RESP) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(COUNT_5_RESP) })
      // tbai: total + 4 criteria counts
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ response: { totalRows: 8 } }) })
      .mockResolvedValue({ ok: true, json: () => Promise.resolve(COUNT_5_RESP) });
  });

  it('loads both sii and tbai data', async () => {
    const { result } = renderHook(() => useFiscalMonitor(ORG, API));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.profile).toBe('sii+tbai');
    expect(result.current.monitorData.sii).toBeDefined();
    expect(result.current.monitorData.tbai).toBeDefined();
    expect(result.current.monitorData.verifactu).toBeUndefined();
  });

  it('populates kpis for both sii and tbai', async () => {
    const { result } = renderHook(() => useFiscalMonitor(ORG, API));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.kpis.sii).toBeDefined();
    expect(result.current.kpis.tbai).toBeDefined();
  });
});

describe('useFiscalMonitor — sii-navarra profile', () => {
  it('loads sii data for sii-navarra profile', async () => {
    detectProfile.mockReturnValue('sii-navarra');
    mockApiFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(SII_CFG_RESP) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(TBAI_CFG_RESP) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(VF_CFG_RESP) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(SII_ORG_RESP) })
      .mockResolvedValue({ ok: true, json: () => Promise.resolve(COUNT_10_RESP) });
    const { result } = renderHook(() => useFiscalMonitor(ORG, API));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.profile).toBe('sii-navarra');
    expect(result.current.monitorData.sii).toBeDefined();
    expect(result.current.monitorData.tbai).toBeUndefined();
    expect(result.current.monitorData.verifactu).toBeUndefined();
  });
});

describe('useFiscalMonitor — refetch', () => {
  it('exposes a refetch function that re-loads data', async () => {
    detectProfile.mockReturnValue('unconfigured');
    mockApiFetch
      .mockResolvedValue({ ok: true, json: () => Promise.resolve(EMPTY_RESP) });
    const { result } = renderHook(() => useFiscalMonitor(ORG, API));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const callsBefore = mockApiFetch.mock.calls.length;
    await act(async () => { await result.current.refetch(); });
    expect(mockApiFetch.mock.calls.length).toBeGreaterThan(callsBefore);
  });
});
