// @covers artifacts/remittance/custom/RemittanceSepaFileData.jsx
//
// «Datos para el fichero SEPA» below the remittance header: the account's IBAN (read-only, or an
// inline editor that saves it on the account) and the SEPA creditor identifier. Rendered with the
// real sepaFileDataApi, validateIbanForCountry and backendErrors.js; only the request boundary
// (`useApiFetch`, one fetch per base), the API base and the toasts are mocked.
const mockApiFetch = vi.fn();
const mockAccountsFetch = vi.fn();
vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: (base) => (base === '/accounts-base' ? mockAccountsFetch : mockApiFetch),
}));
vi.mock('@/hooks/useNeoResource.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getApiBase: () => '/accounts-base',
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const mockDictionary = {
  'backendError.countryIban': 'T:countryIban',
  'backendError.remittanceAccountNotBank': 'T:accountNotBank',
};
const mockUi = (key, params) => mockDictionary[key] ?? (params ? `${key}:${JSON.stringify(params)}` : key);
vi.mock('@/i18n', () => ({ useUI: () => mockUi }));

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import RemittanceSepaFileData, { missingCreditorParts, typedIbanError } from '@generated/remittance/custom/RemittanceSepaFileData.jsx';

const API = '/sws/neo/remittance';
const VALID_IBAN = 'ES9121000418450200051332';
const BAD_CHECKSUM_IBAN = 'ES9121000418450200051333';

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => body };
}

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

const sepa = (extra = {}) => ({
  accountId: 'acc-1', accountName: 'Santander', iban: VALID_IBAN, ibanValid: true, organizationId: 'org-1',
  country: 'ES', creditorId: 'ES12000B12345678', creditorIdAvailable: true, missing: [], ...extra,
});
const NO_IBAN = sepa({ iban: null, ibanValid: false, missing: ['iban'] });
const answer = (data) => jsonResponse({ response: { data } });

const HEADER = { id: 'rem-1', financialAccount: 'acc-1', organization: 'org-1', processed: false };

function renderBlock(data = HEADER) {
  return render(<RemittanceSepaFileData data={data} apiBaseUrl={API} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockApiFetch.mockReset();
  mockAccountsFetch.mockReset();
});

describe('typedIbanError', () => {
  it('is null while nothing is typed', () => {
    expect(typedIbanError('')).toBeNull();
    expect(typedIbanError('   ')).toBeNull();
    expect(typedIbanError(undefined)).toBeNull();
  });

  it('is null for a valid IBAN, spaced or not, any case', () => {
    expect(typedIbanError(VALID_IBAN)).toBeNull();
    expect(typedIbanError('es91 2100 0418 4502 0005 1332')).toBeNull();
  });

  it('names the Edit-account error key of an invalid IBAN', () => {
    expect(typedIbanError(BAD_CHECKSUM_IBAN)).toBe('financeAccountsNewIbanInvalid');
    expect(typedIbanError('ES91')).toMatch(/^financeAccountsNewIban(Invalid|LengthMismatch)$/);
  });
});

describe('missingCreditorParts', () => {
  it('joins the known reasons in the order the backend sends them', () => {
    expect(missingCreditorParts(['iban', 'orgTaxId', 'country'], mockUi))
      .toBe('remittanceSepaMissingIban, remittanceSepaMissingOrgTaxId listConjunctionAnd remittanceSepaMissingCountry');
    expect(missingCreditorParts(['orgTaxId', 'country'], mockUi))
      .toBe('remittanceSepaMissingOrgTaxId listConjunctionAnd remittanceSepaMissingCountry');
    expect(missingCreditorParts(['country'], mockUi)).toBe('remittanceSepaMissingCountry');
  });

  it('drops unknown reasons and is empty for none', () => {
    expect(missingCreditorParts(['bic', 'orgTaxId'], mockUi)).toBe('remittanceSepaMissingOrgTaxId');
    expect(missingCreditorParts([], mockUi)).toBe('');
  });
});

describe('RemittanceSepaFileData — loading', () => {
  it('asks to choose an account when none is selected, without a request', () => {
    renderBlock({ id: 'rem-1', financialAccount: null });
    expect(screen.getByTestId('remittance-sepa-file-data')).toHaveTextContent('remittanceSepaTitle');
    expect(screen.getByTestId('remittance-sepa-no-account')).toHaveTextContent('remittanceSepaSelectAccount');
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('reads the data of the chosen account, also for an unsaved remittance', async () => {
    mockApiFetch.mockResolvedValue(answer(sepa()));
    renderBlock({ financialAccount: 'acc-1', organization: 'org-1' });
    expect(screen.getByTestId('remittance-sepa-loading')).toHaveTextContent('loading');
    await screen.findByTestId('remittance-sepa-iban');
    expect(mockApiFetch).toHaveBeenCalledWith('/remittance/new/action/sepaFileData', expect.objectContaining({ method: 'POST' }));
    expect(JSON.parse(mockApiFetch.mock.calls[0][1].body)).toEqual({ accountId: 'acc-1', organizationId: 'org-1' });
  });

  it('toasts remittanceSepaLoadError when the read fails with nothing usable, and shows no data', async () => {
    mockApiFetch.mockResolvedValue({ ok: false, status: 404, json: async () => { throw new Error('plain text'); } });
    renderBlock();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('remittanceSepaLoadError'));
    expect(screen.queryByTestId('remittance-sepa-iban')).toBeNull();
    expect(screen.queryByTestId('remittance-sepa-loading')).toBeNull();
  });

  it('translates a keyed refusal of the read', async () => {
    mockApiFetch.mockResolvedValue(jsonResponse({ error: { message: 'x', messageKeys: ['ETGO_RemittanceAccountNotBank'] } }, { ok: false, status: 422 }));
    renderBlock();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('T:accountNotBank'));
  });

  it('ignores a stale answer once the account changed', async () => {
    const slow = deferred();
    mockApiFetch.mockReturnValueOnce(slow.promise).mockResolvedValueOnce(answer(sepa({ accountId: 'acc-2', accountName: 'BBVA' })));
    const { rerender } = renderBlock();
    rerender(<RemittanceSepaFileData data={{ ...HEADER, financialAccount: 'acc-2' }} apiBaseUrl={API} />);
    await waitFor(() => expect(screen.getByTestId('remittance-sepa-iban-lock')).toHaveTextContent('BBVA'));
    await act(async () => { slow.resolve(answer(sepa({ accountName: 'Santander' }))); });
    expect(screen.getByTestId('remittance-sepa-iban-lock')).toHaveTextContent('BBVA');
    expect(screen.getByTestId('remittance-sepa-iban-lock')).not.toHaveTextContent('Santander');
  });
});

describe('RemittanceSepaFileData — IBAN', () => {
  it('shows a valid IBAN read-only, in blocks of 4, with the «De la cuenta» lock hint and no BIC', async () => {
    mockApiFetch.mockResolvedValue(answer(sepa()));
    renderBlock();
    expect(await screen.findByTestId('remittance-sepa-iban-value')).toHaveTextContent('ES91 2100 0418 4502 0005 1332');
    expect(screen.getByTestId('remittance-sepa-iban-lock')).toHaveTextContent('remittanceSepaFromAccount:{"account":"Santander"}');
    expect(screen.queryByTestId('remittance-sepa-iban-editor')).toBeNull();
    expect(screen.getByTestId('remittance-sepa-file-data')).not.toHaveTextContent(/BIC/i);
  });

  it('shows the editor, the note and the save-blocked line when the account has no IBAN', async () => {
    mockApiFetch.mockResolvedValue(answer(NO_IBAN));
    renderBlock();
    await screen.findByTestId('remittance-sepa-iban-editor');
    expect(screen.getByTestId('remittance-sepa-iban-note')).toHaveTextContent('remittanceSepaNoIbanNote:{"account":"Santander"}');
    expect(screen.getByTestId('remittance-sepa-save-blocked')).toHaveTextContent('remittanceSepaIbanRequiredToSave');
    expect(screen.getByTestId('remittance-sepa-iban-save')).toBeDisabled();
    expect(screen.queryByTestId('remittance-sepa-iban-value')).toBeNull();
  });

  it('shows the editor for a stored IBAN that is not valid', async () => {
    mockApiFetch.mockResolvedValue(answer(sepa({ iban: BAD_CHECKSUM_IBAN, ibanValid: false })));
    renderBlock();
    expect(await screen.findByTestId('remittance-sepa-iban-editor')).toBeInTheDocument();
  });

  it('keeps «Guardar IBAN» disabled with an inline error until the IBAN is valid', async () => {
    mockApiFetch.mockResolvedValue(answer(NO_IBAN));
    renderBlock();
    const input = await screen.findByTestId('remittance-sepa-iban-input');
    fireEvent.change(input, { target: { value: BAD_CHECKSUM_IBAN } });
    expect(screen.getByTestId('remittance-sepa-iban-error')).toHaveTextContent('financeAccountsNewIbanInvalid');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByTestId('remittance-sepa-iban-save')).toBeDisabled();
    fireEvent.change(input, { target: { value: 'es91 2100 0418 4502 0005 1332' } });
    expect(screen.queryByTestId('remittance-sepa-iban-error')).toBeNull();
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(screen.getByTestId('remittance-sepa-iban-save')).toBeEnabled();
  });

  it('saves the normalized IBAN on the account, toasts, then re-reads the block', async () => {
    mockApiFetch.mockResolvedValueOnce(answer(NO_IBAN)).mockResolvedValueOnce(answer(sepa()));
    mockAccountsFetch.mockImplementation((url, init) => Promise.resolve(init?.method === 'PATCH'
      ? jsonResponse({ response: { data: [{ id: 'acc-1' }] } })
      : jsonResponse({ response: { data: [{ id: 'acc-1', updated: 'T1' }] } })));
    renderBlock();
    fireEvent.change(await screen.findByTestId('remittance-sepa-iban-input'), { target: { value: 'es91 2100 0418 4502 0005 1332' } });
    await act(async () => { fireEvent.click(screen.getByTestId('remittance-sepa-iban-save')); });

    const patch = mockAccountsFetch.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(patch[0]).toBe('/sws/neo/financial-account/account/acc-1');
    expect(JSON.parse(patch[1].body)).toEqual({ iBAN: VALID_IBAN, updated: 'T1' });
    expect(toast.success).toHaveBeenCalledWith('remittanceSepaIbanSaved:{"account":"Santander"}');
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
    expect(await screen.findByTestId('remittance-sepa-iban-value')).toHaveTextContent('ES91 2100 0418 4502 0005 1332');
  });

  async function refuseSave(error) {
    mockApiFetch.mockResolvedValue(answer(NO_IBAN));
    mockAccountsFetch.mockImplementation((url, init) => Promise.resolve(init?.method === 'PATCH'
      ? jsonResponse({ error: { status: 400, ...error } }, { ok: false, status: 400 })
      : jsonResponse({ response: { data: [{ id: 'acc-1', updated: 'T1' }] } })));
    renderBlock();
    fireEvent.change(await screen.findByTestId('remittance-sepa-iban-input'), { target: { value: VALID_IBAN } });
    await act(async () => { fireEvent.click(screen.getByTestId('remittance-sepa-iban-save')); });
  }

  it('toasts a translated refusal of the save and keeps the editor', async () => {
    await refuseSave({ message: 'raw', messageKeys: ['ETGO_RemittanceAccountNotBank'] });
    expect(toast.error).toHaveBeenCalledWith('T:accountNotBank');
    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.getByTestId('remittance-sepa-iban-editor')).toBeInTheDocument();
    expect(screen.getByTestId('remittance-sepa-iban-save')).toBeEnabled();
  });

  it('tells to set the country in Edit account when the account has none (keyed refusal)', async () => {
    await refuseSave({ message: 'Se necesita el País para una cuenta IBAN.', messageKeys: ['ETGO_FinAccIbanRequiresCountry'] });
    expect(toast.error).toHaveBeenCalledWith('remittanceSepaIbanNeedsAccountCountry');
    expect(toast.error).not.toHaveBeenCalledWith('T:countryIban');
    expect(screen.getByTestId('remittance-sepa-iban-editor')).toBeInTheDocument();
  });

  it('tells to set the country in Edit account for the unkeyed English literal of an older backend', async () => {
    await refuseSave({ message: 'A bank account with an IBAN must have a country.' });
    expect(toast.error).toHaveBeenCalledWith('remittanceSepaIbanNeedsAccountCountry');
  });

  it('is read-only on a processed remittance, even without a valid IBAN', async () => {
    mockApiFetch.mockResolvedValue(answer(NO_IBAN));
    renderBlock({ ...HEADER, processed: 'Y' });
    expect(await screen.findByTestId('remittance-sepa-iban')).toBeInTheDocument();
    expect(screen.queryByTestId('remittance-sepa-iban-editor')).toBeNull();
    expect(screen.queryByTestId('remittance-sepa-iban-input')).toBeNull();
  });
});

describe('RemittanceSepaFileData — creditor identifier', () => {
  it('shows the computed creditor id with its info tooltip', async () => {
    mockApiFetch.mockResolvedValue(answer(sepa()));
    renderBlock();
    expect(await screen.findByTestId('remittance-sepa-creditor-value')).toHaveTextContent('ES12000B12345678');
    expect(screen.getByTestId('remittance-sepa-creditor-info')).toHaveAttribute('aria-label', 'remittanceSepaCreditorIdInfo');
    expect(screen.queryByTestId('remittance-sepa-creditor-missing')).toBeNull();
  });

  it('warns what is missing, joined in the order iban, orgTaxId, country', async () => {
    mockApiFetch.mockResolvedValue(answer(sepa({
      iban: null, ibanValid: false, creditorId: null, creditorIdAvailable: false, missing: ['iban', 'orgTaxId', 'country'],
    })));
    renderBlock();
    const warning = await screen.findByTestId('remittance-sepa-creditor-missing');
    expect(warning).toHaveAttribute('role', 'alert');
    expect(warning).toHaveTextContent(`remittanceSepaCreditorIdUnavailable:${JSON.stringify({
      missing: 'remittanceSepaMissingIban, remittanceSepaMissingOrgTaxId listConjunctionAnd remittanceSepaMissingCountry',
    })}`);
    expect(screen.queryByTestId('remittance-sepa-creditor-value')).toBeNull();
  });
});
