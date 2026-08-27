// Vitest render tests for the TBAI error-reason join (resultadoValidación → sincronización
// by tbaiSyncinvoiceID). Isolated from TbaiMonitorSection.vitest.jsx because that file mocks
// isErrorStatus to always return false; here we need real error-status matching (so
// FmPrimitives.jsx is NOT mocked — ScrollSentinel needs a jsdom IntersectionObserver stub).
global.IntersectionObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));
vi.mock('@/auth/useApiFetch.js', () => ({ useApiFetch: () => vi.fn() }));
vi.mock('@/components/related-documents/helpers.js', () => ({ neoBase: (u) => u }));
vi.mock('lucide-react', () => ({
  ArrowUpRight: () => null,
  TriangleAlert: () => null,
}));
vi.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({ checked, onChange }) => <input type="checkbox" checked={!!checked} onChange={onChange ?? (() => {})} />,
}));
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }) => children,
  TooltipContent: ({ children }) => children,
  TooltipProvider: ({ children }) => children,
  TooltipTrigger: ({ children }) => children,
}));
vi.mock('../useFiscalMonitor.js', () => ({
  TBAI_SPEC: 'tbai-facturas-enviadas',
  TBAI_ENTITY: 'sincronización',
}));

import { render, screen } from '@testing-library/react';
import TbaiMonitorSection from '../TbaiMonitorSection.jsx';

const baseProps = {
  orgId: 'org-1',
  apiBaseUrl: '/sws/neo/tbai',
  kpis: { tbai: { total: 3, received: 1, rejected: 1, error: 1 } },
};

const ROWS = [
  { id: 't-recibido', invoiceIdentifier: 'FA-1', estado: 'Recibido' },
  { id: 't-rechazado', invoiceIdentifier: 'FA-2', estado: 'Rechazado' },
  { id: 't-error', invoiceIdentifier: 'FA-3', estado: 'Error' },
];

const VALIDATION_RESULTS = [
  { tbaiSyncinvoiceID: 't-rechazado', codigo: '5040', descripcion: 'Existe una factura con la misma serie, número de factura y año de expedición para este emisor' },
  { tbaiSyncinvoiceID: 't-error', codigo: '1001', descripcion: 'Firma XAdES no válida' },
  { tbaiSyncinvoiceID: 't-error', codigo: '1002', descripcion: 'Certificado caducado' },
];

describe('TbaiMonitorSection — error reason rendering (real isErrorStatus)', () => {
  it('renders a dash in the error reason column for a Recibido (accepted) row', () => {
    render(<TbaiMonitorSection {...baseProps} mockRows={[ROWS[0]]} validationResults={VALIDATION_RESULTS} />);
    expect(screen.queryByText(/5040/)).toBeNull();
    const recibidoRow = screen.getByText('FA-1').closest('tr');
    expect(recibidoRow.textContent).toMatch(/—/);
  });

  it('renders the [codigo] descripcion line for a Rechazado row', () => {
    render(<TbaiMonitorSection {...baseProps} mockRows={[ROWS[1]]} validationResults={VALIDATION_RESULTS} />);
    expect(screen.getByText(/\[5040\]/)).toBeInTheDocument();
    expect(screen.getByText(/misma serie, número de factura/)).toBeInTheDocument();
  });

  it('renders all validation results (0..N) for a single row — Error with two reasons', () => {
    render(<TbaiMonitorSection {...baseProps} mockRows={[ROWS[2]]} validationResults={VALIDATION_RESULTS} />);
    expect(screen.getByText(/\[1001\]/)).toBeInTheDocument();
    expect(screen.getByText(/Firma XAdES no válida/)).toBeInTheDocument();
    expect(screen.getByText(/\[1002\]/)).toBeInTheDocument();
    expect(screen.getByText(/Certificado caducado/)).toBeInTheDocument();
  });

  it('shows a dash for an error-status row with no matching validation result', () => {
    render(<TbaiMonitorSection {...baseProps} mockRows={[{ id: 'no-match', estado: 'Rechazado' }]} validationResults={VALIDATION_RESULTS} />);
    expect(screen.queryByText(/\[/)).toBeNull();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('renders the error reason in its own dedicated table column (not under the status pill)', () => {
    render(<TbaiMonitorSection {...baseProps} mockRows={[ROWS[1]]} validationResults={VALIDATION_RESULTS} />);
    expect(screen.getByText('fiscalMonitor.col.errorReason')).toBeInTheDocument();
    const cell = screen.getByText(/\[5040\]/).closest('td');
    const pillCell = screen.getByTestId('status-pill').closest('td');
    expect(cell).not.toBe(pillCell);
  });

  it('does not crash when validationResults is undefined', () => {
    expect(() => render(<TbaiMonitorSection {...baseProps} mockRows={[ROWS[1]]} />)).not.toThrow();
  });

  it('joins each row to its own validation results only when multiple invoices are mixed', () => {
    // Regression guard for the tbaiSyncinvoiceID join: rendering all three rows
    // together must not leak Rechazado's reason onto Error's cell (or vice versa),
    // and the accepted row must render none.
    render(<TbaiMonitorSection {...baseProps} mockRows={ROWS} validationResults={VALIDATION_RESULTS} />);

    const recibidoRow = screen.getByText('FA-1').closest('tr');
    const rechazadoRow = screen.getByText('FA-2').closest('tr');
    const errorRow = screen.getByText('FA-3').closest('tr');

    expect(recibidoRow.textContent).toMatch(/—/);

    expect(rechazadoRow.textContent).toMatch(/\[5040\]/);
    expect(rechazadoRow.textContent).not.toMatch(/\[1001\]/);
    expect(rechazadoRow.textContent).not.toMatch(/\[1002\]/);

    expect(errorRow.textContent).toMatch(/\[1001\]/);
    expect(errorRow.textContent).toMatch(/\[1002\]/);
    expect(errorRow.textContent).not.toMatch(/\[5040\]/);
  });
});
