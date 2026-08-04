// --- Mocks (before imports) ---

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLocale: () => ({ genericLabels: {} }),
}));

vi.mock('@/components/contract-ui', () => ({
  DataTable: (props) => (
    <div
      data-testid="data-table"
      data-editing-row-id={props.editingRowId ?? ''}
      data-hidden-columns={JSON.stringify(props.hiddenColumns ?? null)}
    />
  ),
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

  // QA cross-check (ETP-4609 continuation) — ContactsTable declares its own
  // local `hiddenColumns={HIDDEN_COLS}` (= ['__contactType']) and then spreads
  // `{...rest}` AFTER it, same shape as the pre-fix ProductCustomTable.jsx bug
  // (ListView.jsx unconditionally forwards its own `hiddenColumns = []` default
  // to whatever Table it renders — see ListView.jsx ~line 238 / ~line 930).
  // Unlike ProductCustomTable, this file was NOT touched by ETP-4609 and does
  // NOT merge the incoming value — so ListView's default `[]` silently
  // clobbers HIDDEN_COLS here too, and `__contactType` would render as a
  // visible column instead of staying hidden.
  //
  // NOTE: as of this writing, `ContactsTable.jsx` is not imported by
  // `contacts/index.jsx` (which renders the generated `BusinessPartnerPage`
  // instead) or by any other window file — it appears to be dead code, so
  // this bug is not currently reachable from any live window. This test
  // documents the bug so it's either fixed or the file is confirmed
  // dead/removed. Skipped (not failed) because the bug predates and is out
  // of scope for ETP-4609 — see QA report on that PR for the repro. Un-skip
  // once someone picks up the fix (or delete both if the file is removed as
  // dead code).
  it.skip('keeps HIDDEN_COLS even when the parent forwards its own hiddenColumns=[] (ListView default)', () => {
    render(<ContactsTable {...defaultProps} hiddenColumns={[]} />);
    const hidden = JSON.parse(screen.getByTestId('data-table').getAttribute('data-hidden-columns'));
    expect(hidden).toContain('__contactType');
  });
});
