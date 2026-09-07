// Relative import (not the `@/lib/...` alias): this module is exercised by
// `fiscalTargets.test.js` via plain `node --test` (see Makefile), which has no
// alias resolution — only Vitest-run specs can use the `@` alias.
import { parseCalendarDate } from '../../../lib/dateOnly.js';

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
/**
 * Whether an invoice's date makes it eligible for TicketBAI, given the
 * organization's TBAI "adoption date" (`tbaisystemdate`, from the `tbai-config`
 * / `header` entity).
 *
 * Mirrors the Classic gate exactly (ETP-5122):
 *   - Display side: `TBAI_ExistConfigAndIsAvailable` auxiliary input —
 *     `TO_TIMESTAMP(@DateInvoiced@, 'DD-MM-YYYY') >= conf.tbaisystemdate`.
 *   - Server-side backstop: `SynchronizeUtils.validateConfigAndInvoiceDates` —
 *     `invoice.getInvoiceDate().compareTo(config.getTbaisystemdate()) < 0` throws.
 *
 * Both compare the invoice date **truncated to midnight** (it is a date-only AD
 * field) against the config's **full timestamp** (`tbaisystemdate` carries a real
 * time-of-day component — it is set at whatever moment the org enabled TBAI). This
 * is NOT a same-calendar-day comparison: an invoice dated the same day the org
 * adopted TBAI, but before the adoption timestamp, is still ineligible — exactly
 * like Classic.
 *
 * `invoiceDateRaw` is parsed via `parseCalendarDate` (never a raw `new Date(string)`
 * on a date-only value — see `docs/i18n-guide.md`'s sibling rule in CLAUDE.md on
 * date-only parsing) so the calendar day is never shifted by the host's timezone
 * offset. `tbaiSystemDateRaw` is a genuine timestamp (not a date-only value), so
 * parsing it with `new Date(...)` and comparing epoch millis is safe — no local
 * calendar getters are read off it.
 *
 * Fail-safe: with no config / no adoption date on file, eligibility cannot be
 * confirmed, so this returns `false` (same as Classic's auxiliary input, which
 * returns 0 when no config row exists).
 *
 * @param {string|null|undefined} invoiceDateRaw the invoice's date-only field (e.g. `invoiceDate`)
 * @param {string|null|undefined} tbaiSystemDateRaw `tbaiRecord.tbaisystemdate` (a timestamp)
 * @returns {boolean}
 */
export function isTbaiEligibleByDate(invoiceDateRaw, tbaiSystemDateRaw) {
  if (!tbaiSystemDateRaw) return false;

  const invoiceDay = parseCalendarDate(invoiceDateRaw);
  if (!invoiceDay) return false;

  const adoptionInstant = new Date(tbaiSystemDateRaw);
  if (Number.isNaN(adoptionInstant.getTime())) return false;

  return invoiceDay.getTime() >= adoptionInstant.getTime();
}

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
