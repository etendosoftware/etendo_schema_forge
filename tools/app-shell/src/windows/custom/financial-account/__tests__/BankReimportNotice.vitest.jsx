// @covers tools/app-shell/src/windows/custom/financial-account/BankReimportNotice.jsx
/**
 * The re-import warning of a bank-connected account's statement delete, and the hook that reads
 * the account's "Importar desde" for it.
 *
 * `BankReimportNotice` names the date when it has one and falls back to a date-less sentence
 * otherwise. `useBankImportFromDate` reads the date ON DEMAND (`refresh`, called on every delete
 * request) because it can change in "Editar cuenta" while the tab stays open, and drops an answer
 * a newer read or an account switch has superseded.
 *
 * Its two hosts (the row confirm and the bulk dialog of `ImportedStatementsTab`) are asserted in
 * `ImportedStatementsTab.vitest.jsx`.
 */
import { act, render, renderHook, screen } from '@testing-library/react';

// Params are appended so a parameterised key stays distinguishable from its bare form.
vi.mock('@/i18n', () => ({
  useUI: () => (key, vars) => (vars ? `${key}|${Object.values(vars).join(',')}` : key),
  useLocaleSwitch: () => ({ locale: 'es_ES', setLocale: vi.fn() }),
}));

const fetchStatus = vi.fn();
vi.mock('@/hooks/useBankConnectionActions', () => ({
  useBankConnectionActions: () => ({ fetchStatus }),
}));

import { BankReimportNotice, useBankImportFromDate } from '../BankReimportNotice.jsx';

const NOTICE = 'financeAccountStatementsDeleteBankReimportNotice';
const NOTICE_NO_DATE = 'financeAccountStatementsDeleteBankReimportNoticeNoDate';

/** A promise the test settles by hand, to order concurrent reads. */
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

/** Lets the hook's promise chain (`Promise.resolve().then(fetch).then(set)`) run to the end. */
async function flush() {
  await act(async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  });
}

beforeEach(() => {
  fetchStatus.mockReset();
});

describe('BankReimportNotice', () => {
  it('names the "Importar desde" date in the locale format', () => {
    render(<BankReimportNotice importFromDate="2026-03-01" />);

    expect(screen.getByTestId('statement-delete-bank-reimport-notice'))
      .toHaveTextContent(`${NOTICE}|01/03/2026`);
  });

  it('uses the date-less wording when there is no date', () => {
    render(<BankReimportNotice />);

    const notice = screen.getByTestId('statement-delete-bank-reimport-notice');
    expect(notice).toHaveTextContent(NOTICE_NO_DATE);
    expect(notice).not.toHaveTextContent(`${NOTICE}|`);
  });

  it('uses the date-less wording for a value that is not a date', () => {
    render(<BankReimportNotice importFromDate="not-a-date" />);

    expect(screen.getByTestId('statement-delete-bank-reimport-notice')).toHaveTextContent(NOTICE_NO_DATE);
  });

  it('takes its test id from the testId prop', () => {
    render(<BankReimportNotice importFromDate={null} testId="custom-notice" />);

    expect(screen.getByTestId('custom-notice')).toHaveTextContent(NOTICE_NO_DATE);
  });

  /** ETP-4850 class of bug: a date-only string read through UTC shows the previous day west of UTC. */
  describe('under a negative-UTC-offset timezone', () => {
    const originalTz = process.env.TZ;

    beforeAll(() => {
      process.env.TZ = 'America/Argentina/Buenos_Aires';
    });

    afterAll(() => {
      if (originalTz === undefined) delete process.env.TZ;
      else process.env.TZ = originalTz;
    });

    it('keeps the calendar day of the stored date', () => {
      render(<BankReimportNotice importFromDate="2026-08-01" />);

      expect(screen.getByTestId('statement-delete-bank-reimport-notice'))
        .toHaveTextContent(`${NOTICE}|01/08/2026`);
    });
  });
});

describe('useBankImportFromDate', () => {
  it('starts with no date and reads nothing on mount', () => {
    const { result } = renderHook(() => useBankImportFromDate('acc-1', true));

    expect(result.current.importFromDate).toBeNull();
    expect(fetchStatus).not.toHaveBeenCalled();
  });

  it('reads the account status on refresh and exposes its importFromDate', async () => {
    fetchStatus.mockResolvedValue({ connected: true, importFromDate: '2026-02-01' });
    const { result } = renderHook(() => useBankImportFromDate('acc-1', true));

    act(() => result.current.refresh());
    await flush();

    expect(fetchStatus).toHaveBeenCalledWith('acc-1');
    expect(result.current.importFromDate).toBe('2026-02-01');
  });

  it('reads again on every refresh, so a date changed meanwhile is the one shown', async () => {
    fetchStatus
      .mockResolvedValueOnce({ importFromDate: '2026-02-01' })
      .mockResolvedValueOnce({ importFromDate: '2026-05-01' });
    const { result } = renderHook(() => useBankImportFromDate('acc-1', true));

    act(() => result.current.refresh());
    await flush();
    expect(result.current.importFromDate).toBe('2026-02-01');

    act(() => result.current.refresh());
    await flush();

    expect(fetchStatus).toHaveBeenCalledTimes(2);
    expect(result.current.importFromDate).toBe('2026-05-01');
  });

  it('ignores the late answer of a read a newer one superseded', async () => {
    const first = deferred();
    const second = deferred();
    fetchStatus
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useBankImportFromDate('acc-1', true));

    act(() => result.current.refresh());
    await flush();
    act(() => result.current.refresh());
    await flush();

    second.resolve({ importFromDate: '2026-05-01' });
    await flush();
    first.resolve({ importFromDate: '2025-01-01' });
    await flush();

    expect(result.current.importFromDate).toBe('2026-05-01');
  });

  it('ignores a late failure of a superseded read', async () => {
    const first = deferred();
    fetchStatus
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce({ importFromDate: '2026-05-01' });
    const { result } = renderHook(() => useBankImportFromDate('acc-1', true));

    act(() => result.current.refresh());
    await flush();
    act(() => result.current.refresh());
    await flush();
    first.reject(new Error('late boom'));
    await flush();

    expect(result.current.importFromDate).toBe('2026-05-01');
  });

  it('falls back to no date when the read fails', async () => {
    fetchStatus
      .mockResolvedValueOnce({ importFromDate: '2026-02-01' })
      .mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useBankImportFromDate('acc-1', true));

    act(() => result.current.refresh());
    await flush();
    expect(result.current.importFromDate).toBe('2026-02-01');

    act(() => result.current.refresh());
    await flush();

    expect(result.current.importFromDate).toBeNull();
  });

  it('treats a status with no date (a connection linked before it was required) as no date', async () => {
    fetchStatus.mockResolvedValue({ connected: true, importFromDate: null });
    const { result } = renderHook(() => useBankImportFromDate('acc-1', true));

    act(() => result.current.refresh());
    await flush();

    expect(fetchStatus).toHaveBeenCalledTimes(1);
    expect(result.current.importFromDate).toBeNull();
  });

  it('reads nothing for an account that is not bank-connected', async () => {
    const { result } = renderHook(() => useBankImportFromDate('acc-1', false));

    act(() => result.current.refresh());
    await flush();

    expect(fetchStatus).not.toHaveBeenCalled();
    expect(result.current.importFromDate).toBeNull();
  });

  it('reads nothing without an account id', async () => {
    const { result } = renderHook(() => useBankImportFromDate(null, true));

    act(() => result.current.refresh());
    await flush();

    expect(fetchStatus).not.toHaveBeenCalled();
  });

  it('clears the date and drops a pending answer when the account changes', async () => {
    const pending = deferred();
    fetchStatus
      .mockResolvedValueOnce({ importFromDate: '2026-02-01' })
      .mockReturnValueOnce(pending.promise);
    const { result, rerender } = renderHook(
      ({ id }) => useBankImportFromDate(id, true),
      { initialProps: { id: 'acc-1' } },
    );

    act(() => result.current.refresh());
    await flush();
    expect(result.current.importFromDate).toBe('2026-02-01');

    act(() => result.current.refresh());
    await flush();
    rerender({ id: 'acc-2' });
    expect(result.current.importFromDate).toBeNull();

    pending.resolve({ importFromDate: '2024-01-01' });
    await flush();

    expect(result.current.importFromDate).toBeNull();
  });
});
