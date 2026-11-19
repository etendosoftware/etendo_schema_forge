// Characterization tests for the Payment Out RelatedDocuments document-linking logic.
// They run against the module the window really loads: artifacts/payment-out/custom/
// RelatedDocuments.jsx, through the @generated alias (ETP-5280 removed the dead copy
// that used to live next to this file).
// Mocks must come before imports (Vitest hoisting).

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

const mockApiFetch = vi.fn();
vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: () => mockApiFetch,
}));

vi.mock('@/components/related-documents', () => ({
  // DocChip exposes the clicked target so tests can assert which chips rendered.
  DocChip: vi.fn(({ title, status, onClick }) => (
    <div data-testid="doc-chip" data-title={title} data-status={status} onClick={onClick} />
  )),
  STATUS_KEYS: {},
  CHIP_ICONS: { invoice: 'invoice-icon' },
  CHIP_COLORS: { invoice: 'invoice-color' },
  RelatedDocumentsShell: vi.fn(({ loading, children }) => (
    <div data-testid="rel-docs-shell" data-loading={String(loading)}>
      {children}
    </div>
  )),
  neoBase: vi.fn(() => '/neo'),
  fetchById: vi.fn(),
}));

import { render, screen, waitFor } from '@testing-library/react';
import RelatedDocuments from '@generated/payment-out/custom/RelatedDocuments.jsx';
import { fetchById } from '@/components/related-documents';

const TOKEN = 'tok';
const API = '/api/payment-out';

// Build a fake Response for the lines endpoint.
function linesResponse(lines, { ok = true } = {}) {
  return {
    ok,
    json: async () => ({ response: { data: lines } }),
  };
}

function mockFetchLines(lines, opts) {
  mockApiFetch.mockImplementation(async () => linesResponse(lines, opts));
}

function renderComp(props = {}) {
  return render(
    <RelatedDocuments
      recordId="rec-1"
      data={{}}
      token={TOKEN}
      apiBaseUrl={API}
      {...props}
    />,
  );
}

describe('RelatedDocuments — document linking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. resolves and renders an invoice chip from invoicePaymentSchedule', async () => {
    mockFetchLines([{ invoicePaymentSchedule: 'SCHED1' }]);
    fetchById.mockImplementation(async (spec, entity) => {
      if (entity === 'paymentPlan') return { invoice: 'INV1' };
      if (entity === 'header') return { id: 'INV1', documentStatus: 'CO' };
      return null;
    });

    renderComp();

    const chip = await screen.findByTestId('doc-chip');
    expect(chip).toHaveAttribute('data-title', 'invoiceDoc');
  });

  it('4. dedups: two lines with the same invoicePaymentSchedule fetch the header once', async () => {
    mockFetchLines([
      { invoicePaymentSchedule: 'SCHED1' },
      { invoicePaymentSchedule: 'SCHED1' },
    ]);
    fetchById.mockImplementation(async (spec, entity) => {
      if (entity === 'paymentPlan') return { invoice: 'INV1' };
      if (entity === 'header') return { id: 'INV1' };
      return null;
    });

    renderComp();

    await screen.findByTestId('doc-chip');
    // Exactly one chip rendered.
    expect(screen.getAllByTestId('doc-chip')).toHaveLength(1);
    // Header fetched exactly once.
    const headerCalls = fetchById.mock.calls.filter(([, entity]) => entity === 'header');
    expect(headerCalls).toHaveLength(1);
  });

  it('5. silent catch: a rejecting schedule fetch is swallowed and renders no chips', async () => {
    mockFetchLines([
      { invoicePaymentSchedule: 'BAD' },
      { invoicePaymentSchedule: 'SCHED_OK' },
    ]);
    fetchById.mockImplementation(async (spec, entity, id) => {
      if (entity === 'paymentPlan') {
        if (id === 'BAD') throw new Error('boom');
        return { invoice: 'INV_OK' };
      }
      if (entity === 'header') return { id: 'INV_OK' };
      return null;
    });

    renderComp();

    // The live component resolves the schedules with a single Promise.all, so one
    // failure aborts the batch: it must not throw and must stop loading.
    await waitFor(() => {
      expect(screen.getByTestId('rel-docs-shell')).toHaveAttribute('data-loading', 'false');
    });
    expect(screen.queryByTestId('doc-chip')).not.toBeInTheDocument();
  });

  it('6. renders zero chips when the lines response is not ok', async () => {
    mockFetchLines([], { ok: false });

    renderComp();

    await waitFor(() => {
      expect(screen.getByTestId('rel-docs-shell')).toHaveAttribute('data-loading', 'false');
    });
    expect(screen.queryByTestId('doc-chip')).not.toBeInTheDocument();
    expect(fetchById).not.toHaveBeenCalled();
  });

  it('7. with no recordId: no fetch, not loading, no chips', async () => {
    renderComp({ recordId: undefined });

    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(screen.queryByTestId('doc-chip')).not.toBeInTheDocument();
    expect(screen.getByTestId('rel-docs-shell')).toHaveAttribute('data-loading', 'false');
  });
});
