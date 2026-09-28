import { toast } from 'sonner';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

const { mockExtractErrorMessage } = vi.hoisted(() => ({ mockExtractErrorMessage: vi.fn() }));
vi.mock('@/hooks/useEntity.js', async (importOriginal) => ({
  ...(await importOriginal()),
  extractErrorMessage: (...args) => mockExtractErrorMessage(...args),
}));

import { PROCESS_FAILURE_TOAST_DURATION_MS } from '@/hooks/useEntity.js';
import { VOID_BODY, isVoidableRow, voidInternalConsumption } from '../voidInternalConsumption.js';

// Identity translator, except the error template, so the {error} interpolation is observable.
const ui = (key) => (key === 'internalConsumptionVoidError' ? 'Void failed: {error}' : key);

describe('voidInternalConsumption helper (ETP-5445)', () => {
  let apiFetch;

  beforeEach(() => {
    vi.clearAllMocks();
    apiFetch = vi.fn();
    mockExtractErrorMessage.mockReset();
  });

  describe('VOID_BODY', () => {
    it('is the flat { action: VO } JSON body', () => {
      expect(JSON.parse(VOID_BODY)).toEqual({ action: 'VO' });
    });
  });

  describe('isVoidableRow', () => {
    it.each([
      [{ status: 'CO' }, true],
      [{ status: 'CO', processed: 'Y', posted: 'Y' }, true],
      [{ status: 'DR' }, false],
      [{ status: 'VO' }, false],
      [{ status: 'co' }, false],
      [{}, false],
      [null, false],
      [undefined, false],
    ])('isVoidableRow(%j) === %s', (row, expected) => {
      expect(isVoidableRow(row)).toBe(expected);
    });
  });

  describe('voidInternalConsumption', () => {
    it('on success POSTs VOID_BODY to processNow, toasts internalConsumptionVoided and resolves success', async () => {
      apiFetch.mockResolvedValue({ ok: true });

      const result = await voidInternalConsumption({ apiFetch, recordId: 'ic-1', ui });

      expect(apiFetch).toHaveBeenCalledTimes(1);
      const [url, init] = apiFetch.mock.calls[0];
      expect(url).toBe('/internalConsumption/ic-1/action/processNow');
      expect(init.method).toBe('POST');
      expect(init.body).toBe(VOID_BODY);
      expect(result).toEqual({ success: true });
      expect(toast.success).toHaveBeenCalledWith('internalConsumptionVoided');
      expect(toast.error).not.toHaveBeenCalled();
      expect(mockExtractErrorMessage).not.toHaveBeenCalled();
    });

    it('prefixes basePath when given (detail kebab passes its apiBaseUrl)', async () => {
      apiFetch.mockResolvedValue({ ok: true });

      await voidInternalConsumption({ apiFetch, basePath: '/sws/neo/internal-consumption', recordId: 'ic-1', ui });

      expect(apiFetch.mock.calls[0][0]).toBe('/sws/neo/internal-consumption/internalConsumption/ic-1/action/processNow');
    });

    it('URL-encodes the record id', async () => {
      apiFetch.mockResolvedValue({ ok: true });

      await voidInternalConsumption({ apiFetch, recordId: 'a/b c?', ui });

      expect(apiFetch.mock.calls[0][0]).toBe('/internalConsumption/a%2Fb%20c%3F/action/processNow');
    });

    it('on !ok interpolates the extracted message into internalConsumptionVoidError with the long duration', async () => {
      const res = { ok: false, status: 400 };
      apiFetch.mockResolvedValue(res);
      mockExtractErrorMessage.mockResolvedValue('Periodo cerrado');

      const result = await voidInternalConsumption({ apiFetch, recordId: 'ic-1', ui });

      expect(mockExtractErrorMessage).toHaveBeenCalledWith(res, ui);
      expect(toast.error).toHaveBeenCalledWith('Void failed: Periodo cerrado', { duration: PROCESS_FAILURE_TOAST_DURATION_MS });
      expect(toast.success).not.toHaveBeenCalled();
      expect(result).toEqual({ success: false, message: 'Periodo cerrado' });
    });

    it('on !ok with no extractable message falls back to actionFailed inside the template', async () => {
      apiFetch.mockResolvedValue({ ok: false, status: 500 });
      mockExtractErrorMessage.mockResolvedValue('');

      const result = await voidInternalConsumption({ apiFetch, recordId: 'ic-1', ui });

      expect(toast.error).toHaveBeenCalledWith('Void failed: actionFailed', { duration: PROCESS_FAILURE_TOAST_DURATION_MS });
      expect(result.success).toBe(false);
    });

    it('never throws on a network error: toasts actionFailed with the long duration and resolves success:false', async () => {
      apiFetch.mockRejectedValue(new TypeError('Failed to fetch'));

      const result = await voidInternalConsumption({ apiFetch, recordId: 'ic-1', ui });

      expect(result).toEqual({ success: false });
      expect(toast.error).toHaveBeenCalledWith('actionFailed', { duration: PROCESS_FAILURE_TOAST_DURATION_MS });
      expect(toast.success).not.toHaveBeenCalled();
      expect(mockExtractErrorMessage).not.toHaveBeenCalled();
    });

    it('uses the 8s process-failure duration for error toasts', () => {
      expect(PROCESS_FAILURE_TOAST_DURATION_MS).toBe(8000);
    });
  });
});
