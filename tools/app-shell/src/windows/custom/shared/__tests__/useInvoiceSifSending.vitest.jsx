// @covers tools/app-shell/src/windows/custom/shared/useInvoiceSifSending.js
import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const useFiscalConfigMock = vi.fn();

vi.mock('@/windows/custom/fiscal-config/useFiscalConfig.js', () => ({
  useFiscalConfig: (...args) => useFiscalConfigMock(...args),
}));

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ selectedOrg: { id: 'NAV_ORG' } }),
}));

import { useInvoiceSifSending } from '../useInvoiceSifSending.js';

const SII = { profile: 'sii', tbaiRecord: null, earliestSiiCutoverDate: '2026-10-09', earliestTbaiCutoverDate: null };
const TBAI = {
  profile: 'tbai',
  tbaiRecord: { etsgSifTerritory: 'BIZKAIA', tbaisystemdate: '2026-10-09' },
  earliestSiiCutoverDate: null,
  earliestTbaiCutoverDate: '2026-10-09',
};
const BOTH = { ...TBAI, profile: 'sii+tbai', earliestSiiCutoverDate: '2026-10-09' };

const INVOICE = {
  id: 'INV_1',
  adOrgId: 'INVOICE_ORG',
  documentStatus: 'CO',
  accountingDate: '2026-10-09',
  invoiceDate: '2026-10-09',
  aeatsiiIssent: false,
  tbaiIssent: false,
};

function run({ data = INVOICE, apiBaseUrl = '/sws/neo/sales-invoice', config = SII } = {}) {
  useFiscalConfigMock.mockReturnValue(config);
  return renderHook(() => useInvoiceSifSending({ data, apiBaseUrl })).result.current;
}

describe('useInvoiceSifSending', () => {
  beforeEach(() => {
    useFiscalConfigMock.mockReset();
  });

  describe('context', () => {
    it('derives the spec and the NEO base from apiBaseUrl', () => {
      const out = run({ apiBaseUrl: '/sws/neo/purchase-invoice' });
      expect(out.specName).toBe('purchase-invoice');
      expect(out.base).toBe('/sws/neo');
    });

    it('falls back to sales-invoice when apiBaseUrl is missing', () => {
      expect(run({ apiBaseUrl: undefined }).specName).toBe('sales-invoice');
    });

    it("loads the fiscal config of the invoice's own org, not the top-nav org", () => {
      run();
      expect(useFiscalConfigMock).toHaveBeenCalledWith('INVOICE_ORG', '/sws/neo/sales-invoice');
    });

    it('falls back to the top-nav org when the invoice carries no org', () => {
      run({ data: { ...INVOICE, adOrgId: undefined } });
      expect(useFiscalConfigMock).toHaveBeenCalledWith('NAV_ORG', '/sws/neo/sales-invoice');
    });
  });

  describe('gating', () => {
    it('is pending for SII on the adoption day itself', () => {
      const out = run();
      expect(out.pendingTargets).toEqual({ sendSii: true, sendTbai: false });
      expect(out.hasPendingTargets).toBe(true);
    });

    it('is not pending for a document dated before the adoption day', () => {
      const out = run({ data: { ...INVOICE, accountingDate: '2026-10-08' } });
      expect(out.hasPendingTargets).toBe(false);
    });

    it('is not pending without an adoption date on file', () => {
      expect(run({ config: { ...SII, earliestSiiCutoverDate: null } }).hasPendingTargets).toBe(false);
    });

    it('is not pending without a fiscal profile', () => {
      expect(run({ config: { ...SII, profile: null } }).hasPendingTargets).toBe(false);
    });

    it('reports nothing pending when SII and TBAI are already sent', () => {
      const out = run({ config: BOTH, data: { ...INVOICE, aeatsiiIssent: 'Y', tbaiIssent: true } });
      expect(out.pendingTargets).toEqual({ sendSii: false, sendTbai: false });
      expect(out.hasPendingTargets).toBe(false);
    });

    it('treats the N flag as not sent', () => {
      expect(run({ data: { ...INVOICE, aeatsiiIssent: 'N' } }).hasPendingTargets).toBe(true);
    });

    it('offers TBAI on a purchase invoice only in Bizkaia', () => {
      const bizkaia = run({ apiBaseUrl: '/sws/neo/purchase-invoice', config: TBAI });
      expect(bizkaia.pendingTargets.sendTbai).toBe(true);

      const gipuzkoa = run({
        apiBaseUrl: '/sws/neo/purchase-invoice',
        config: { ...TBAI, tbaiRecord: { ...TBAI.tbaiRecord, etsgSifTerritory: 'GIPUZKOA' } },
      });
      expect(gipuzkoa.hasPendingTargets).toBe(false);
    });

    it('gates TBAI on the invoice date and SII on the accounting date', () => {
      const out = run({ config: BOTH, data: { ...INVOICE, invoiceDate: '2026-10-08', accountingDate: '2026-10-09' } });
      expect(out.pendingTargets).toEqual({ sendSii: true, sendTbai: false });
    });
  });

  describe('copy', () => {
    it.each([
      ['/sws/neo/sales-invoice', 'sendToSifLabelSii', 'sendToSifBodySii', SII],
      ['/sws/neo/sales-invoice', 'sendToSifLabelTbai', 'sendToSifBodyTbai', TBAI],
      ['/sws/neo/sales-invoice', 'sendToSifLabelBoth', 'sendToSifBodyBoth', BOTH],
      ['/sws/neo/purchase-invoice', 'sendToSifLabelTbaiPurchase', 'sendToSifBodyTbaiPurchase', TBAI],
      ['/sws/neo/purchase-invoice', 'sendToSifLabelBothPurchase', 'sendToSifBodyBothPurchase', BOTH],
    ])('%s -> %s / %s', (apiBaseUrl, labelKey, bodyKey, config) => {
      const out = run({ apiBaseUrl, config });
      expect(out.labelKey).toBe(labelKey);
      expect(out.bodyKey).toBe(bodyKey);
    });
  });
});
