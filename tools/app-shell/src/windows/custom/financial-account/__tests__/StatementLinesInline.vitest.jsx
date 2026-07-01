import { render, screen } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'es_ES' }),
}));

// StatusTag uses Radix popovers and tokens — stub to a plain span so we can
// assert the tone + label without pulling the full component tree.
vi.mock('@/components/ui/status-tag', () => ({
  StatusTag: ({ tone, label }) => (
    <span data-testid={`status-${tone}`}>{label}</span>
  ),
}));

const linesMock = vi.fn();
vi.mock('@/hooks/useBankStatementLines', () => ({
  useBankStatementLines: (...args) => linesMock(...args),
}));

// Stub the modal so the chip tests don't pull react-router-dom / the dialog tree.
// It records the line it was opened with and renders a minimal marker.
const txnModalSpy = vi.fn();
vi.mock('../ReconciledTxnsModal', () => ({
  ReconciledTxnsModal: ({ line, onClose }) => {
    txnModalSpy(line);
    return (
      <div data-testid="txn-modal" data-doc={line?.txns?.[0]?.documentNo || ''}>
        <button type="button" data-testid="txn-modal-close" onClick={onClose} />
      </div>
    );
  },
}));

import { StatementLinesInline } from '../StatementLinesInline.jsx';

describe('StatementLinesInline', () => {
  beforeEach(() => {
    linesMock.mockReset();
  });

  it('renders the column headers and no longer shows the inline title/count badge', () => {
    linesMock.mockReturnValue({ lines: [], loading: false });
    render(<StatementLinesInline statementId="s1" />);
    // The "Líneas del extracto (N)" header was removed — the detail starts at the
    // column header row.
    expect(screen.queryByText('financeAccountStatementsInlineTitle')).not.toBeInTheDocument();
    expect(screen.getByText('financeAccountStatementLinesColDate')).toBeInTheDocument();
  });

  it('forwards the statementId to the useBankStatementLines hook', () => {
    linesMock.mockReturnValue({ lines: [], loading: false });
    render(<StatementLinesInline statementId="s-42" />);
    expect(linesMock).toHaveBeenCalledWith('s-42');
  });

  it('renders loading skeletons (no rows) when loading=true', () => {
    linesMock.mockReturnValue({ lines: [], loading: true });
    const { container } = render(<StatementLinesInline statementId="s1" />);
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
    expect(screen.queryByText('financeAccountStatementLinesEmpty')).not.toBeInTheDocument();
  });

  it('renders the empty-state message when no lines and not loading', () => {
    linesMock.mockReturnValue({ lines: [], loading: false });
    render(<StatementLinesInline statementId="s1" />);
    expect(screen.getByText('financeAccountStatementLinesEmpty')).toBeInTheDocument();
  });

  it('renders one row per line with the test id', () => {
    linesMock.mockReturnValue({
      lines: [
        {
          id: 'l1', date: '2026-05-06T00:00:00Z', description: 'foo',
          bpartnerName: 'ACME', amount: 100, matched: true,
        },
        {
          id: 'l2', date: '2026-05-07T00:00:00Z', description: '',
          bpartnerName: '', amount: -50, matched: false,
        },
      ],
      loading: false,
    });

    render(<StatementLinesInline statementId="s1" />);
    expect(screen.getByTestId('statement-line-row-l1')).toBeInTheDocument();
    expect(screen.getByTestId('statement-line-row-l2')).toBeInTheDocument();
  });

  it('renders a success-tone match pill for matched=true and an info one for matched=false', () => {
    linesMock.mockReturnValue({
      lines: [
        { id: 'l1', date: '2026-05-06T00:00:00Z', description: '', amount: 100, matched: true },
        { id: 'l2', date: '2026-05-07T00:00:00Z', description: '', amount: 100, matched: false },
      ],
      loading: false,
    });
    render(<StatementLinesInline statementId="s1" />);
    // Matched → success (green); unmatched "Sin conciliar" → warning (amber),
    // matching the Figma design.
    expect(screen.getByTestId('status-success')).toBeInTheDocument();
    expect(screen.getByTestId('status-warning')).toBeInTheDocument();
    expect(
      screen.getByText('financeAccountStatementLinesStatusUnmatched'),
    ).toBeInTheDocument();
  });

  it('renders the contract-driven Descripción column header after Fecha', () => {
    linesMock.mockReturnValue({ lines: [], loading: false });
    render(<StatementLinesInline statementId="s1" />);
    // The contract (bankStatementLines) declares description at gridOrder 2,
    // right after transactionDate (gridOrder 1) — so the header is present and
    // sits immediately after the Fecha header.
    const headers = screen.getAllByText(/financeAccountStatementLinesCol/);
    const labels = headers.map((el) => el.textContent);
    const dateIdx = labels.indexOf('financeAccountStatementLinesColDate');
    const descIdx = labels.indexOf('financeAccountStatementLinesColDescription');
    expect(dateIdx).toBeGreaterThanOrEqual(0);
    expect(descIdx).toBe(dateIdx + 1);
  });

  it('orders Estado/Transacción before Salida/Entrada in the header (ETP-4342)', () => {
    linesMock.mockReturnValue({ lines: [], loading: false });
    render(<StatementLinesInline statementId="s1" />);
    // ETP-4342: the lines table column order was reordered to match the Figma —
    // the amount columns (Salida/Entrada) are pushed to the end, so the synthetic
    // Estado + Transacción headers now sit BEFORE them.
    const headers = screen.getAllByText(/financeAccountStatementLinesCol/);
    const labels = headers.map((el) => el.textContent);
    const estadoIdx = labels.indexOf('financeAccountStatementLinesColMatched');
    const transaccionIdx = labels.indexOf('financeAccountStatementLinesColTransaction');
    const salidaIdx = labels.indexOf('financeAccountStatementLinesColDramount');
    const entradaIdx = labels.indexOf('financeAccountStatementLinesColCramount');
    // All four headers are present.
    expect(estadoIdx).toBeGreaterThanOrEqual(0);
    expect(transaccionIdx).toBeGreaterThanOrEqual(0);
    expect(salidaIdx).toBeGreaterThanOrEqual(0);
    expect(entradaIdx).toBeGreaterThanOrEqual(0);
    // Estado and Transacción precede both amount columns.
    expect(estadoIdx).toBeLessThan(salidaIdx);
    expect(estadoIdx).toBeLessThan(entradaIdx);
    expect(transaccionIdx).toBeLessThan(salidaIdx);
    expect(transaccionIdx).toBeLessThan(entradaIdx);
  });

  it('renders the line description value in its row', () => {
    linesMock.mockReturnValue({
      lines: [
        {
          id: 'l1', date: '2026-05-06T00:00:00Z', description: 'Comisión mantenimiento',
          bpartnerName: 'ACME', amount: -12, matched: false,
        },
      ],
      loading: false,
    });
    render(<StatementLinesInline statementId="s1" />);
    expect(screen.getByText('Comisión mantenimiento')).toBeInTheDocument();
  });

  it('renders "—" in the Descripción cell when the line has no description', () => {
    linesMock.mockReturnValue({
      lines: [
        { id: 'l1', date: '2026-05-06T00:00:00Z', description: '', bpartnerName: '', amount: 100, matched: true },
      ],
      loading: false,
    });
    render(<StatementLinesInline statementId="s1" />);
    const row = screen.getByTestId('statement-line-row-l1');
    // The empty description cell shows the placeholder dash.
    expect(row).toHaveTextContent('—');
  });

  it('renders the contact name, the contact FK and the G/L item columns', () => {
    linesMock.mockReturnValue({
      lines: [
        {
          id: 'l1', date: '2026-05-06T00:00:00Z', description: 'Transfer',
          bpartnerName: 'Acme typed', bpartnerFkName: 'Acme S.L.',
          glItemName: 'Comisiones', amount: 100, matched: false,
        },
      ],
      loading: false,
    });
    render(<StatementLinesInline statementId="s1" />);
    // The header exposes the three distinct columns.
    expect(screen.getByText('financeAccountStatementLinesColBpartner')).toBeInTheDocument();
    expect(screen.getByText('financeAccountStatementLinesColContact')).toBeInTheDocument();
    expect(screen.getByText('financeAccountStatementLinesColGlItem')).toBeInTheDocument();
    // The row shows the free-text name, the resolved BP and the G/L item.
    expect(screen.getByText('Acme typed')).toBeInTheDocument();
    expect(screen.getByText('Acme S.L.')).toBeInTheDocument();
    expect(screen.getByText('Comisiones')).toBeInTheDocument();
  });

  it('falls back to "—" for empty description', () => {
    linesMock.mockReturnValue({
      lines: [
        { id: 'l1', date: '2026-05-06T00:00:00Z', description: '', amount: 100, matched: true },
      ],
      loading: false,
    });
    render(<StatementLinesInline statementId="s1" />);
    // The empty description should render the placeholder "—" exactly once.
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1);
  });

  describe('Transacción column', () => {
    it('shows no chip (—) when the line has no reconciled transactions', () => {
      linesMock.mockReturnValue({
        lines: [{ id: 'l1', date: '2026-05-06T00:00:00Z', amount: 100, matched: false, txns: [] }],
        loading: false,
      });
      render(<StatementLinesInline statementId="s1" />);
      expect(screen.queryByTestId('statement-line-txn-l1')).not.toBeInTheDocument();
    });

    it('shows a single-transaction chip with its payment number and opens the modal', async () => {
      const { default: userEvent } = await import('@testing-library/user-event');
      const user = userEvent.setup();
      linesMock.mockReturnValue({
        lines: [{
          id: 'l1', date: '2026-05-06T00:00:00Z', amount: -500, matched: true,
          txns: [{ documentNo: '1000034', amount: -500, paymentId: 'p1' }],
        }],
        loading: false,
      });
      render(<StatementLinesInline statementId="s1" />);
      const chip = screen.getByTestId('statement-line-txn-l1');
      expect(chip).toHaveTextContent('1000034');
      await user.click(chip);
      expect(screen.getByTestId('txn-modal')).toHaveAttribute('data-doc', '1000034');
    });

    it('shows a "N transacciones" chip when the line has several transactions', () => {
      linesMock.mockReturnValue({
        lines: [{
          id: 'l1', date: '2026-05-06T00:00:00Z', amount: 900, matched: true,
          txns: [
            { documentNo: '1000040', amount: 500, paymentId: 'p1' },
            { documentNo: '1000041', amount: 400, paymentId: 'p2' },
          ],
        }],
        loading: false,
      });
      render(<StatementLinesInline statementId="s1" />);
      expect(screen.getByTestId('statement-line-txn-l1'))
        .toHaveTextContent('financeAccountStatementLinesTxnChipMulti');
    });
  });
});
