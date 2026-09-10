// Real-locale breadcrumb regression coverage (ETP-4945).
//
// FiscalMonitorPage.jsx used to build a 4-segment breadcrumb
// (`${ui('settings')} / ${ui('fiscal.monitor.nav')} / ${ui('fiscalMonitor.systemFiscal')} / ${PROFILE_LABELS[profile]}`)
// rooted under "Configuración" instead of "Finanzas". The fix collapsed it to
// `${ui('finance')} / ${ui('fiscal.monitor.nav')}`. Since this is a template
// literal (not a pure exported helper), the sibling
// FiscalMonitorPage.vitest.jsx's identity `useUI` mock (`(key) => key`) can't
// catch a real-locale regression — this file renders with `useUI` backed by
// the real dictionary and captures the useSetPageMeta call, same pattern as
// windows/custom/financial-account/__tests__/index.vitest.jsx.
import { render, waitFor, screen } from '@testing-library/react';
import { loadLocaleDictionary, makeRealUI } from '../../shared/__tests__/testUtils/realLocaleUI.js';

const esES = loadLocaleDictionary('es_ES');
const enUS = loadLocaleDictionary('en_US');
const realUiEs = makeRealUI(esES);
const realUiEn = makeRealUI(enUS);

let activeUi = realUiEs;

const stableApiFetch = vi.fn(() => Promise.resolve({ ok: true, json: async () => ({ response: { data: [] } }) }));

vi.mock('@/i18n', () => ({ useUI: () => activeUi }));
vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ selectedOrg: { id: 'org-1', name: 'TestOrg' } }),
}));
vi.mock('@/auth/useApiFetch.js', () => ({ useApiFetch: () => stableApiFetch }));
vi.mock('@/components/related-documents/helpers.js', () => ({ neoBase: (u) => u }));

const setMetaMock = vi.fn();
vi.mock('@/components/layout/PageMetaContext', () => ({
  useSetPageMeta: (meta) => setMetaMock(meta),
}));

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
    tbaiValidationResults: [],
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
  MOCK_TBAI_VALIDATION_RESULTS: [],
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

import FiscalMonitorPage from '../FiscalMonitorPage.jsx';

const baseProps = {
  token: 'test-token',
  apiBaseUrl: '/sws/neo/fiscal-monitor',
};

beforeEach(() => {
  setMetaMock.mockClear();
});

describe('FiscalMonitorPage — breadcrumb against the real locale dictionary (ETP-4945)', () => {
  it('resolves the es_ES breadcrumb to the 2-segment "Finanzas / Monitor fiscal" (not the stale 4-level "Configuración / Monitor de facturas / Sistema fiscal activo / SII")', async () => {
    activeUi = realUiEs;
    render(<FiscalMonitorPage {...baseProps} />);
    await waitFor(() => {
      expect(screen.getByTestId('sii-section')).toBeInTheDocument();
    });

    const lastCall = setMetaMock.mock.calls.at(-1)[0];
    expect(lastCall.breadcrumb).toBe('Finanzas / Monitor fiscal');
    expect(lastCall.breadcrumb.split(' / ')).toHaveLength(2);
  });

  it('resolves the en_US breadcrumb to "Finance / Fiscal Monitor"', async () => {
    activeUi = realUiEn;
    render(<FiscalMonitorPage {...baseProps} />);
    await waitFor(() => {
      expect(screen.getByTestId('sii-section')).toBeInTheDocument();
    });

    const lastCall = setMetaMock.mock.calls.at(-1)[0];
    expect(lastCall.breadcrumb).toBe('Finance / Fiscal Monitor');
  });
});
