// @covers tools/app-shell/src/hooks/useBankConnectionFlow.js
import { renderHook, act } from '@testing-library/react';

const { toast, connect, fetchAccounts, link, createAndLink, launchSaltEdgePopup, uiMock } = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  connect: vi.fn(),
  fetchAccounts: vi.fn(),
  link: vi.fn(),
  createAndLink: vi.fn(),
  launchSaltEdgePopup: vi.fn(),
  // Echoes the key by default (same as every other test in this file expects); a single test
  // below overrides this to prove the ETP-4891 translateBackendError wiring actually threads `ui`
  // through, instead of just asserting the pre-existing "unmapped string passes through" case.
  uiMock: vi.fn((key) => key),
}));

// ETP-6151 — flag `psd2-statement-import-settings`, off by default (the pre-existing suites
// describe the flag-off behaviour); the ETP-6151 block turns it on.
const importSettingsFlag = vi.hoisted(() => ({ on: false }));
vi.mock('../usePsd2ImportSettingsFlag.js', () => ({
  usePsd2ImportSettingsFlag: () => importSettingsFlag.on,
}));

vi.mock('sonner', () => ({ toast }));

vi.mock('@/i18n', () => ({
  useUI: () => uiMock,
}));

vi.mock('../useBankConnectionActions', () => ({
  useBankConnectionActions: () => ({ connect, fetchAccounts, link, createAndLink }),
  launchSaltEdgePopup: (...args) => launchSaltEdgePopup(...args),
}));

import { useBankConnectionFlow } from '../useBankConnectionFlow';

beforeEach(() => {
  vi.clearAllMocks();
  uiMock.mockImplementation((key) => key);
  importSettingsFlag.on = false;
});

describe('useBankConnectionFlow — initial state', () => {
  it('starts idle with no selection', () => {
    const { result } = renderHook(() => useBankConnectionFlow());
    expect(result.current.connecting).toBe(false);
    expect(result.current.selection).toBeNull();
  });
});

describe('useBankConnectionFlow — connect / popup orchestration', () => {
  it('link mode passes the account id to connect and opens the selection modal', async () => {
    launchSaltEdgePopup.mockResolvedValue('conn-1');
    fetchAccounts.mockResolvedValue({
      accounts: [{ id: 'se1' }, { id: 'se2' }],
      providerName: 'BBVA',
      providerLogoUrl: 'https://logo',
    });

    const { result } = renderHook(() => useBankConnectionFlow());
    await act(async () => {
      await result.current.startConnect({ id: 'FA-1', type: 'B' });
    });

    // launchSaltEdgePopup receives a thunk; invoking it should call connect with the account id
    const getUrl = launchSaltEdgePopup.mock.calls[0][0];
    await getUrl();
    expect(connect).toHaveBeenCalledWith('FA-1');

    expect(fetchAccounts).toHaveBeenCalledWith('conn-1', 'B', 'FA-1');
    expect(result.current.selection).toMatchObject({
      mode: 'link',
      connectionId: 'conn-1',
      accounts: [{ id: 'se1' }, { id: 'se2' }],
      providerName: 'BBVA',
    });
    expect(result.current.connecting).toBe(false);
  });

  it('create mode passes no account id to connect and forwards the type', async () => {
    launchSaltEdgePopup.mockResolvedValue('conn-2');
    fetchAccounts.mockResolvedValue({ accounts: [{ id: 'se1' }], providerName: '', providerLogoUrl: '' });

    const { result } = renderHook(() => useBankConnectionFlow());
    await act(async () => {
      await result.current.startCreate('BANK');
    });

    const getUrl = launchSaltEdgePopup.mock.calls[0][0];
    await getUrl();
    expect(connect).toHaveBeenCalledWith(undefined);

    expect(fetchAccounts).toHaveBeenCalledWith('conn-2', 'BANK', undefined);
    expect(result.current.selection).toMatchObject({ mode: 'create', type: 'BANK' });
  });

  it('opens the selection modal even for a single account', async () => {
    launchSaltEdgePopup.mockResolvedValue('conn-3');
    fetchAccounts.mockResolvedValue({ accounts: [{ id: 'only' }], providerName: '', providerLogoUrl: '' });

    const { result } = renderHook(() => useBankConnectionFlow());
    await act(async () => {
      await result.current.startCreate('BANK');
    });

    expect(result.current.selection.accounts).toHaveLength(1);
    expect(link).not.toHaveBeenCalled();
    expect(createAndLink).not.toHaveBeenCalled();
  });

  it('shows an error toast and stays idle when the popup fails to open', async () => {
    launchSaltEdgePopup.mockRejectedValue(new Error('POPUP_BLOCKED'));

    const { result } = renderHook(() => useBankConnectionFlow());
    await act(async () => {
      await result.current.startConnect({ id: 'FA-1', type: 'B' });
    });

    expect(toast.error).toHaveBeenCalledWith('financeAccountsBankConnectionPopupBlocked');
    expect(result.current.connecting).toBe(false);
    expect(result.current.selection).toBeNull();
    expect(fetchAccounts).not.toHaveBeenCalled();
  });

  it('maps a BANK_CONNECTION_TIMEOUT popup failure to the timeout label', async () => {
    launchSaltEdgePopup.mockRejectedValue(new Error('BANK_CONNECTION_TIMEOUT'));

    const { result } = renderHook(() => useBankConnectionFlow());
    await act(async () => {
      await result.current.startCreate('BANK');
    });

    expect(toast.error).toHaveBeenCalledWith('financeAccountsBankConnectionTimeout');
  });

  it('falls back to the generic connect-error label for other popup failures', async () => {
    launchSaltEdgePopup.mockRejectedValue(new Error(''));

    const { result } = renderHook(() => useBankConnectionFlow());
    await act(async () => {
      await result.current.startCreate('BANK');
    });

    expect(toast.error).toHaveBeenCalledWith('financeAccountsBankConnectionConnectError');
  });

  it('bails out silently when the popup closes without a connection id', async () => {
    launchSaltEdgePopup.mockResolvedValue(null);

    const { result } = renderHook(() => useBankConnectionFlow());
    await act(async () => {
      await result.current.startCreate('BANK');
    });

    expect(result.current.connecting).toBe(false);
    expect(result.current.selection).toBeNull();
    expect(fetchAccounts).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('errors when the bank returns no accounts', async () => {
    launchSaltEdgePopup.mockResolvedValue('conn-4');
    fetchAccounts.mockResolvedValue({ accounts: [], providerName: '', providerLogoUrl: '' });

    const { result } = renderHook(() => useBankConnectionFlow());
    await act(async () => {
      await result.current.startCreate('BANK');
    });

    expect(toast.error).toHaveBeenCalledWith('financeAccountsBankConnectionNoAccounts');
    expect(result.current.selection).toBeNull();
  });

  it('shows an error toast when fetchAccounts throws', async () => {
    launchSaltEdgePopup.mockResolvedValue('conn-5');
    fetchAccounts.mockRejectedValue(new Error('fetch boom'));

    const { result } = renderHook(() => useBankConnectionFlow());
    await act(async () => {
      await result.current.startCreate('BANK');
    });

    expect(toast.error).toHaveBeenCalledWith('fetch boom');
    expect(result.current.connecting).toBe(false);
  });

  it('falls back to the generic label when fetchAccounts throws without a message', async () => {
    launchSaltEdgePopup.mockResolvedValue('conn-6');
    fetchAccounts.mockRejectedValue(new Error(''));

    const { result } = renderHook(() => useBankConnectionFlow());
    await act(async () => {
      await result.current.startConnect({ id: 'FA-1', type: 'B' });
    });

    expect(toast.error).toHaveBeenCalledWith('financeAccountsBankConnectionConnectError');
  });
});

describe('useBankConnectionFlow — confirmSelection (link mode)', () => {
  async function openSelection(result, { mode = 'link' } = {}) {
    launchSaltEdgePopup.mockResolvedValue('conn-1');
    fetchAccounts.mockResolvedValue({
      accounts: [{ id: 'se1' }],
      providerName: 'BBVA',
      providerLogoUrl: '',
    });
    await act(async () => {
      if (mode === 'link') await result.current.startConnect({ id: 'FA-1', type: 'B' });
      else await result.current.startCreate('BANK');
    });
  }

  it('links the chosen account and fires onDone on success', async () => {
    const onDone = vi.fn();
    link.mockResolvedValue({});
    const { result } = renderHook(() => useBankConnectionFlow({ onDone }));
    await openSelection(result);

    await act(async () => {
      await result.current.confirmSelection('se1');
    });

    expect(link).toHaveBeenCalledWith({
      financialAccountId: 'FA-1',
      connectionId: 'conn-1',
      saltEdgeAccountId: 'se1',
    });
    expect(toast.success).toHaveBeenCalledWith('financeAccountsBankConnectionSuccess');
    expect(onDone).toHaveBeenCalled();
    expect(result.current.selection).toBeNull();
  });

  it('surfaces a warning toast when the link result carries a warning', async () => {
    link.mockResolvedValue({ warning: 'partial import' });
    const { result } = renderHook(() => useBankConnectionFlow());
    await openSelection(result);

    await act(async () => {
      await result.current.confirmSelection('se1');
    });

    expect(toast.warning).toHaveBeenCalledWith('partial import');
    expect(toast.success).toHaveBeenCalledWith('financeAccountsBankConnectionSuccess');
  });

  // ETP-4891 follow-up: com.etendoerp.psd2's AD_MESSAGE for this warning has no real es_ES
  // translation (Core resolves the same English text regardless of session locale — see
  // backendErrors.js), so the raw backend warning must be run through translateBackendError
  // before it reaches the toast, not passed straight through like an unmapped string.
  it('translates the PSD2 IBAN-autofill warning before toasting it', async () => {
    uiMock.mockImplementation((key, params) => (key === 'backendError.ibanAutoFillFailed'
      ? `No se pudo establecer el IBAN automáticamente (${params.iban}). Introduce el IBAN manualmente en la cuenta financiera.`
      : key));
    link.mockResolvedValue({
      warning: 'IBAN could not be set automatically (DE89370400440532013000). '
        + 'Please enter it manually in the Financial Account.',
    });
    const { result } = renderHook(() => useBankConnectionFlow());
    await openSelection(result);

    await act(async () => {
      await result.current.confirmSelection('se1');
    });

    expect(toast.warning).toHaveBeenCalledWith(
      'No se pudo establecer el IBAN automáticamente (DE89370400440532013000). '
        + 'Introduce el IBAN manualmente en la cuenta financiera.',
    );
  });

  it('shows an error toast when link fails', async () => {
    link.mockRejectedValue(new Error('link failed'));
    const { result } = renderHook(() => useBankConnectionFlow());
    await openSelection(result);

    await act(async () => {
      await result.current.confirmSelection('se1');
    });

    expect(toast.error).toHaveBeenCalledWith('link failed');
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('falls back to the generic link-error label when link throws without a message', async () => {
    link.mockRejectedValue(new Error(''));
    const { result } = renderHook(() => useBankConnectionFlow());
    await openSelection(result);

    await act(async () => {
      await result.current.confirmSelection('se1');
    });

    expect(toast.error).toHaveBeenCalledWith('financeAccountsBankConnectionLinkError');
  });

  it('does nothing when confirmSelection is called with no active selection', async () => {
    const { result } = renderHook(() => useBankConnectionFlow());
    await act(async () => {
      await result.current.confirmSelection('se1');
    });

    expect(link).not.toHaveBeenCalled();
    expect(createAndLink).not.toHaveBeenCalled();
  });
});

describe('useBankConnectionFlow — confirmSelection (create mode)', () => {
  it('calls createAndLink with the type and fires onDone', async () => {
    const onDone = vi.fn();
    launchSaltEdgePopup.mockResolvedValue('conn-9');
    fetchAccounts.mockResolvedValue({ accounts: [{ id: 'se1' }], providerName: '', providerLogoUrl: '' });
    createAndLink.mockResolvedValue({});

    const { result } = renderHook(() => useBankConnectionFlow({ onDone }));
    await act(async () => {
      await result.current.startCreate('BANK');
    });
    await act(async () => {
      await result.current.confirmSelection('se1');
    });

    expect(createAndLink).toHaveBeenCalledWith({
      type: 'BANK',
      connectionId: 'conn-9',
      saltEdgeAccountId: 'se1',
    });
    expect(onDone).toHaveBeenCalled();
    expect(result.current.selection).toBeNull();
  });
});

describe('useBankConnectionFlow — cancelSelection', () => {
  it('clears the active selection', async () => {
    launchSaltEdgePopup.mockResolvedValue('conn-1');
    fetchAccounts.mockResolvedValue({ accounts: [{ id: 'se1' }], providerName: '', providerLogoUrl: '' });

    const { result } = renderHook(() => useBankConnectionFlow());
    await act(async () => {
      await result.current.startCreate('BANK');
    });
    expect(result.current.selection).not.toBeNull();

    act(() => {
      result.current.cancelSelection();
    });
    expect(result.current.selection).toBeNull();
    expect(link).not.toHaveBeenCalled();
    expect(createAndLink).not.toHaveBeenCalled();
  });
});

/**
 * ETP-5179 — the empty-account-list toast must name the cause.
 *
 * The bridge answers 200 with an empty list whichever filter emptied it, so the flow could only
 * ever raise one generic toast: a USD account connected to a EUR-only bank looked exactly like a
 * wrong-type or already-linked one. `fetchAccounts` now forwards the bridge's `emptyReason`
 * (and `accountCurrency` for the currency case) and this hook maps it to a specific label,
 * degrading to the generic one for an unknown or absent reason (an older backend).
 */
describe('useBankConnectionFlow — empty account list reasons', () => {
  const CURRENCY_TEMPLATE =
    'No se encontraron cuentas en {currency} en el banco seleccionado. '
    + 'La conexión no puede establecerse.';

  /** Mimics useUI: resolves the currency label from a dictionary and interpolates {currency}. */
  function stubCurrencyLabel() {
    uiMock.mockImplementation((key, params = {}) => {
      let text = key === 'financeAccountsBankConnectionNoAccountsCurrency' ? CURRENCY_TEMPLATE : key;
      Object.entries(params ?? {}).forEach(([name, value]) => {
        text = text.replace(`{${name}}`, value);
      });
      return text;
    });
  }

  async function runWithEmptyResult(payload) {
    launchSaltEdgePopup.mockResolvedValue('conn-empty');
    fetchAccounts.mockResolvedValue({
      accounts: [],
      providerName: '',
      providerLogoUrl: '',
      ...payload,
    });
    const { result } = renderHook(() => useBankConnectionFlow());
    await act(async () => {
      await result.current.startConnect({ id: 'FA-USD', type: 'B' });
    });
    return result;
  }

  it('names the currency and shows it in the toast on a currencyMismatch', async () => {
    stubCurrencyLabel();

    const result = await runWithEmptyResult({
      emptyReason: 'currencyMismatch',
      accountCurrency: 'USD',
    });

    expect(uiMock).toHaveBeenCalledWith(
      'financeAccountsBankConnectionNoAccountsCurrency',
      { currency: 'USD' },
    );
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('USD'));
    expect(toast.error).not.toHaveBeenCalledWith('financeAccountsBankConnectionNoAccounts');
    expect(result.current.selection).toBeNull();
  });

  it('uses the type-specific label on a typeMismatch', async () => {
    await runWithEmptyResult({ emptyReason: 'typeMismatch' });

    expect(toast.error).toHaveBeenCalledWith('financeAccountsBankConnectionNoAccountsType');
  });

  it('uses the already-linked label on allLinked', async () => {
    await runWithEmptyResult({ emptyReason: 'allLinked' });

    expect(toast.error).toHaveBeenCalledWith('financeAccountsBankConnectionNoAccountsAllLinked');
  });

  it('keeps the generic label when the bank itself returned nothing', async () => {
    await runWithEmptyResult({ emptyReason: 'noAccounts' });

    expect(toast.error).toHaveBeenCalledWith('financeAccountsBankConnectionNoAccounts');
  });

  it('falls back to the generic label when the reason is absent (older backend)', async () => {
    await runWithEmptyResult({});

    expect(toast.error).toHaveBeenCalledWith('financeAccountsBankConnectionNoAccounts');
  });

  it('falls back to the generic label for an unknown reason', async () => {
    await runWithEmptyResult({ emptyReason: 'somethingNobodyMappedYet' });

    expect(toast.error).toHaveBeenCalledWith('financeAccountsBankConnectionNoAccounts');
  });

  it('falls back to the generic label when a currencyMismatch carries no currency', async () => {
    // The bridge omits accountCurrency when the ISO code resolves to blank, so the pairing can
    // arrive incomplete. Interpolating it anyway would print a literal "undefined" mid-sentence.
    stubCurrencyLabel();

    await runWithEmptyResult({ emptyReason: 'currencyMismatch' });

    expect(toast.error).toHaveBeenCalledWith('financeAccountsBankConnectionNoAccounts');
    expect(toast.error).not.toHaveBeenCalledWith(expect.stringContaining('undefined'));
  });
});

describe('useBankConnectionFlow — create refused by a remittance provisioning conflict (ETP-6148)', () => {
  it('toasts the translated ETGO_RemittanceProvisioningConflict, not the raw backend text', async () => {
    uiMock.mockImplementation((key) => (key === 'backendError.remittanceProvisioningConflict' ? 'T:provisioningConflict' : key));
    launchSaltEdgePopup.mockResolvedValue('conn-9');
    fetchAccounts.mockResolvedValue({ accounts: [{ id: 'se1' }], providerName: '', providerLogoUrl: '' });
    createAndLink.mockRejectedValue(Object.assign(new Error('No se pudo preparar la cuenta (texto del backend).'), {
      status: 409,
      body: { error: { status: 409, message: 'No se pudo preparar la cuenta (texto del backend).', messageKeys: ['ETGO_RemittanceProvisioningConflict'] } },
    }));
    const onDone = vi.fn();
    const { result } = renderHook(() => useBankConnectionFlow({ onDone }));
    await act(async () => { await result.current.startCreate('B'); });
    await act(async () => { await result.current.confirmSelection('se1'); });
    expect(toast.error).toHaveBeenCalledWith('T:provisioningConflict');
    expect(onDone).not.toHaveBeenCalled();
  });
});

/**
 * ETP-6151 — the link persists the PSD2 import settings in the same transaction, so both writes
 * carry them; the bridge's non-blocking advisories (top-level `messages`) reach the user as
 * warnings; and its validation 400s are translated instead of shown as raw English.
 */
describe('useBankConnectionFlow — import settings on the link (ETP-6151)', () => {
  const SETTINGS = { importFromDate: '2026-11-01', statementGrouping: '1BM' };

  beforeEach(() => {
    importSettingsFlag.on = true;
  });

  async function openSelection(result, { mode = 'link', maxFetchInterval } = {}) {
    launchSaltEdgePopup.mockResolvedValue('conn-1');
    fetchAccounts.mockResolvedValue({
      accounts: [{ id: 'se1' }], providerName: 'BBVA', providerLogoUrl: '', maxFetchInterval,
    });
    await act(async () => {
      if (mode === 'link') await result.current.startConnect({ id: 'FA-1', type: 'B' });
      else await result.current.startCreate('BANK');
    });
  }

  async function confirm(result, settings = SETTINGS) {
    await act(async () => {
      await result.current.confirmSelection('se1', settings);
    });
  }

  it('flag off: a link refusal is toasted raw, untranslated, as before ETP-6151', async () => {
    importSettingsFlag.on = false;
    const raw = 'The import from date is required';
    uiMock.mockImplementation((key) => (key === 'financeAccountsBankConnectionImportFromRequired' ? 'TRANSLATED' : key));
    link.mockRejectedValue(new Error(raw));
    const { result } = renderHook(() => useBankConnectionFlow());
    await openSelection(result);

    await confirm(result);

    expect(toast.error).toHaveBeenCalledWith(raw);
    expect(toast.error).not.toHaveBeenCalledWith('TRANSLATED');
  });

  it('flag off: a link refusal with no message falls back to the generic link error', async () => {
    importSettingsFlag.on = false;
    link.mockRejectedValue(new Error(''));
    const { result } = renderHook(() => useBankConnectionFlow());
    await openSelection(result);

    await confirm(result);

    expect(toast.error).toHaveBeenCalledWith('financeAccountsBankConnectionLinkError');
  });

  it('flag off: link and createAndLink carry only the account, never the import settings', async () => {
    importSettingsFlag.on = false;
    link.mockResolvedValue({});
    createAndLink.mockResolvedValue({});
    const { result } = renderHook(() => useBankConnectionFlow());

    await openSelection(result);
    await confirm(result);
    await openSelection(result, { mode: 'create' });
    await confirm(result);

    expect(link).toHaveBeenCalledWith({
      financialAccountId: 'FA-1', connectionId: 'conn-1', saltEdgeAccountId: 'se1',
    });
    expect(createAndLink).toHaveBeenCalledWith({
      type: 'BANK', connectionId: 'conn-1', saltEdgeAccountId: 'se1',
    });
  });

  it('flag off: the bank limit is not kept on the selection and advisories raise no toast', async () => {
    importSettingsFlag.on = false;
    link.mockResolvedValue({ messages: [{ type: 'warning', text: 'Limited history.' }] });
    const { result } = renderHook(() => useBankConnectionFlow());

    await openSelection(result, { maxFetchInterval: 90 });
    expect(result.current.selection).not.toHaveProperty('maxFetchInterval');
    await confirm(result);

    expect(toast.warning).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith('financeAccountsBankConnectionSuccess');
  });

  it('sends the date and the grouping on link', async () => {
    link.mockResolvedValue({});
    const { result } = renderHook(() => useBankConnectionFlow());
    await openSelection(result);

    await confirm(result);

    expect(link).toHaveBeenCalledWith({
      financialAccountId: 'FA-1',
      connectionId: 'conn-1',
      saltEdgeAccountId: 'se1',
      importFromDate: '2026-11-01',
      statementGrouping: '1BM',
    });
    expect(createAndLink).not.toHaveBeenCalled();
  });

  it('sends the date and the grouping on createAndLink', async () => {
    createAndLink.mockResolvedValue({});
    const { result } = renderHook(() => useBankConnectionFlow());
    await openSelection(result, { mode: 'create' });

    await confirm(result, { importFromDate: '2026-10-01', statementGrouping: '1BE' });

    expect(createAndLink).toHaveBeenCalledWith({
      type: 'BANK',
      connectionId: 'conn-1',
      saltEdgeAccountId: 'se1',
      importFromDate: '2026-10-01',
      statementGrouping: '1BE',
    });
    expect(link).not.toHaveBeenCalled();
  });

  it('keeps the bank limit on the selection, for the modal advisory', async () => {
    const { result } = renderHook(() => useBankConnectionFlow());

    await openSelection(result, { maxFetchInterval: 90 });

    expect(result.current.selection.maxFetchInterval).toBe(90);
  });

  it('turns each warning advisory of the link response into a warning toast, then succeeds', async () => {
    const onDone = vi.fn();
    link.mockResolvedValue({
      messages: [
        { type: 'warning', text: 'This bank only provides the last 90 days.' },
        { type: 'WARNING', text: 'Second advisory.' },
      ],
    });
    const { result } = renderHook(() => useBankConnectionFlow({ onDone }));
    await openSelection(result);

    await confirm(result);

    expect(toast.warning).toHaveBeenCalledTimes(2);
    expect(toast.warning).toHaveBeenNthCalledWith(1, 'This bank only provides the last 90 days.');
    expect(toast.warning).toHaveBeenNthCalledWith(2, 'Second advisory.');
    expect(toast.success).toHaveBeenCalledWith('financeAccountsBankConnectionSuccess');
    expect(onDone).toHaveBeenCalled();
  });

  it('shows the advisories of a createAndLink response too', async () => {
    createAndLink.mockResolvedValue({ messages: [{ type: 'warning', text: 'Limited history.' }] });
    const { result } = renderHook(() => useBankConnectionFlow());
    await openSelection(result, { mode: 'create' });

    await confirm(result);

    expect(toast.warning).toHaveBeenCalledWith('Limited history.');
  });

  it('ignores non-warning and empty messages', async () => {
    link.mockResolvedValue({
      messages: [
        { type: 'info', text: 'Just so you know.' },
        { type: 'success', text: 'Done.' },
        { type: 'warning', text: '' },
        { type: 'warning' },
        null,
      ],
    });
    const { result } = renderHook(() => useBankConnectionFlow());
    await openSelection(result);

    await confirm(result);

    expect(toast.warning).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith('financeAccountsBankConnectionSuccess');
  });

  it('tolerates a messages field that is not an array', async () => {
    link.mockResolvedValue({ messages: 'oops' });
    const { result } = renderHook(() => useBankConnectionFlow());
    await openSelection(result);

    await confirm(result);

    expect(toast.warning).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalled();
  });

  it('runs an advisory through translateBackendError before toasting it', async () => {
    uiMock.mockImplementation((key) => (key === 'financeAccountsBankConnectionImportFromRequired'
      ? 'Indica desde qué fecha importar los movimientos.'
      : key));
    link.mockResolvedValue({ messages: [{ type: 'warning', text: 'The import from date is required' }] });
    const { result } = renderHook(() => useBankConnectionFlow());
    await openSelection(result);

    await confirm(result);

    expect(toast.warning).toHaveBeenCalledWith('Indica desde qué fecha importar los movimientos.');
  });

  describe('translates the bridge validation refusals of the link', () => {
    const LABELS = {
      financeAccountsBankConnectionImportFromRequired: 'Indica desde qué fecha importar los movimientos.',
      financeAccountsBankConnectionGroupingRequired: 'Elige cómo agrupar los extractos.',
      financeAccountsBankConnectionImportRangeInvalid: 'La fecha «Importar desde» no puede ser posterior a «Importar hasta».',
    };

    beforeEach(() => {
      uiMock.mockImplementation((key) => LABELS[key] ?? key);
    });

    it.each([
      ['The import from date is required', 'financeAccountsBankConnectionImportFromRequired'],
      ['The import from date is not a valid date (expected yyyy-MM-dd)', 'financeAccountsBankConnectionImportFromRequired'],
      ['The statement grouping is required', 'financeAccountsBankConnectionGroupingRequired'],
      ['The statement grouping must be one of 1BD, 1BW, 1BM, 1BE', 'financeAccountsBankConnectionGroupingRequired'],
      ['The import from date cannot be later than the import to date', 'financeAccountsBankConnectionImportRangeInvalid'],
    ])('"%s" → %s', async (raw, key) => {
      const err = new Error(raw);
      err.status = 400;
      link.mockRejectedValue(err);
      const { result } = renderHook(() => useBankConnectionFlow());
      await openSelection(result);

      await confirm(result);

      expect(toast.error).toHaveBeenCalledWith(LABELS[key]);
      expect(toast.error).not.toHaveBeenCalledWith(raw);
      expect(toast.success).not.toHaveBeenCalled();
    });

    // The popup/bridge timeout sentinel must reach the user as its translated sentence.
    it.each([
      ['link', 'link', 'link'],
      ['createAndLink', 'create', 'createAndLink'],
    ])('translates a BANK_CONNECTION_TIMEOUT rejection of %s, never showing the raw sentinel', async (_n, mode, fn) => {
      const labels = { financeAccountsBankConnectionTimeout: 'El banco no respondió a tiempo.' };
      uiMock.mockImplementation((key) => labels[key] ?? key);
      ({ link, createAndLink })[fn].mockRejectedValue(new Error('BANK_CONNECTION_TIMEOUT'));
      const { result } = renderHook(() => useBankConnectionFlow());
      await openSelection(result, { mode });

      await confirm(result);

      expect(toast.error).toHaveBeenCalledWith('El banco no respondió a tiempo.');
      expect(toast.error).not.toHaveBeenCalledWith('BANK_CONNECTION_TIMEOUT');
      expect(toast.success).not.toHaveBeenCalled();
    });

    it('shows an unmapped refusal as the bridge wrote it', async () => {
      createAndLink.mockRejectedValue(new Error('Something the map does not know'));
      const { result } = renderHook(() => useBankConnectionFlow());
      await openSelection(result, { mode: 'create' });

      await confirm(result);

      expect(toast.error).toHaveBeenCalledWith('Something the map does not know');
    });
  });
});
