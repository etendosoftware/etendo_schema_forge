// Vitest render tests for FiscalMonitorPage

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
vi.mock('../useFiscalMonitor.js', () => ({
  useFiscalMonitor: () => ({
    loading: false,
    error: null,
    profile: 'sii',
    kpis: { sii: { issued: 2, received: 1, issuedPrevious: 0, receivedPrevious: 0 } },
    siiParentId: 'parent-1',
    refetch: vi.fn(),
  }),
  SII_SPEC: 'sii-monitor',
  SII_EMITIDAS_ENTITY: 'a',
  SII_RECIBIDAS_ENTITY: 'b',
  SII_EMITIDAS_ANT_ENTITY: 'c',
  SII_RECIBIDAS_ANT_ENTITY: 'd',
  VF_SPEC: 'vf',
  VF_ACEPTADAS_ENTITY: 'e',
  VF_PARCIAL_ENTITY: 'f',
  VF_RECHAZADAS_ENTITY: 'g',
  VF_INVALIDAS_ENTITY: 'h',
  TBAI_SPEC: 'tbai',
  TBAI_ENTITY: 'i',
}));
vi.mock('../useDebugMode.js', () => ({
  useDebugMode: () => false,
}));
vi.mock('../fiscalMonitor.utils.js', () => ({
  computeKpis: () => ({}),
}));
vi.mock('../fiscalMonitorMockData.js', () => ({
  MOCK_MONITOR_DATA: {},
  MOCK_SII_ROWS: [],
  MOCK_TBAI_ROWS: [],
  MOCK_VF_ROWS: [],
}));
vi.mock('../SiiMonitorSection.jsx', () => ({
  default: (props) => <div data-testid="sii-section" data-parent={props.parentId} />,
}));
vi.mock('../TbaiMonitorSection.jsx', () => ({
  default: () => <div data-testid="tbai-section" />,
}));
vi.mock('../VerifactuMonitorSection.jsx', () => ({
  default: () => <div data-testid="verifactu-section" />,
}));
vi.mock('../FiscalMonitorDebugPanel.jsx', () => ({
  default: () => <div data-testid="debug-panel" />,
}));
vi.mock('../../shared/InvoicePreviewModal.jsx', () => ({
  default: () => <div data-testid="invoice-preview" />,
}));
vi.mock('../../shared/PdfViewer.jsx', () => ({
  default: () => <div data-testid="pdf-viewer" />,
}));
vi.mock('react-pdf', () => ({
  Document: () => null,
  Page: () => null,
  pdfjs: { GlobalWorkerOptions: {} },
}));
vi.mock('../ContactDetailModal.jsx', () => ({
  default: () => <div data-testid="contact-detail" />,
}));
vi.mock('../fiscal-monitor.css', () => ({}));

import { render, screen, waitFor } from '@testing-library/react';
import FiscalMonitorPage from '../FiscalMonitorPage.jsx';

const baseProps = {
  token: 'test-token',
  apiBaseUrl: '/sws/neo/fiscal-monitor',
};

describe('FiscalMonitorPage', () => {
  it('renders SII section for sii profile', async () => {
    render(<FiscalMonitorPage {...baseProps} />);
    await waitFor(() => {
      expect(screen.getByTestId('sii-section')).toBeInTheDocument();
    });
  });

  it('does not render debug panel when debug mode is off', async () => {
    render(<FiscalMonitorPage {...baseProps} />);
    await waitFor(() => {
      expect(screen.getByTestId('sii-section')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('debug-panel')).toBeNull();
  });

  it('does not render tbai or verifactu sections for sii profile', async () => {
    render(<FiscalMonitorPage {...baseProps} />);
    await waitFor(() => {
      expect(screen.getByTestId('sii-section')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('tbai-section')).toBeNull();
    expect(screen.queryByTestId('verifactu-section')).toBeNull();
  });

  it('passes siiParentId to SiiMonitorSection', async () => {
    render(<FiscalMonitorPage {...baseProps} />);
    await waitFor(() => {
      expect(screen.getByTestId('sii-section')).toBeInTheDocument();
    });
    expect(screen.getByTestId('sii-section').getAttribute('data-parent')).toBe('parent-1');
  });
});
