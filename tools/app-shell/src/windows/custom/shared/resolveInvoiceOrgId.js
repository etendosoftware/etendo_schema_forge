/**
 * resolveInvoiceOrgId — the org used to fetch fiscal config (SII/TBAI/Verifactu)
 * for an invoice being viewed/edited MUST be the invoice's OWN organization
 * (`adOrgId`, the header field mapped to `AD_Org_ID`), never the top-nav org
 * selector. The selector reflects which org's records the user is currently
 * BROWSING; it can point anywhere while an invoice from a different org is
 * open in a preview/detail view, and blindly using it would fetch the wrong
 * fiscal config (or none) — silently disabling the TBAI territory gate
 * (ETP-5087) since it never sees the invoice's real territory.
 *
 * `adOrgId` is exposed as a `readOnly`, `form: false` header field on both
 * `sales-invoice` and `purchase-invoice` (see `docs/decisions-reference.md`
 * §"Field-level options" — `name`/`visibility`/`form` overrides) precisely so
 * every SIF consumer can read the invoice's real org straight off `data`.
 *
 * Falls back to `selectedOrg` only when the invoice record doesn't carry the
 * field yet — e.g. a legacy/unrefreshed cached record, or a window that has
 * not exposed `adOrgId` in its contract. This keeps existing behavior for
 * that edge case instead of resolving to `null` and disabling SIF entirely.
 *
 * @param {object|null|undefined} data invoice header record (the record whose
 *   fiscal config we need — NOT necessarily the record used for anything else).
 * @param {string|null|undefined} selectedOrgId fallback — usually
 *   `useAuth().selectedOrg?.id`.
 * @returns {string|null}
 */
export function resolveInvoiceOrgId(data, selectedOrgId) {
  return data?.adOrgId ?? selectedOrgId ?? null;
}
