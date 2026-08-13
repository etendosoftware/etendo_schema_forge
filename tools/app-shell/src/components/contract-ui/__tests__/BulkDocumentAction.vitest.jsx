import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('@/hooks/useDocumentAction', () => ({
  useDocumentAction: () => ({
    execute: vi.fn().mockResolvedValue({}),
  }),
}));

vi.mock('@/components/ui/button.jsx', () => ({
  Button: ({ children, onClick, disabled, ...props }) => (
    <button onClick={onClick} disabled={disabled} {...props}>{children}</button>
  ),
}));

vi.mock('@/components/ui/dialog.jsx', () => ({
  Dialog: ({ children, open }) => open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }) => <div>{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <h2>{children}</h2>,
  DialogFooter: ({ children }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/select.jsx', () => ({
  Select: ({ children, value, onValueChange }) => <div data-testid="select">{children}</div>,
  SelectTrigger: ({ children }) => <div>{children}</div>,
  SelectValue: () => <span>val</span>,
  SelectContent: ({ children }) => <div>{children}</div>,
  SelectItem: ({ children, value }) => <option value={value}>{children}</option>,
}));

vi.mock('@/components/ui/label.jsx', () => ({
  Label: ({ children }) => <label>{children}</label>,
}));

import BulkDocumentAction, { buildInOutActions } from '../BulkDocumentAction.jsx';

describe('buildInOutActions', () => {
  it('returns CO action when rows have draft status', () => {
    const rows = [{ documentStatus: 'DR' }];
    expect(buildInOutActions(rows)).toEqual([{ value: 'CO', labelKey: 'book' }]);
  });

  it('returns empty array when no draft rows', () => {
    const rows = [{ documentStatus: 'CO' }];
    expect(buildInOutActions(rows)).toEqual([]);
  });

  it('checks docStatus fallback', () => {
    const rows = [{ docStatus: 'DR' }];
    expect(buildInOutActions(rows)).toEqual([{ value: 'CO', labelKey: 'book' }]);
  });
});

describe('BulkDocumentAction', () => {
  it('returns null when no rows selected', () => {
    const { container } = render(
      <BulkDocumentAction selectedRows={[]} clearSelection={vi.fn()} token="tok" apiBaseUrl="/api" />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('returns null when no valid actions for selected rows', () => {
    const rows = [{ id: '1', documentStatus: 'VO' }]; // void has no action
    const { container } = render(
      <BulkDocumentAction selectedRows={rows} clearSelection={vi.fn()} token="tok" apiBaseUrl="/api" />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders button with row count for draft rows', () => {
    const rows = [{ id: '1', documentStatus: 'DR' }];
    render(
      <BulkDocumentAction selectedRows={rows} clearSelection={vi.fn()} token="tok" apiBaseUrl="/api" />,
    );
    expect(screen.getByText(/bulkCompletion/)).toBeInTheDocument();
    expect(screen.getByText(/\(1\)/)).toBeInTheDocument();
  });

  it('renders button for completed rows (reactivate action)', () => {
    const rows = [{ id: '1', documentStatus: 'CO' }];
    render(
      <BulkDocumentAction selectedRows={rows} clearSelection={vi.fn()} token="tok" apiBaseUrl="/api" />,
    );
    expect(screen.getByText(/bulkCompletion/)).toBeInTheDocument();
  });

  it('renders with both draft and completed rows (two actions)', () => {
    const rows = [
      { id: '1', documentStatus: 'DR' },
      { id: '2', documentStatus: 'CO' },
    ];
    render(
      <BulkDocumentAction selectedRows={rows} clearSelection={vi.fn()} token="tok" apiBaseUrl="/api" />,
    );
    expect(screen.getByText(/\(2\)/)).toBeInTheDocument();
  });

  it('opens dialog when button is clicked', async () => {
    const user = userEvent.setup();
    const rows = [{ id: '1', documentStatus: 'DR' }];
    render(
      <BulkDocumentAction selectedRows={rows} clearSelection={vi.fn()} token="tok" apiBaseUrl="/api" />,
    );
    await user.click(screen.getByText(/bulkCompletion/));
    expect(screen.getByTestId('dialog')).toBeInTheDocument();
    expect(screen.getByText('documentAction')).toBeInTheDocument();
  });

  it('uses custom buildActions when provided', () => {
    const rows = [{ id: '1', documentStatus: 'DR' }];
    const buildActions = vi.fn().mockReturnValue([{ value: 'CUSTOM', labelKey: 'customAction' }]);
    render(
      <BulkDocumentAction selectedRows={rows} clearSelection={vi.fn()} token="tok" apiBaseUrl="/api" buildActions={buildActions} />,
    );
    expect(buildActions).toHaveBeenCalledWith(rows);
  });

  it('uses custom labelKey', () => {
    const rows = [{ id: '1', documentStatus: 'DR' }];
    render(
      <BulkDocumentAction selectedRows={rows} clearSelection={vi.fn()} token="tok" apiBaseUrl="/api" labelKey="customLabel" />,
    );
    expect(screen.getByText(/customLabel/)).toBeInTheDocument();
  });

  it('uses docStatus when documentStatus is missing', () => {
    const rows = [{ id: '1', docStatus: 'DR' }];
    render(
      <BulkDocumentAction selectedRows={rows} clearSelection={vi.fn()} token="tok" apiBaseUrl="/api" />,
    );
    expect(screen.getByText(/bulkCompletion/)).toBeInTheDocument();
  });
});