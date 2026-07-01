// Integration tests for the VerifactuMonitorSection CSV export button.
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
  TriangleAlert: () => null,
  ArrowUpRight: () => null,
}));
vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: () => mockApiFetch,
}));
vi.mock('@/components/related-documents/helpers.js', () => ({
  neoBase: () => 'http://test.local',
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
import VerifactuMonitorSection from '../VerifactuMonitorSection.jsx';

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
  orgId: 'ORG-001',
  apiBaseUrl: 'http://test.local',
  kpis: {},
  mockRows: [],
};

describe('VerifactuMonitorSection — export button rendering', () => {
  it('renders the export button', () => {
    render(<VerifactuMonitorSection {...DEFAULT_PROPS} />);
    expect(screen.getByRole('button', { name: /fiscalMonitor\.export/ })).toBeInTheDocument();
  });

  it('export button is enabled after mockRows clears loading state', async () => {
    render(<VerifactuMonitorSection {...DEFAULT_PROPS} />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /fiscalMonitor\.export/ })).not.toBeDisabled();
    });
  });

  it('renders correct and problems filter pills', () => {
    render(<VerifactuMonitorSection {...DEFAULT_PROPS} />);
    const buttons = screen.getAllByRole('button');
    const labels = buttons.map((b) => b.textContent);
    expect(labels.some((l) => l.includes('fiscalMonitor.verifactu.pill.correct'))).toBe(true);
    expect(labels.some((l) => l.includes('fiscalMonitor.verifactu.pill.problems'))).toBe(true);
  });

  it('correct pill is active by default', () => {
    render(<VerifactuMonitorSection {...DEFAULT_PROPS} />);
    const correctPill = screen.getByRole('button', {
      name: /fiscalMonitor\.verifactu\.pill\.correct/,
    });
    expect(correctPill.className).toContain('active');
  });
});

describe('VerifactuMonitorSection — export button interaction (correct tab)', () => {
  beforeEach(suppressDownload);
  afterEach(() => vi.restoreAllMocks());

  it('clicking export on the correct tab does not throw', async () => {
    render(<VerifactuMonitorSection {...DEFAULT_PROPS} />);
    const btn = await screen.findByRole('button', { name: /fiscalMonitor\.export/ });
    await expect(userEvent.click(btn)).resolves.toBeUndefined();
  });

  it('clicking export on the correct tab triggers a file download (URL.createObjectURL called)', async () => {
    render(<VerifactuMonitorSection {...DEFAULT_PROPS} />);
    const btn = await screen.findByRole('button', { name: /fiscalMonitor\.export/ });
    await userEvent.click(btn);
    await waitFor(() => {
      expect(URL.createObjectURL).toHaveBeenCalled();
    });
  });
});

describe('VerifactuMonitorSection — export button interaction (problems tab)', () => {
  beforeEach(suppressDownload);
  afterEach(() => vi.restoreAllMocks());

  it('clicking export on the problems tab uses client-side buildCsvAndDownload (URL.createObjectURL called)', async () => {
    render(<VerifactuMonitorSection {...DEFAULT_PROPS} initialTab="problems" />);
    const problemsPill = await screen.findByRole('button', {
      name: /fiscalMonitor\.verifactu\.pill\.problems/,
    });
    await userEvent.click(problemsPill);
    const btn = await screen.findByRole('button', { name: /fiscalMonitor\.export/ });
    await userEvent.click(btn);
    await waitFor(() => {
      expect(URL.createObjectURL).toHaveBeenCalled();
    });
  });
});

describe('VerifactuMonitorSection — tab switching', () => {
  it('clicking the problems pill makes it active', async () => {
    render(<VerifactuMonitorSection {...DEFAULT_PROPS} />);
    const problemsPill = await screen.findByRole('button', {
      name: /fiscalMonitor\.verifactu\.pill\.problems/,
    });
    await userEvent.click(problemsPill);
    expect(problemsPill.className).toContain('active');
  });
});
