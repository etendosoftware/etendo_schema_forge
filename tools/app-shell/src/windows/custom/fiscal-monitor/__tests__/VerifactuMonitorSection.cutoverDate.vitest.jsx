// ETP-5229 #17 — VerifactuMonitorSection's earliestCutoverDate prop threading.
//
// Mirrors the TbaiMonitorSection cutover-date coverage: fetchCorrect (list,
// correct tab), fetchProblems (list, problems tab) and the CSV export handler
// on the correct tab must all attach the SAME `invoiceDate >= earliestCutoverDate`
// criteria (via buildCutoverCriteria(earliestCutoverDate, VF_DATE_FIELD)) as the
// KPI pill counts computed in useFiscalMonitor.js's fetchVerifactuMonitorData —
// and omit it entirely when the prop is null/omitted (default), same as before
// this fix. Mirrors the minimal-mocking style of VerifactuMonitorSection.export.vitest.jsx
// (FmPrimitives.jsx and useFiscalMonitor.js are used for real; only their own
// external dependencies — i18n, lucide-react, tooltip, checkbox — are mocked).

const mockApiFetch = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ response: { data: [], totalRows: 0 } }),
  })
);

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));
vi.mock('@/auth/useApiFetch.js', () => ({ useApiFetch: () => mockApiFetch }));
vi.mock('@/components/related-documents/helpers.js', () => ({ neoBase: (u) => u ?? '' }));
vi.mock('lucide-react', () => ({ TriangleAlert: () => null, ArrowUpRight: () => null }));
vi.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({ checked, onChange }) => <input type="checkbox" checked={!!checked} onChange={onChange ?? (() => {})} />,
}));
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }) => children,
  TooltipContent: ({ children }) => children,
  TooltipProvider: ({ children }) => children,
  TooltipTrigger: ({ children }) => children,
}));

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import VerifactuMonitorSection from '../VerifactuMonitorSection.jsx';
import { VF_ACEPTADAS_ENTITY, VF_PARCIAL_ENTITY, VF_RECHAZADAS_ENTITY, VF_INVALIDAS_ENTITY } from '../useFiscalMonitor.js';

const baseProps = {
  orgId: 'org-1',
  apiBaseUrl: '/sws/neo/verifactu',
  kpis: { verifactu: { accepted: 0, partiallyAccepted: 0, rejected: 0, invalid: 0 } },
};

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

function callsMatching(entity) {
  return mockApiFetch.mock.calls
    .map(([url]) => url)
    .filter((url) => typeof url === 'string' && url.includes(encodeURIComponent(entity)));
}

beforeEach(() => {
  mockApiFetch.mockClear();
});

describe('VerifactuMonitorSection — correct tab (fetchCorrect) cutover criteria', () => {
  it('attaches invoiceDate >= earliestCutoverDate criteria when the prop is set', async () => {
    render(<VerifactuMonitorSection {...baseProps} earliestCutoverDate="2025-01-15T00:00:00.000Z" />);
    await waitFor(() => expect(callsMatching(VF_ACEPTADAS_ENTITY).length).toBeGreaterThan(0));

    for (const url of callsMatching(VF_ACEPTADAS_ENTITY)) {
      const params = new URLSearchParams(url.split('?')[1]);
      expect(params.get('criteria')).not.toBeNull();
      const criteria = JSON.parse(params.get('criteria'));
      expect(criteria).toContainEqual({ fieldName: 'invoiceDate', operator: 'greaterOrEqual', value: '2025-01-15' });
    }
  });

  it('omits criteria entirely when earliestCutoverDate is null (default — no regression)', async () => {
    render(<VerifactuMonitorSection {...baseProps} />);
    await waitFor(() => expect(callsMatching(VF_ACEPTADAS_ENTITY).length).toBeGreaterThan(0));

    for (const url of callsMatching(VF_ACEPTADAS_ENTITY)) {
      expect(url).not.toContain('criteria=');
    }
  });

  it('re-fetches when earliestCutoverDate prop changes (dependency array wiring)', async () => {
    const { rerender } = render(<VerifactuMonitorSection {...baseProps} />);
    await waitFor(() => expect(callsMatching(VF_ACEPTADAS_ENTITY).length).toBeGreaterThan(0));
    mockApiFetch.mockClear();

    rerender(<VerifactuMonitorSection {...baseProps} earliestCutoverDate="2025-06-01T00:00:00.000Z" />);
    await waitFor(() => expect(callsMatching(VF_ACEPTADAS_ENTITY).some((url) => url.includes('criteria='))).toBe(true));
  });
});

describe('VerifactuMonitorSection — problems tab (fetchProblems) cutover criteria', () => {
  it('attaches invoiceDate >= earliestCutoverDate criteria to all 3 problem-entity requests', async () => {
    render(
      <VerifactuMonitorSection {...baseProps} initialTab="problems" earliestCutoverDate="2025-01-15T00:00:00.000Z" />
    );
    await waitFor(() => {
      expect(callsMatching(VF_PARCIAL_ENTITY).length).toBeGreaterThan(0);
      expect(callsMatching(VF_RECHAZADAS_ENTITY).length).toBeGreaterThan(0);
      expect(callsMatching(VF_INVALIDAS_ENTITY).length).toBeGreaterThan(0);
    });

    for (const entity of [VF_PARCIAL_ENTITY, VF_RECHAZADAS_ENTITY, VF_INVALIDAS_ENTITY]) {
      for (const url of callsMatching(entity)) {
        const params = new URLSearchParams(url.split('?')[1]);
        const criteria = JSON.parse(params.get('criteria'));
        expect(criteria).toContainEqual({ fieldName: 'invoiceDate', operator: 'greaterOrEqual', value: '2025-01-15' });
      }
    }
  });

  it('omits criteria on all 3 problem-entity requests when earliestCutoverDate is null', async () => {
    render(<VerifactuMonitorSection {...baseProps} initialTab="problems" />);
    await waitFor(() => {
      expect(callsMatching(VF_PARCIAL_ENTITY).length).toBeGreaterThan(0);
      expect(callsMatching(VF_RECHAZADAS_ENTITY).length).toBeGreaterThan(0);
      expect(callsMatching(VF_INVALIDAS_ENTITY).length).toBeGreaterThan(0);
    });

    for (const entity of [VF_PARCIAL_ENTITY, VF_RECHAZADAS_ENTITY, VF_INVALIDAS_ENTITY]) {
      for (const url of callsMatching(entity)) {
        expect(url).not.toContain('criteria=');
      }
    }
  });
});

describe('VerifactuMonitorSection — CSV export (correct tab) cutover criteria', () => {
  beforeEach(suppressDownload);
  afterEach(() => vi.restoreAllMocks());

  it('attaches the same cutover criteria to the export request as the list', async () => {
    render(<VerifactuMonitorSection {...baseProps} earliestCutoverDate="2025-01-15T00:00:00.000Z" mockRows={[]} />);
    const btn = await screen.findByRole('button', { name: /fiscalMonitor\.export/ });
    mockApiFetch.mockClear();
    fireEvent.click(btn);

    await waitFor(() => expect(callsMatching(VF_ACEPTADAS_ENTITY).length).toBeGreaterThan(0));
    for (const url of callsMatching(VF_ACEPTADAS_ENTITY)) {
      const params = new URLSearchParams(url.split('?')[1]);
      const criteria = JSON.parse(params.get('criteria'));
      expect(criteria).toContainEqual({ fieldName: 'invoiceDate', operator: 'greaterOrEqual', value: '2025-01-15' });
    }
  });

  it('omits criteria on export when earliestCutoverDate is null (no regression)', async () => {
    render(<VerifactuMonitorSection {...baseProps} mockRows={[]} />);
    const btn = await screen.findByRole('button', { name: /fiscalMonitor\.export/ });
    mockApiFetch.mockClear();
    fireEvent.click(btn);

    await waitFor(() => expect(callsMatching(VF_ACEPTADAS_ENTITY).length).toBeGreaterThan(0));
    for (const url of callsMatching(VF_ACEPTADAS_ENTITY)) {
      expect(url).not.toContain('criteria=');
    }
  });
});
