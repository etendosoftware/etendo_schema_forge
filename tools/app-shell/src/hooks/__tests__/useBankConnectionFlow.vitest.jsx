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
