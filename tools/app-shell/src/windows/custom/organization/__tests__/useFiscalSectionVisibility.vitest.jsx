// @covers tools/app-shell/src/windows/custom/organization/useFiscalSectionVisibility.js
// Which fiscal sections of the Organization window (Certificado digital, Actividades IAE,
// Representante legal / Modelo 390) are shown, from the fiscal models catalog and the
// organization's SII / TicketBAI / VERI*FACTU configuration.

import { renderHook, waitFor, act } from '@testing-library/react';

// The hook composes two readers; both are replaced by mutable stubs so each test sets the exact
// state of each source. `isModelActive` is kept real — it is part of the rule under test.
let catalogState;
let fiscalState;
vi.mock('../../fiscal-models/useFiscalModelsCatalog.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useFiscalModelsCatalog: vi.fn(() => catalogState) };
});
// `useRealFiscalConfig` switches the stub to the real reader (driven through a mocked
// useApiFetch) for the organization-switch tests, which depend on how that reader moves from
// one organization's records to the next.
let useRealFiscalConfig = false;
vi.mock('../../fiscal-config/useFiscalConfig.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useFiscalConfig: vi.fn((...args) => (useRealFiscalConfig ? actual.useFiscalConfig(...args) : fiscalState)),
  };
});
const mockApiFetch = vi.fn();
vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: () => mockApiFetch,
}));

import {
  resolveFiscalSectionVisibility,
  useFiscalSectionVisibility,
  TELEMATIC_MODEL_IDS,
} from '../useFiscalSectionVisibility.js';
import { useFiscalModelsCatalog } from '../../fiscal-models/useFiscalModelsCatalog.js';
import { useFiscalConfig } from '../../fiscal-config/useFiscalConfig.js';

const NOTHING = { showIae: false, show390: false, showCert: false };
const SII_RECORD = { id: 'SII_1' };

function rule(overrides) {
  return resolveFiscalSectionVisibility({ catalogOk: true, fiscalOk: true, ...overrides });
}

describe('resolveFiscalSectionVisibility — catalog models', () => {
  it('shows IAE and the certificate with model 303 active, but not the 390 section', () => {
    expect(rule({ activeModels: { 303: true } })).toEqual({ showIae: true, show390: false, showCert: true });
  });

  it('shows IAE, the 390 section and the certificate with model 390 active', () => {
    expect(rule({ activeModels: { 390: true } })).toEqual({ showIae: true, show390: true, showCert: true });
  });

  it('shows the 390 section only for model 390 — 303 and 349 never turn it on', () => {
    expect(rule({ activeModels: { 303: true, 349: true } }).show390).toBe(false);
    expect(rule({ activeModels: { 303: true, 390: true } }).show390).toBe(true);
  });

  it('shows nothing with only model 349 active (no IAE, no 390, no telematic filing)', () => {
    expect(rule({ activeModels: { 349: true } })).toEqual(NOTHING);
  });

  it('treats an empty catalog {} as no model active', () => {
    expect(rule({ activeModels: {} })).toEqual(NOTHING);
  });

  it('only counts a model whose flag is exactly true (false / "Y" are not active)', () => {
    expect(rule({ activeModels: { 303: false, 390: 'Y' } })).toEqual(NOTHING);
  });

  it('derives the telematic models from the registry flag: 303 and 390, not 349', () => {
    expect([...TELEMATIC_MODEL_IDS].sort()).toEqual(['303', '390']);
  });
});

describe('resolveFiscalSectionVisibility — SII / TicketBAI / VERI*FACTU', () => {
  it.each([
    ['SII', { siiRecord: SII_RECORD }],
    ['TicketBAI', { tbaiRecord: { id: 'TBAI_1' } }],
    ['VERI*FACTU', { verifactuRecord: { id: 'VF_1' } }],
  ])('shows only the certificate with %s active and no model', (_name, records) => {
    expect(rule({ activeModels: {}, ...records })).toEqual({ showIae: false, show390: false, showCert: true });
  });

  it('shows the certificate with model 349 plus an active fiscal system', () => {
    expect(rule({ activeModels: { 349: true }, siiRecord: SII_RECORD }))
      .toEqual({ showIae: false, show390: false, showCert: true });
  });
});

describe('resolveFiscalSectionVisibility — fail closed', () => {
  it('hides every catalog-driven section when the catalog failed, even with models in it', () => {
    expect(rule({ activeModels: { 303: true, 390: true }, catalogOk: false })).toEqual(NOTHING);
  });

  it('keeps the certificate from an active fiscal system when only the catalog failed', () => {
    expect(rule({ activeModels: { 390: true }, catalogOk: false, siiRecord: SII_RECORD }))
      .toEqual({ showIae: false, show390: false, showCert: true });
  });

  it('ignores the fiscal-config records when that source failed', () => {
    expect(rule({ activeModels: {}, fiscalOk: false, siiRecord: SII_RECORD })).toEqual(NOTHING);
  });

  it('keeps the catalog-driven sections when only the fiscal config failed', () => {
    expect(rule({ activeModels: { 303: true }, fiscalOk: false }))
      .toEqual({ showIae: true, show390: false, showCert: true });
  });

  it('shows nothing when called with no input (every source defaults to not ok)', () => {
    expect(resolveFiscalSectionVisibility()).toEqual(NOTHING);
    expect(resolveFiscalSectionVisibility({ activeModels: { 390: true }, siiRecord: SII_RECORD })).toEqual(NOTHING);
  });
});

describe('useFiscalSectionVisibility', () => {
  const API = '/sws/neo/organization';
  const settledCatalog = (activeModels, extra = {}) => ({ activeModels, loaded: true, error: null, ...extra });
  const settledFiscal = (extra = {}) => ({
    loading: false, error: null, profile: 'unconfigured',
    siiRecord: null, tbaiRecord: null, verifactuRecord: null, ...extra,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads both sources for the given organization and spec URL', () => {
    catalogState = settledCatalog({});
    fiscalState = settledFiscal();
    renderHook(() => useFiscalSectionVisibility('ORG_1', API));

    expect(useFiscalModelsCatalog).toHaveBeenCalledWith(API);
    expect(useFiscalConfig).toHaveBeenCalledWith('ORG_1', API);
  });

  it('shows nothing and reports loading while both sources are still loading', () => {
    catalogState = { activeModels: {}, loaded: false, error: null };
    fiscalState = { loading: true, error: null, profile: null, siiRecord: null, tbaiRecord: null, verifactuRecord: null };
    const { result } = renderHook(() => useFiscalSectionVisibility('ORG_1', API));

    expect(result.current).toEqual({ ...NOTHING, loading: true });
  });

  it('treats a fiscal config that has not started (loading false, profile null) as still loading', () => {
    catalogState = settledCatalog({});
    fiscalState = { loading: false, error: null, profile: null, siiRecord: SII_RECORD, tbaiRecord: null, verifactuRecord: null };
    const { result } = renderHook(() => useFiscalSectionVisibility('ORG_1', API));

    expect(result.current.loading).toBe(true);
    expect(result.current.showCert).toBe(false);
  });

  it('settles with the resolved visibility once both sources answer', () => {
    catalogState = settledCatalog({ 390: true });
    fiscalState = settledFiscal();
    const { result } = renderHook(() => useFiscalSectionVisibility('ORG_1', API));

    expect(result.current).toEqual({ showIae: true, show390: true, showCert: true, loading: false });
  });

  it('shows the certificate from an active SII record once the fiscal config settles', () => {
    catalogState = settledCatalog({});
    fiscalState = settledFiscal({ profile: 'sii', siiRecord: SII_RECORD });
    const { result } = renderHook(() => useFiscalSectionVisibility('ORG_1', API));

    expect(result.current).toEqual({ showIae: false, show390: false, showCert: true, loading: false });
  });

  it('fails closed on a catalog error: catalog sections hidden, loading finished', () => {
    catalogState = settledCatalog({ 390: true }, { error: new Error('HTTP 500') });
    fiscalState = settledFiscal();
    const { result } = renderHook(() => useFiscalSectionVisibility('ORG_1', API));

    expect(result.current).toEqual({ ...NOTHING, loading: false });
  });

  it('fails closed on a fiscal-config error: its certificate is hidden, loading finished', () => {
    catalogState = settledCatalog({});
    fiscalState = settledFiscal({ profile: null, error: 'boom', siiRecord: SII_RECORD });
    const { result } = renderHook(() => useFiscalSectionVisibility('ORG_1', API));

    expect(result.current).toEqual({ ...NOTHING, loading: false });
  });
});

describe('useFiscalSectionVisibility — switching organization', () => {
  const API = '/sws/neo/organization';
  const ok = (rows) => Promise.resolve({ ok: true, status: 200, json: async () => ({ response: { data: rows } }) });
  const failed = () => Promise.resolve({ ok: false, status: 500, json: async () => ({}) });

  // ORG_1 has an active SII configuration; nothing else for either organization.
  function respondFor(org2) {
    mockApiFetch.mockImplementation((url) => {
      if (url.includes('organization=ORG_2')) return org2(url);
      if (url.startsWith('/sii-config/')) return ok([{ id: 'SII_1', active: true }]);
      return ok([]);
    });
  }

  function renderTracked() {
    const renders = [];
    const view = renderHook(({ orgId }) => {
      const value = useFiscalSectionVisibility(orgId, API);
      renders.push({ orgId, ...value });
      return value;
    }, { initialProps: { orgId: 'ORG_1' } });
    return { ...view, renders };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockApiFetch.mockReset();
    useRealFiscalConfig = true;
    catalogState = { activeModels: {}, loaded: true, error: null };
  });

  afterEach(() => {
    useRealFiscalConfig = false;
  });

  it('reads the fiscal config of the new organization', async () => {
    respondFor(() => ok([]));
    const { result, rerender } = renderTracked();
    await waitFor(() => expect(result.current.showCert).toBe(true));

    rerender({ orgId: 'ORG_2' });

    expect(useFiscalConfig).toHaveBeenLastCalledWith('ORG_2', API);
    await waitFor(() => expect(mockApiFetch.mock.calls.some(([url]) => url.includes('organization=ORG_2'))).toBe(true));
  });

  it('never shows the previous organization\'s certificate while the new one loads', async () => {
    let releaseOrg2;
    const org2Pending = new Promise((r) => { releaseOrg2 = r; });
    respondFor(() => org2Pending.then(() => ok([])));
    const { result, rerender, renders } = renderTracked();
    await waitFor(() => expect(result.current.showCert).toBe(true));

    const switchedAt = renders.length;
    rerender({ orgId: 'ORG_2' });

    const whileLoading = renders.slice(switchedAt);
    expect(whileLoading.length).toBeGreaterThan(0);
    expect(whileLoading.every((r) => r.orgId === 'ORG_2' && r.showCert === false)).toBe(true);
    expect(result.current.loading).toBe(true);

    await act(async () => { releaseOrg2(); await org2Pending; });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.showCert).toBe(false);
  });

  it('keeps ignoring the previous organization\'s records when the new one fails to load', async () => {
    respondFor(() => failed());
    const { result, rerender, renders } = renderTracked();
    await waitFor(() => expect(result.current.showCert).toBe(true));

    const switchedAt = renders.length;
    rerender({ orgId: 'ORG_2' });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current).toEqual({ ...NOTHING, loading: false });
    expect(renders.slice(switchedAt).every((r) => r.showCert === false)).toBe(true);
  });
});
