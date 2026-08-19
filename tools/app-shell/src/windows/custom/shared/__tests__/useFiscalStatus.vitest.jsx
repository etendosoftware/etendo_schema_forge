// Mocks must come before imports (Vitest hoisting)

import { createStableUseApiFetchMock } from '@/test/mockUseApiFetch.js';

vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: createStableUseApiFetchMock(),
}));

vi.mock('../fiscalTargets.js', () => ({
  getInvoiceFiscalTargets: vi.fn(),
}));

import { renderHook, act, waitFor } from '@testing-library/react';
import { useFiscalStatus } from '../useFiscalStatus.js';
import { getInvoiceFiscalTargets } from '../fiscalTargets.js';

const SPEC = 'sales-invoice';
const API_BASE_URL = '/sws/neo/sales-invoice';
const ALL_SHOWN = { showSii: true, showTbai: true, showVerifactu: true };
const NONE_SHOWN = { showSii: false, showTbai: false, showVerifactu: false };
const ONLY_TBAI = { showSii: false, showTbai: true, showVerifactu: false };
const ONLY_SII = { showSii: true, showTbai: false, showVerifactu: false };

function jsonResponse(data) {
  return Promise.resolve({ ok: true, json: async () => ({ response: { data } }) });
}

/**
 * Generic fetch router keyed by substring match against the request URL.
 * Each handler receives the running call count for that substring, so tests
 * can return different payloads across successive calls (e.g. before/after
 * a refetch triggered by the invoice-updated event).
 */
function makeFetchMock(handlers) {
  const counts = {};
  return vi.fn((url) => {
    for (const [substr, handler] of handlers) {
      if (url.includes(substr)) {
        counts[substr] = (counts[substr] ?? 0) + 1;
        return handler(counts[substr]);
      }
    }
    return jsonResponse([]);
  });
}

describe('useFiscalStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('invoiceId falsy', () => {
    it('returns nulls without loading and without calling getInvoiceFiscalTargets or fetch', () => {
      globalThis.fetch = vi.fn();
      const { result } = renderHook(() => useFiscalStatus(null, SPEC, 'tbai', API_BASE_URL, 'ORG_1'));

      expect(result.current).toEqual({ sii: null, tbai: null, verifactu: null, loading: false });
      expect(getInvoiceFiscalTargets).not.toHaveBeenCalled();
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });
  });

  describe('all fiscal targets disabled (e.g. unconfigured org)', () => {
    it('returns nulls without fetching any of the three specs', () => {
      getInvoiceFiscalTargets.mockReturnValue(NONE_SHOWN);
      globalThis.fetch = vi.fn();

      const { result } = renderHook(() => useFiscalStatus('inv-1', SPEC, 'unconfigured', API_BASE_URL, 'ORG_1'));

      expect(result.current).toEqual({ sii: null, tbai: null, verifactu: null, loading: false });
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });
  });

  describe('initial fetch on mount', () => {
    it('resolves sii, tbai and verifactu from their respective specs when all targets are enabled', async () => {
      getInvoiceFiscalTargets.mockReturnValue(ALL_SHOWN);
      globalThis.fetch = makeFetchMock([
        ['sii-monitor/organizations', () => jsonResponse([{ id: 'PARENT_1' }])],
        ['sii-monitor/issuedInvoices', () => jsonResponse([{ aeatsiiEstado: 'Enviada' }])],
        ['tbai-facturas-enviadas', () => jsonResponse([{ estado: 'Enviado' }])],
        ['monitor-verifactu/facturasAceptadas', () => jsonResponse([{ verifactuSendingStatus: 'AC' }])],
      ]);

      const { result } = renderHook(() => useFiscalStatus('inv-1', SPEC, 'sii+tbai', API_BASE_URL, 'ORG_1'));

      expect(result.current.loading).toBe(true);
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.sii).toBe('Enviada');
      expect(result.current.tbai).toBe('Enviado');
      expect(result.current.verifactu).toBe('AC');
    });

    it('falls through the verifactu entity list until one returns a non-null status', async () => {
      getInvoiceFiscalTargets.mockReturnValue({ showSii: false, showTbai: false, showVerifactu: true });
      globalThis.fetch = makeFetchMock([
        ['monitor-verifactu/facturasAceptadas', () => jsonResponse([])],
        ['monitor-verifactu/facturasParcialmenteAceptadas', () => jsonResponse([])],
        ['monitor-verifactu/facturasRechazadas', () => jsonResponse([{ verifactuSendingStatus: 'ER' }])],
      ]);

      const { result } = renderHook(() => useFiscalStatus('inv-1', SPEC, 'verifactu', API_BASE_URL, 'ORG_1'));

      await waitFor(() => expect(result.current.loading).toBe(false));
      // ETP-4783: raw DB code 'ER' is mapped to 'rejected' via VF_STATUS_MAP to avoid
      // collision with SII's own 'IN' code ("Rechazado" vs "Inválido").
      expect(result.current.verifactu).toBe('rejected');
      expect(result.current.sii).toBeNull();
      expect(result.current.tbai).toBeNull();
    });
  });

  describe('showSii/showTbai/showVerifactu gating', () => {
    it('only queries the SII endpoints when showSii is the only enabled target', async () => {
      getInvoiceFiscalTargets.mockReturnValue(ONLY_SII);
      globalThis.fetch = makeFetchMock([
        ['sii-monitor/organizations', () => jsonResponse([{ id: 'PARENT_1' }])],
        ['sii-monitor/issuedInvoices', () => jsonResponse([{ aeatsiiEstado: 'Enviada' }])],
      ]);

      const { result } = renderHook(() => useFiscalStatus('inv-1', SPEC, 'sii', API_BASE_URL, 'ORG_1'));
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.sii).toBe('Enviada');
      expect(result.current.tbai).toBeNull();
      expect(result.current.verifactu).toBeNull();

      const calledUrls = globalThis.fetch.mock.calls.map(([url]) => url);
      expect(calledUrls.some((u) => u.includes('tbai-facturas-enviadas'))).toBe(false);
      expect(calledUrls.some((u) => u.includes('monitor-verifactu'))).toBe(false);
    });

    it('only queries the TBAI endpoint when showTbai is the only enabled target', async () => {
      getInvoiceFiscalTargets.mockReturnValue(ONLY_TBAI);
      globalThis.fetch = makeFetchMock([
        ['tbai-facturas-enviadas', () => jsonResponse([{ estado: 'Enviado' }])],
      ]);

      const { result } = renderHook(() => useFiscalStatus('inv-1', SPEC, 'tbai', API_BASE_URL, 'ORG_1'));
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.tbai).toBe('Enviado');
      const calledUrls = globalThis.fetch.mock.calls.map(([url]) => url);
      expect(calledUrls.some((u) => u.includes('sii-monitor'))).toBe(false);
      expect(calledUrls.some((u) => u.includes('monitor-verifactu'))).toBe(false);
    });

    it('does not fetch SII status when showSii is enabled but orgId is missing', async () => {
      getInvoiceFiscalTargets.mockReturnValue(ONLY_SII);
      globalThis.fetch = makeFetchMock([
        ['sii-monitor/organizations', () => jsonResponse([{ id: 'PARENT_1' }])],
      ]);

      const { result } = renderHook(() => useFiscalStatus('inv-1', SPEC, 'sii', API_BASE_URL, null));
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.sii).toBeNull();
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });
  });

  describe('regression: refetch triggered by the invoice-updated event', () => {
    it('re-fetches and updates tbai after a matching "{spec}:invoice-updated" event, proving the stale-pill bug is fixed', async () => {
      getInvoiceFiscalTargets.mockReturnValue(ONLY_TBAI);
      globalThis.fetch = makeFetchMock([
        ['tbai-facturas-enviadas', (n) => (n === 1 ? jsonResponse([]) : jsonResponse([{ estado: 'Enviado' }]))],
      ]);

      const { result } = renderHook(() => useFiscalStatus('inv-1', SPEC, 'tbai', API_BASE_URL, 'ORG_1'));

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.tbai).toBeNull();
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);

      act(() => {
        window.dispatchEvent(new CustomEvent(`${SPEC}:invoice-updated`, { detail: { invoiceId: 'inv-1' } }));
      });

      await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(result.current.tbai).toBe('Enviado'));
      expect(result.current.loading).toBe(false);
    });

    it('re-fetches sii and verifactu too (not just tbai) after a matching invoice-updated event', async () => {
      getInvoiceFiscalTargets.mockReturnValue(ALL_SHOWN);
      globalThis.fetch = makeFetchMock([
        ['sii-monitor/organizations', () => jsonResponse([{ id: 'PARENT_1' }])],
        ['sii-monitor/issuedInvoices', (n) => (n === 1 ? jsonResponse([]) : jsonResponse([{ aeatsiiEstado: 'Enviada' }]))],
        ['tbai-facturas-enviadas', (n) => (n === 1 ? jsonResponse([]) : jsonResponse([{ estado: 'Enviado' }]))],
        ['monitor-verifactu/facturasAceptadas', (n) => (n === 1 ? jsonResponse([]) : jsonResponse([{ verifactuSendingStatus: 'AC' }]))],
      ]);

      const { result } = renderHook(() => useFiscalStatus('inv-1', SPEC, 'sii+tbai', API_BASE_URL, 'ORG_1'));

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.sii).toBeNull();
      expect(result.current.tbai).toBeNull();
      expect(result.current.verifactu).toBeNull();

      act(() => {
        window.dispatchEvent(new CustomEvent(`${SPEC}:invoice-updated`, { detail: { invoiceId: 'inv-1' } }));
      });

      await waitFor(() => expect(result.current.sii).toBe('Enviada'));
      expect(result.current.tbai).toBe('Enviado');
      expect(result.current.verifactu).toBe('AC');
    });

    it('does NOT re-fetch when the event carries a different invoiceId', async () => {
      getInvoiceFiscalTargets.mockReturnValue(ONLY_TBAI);
      globalThis.fetch = makeFetchMock([
        ['tbai-facturas-enviadas', () => jsonResponse([])],
      ]);

      const { result } = renderHook(() => useFiscalStatus('inv-1', SPEC, 'tbai', API_BASE_URL, 'ORG_1'));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);

      act(() => {
        window.dispatchEvent(new CustomEvent(`${SPEC}:invoice-updated`, { detail: { invoiceId: 'inv-OTHER' } }));
      });

      // Give any (incorrect) async refetch a chance to run before asserting it didn't.
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      expect(result.current.tbai).toBeNull();
    });
  });
});
