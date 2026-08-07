// Characterization tests for RelatedDocuments document-linking logic.
// These LOCK THE CURRENT BEHAVIOR of fetchLinkedDocuments / resolveLinkedInvoice
// / resolveLinkedOrder (not exported — exercised through the rendered component).
// Mocks must come before imports (Vitest hoisting).

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('@/components/related-documents', () => ({
  // DocChip exposes the resolved doc's type/id so tests can assert which
  // chips rendered. docChipProps just forwards { type, doc } through.
  DocChip: vi.fn(({ type, id }) => (
    <div data-testid="doc-chip" data-type={type} data-id={id} />
  )),
  RelatedDocumentsShell: vi.fn(({ loading, children }) => (
    <div data-testid="rel-docs-shell" data-loading={String(loading)}>
      {children}
    </div>
  )),
  docChipProps: vi.fn(({ type, doc }) => ({ type, id: doc.id })),
  neoBase: vi.fn(() => '/neo'),
  fetchById: vi.fn(),
}));

import { render, screen, waitFor } from '@testing-library/react';
import RelatedDocuments from '../RelatedDocuments.jsx';
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
  global.fetch = vi.fn(async () => linesResponse(lines, opts));
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
      if (entity === 'header') return { id: 'INV1', documentNo: 'INV-001' };
      return null;
    });

    renderComp();

    const chip = await screen.findByTestId('doc-chip');
    expect(chip).toHaveAttribute('data-type', 'invoice');
    expect(chip).toHaveAttribute('data-id', 'INV1');
  });

  it('2. resolves an order chip from orderPaymentSchedule via salesOrder', async () => {
    mockFetchLines([{ orderPaymentSchedule: 'OSCHED1' }]);
    fetchById.mockImplementation(async (spec, entity) => {
      if (entity === 'paymentPlan') return { salesOrder: 'ORD1' };
      if (entity === 'header') return { id: 'ORD1' };
      return null;
    });

    renderComp();

    const chip = await screen.findByTestId('doc-chip');
    expect(chip).toHaveAttribute('data-type', 'order');
    expect(chip).toHaveAttribute('data-id', 'ORD1');
  });

  it('3. falls back to the order field when salesOrder is absent', async () => {
    mockFetchLines([{ orderPaymentSchedule: 'OSCHED2' }]);
    fetchById.mockImplementation(async (spec, entity) => {
      if (entity === 'paymentPlan') return { order: 'ORD2' }; // no salesOrder
      if (entity === 'header') return { id: 'ORD2' };
      return null;
    });

    renderComp();

    const chip = await screen.findByTestId('doc-chip');
    expect(chip).toHaveAttribute('data-type', 'order');
    expect(chip).toHaveAttribute('data-id', 'ORD2');
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

  it('5. silent catch: a rejecting schedule fetch does not break the other line', async () => {
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

    const chip = await screen.findByTestId('doc-chip');
    // Only the good line resolved — component did NOT fall into empty state.
    expect(screen.getAllByTestId('doc-chip')).toHaveLength(1);
    expect(chip).toHaveAttribute('data-id', 'INV_OK');
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

  it('7. with no recordId: no fetch, stays loading, no chips', async () => {
    global.fetch = vi.fn();

    renderComp({ recordId: undefined });

    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.queryByTestId('doc-chip')).not.toBeInTheDocument();
    // Effect returns early before clearing loading.
    expect(screen.getByTestId('rel-docs-shell')).toHaveAttribute('data-loading', 'true');
  });

  // ETP-4779: generating a derived document (e.g. a Payment) from this
  // window's menu actions must refresh this component the same way the
  // manual refresh button does — via a `docsRefreshSignal` prop threaded
  // down from DetailView through LinesBottomSection. Currently
  // `docsRefreshSignal` is not part of the fetch effect's dependency array,
  // so incrementing it does NOT trigger a refetch. This test is expected to
  // FAIL until that fix lands.
  it('8. refetches lines when docsRefreshSignal prop increments (regression, ETP-4779)', async () => {
    mockFetchLines([]);

    const { rerender } = renderComp({ docsRefreshSignal: 0 });

    await waitFor(() => {
      expect(screen.getByTestId('rel-docs-shell')).toHaveAttribute('data-loading', 'false');
    });

    const callsBefore = global.fetch.mock.calls.length;

    rerender(
      <RelatedDocuments recordId="rec-1" data={{}} token={TOKEN} apiBaseUrl={API} docsRefreshSignal={1} />
    );

    await waitFor(() => {
      expect(global.fetch.mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });
});
