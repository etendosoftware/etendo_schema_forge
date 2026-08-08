// Mocks must come before imports (Vitest hoisting)

import { createStableUseApiFetchMock } from '@/test/mockUseApiFetch.js';

vi.mock('@/i18n', () => ({
  useUI: () => (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key),
}));

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ selectedOrg: { id: 'ORG_1', name: 'Acme' }, token: 'test-token' }),
}));

vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: createStableUseApiFetchMock(),
}));

vi.mock('@/components/contract-ui/LocationModalField.jsx', () => ({
  default: ({ value, onChange, apiBaseUrl }) => (
    <button
      type="button"
      data-testid="LocationModalField__stub"
      data-api-base-url={apiBaseUrl}
      onClick={() => onChange('LOC_2', 'New Address - Spain')}>
      {value || 'no-location'}
    </button>
  ),
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: { success: (...args) => toastSuccess(...args), error: (...args) => toastError(...args) },
}));

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import OrganizationPage from '../OrganizationPage.jsx';

const API_BASE_URL = '/sws/neo/organization';
const ORG_ID = 'ORG_1';

// NEO Headless wraps even a GET-by-id record in response.data[0] (an array).
function jsonResponse(record, ok = true, status = 200) {
  return Promise.resolve({ ok, status, json: async () => ({ response: { data: record == null ? [] : [record] } }) });
}

function makeFetchMock(handlers) {
  return vi.fn((url, options) => {
    for (const [substr, handler] of handlers) {
      if (url.includes(substr)) return handler(options);
    }
    return jsonResponse(null);
  });
}

describe('OrganizationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the loaded header/info fields and hides the unsaved-changes banner until something changes', async () => {
    globalThis.fetch = makeFetchMock([
      [`/organization/organization/${ORG_ID}`, () => jsonResponse({ name: 'Acme', socialName: 'Acme S.A.', 'currency$_identifier': 'EUR', etgoBusinessType: 'CO' })],
      [`/organization/information/${ORG_ID}`, () => jsonResponse({ taxID: 'B123', locationAddress: 'LOC_1', 'locationAddress$_identifier': 'Main St - Madrid - España' })],
    ]);

    render(<OrganizationPage token="test-token" apiBaseUrl={API_BASE_URL} />);

    await waitFor(() => expect(screen.getByTestId('OrganizationPage__name')).toHaveValue('Acme'));
    expect(screen.getByTestId('OrganizationPage__legal-name')).toHaveValue('Acme S.A.');
    expect(screen.getByTestId('OrganizationPage__taxid')).toHaveValue('B123');
    // Country/Currency render as read-only flag/code pills (not <input>s) per the
    // reference design — see countryFlag.js for the name -> emoji lookup.
    expect(screen.getByTestId('OrganizationPage__currency')).toHaveTextContent('EUR');
    expect(screen.getByTestId('OrganizationPage__country')).toHaveTextContent('🇪🇸');
    expect(screen.getByTestId('OrganizationPage__country')).toHaveTextContent('España');
    expect(screen.queryByTestId('OrganizationPage__unsaved-banner')).not.toBeInTheDocument();

    // Visual fidelity pass (ETP-4749 review round): page intro, sentence-case section
    // titles + descriptions, and business-type card descriptions.
    expect(screen.getByTestId('OrganizationPage__intro')).toHaveTextContent('organizationPageIntro');
    expect(screen.getByTestId('OrganizationPage__section-identity')).toHaveTextContent('orgSectionIdentityDesc');
    expect(screen.getByTestId('OrganizationPage__section-fiscal')).toHaveTextContent('orgSectionFiscalDesc');
    expect(screen.getByTestId('OrganizationPage__section-contact')).toHaveTextContent('orgSectionContactDesc');
    expect(screen.getByTestId('BusinessTypeCards__option-CO')).toHaveTextContent('orgBusinessTypeCompanyDesc');

    // Regression guard: the fiscal-address field must point LocationModalField at the
    // `warehouse` spec's base, not `organization`'s own — `organization` has no "location"
    // entity registered in NEO (no ETGO_SF_ENTITY row, no handler), so pointing it at its
    // own apiBaseUrl silently 404s every request (blank prefill + "No se pudieron cargar
    // los países"). WarehouseLocationHandler.java is spec-agnostic generic C_Location CRUD,
    // so reusing it cross-spec is the correct fix until organization gets its own entity.
    expect(screen.getByTestId('LocationModalField__stub')).toHaveAttribute('data-api-base-url', '/sws/neo/warehouse');
  });

  it('marks the matching business type card as selected (check-dot visible) when etgoBusinessType is already set', async () => {
    globalThis.fetch = makeFetchMock([
      [`/organization/organization/${ORG_ID}`, () => jsonResponse({ name: 'Acme', etgoBusinessType: 'AD' })],
      [`/organization/information/${ORG_ID}`, () => jsonResponse({})],
    ]);

    render(<OrganizationPage token="test-token" apiBaseUrl={API_BASE_URL} />);
    await waitFor(() => expect(screen.getByTestId('OrganizationPage__name')).toBeInTheDocument());

    expect(screen.getByTestId('BusinessTypeCards__option-AD')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('BusinessTypeCards__check-AD')).toBeInTheDocument();
    expect(screen.getByTestId('BusinessTypeCards__option-CO')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByTestId('BusinessTypeCards__check-CO')).not.toBeInTheDocument();

    // Selected-state colors must match the reference design's tokens exactly
    // (ETP-4749 review round: yellow soft bg + yellow-line border + solid yellow
    // dot) — regression guard against silently drifting back to a generic
    // primary/border color, which is the bug this round of review caught.
    // Real --eg-yellow* CSS custom properties, defined in
    // schema_forge_core/packages/app-shell-core/src/styles.css since the review round 4
    // token move — no more inline hex literals in this component's className.
    expect(screen.getByTestId('BusinessTypeCards__option-AD').className).toContain('bg-[var(--eg-yellow-soft)]');
    expect(screen.getByTestId('BusinessTypeCards__option-AD').className).toContain('border-[var(--eg-yellow-line)]');
    expect(screen.getByTestId('BusinessTypeCards__dot-AD').className).toContain('bg-[var(--eg-yellow)]');
    expect(screen.getByTestId('BusinessTypeCards__option-CO').className).not.toContain('bg-[var(--eg-yellow-soft)]');
  });

  it('preselects no business type card when etgoBusinessType is absent', async () => {
    globalThis.fetch = makeFetchMock([
      [`/organization/organization/${ORG_ID}`, () => jsonResponse({ name: 'Acme' })],
      [`/organization/information/${ORG_ID}`, () => jsonResponse({})],
    ]);

    render(<OrganizationPage token="test-token" apiBaseUrl={API_BASE_URL} />);
    await waitFor(() => expect(screen.getByTestId('OrganizationPage__name')).toBeInTheDocument());

    expect(screen.getByTestId('BusinessTypeCards__option-CO')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('BusinessTypeCards__option-FL')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('BusinessTypeCards__option-AD')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByTestId('BusinessTypeCards__check-CO')).not.toBeInTheDocument();
    expect(screen.queryByTestId('BusinessTypeCards__check-FL')).not.toBeInTheDocument();
    expect(screen.queryByTestId('BusinessTypeCards__check-AD')).not.toBeInTheDocument();
  });

  describe('deriveCountryFromIdentifier heuristic — País pill', () => {
    it('shows an em-dash and no flag when the fiscal address has no identifier at all', async () => {
      globalThis.fetch = makeFetchMock([
        [`/organization/organization/${ORG_ID}`, () => jsonResponse({ name: 'Acme' })],
        [`/organization/information/${ORG_ID}`, () => jsonResponse({ locationAddress: '' })],
      ]);

      render(<OrganizationPage token="test-token" apiBaseUrl={API_BASE_URL} />);
      await waitFor(() => expect(screen.getByTestId('OrganizationPage__name')).toBeInTheDocument());

      // header and info load from two independent fetches — wait on the country pill's
      // own settled content, not just on `name`, so this doesn't race under heavy
      // parallel test load where the two responses can resolve a tick apart.
      await waitFor(() => expect(screen.getByTestId('OrganizationPage__country')).toHaveTextContent('—'));
      const country = screen.getByTestId('OrganizationPage__country');
      expect(country.textContent).not.toMatch(/[\u{1F1E6}-\u{1F1FF}]/u);
    });

    it('does not crash on a single-segment identifier (no " - " separator) and shows it without a flag', async () => {
      globalThis.fetch = makeFetchMock([
        [`/organization/organization/${ORG_ID}`, () => jsonResponse({ name: 'Acme' })],
        [`/organization/information/${ORG_ID}`, () => jsonResponse({
          locationAddress: 'LOC_1',
          'locationAddress$_identifier': 'JustOneSegmentNoDashes',
        })],
      ]);

      render(<OrganizationPage token="test-token" apiBaseUrl={API_BASE_URL} />);
      await waitFor(() => expect(screen.getByTestId('OrganizationPage__name')).toBeInTheDocument());

      // Same race-avoidance as the test above: wait on the country pill's own settled
      // content rather than assuming it's already there once `name` renders.
      await waitFor(() => expect(screen.getByTestId('OrganizationPage__country')).toHaveTextContent('JustOneSegmentNoDashes'));
      const country = screen.getByTestId('OrganizationPage__country');
      // The whole single-segment string is treated as the "country" — not a real country
      // name, so countryFlag.js has no match and renders no flag, but it must not crash.
      expect(country.textContent).not.toMatch(/[\u{1F1E6}-\u{1F1FF}]/u);
    });
  });

  it('sources Email/Phone/Website directly from AD_OrgInfo (etgoEmail/etgoPhone/etgoWeb) and keeps them always editable', async () => {
    globalThis.fetch = makeFetchMock([
      [`/organization/organization/${ORG_ID}`, () => jsonResponse({ name: 'Acme' })],
      [`/organization/information/${ORG_ID}`, () => jsonResponse({ etgoEmail: 'hi@acme.com', etgoPhone: '123', etgoWeb: 'acme.com' })],
    ]);

    render(<OrganizationPage token="test-token" apiBaseUrl={API_BASE_URL} />);

    await waitFor(() => expect(screen.getByTestId('OrganizationPage__email')).toHaveValue('hi@acme.com'));
    expect(screen.getByTestId('OrganizationPage__phone')).toHaveValue('123');
    expect(screen.getByTestId('OrganizationPage__web')).toHaveValue('acme.com');

    // These fields have no Business Partner dependency any more — always enabled,
    // never gray/disabled, regardless of any linked-BP state.
    expect(screen.getByTestId('OrganizationPage__email')).not.toBeDisabled();
    expect(screen.getByTestId('OrganizationPage__phone')).not.toBeDisabled();
    expect(screen.getByTestId('OrganizationPage__web')).not.toBeDisabled();
    expect(screen.queryByTestId('OrganizationPage__no-bp-notice')).not.toBeInTheDocument();
    expect(screen.queryByTestId('OrganizationPage__contact-error-notice')).not.toBeInTheDocument();
  });

  it('reveals the unsaved-changes banner after picking a business type card, and Discard restores the baseline', async () => {
    globalThis.fetch = makeFetchMock([
      [`/organization/organization/${ORG_ID}`, () => jsonResponse({ name: 'Acme', etgoBusinessType: '' })],
      [`/organization/information/${ORG_ID}`, () => jsonResponse({})],
    ]);

    render(<OrganizationPage token="test-token" apiBaseUrl={API_BASE_URL} />);
    await waitFor(() => expect(screen.getByTestId('OrganizationPage__name')).toBeInTheDocument());

    expect(screen.queryByTestId('OrganizationPage__unsaved-banner')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('BusinessTypeCards__option-FL'));
    expect(await screen.findByTestId('OrganizationPage__unsaved-banner')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('OrganizationPage__discard'));
    await waitFor(() => expect(screen.queryByTestId('OrganizationPage__unsaved-banner')).not.toBeInTheDocument());
  });

  it('adds extra bottom padding to the scroll container only while the unsaved-changes banner is visible (review round: banner was clipping "Sitio web")', async () => {
    globalThis.fetch = makeFetchMock([
      [`/organization/organization/${ORG_ID}`, () => jsonResponse({ name: 'Acme', etgoBusinessType: '' })],
      [`/organization/information/${ORG_ID}`, () => jsonResponse({})],
    ]);

    render(<OrganizationPage token="test-token" apiBaseUrl={API_BASE_URL} />);
    await waitFor(() => expect(screen.getByTestId('OrganizationPage__name')).toBeInTheDocument());

    // Root's first child is the scroll container (no dedicated data-testid of its own).
    const scrollContainer = () => screen.getByTestId('OrganizationPage__root').firstElementChild;

    // Clean state: plain p-4, no extra bottom padding — a permanent gap here was
    // explicitly rejected earlier (leaves empty space when there's nothing to save).
    expect(scrollContainer().className).not.toMatch(/pb-\[77px\]/);

    fireEvent.click(screen.getByTestId('BusinessTypeCards__option-FL'));
    await screen.findByTestId('OrganizationPage__unsaved-banner');

    // Dirty state: 77px = the normal 16px (p-4) + the banner's own measured height
    // (61px = h-9 button + py-3*2 + border-t), enough for the last field to clear it.
    expect(scrollContainer().className).toMatch(/pb-\[77px\]/);

    fireEvent.click(screen.getByTestId('OrganizationPage__discard'));
    await waitFor(() => expect(screen.queryByTestId('OrganizationPage__unsaved-banner')).not.toBeInTheDocument());
    expect(scrollContainer().className).not.toMatch(/pb-\[77px\]/);
  });

  it('Save PATCHes organization + information (including etgoEmail/Phone/Web) and shows a success toast', async () => {
    globalThis.fetch = makeFetchMock([
      [`/organization/organization/${ORG_ID}`, () => jsonResponse({ name: 'Acme', socialName: 'Acme SL', etgoBusinessType: 'CO' })],
      [`/organization/information/${ORG_ID}`, () => jsonResponse({ taxID: 'B1', locationAddress: 'LOC_1', etgoEmail: 'hi@acme.com' })],
    ]);

    render(<OrganizationPage token="test-token" apiBaseUrl={API_BASE_URL} />);
    await waitFor(() => expect(screen.getByTestId('OrganizationPage__name')).toHaveValue('Acme'));

    fireEvent.change(screen.getByTestId('OrganizationPage__name'), { target: { value: 'Acme Corp' } });
    expect(await screen.findByTestId('OrganizationPage__unsaved-banner')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('OrganizationPage__save'));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('savedSuccessfully'));
    expect(screen.queryByTestId('OrganizationPage__unsaved-banner')).not.toBeInTheDocument();

    const patchCalls = globalThis.fetch.mock.calls.filter(([, opts]) => opts?.method === 'PATCH');
    expect(patchCalls.some(([url]) => url.includes(`/organization/organization/${ORG_ID}`))).toBe(true);
    const infoPatch = patchCalls.find(([url]) => url.includes(`/organization/information/${ORG_ID}`));
    expect(infoPatch).toBeTruthy();
    expect(JSON.parse(infoPatch[1].body)).toMatchObject({ etgoEmail: 'hi@acme.com' });
  });

  describe('BUG-1 — required-field validation before save (QA rejection round)', () => {
    it('blocks Save, shows an inline error under NIF, and never calls the backend when NIF is emptied', async () => {
      globalThis.fetch = makeFetchMock([
        [`/organization/organization/${ORG_ID}`, () => jsonResponse({ name: 'Acme', socialName: 'Acme SL', etgoBusinessType: 'CO' })],
        [`/organization/information/${ORG_ID}`, () => jsonResponse({ taxID: 'B123', locationAddress: 'LOC_1' })],
      ]);

      render(<OrganizationPage token="test-token" apiBaseUrl={API_BASE_URL} />);
      await waitFor(() => expect(screen.getByTestId('OrganizationPage__taxid')).toHaveValue('B123'));

      fireEvent.change(screen.getByTestId('OrganizationPage__taxid'), { target: { value: '' } });
      fireEvent.click(screen.getByTestId('OrganizationPage__save'));

      expect(await screen.findByTestId('OrganizationPage__error-taxID')).toHaveTextContent('fieldRequired');
      expect(toastError).toHaveBeenCalledWith('requiredFieldsMissing');
      expect(toastSuccess).not.toHaveBeenCalled();

      // The whole point of the fix: reproduce the reported bug (empty NIF -> raw 500 toast)
      // by proving no PATCH ever leaves the browser once validation fails.
      const patchCalls = globalThis.fetch.mock.calls.filter(([, opts]) => opts?.method === 'PATCH');
      expect(patchCalls).toHaveLength(0);

      // Fixing the field and retrying clears that specific error.
      fireEvent.change(screen.getByTestId('OrganizationPage__taxid'), { target: { value: 'B999' } });
      expect(screen.queryByTestId('OrganizationPage__error-taxID')).not.toBeInTheDocument();
    });

    it('reports every missing required field at once (name, NIF, legal name, fiscal address)', async () => {
      globalThis.fetch = makeFetchMock([
        [`/organization/organization/${ORG_ID}`, () => jsonResponse({ name: '', socialName: '', etgoBusinessType: 'CO' })],
        [`/organization/information/${ORG_ID}`, () => jsonResponse({ taxID: '', locationAddress: '' })],
      ]);

      render(<OrganizationPage token="test-token" apiBaseUrl={API_BASE_URL} />);
      await waitFor(() => expect(screen.getByTestId('OrganizationPage__name')).toBeInTheDocument());

      // Something must change for the unsaved-banner (and thus Save) to be reachable.
      fireEvent.click(screen.getByTestId('BusinessTypeCards__option-FL'));
      fireEvent.click(await screen.findByTestId('OrganizationPage__save'));

      expect(await screen.findByTestId('OrganizationPage__error-name')).toBeInTheDocument();
      expect(screen.getByTestId('OrganizationPage__error-taxID')).toBeInTheDocument();
      expect(screen.getByTestId('OrganizationPage__error-socialName')).toBeInTheDocument();
      expect(screen.getByTestId('OrganizationPage__error-locationAddress')).toBeInTheDocument();
      const patchCalls = globalThis.fetch.mock.calls.filter(([, opts]) => opts?.method === 'PATCH');
      expect(patchCalls).toHaveLength(0);
    });
  });

  describe('Contact field format validation (email/phone/website) — reused from Contacts (recipientEdits.js)', () => {
    // All required fields (name/taxID/socialName/locationAddress) are pre-filled and valid
    // in every test below, so only the format checks under test can block Save — BUG-1's
    // required-field guard runs first and would otherwise mask these.
    const VALID_BASE = () => makeFetchMock([
      [`/organization/organization/${ORG_ID}`, () => jsonResponse({ name: 'Acme', socialName: 'Acme SL', etgoBusinessType: 'CO' })],
      [`/organization/information/${ORG_ID}`, () => jsonResponse({ taxID: 'B123', locationAddress: 'LOC_1' })],
    ]);

    it('blocks Save with the same sendModalInvalidEmail toast Contacts uses, when Email is malformed', async () => {
      globalThis.fetch = VALID_BASE();
      render(<OrganizationPage token="test-token" apiBaseUrl={API_BASE_URL} />);
      await waitFor(() => expect(screen.getByTestId('OrganizationPage__taxid')).toHaveValue('B123'));

      fireEvent.change(screen.getByTestId('OrganizationPage__email'), { target: { value: 'not-an-email' } });
      fireEvent.click(screen.getByTestId('OrganizationPage__save'));

      await waitFor(() => expect(toastError).toHaveBeenCalledWith('sendModalInvalidEmail'));
      expect(toastSuccess).not.toHaveBeenCalled();
      // No inline FieldError for this one — toast-only, matching Contacts' UX exactly
      // (unlike BUG-1's required-field errors, which do render inline).
      expect(screen.queryByTestId('OrganizationPage__error-email')).not.toBeInTheDocument();
      const patchCalls = globalThis.fetch.mock.calls.filter(([, opts]) => opts?.method === 'PATCH');
      expect(patchCalls).toHaveLength(0);
    });

    it('blocks Save with the same phoneInvalidChars toast Contacts uses, when Teléfono has non-numeric junk', async () => {
      globalThis.fetch = VALID_BASE();
      render(<OrganizationPage token="test-token" apiBaseUrl={API_BASE_URL} />);
      await waitFor(() => expect(screen.getByTestId('OrganizationPage__taxid')).toHaveValue('B123'));

      fireEvent.change(screen.getByTestId('OrganizationPage__phone'), { target: { value: 'abc' } });
      fireEvent.click(screen.getByTestId('OrganizationPage__save'));

      await waitFor(() => expect(toastError).toHaveBeenCalledWith('phoneInvalidChars'));
      expect(toastSuccess).not.toHaveBeenCalled();
      const patchCalls = globalThis.fetch.mock.calls.filter(([, opts]) => opts?.method === 'PATCH');
      expect(patchCalls).toHaveLength(0);
    });

    it('blocks Save with the same websiteInsecureUrl toast Contacts uses, reconstructing the fixed https:// prefix before checking', async () => {
      globalThis.fetch = VALID_BASE();
      render(<OrganizationPage token="test-token" apiBaseUrl={API_BASE_URL} />);
      await waitFor(() => expect(screen.getByTestId('OrganizationPage__taxid')).toHaveValue('B123'));

      // A leading space survives the "https://" + form.web reconstruction (isSecureUrl only
      // trims the OUTER edges of the full string, not internal whitespace right after the
      // scheme) — a real, reachable malformed case despite the prefix always being present.
      fireEvent.change(screen.getByTestId('OrganizationPage__web'), { target: { value: ' test.com' } });
      fireEvent.click(screen.getByTestId('OrganizationPage__save'));

      await waitFor(() => expect(toastError).toHaveBeenCalledWith('websiteInsecureUrl'));
      expect(toastSuccess).not.toHaveBeenCalled();
      const patchCalls = globalThis.fetch.mock.calls.filter(([, opts]) => opts?.method === 'PATCH');
      expect(patchCalls).toHaveLength(0);
    });

    it('never blocks Save when email/phone/website are left blank — all three are optional', async () => {
      globalThis.fetch = VALID_BASE();
      render(<OrganizationPage token="test-token" apiBaseUrl={API_BASE_URL} />);
      await waitFor(() => expect(screen.getByTestId('OrganizationPage__taxid')).toHaveValue('B123'));

      // Something must change for the unsaved-banner (and thus Save) to be reachable —
      // email/phone/web themselves stay blank the whole time.
      fireEvent.change(screen.getByTestId('OrganizationPage__name'), { target: { value: 'Acme Corp' } });
      fireEvent.click(await screen.findByTestId('OrganizationPage__save'));

      await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('savedSuccessfully'));
      expect(toastError).not.toHaveBeenCalled();
    });

    it('allows Save when Email/Teléfono/Sitio web are all well-formed', async () => {
      globalThis.fetch = VALID_BASE();
      render(<OrganizationPage token="test-token" apiBaseUrl={API_BASE_URL} />);
      await waitFor(() => expect(screen.getByTestId('OrganizationPage__taxid')).toHaveValue('B123'));

      fireEvent.change(screen.getByTestId('OrganizationPage__email'), { target: { value: 'hi@acme.com' } });
      fireEvent.change(screen.getByTestId('OrganizationPage__phone'), { target: { value: '+34 123 456' } });
      fireEvent.change(screen.getByTestId('OrganizationPage__web'), { target: { value: 'acme.com' } });
      fireEvent.click(await screen.findByTestId('OrganizationPage__save'));

      await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('savedSuccessfully'));
      expect(toastError).not.toHaveBeenCalled();
      const infoPatch = globalThis.fetch.mock.calls.find(
        ([url, opts]) => url.includes(`/organization/information/${ORG_ID}`) && opts?.method === 'PATCH',
      );
      expect(infoPatch).toBeTruthy();
      // Persisted raw (just the part after the fixed "https://" chip) — the https://
      // reconstruction is only for validation, never sent to the backend.
      expect(JSON.parse(infoPatch[1].body)).toMatchObject({
        etgoEmail: 'hi@acme.com',
        etgoPhone: '+34 123 456',
        etgoWeb: 'acme.com',
      });
    });
  });
});
