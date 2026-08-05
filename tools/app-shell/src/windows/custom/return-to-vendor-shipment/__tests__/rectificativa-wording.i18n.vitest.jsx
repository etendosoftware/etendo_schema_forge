import { describe, it, expect } from 'vitest';
import enUS from '@/locales/en_US.json';
import esES from '@/locales/es_ES.json';
import esAR from '@/locales/es_AR.json';

/**
 * ETP-4737 QA finding (BUG — see QA report): the `return-to-vendor-shipment`
 * window's Goods Return confirm-card/modal wording was never updated from
 * the old "Nota de Crédito"/"factura de devolución de compra" phrasing to
 * the new unified "Factura Rectificativa" naming, in ANY of the 3 locales —
 * unlike its sales-side counterpart `return-material-receipt`, whose
 * equivalent `returnReceipt.*` keys WERE correctly renamed (see
 * `docs/generated-custom-windows/return-material-receipt.md`).
 *
 * This test intentionally FAILS until `returnToVendor.createCreditNote` /
 * `returnToVendor.createCreditNoteDescription` /
 * `returnToVendor.confirmModal.infoRowPost` /
 * `returnToVendor.confirmModal.confirmWithInvoice` are reworded to reference
 * "Factura Rectificativa" (or the equivalent per locale), mirroring the
 * `returnReceipt.*` keys already fixed for the sales side.
 */
describe('return-to-vendor-shipment — rectificativa wording (ETP-4737 edge case 8)', () => {
  const locales = {
    en_US: enUS.genericLabels,
    es_ES: esES.genericLabels,
    es_AR: esAR.genericLabels,
  };

  const OLD_WORDING_PATTERNS = [/nota de cr.dito/i, /credit note/i, /factura de devoluci.n/i];

  for (const [locale, labels] of Object.entries(locales)) {
    it(`${locale}: returnToVendor.createCreditNote no longer says "Credit Note" / "Nota de Crédito"`, () => {
      const value = labels['returnToVendor.createCreditNote'];
      expect(value).toBeTruthy();
      for (const pattern of OLD_WORDING_PATTERNS) {
        expect(value).not.toMatch(pattern);
      }
    });

    it(`${locale}: returnToVendor.createCreditNoteDescription card text is present`, () => {
      expect(labels['returnToVendor.createCreditNoteDescription']).toBeTruthy();
    });

    it(`${locale}: returnToVendor.confirmModal.infoRowPost no longer references the old return-invoice/credit-note wording`, () => {
      const value = labels['returnToVendor.confirmModal.infoRowPost'];
      expect(value).toBeTruthy();
      for (const pattern of OLD_WORDING_PATTERNS) {
        expect(value).not.toMatch(pattern);
      }
    });

    it(`${locale}: returnToVendor.confirmModal.confirmWithInvoice no longer references the old wording`, () => {
      const value = labels['returnToVendor.confirmModal.confirmWithInvoice'];
      expect(value).toBeTruthy();
      for (const pattern of OLD_WORDING_PATTERNS) {
        expect(value).not.toMatch(pattern);
      }
    });
  }
});
