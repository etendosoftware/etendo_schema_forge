// ETP-5027 — regression guard for the duplicated "Enviar a SIF" button.
//
// SalesInvoiceTopbar NESTS InvoiceTopbarExtra, and both used to render their
// own <SendToSifButton />, so the toolbar showed the action twice. The bug was
// structurally invisible to the existing suites:
//   - SalesInvoiceTopbar.test.js is a source-text (readFileSync + regex) test
//     that asserts InvoiceTopbarExtra is present but never COUNTS occurrences.
//   - index.vitest.jsx mocks ../SalesInvoiceTopbar.jsx, so the real toolbar
//     never renders.
//   - shared/__tests__/SendToSifButton.vitest.jsx renders it in isolation.
// It was also masked for a long time by fiscal profile: under 'verifactu' both
// instances returned null, so only an sii / sii-navarra / tbai / sii+tbai org
// ever saw it.
//
// Hence this suite: mount the REAL SalesInvoiceTopbar with the REAL
// InvoiceTopbarExtra child (deliberately NOT mocked, and neither is
// SendToSifButton) under an sii+tbai profile with a completed invoice, and
// assert the button appears EXACTLY ONCE.

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
}));

vi.mock('@etendosoftware/app-shell-core', () => ({
  useUI: () => (key) => key,
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('react-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, createPortal: (node) => node };
});

vi.mock('@/components/contract-ui/CloneOrderModal', () => ({
  default: () => <div data-testid="clone-order-modal" />,
}));

vi.mock('@/components/contract-ui/CopyRecordLinkButton', () => ({
  default: () => <button type="button" data-testid="copy-record-link" />,
}));

vi.mock('@/components/contract-ui/SendDocumentModal', () => ({
  default: () => <div data-testid="send-document-modal" />,
  SendDocumentButton: (props) => (
    <button type="button" data-testid="send-document-btn" onClick={props.onClick} />
  ),
}));

vi.mock('@/windows/custom/shared/InvoicePaymentHistoryModal.jsx', () => ({
  default: () => <div data-testid="payment-history-modal" />,
}));

vi.mock('@/windows/custom/shared/useInvoicePdf.js', () => ({
  useInvoicePdf: () => ({ pdfUrl: null, loading: false }),
}));

vi.mock('@/windows/custom/shared/useInvoiceUpdatedListener.js', () => ({
  useInvoiceUpdatedListener: vi.fn(),
}));

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ selectedOrg: { id: 'org-1' }, logout: vi.fn() }),
}));

// ETP-4576: InvoiceTopbarExtra reads its installments through apiFetch now, not a raw
// fetch, so this mock has to DELEGATE to the `global.fetch` stub installed in beforeEach.
// Returning a bare `vi.fn()` hands the component `undefined` instead of a response, the
// installments list comes back empty, and it takes the early return that owns no
// SendToSifButton - which reads exactly like the button having been deleted.
vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: vi.fn(() => (...args) => global.fetch(...args)),
}));

// The org profile that UNMASKS the bug — 'verifactu' would hide it entirely.
vi.mock('@/windows/custom/fiscal-config/useFiscalConfig.js', () => ({
  useFiscalConfig: vi.fn(() => ({ profile: 'sii+tbai' })),
}));

vi.mock('@/lib/formatCurrency.js', () => ({
  formatCurrency: (currency, amount) => `${currency}:${amount}`,
  getCurrencySymbol: () => '€',
}));

import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import SalesInvoiceTopbar from '../SalesInvoiceTopbar.jsx';

const DATA = {
  id: 'inv-001',
  documentStatus: 'CO',
  'currency$_identifier': 'EUR',
  grandTotalAmount: 1000,
  outstandingAmount: 1000,
  aeatsiiIssent: false,
  tbaiIssent: false,
};

// One pending installment, so InvoiceTopbarExtra reaches its main return
// branch (the one that owns SendToSifButton) instead of an early return.
const INSTALLMENTS = [
  { amount: '1000', paidAmount: '0', outstandingAmount: '1000', daysOverdue: '0' },
];

function renderTopbar() {
  return render(
    <SalesInvoiceTopbar
      data={DATA}
      recordId="inv-001"
      token="tok"
      apiBaseUrl="/sws/neo/sales-invoice"
      api={{}}
      onProcess={vi.fn()}
      onRefresh={vi.fn()}
    />,
  );
}

describe('SalesInvoiceTopbar — SIF button ownership (ETP-5027)', () => {
  beforeEach(() => {
    global.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ response: { data: INSTALLMENTS } }),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the "Send to SIF" action exactly once', async () => {
    renderTopbar();

    // Wait for InvoiceTopbarExtra's installment fetch to settle — before it
    // does, it renders a loading placeholder and owns no SIF button yet.
    await waitFor(() => {
      expect(screen.getByTestId('payment-status-badge')).toBeInTheDocument();
    });

    const sifButtons = screen.getAllByRole('button', { name: 'sendToSif' });
    expect(sifButtons).toHaveLength(1);
  });

  it('keeps InvoiceTopbarExtra as the single owner of the SIF action', async () => {
    renderTopbar();

    await waitFor(() => {
      expect(screen.getByTestId('payment-status-badge')).toBeInTheDocument();
    });

    // The owning instance sits in InvoiceTopbarExtra's document-action group:
    // payment-status badge -> SIF -> SendDocumentButton (envelope).
    const badge = screen.getByTestId('payment-status-badge');
    const sif = screen.getByRole('button', { name: 'sendToSif' });
    const envelope = screen.getByTestId('send-document-btn');

    expect(
      badge.compareDocumentPosition(sif) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      sif.compareDocumentPosition(envelope) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
