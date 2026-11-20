// @covers artifacts/remittance/custom/RemittanceSepaFileData.jsx
//
// «Datos para el fichero SEPA» below the remittance header: the remittance's own IBAN (an input handed to
// the header form, never saved on the account) and the SEPA creditor identifier. Rendered with the
// real sepaFileDataApi, validateIbanForCountry and backendErrors.js; only the request boundary
// (`useApiFetch`, one fetch per base), the API base and the toasts are mocked.
const mockApiFetch = vi.fn();
vi.mock('@/auth/useApiFetch.js', () => ({ useApiFetch: () => mockApiFetch }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
// ETP-6247 — the SEPA file card under this block has its own requests and its own tests
// (RemittanceFileCard.vitest.jsx); stubbed here so the mocked fetch sequence stays this block's.
vi.mock('@generated/remittance/custom/RemittanceFileCard.jsx', () => ({ default: () => null }));

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
  accountIban: VALID_IBAN, accountIbanValid: true, collection: true, country: 'ES', creditorId: 'ES12000B12345678', creditorIdAvailable: true, missing: [], ...extra,
});
const NO_IBAN = sepa({ iban: null, ibanValid: false, accountIban: null, accountIbanValid: false, missing: ['iban'] });
const answer = (data) => jsonResponse({ response: { data } });

const HEADER = { id: 'rem-1', financialAccount: 'acc-1', organization: 'org-1', processed: false };

const onChange = vi.fn();
const registerFields = vi.fn();
const props = { apiBaseUrl: API, onChange, registerFields };

function renderBlock(data = HEADER) {
  return render(<RemittanceSepaFileData data={data} {...props} />);
}
const lastRegistration = () => registerFields.mock.calls.filter(([, id]) => id === 'remittance-sepa-iban').at(-1);

beforeEach(() => {
  vi.clearAllMocks();
  mockApiFetch.mockReset();
  onChange.mockReset();
  registerFields.mockReset();
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
    await screen.findByTestId('remittance-sepa-iban-editor');
    expect(mockApiFetch).toHaveBeenCalledWith('/remittance/new/action/sepaFileData', expect.objectContaining({ method: 'POST' }));
    expect(JSON.parse(mockApiFetch.mock.calls[0][1].body)).toEqual({ accountId: 'acc-1', organizationId: 'org-1' });
  });

  it('toasts remittanceSepaLoadError when the read fails with nothing usable, and shows no data', async () => {
    mockApiFetch.mockResolvedValue({ ok: false, status: 404, json: async () => { throw new Error('plain text'); } });
    renderBlock();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('remittanceSepaLoadError'));
    expect(screen.queryByTestId('remittance-sepa-iban-editor')).toBeNull();
    expect(screen.queryByTestId('remittance-sepa-loading')).toBeNull();
  });

  it('translates a keyed refusal of the read', async () => {
    mockApiFetch.mockResolvedValue(jsonResponse({ error: { message: 'x', messageKeys: ['ETGO_RemittanceAccountNotBank'] } }, { ok: false, status: 422 }));
    renderBlock();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('T:accountNotBank'));
  });

  it('ignores a stale answer once the account changed', async () => {
    const slow = deferred();
    mockApiFetch.mockReturnValueOnce(slow.promise).mockResolvedValueOnce(answer(sepa({ accountId: 'acc-2', accountName: 'BBVA', iban: 'ES7500490001512345678901' })));
    const { rerender } = renderBlock();
    rerender(<RemittanceSepaFileData data={{ ...HEADER, financialAccount: 'acc-2' }} {...props} />);
    await waitFor(() => expect(screen.getByTestId('remittance-sepa-iban-input')).toHaveValue('ES75 0049 0001 5123 4567 8901'.replace(/ /g, '')));
    await act(async () => { slow.resolve(answer(sepa({ iban: VALID_IBAN }))); });
    expect(screen.getByTestId('remittance-sepa-iban-input')).toHaveValue('ES7500490001512345678901');
  });
});

describe('RemittanceSepaFileData — IBAN of the remittance', () => {
  const SPACED = 'es91 2100 0418 4502 0005 1332';

  it.each(['remittance', 'account'])('opens on the effective IBAN (%s), editable, with no text under it, no save button and nothing registered', async (ibanSource) => {
    mockApiFetch.mockResolvedValue(answer(sepa({ ibanSource })));
    renderBlock();
    expect(await screen.findByTestId('remittance-sepa-iban-input')).toHaveValue(VALID_IBAN);
    expect(screen.queryByTestId('remittance-sepa-iban-source')).toBeNull();
    expect(screen.queryByTestId('remittance-sepa-iban-no-account-iban')).toBeNull();
    expect(screen.queryByTestId('remittance-sepa-iban-save')).toBeNull();
    expect(screen.queryByTestId('remittance-sepa-save-blocked')).toBeNull();
    expect(screen.getByTestId('remittance-sepa-file-data')).not.toHaveTextContent(/BIC/i);
    expect(onChange).not.toHaveBeenCalled();
    expect(lastRegistration()[0]).toEqual([]);
  });

  it('with no IBAN at all it shows no warning or «Falta», and registers the required field that blocks the header save', async () => {
    mockApiFetch.mockResolvedValue(answer(NO_IBAN));
    renderBlock();
    expect(await screen.findByTestId('remittance-sepa-iban-input')).toHaveValue('');
    expect(screen.queryByTestId('remittance-sepa-iban-source')).toBeNull();
    expect(screen.getByTestId('remittance-sepa-iban-no-account-iban')).toHaveTextContent('remittanceSepaNoAccountIbanHint');
    expect(screen.getByTestId('remittance-sepa-iban-no-account-iban')).not.toHaveClass('text-destructive');
    expect(screen.queryByTestId('remittance-sepa-save-blocked')).toBeNull();
    expect(screen.queryByTestId('remittance-sepa-iban-required')).toBeNull();
    expect(lastRegistration()[0]).toEqual([expect.objectContaining({ key: 'sepaFileIban', required: true })]);
  });

  it('marks the field like any required one only when the form reports it (after trying to save)', async () => {
    mockApiFetch.mockResolvedValue(answer(NO_IBAN));
    const { rerender } = renderBlock();
    const input = await screen.findByTestId('remittance-sepa-iban-input');
    expect(input).not.toHaveAttribute('aria-invalid');
    rerender(<RemittanceSepaFileData data={HEADER} {...props} fieldErrors={{ sepaFileIban: 'Required' }} />);
    expect(screen.getByTestId('remittance-sepa-iban-input')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByTestId('remittance-sepa-iban-required')).toHaveTextContent('fieldRequired');
  });

  it('the hint appears only while the field is empty and the account has no valid IBAN; with any value nothing is shown', async () => {
    mockApiFetch.mockResolvedValue(answer(NO_IBAN));
    const { unmount } = renderBlock();
    const input = await screen.findByTestId('remittance-sepa-iban-input');
    expect(screen.getByTestId('remittance-sepa-iban-no-account-iban')).toHaveTextContent('remittanceSepaNoAccountIbanHint');
    fireEvent.change(input, { target: { value: VALID_IBAN } });
    expect(screen.queryByTestId('remittance-sepa-iban-no-account-iban')).toBeNull();
    expect(screen.queryByTestId('remittance-sepa-iban-source')).toBeNull();
    unmount();
    mockApiFetch.mockResolvedValue(answer(sepa({ accountIban: VALID_IBAN, accountIbanValid: true, ibanSource: 'account' })));
    renderBlock();
    fireEvent.change(await screen.findByTestId('remittance-sepa-iban-input'), { target: { value: 'DE89370400440532013000' } });
    expect(screen.queryByTestId('remittance-sepa-iban-no-account-iban')).toBeNull();
    expect(screen.queryByTestId('remittance-sepa-iban-source')).toBeNull();
  });

  it('a valid typed IBAN goes to the header form as `iBAN` (normalized) and lifts the block', async () => {
    mockApiFetch.mockResolvedValue(answer(NO_IBAN));
    renderBlock();
    const input = await screen.findByTestId('remittance-sepa-iban-input');
    fireEvent.change(input, { target: { value: SPACED } });
    expect(onChange).toHaveBeenLastCalledWith('iBAN', VALID_IBAN);
    expect(screen.queryByTestId('remittance-sepa-iban-error')).toBeNull();
    expect(screen.queryByTestId('remittance-sepa-iban-no-account-iban')).toBeNull();
    expect(lastRegistration()[0]).toEqual([]);
  });

  it('an invalid typed IBAN shows the inline error, keeps the form field empty and the save blocked', async () => {
    mockApiFetch.mockResolvedValue(answer(sepa()));
    renderBlock();
    const input = await screen.findByTestId('remittance-sepa-iban-input');
    fireEvent.change(input, { target: { value: BAD_CHECKSUM_IBAN } });
    expect(screen.getByTestId('remittance-sepa-iban-error')).toHaveTextContent('financeAccountsNewIbanInvalid');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(onChange).toHaveBeenLastCalledWith('iBAN', '');
    expect(lastRegistration()[0]).toEqual([expect.objectContaining({ key: 'sepaFileIban', required: true })]);
  });

  it('clearing the field blocks the save; typing a valid one again lifts it', async () => {
    mockApiFetch.mockResolvedValue(answer(sepa()));
    renderBlock();
    const input = await screen.findByTestId('remittance-sepa-iban-input');
    fireEvent.change(input, { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith('iBAN', '');
    expect(screen.queryByTestId('remittance-sepa-iban-error')).toBeNull();
    expect(lastRegistration()[0]).toEqual([expect.objectContaining({ key: 'sepaFileIban', required: true })]);
    fireEvent.change(input, { target: { value: VALID_IBAN } });
    expect(onChange).toHaveBeenLastCalledWith('iBAN', VALID_IBAN);
    expect(lastRegistration()[0]).toEqual([]);
  });

  it('a stored IBAN that is not valid counts as missing for the save', async () => {
    mockApiFetch.mockResolvedValue(answer(sepa({ iban: BAD_CHECKSUM_IBAN, ibanValid: false })));
    renderBlock();
    expect(await screen.findByTestId('remittance-sepa-iban-input')).toHaveValue(BAD_CHECKSUM_IBAN);
    expect(lastRegistration()[0]).toEqual([expect.objectContaining({ key: 'sepaFileIban', required: true })]);
  });

  it('never writes to the account: the only requests are the sepaFileData reads', async () => {
    mockApiFetch.mockResolvedValue(answer(NO_IBAN));
    renderBlock();
    fireEvent.change(await screen.findByTestId('remittance-sepa-iban-input'), { target: { value: VALID_IBAN } });
    expect(mockApiFetch.mock.calls.every(([url]) => url.endsWith('/action/sepaFileData'))).toBe(true);
  });

  it('is read-only on a processed remittance, even without a valid IBAN, and registers nothing', async () => {
    mockApiFetch.mockResolvedValue(answer(NO_IBAN));
    renderBlock({ ...HEADER, processed: 'Y' });
    expect(await screen.findByTestId('remittance-sepa-iban')).toBeInTheDocument();
    expect(screen.queryByTestId('remittance-sepa-iban-editor')).toBeNull();
    expect(screen.queryByTestId('remittance-sepa-iban-input')).toBeNull();
    expect(lastRegistration()).toBeUndefined();
  });

  it('a processed remittance shows its IBAN in blocks of 4, with no origin text', async () => {
    mockApiFetch.mockResolvedValue(answer(sepa({ ibanSource: 'remittance' })));
    renderBlock({ ...HEADER, processed: true });
    expect(await screen.findByTestId('remittance-sepa-iban-value')).toHaveTextContent('ES91 2100 0418 4502 0005 1332');
    expect(screen.queryByTestId('remittance-sepa-iban-source')).toBeNull();
  });

  it('changing the account drops an IBAN the user had typed, so it is not sent with the new account', async () => {
    mockApiFetch.mockResolvedValue(answer(sepa()));
    const { rerender } = renderBlock({ ...HEADER, id: undefined });
    fireEvent.change(await screen.findByTestId('remittance-sepa-iban-input'), { target: { value: 'ES7500490001512345678901' } });
    onChange.mockClear();
    rerender(<RemittanceSepaFileData data={{ ...HEADER, id: undefined, financialAccount: 'acc-2' }} {...props} />);
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('iBAN', ''));
    expect(await screen.findByTestId('remittance-sepa-iban-input')).toHaveValue(VALID_IBAN);
  });

  it('changing the account without having typed anything does not touch the form', async () => {
    mockApiFetch.mockResolvedValue(answer(sepa()));
    const { rerender } = renderBlock();
    await screen.findByTestId('remittance-sepa-iban-input');
    rerender(<RemittanceSepaFileData data={{ ...HEADER, financialAccount: 'acc-2' }} {...props} />);
    await screen.findByTestId('remittance-sepa-iban-input');
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('RemittanceSepaFileData — collection options', () => {
  const TYPE = 'type-1';
  const selector = (items) => jsonResponse({ response: { data: { items } } });
  // sepaFileData and the type selector answer on the same mocked fetch, by URL.
  function backend({ info, items }) {
    mockApiFetch.mockImplementation((url) => Promise.resolve(url.includes('/selectors/remittanceType') ? selector(items) : answer(info)));
  }

  it('are header grid cells on a collection type, before the remittance is saved', async () => {
    backend({ info: sepa({ collection: null }), items: [{ id: TYPE, label: 'Cobro', direction: 'collection' }] });
    renderBlock({ ...HEADER, id: undefined, remittanceType: TYPE });
    expect(await screen.findByTestId('remittance-scheme-row')).toBeInTheDocument();
    expect(screen.getByTestId('remittance-scheme-trigger')).toHaveTextContent('remittanceSchemeCore');
    expect(screen.getByTestId('remittance-financed-switch')).not.toBeChecked();
    expect(mockApiFetch.mock.calls.some(([url]) => url === `/remittance/selectors/remittanceType?FIN_Financial_Account_ID=acc-1`)).toBe(true);
  });

  it('are hidden on a payment type, and the creditor row with them', async () => {
    backend({ info: sepa({ collection: null }), items: [{ id: TYPE, label: 'Pago', direction: 'payment' }] });
    renderBlock({ ...HEADER, id: undefined, remittanceType: TYPE });
    await screen.findByTestId('remittance-sepa-iban-editor');
    await waitFor(() => expect(screen.queryByTestId('remittance-sepa-creditor')).toBeNull());
    expect(screen.queryByTestId('remittance-scheme-row')).toBeNull();
  });

  it('degrade to sepaFileData.collection when the selector sends no direction', async () => {
    backend({ info: sepa({ collection: true, directDebitScheme: 'B2B', financed: true }), items: [{ id: TYPE, label: 'Cobro' }] });
    renderBlock({ ...HEADER, remittanceType: TYPE });
    expect(await screen.findByTestId('remittance-scheme-row')).toBeInTheDocument();
    expect(screen.getByTestId('remittance-financed-switch')).toBeChecked();
    expect(screen.getByTestId('remittance-scheme-trigger')).toHaveTextContent('remittanceSchemeB2b');
  });

  it('without a direction and an unsaved remittance they stay hidden', async () => {
    backend({ info: sepa({ collection: null }), items: [{ id: TYPE, label: 'X' }] });
    renderBlock({ ...HEADER, id: undefined, remittanceType: TYPE });
    await screen.findByTestId('remittance-sepa-iban-editor');
    expect(screen.queryByTestId('remittance-scheme-row')).toBeNull();
  });

  it('a change goes to the header form; choosing a payment type then puts all three collection-only fields back as they were', async () => {
    backend({ info: sepa({ directDebitScheme: 'CORE', financed: false }), items: [{ id: TYPE, label: 'Cobro', direction: 'collection' }, { id: 'type-2', label: 'Pago', direction: 'payment' }] });
    const record = { ...HEADER, remittanceType: TYPE, directDebitScheme: 'CORE', financed: false };
    const { rerender } = renderBlock(record);
    fireEvent.click(await screen.findByTestId('remittance-financed-switch'));
    expect(onChange).toHaveBeenCalledWith('financed', true);
    fireEvent.change(await screen.findByTestId('remittance-sepa-creditor-input'), { target: { value: 'ES97000B12345678' } });
    onChange.mockClear();
    rerender(<RemittanceSepaFileData data={{ ...record, remittanceType: 'type-2' }} {...props} />);
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('financed', false));
    expect(onChange).toHaveBeenCalledWith('directDebitScheme', 'CORE');
    expect(onChange).toHaveBeenCalledWith('creditorIdentifier', undefined);
  });
});

describe('RemittanceSepaFileData — creditor identifier', () => {
  it('shows the creditor id on a processed remittance with its info tooltip', async () => {
    mockApiFetch.mockResolvedValue(answer(sepa()));
    renderBlock({ ...HEADER, processed: true });
    expect(await screen.findByTestId('remittance-sepa-creditor-value')).toHaveTextContent('ES12000B12345678');
    expect(screen.getByTestId('remittance-sepa-creditor-info')).toHaveAttribute('aria-label', 'sepaCreditorIdInfo');
    expect(screen.queryByTestId('remittance-sepa-creditor-missing')).toBeNull();
  });

  it.each(['remittance', 'account'])('opens on the effective value without any origin caption (%s)', async (source) => {
    mockApiFetch.mockResolvedValue(answer(sepa({ creditorId: 'ES82000B87654323', creditorIdSource: source, remittanceCreditorId: source === 'remittance' ? 'ES82000B87654323' : null })));
    renderBlock();
    expect(await screen.findByTestId('remittance-sepa-creditor-input')).toHaveValue('ES82000B87654323');
    expect(screen.queryByTestId('remittance-sepa-creditor-source')).toBeNull();
  });

  it('keeps the «Propuesto a partir de la organización» note while the shown value is the computed one and not saved', async () => {
    mockApiFetch.mockResolvedValue(answer(sepa({ creditorId: 'ES82000B87654323', creditorIdSource: 'suggested' })));
    renderBlock();
    await screen.findByTestId('remittance-sepa-creditor-input');
    expect(screen.getByTestId('remittance-sepa-creditor-source')).toHaveTextContent('sepaCreditorIdSourceSuggested');
    fireEvent.change(screen.getByTestId('remittance-sepa-creditor-input'), { target: { value: 'ES97000B12345678' } });
    expect(screen.queryByTestId('remittance-sepa-creditor-source')).toBeNull();
  });

  it('has no save button, no «Usar el calculado» and no «also save on the account» option', async () => {
    mockApiFetch.mockResolvedValue(answer(sepa({ creditorIdSource: 'suggested', suggestedCreditorId: 'ES82000B87654323', creditorId: 'ES82000B87654323' })));
    renderBlock();
    await screen.findByTestId('remittance-sepa-creditor-input');
    expect(screen.queryByTestId('remittance-sepa-creditor-save')).toBeNull();
    expect(screen.queryByTestId('remittance-sepa-creditor-use-suggested')).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('a valid typed identifier goes to the header form as `creditorIdentifier`, normalized', async () => {
    mockApiFetch.mockResolvedValue(answer(sepa({ creditorIdSource: 'account', creditorId: 'ES82000B87654323' })));
    renderBlock();
    fireEvent.change(await screen.findByTestId('remittance-sepa-creditor-input'), { target: { value: 'es97 000 b12345678' } });
    expect(onChange).toHaveBeenLastCalledWith('creditorIdentifier', 'ES97000B12345678');
    expect(screen.queryByTestId('remittance-sepa-creditor-source')).toBeNull();
    expect(screen.queryByTestId('remittance-sepa-creditor-error')).toBeNull();
  });

  it('an invalid typed identifier shows the inline error, sends nothing and blocks the header save', async () => {
    mockApiFetch.mockResolvedValue(answer(sepa({ creditorIdSource: 'account', creditorId: 'ES82000B87654323' })));
    renderBlock();
    fireEvent.change(await screen.findByTestId('remittance-sepa-creditor-input'), { target: { value: 'ES83000B87654323' } });
    expect(screen.getByTestId('remittance-sepa-creditor-error')).toHaveTextContent('sepaCreditorIdInvalidCheckDigits');
    expect(onChange).toHaveBeenLastCalledWith('creditorIdentifier', '');
    const gate = registerFields.mock.calls.filter(([, id]) => id === 'remittance-sepa-creditor').at(-1);
    expect(gate[0]).toEqual([expect.objectContaining({ key: 'sepaFileCreditorId', required: true })]);
  });

  it('is editable on a remittance that is not saved yet, opened on the account / proposed value', async () => {
    mockApiFetch.mockResolvedValue(answer(sepa({ collection: null, creditorIdSource: 'suggested', creditorId: 'ES82000B87654323' })));
    renderBlock({ ...HEADER, id: undefined });
    expect(await screen.findByTestId('remittance-sepa-creditor-input')).toHaveValue('ES82000B87654323');
    expect(screen.getByTestId('remittance-sepa-creditor-source')).toHaveTextContent('sepaCreditorIdSourceSuggested');
    expect(mockApiFetch.mock.calls[0][0]).toBe('/remittance/new/action/sepaFileData');
  });

  it('a processed remittance is read-only and shows the remittance copy, locked', async () => {
    mockApiFetch.mockResolvedValue(answer(sepa({ creditorIdSource: 'remittance', remittanceCreditorId: 'ES12000B12345678' })));
    renderBlock({ ...HEADER, processed: true });
    expect(await screen.findByTestId('remittance-sepa-creditor-value')).toHaveTextContent('ES12000B12345678');
    expect(screen.queryByTestId('remittance-sepa-creditor-source')).toBeNull();
    expect(screen.getByTestId('remittance-sepa-creditor-locked')).toBeInTheDocument();
    expect(screen.queryByTestId('remittance-sepa-creditor-input')).toBeNull();
    expect(screen.queryByTestId('remittance-sepa-creditor-new-note')).toBeNull();
  });

  it('hides the previous draft while loading a different collection on the same account', async () => {
    const pending = deferred();
    mockApiFetch.mockResolvedValueOnce(answer(sepa())).mockReturnValueOnce(pending.promise);
    const { rerender } = renderBlock();
    await screen.findByTestId('remittance-sepa-creditor-input');
    rerender(<RemittanceSepaFileData data={{ ...HEADER, id: 'rem-2' }} {...props} />);
    expect(screen.queryByTestId('remittance-sepa-creditor-input')).toBeNull();
    pending.resolve(answer(sepa()));
    await screen.findByTestId('remittance-sepa-creditor-input');
  });

  it('hides the creditor row on payment remittances', async () => {
    mockApiFetch.mockResolvedValue(answer(sepa({ collection: false })));
    renderBlock();
    await screen.findByTestId('remittance-sepa-iban-editor');
    expect(screen.queryByTestId('remittance-sepa-creditor')).toBeNull();
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
