// @covers tools/app-shell/src/windows/custom/sales-invoice/SalesInvoiceTopbar.jsx
// @covers artifacts/sales-invoice/custom/InvoiceTopbarExtra.jsx
// Ownership of the fiscal send action in the sales-invoice form topbar.
//
// ETP-5027: SalesInvoiceTopbar NESTS InvoiceTopbarExtra, and both used to render
// their own send button, so the toolbar showed the action twice.
// ETP-5700: the form view now offers the action ONLY from the kebab
// (SifSendMenuItem via window.customComponents.moreMenuContent, covered by
// shared/__tests__/SifSendMenuItem.vitest.jsx); the topbar renders none at all.
//
// This suite mounts the REAL SalesInvoiceTopbar with the REAL InvoiceTopbarExtra
// child under an sii+tbai profile with a completed, pending invoice — the setup in
// which a topbar send button used to render — and asserts that none does.

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
// installments list comes back empty, and it takes an early return — so the
// "no send button" assertion below would pass vacuously.
vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: vi.fn(() => (...args) => global.fetch(...args)),
}));

// The org profile under which a send action applies — 'verifactu' never has one.
// tbaiRecord/earliestSiiCutoverDate are far in the past so neither the TBAI
// adoption-date gate (ETP-5122) nor the SII cutover-date gate (ETP-5432 #3)
// hides the button given DATA's invoiceDate/accountingDate below.
vi.mock('@/windows/custom/fiscal-config/useFiscalConfig.js', () => ({
  useFiscalConfig: vi.fn(() => ({
    profile: 'sii+tbai',
    tbaiRecord: { tbaisystemdate: '2020-01-01T00:00:00.000Z' },
    earliestSiiCutoverDate: '2020-01-01T00:00:00.000Z',
  })),
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
  invoiceDate: '2026-06-15',
  accountingDate: '2026-06-15',
};

// One pending installment, so InvoiceTopbarExtra reaches its main return
// branch (the one that used to own the send button) instead of an early return.
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

describe('SalesInvoiceTopbar — fiscal send action ownership (ETP-5027, ETP-5700)', () => {
  beforeEach(() => {
    global.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ response: { data: INSTALLMENTS } }),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders no fiscal send button in the topbar — the form view sends from the kebab only', async () => {
    renderTopbar();

    // Wait for InvoiceTopbarExtra's installment fetch to settle, so the assertion
    // runs against its main branch rather than the loading placeholder.
    await waitFor(() => {
      expect(screen.getByTestId('payment-status-badge')).toBeInTheDocument();
    });

    expect(screen.queryAllByRole('button', { name: /^sendToSifLabel/ })).toHaveLength(0);
    // ETP-5260: "Send by email" lives in topbarSecondary, never in this tree.
    expect(screen.queryByTestId('send-document-btn')).not.toBeInTheDocument();
  });
});
