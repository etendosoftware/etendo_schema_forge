// Coverage-recovery suite (ETP-4346 batch 2, part 2): targets the remaining
// reachable ReportSidebar interaction branches (select onChange, boolean
// checkbox toggle via row click + direct checkbox click, date field onChange)
// and the ReportList "click a card to open the viewer" navigation path — all
// left uncovered by the pre-existing ReportViewerPage suites.

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

let mockSearchParams = new URLSearchParams();
const mockSetSearchParams = vi.fn();

vi.mock('react-router-dom', () => ({
  useSearchParams: () => [mockSearchParams, mockSetSearchParams],
}));

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({
    token: 'test-token',
    selectedRole: { orgList: [] },
    selectedOrg: { id: 'org1' },
  }),
}));

vi.mock('@/components/layout/PageMetaContext', () => ({
  useSetPageMeta: vi.fn(),
}));

vi.mock('@/components/layout/FavoritesContext', () => ({
  useFavorites: () => ({
    toggleFavorite: vi.fn(),
    isFavorite: () => false,
  }),
}));

vi.mock('@/components/contract-ui/ProductSearchDrawer.jsx', () => ({
  default: () => null,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }) => <button {...props}>{children}</button>,
}));
vi.mock('@/components/ui/date-field', () => ({
  DateField: ({ value, onChange, className }) => (
    <input
      type="date"
      data-testid="date-field"
      className={className}
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }) => (open ? <div data-testid="dialog">{children}</div> : null),
  DialogContent: ({ children }) => <div>{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <h2>{children}</h2>,
}));

import ReportViewerPage from '../ReportViewerPage.jsx';

function makeReportsListResponse(reports) {
  return { ok: true, json: () => Promise.resolve(reports) };
}

describe('ReportViewerPage — ReportList card click navigates into the viewer', () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams();
    mockSetSearchParams.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls setSearchParams with the report id when a report card is clicked', async () => {
    const user = userEvent.setup();
    globalThis.fetch = vi.fn().mockResolvedValue(makeReportsListResponse([
      { id: 'report-42', title: { en_US: 'Clickable Report' }, type: 'listing', outputs: ['pdf'] },
    ]));

    render(<ReportViewerPage />);
    await waitFor(() => expect(screen.getByText('Clickable Report')).toBeInTheDocument());

    await user.click(screen.getByText('Clickable Report'));

    expect(mockSetSearchParams).toHaveBeenCalled();
    const passedParams = mockSetSearchParams.mock.calls[0][0];
    expect(passedParams.get('report')).toBe('report-42');
  });
});

// ETP-4899: a parameter can be conditionally required via `requiredIf`
// instead of a plain `required: true` — e.g. Profit & Loss's "Reference
// Year", only mandatory while its "Compare To" toggle is on. Both the
// sidebar's live asterisk (renderParam) and validateRequired() share the
// same isParamRequired() helper, so this fixture exercises both paths.
//
// `referenceYearId` also mirrors Profit & Loss exactly by pairing
// `requiredIf` with `visibleIf` on the SAME gate — that's how the real
// contract does it (both conditioned on `compareTo`), so one fixture
// covers the interlocking behavior instead of two divergent ones.
// `fromReferenceDate` mirrors Profit & Loss's date fields: `visibleIf`
// only, no `requiredIf` at all — hidden/shown, never required.
const REQUIRED_IF_REPORT = {
  id: 'report-required-if',
  title: { en_US: 'Required-If Report' },
  type: 'listing',
  outputs: ['pdf'],
  parameters: [
    { name: 'compareTo', type: 'toggle', label: { en_US: 'Compare To' }, section: 'options', default: false },
    {
      name: 'referenceYearId',
      type: 'text',
      label: { en_US: 'Reference Year' },
      section: 'options',
      requiredIf: { param: 'compareTo', equals: 'true' },
      visibleIf: { param: 'compareTo', equals: 'true' },
    },
    {
      name: 'fromReferenceDate',
      type: 'text',
      label: { en_US: 'From Reference Date' },
      section: 'options',
      visibleIf: { param: 'compareTo', equals: 'true' },
    },
  ],
};

describe('ReportViewerPage — ReportSidebar select / boolean / date interactions', () => {
  const SELECT_REPORT = {
    id: 'report-select',
    title: { en_US: 'Select Report' },
    type: 'listing',
    outputs: ['pdf'],
    parameters: [
      {
        name: 'groupBy', type: 'select', label: { en_US: 'Group By' }, section: 'primary',
        options: [
          { value: '', label: 'None' },
          { value: 'category', label: 'Category' },
        ],
      },
    ],
  };

  const BOOLEAN_REPORT = {
    id: 'report-bool',
    title: { en_US: 'Boolean Report' },
    type: 'listing',
    outputs: ['pdf'],
    parameters: [
      { name: 'showAll', type: 'boolean', label: { en_US: 'Show All' }, section: 'options' },
    ],
  };

  const DATE_REPORT = {
    id: 'report-date',
    title: { en_US: 'Date Report' },
    type: 'listing',
    outputs: ['pdf'],
    parameters: [
      { name: 'dateFrom', type: 'date', label: { en_US: 'Date From' }, section: 'primary', required: true },
    ],
  };

  beforeEach(() => {
    mockSetSearchParams.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ETP-4898: the `select` parameter type now renders a CreatableSearchSelect
  // (input[role=combobox] + portalled option list + SelectorChip) instead of a
  // native <select>, so the interaction is click-input -> click-option, and the
  // resulting value is asserted on the collapsed chip.
  it('changes the select value via onChange', async () => {
    mockSearchParams = new URLSearchParams({ report: 'report-select' });
    const user = userEvent.setup();
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === '/api/reports') return Promise.resolve(makeReportsListResponse([SELECT_REPORT]));
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) });
    });

    render(<ReportViewerPage />);
    await waitFor(() => expect(screen.getByText('Group By')).toBeInTheDocument());

    // Open the selector for the `groupBy` parameter (scoped by testid, not by the
    // generic combobox role — other comboboxes may coexist in the sidebar).
    await user.click(screen.getByTestId('field-groupBy'));

    // The dropdown is portalled to document.body -> query via `screen`.
    const option = await screen.findByTestId('option-groupBy-category');
    await user.click(option);

    // Selecting collapses the input into a chip carrying the chosen option label.
    const chip = await screen.findByTestId('field-groupBy-chip');
    expect(chip).toHaveTextContent('Category');
    expect(screen.queryByTestId('field-groupBy')).toBeNull();
  });

  it('toggles a boolean parameter by clicking the row container', async () => {
    mockSearchParams = new URLSearchParams({ report: 'report-bool' });
    const user = userEvent.setup();
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === '/api/reports') return Promise.resolve(makeReportsListResponse([BOOLEAN_REPORT]));
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) });
    });

    render(<ReportViewerPage />);
    await waitFor(() => expect(screen.getByText('Show All')).toBeInTheDocument());

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).not.toBeChecked();

    // Click the surrounding row (not the checkbox itself) to exercise the div's onClick toggle
    await user.click(screen.getByText('Show All'));
    expect(checkbox).toBeChecked();

    // Clicking again toggles it back off
    await user.click(screen.getByText('Show All'));
    expect(checkbox).not.toBeChecked();
  });

  it('toggles a boolean parameter by clicking the checkbox directly (stops row propagation)', async () => {
    mockSearchParams = new URLSearchParams({ report: 'report-bool' });
    const user = userEvent.setup();
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === '/api/reports') return Promise.resolve(makeReportsListResponse([BOOLEAN_REPORT]));
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) });
    });

    render(<ReportViewerPage />);
    await waitFor(() => expect(screen.getByText('Show All')).toBeInTheDocument());

    const checkbox = screen.getByRole('checkbox');
    await user.click(checkbox);
    expect(checkbox).toBeChecked();
  });

  it('changes a date field value and clears the required error on change', async () => {
    mockSearchParams = new URLSearchParams({ report: 'report-date' });
    const user = userEvent.setup();
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === '/api/reports') return Promise.resolve(makeReportsListResponse([DATE_REPORT]));
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) });
    });

    render(<ReportViewerPage />);
    await waitFor(() => expect(screen.getByText('Date From')).toBeInTheDocument());

    // Submitting with the required date empty shows the error
    await user.click(screen.getByText('runReport'));
    await waitFor(() => expect(screen.getByText('required')).toBeInTheDocument());

    // Setting a value should clear the error (handleChange clears errors[name] when value is truthy)
    const dateField = screen.getByTestId('date-field');
    await user.type(dateField, '2024-01-15');

    await waitFor(() => {
      expect(screen.queryByText('required')).not.toBeInTheDocument();
    });
  });
});

describe('ReportViewerPage — ReportSidebar conditional required (requiredIf, ETP-4899)', () => {
  beforeEach(() => {
    mockSetSearchParams.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ETP-4899 (visibleIf): `referenceYearId` and `fromReferenceDate` mirror
  // Profit & Loss — both gated on `compareTo`, both hidden entirely (not just
  // asterisk-free) while the toggle is off. `referenceYearId` also carries
  // `requiredIf` on the same gate; `fromReferenceDate` carries only
  // `visibleIf`, so it never gets an asterisk regardless of the toggle.
  it('hides visibleIf-gated params entirely while the gating toggle is off, and allows submit', async () => {
    mockSearchParams = new URLSearchParams({ report: 'report-required-if' });
    const user = userEvent.setup();
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === '/api/reports') return Promise.resolve(makeReportsListResponse([REQUIRED_IF_REPORT]));
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) });
    });

    render(<ReportViewerPage />);
    await waitFor(() => expect(screen.getByText('Compare To')).toBeInTheDocument());

    // Neither visibleIf-gated param renders at all while compareTo is off (default false).
    expect(screen.queryByText('Reference Year')).not.toBeInTheDocument();
    expect(screen.queryByText('From Reference Date')).not.toBeInTheDocument();

    // Submitting must not raise a "required" error for the (invisible) referenceYearId.
    await user.click(screen.getByText('runReport'));
    expect(screen.queryByText('required')).not.toBeInTheDocument();
  });

  it('reveals visibleIf-gated params, with the asterisk only on the one carrying requiredIf, once the toggle is switched on', async () => {
    mockSearchParams = new URLSearchParams({ report: 'report-required-if' });
    const user = userEvent.setup();
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === '/api/reports') return Promise.resolve(makeReportsListResponse([REQUIRED_IF_REPORT]));
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) });
    });

    render(<ReportViewerPage />);
    await waitFor(() => expect(screen.getByText('Compare To')).toBeInTheDocument());

    // Turn the gating toggle on — both gated params appear live, no submit needed.
    const toggle = screen.getByRole('switch');
    await user.click(toggle);

    const yearLabel = await screen.findByText('Reference Year');
    await waitFor(() => expect(yearLabel.closest('label')).toHaveTextContent('*'));

    // fromReferenceDate is visible too, but was never given requiredIf — no asterisk.
    const dateLabel = screen.getByText('From Reference Date');
    expect(dateLabel.closest('label')).not.toHaveTextContent('*');

    // Now submitting with referenceYearId empty must show the required error.
    await user.click(screen.getByText('runReport'));
    await waitFor(() => expect(screen.getByText('required')).toBeInTheDocument());
  });

  it('toggling the gate back off re-hides both visibleIf-gated params and clears the requirement', async () => {
    mockSearchParams = new URLSearchParams({ report: 'report-required-if' });
    const user = userEvent.setup();
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === '/api/reports') return Promise.resolve(makeReportsListResponse([REQUIRED_IF_REPORT]));
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) });
    });

    render(<ReportViewerPage />);
    await waitFor(() => expect(screen.getByText('Compare To')).toBeInTheDocument());

    const toggle = screen.getByRole('switch');
    await user.click(toggle); // on
    await waitFor(() => expect(screen.getByText('Reference Year')).toBeInTheDocument());
    expect(screen.getByText('From Reference Date')).toBeInTheDocument();

    await user.click(toggle); // back off
    await waitFor(() => expect(screen.queryByText('Reference Year')).not.toBeInTheDocument());
    expect(screen.queryByText('From Reference Date')).not.toBeInTheDocument();

    await user.click(screen.getByText('runReport'));
    expect(screen.queryByText('required')).not.toBeInTheDocument();
  });
});

// ETP-4899 (visibleIf regression): a plain parameter with neither `visibleIf`
// nor `hidden` always renders — baseline already implicit across the other
// suites here (e.g. `groupBy`, `showAll`, `dateFrom`, `compareTo` above all
// render unconditionally), asserted once explicitly for the helper itself.
describe('ReportViewerPage — ReportSidebar param visibility baseline (no visibleIf, ETP-4899)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('always renders a parameter that declares neither visibleIf nor hidden', async () => {
    mockSearchParams = new URLSearchParams({ report: 'report-plain-param' });
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === '/api/reports') {
        return Promise.resolve(makeReportsListResponse([{
          id: 'report-plain-param',
          title: { en_US: 'Plain Param Report' },
          type: 'listing',
          outputs: ['pdf'],
          parameters: [
            { name: 'plainField', type: 'text', label: { en_US: 'Plain Field' }, section: 'options' },
          ],
        }]));
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) });
    });

    render(<ReportViewerPage />);
    await waitFor(() => expect(screen.getByText('Plain Field')).toBeInTheDocument());
  });
});
