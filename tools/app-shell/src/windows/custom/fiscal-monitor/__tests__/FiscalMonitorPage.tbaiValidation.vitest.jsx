// Vitest render test: FiscalMonitorPage must thread tbaiValidationResults from
// useFiscalMonitor through to TbaiMonitorSection as the `validationResults` prop
// (standalone tbai profile), so the section can join error reasons.

const stableApiFetch = vi.fn(() => Promise.resolve({ ok: true, json: async () => ({ response: { data: [] } }) }));

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));
vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ selectedOrg: { id: 'org-1', name: 'TestOrg' } }),
}));
vi.mock('@/auth/useApiFetch.js', () => ({ useApiFetch: () => stableApiFetch }));
vi.mock('@/components/related-documents/helpers.js', () => ({ neoBase: (u) => u }));
vi.mock('@/components/layout/PageMetaContext', () => ({ useSetPageMeta: vi.fn() }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('../../fiscal-config/useCertExpiry.js', () => ({
  useCertExpiry: () => ({ daysLeft: null }),
}));
vi.mock('../../fiscal-config/CertExpiryBanner.jsx', () => ({
  default: () => null,
}));

const MOCK_VALIDATION_RESULTS = [{ tbaiSyncinvoiceID: 't1', codigo: '5040', descripcion: 'mock reason' }];

vi.mock('../useFiscalMonitor.js', () => ({
  useFiscalMonitor: () => ({
    loading: false,
    error: null,
    profile: 'tbai',
    kpis: { tbai: { total: 1, received: 0, rejected: 1, error: 0, pending: 0 } },
    siiParentId: null,
    tbaiValidationResults: MOCK_VALIDATION_RESULTS,
    refetch: vi.fn(),
  }),
  SII_SPEC: 'sii-monitor', SII_EMITIDAS_ENTITY: 'a', SII_RECIBIDAS_ENTITY: 'b',
  SII_EMITIDAS_ANT_ENTITY: 'c', SII_RECIBIDAS_ANT_ENTITY: 'd',
  VF_SPEC: 'vf', VF_ACEPTADAS_ENTITY: 'e', VF_PARCIAL_ENTITY: 'f',
  VF_RECHAZADAS_ENTITY: 'g', VF_INVALIDAS_ENTITY: 'h',
  TBAI_SPEC: 'tbai', TBAI_ENTITY: 'i',
}));
vi.mock('../useDebugMode.js', () => ({ useDebugMode: () => false }));
vi.mock('../fiscalMonitor.utils.js', () => ({ computeKpis: () => ({}) }));
vi.mock('../fiscalMonitorMockData.js', () => ({
  MOCK_MONITOR_DATA: {},
  MOCK_SII_ROWS: [],
  MOCK_TBAI_ROWS: [],
  MOCK_VF_ROWS: [],
  MOCK_TBAI_VALIDATION_RESULTS: [],
}));
vi.mock('../SiiMonitorSection.jsx', () => ({ default: () => <div data-testid="sii-section" /> }));
vi.mock('../TbaiMonitorSection.jsx', () => ({
  default: (props) => (
    <div
      data-testid="tbai-section"
      data-validation-count={props.validationResults?.length ?? -1}
    />
  ),
}));
vi.mock('../VerifactuMonitorSection.jsx', () => ({ default: () => <div data-testid="verifactu-section" /> }));
vi.mock('../FiscalMonitorDebugPanel.jsx', () => ({ default: () => <div data-testid="debug-panel" /> }));
vi.mock('../../shared/InvoicePreviewModal.jsx', () => ({ default: () => <div data-testid="invoice-preview" /> }));
vi.mock('../ContactDetailModal.jsx', () => ({ default: () => <div data-testid="contact-detail" /> }));
vi.mock('../fiscal-monitor.css', () => ({}));

import { render, screen, waitFor } from '@testing-library/react';
import FiscalMonitorPage from '../FiscalMonitorPage.jsx';

const baseProps = { token: 'test-token', apiBaseUrl: '/sws/neo/fiscal-monitor' };

describe('FiscalMonitorPage — tbaiValidationResults passthrough (standalone tbai profile)', () => {
  it('passes validationResults (length matching tbaiValidationResults) to TbaiMonitorSection', async () => {
    render(<FiscalMonitorPage {...baseProps} />);
    await waitFor(() => {
      expect(screen.getByTestId('tbai-section')).toBeInTheDocument();
    });
    expect(screen.getByTestId('tbai-section').getAttribute('data-validation-count')).toBe('1');
  });
});
