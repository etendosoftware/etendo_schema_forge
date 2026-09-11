// Mocks must come before imports (Vitest hoisting)

// ETP-5229 — useFiscalStatus.js now calls isSifEligibleByDate/isVerifactuEligibleByDate
// (real date-gate logic, already thoroughly unit-tested in fiscalTargets.test.js) in
// addition to getInvoiceFiscalTargets. Mocking only getInvoiceFiscalTargets (as this file
// used to) leaves the other two exports `undefined` on the mocked module and throws the
// moment a target flag is true — so we keep the REAL eligibility functions via
// importActual and only replace getInvoiceFiscalTargets, which is what every test here
// actually wants to control.
vi.mock('../fiscalTargets.js', async () => {
  const actual = await vi.importActual('../fiscalTargets.js');
  return {
    ...actual,
    getInvoiceFiscalTargets: vi.fn(),
  };
});

import { renderHook } from '@testing-library/react';
import { useFiscalStatus } from '../useFiscalStatus.js';
import { getInvoiceFiscalTargets } from '../fiscalTargets.js';

const SPEC = 'sales-invoice';
const ALL_SHOWN = { showSii: true, showTbai: true, showVerifactu: true };
const NONE_SHOWN = { showSii: false, showTbai: false, showVerifactu: false };
const ONLY_TBAI = { showSii: false, showTbai: true, showVerifactu: false };
const ONLY_SII = { showSii: true, showTbai: false, showVerifactu: false };
const ONLY_VF = { showSii: false, showTbai: false, showVerifactu: true };

// A cutoverDates fixture that makes every system eligible for any date used in these
// tests (all in 2024+) — mirrors the FAR_PAST_ADOPTION fixture used elsewhere.
const FAR_PAST_CUTOVERS = {
  sii: '2000-01-01T00:00:00.000Z',
  tbai: '2000-01-01T00:00:00.000Z',
  verifactu: '2000-01-01T00:00:00.000Z',
};

describe('useFiscalStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('invoice falsy', () => {
    it('returns nulls with loading true, without needing getInvoiceFiscalTargets to be meaningful', () => {
      getInvoiceFiscalTargets.mockReturnValue(NONE_SHOWN);
      const { result } = renderHook(() => useFiscalStatus(null, SPEC, 'sii'));

      expect(result.current).toEqual({ sii: null, tbai: null, verifactu: null, loading: true });
    });

    it('also returns loading:true for an undefined invoice', () => {
      getInvoiceFiscalTargets.mockReturnValue(NONE_SHOWN);
      const { result } = renderHook(() => useFiscalStatus(undefined, SPEC, 'sii'));

      expect(result.current).toEqual({ sii: null, tbai: null, verifactu: null, loading: true });
    });
  });

  describe('all fiscal targets disabled', () => {
    it('returns nulls with loading false regardless of the fields the invoice carries', () => {
      getInvoiceFiscalTargets.mockReturnValue(NONE_SHOWN);
      const invoice = { aeatsiiEstado: 'CO', tbaiSyncEstado: 'Recibido', etvfacInvoiceStatus: 'AC' };

      const { result } = renderHook(() => useFiscalStatus(invoice, SPEC, 'unconfigured'));

      expect(result.current).toEqual({ sii: null, tbai: null, verifactu: null, loading: false });
    });
  });

  describe('SII', () => {
    it('reads aeatsiiEstado directly off the invoice when showSii is true and the accountingDate is eligible', () => {
      getInvoiceFiscalTargets.mockReturnValue(ONLY_SII);
      const invoice = { aeatsiiEstado: 'CO', accountingDate: '2026-06-15' };

      const { result } = renderHook(() => useFiscalStatus(invoice, SPEC, 'sii', null, FAR_PAST_CUTOVERS));

      expect(result.current.sii).toBe('CO');
      expect(result.current.loading).toBe(false);
    });

    // ETP-5229 item #17: eligible + never-sent now resolves to the 'PE' pending
    // marker (the same code Classic's UpdateInvoicesPreSii writes when queuing),
    // not a fabricated null/dash — "not sent yet" and "not eligible" must render
    // differently.
    it('returns "PE" (pending marker, not a dash) when aeatsiiEstado is null but SII is eligible', () => {
      getInvoiceFiscalTargets.mockReturnValue(ONLY_SII);
      const invoice = { aeatsiiEstado: null, accountingDate: '2026-06-15' };

      const { result } = renderHook(() => useFiscalStatus(invoice, SPEC, 'sii', null, FAR_PAST_CUTOVERS));

      expect(result.current.sii).toBe('PE');
    });

    it('returns "PE" when aeatsiiEstado is undefined (field absent from the record) but SII is eligible', () => {
      getInvoiceFiscalTargets.mockReturnValue(ONLY_SII);
      const invoice = { accountingDate: '2026-06-15' };

      const { result } = renderHook(() => useFiscalStatus(invoice, SPEC, 'sii', null, FAR_PAST_CUTOVERS));

      expect(result.current.sii).toBe('PE');
    });

    // Regression guard (unchanged half of the ETP-5229 fix): when SII is NOT
    // eligible at all, the pending fallback must never kick in — still a dash.
    it('still returns null (not "PE") when SII is not eligible for this invoice, even with no aeatsiiEstado', () => {
      getInvoiceFiscalTargets.mockReturnValue(ONLY_SII);
      const invoice = { accountingDate: '2026-01-01' };

      const { result } = renderHook(() => useFiscalStatus(invoice, SPEC, 'sii', null, {
        sii: '2026-06-01T00:00:00.000Z',
      }));

      expect(result.current.sii).toBeNull();
    });

    it('returns the real persisted status unchanged when SII is eligible and aeatsiiEstado already holds a real code', () => {
      getInvoiceFiscalTargets.mockReturnValue(ONLY_SII);
      const invoice = { aeatsiiEstado: 'CO', accountingDate: '2026-06-15' };

      const { result } = renderHook(() => useFiscalStatus(invoice, SPEC, 'sii', null, FAR_PAST_CUTOVERS));

      expect(result.current.sii).toBe('CO');
    });

    it('is null when showSii is false, even if aeatsiiEstado is set', () => {
      getInvoiceFiscalTargets.mockReturnValue(NONE_SHOWN);
      const invoice = { aeatsiiEstado: 'CO', accountingDate: '2026-06-15' };

      const { result } = renderHook(() => useFiscalStatus(invoice, SPEC, 'tbai', null, FAR_PAST_CUTOVERS));

      expect(result.current.sii).toBeNull();
    });

    // ETP-5229 (corrected design): eligibility gate on the EARLIEST-ever cutover.
    it('is null when showSii is true but the invoice accountingDate predates the earliest SII cutover on file', () => {
      getInvoiceFiscalTargets.mockReturnValue(ONLY_SII);
      const invoice = { aeatsiiEstado: 'CO', accountingDate: '2026-01-01' };

      const { result } = renderHook(() => useFiscalStatus(invoice, SPEC, 'sii', null, {
        sii: '2026-06-01T00:00:00.000Z',
      }));

      expect(result.current.sii).toBeNull();
    });

    it('is null when showSii is true but no cutover date is on file at all (fail-safe)', () => {
      getInvoiceFiscalTargets.mockReturnValue(ONLY_SII);
      const invoice = { aeatsiiEstado: 'CO', accountingDate: '2026-06-15' };

      const { result } = renderHook(() => useFiscalStatus(invoice, SPEC, 'sii'));

      expect(result.current.sii).toBeNull();
    });

    it('is eligible when accountingDate exactly equals the cutover date (inclusive)', () => {
      getInvoiceFiscalTargets.mockReturnValue(ONLY_SII);
      const invoice = { aeatsiiEstado: 'CO', accountingDate: '2026-06-01' };

      const { result } = renderHook(() => useFiscalStatus(invoice, SPEC, 'sii', null, {
        sii: '2026-06-01T00:00:00.000Z',
      }));

      expect(result.current.sii).toBe('CO');
    });
  });

  describe('TBAI', () => {
    it('prefers tbaiSyncEstado over the tbaiIssent fallback when both are present', () => {
      getInvoiceFiscalTargets.mockReturnValue(ONLY_TBAI);
      const invoice = { tbaiSyncEstado: 'Recibido', tbaiIssent: true, invoiceDate: '2026-06-15' };

      const { result } = renderHook(() => useFiscalStatus(invoice, SPEC, 'tbai', null, FAR_PAST_CUTOVERS));

      expect(result.current.tbai).toBe('Recibido');
    });

    it('falls back to "Enviada" when tbaiSyncEstado is absent and tbaiIssent is boolean true', () => {
      getInvoiceFiscalTargets.mockReturnValue(ONLY_TBAI);
      const invoice = { tbaiIssent: true, invoiceDate: '2026-06-15' };

      const { result } = renderHook(() => useFiscalStatus(invoice, SPEC, 'tbai', null, FAR_PAST_CUTOVERS));

      expect(result.current.tbai).toBe('Enviada');
    });

    it('falls back to "Enviada" when tbaiSyncEstado is absent and tbaiIssent is the AD-style "Y" string', () => {
      getInvoiceFiscalTargets.mockReturnValue(ONLY_TBAI);
      const invoice = { tbaiIssent: 'Y', invoiceDate: '2026-06-15' };

      const { result } = renderHook(() => useFiscalStatus(invoice, SPEC, 'tbai', null, FAR_PAST_CUTOVERS));

      expect(result.current.tbai).toBe('Enviada');
    });

    // ETP-5229 item #17: the AD-style "N" string still isn't "sent", but the
    // invoice IS eligible for TBAI, so it now resolves to the "Pendiente"
    // marker instead of a dash.
    it('does NOT treat the AD-style "N" string as sent (isSent contract) — falls back to "Pendiente" since TBAI is eligible', () => {
      getInvoiceFiscalTargets.mockReturnValue(ONLY_TBAI);
      const invoice = { tbaiIssent: 'N', invoiceDate: '2026-06-15' };

      const { result } = renderHook(() => useFiscalStatus(invoice, SPEC, 'tbai', null, FAR_PAST_CUTOVERS));

      expect(result.current.tbai).toBe('Pendiente');
    });

    // ETP-5229 item #17: eligible + never-sent (no tbaiSyncEstado, no tbaiIssent)
    // now resolves to "Pendiente", not a dash — "not sent yet" and "not
    // eligible" must render differently.
    it('returns "Pendiente" (not a dash) when both tbaiSyncEstado and tbaiIssent are absent but TBAI is eligible', () => {
      getInvoiceFiscalTargets.mockReturnValue(ONLY_TBAI);
      const invoice = { invoiceDate: '2026-06-15' };

      const { result } = renderHook(() => useFiscalStatus(invoice, SPEC, 'tbai', null, FAR_PAST_CUTOVERS));

      expect(result.current.tbai).toBe('Pendiente');
    });

    // Regression guard (unchanged half of the ETP-5229 fix): when TBAI is NOT
    // eligible at all, the pending fallback must never kick in — still a dash.
    it('still returns null (not "Pendiente") when TBAI is not eligible for this invoice, even with no tbaiSyncEstado/tbaiIssent', () => {
      getInvoiceFiscalTargets.mockReturnValue(ONLY_TBAI);
      const invoice = { invoiceDate: '2026-01-01' };

      const { result } = renderHook(() => useFiscalStatus(invoice, SPEC, 'tbai', null, {
        tbai: '2026-06-01T00:00:00.000Z',
      }));

      expect(result.current.tbai).toBeNull();
    });

    it('returns the real persisted status unchanged when TBAI is eligible and tbaiSyncEstado already holds a real value', () => {
      getInvoiceFiscalTargets.mockReturnValue(ONLY_TBAI);
      const invoice = { tbaiSyncEstado: 'Recibido', invoiceDate: '2026-06-15' };

      const { result } = renderHook(() => useFiscalStatus(invoice, SPEC, 'tbai', null, FAR_PAST_CUTOVERS));

      expect(result.current.tbai).toBe('Recibido');
    });

    it('is null when showTbai is false, even if tbaiSyncEstado is set', () => {
      getInvoiceFiscalTargets.mockReturnValue(NONE_SHOWN);
      const invoice = { tbaiSyncEstado: 'Recibido', invoiceDate: '2026-06-15' };

      const { result } = renderHook(() => useFiscalStatus(invoice, SPEC, 'sii', null, FAR_PAST_CUTOVERS));

      expect(result.current.tbai).toBeNull();
    });

    // ETP-5229 (corrected design): eligibility gate on the EARLIEST-ever cutover.
    it('is null when showTbai is true but invoiceDate predates the earliest TBAI cutover on file', () => {
      getInvoiceFiscalTargets.mockReturnValue(ONLY_TBAI);
      const invoice = { tbaiSyncEstado: 'Recibido', invoiceDate: '2026-01-01' };

      const { result } = renderHook(() => useFiscalStatus(invoice, SPEC, 'tbai', null, {
        tbai: '2026-06-01T00:00:00.000Z',
      }));

      expect(result.current.tbai).toBeNull();
    });

    it('is null when showTbai is true but no cutover date is on file at all (fail-safe)', () => {
      getInvoiceFiscalTargets.mockReturnValue(ONLY_TBAI);
      const invoice = { tbaiSyncEstado: 'Recibido', invoiceDate: '2026-06-15' };

      const { result } = renderHook(() => useFiscalStatus(invoice, SPEC, 'tbai'));

      expect(result.current.tbai).toBeNull();
    });
  });

  describe('Verifactu', () => {
    it.each([
      ['AC', 'accepted'],
      ['AE', 'partiallyAccepted'],
      ['ER', 'rejected'],
      ['IN', 'invalid'],
      ['PE', 'vf_pending'],
    ])('maps etvfacInvoiceStatus %s to %s via mapVfStatus', (raw, mapped) => {
      getInvoiceFiscalTargets.mockReturnValue(ONLY_VF);
      const invoice = { etvfacInvoiceStatus: raw, created: '2026-06-15T00:00:00.000Z' };

      const { result } = renderHook(() => useFiscalStatus(invoice, SPEC, 'verifactu', null, FAR_PAST_CUTOVERS));

      expect(result.current.verifactu).toBe(mapped);
    });

    it('passes through an unrecognized code unchanged', () => {
      getInvoiceFiscalTargets.mockReturnValue(ONLY_VF);
      const invoice = { etvfacInvoiceStatus: 'WEIRD', created: '2026-06-15T00:00:00.000Z' };

      const { result } = renderHook(() => useFiscalStatus(invoice, SPEC, 'verifactu', null, FAR_PAST_CUTOVERS));

      expect(result.current.verifactu).toBe('WEIRD');
    });

    // ETP-5229 item #17: eligible + never-sent now resolves to 'PE' -> 'vf_pending'
    // via mapVfStatus (the same code GenerateRF writes when the billing record is
    // generated), not a fabricated null/dash.
    it('returns "vf_pending" (not a dash) when etvfacInvoiceStatus is null but Verifactu is eligible', () => {
      getInvoiceFiscalTargets.mockReturnValue(ONLY_VF);
      const invoice = { etvfacInvoiceStatus: null, created: '2026-06-15T00:00:00.000Z' };

      const { result } = renderHook(() => useFiscalStatus(invoice, SPEC, 'verifactu', null, FAR_PAST_CUTOVERS));

      expect(result.current.verifactu).toBe('vf_pending');
    });

    it('returns "vf_pending" when etvfacInvoiceStatus is undefined (field absent) but Verifactu is eligible', () => {
      getInvoiceFiscalTargets.mockReturnValue(ONLY_VF);
      const invoice = { created: '2026-06-15T00:00:00.000Z' };

      const { result } = renderHook(() => useFiscalStatus(invoice, SPEC, 'verifactu', null, FAR_PAST_CUTOVERS));

      expect(result.current.verifactu).toBe('vf_pending');
    });

    // Regression guard (unchanged half of the ETP-5229 fix): when Verifactu is
    // NOT eligible at all, the pending fallback must never kick in — still a dash.
    it('still returns null (not "vf_pending") when Verifactu is not eligible for this invoice, even with no etvfacInvoiceStatus', () => {
      getInvoiceFiscalTargets.mockReturnValue(ONLY_VF);
      const invoice = { created: '2026-01-01T00:00:00.000Z' };

      const { result } = renderHook(() => useFiscalStatus(invoice, SPEC, 'verifactu', null, {
        verifactu: '2026-06-01T00:00:00.000Z',
      }));

      expect(result.current.verifactu).toBeNull();
    });

    it('returns the real persisted status unchanged when Verifactu is eligible and etvfacInvoiceStatus already holds a real code', () => {
      getInvoiceFiscalTargets.mockReturnValue(ONLY_VF);
      const invoice = { etvfacInvoiceStatus: 'AC', created: '2026-06-15T00:00:00.000Z' };

      const { result } = renderHook(() => useFiscalStatus(invoice, SPEC, 'verifactu', null, FAR_PAST_CUTOVERS));

      expect(result.current.verifactu).toBe('accepted');
    });

    it('is null when showVerifactu is false, even if etvfacInvoiceStatus is set', () => {
      getInvoiceFiscalTargets.mockReturnValue(NONE_SHOWN);
      const invoice = { etvfacInvoiceStatus: 'AC', created: '2026-06-15T00:00:00.000Z' };

      const { result } = renderHook(() => useFiscalStatus(invoice, SPEC, 'sii', null, FAR_PAST_CUTOVERS));

      expect(result.current.verifactu).toBeNull();
    });

    // ETP-5229 (corrected design): eligibility gate on the EARLIEST-ever cutover.
    it('is null when showVerifactu is true but the invoice created timestamp predates the earliest Verifactu cutover on file', () => {
      getInvoiceFiscalTargets.mockReturnValue(ONLY_VF);
      const invoice = { etvfacInvoiceStatus: 'AC', created: '2026-01-01T00:00:00.000Z' };

      const { result } = renderHook(() => useFiscalStatus(invoice, SPEC, 'verifactu', null, {
        verifactu: '2026-06-01T00:00:00.000Z',
      }));

      expect(result.current.verifactu).toBeNull();
    });

    it('is null when showVerifactu is true but no cutover date is on file at all (fail-safe — org never configured Verifactu)', () => {
      getInvoiceFiscalTargets.mockReturnValue(ONLY_VF);
      const invoice = { etvfacInvoiceStatus: 'AC', created: '2026-06-15T00:00:00.000Z' };

      const { result } = renderHook(() => useFiscalStatus(invoice, SPEC, 'verifactu'));

      expect(result.current.verifactu).toBeNull();
    });
  });

  // ETP-5229 headline scenario: an invoice genuinely sent under an old/deactivated
  // fiscal config must still show its status, because the hook reads exclusively
  // off the invoice's own header record — as long as it is date-eligible against
  // the EARLIEST-ever cutover (not the currently active config's own cutover).
  describe('config-independence of the VALUE (ETP-5229 headline regression)', () => {
    it('resolves the status of an invoice sent under a config the org no longer uses, as long as it is date-eligible', () => {
      getInvoiceFiscalTargets.mockReturnValue(ALL_SHOWN);
      const invoiceUnderOldConfig = {
        aeatsiiEstado: 'CO',
        tbaiSyncEstado: 'Recibido',
        etvfacInvoiceStatus: 'AC',
        accountingDate: '2026-03-15',
        invoiceDate: '2026-03-15',
        created: '2026-03-15T00:00:00.000Z',
      };

      const { result } = renderHook(() => useFiscalStatus(
        invoiceUnderOldConfig, SPEC, 'sii+tbai', null, FAR_PAST_CUTOVERS,
      ));

      expect(result.current).toEqual({
        sii: 'CO',
        tbai: 'Recibido',
        verifactu: 'accepted',
        loading: false,
      });
    });

    it('is unaffected by adding unrelated config/org-shaped fields to the invoice object', () => {
      getInvoiceFiscalTargets.mockReturnValue(ALL_SHOWN);
      const base = {
        aeatsiiEstado: 'CO', tbaiSyncEstado: 'Recibido', etvfacInvoiceStatus: 'AC',
        accountingDate: '2026-03-15', invoiceDate: '2026-03-15', created: '2026-03-15T00:00:00.000Z',
      };
      const withStaleConfigFields = {
        ...base,
        organizationId: 'ORG_OLD',
        aeatsiiConfigId: 'CONFIG_DEACTIVATED',
        tbaiConfigId: 'CONFIG_DEACTIVATED',
      };

      const { result: withoutExtra } = renderHook(() => useFiscalStatus(base, SPEC, 'sii+tbai', null, FAR_PAST_CUTOVERS));
      const { result: withExtra } = renderHook(() => useFiscalStatus(withStaleConfigFields, SPEC, 'sii+tbai', null, FAR_PAST_CUTOVERS));

      expect(withExtra.current).toEqual(withoutExtra.current);
    });

    // Scenario B from the corrected design: an OLD deactivated config had an
    // EARLIER cutover than the currently-active one. The invoice, dated between
    // the two, must still show its real historical status — because the caller
    // passes the EARLIEST-ever cutover (across active+inactive rows), not the
    // active config's own (later) one.
    it('shows the real historical status for an invoice dated between an old deactivated config cutover and the newer active one (scenario B)', () => {
      getInvoiceFiscalTargets.mockReturnValue(ONLY_SII);
      const invoice = { aeatsiiEstado: 'CO', accountingDate: '2026-03-15' };
      // Earliest-ever cutover (from the deactivated row) is 2026-01-01, well
      // before the invoice — even though the active config's OWN cutover
      // (2026-06-01, not passed here) would have rejected it.
      const earliestCutoverAcrossAllRows = '2026-01-01T00:00:00.000Z';

      const { result } = renderHook(() => useFiscalStatus(invoice, SPEC, 'sii', null, {
        sii: earliestCutoverAcrossAllRows,
      }));

      expect(result.current.sii).toBe('CO');
    });
  });

  // Scenario A from the corrected design (the exact live repro): TBAI and SII
  // have independent earliest-cutover dates for the same org, and the SAME
  // invoice must resolve each system by its own reference date/cutover pair —
  // one dash, one real value.
  describe('independent per-system cutovers on the SAME invoice (ETP-5229 scenario A)', () => {
    it('shows a dash for SII (before its only-ever cutover) while showing the real TBAI status (on/after its cutover)', () => {
      getInvoiceFiscalTargets.mockReturnValue({ showSii: true, showTbai: true, showVerifactu: false });
      const invoice = {
        invoiceDate: '2026-09-09',
        accountingDate: '2026-09-09',
        aeatsiiEstado: 'PE',
        tbaiSyncEstado: 'Recibido',
      };

      const { result } = renderHook(() => useFiscalStatus(invoice, SPEC, 'sii+tbai', null, {
        tbai: '2026-09-09T00:00:00.000Z', // adopted the same day, inclusive → eligible
        sii: '2026-09-10T00:00:00.000Z',  // adopted the NEXT day → invoice ineligible
      }));

      expect(result.current.sii).toBeNull();
      expect(result.current.tbai).toBe('Recibido');
    });
  });

  describe('memoization', () => {
    it('does not recompute (same object reference) when rerendered with unchanged inputs', () => {
      getInvoiceFiscalTargets.mockReturnValue(ONLY_SII);
      const invoice = { aeatsiiEstado: 'CO', accountingDate: '2026-06-15' };

      const { result, rerender } = renderHook(
        ({ inv, spec, profile }) => useFiscalStatus(inv, spec, profile, null, FAR_PAST_CUTOVERS),
        { initialProps: { inv: invoice, spec: SPEC, profile: 'sii' } },
      );

      const firstResult = result.current;
      rerender({ inv: invoice, spec: SPEC, profile: 'sii' });

      expect(result.current).toBe(firstResult);
      expect(getInvoiceFiscalTargets).toHaveBeenCalledTimes(1);
    });

    it('recomputes when the invoice reference changes', () => {
      getInvoiceFiscalTargets.mockReturnValue(ONLY_SII);

      const { result, rerender } = renderHook(
        ({ inv }) => useFiscalStatus(inv, SPEC, 'sii', null, FAR_PAST_CUTOVERS),
        { initialProps: { inv: { aeatsiiEstado: 'CO', accountingDate: '2026-06-15' } } },
      );

      const firstResult = result.current;
      rerender({ inv: { aeatsiiEstado: 'PE', accountingDate: '2026-06-15' } });

      expect(result.current).not.toBe(firstResult);
      expect(result.current.sii).toBe('PE');
    });

    // ETP-5229: the memo dependency array must include the 3 cutover dates so a
    // refetch of useFiscalConfig (e.g. after a "Change SIF" flow) recomputes
    // eligibility instead of serving a stale memoized result.
    it('recomputes when a cutover date changes even though the invoice reference is unchanged', () => {
      getInvoiceFiscalTargets.mockReturnValue(ONLY_SII);
      const invoice = { aeatsiiEstado: 'CO', accountingDate: '2026-03-15' };

      const { result, rerender } = renderHook(
        ({ cutoverDates }) => useFiscalStatus(invoice, SPEC, 'sii', null, cutoverDates),
        { initialProps: { cutoverDates: { sii: '2026-06-01T00:00:00.000Z' } } },
      );

      expect(result.current.sii).toBeNull();

      rerender({ cutoverDates: { sii: '2026-01-01T00:00:00.000Z' } });

      expect(result.current.sii).toBe('CO');
    });
  });

  // ETP-5087: territory must still be forwarded to getInvoiceFiscalTargets.
  describe('territory forwarding (ETP-5087)', () => {
    it('forwards the territory argument to getInvoiceFiscalTargets', () => {
      getInvoiceFiscalTargets.mockReturnValue(ONLY_TBAI);
      const invoice = { tbaiSyncEstado: 'Recibido', invoiceDate: '2026-06-15' };

      renderHook(() => useFiscalStatus(invoice, 'purchase-invoice', 'tbai', 'BIZKAIA', FAR_PAST_CUTOVERS));

      expect(getInvoiceFiscalTargets).toHaveBeenCalledWith('purchase-invoice', 'tbai', 'BIZKAIA');
    });

    it('defaults territory to null when not provided', () => {
      getInvoiceFiscalTargets.mockReturnValue(NONE_SHOWN);
      const invoice = { tbaiSyncEstado: 'Recibido' };

      renderHook(() => useFiscalStatus(invoice, 'purchase-invoice', 'tbai'));

      expect(getInvoiceFiscalTargets).toHaveBeenCalledWith('purchase-invoice', 'tbai', null);
    });
  });

  // ETP-5229: cutoverDates is optional and defaults to {} so pre-existing call
  // sites (tests or components not yet updated to pass it) degrade to "not
  // eligible" instead of throwing.
  describe('cutoverDates defaulting (backward compatibility)', () => {
    it('defaults every system to ineligible (dash) when cutoverDates is omitted entirely', () => {
      getInvoiceFiscalTargets.mockReturnValue(ALL_SHOWN);
      const invoice = {
        aeatsiiEstado: 'CO', tbaiSyncEstado: 'Recibido', etvfacInvoiceStatus: 'AC',
        accountingDate: '2026-06-15', invoiceDate: '2026-06-15', created: '2026-06-15T00:00:00.000Z',
      };

      const { result } = renderHook(() => useFiscalStatus(invoice, SPEC, 'sii+tbai'));

      expect(result.current).toEqual({ sii: null, tbai: null, verifactu: null, loading: false });
    });

    it('defaults a partially-provided cutoverDates object — only the given system is eligible', () => {
      getInvoiceFiscalTargets.mockReturnValue(ALL_SHOWN);
      const invoice = {
        aeatsiiEstado: 'CO', tbaiSyncEstado: 'Recibido', etvfacInvoiceStatus: 'AC',
        accountingDate: '2026-06-15', invoiceDate: '2026-06-15', created: '2026-06-15T00:00:00.000Z',
      };

      const { result } = renderHook(() => useFiscalStatus(invoice, SPEC, 'sii+tbai', null, {
        sii: '2000-01-01T00:00:00.000Z',
      }));

      expect(result.current.sii).toBe('CO');
      expect(result.current.tbai).toBeNull();
      expect(result.current.verifactu).toBeNull();
    });
  });
});
