/**
 * Which fiscal systems (SII / TicketBAI / VERI*FACTU) apply to a given document.
 *
 * Direction matters, and it is a HARD constraint of the underlying modules — not a
 * UI preference (ETP-3778 established it for the header/preview surfaces; ETP-5027
 * extended it to the line-level tax badge and to the two order windows):
 *
 *   - **VERI*FACTU is SALES-ONLY.** Every entry point filters on `issotrx='Y'`
 *     (`VerifactuUtils.java:159,507`, `GenerateRFAfterProcessingHook.java:57`,
 *     `AddQRCodeToInvoiceHook.java:267`, and at DB level
 *     `ETVFAC_C_INVOICE_SET_VERIFACTU.xml:71`). A VERI*FACTU key requested on a
 *     purchase document can never be sent anywhere.
 *   - **TicketBAI sends PURCHASES only under BIZKAIA (Batuz/LROE).** The sole
 *     purchase entry point is `PurchaseInvoiceBatuzRegister.java` (Batuz = Bizkaia)
 *     and `SynchronizeUtils.java:266` routes a purchase exclusively through the
 *     Bizkaia/LROE branch; there is no Gipuzkoa/Araba purchase schema. Sales are
 *     sent under all three territories.
 *   - **SII covers both directions** (it has a dedicated purchase book).
 *
 * @param {string|null|undefined} specName kebab-case spec (`sales-invoice`,
 *   `purchase-invoice`, `sales-order`, `purchase-order`). Orders are gated exactly
 *   like the invoice of the same direction.
 * @param {string|null|undefined} profile active fiscal profile from `useFiscalConfig`
 * @param {string|null|undefined} [territory] TBAI territory (`tbaiRecord.etsgSifTerritory`
 *   — the AD reference list is `AEAT` | `ARABA` | `BIZKAIA` | `GIPUZKOA` | `IGIC` | `NAVARRA`;
 *   only `BIZKAIA` enables TBAI for purchases, every other value (and a missing one) keeps it
 *   off). Optional: callers that only ever deal with
 *   sales, or that do not have the TBAI config at hand, may omit it — omitting it just
 *   keeps TBAI off for purchase documents, which is the safe (and, outside Bizkaia,
 *   the correct) default.
 * @returns {{showSii: boolean, showTbai: boolean, showVerifactu: boolean}}
 */
export function getInvoiceFiscalTargets(specName, profile, territory = null) {
  const isSales = specName === 'sales-invoice' || specName === 'sales-order';
  const isPurchase = specName === 'purchase-invoice' || specName === 'purchase-order';
  // TicketBAI on a purchase document is legitimate ONLY in Bizkaia (Batuz/LROE).
  const showTbaiForDoc = isSales || (isPurchase && territory === 'BIZKAIA');

  if (profile === 'sii' || profile === 'sii-navarra') {
    return { showSii: isSales || isPurchase, showTbai: false, showVerifactu: false };
  }

  if (profile === 'tbai') {
    return { showSii: false, showTbai: showTbaiForDoc, showVerifactu: false };
  }

  if (profile === 'sii+tbai') {
    return {
      showSii: isSales || isPurchase,
      showTbai: showTbaiForDoc,
      showVerifactu: false,
    };
  }

  if (profile === 'verifactu') {
    return { showSii: false, showTbai: false, showVerifactu: isSales };
  }

  return { showSii: false, showTbai: false, showVerifactu: false };
}
