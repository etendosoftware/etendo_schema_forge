// Integration tests for the ETP-4784 "Motivo error" fallback: when the
// C_Invoice header field (aeatsiiErrorMsg) is empty, the column must fall
// back to the most-recent `motivo` from the issuedInvoicesSiiData /
// receivedInvoicesSiiData entity for that invoice.

const invoiceRow = (overrides = {}) => ({
  id: 'inv-1',
  invoiceDate: '2026-01-10',
  documentNo: 'EV-2026-0001',
  businessPartner: 'A-1',
  aeatsiiEstado: 'EE',
  aeatsiiErrorCode: null,
  aeatsiiErrorMsg: null,
  ...overrides,
});

function mockApiFetch(mainRows, siiDataRows) {
  return vi.fn((url) => {
    if (String(url).includes('SiiData')) {
      return Promise.resolve({ ok: true, json: async () => ({ response: { data: siiDataRows, totalRows: siiDataRows.length } }) });
    }
    return Promise.resolve({ ok: true, json: async () => ({ response: { data: mainRows, totalRows: mainRows.length } }) });
  });
}

let currentApiFetch = mockApiFetch([], []);

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));
vi.mock('@/auth/useApiFetch.js', () => ({ useApiFetch: () => currentApiFetch }));
vi.mock('@/components/related-documents/helpers.js', () => ({ neoBase: (u) => u }));
vi.mock('@/lib/formatAmount.js', () => ({ formatAmount: (v) => String(v ?? '') }));
vi.mock('lucide-react', () => ({ FileUp: () => null, FileDown: () => null }));
vi.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({ checked, onChange }) => <input type="checkbox" checked={!!checked} onChange={onChange ?? (() => {})} />,
}));
const stableSetSelectedIds = () => {};
const stableToggleAll = () => {};
const stableToggleRow = () => {};
const stableSelectedIds = new Set();

// Real SII error-status matching (IN/EE/AE) is required here: correction #4
// gates the "Motivo error" fallback by the invoice's CURRENT aeatsiiEstado.
vi.mock('../FmPrimitives.jsx', () => ({
  StatusPill: ({ estado }) => <span data-testid="status-pill">{estado}</span>,
  NumFactura: ({ n }) => <span>{n}</span>,
  ScrollSentinel: () => null,
  isErrorStatus: (estado) => estado === 'IN' || estado === 'EE' || estado === 'AE',
  isPendingStatus: () => false,
  fmtDate: (d) => d ?? '',
  PAGE_SIZE: 20,
  ExportIcon: () => <span>export</span>,
  useFmSelection: () => ({
    selectedIds: stableSelectedIds,
    setSelectedIds: stableSetSelectedIds,
    handleToggleAll: stableToggleAll,
    handleToggleRow: stableToggleRow,
  }),
}));
vi.mock('../useFiscalMonitor.js', () => ({
  SII_SPEC: 'sii-monitor',
  SII_EMITIDAS_ENTITY: 'issuedInvoices',
  SII_RECIBIDAS_ENTITY: 'receivedInvoices',
  SII_EMITIDAS_ANT_ENTITY: 'issuedInvoices(previousPeriod)',
  SII_RECIBIDAS_ANT_ENTITY: 'receivedInvoices(previousPeriod)',
}));

import { render, screen, waitFor } from '@testing-library/react';
import SiiMonitorSection from '../SiiMonitorSection.jsx';

const baseProps = {
  orgId: 'org-1',
  apiBaseUrl: '/sws/neo/sii-monitor',
  parentId: 'parent-1',
  kpis: { sii: { issued: 1, received: 0, issuedPrevious: 0, receivedPrevious: 0 } },
};

describe('SiiMonitorSection — "Motivo error" header-empty fallback (ETP-4784)', () => {
  it('uses the header aeatsiiErrorMsg when present, ignoring SiiData motivo', async () => {
    currentApiFetch = mockApiFetch(
      [invoiceRow({ aeatsiiErrorCode: '500', aeatsiiErrorMsg: 'Header error message' })],
      [{ invoice: 'inv-1', motivo: 'Should not be shown', fechaltimaModificacinSII: '2026-01-01' }],
    );
    render(<SiiMonitorSection {...baseProps} />);
    await waitFor(() => expect(screen.getByText(/Header error message/)).toBeInTheDocument());
    expect(screen.queryByText(/Should not be shown/)).toBeNull();
  });

  it('falls back to the SiiData motivo when the header field is empty and there is one row', async () => {
    currentApiFetch = mockApiFetch(
      [invoiceRow()],
      [{ invoice: 'inv-1', motivo: 'NIF no identificado en el censo', fechaltimaModificacinSII: '2026-01-01' }],
    );
    render(<SiiMonitorSection {...baseProps} />);
    await waitFor(() => expect(screen.getByText(/NIF no identificado en el censo/)).toBeInTheDocument());
  });

  it('falls back to the most-recent SiiData motivo when there are 2+ rows for the invoice', async () => {
    currentApiFetch = mockApiFetch(
      [invoiceRow()],
      [
        { invoice: 'inv-1', motivo: 'Motivo antiguo', fechaltimaModificacinSII: '2026-01-01' },
        { invoice: 'inv-1', motivo: 'Motivo reciente', fechaltimaModificacinSII: '2026-01-15' },
      ],
    );
    render(<SiiMonitorSection {...baseProps} />);
    await waitFor(() => expect(screen.getByText(/Motivo reciente/)).toBeInTheDocument());
    expect(screen.queryByText(/Motivo antiguo/)).toBeNull();
  });

  it('shows a dash when the header field is empty and there are no SiiData rows for the invoice', async () => {
    currentApiFetch = mockApiFetch([invoiceRow()], []);
    render(<SiiMonitorSection {...baseProps} />);
    await waitFor(() => expect(screen.getByTestId('fm-data-table')).toBeInTheDocument());
    await waitFor(() => {
      const row = screen.getByText('EV-2026-0001').closest('tr');
      expect(row.textContent).toMatch(/—/);
    });
  });

  // ETP-4784 correction #4 — reproduces the real-world case reported against
  // purchase invoice 10000009 (Facturas recibidas): a past send attempt left
  // a "Referencia del proveedor" motivo in *SiiData, the invoice was then
  // corrected and is now Aceptado (CO) — the stale motivo must NOT resurface.
  it('hides the SiiData motivo when the invoice CURRENT status is Aceptado (CO), not an error', async () => {
    currentApiFetch = mockApiFetch(
      [invoiceRow({ aeatsiiEstado: 'CO' })],
      [{
        invoice: 'inv-1',
        motivo: 'La factura de compra debe contener información en el campo Referencia del proveedor.',
        fechaltimaModificacinSII: '2026-01-01',
      }],
    );
    render(<SiiMonitorSection {...baseProps} initialTab="received" />);
    await waitFor(() => expect(screen.getByTestId('fm-data-table')).toBeInTheDocument());
    await waitFor(() => {
      const row = screen.getByText('EV-2026-0001').closest('tr');
      expect(row.textContent).toMatch(/—/);
    });
    expect(screen.queryByText(/Referencia del proveedor/)).toBeNull();
  });

  it('still shows the SiiData motivo when the invoice CURRENT status is an error (EE)', async () => {
    currentApiFetch = mockApiFetch(
      [invoiceRow({ aeatsiiEstado: 'EE' })],
      [{ invoice: 'inv-1', motivo: 'NIF no identificado en el censo', fechaltimaModificacinSII: '2026-01-01' }],
    );
    render(<SiiMonitorSection {...baseProps} />);
    await waitFor(() => expect(screen.getByText(/NIF no identificado en el censo/)).toBeInTheDocument());
  });
});
