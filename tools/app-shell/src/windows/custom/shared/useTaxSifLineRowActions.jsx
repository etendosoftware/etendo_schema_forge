import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext.jsx';
import { useUI } from '@/i18n';
import { useFiscalConfig } from '@/windows/custom/fiscal-config/useFiscalConfig.js';
import { buildLineSelectorContext } from '@/lib/selectorContext.js';
import { buildUrlWithParams } from '@/lib/buildUrlWithParams.js';
import { selectSifFields } from './TaxSifField.jsx';
import TaxSifModal from './TaxSifModal.jsx';

// Column the invoice-lines "tax" field maps to (C_Tax_ID) — same column the generated
// LinesTable.jsx declares for both sales-invoice and purchase-invoice.
const TAX_SELECTOR_COLUMN = 'C_Tax_ID';
// Generous page size: one request covers the whole tax catalog visible to the client
// (a few dozen active rates in practice), replacing what would otherwise be N
// per-distinct-tax fetches (one per row's tax, deduplicated) with exactly ONE call.
const TAX_SELECTOR_PAGE_LIMIT = 200;

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
 * `InlineLinesPanel`-shaped `rowActions` entry that only shows when the row's own tax
 * is missing its key. Also returns the modal JSX to render (portaled by the caller).
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
 * @param {string} args.token NEO bearer token
 * @param {boolean} [args.enabled=true] set false to disable entirely (returns `{ rowActions: [], modal: null }`)
 * @param {string|null} [args.recordId] the invoice's own header record id — needed to fetch
 *   the header record that supplies the selector's required context params. On a
 *   brand-new (unsaved) record there is nothing to enrich yet, so the catalog fetch
 *   is skipped cleanly until it exists.
 * @param {string|null} [args.windowCategory] window category (`'sales'` | `'purchases'`) —
 *   forwarded to `buildLineSelectorContext`, which derives `isSOTrx`/`IsSOTrx` from it
 *   the same way `DetailView.jsx` does. Sales windows resolve to `Y`, purchase windows to `N`.
 * @returns {{ rowActions: Array<object>, modal: import('react').ReactNode }}
 */
export function useTaxSifLineRowActions({ apiBaseUrl, token, enabled = true, recordId = null, windowCategory = null }) {
  const ui = useUI();
  const { selectedOrg } = useAuth();
  const orgId = selectedOrg?.id ?? null;
  const { profile, verifactuRecord } = useFiscalConfig(orgId, apiBaseUrl);
  const [taxById, setTaxById] = useState({});
  const [modalTaxId, setModalTaxId] = useState(null);

  useEffect(() => {
    if (!enabled || !apiBaseUrl || !token || !recordId) return undefined;
    let cancelled = false;

    async function loadTaxCatalog() {
      const headerResponse = await fetch(`${apiBaseUrl}/header/${recordId}`, {
        headers: { Authorization: `Bearer ${token}` },
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
      const url = buildUrlWithParams(`${apiBaseUrl}/lines/selectors/${TAX_SELECTOR_COLUMN}`, {
        limit: TAX_SELECTOR_PAGE_LIMIT,
        ...selectorContext,
        ...(currency ? { currency } : {}),
      });

      const taxResponse = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = taxResponse.ok ? await taxResponse.json() : null;
      if (cancelled || !data?.items) return;
      setTaxById(Object.fromEntries(data.items.map((item) => [item.id, item])));
    }

    loadTaxCatalog().catch(() => {});
    return () => { cancelled = true; };
  }, [apiBaseUrl, token, enabled, recordId, windowCategory]);

  const rowActions = useMemo(() => {
    if (!enabled) return [];
    return [{
      key: 'taxSifTrigger',
      icon: AlertTriangle,
      tooltip: ui('taxSif.trigger.tooltip'),
      show: (row) => isTaxSifMissing(taxById[row?.tax], { profile, verifactuRecord, ui }),
      onClick: (row) => setModalTaxId(row?.tax ?? null),
      testId: 'line-action-tax-sif',
    }];
  }, [enabled, taxById, profile, verifactuRecord, ui]);

  const modal = modalTaxId ? (
    <TaxSifModal
      taxId={modalTaxId}
      apiBaseUrl={apiBaseUrl}
      token={token}
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

  return { rowActions, modal };
}
