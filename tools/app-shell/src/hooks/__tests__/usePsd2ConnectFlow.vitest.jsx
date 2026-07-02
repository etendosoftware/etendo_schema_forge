import { renderHook, act } from '@testing-library/react';

const { toast, connect, fetchAccounts, link, createAndLink, launchSaltEdgePopup } = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  connect: vi.fn(),
  fetchAccounts: vi.fn(),
  link: vi.fn(),
  createAndLink: vi.fn(),
  launchSaltEdgePopup: vi.fn(),
}));

vi.mock('sonner', () => ({ toast }));

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('../usePsd2Actions', () => ({
  usePsd2Actions: () => ({ connect, fetchAccounts, link, createAndLink }),
  launchSaltEdgePopup: (...args) => launchSaltEdgePopup(...args),
}));

import { usePsd2ConnectFlow } from '../usePsd2ConnectFlow';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('usePsd2ConnectFlow — initial state', () => {
  it('starts idle with no selection', () => {
    const { result } = renderHook(() => usePsd2ConnectFlow());
    expect(result.current.connecting).toBe(false);
    expect(result.current.selection).toBeNull();
  });
});

describe('usePsd2ConnectFlow — connect / popup orchestration', () => {
  it('link mode passes the account id to connect and opens the selection modal', async () => {
    launchSaltEdgePopup.mockResolvedValue('conn-1');
    fetchAccounts.mockResolvedValue({
      accounts: [{ id: 'se1' }, { id: 'se2' }],
      providerName: 'BBVA',
      providerLogoUrl: 'https://logo',
    });

    const { result } = renderHook(() => usePsd2ConnectFlow());
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

    const { result } = renderHook(() => usePsd2ConnectFlow());
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

    const { result } = renderHook(() => usePsd2ConnectFlow());
    await act(async () => {
      await result.current.startCreate('BANK');
    });

    expect(result.current.selection.accounts).toHaveLength(1);
    expect(link).not.toHaveBeenCalled();
    expect(createAndLink).not.toHaveBeenCalled();
  });

  it('shows an error toast and stays idle when the popup fails to open', async () => {
    launchSaltEdgePopup.mockRejectedValue(new Error('POPUP_BLOCKED'));

    const { result } = renderHook(() => usePsd2ConnectFlow());
    await act(async () => {
      await result.current.startConnect({ id: 'FA-1', type: 'B' });
    });

    expect(toast.error).toHaveBeenCalledWith('financeAccountsPsd2PopupBlocked');
    expect(result.current.connecting).toBe(false);
    expect(result.current.selection).toBeNull();
    expect(fetchAccounts).not.toHaveBeenCalled();
  });

  it('maps a PSD2_TIMEOUT popup failure to the timeout label', async () => {
    launchSaltEdgePopup.mockRejectedValue(new Error('PSD2_TIMEOUT'));

    const { result } = renderHook(() => usePsd2ConnectFlow());
    await act(async () => {
      await result.current.startCreate('BANK');
    });

    expect(toast.error).toHaveBeenCalledWith('financeAccountsPsd2Timeout');
  });

  it('falls back to the generic connect-error label for other popup failures', async () => {
    launchSaltEdgePopup.mockRejectedValue(new Error(''));

    const { result } = renderHook(() => usePsd2ConnectFlow());
    await act(async () => {
      await result.current.startCreate('BANK');
    });

    expect(toast.error).toHaveBeenCalledWith('financeAccountsPsd2ConnectError');
  });

  it('bails out silently when the popup closes without a connection id', async () => {
    launchSaltEdgePopup.mockResolvedValue(null);

    const { result } = renderHook(() => usePsd2ConnectFlow());
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

    const { result } = renderHook(() => usePsd2ConnectFlow());
    await act(async () => {
      await result.current.startCreate('BANK');
    });

    expect(toast.error).toHaveBeenCalledWith('financeAccountsPsd2NoAccounts');
    expect(result.current.selection).toBeNull();
  });

  it('shows an error toast when fetchAccounts throws', async () => {
    launchSaltEdgePopup.mockResolvedValue('conn-5');
    fetchAccounts.mockRejectedValue(new Error('fetch boom'));

    const { result } = renderHook(() => usePsd2ConnectFlow());
    await act(async () => {
      await result.current.startCreate('BANK');
    });

    expect(toast.error).toHaveBeenCalledWith('fetch boom');
    expect(result.current.connecting).toBe(false);
  });

  it('falls back to the generic label when fetchAccounts throws without a message', async () => {
    launchSaltEdgePopup.mockResolvedValue('conn-6');
    fetchAccounts.mockRejectedValue(new Error(''));

    const { result } = renderHook(() => usePsd2ConnectFlow());
    await act(async () => {
      await result.current.startConnect({ id: 'FA-1', type: 'B' });
    });

    expect(toast.error).toHaveBeenCalledWith('financeAccountsPsd2ConnectError');
  });
});

describe('usePsd2ConnectFlow — confirmSelection (link mode)', () => {
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
    const { result } = renderHook(() => usePsd2ConnectFlow({ onDone }));
    await openSelection(result);

    await act(async () => {
      await result.current.confirmSelection('se1');
    });

    expect(link).toHaveBeenCalledWith({
      financialAccountId: 'FA-1',
      connectionId: 'conn-1',
      saltEdgeAccountId: 'se1',
    });
    expect(toast.success).toHaveBeenCalledWith('financeAccountsPsd2Success');
    expect(onDone).toHaveBeenCalled();
    expect(result.current.selection).toBeNull();
  });

  it('surfaces a warning toast when the link result carries a warning', async () => {
    link.mockResolvedValue({ warning: 'partial import' });
    const { result } = renderHook(() => usePsd2ConnectFlow());
    await openSelection(result);

    await act(async () => {
      await result.current.confirmSelection('se1');
    });

    expect(toast.warning).toHaveBeenCalledWith('partial import');
    expect(toast.success).toHaveBeenCalledWith('financeAccountsPsd2Success');
  });

  it('shows an error toast when link fails', async () => {
    link.mockRejectedValue(new Error('link failed'));
    const { result } = renderHook(() => usePsd2ConnectFlow());
    await openSelection(result);

    await act(async () => {
      await result.current.confirmSelection('se1');
    });

    expect(toast.error).toHaveBeenCalledWith('link failed');
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('falls back to the generic link-error label when link throws without a message', async () => {
    link.mockRejectedValue(new Error(''));
    const { result } = renderHook(() => usePsd2ConnectFlow());
    await openSelection(result);

    await act(async () => {
      await result.current.confirmSelection('se1');
    });

    expect(toast.error).toHaveBeenCalledWith('financeAccountsPsd2LinkError');
  });

  it('does nothing when confirmSelection is called with no active selection', async () => {
    const { result } = renderHook(() => usePsd2ConnectFlow());
    await act(async () => {
      await result.current.confirmSelection('se1');
    });

    expect(link).not.toHaveBeenCalled();
    expect(createAndLink).not.toHaveBeenCalled();
  });
});

describe('usePsd2ConnectFlow — confirmSelection (create mode)', () => {
  it('calls createAndLink with the type and fires onDone', async () => {
    const onDone = vi.fn();
    launchSaltEdgePopup.mockResolvedValue('conn-9');
    fetchAccounts.mockResolvedValue({ accounts: [{ id: 'se1' }], providerName: '', providerLogoUrl: '' });
    createAndLink.mockResolvedValue({});

    const { result } = renderHook(() => usePsd2ConnectFlow({ onDone }));
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

describe('usePsd2ConnectFlow — cancelSelection', () => {
  it('clears the active selection', async () => {
    launchSaltEdgePopup.mockResolvedValue('conn-1');
    fetchAccounts.mockResolvedValue({ accounts: [{ id: 'se1' }], providerName: '', providerLogoUrl: '' });

    const { result } = renderHook(() => usePsd2ConnectFlow());
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
