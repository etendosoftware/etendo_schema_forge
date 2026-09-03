// ETP-5128: an accordion section (`report.sections[]`) can now carry the same
// `visibleIf: {param, equals}` shape a field already had (ETP-4899). Unlike a
// field, a section with a false `visibleIf` disappears ENTIRELY (header gone,
// not just collapsed-empty) — the pre-existing "always render, even with no
// visible fields yet" rule stays true only for sections that never opted in
// via `visibleIf`. Fixture mirrors the real Trial Balance report-contract.json
// (artifacts/report-trial-balance/report-contract.json): the "dimensiones"
// section and the `groupBy` field both gate on `accountLevel === 'S'`.

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

// Mirrors artifacts/report-trial-balance/report-contract.json's shape:
// sections `periodo` (no visibleIf), `alcance` (no visibleIf — the sibling
// used to protect the always-render baseline), `dimensiones` (visibleIf
// accountLevel===S), `agrupacion` (no visibleIf, holds accountLevel itself +
// the visibleIf-gated groupBy field), `opciones` (no visibleIf).
const TRIAL_BALANCE_REPORT = {
  id: 'report-trial-balance',
  title: { en_US: 'Trial Balance' },
  type: 'listing',
  outputs: ['pdf'],
  sections: [
    { id: 'periodo', label: { en_US: 'Period' } },
    { id: 'alcance', label: { en_US: 'Scope' } },
    { id: 'dimensiones', label: { en_US: 'Dimensions' }, visibleIf: { param: 'accountLevel', equals: 'S' } },
    { id: 'agrupacion', label: { en_US: 'Grouping' } },
    { id: 'opciones', label: { en_US: 'Options' } },
  ],
  parameters: [
    { name: 'dateFrom', type: 'date', label: { en_US: 'Date From' }, section: 'periodo' },
    { name: 'orgId', type: 'text', label: { en_US: 'Organization' }, section: 'alcance' },
    {
      name: 'bPartnerId',
      type: 'text',
      label: { en_US: 'Contact' },
      section: 'dimensiones',
      groupByValue: 'bpartner',
    },
    {
      name: 'accountLevel',
      type: 'select',
      label: { en_US: 'Account Level' },
      required: true,
      default: 'S',
      section: 'agrupacion',
      options: [
        { value: 'S', label: { en_US: 'Subaccount' } },
        { value: 'D', label: { en_US: 'Breakdown' } },
        { value: 'C', label: { en_US: 'Account' } },
        { value: 'E', label: { en_US: 'Heading' } },
      ],
    },
    {
      name: 'groupBy',
      type: 'select',
      label: { en_US: 'Group results by' },
      section: 'agrupacion',
      visibleIf: { param: 'accountLevel', equals: 'S' },
    },
    { name: 'showZero', type: 'boolean', label: { en_US: 'Show Zero Balances' }, section: 'opciones' },
  ],
};

// `accountLevel` has a `default: 'S'`, so it renders as a pre-selected chip
// on first render, not an empty input — the CreatableSearchSelect chip
// re-opens the dropdown on click (same as the empty-field input does).
async function selectAccountLevel(user, optionValue) {
  const opener = screen.queryByTestId('field-accountLevel-chip') || screen.getByTestId('field-accountLevel');
  await user.click(opener);
  const option = await screen.findByTestId(`option-accountLevel-${optionValue}`);
  await user.click(option);
}

describe('ReportViewerPage — accordion section visibleIf (ETP-5128, Trial Balance)', () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams({ report: 'report-trial-balance' });
    mockSetSearchParams.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('(a) shows the Dimensions section and the Group results by field when Account Level defaults to Subaccount', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === '/api/reports') return Promise.resolve(makeReportsListResponse([TRIAL_BALANCE_REPORT]));
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) });
    });

    render(<ReportViewerPage />);
    await waitFor(() => expect(screen.getByText('Grouping')).toBeInTheDocument());

    expect(screen.getByText('Dimensions')).toBeInTheDocument();

    // Open the Grouping accordion section to reach its fields (only the
    // first section is auto-open by default, per report.sections[0]).
    await userEvent.setup().click(screen.getByText('Grouping'));
    await waitFor(() => expect(screen.getByText('Group results by')).toBeInTheDocument());
  });

  it('(b) hides the Dimensions section header and Group results by entirely once Account Level is not Subaccount, while Account Level itself stays', async () => {
    const user = userEvent.setup();
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === '/api/reports') return Promise.resolve(makeReportsListResponse([TRIAL_BALANCE_REPORT]));
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) });
    });

    render(<ReportViewerPage />);
    await waitFor(() => expect(screen.getByText('Grouping')).toBeInTheDocument());

    // Open Grouping to reach the accountLevel select, and switch it away from S.
    await user.click(screen.getByText('Grouping'));
    await waitFor(() => expect(screen.getByTestId('field-accountLevel-chip')).toBeInTheDocument());
    await selectAccountLevel(user, 'D');

    // The Dimensions section header itself must be gone from the DOM — not
    // just collapsed. queryByText resolves to null when truly absent.
    await waitFor(() => expect(screen.queryByText('Dimensions')).not.toBeInTheDocument());
    expect(screen.queryByText('Group results by')).not.toBeInTheDocument();

    // Account Level (and its Grouping section, which carries no visibleIf
    // itself) remains visible.
    expect(screen.getByTestId('field-accountLevel-chip')).toBeInTheDocument();
  });

  it('(c) re-shows both Dimensions and Group results by after switching Account Level back to Subaccount', async () => {
    const user = userEvent.setup();
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === '/api/reports') return Promise.resolve(makeReportsListResponse([TRIAL_BALANCE_REPORT]));
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) });
    });

    render(<ReportViewerPage />);
    await waitFor(() => expect(screen.getByText('Grouping')).toBeInTheDocument());

    await user.click(screen.getByText('Grouping'));
    await waitFor(() => expect(screen.getByTestId('field-accountLevel-chip')).toBeInTheDocument());

    await selectAccountLevel(user, 'D');
    await waitFor(() => expect(screen.queryByText('Dimensions')).not.toBeInTheDocument());

    await selectAccountLevel(user, 'S');
    await waitFor(() => expect(screen.getByText('Dimensions')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('Group results by')).toBeInTheDocument());
  });

  it('(d) keeps a sibling section without visibleIf (Scope) visible regardless of Account Level', async () => {
    const user = userEvent.setup();
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === '/api/reports') return Promise.resolve(makeReportsListResponse([TRIAL_BALANCE_REPORT]));
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) });
    });

    render(<ReportViewerPage />);
    await waitFor(() => expect(screen.getByText('Scope')).toBeInTheDocument());

    await user.click(screen.getByText('Grouping'));
    await waitFor(() => expect(screen.getByTestId('field-accountLevel-chip')).toBeInTheDocument());
    await selectAccountLevel(user, 'D');

    // Scope has no visibleIf — it must keep rendering (pre-existing baseline)
    // regardless of the Dimensions section being hidden alongside it.
    await waitFor(() => expect(screen.queryByText('Dimensions')).not.toBeInTheDocument());
    expect(screen.getByText('Scope')).toBeInTheDocument();
  });
});
