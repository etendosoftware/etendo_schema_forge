import { useMemo } from 'react';
import { getInvoiceFiscalTargets, isSifEligibleByDate, isVerifactuEligibleByDate } from './fiscalTargets.js';
import { isSent } from './sifSending.js';

// Maps em_etvfac_invoice_status DB codes to the StatusPill keys defined in FmPrimitives.jsx.
// Without this mapping, codes like 'IN' are misread as the SII 'IN' code ("Rechazado")
// instead of the Verifactu 'invalid' code ("Inválido") — ETP-4783.
// The Verifactu AD reference list is AC/AE/IN/ER/PE (com.etendoerp.verifactu) —
// there is no 'CO' code here; that one belongs to SII.
export const VF_STATUS_MAP = {
  AC: 'accepted',
  AE: 'partiallyAccepted',
  ER: 'rejected',
  IN: 'invalid',
  PE: 'vf_pending',
};

/**
 * Canonical raw-code -> StatusPill-key mapper for VERI*FACTU statuses.
 * Single source of truth: every Verifactu surface (invoice preview badge,
 * fiscal monitor table, CSV export) must go through this helper so a raw code
 * never reaches `StatusPill` and collides with a same-letter SII code.
 * Unknown codes fall through unchanged. `null`/`undefined` pass through
 * unchanged too (never coerced into a fabricated status) — see the
 * ETP-5229 note on `useFiscalStatus` below for why that matters.
 *
 * @param {string|null|undefined} raw raw `em_etvfac_invoice_status` code
 * @returns {string|null|undefined} StatusPill-compatible key
 */
export const mapVfStatus = (raw) => VF_STATUS_MAP[raw] ?? raw;

/**
 * Derives the SII / TBAI / Verifactu sending status for an invoice's preview badge,
 * reading directly off the invoice's OWN header record — exactly the same fields the
 * invoice list/grid columns already use (see `PurchaseInvoiceHeaderTable.jsx`, which reads
 * `row.aeatsiiEstado` / `row.tbaiSyncEstado` straight off the header GET response, no
 * secondary lookup at all).
 *
 * ETP-5229 — root cause of the disappearing badge: this hook used to resolve "a" fiscal
 * config row for the invoice's org (`fetchSiiParentId` etc., taking `data[0]` with no
 * preference for the active row) and then query a config-SCOPED monitor entity
 * (`sii-monitor`, `tbai-facturas-enviadas`, `monitor-verifactu`) for the invoice's status.
 * Those monitor entities are Classic AD_TAB children nested under ONE SPECIFIC config row
 * (`@aeatsii_config_id@` is a literal parent-scoping placeholder in the underlying HQL —
 * confirmed against `org.openbravo.module.sii`'s `AD_TAB.xml`), so resolving to any single
 * config — old, new, active, or otherwise — only ever surfaced invoices whose sync data
 * lines up with THAT config's own scope. Once an org's fiscal config changed (a new config
 * created, the old one deactivated), an invoice genuinely sent under the OLD config lost
 * its badge the moment the parent-config lookup resolved to a different row.
 *
 * The invoice's own status columns carry NO link to any config row in Classic's data
 * model — `em_aeatsii_estado` is a plain nullable string column directly on `c_invoice`,
 * `tbai_syncinvoice` FKs only to `c_invoice_id` (no `tbai_config` FK), and
 * `em_etvfac_invoice_status` is likewise a plain per-invoice column. Reading them directly
 * is therefore config-independent by construction, mirroring how Classic's own
 * field-visibility checks (`TBAI_ExistConfigAndIsAvailable`, `etvfac_has_conf_tax`, SII's
 * config-exists val rule) only ever gate on "does an ACTIVE config exist for this org" —
 * never a status lookup scoped to one particular config row.
 *
 * A field that is genuinely `null`/`undefined` (the invoice was never relevant to that
 * fiscal system) is passed through as `null` here — never coerced into a fabricated
 * "Pendiente"/`'PE'` value. `StatusPill`/`FiscalStatusBadge` already render `null` as a
 * dash; the caller must not override that by defaulting the returned value before handing
 * it to the badge (that was the second half of the ETP-5229 bug — see `InvoicePreview.jsx`).
 *
 * TBAI has no persisted "PE" code — a not-yet-synced invoice reports no status row at all
 * — so, when the invoice IS in scope for TBAI (`targets.showTbai`, gated by the caller's
 * eligibility checks), an absent `tbaiSyncEstado` genuinely means "not sent yet" and falls
 * back to `'Enviada'`/`'Pendiente'` via `isSent(tbaiIssent)`, exactly like the list column.
 *
 * No network call is needed: the invoice header GET response already carries
 * `aeatsiiEstado`, `tbaiSyncEstado` (injected server-side by `TbaiSyncStatusInjector`) and
 * `etvfacInvoiceStatus` for both sales and purchase invoices.
 *
 * ETP-5229 follow-up (live-tested correction): the VALUE above stays config-independent
 * — reading the invoice's own persisted field never needs config resolution. But the
 * badge's ELIGIBILITY (whether to show that value at all, vs. a plain dash) does need one
 * date check: whether the invoice's date predates the system's existence FOR THIS ORG
 * entirely. Two rounds of earlier fixes today removed all date-gating, which produced a
 * new bug: an org enrolled in SII for the first time on 10/09 showed a real (if stale)
 * `em_aeatsii_estado` value for an invoice dated 09/09 — one day BEFORE SII ever existed
 * for that org. The gate must compare against the EARLIEST cutover date across ALL of the
 * org's config rows for that system ever created (active or deactivated) — never the
 * CURRENTLY active config's own cutover date, which would incorrectly hide a real
 * historical status for an invoice sent under an older, since-superseded config (see
 * `useFiscalConfig.js`'s `earliestCutoverDate`). `cutoverDates` is optional and defaults to
 * "no date on file" (fail-safe: not eligible) so existing callers that have not been
 * updated yet still degrade to dashes rather than throwing.
 *
 * @param {object|null|undefined} invoice the invoice's own header record (e.g. `p.displayInvoice`)
 * @param {string} specName 'sales-invoice' | 'purchase-invoice'
 * @param {string} profile fiscal profile ('sii' | 'tbai' | 'sii+tbai' | 'verifactu' | ...)
 * @param {string|null} [territory] TBAI territory gate (Batuz/Bizkaia only for purchases)
 * @param {{sii?: string|null, tbai?: string|null, verifactu?: string|null}} [cutoverDates]
 *   `useFiscalConfig`'s `earliestSiiCutoverDate` / `earliestTbaiCutoverDate` /
 *   `earliestVerifactuCutoverDate` for the invoice's org.
 */
export function useFiscalStatus(invoice, specName, profile, territory = null, cutoverDates = {}) {
  const { sii: siiCutover = null, tbai: tbaiCutover = null, verifactu: verifactuCutover = null } = cutoverDates;

  return useMemo(() => {
    if (!invoice) {
      return { sii: null, tbai: null, verifactu: null, loading: true };
    }

    const targets = getInvoiceFiscalTargets(specName, profile, territory);

    // SII books by accounting date, not invoice date (mirrors isSifEligibleByDate's
    // doc). TBAI/VERI*FACTU use invoiceDate/created respectively — see fiscalTargets.js.
    const siiEligible = targets.showSii && isSifEligibleByDate(invoice.accountingDate, siiCutover);
    const tbaiEligible = targets.showTbai && isSifEligibleByDate(invoice.invoiceDate, tbaiCutover);
    const verifactuEligible = targets.showVerifactu && isVerifactuEligibleByDate(invoice.created, verifactuCutover);

    const sii = siiEligible ? (invoice.aeatsiiEstado ?? null) : null;
    const tbai = tbaiEligible
      ? (invoice.tbaiSyncEstado ?? (isSent(invoice.tbaiIssent) ? 'Enviada' : null))
      : null;
    const verifactu = verifactuEligible ? mapVfStatus(invoice.etvfacInvoiceStatus ?? null) : null;

    return { sii, tbai, verifactu, loading: false };
  }, [invoice, specName, profile, territory, siiCutover, tbaiCutover, verifactuCutover]);
}
