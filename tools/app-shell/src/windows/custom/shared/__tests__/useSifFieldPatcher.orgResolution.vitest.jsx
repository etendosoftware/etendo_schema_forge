// ETP-5087 follow-up: useSifFieldPatcher must key useFiscalConfig by the
// INVOICE's own org (data.adOrgId), not the top-nav org selector. A mismatch
// used to silently fetch the wrong TBAI/SII config (and territory), leaving
// the SIF tab's editable-field gating and options blind to the real invoice.
//
// Mocks must be declared before any imports that pull in the mocked modules.

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ selectedOrg: { id: 'ORG-SELECTED' } }),
}));

const useFiscalConfigMock = vi.fn(() => ({ profile: 'sii+tbai', tbaiRecord: { etsgSifTerritory: 'BIZKAIA' } }));
vi.mock('@/windows/custom/fiscal-config/useFiscalConfig.js', () => ({
  useFiscalConfig: (...args) => useFiscalConfigMock(...args),
}));

vi.mock('@/windows/custom/fiscal-config/fiscalConfig.utils.js', () => ({
  normalizeDateInputValue: (v) => v ?? '',
}));

import { renderHook } from '@testing-library/react';
import { useSifFieldPatcher } from '../useSifFieldPatcher.js';

function renderPatcher(overrides = {}) {
  const props = {
    data: { documentStatus: 'DR' },
    recordId: 'inv-001',
    apiBaseUrl: '/sws/neo/purchase-invoice',
    onChange: vi.fn(),
    ...overrides,
  };
  return renderHook(() => useSifFieldPatcher(props));
}

describe('useSifFieldPatcher — org resolution (ETP-5087 follow-up)', () => {
  beforeEach(() => {
    useFiscalConfigMock.mockClear();
  });

  it('resolves fiscal config using the invoice record adOrgId, not the top-nav selected org', () => {
    renderPatcher({ data: { documentStatus: 'DR', adOrgId: 'ORG-INVOICE' } });
    expect(useFiscalConfigMock).toHaveBeenCalledWith('ORG-INVOICE', '/sws/neo/purchase-invoice');
  });

  it('falls back to the selected org when the invoice record has no adOrgId', () => {
    renderPatcher({ data: { documentStatus: 'DR' } });
    expect(useFiscalConfigMock).toHaveBeenCalledWith('ORG-SELECTED', '/sws/neo/purchase-invoice');
  });

  it('still resolves showTbai correctly (territory-aware) when the invoice org differs from the selected org', () => {
    const { result } = renderPatcher({ data: { documentStatus: 'DR', adOrgId: 'ORG-INVOICE' } });
    expect(useFiscalConfigMock).toHaveBeenCalledWith('ORG-INVOICE', '/sws/neo/purchase-invoice');
    expect(result.current.showTbai).toBe(true);
    expect(result.current.showSii).toBe(true);
  });
});
