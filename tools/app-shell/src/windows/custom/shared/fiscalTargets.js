// Relative import (not the `@/lib/...` alias): this module is exercised by
// `fiscalTargets.test.js` via plain `node --test` (see Makefile), which has no
// alias resolution — only Vitest-run specs can use the `@` alias.
import { parseCalendarDate, parseWallClockInstant } from '../../../lib/dateOnly.js';

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
 * adoption" rule applies to TBAI and SII, each compared against the date-only
 * business field Classic itself uses for that system (ETP-5122 follow-up):
 *   - **TBAI**: invoice date (`invoiceDate`) vs. `tbaiRecord.tbaisystemdate`.
 *     Mirrors Classic's `TBAI_ExistConfigAndIsAvailable` auxiliary input
 *     (`TO_TIMESTAMP(@DateInvoiced@, 'DD-MM-YYYY') >= conf.tbaisystemdate`) and
 *     the server-side backstop `SynchronizeUtils.validateConfigAndInvoiceDates`.
 *   - **SII**: accounting date (`accountingDate`, NOT invoice date) vs.
 *     `siiRecord.fechaAcogidaSII`. Classic's `AEATSII_PreSII_Invoice` auxiliary
 *     input compares `DateAcct`, not `DateInvoiced` — SII books by accounting
 *     date, so this is a deliberate asymmetry, not an oversight.
 *
 * **VERI*FACTU does NOT use this function** — see {@link isVerifactuEligibleByDate}.
 * Classic's `InvoiceSendingListener.invoiceMadeWithConfigPresent()` compares the
 * invoice's record-creation timestamp (`getCreationDate()`), not `invoiceDate`,
 * and neither side of that comparison is a date-only value to truncate
 * (ETP-5122 follow-up correction — VERI*FACTU was originally, incorrectly,
 * wired through this same date-only gate on `invoiceDate`).
 *
 * Both operands are read in the **same local frame**, which is what makes the
 * result timezone-independent:
 *   - `referenceDateRaw` is a date-only AD field, so `parseCalendarDate` gives it
 *     local midnight.
 *   - `adoptionDateRaw` is a wall-clock timestamp, so `parseWallClockInstant`
 *     reads its `HH:mm:ss` literally and IGNORES any `Z`/offset on it.
 *
 * This is still NOT a same-calendar-day comparison: an adoption timestamp
 * carrying a real time-of-day excludes a document dated that same day, exactly
 * like Classic's `TO_TIMESTAMP(@DateInvoiced@, 'DD-MM-YYYY') >= conf.tbaisystemdate`
 * and exactly like the server-side `ETGO_GET_TBAI_STATUS`. Keeping that parity
 * matters: the stored computed column drives the list badge while this function
 * drives the send action, and the two must not disagree about the same invoice.
 *
 * **ETP-5046** — the adoption side used to be parsed with `new Date(...)`, which
 * resolves a `Z` to a real UTC instant while the reference side was already local
 * midnight. Two different reference frames, so the inclusive boundary flipped with
 * the viewer's timezone: `referenceDateRaw='2026-01-01'` against
 * `adoptionDateRaw='2026-01-01T00:00:00.000Z'` returned `true` in UTC and `false`
 * in Europe/Madrid — hiding the send action from precisely the users these Spanish
 * fiscal regimes exist for, while CI (UTC) stayed green. Reading the adoption wall
 * clock literally fixes the timezone dependency without collapsing the
 * time-of-day, so neither the boundary nor Classic parity is sacrificed. Same
 * class of bug as ETP-4031 and ETP-4850 — see the date-only rule in CLAUDE.md.
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

  // `parseWallClockInstant`, never `new Date(...)`: the adoption timestamp's `Z` is
  // not a truthful UTC marker, and honouring it would put this operand in a different
  // reference frame from `referenceDay` above, flipping the inclusive boundary with
  // the host timezone — see the ETP-5046 note above. The time-of-day IS kept.
  const adoptionInstant = parseWallClockInstant(adoptionDateRaw);
  if (!adoptionInstant) return false;

  return referenceDay.getTime() >= adoptionInstant.getTime();
}

/**
 * VERI*FACTU-specific eligibility gate.
 *
 * Unlike TBAI (`invoiceDate`) and SII (`accountingDate`), Classic's VERI*FACTU
 * gate does NOT compare a business date at all. `InvoiceSendingListener
 * .invoiceMadeWithConfigPresent()` (module `com.etendoerp.verifactu`) reads
 * `i.getCreationDate()` — the record's real creation timestamp — not
 * `i.getInvoiceDate()`:
 *
 * ```java
 * Date invoiceCreationDate = i.getCreationDate();
 * return invoiceCreationDate.equals(configVFactuSystem)
 *     || invoiceCreationDate.after(configVFactuSystem);
 * ```
 *
 * Both sides of this comparison are genuine timestamps (the invoice's `Created`
 * audit column and the config's adoption timestamp), so — unlike
 * {@link isSifEligibleByDate}, which truncates the reference side to a local
 * calendar day because TBAI/SII compare against date-only business fields —
 * neither side is truncated here. `createdRaw` and `adoptionDateRaw` must be
 * parsed as full instants via `new Date(...)`, never `parseCalendarDate` (which
 * would collapse them to local midnight) and never `parseWallClockInstant`
 * (whose whole point is to discard a zone designator — here the `Z` is truthful
 * and must be honoured). Comparing two epoch-milli instants is already
 * timezone-independent, so the ETP-5046 mismatch cannot occur here.
 *
 * @param {string|null|undefined} createdRaw the invoice's `created` field
 *   (column `Created` — record creation timestamp, NOT `invoiceDate`)
 * @param {string|null|undefined} adoptionDateRaw `verifactuRecord.inVfactuSystem`
 * @returns {boolean}
 */
export function isVerifactuEligibleByDate(createdRaw, adoptionDateRaw) {
  if (!adoptionDateRaw) return false;

  const createdInstant = new Date(createdRaw);
  if (Number.isNaN(createdInstant.getTime())) return false;

  const adoptionInstant = new Date(adoptionDateRaw);
  if (Number.isNaN(adoptionInstant.getTime())) return false;

  return createdInstant.getTime() >= adoptionInstant.getTime();
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

/**
 * The value `ETGO_GET_TBAI_STATUS` stores for an invoice its organization can
 * never submit: one dated before the organization joined TicketBAI/Batuz, or
 * belonging to an organization with no active TBAI config at all.
 *
 * The adoption-date gate used to live in the React cell as
 * {@link isSifEligibleByDate} (ETP-5122). It moved into the stored computed
 * column (ETP-5216 follow-up) because a decision taken in the cell is invisible
 * to the backend: the column filters and sorts on `em_etgo_tbai_status`, so
 * filtering by "Pendiente" returned rows the grid then drew as a dash. The cell
 * also compared every row against the SELECTED organization's adoption date
 * rather than the invoice's own, which is wrong for any list spanning
 * organizations.
 *
 * `isSifEligibleByDate` remains in use for SII and VERI*FACTU, whose columns are
 * NOT stored computed columns and therefore still decide this in the browser.
 */
export const TBAI_STATUS_NOT_APPLICABLE = 'NoAplica';

/**
 * Whether a stored TBAI status means "does not apply" and should render as a
 * dash rather than a status badge.
 *
 * @param {string|null|undefined} status the raw `eTGOTbaiStatus` value
 * @returns {boolean}
 */
export function isTbaiStatusNotApplicable(status) {
  return status === TBAI_STATUS_NOT_APPLICABLE;
}
