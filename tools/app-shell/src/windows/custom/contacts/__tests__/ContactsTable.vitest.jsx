// --- Mocks (before imports) ---

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLocale: () => ({ genericLabels: {} }),
}));

vi.mock('@/components/contract-ui', () => ({
  DataTable: (props) => <div data-testid="data-table" data-editing-row-id={props.editingRowId ?? ''} />,
}));

vi.mock('@/components/ui/tag', () => ({
  Tag: ({ label }) => <span data-testid="tag">{label}</span>,
}));

vi.mock('@/components/ui/button.jsx', () => ({
  Button: ({ children, ...rest }) => <button {...rest}>{children}</button>,
}));

vi.mock('@/components/ui/dialog.jsx', () => ({
  Dialog: ({ children, open }) => (open ? <div data-testid="dialog">{children}</div> : null),
  DialogContent: ({ children }) => <div data-testid="dialog-content">{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <div>{children}</div>,
  DialogDescription: ({ children }) => <div>{children}</div>,
  DialogFooter: ({ children }) => <div data-testid="dialog-footer">{children}</div>,
}));

vi.mock('@/lib/apiError', () => ({
  extractApiErrorMessage: async () => 'mock error',
}));

// --- Import under test ---

import { render, screen, fireEvent } from '@testing-library/react';
import ContactsTable from '../ContactsTable.jsx';

// --- Tests ---

const defaultProps = {
  data: [],
  apiBaseUrl: '/sws/neo/contacts',
  token: 'test-token',
  onDataMutated: vi.fn(),
};

describe('ContactsTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders DataTable without crashing', () => {
    render(<ContactsTable {...defaultProps} />);
    expect(screen.getByTestId('data-table')).toBeInTheDocument();
  });

  it('renders with default empty data', () => {
    render(<ContactsTable />);
    expect(screen.getByTestId('data-table')).toBeInTheDocument();
  });

  it('does not show delete dialog initially', () => {
    render(<ContactsTable {...defaultProps} />);
    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
  });

  it('passes editingRowId as null when not editing', () => {
    render(<ContactsTable {...defaultProps} />);
    expect(screen.getByTestId('data-table')).toHaveAttribute('data-editing-row-id', '');
  });

  it('passes data and token to DataTable', () => {
    render(<ContactsTable {...defaultProps} data={[{ id: '1', name: 'Test' }]} />);
    expect(screen.getByTestId('data-table')).toBeInTheDocument();
  });
});
