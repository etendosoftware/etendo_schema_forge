import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

const linesMock = vi.fn();
vi.mock('@/hooks/useBankStatementLines', () => ({
  useBankStatementLines: (...args) => linesMock(...args),
}));

// Stub the child table — the table has its own test suite. We just need to
// verify the wrapper passes the right props.
vi.mock('../StatementLinesTable', () => ({
  StatementLinesTable: ({ lines, loading, currency }) => (
    <div
      data-testid="stub-statement-lines-table"
      data-lines={lines.length}
      data-loading={loading ? 'true' : 'false'}
      data-currency={currency ?? 'unset'}
    />
  ),
}));

import { StatementLinesView } from '../StatementLinesView.jsx';

describe('StatementLinesView', () => {
  beforeEach(() => {
    linesMock.mockReset();
  });

  it('renders the back button with the correct aria-label / test id', () => {
    linesMock.mockReturnValue({ lines: [], loading: false });
    render(
      <StatementLinesView
        statementId="s1" statementName="Mayo" currency="EUR" onBack={vi.fn()}
      />,
    );
    const back = screen.getByTestId('statement-lines-back');
    expect(back).toBeInTheDocument();
    expect(back).toHaveAttribute('aria-label', 'financeAccountDetailBack');
  });

  it('shows the statementName as the header title', () => {
    linesMock.mockReturnValue({ lines: [], loading: false });
    render(
      <StatementLinesView
        statementId="s1" statementName="Mayo 2026" currency="EUR" onBack={vi.fn()}
      />,
    );
    expect(screen.getByText('Mayo 2026')).toBeInTheDocument();
  });

  it('falls back to the title i18n key when statementName is empty', () => {
    linesMock.mockReturnValue({ lines: [], loading: false });
    render(
      <StatementLinesView
        statementId="s1" statementName="" currency="EUR" onBack={vi.fn()}
      />,
    );
    expect(
      screen.getByText('financeAccountStatementLinesTitle'),
    ).toBeInTheDocument();
  });

  it('renders the subtitle (i18n key) with the line count', () => {
    linesMock.mockReturnValue({
      lines: [{ id: 'l1' }, { id: 'l2' }, { id: 'l3' }],
      loading: false,
    });
    render(
      <StatementLinesView
        statementId="s1" statementName="x" currency="EUR" onBack={vi.fn()}
      />,
    );
    // useUI mock returns the key, so we just verify the subtitle key surfaces.
    expect(
      screen.getByText('financeAccountStatementLinesSubtitle'),
    ).toBeInTheDocument();
  });

  it('calls onBack when the back button is clicked', async () => {
    linesMock.mockReturnValue({ lines: [], loading: false });
    const onBack = vi.fn();
    const user = userEvent.setup();
    render(
      <StatementLinesView statementId="s1" statementName="x" onBack={onBack} />,
    );
    await user.click(screen.getByTestId('statement-lines-back'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('forwards lines + loading + currency to the inner StatementLinesTable', () => {
    linesMock.mockReturnValue({
      lines: [{ id: 'l1' }, { id: 'l2' }],
      loading: true,
    });
    render(
      <StatementLinesView
        statementId="s1" statementName="x" currency="USD" onBack={vi.fn()}
      />,
    );
    const stub = screen.getByTestId('stub-statement-lines-table');
    expect(stub).toHaveAttribute('data-lines', '2');
    expect(stub).toHaveAttribute('data-loading', 'true');
    expect(stub).toHaveAttribute('data-currency', 'USD');
  });

  it('passes the statementId to the useBankStatementLines hook', () => {
    linesMock.mockReturnValue({ lines: [], loading: false });
    render(
      <StatementLinesView
        statementId="s-99" statementName="x" onBack={vi.fn()}
      />,
    );
    expect(linesMock).toHaveBeenCalledWith('s-99');
  });
});
