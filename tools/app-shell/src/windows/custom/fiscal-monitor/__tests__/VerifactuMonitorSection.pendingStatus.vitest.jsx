// Regression: the VERI*FACTU 'PE' raw code must resolve to the Verifactu pending
// entry, never to the same-letter SII 'PE' entry in FmPrimitives' STATUS_CONFIG.
// The section used to keep its own copy of the code -> key map without a 'PE'
// entry, so 'PE' leaked through raw and collided with the SII key (ETP-5027).
// FmPrimitives is deliberately NOT mocked here: the whole point is to exercise
// the real StatusPill key lookup.

const stableApiFetch = vi.hoisted(() => vi.fn());

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));
vi.mock('@/auth/useApiFetch.js', () => ({ useApiFetch: () => stableApiFetch }));
vi.mock('@/components/related-documents/helpers.js', () => ({ neoBase: (u) => u }));
vi.mock('lucide-react', () => ({
  TriangleAlert: () => null,
  ArrowUpRight: () => null,
}));
vi.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({ checked, onChange }) => (
    <input type="checkbox" checked={!!checked} onChange={onChange ?? (() => {})} />
  ),
}));
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }) => children,
  TooltipContent: ({ children }) => children,
  TooltipProvider: ({ children }) => children,
  TooltipTrigger: ({ children }) => children,
}));
vi.mock('../useFiscalMonitor.js', () => ({
  VF_SPEC: 'monitor-verifactu',
  VF_ACEPTADAS_ENTITY: 'facturasAceptadas',
  VF_PARCIAL_ENTITY: 'facturasParcialmenteAceptadas',
  VF_RECHAZADAS_ENTITY: 'facturasRechazadas',
  VF_INVALIDAS_ENTITY: 'facturasInvalidas',
}));

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VerifactuMonitorSection from '../VerifactuMonitorSection.jsx';

// jsdom has no IntersectionObserver; ScrollSentinel (real FmPrimitives) needs one.
globalThis.IntersectionObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

import { mapVfStatus, VF_STATUS_MAP } from '../../shared/useFiscalStatus.js';

const PENDING_ROW = {
  id: 'vf-pe-1',
  verifactuSendingStatus: 'PE',
  cSV: 'CSV-PE-1',
  'invoice$documentNo': 'INV-PE-1',
  typeOperation: 'F1',
};

// The API path is used instead of `mockRows` on purpose: with `mockRows` the
// synchronous data-load effect is overridden by the tab-reset effect in the same
// React batch (same note as VerifactuMonitorSection.vitest.jsx).
const baseProps = {
  orgId: 'org-1',
  apiBaseUrl: '/sws/neo/verifactu',
  kpis: { verifactu: { accepted: 0, partiallyAccepted: 0, rejected: 0, invalid: 0 } },
  initialTab: 'problems',
};

// fetchProblems fans out to 3 endpoints; only the invalid one returns the PE row.
function setupFetch() {
  stableApiFetch.mockImplementation((url) =>
    Promise.resolve({
      ok: true,
      json: async () => ({
        response: url.includes('facturasInvalidas')
          ? { data: [PENDING_ROW], totalRows: 1 }
          : { data: [], totalRows: 0 },
      }),
    }),
  );
}

describe('VerifactuMonitorSection — PE status mapping', () => {
  beforeEach(setupFetch);

  it('uses the canonical shared map (single source of truth)', () => {
    expect(mapVfStatus('PE')).toBe('vf_pending');
    expect(VF_STATUS_MAP.PE).toBe('vf_pending');
  });

  it('renders a PE row with the Verifactu pending label, not the SII PE label', async () => {
    render(<VerifactuMonitorSection {...baseProps} />);
    const pill = await screen.findByTestId('status-pill');
    expect(pill).toHaveTextContent('fiscalMonitor.status.vf.pending');
    expect(pill.textContent).not.toContain('fiscalMonitor.status.sii.PE');
    expect(pill.textContent).not.toBe('PE');
  });
});

describe('VerifactuMonitorSection — PE status in the CSV export', () => {
  let csvText;

  beforeEach(() => {
    setupFetch();
    csvText = null;
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      csvText = blob;
      return 'blob:mock';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = origCreate(tag);
      if (tag === 'a') vi.spyOn(el, 'click').mockImplementation(() => {});
      return el;
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it('exports the mapped key instead of the bare PE code', async () => {
    render(<VerifactuMonitorSection {...baseProps} />);
    await screen.findByTestId('status-pill');
    const btn = await screen.findByRole('button', { name: /fiscalMonitor\.export/ });
    await userEvent.click(btn);
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
    const text = await csvText.text();
    expect(text).toContain('"vf_pending"');
    expect(text).not.toContain('"PE"');
  });
});
