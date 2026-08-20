import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext.jsx';
import { useUI } from '@/i18n';
import { useFiscalConfig } from '@/windows/custom/fiscal-config/useFiscalConfig.js';
import { buildLineSelectorContext } from '@/lib/selectorContext.js';
import { buildUrlWithParams } from '@/lib/buildUrlWithParams.js';
import { selectSifFields } from './TaxSifField.jsx';
import TaxSifModal from './TaxSifModal.jsx';
import { jsonHeaders } from '@/lib/sessionHeaders.js';

// Column the invoice-lines "tax" field maps to (C_Tax_ID) — same column the generated
// LinesTable.jsx declares for both sales-invoice and purchase-invoice.
const TAX_SELECTOR_COLUMN = 'C_Tax_ID';
// Generous page size: covers the whole tax catalog visible to the client in ONE
// request for the common case (a few dozen active rates in practice), replacing
// what would otherwise be N per-distinct-tax fetches (one per row's tax,
// deduplicated) with a single call. NeoSelectorService.MAX_LIMIT (100) silently
// clamps whatever we ask for server-side, so orgs with a larger catalog (seen live:
// 179 taxes) get back a partial page with `hasMore: true` — loadTaxCatalog() below
// pages through the rest instead of trusting this to be the only request (ETP-4888
// bugfix: a tax outside the first page was silently treated as "nothing to fix").
const TAX_SELECTOR_PAGE_LIMIT = 200;
// Safety cap on pagination loop iterations, in case `hasMore` ever misbehaves (e.g.
// a future selector policy that always reports true). 20 pages at up to ~100 items
// each (the server's own MAX_LIMIT) covers ~2000 items — far beyond any real tax
// catalog — while still guaranteeing the loop terminates.
const TAX_SELECTOR_MAX_PAGES = 20;

/**
 * Pages through the tax selector endpoint until the server reports `hasMore: false`
 * (or a safety cap/failure ends it early), accumulating every page's items into one
 * array. Extracted out of `loadTaxCatalog()` (ETP-4888 Sonar S3776 fix) so the
 * pagination loop's own nesting/branching no longer counts against the effect's
 * complexity — behavior is unchanged, only the code's shape moved.
 *
 * See `TAX_SELECTOR_PAGE_LIMIT`'s comment above for why pagination is needed at all.
 * Stops as soon as the server reports `hasMore: false`, so the common (single-page)
 * case still does exactly ONE fetch. `offset` advances by the page's own item count
 * (not the requested limit) so it stays correct even though the server silently
 * clamps `limit`.
 *
 * @param {object} args
 * @param {string} args.apiBaseUrl the calling window's own NEO base
 * @param {object} args.selectorContext `buildLineSelectorContext()` output — required
 *   selector params (parentId, isSOTrx/IsSOTrx, priceList, DateInvoiced, etc.)
 * @param {string|null} args.currency optional `currency` param, merged in when present
 * @param {() => boolean} args.isCancelled polled right after each page's fetch
 *   resolves — teardown (unmount / deps changed) is NOT a failed page, so a `true`
 *   here bails the whole pagination WITHOUT committing anything (returns `null`),
 *   since nothing is waiting for the result any more.
 * @returns {Promise<Array|null>} the accumulated items, or `null` if cancelled
 *   mid-pagination. A failed/malformed page keeps whatever earlier pages already
 *   returned instead of discarding everything — degrading to a partial check rather
 *   than rendering no badges at all (ETP-4888 QA finding).
 */
async function fetchAllTaxPages({ apiBaseUrl, selectorContext, currency, isCancelled }) {
  const allItems = [];
  let offset = 0;
  let page = 0;
  for (;;) {
    const url = buildUrlWithParams(`${apiBaseUrl}/lines/selectors/${TAX_SELECTOR_COLUMN}`, {
      limit: TAX_SELECTOR_PAGE_LIMIT,
      offset,
      ...selectorContext,
      ...(currency ? { currency } : {}),
    });
    const taxResponse = await fetch(url, { headers: jsonHeaders(), credentials: 'include' });
    const data = taxResponse.ok ? await taxResponse.json() : null;
    // Teardown (unmount / deps changed) is NOT a failed page: bail without touching
    // state, since nothing is waiting for it any more.
    if (isCancelled()) return null;
    // A failed/malformed page, on the other hand, keeps whatever earlier pages already
    // returned and commits it, degrading to a partial check instead of discarding
    // everything. Returning here made a page-2 blip erase page 1 too, so NO badge
    // rendered at all — the exact silent "nothing to fix" shape this feature exists to
    // eliminate (ETP-4888 QA finding). Same contract as the MAX_PAGES branch below.
    if (!data?.items) {
      // eslint-disable-next-line no-console -- deliberate operator-facing warning,
      // not routine logging: signals the SIF completeness check is incomplete.
      console.warn(
        `[useTaxSifLineRowActions] Tax catalog pagination failed at page ${page + 1} ` +
          `(offset ${offset}) — some taxes may be missing from the SIF completeness check.`,
      );
      break;
    }
    allItems.push(...data.items);
    page += 1;
    if (!data.hasMore || data.items.length === 0) break;
    if (page >= TAX_SELECTOR_MAX_PAGES) {
      // eslint-disable-next-line no-console -- deliberate operator-facing warning,
      // not routine logging: signals the SIF completeness check is incomplete.
      console.warn(
        `[useTaxSifLineRowActions] Tax catalog pagination stopped after ${TAX_SELECTOR_MAX_PAGES} pages ` +
          `(hasMore was still true) — some taxes may be missing from the SIF completeness check.`,
      );
      break;
    }
    offset += data.items.length;
  }
  return allItems;
}

/**
 * Pure completeness check: does `taxRow` (a tax record — or selector item — carrying
 * the SIF-enriched columns) still need its TBAI/Verifactu key filled in?
 *
 * Reuses `selectSifFields()` unchanged — the SAME pure function `TaxSifField.jsx` uses
 * on the Tax window's own header form — so "which field(s) apply" is never duplicated.
 * A tax with zero applicable fields (SII / unconfigured / conflict) is never "missing"
 * anything at this level: SII's own equivalent lives on the invoice HEADER
 * (`aeatsiiCauseExemption`, `SifTab.jsx`) and is explicitly out of scope here.
 *
 * @param {object|null|undefined} taxRow enriched tax record/selector item
 * @param {object} ctx `{ profile, verifactuRecord, ui }` — same shape `selectSifFields` takes
 * @returns {boolean} true when at least one applicable field's value is blank
 */
export function isTaxSifMissing(taxRow, { profile, verifactuRecord, ui }) {
  if (!taxRow) return false;
  const fields = selectSifFields({ profile, verifactuRecord, data: taxRow, ui });
  if (fields.length === 0) return false;
  return fields.some((field) => {
    const value = taxRow[field.column];
    return value == null || value === '';
  });
}

/**
 * Row-action hook powering the invoice-lines "tax needs SIF configuration" shortcut
 * (ETP-4888 point 5). Gated by the caller via `enabled` — each window's own `index.jsx`
 * wires this only when `decisions.json`'s `window.lineTaxSifTrigger` flag is set (see
 * docs/ui-customization.md), so this hook itself carries no window-specific knowledge.
 *
 * Fetches the tax catalog ONCE via the tax selector — now enriched server-side with
 * `taxExempt`/`notTaxable` + the TBAI/Verifactu key columns by
 * `InvoiceLineTaxSifSelectorPolicy` (com.etendoerp.go) — instead of one fetch per
 * distinct tax on the grid, builds a per-tax-id completeness map, and exposes an
 * `InlineLinesPanel`-shaped `cellBadges.tax` renderer that only renders when the row's
 * own tax is missing its key. ETP-4888 design-polish round moved the trigger OUT of the
 * generic hover `rowActions` strip (grouped far right with Edit/Delete, neutral gray,
 * only visible on hover) and INTO this per-column badge slot instead: it now renders
 * inline right next to the tax value itself, in the shared warning-color token
 * (`text-status-warning-foreground` — see SifTab.jsx's `PILL_CLS.pending` for the same
 * token used elsewhere), and is not gated by hover/`isDocumentReadOnly` — the SIF
 * shortcut edits the TAX record, not the invoice, so it stays actionable even once the
 * invoice itself is completed. Also returns the modal JSX to render (portaled by the caller).
 *
 * The tax selector endpoint fails CLOSED — it returns an empty catalog (not the
 * full one) when called without the same context params `InlineSearchCombo` sends
 * when a user opens the tax field's own search combo in edit mode: `parentId`,
 * `isSOTrx`/`IsSOTrx`, `priceList`, `DateInvoiced`, `C_BPartner_Location_ID`,
 * `currency`. This hook fetches the invoice's own header record (`recordId` — the
 * hook needs no other AD knowledge) and reuses `buildLineSelectorContext` — the
 * SAME helper `DetailView.jsx` uses to build that exact context — to compute them,
 * instead of hand-rolling a second implementation (ETP-4888 bugfix).
 *
 * @param {object} args
 * @param {string} args.apiBaseUrl the CALLING window's own NEO base (e.g. `/sws/neo/sales-invoice`)
 * @param {boolean} [args.enabled=true] set false to disable entirely (returns `{ rowActions: [], modal: null }`)
 * @param {string|null} [args.recordId] the invoice's own header record id — needed to fetch
 *   the header record that supplies the selector's required context params. On a
 *   brand-new (unsaved) record there is nothing to enrich yet, so the catalog fetch
 *   is skipped cleanly until it exists.
 * @param {string|null} [args.windowCategory] window category (`'sales'` | `'purchases'`) —
 *   forwarded to `buildLineSelectorContext`, which derives `isSOTrx`/`IsSOTrx` from it
 *   the same way `DetailView.jsx` does. Sales windows resolve to `Y`, purchase windows to `N`.
 * @returns {{ cellBadges: object, modal: import('react').ReactNode }}
 */
export function useTaxSifLineRowActions({ apiBaseUrl, enabled = true, recordId = null, windowCategory = null }) {
  const ui = useUI();
  const { selectedOrg } = useAuth();
  const orgId = selectedOrg?.id ?? null;
  const { profile, verifactuRecord } = useFiscalConfig(orgId, apiBaseUrl);
  const [taxById, setTaxById] = useState({});
  const [modalTaxId, setModalTaxId] = useState(null);

  useEffect(() => {
    // Drop the previous record's catalog before (re)fetching: without this, navigating
    // from invoice A to invoice B keeps rendering badges computed from A's catalog until
    // B's fetch resolves (ETP-4888 QA finding). The functional form keeps the already-empty
    // case referentially stable so the common mount path does not schedule a spare render.
    setTaxById((prev) => (Object.keys(prev).length === 0 ? prev : {}));
    if (!enabled || !apiBaseUrl || !recordId) return undefined;
    let cancelled = false;

    async function loadTaxCatalog() {
      const headerResponse = await fetch(`${apiBaseUrl}/header/${recordId}`, {
        headers: jsonHeaders(),
        credentials: 'include',
      });
      const headerJson = headerResponse.ok ? await headerResponse.json() : null;
      // NEO envelopes single-record GETs as { response: { data: [ {...} ], status } } —
      // same unwrapping useFiscalConfig.js's fetchRecord() already does. Reading the
      // envelope itself (instead of .response.data[0]) silently produced an object with
      // none of the expected keys, so buildLineSelectorContext's headerRecord branch
      // never matched and only parentId/isSOTrx (which don't read headerRecord) made it
      // into the URL — this was the actual reason priceList/DateInvoiced/
      // C_BPartner_Location_ID/currency were still missing after the first ETP-4888 fix.
      const headerRecord = headerJson?.response?.data?.[0] ?? null;
      if (cancelled) return;

      const selectorContext = buildLineSelectorContext({ windowCategory, parentId: recordId, headerRecord });
      // Not part of buildLineSelectorContext (DetailView.jsx also merges it in
      // separately, alongside an org-session fallback this hook has no access to).
      const currency = headerRecord?.['currency$_identifier'] ?? null;

      // Pages through the full catalog instead of trusting a single request — see
      // TAX_SELECTOR_PAGE_LIMIT's comment above and fetchAllTaxPages()'s own doc.
      const allItems = await fetchAllTaxPages({
        apiBaseUrl,
        selectorContext,
        currency,
        isCancelled: () => cancelled,
      });
      if (cancelled || allItems === null) return;
      setTaxById(Object.fromEntries(allItems.map((item) => [item.id, item])));
    }

    loadTaxCatalog().catch(() => {});
    return () => { cancelled = true; };
  }, [apiBaseUrl, enabled, recordId, windowCategory]);

  // ETP-4888 design-polish round — renders the trigger inline next to the "tax"
  // column's own value (InlineLinesPanel's `cellBadges` slot) instead of the
  // generic hover `rowActions` strip. `stopPropagation` keeps the click from also
  // bubbling into the cell's own click-to-edit handler (InlineLinesPanel's
  // `renderLineCell` wraps this in the same per-cell div that toggles row-edit
  // mode on click).
  const cellBadges = useMemo(() => {
    if (!enabled) return {};
    return {
      tax: (row) => {
        if (!isTaxSifMissing(taxById[row?.tax], { profile, verifactuRecord, ui })) return null;
        return (
          <button
            type="button"
            aria-label={ui('taxSif.trigger.tooltip')}
            title={ui('taxSif.trigger.tooltip')}
            onClick={(e) => { e.stopPropagation(); setModalTaxId(row?.tax ?? null); }}
            className="shrink-0 rounded-full p-0.5 text-status-warning-foreground hover:bg-status-warning/20"
            data-testid="line-action-tax-sif"
          >
            <AlertTriangle className="h-4 w-4" data-testid="AlertTriangleIcon__taxSifBadge" />
          </button>
        );
      },
    };
  }, [enabled, taxById, profile, verifactuRecord, ui]);

  const modal = modalTaxId ? (
    <TaxSifModal
      taxId={modalTaxId}
      apiBaseUrl={apiBaseUrl}
      onClose={() => setModalTaxId(null)}
      onSaved={(updatedTax) => {
        setTaxById((prev) => ({
          ...prev,
          [updatedTax.id]: { ...prev[updatedTax.id], ...updatedTax },
        }));
        setModalTaxId(null);
      }}
      data-testid="TaxSifModal__useTaxSifLineRowActions" />
  ) : null;

  return { cellBadges, modal };
}
