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

/**
 * Whether a document's reference date makes it eligible for a given fiscal
 * system (SII / TicketBAI / VERI*FACTU), given that system's "adoption date"
 * for the organization.
 *
 * Generalized from the TBAI-only gate (ETP-5122) so the same "no status before
 * adoption" rule applies to all three systems, each compared against the date
 * Classic itself uses for that system (ETP-5122 follow-up):
 *   - **TBAI**: invoice date (`invoiceDate`) vs. `tbaiRecord.tbaisystemdate`.
 *     Mirrors Classic's `TBAI_ExistConfigAndIsAvailable` auxiliary input
 *     (`TO_TIMESTAMP(@DateInvoiced@, 'DD-MM-YYYY') >= conf.tbaisystemdate`) and
 *     the server-side backstop `SynchronizeUtils.validateConfigAndInvoiceDates`.
 *   - **VERI*FACTU**: invoice date (`invoiceDate`) vs. `verifactuRecord.inVfactuSystem`.
 *   - **SII**: accounting date (`accountingDate`, NOT invoice date) vs.
 *     `siiRecord.fechaAcogidaSII`. Classic's `AEATSII_PreSII_Invoice` auxiliary
 *     input compares `DateAcct`, not `DateInvoiced` — SII books by accounting
 *     date, so this is a deliberate asymmetry, not an oversight.
 *
 * Both sides compare the reference date **truncated to midnight** (it is a
 * date-only AD field) against the config's **full timestamp** (the adoption
 * date can carry a real time-of-day component — it is set at whatever moment
 * the org enabled the system). This is NOT a same-calendar-day comparison: a
 * document dated the same day the org adopted the system, but before the exact
 * adoption timestamp, is still ineligible — exactly like Classic.
 *
 * `referenceDateRaw` is parsed via `parseCalendarDate` (never a raw
 * `new Date(string)` on a date-only value — see `docs/i18n-guide.md`'s sibling
 * rule in CLAUDE.md on date-only parsing) so the calendar day is never shifted
 * by the host's timezone offset. `adoptionDateRaw` is a genuine timestamp (not
 * a date-only value), so parsing it with `new Date(...)` and comparing epoch
 * millis is safe — no local calendar getters are read off it.
 *
 * Fail-safe: with no config / no adoption date on file, or an unparsable
 * reference date, eligibility cannot be confirmed, so this returns `false`
 * (same as Classic's auxiliary input, which returns 0 when no config row
 * exists).
 *
 * @param {string|null|undefined} referenceDateRaw the document's date-only field
 *   used by that system (`invoiceDate` for TBAI/VERI*FACTU, `accountingDate` for SII)
 * @param {string|null|undefined} adoptionDateRaw the system's adoption date/timestamp
 *   for the organization (`tbaiRecord.tbaisystemdate`, `verifactuRecord.inVfactuSystem`,
 *   `siiRecord.fechaAcogidaSII`)
 * @returns {boolean}
 */
export function isSifEligibleByDate(referenceDateRaw, adoptionDateRaw) {
  if (!adoptionDateRaw) return false;

  const referenceDay = parseCalendarDate(referenceDateRaw);
  if (!referenceDay) return false;

  const adoptionInstant = new Date(adoptionDateRaw);
  if (Number.isNaN(adoptionInstant.getTime())) return false;

  return referenceDay.getTime() >= adoptionInstant.getTime();
}

/**
 * @deprecated Use {@link isSifEligibleByDate} directly — kept as a thin wrapper
 * so existing TBAI call sites (`sifSending.js`) do not need to change. New code
 * (SII / VERI*FACTU gates) should call `isSifEligibleByDate` directly.
 * @param {string|null|undefined} invoiceDateRaw the invoice's date-only field (e.g. `invoiceDate`)
 * @param {string|null|undefined} tbaiSystemDateRaw `tbaiRecord.tbaisystemdate` (a timestamp)
 * @returns {boolean}
 */
export function isTbaiEligibleByDate(invoiceDateRaw, tbaiSystemDateRaw) {
  return isSifEligibleByDate(invoiceDateRaw, tbaiSystemDateRaw);
}
