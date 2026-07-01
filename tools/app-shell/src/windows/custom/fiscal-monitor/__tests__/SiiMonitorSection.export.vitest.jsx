// Integration tests for the SiiMonitorSection CSV export button.
// Uses mockRows={[]} to bypass real API calls and put the component in a stable state.

// Stable function reference — prevents useEffect from re-firing on every render.
const mockApiFetch = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ response: { data: [] } }),
  })
);

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useLocale: () => ({ genericLabels: {}, statuses: {} }),
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));
vi.mock('lucide-react', () => ({
  FileUp: () => null,
  FileDown: () => null,
  TriangleAlert: () => null,
  ArrowUpRight: () => null,
}));
vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: () => mockApiFetch,
}));
vi.mock('@/components/related-documents/helpers.js', () => ({
  neoBase: () => 'http://test.local',
}));
vi.mock('@/lib/formatAmount.js', () => ({
  formatAmount: (n) => String(n ?? ''),
}));
vi.mock('@/components/ui/checkbox', () => ({
  Checkbox: () => null,
}));
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }) => children,
  TooltipContent: ({ children }) => children,
  TooltipProvider: ({ children }) => children,
  TooltipTrigger: ({ children }) => children,
}));
vi.mock('./useFiscalMonitor.js', () => ({
  SII_SPEC: 'sii-spec',
  SII_EMITIDAS_ENTITY: 'issuedInvoices',
  SII_RECIBIDAS_ENTITY: 'receivedInvoices',
  SII_EMITIDAS_ANT_ENTITY: 'issuedPreviousInvoices',
  SII_RECIBIDAS_ANT_ENTITY: 'receivedPreviousInvoices',
  TBAI_SPEC: 'tbai-spec',
  TBAI_ENTITY: 'tbaiEntity',
  VF_SPEC: 'vf-spec',
  VF_ACEPTADAS_ENTITY: 'vfAccepted',
  VF_PARCIAL_ENTITY: 'vfPartial',
  VF_RECHAZADAS_ENTITY: 'vfRejected',
  VF_INVALIDAS_ENTITY: 'vfInvalid',
}));

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SiiMonitorSection from '../SiiMonitorSection.jsx';

function suppressDownload() {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const origCreate = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag) => {
    const el = origCreate(tag);
    if (tag === 'a') vi.spyOn(el, 'click').mockImplementation(() => {});
    return el;
  });
}

const DEFAULT_PROPS = {
  apiBaseUrl: 'http://test.local',
  parentId: 'PARENT-001',
  kpis: {},
  mockRows: [],
};

describe('SiiMonitorSection — export button rendering', () => {
  it('renders the export button', () => {
    render(<SiiMonitorSection {...DEFAULT_PROPS} />);
    expect(screen.getByRole('button', { name: /fiscalMonitor\.export/ })).toBeInTheDocument();
  });

  it('export button is enabled when loading is complete (mockRows bypasses API)', async () => {
    render(<SiiMonitorSection {...DEFAULT_PROPS} />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /fiscalMonitor\.export/ })).not.toBeDisabled();
    });
  });

  it('renders tab buttons for issued and received in standard mode', () => {
    render(<SiiMonitorSection {...DEFAULT_PROPS} />);
    expect(screen.getByTestId('fm-tabs')).toBeInTheDocument();
  });

  it('does not render tab area in compact mode', () => {
    render(<SiiMonitorSection {...DEFAULT_PROPS} compact />);
    expect(screen.queryByTestId('fm-tabs')).toBeNull();
  });
});

describe('SiiMonitorSection — export button interaction', () => {
  beforeEach(suppressDownload);
  afterEach(() => vi.restoreAllMocks());

  it('clicking the export button does not throw', async () => {
    render(<SiiMonitorSection {...DEFAULT_PROPS} />);
    const btn = await screen.findByRole('button', { name: /fiscalMonitor\.export/ });
    await expect(userEvent.click(btn)).resolves.toBeUndefined();
  });

  it('clicking export triggers a file download (URL.createObjectURL called)', async () => {
    render(<SiiMonitorSection {...DEFAULT_PROPS} />);
    const btn = await screen.findByRole('button', { name: /fiscalMonitor\.export/ });
    await userEvent.click(btn);
    await waitFor(() => {
      expect(URL.createObjectURL).toHaveBeenCalled();
    });
  });
});

describe('SiiMonitorSection — period toggle', () => {
  it('renders current and previous period pills', () => {
    render(<SiiMonitorSection {...DEFAULT_PROPS} />);
    const pills = screen.getAllByRole('button');
    const labels = pills.map((b) => b.textContent);
    expect(labels.some((l) => l.includes('fiscalMonitor.sii.period.current'))).toBe(true);
    expect(labels.some((l) => l.includes('fiscalMonitor.sii.period.previous'))).toBe(true);
  });
});
