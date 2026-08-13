import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext.jsx';
import { useUI } from '@/i18n';
import { useFiscalConfig } from '@/windows/custom/fiscal-config/useFiscalConfig.js';
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
 * @param {object} args
 * @param {string} args.apiBaseUrl the CALLING window's own NEO base (e.g. `/sws/neo/sales-invoice`)
 * @param {string} args.token NEO bearer token
 * @param {boolean} [args.enabled=true] set false to disable entirely (returns `{ rowActions: [], modal: null }`)
 * @returns {{ rowActions: Array<object>, modal: import('react').ReactNode }}
 */
export function useTaxSifLineRowActions({ apiBaseUrl, token, enabled = true }) {
  const ui = useUI();
  const { selectedOrg } = useAuth();
  const orgId = selectedOrg?.id ?? null;
  const { profile, verifactuRecord } = useFiscalConfig(orgId, apiBaseUrl);
  const [taxById, setTaxById] = useState({});
  const [modalTaxId, setModalTaxId] = useState(null);

  useEffect(() => {
    if (!enabled || !apiBaseUrl || !token) return undefined;
    let cancelled = false;
    fetch(`${apiBaseUrl}/lines/selectors/${TAX_SELECTOR_COLUMN}?limit=${TAX_SELECTOR_PAGE_LIMIT}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data?.items) return;
        setTaxById(Object.fromEntries(data.items.map((item) => [item.id, item])));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [apiBaseUrl, token, enabled]);

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
