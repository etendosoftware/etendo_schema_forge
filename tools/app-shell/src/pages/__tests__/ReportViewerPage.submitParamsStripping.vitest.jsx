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

function makeRenderResponse() {
  return {
    ok: true,
    text: () => Promise.resolve('<html></html>'),
    blob: () => Promise.resolve(new Blob(['x'])),
    json: () => Promise.resolve({}),
  };
}

// Same shape as ReportViewerPage.sectionVisibility.vitest.jsx's TRIAL_BALANCE_REPORT,
// plus a bPartnerId dimension (so the Group By select has a real option to pick — its
// options are derived client-side from sibling params' groupByValue, see
// renderSelectParam in ReportViewerPage.jsx) and a static hidden:true param (scenario 5).
//
// ETP-5128: submitParams only ever blanks a `visibleIf`-gated param whose condition
// currently evaluates false — it never touches a static `hidden: true` param. Static
// hidden:true fields (session-auto-populated context like org/accounting-schema) are
// never something a user "picks then un-picks"; blanking them broke real reports in
// production (accounting_schema_unresolved 422 on Aging Payables, zero rows on Balance
// Sheet / P&L) because org/glId/acctSchemaId are declared hidden:true, required:true,
// autoDefault:true with no UI control at all.
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
    { name: 'dateTo', type: 'date', label: { en_US: 'Date To' }, section: 'periodo' },
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
    // Static hidden:true (not visibleIf-gated) — proves submitParams only acts on
    // visibleIf-gated params (like groupBy above) and never on a static hidden:true one.
    {
      name: 'internalFlag',
      type: 'text',
      label: { en_US: 'Internal Flag' },
      section: 'opciones',
      hidden: true,
      default: 'secret-value',
    },
  ],
};

async function selectAccountLevel(user, optionValue) {
  const opener = screen.queryByTestId('field-accountLevel-chip') || screen.getByTestId('field-accountLevel');
  await user.click(opener);
  const option = await screen.findByTestId(`option-accountLevel-${optionValue}`);
  await user.click(option);
}

async function pickGroupBy(user) {
  const opener = screen.queryByTestId('field-groupBy-chip') || screen.getByTestId('field-groupBy');
  await user.click(opener);
  const option = await screen.findByTestId('option-groupBy-bpartner');
  await user.click(option);
}

function installMocks() {
  const renderCalls = [];
  globalThis.fetch = vi.fn().mockImplementation((url, opts) => {
    if (url === '/api/reports') return Promise.resolve(makeReportsListResponse([TRIAL_BALANCE_REPORT]));
    if (typeof url === 'string' && url.includes('/render')) {
      renderCalls.push({ url, body: opts?.body ? JSON.parse(opts.body) : null });
      return Promise.resolve(makeRenderResponse());
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) });
  });
  return renderCalls;
}

describe('ReportViewerPage — submitParams blanks hidden/visibleIf-gated params to "" in the render POST body (ETP-5128)', () => {
  let renderCalls;
  let user;

  beforeEach(() => {
    mockSearchParams = new URLSearchParams({ report: 'report-trial-balance' });
    mockSetSearchParams.mockClear();
    user = userEvent.setup();
    renderCalls = installMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('(1) sends groupBy while Account Level is Subaccount, then blanks it to "" once switched to a non-Subaccount level', async () => {
    render(<ReportViewerPage />);
    await waitFor(() => expect(screen.getByText('Grouping')).toBeInTheDocument());
    await user.click(screen.getByText('Grouping'));
    await waitFor(() => expect(screen.getByTestId('field-accountLevel-chip')).toBeInTheDocument());

    await pickGroupBy(user);
    await waitFor(() => expect(screen.getByTestId('field-groupBy-chip')).toHaveTextContent('Contact'));

    await user.click(screen.getByText('runReport'));
    await waitFor(() => expect(renderCalls).toHaveLength(1));
    expect(renderCalls[0].body.params.groupBy).toBe('bpartner');

    await selectAccountLevel(user, 'D');
    await waitFor(() => expect(screen.queryByText('Dimensions')).not.toBeInTheDocument());

    await user.click(screen.getByText('runReport'));
    await waitFor(() => expect(renderCalls).toHaveLength(2));
    // The key must stay present but blanked to '' — report-server echoes `params` verbatim
    // into `meta.params` with no defaulting, and report-trial-balance/template.hbs branches
    // on `{{#ifCond meta.params.groupBy '!==' ''}}`; a deleted key reads as `undefined`,
    // which is `!== ''` in JS and flips the template into the (empty) grouped branch.
    expect(renderCalls[1].body.params.groupBy).toBe('');
  });

  it('(2) switching Account Level back to Subaccount keeps the picked value in the sidebar UI and resubmits it', async () => {
    render(<ReportViewerPage />);
    await waitFor(() => expect(screen.getByText('Grouping')).toBeInTheDocument());
    await user.click(screen.getByText('Grouping'));
    await waitFor(() => expect(screen.getByTestId('field-accountLevel-chip')).toBeInTheDocument());

    await pickGroupBy(user);
    await waitFor(() => expect(screen.getByTestId('field-groupBy-chip')).toHaveTextContent('Contact'));

    await selectAccountLevel(user, 'D');
    await waitFor(() => expect(screen.queryByText('Dimensions')).not.toBeInTheDocument());

    await user.click(screen.getByText('runReport'));
    await waitFor(() => expect(renderCalls).toHaveLength(1));
    // The key must stay present but blanked to '' — see the comment on test (1).
    expect(renderCalls[0].body.params.groupBy).toBe('');

    await selectAccountLevel(user, 'S');
    await waitFor(() => expect(screen.getByText('Dimensions')).toBeInTheDocument());
    // The picked value is still shown in the sidebar — the fix only strips what gets
    // submitted while hidden, it never clears the underlying `params` state.
    expect(screen.getByTestId('field-groupBy-chip')).toHaveTextContent('Contact');

    await user.click(screen.getByText('runReport'));
    await waitFor(() => expect(renderCalls).toHaveLength(2));
    expect(renderCalls[1].body.params.groupBy).toBe('bpartner');
  });

  it('(3) the top-bar PDF button shares the same submitParams stripping as the sidebar submit', async () => {
    render(<ReportViewerPage />);
    await waitFor(() => expect(screen.getByText('Grouping')).toBeInTheDocument());
    await user.click(screen.getByText('Grouping'));
    await waitFor(() => expect(screen.getByTestId('field-accountLevel-chip')).toBeInTheDocument());

    await pickGroupBy(user);
    await waitFor(() => expect(screen.getByTestId('field-groupBy-chip')).toHaveTextContent('Contact'));

    await selectAccountLevel(user, 'C');
    await waitFor(() => expect(screen.queryByText('Dimensions')).not.toBeInTheDocument());

    await user.click(screen.getByText('PDF'));
    await waitFor(() => expect(renderCalls).toHaveLength(1));
    // The key must stay present but blanked to '' — see the comment on test (1).
    expect(renderCalls[0].body.params.groupBy).toBe('');
  });

  it('(4) an always-visible param (accountLevel) is present in the submitted body in every scenario', async () => {
    render(<ReportViewerPage />);
    await waitFor(() => expect(screen.getByText('Grouping')).toBeInTheDocument());
    await user.click(screen.getByText('Grouping'));
    await waitFor(() => expect(screen.getByTestId('field-accountLevel-chip')).toBeInTheDocument());

    await user.click(screen.getByText('runReport'));
    await waitFor(() => expect(renderCalls).toHaveLength(1));
    expect(renderCalls[0].body.params.accountLevel).toBe('S');

    await selectAccountLevel(user, 'E');
    await user.click(screen.getByText('runReport'));
    await waitFor(() => expect(renderCalls).toHaveLength(2));
    expect(renderCalls[1].body.params.accountLevel).toBe('E');
  });

  it('(5) a param with the static hidden:true flag is left untouched in the submitted body regardless of Account Level', async () => {
    render(<ReportViewerPage />);
    await waitFor(() => expect(screen.getByText('Grouping')).toBeInTheDocument());
    await user.click(screen.getByText('Grouping'));
    await waitFor(() => expect(screen.getByTestId('field-accountLevel-chip')).toBeInTheDocument());

    // internalFlag is hidden:true, so it never renders a control, but getDefaultParams()
    // seeds it with its `default` value into `params`. Because it has no `visibleIf`,
    // isParamVisible() always considers it visible for submitParams's purposes, so it is
    // NEVER blanked — only visibleIf-gated params (like groupBy above) are. Static
    // hidden:true fields represent session-auto-populated context (org/accounting-schema)
    // that was never user-picked-then-hidden, so submitParams must leave them alone (ETP-5128).
    expect(screen.queryByText('Internal Flag')).not.toBeInTheDocument();

    await user.click(screen.getByText('runReport'));
    await waitFor(() => expect(renderCalls).toHaveLength(1));
    expect(renderCalls[0].body.params.internalFlag).toBe('secret-value');
    // Sanity: a visible sibling param in the same section IS present with its real value.
    expect('showZero' in renderCalls[0].body.params).toBe(true);
  });
});
