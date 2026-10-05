// ETP-5591 — DataTable's opt-in `emptyState` override. Without it the built-in empty copy must
// render exactly as before; with it, the caller's title / description / action replace it.
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useUI: () => (key) => key,
  useLocale: () => ({}),
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

import { DataTable } from '../DataTable.jsx';

const COLUMNS = [{ key: 'name', label: 'Name', type: 'string' }];

describe('DataTable — emptyState override (ETP-5591)', () => {
  it('keeps the built-in "no records yet" copy when no override is given', () => {
    render(<DataTable columns={COLUMNS} data={[]} />);
    expect(screen.getByText('noRecordsYet')).toBeInTheDocument();
    expect(screen.getByText('createNewRecord')).toBeInTheDocument();
  });

  it('renders the caller title, description and action instead of the built-in copy', () => {
    const onReset = vi.fn();
    render(
      <DataTable
        columns={COLUMNS}
        data={[]}
        emptyState={{
          title: 'Nothing here',
          description: 'Try other filters',
          action: <button type="button" onClick={onReset}>Reset</button>,
          testId: 'custom-empty',
        }} />,
    );
    const empty = screen.getByTestId('custom-empty');
    expect(empty).toHaveTextContent('Nothing here');
    expect(empty).toHaveTextContent('Try other filters');
    expect(screen.queryByText('noRecordsYet')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Reset'));
    expect(onReset).toHaveBeenCalled();
  });

  it('renders a title-only override without description or action', () => {
    render(<DataTable columns={COLUMNS} data={[]} emptyState={{ title: 'All done' }} />);
    expect(screen.getByText('All done')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reset' })).not.toBeInTheDocument();
  });

  it('ignores the override while there are rows to show', () => {
    render(
      <DataTable
        columns={COLUMNS}
        data={[{ id: 'r1', name: 'Row one' }]}
        emptyState={{ title: 'Nothing here' }} />,
    );
    expect(screen.getByText('Row one')).toBeInTheDocument();
    expect(screen.queryByText('Nothing here')).not.toBeInTheDocument();
  });
});
