// @covers tools/app-shell/src/windows/custom/organization/useFiscalSectionVisibility.js
// Which fiscal sections of the Organization window (Certificado digital, Actividades IAE,
// Representante legal / Modelo 390) are shown, from the fiscal models catalog and the
// organization's SII / TicketBAI / VERI*FACTU configuration.

import { renderHook } from '@testing-library/react';

// The hook composes two readers; both are replaced by mutable stubs so each test sets the exact
// state of each source. `isModelActive` is kept real — it is part of the rule under test.
let catalogState;
let fiscalState;
vi.mock('../../fiscal-models/useFiscalModelsCatalog.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useFiscalModelsCatalog: vi.fn(() => catalogState) };
});
vi.mock('../../fiscal-config/useFiscalConfig.js', () => ({
  useFiscalConfig: vi.fn(() => fiscalState),
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
