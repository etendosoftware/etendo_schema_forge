import { registerFkResolver } from '@etendosoftware/app-shell-core/lib/import/fkResolvers.js';
import { simSearchEveryLanguage } from '@etendosoftware/app-shell-core/lib/simSearch.js';
import { classifyCandidates } from '@etendosoftware/app-shell-core/lib/import/resolveForeignKeys.js';
import { normalizeText } from '@etendosoftware/app-shell-core/lib/import/resolveDependentEntity.js';

/**
 * Unit of Measure lookup for the Products CSV import.
 *
 * `M_Product.C_UOM_ID` is mandatory with no AD default, so before ETP-4995 every imported
 * product silently took the org's default UoM: `uOM` was declared neither in
 * PRODUCT_TARGETS nor in `window.import.fields`, which left the descriptor's
 * `if (!productBody.uOM && productDefaults.uOM)` guard permanently true.
 *
 * The import field also declares `matchEntity: 'UOM'`, which drives the PREVIEW validation
 * (`resolveForeignKeys` batches one simSearch per column). That path never rewrites the
 * row, though — `ImportDialog` hands `buildOperations` the raw row — so the descriptor
 * resolves the value again here at send time, exactly like Contacts does for `country`.
 *
 * 'UOM' is the DAL entity name for C_UOM (verified against AD_Table.classname).
 */
// ETP-5350 — `simSearchEveryLanguage`, not `simSearch`: C_UOM carries its English name on
// the base row and only an es_ES translation, so "Unidad" resolved for a Spanish session
// and was refused for an English one, for the same file.
registerFkResolver('product-uom', async (value, { token, simSearchFn = simSearchEveryLanguage }) => {
  // `scoreMode: 'text'`: the same whole-string score the preview uses for this field (`matchMode: 'strict'`).
  const [result] = await simSearchFn({ token, entityName: 'UOM', items: [value], qtyResults: 5, scoreMode: 'text' });
  return classifyCandidates(result?.candidates ?? []);
// ETP-5676: `target` lets the registered wrapper answer from the preview's `uOM` resolutions.
}, { target: 'uOM' });

/**
 * Tax category (`C_TaxCategory`) lookup for the Products import (ETP-5730).
 *
 * Stricter than the UOM resolver on purpose. A tenant's tax categories come in families whose
 * names differ by a word — "Exento" / "Exento Servicios", "IGIC General" / "IGIC General
 * Servicios" — so a similarity match that "clears the threshold" can land on the wrong member of
 * the family, and a wrong tax is only discovered when the product is used in a document. This
 * resolver therefore accepts a candidate only when its NAME equals the cell (case-, accent- and
 * whitespace-insensitive) and exactly one candidate does. Everything else is `needs-review`, which
 * the descriptor turns into an error naming the cell; nothing is ever picked by rank.
 *
 * The field also declares `matchEntity` so the preview can offer the candidates; whatever the user
 * picks there reaches this resolver through `fkResolutions` (see `registerFkResolver`'s wrapper).
 *
 * 'FinancialMgmtTaxCategory' is the DAL entity name for C_TaxCategory (AD_Table.classname).
 */
registerFkResolver('product-tax-category', async (value, { token, simSearchFn = simSearchEveryLanguage }) => {
  const [result] = await simSearchFn({ token, entityName: 'FinancialMgmtTaxCategory', items: [value], qtyResults: 10 });
  const candidates = result?.candidates ?? [];
  const wanted = normalizeText(value);
  const exact = candidates.filter((candidate) => normalizeText(candidate.name) === wanted);
  if (exact.length === 1) return { status: 'auto-resolved', id: exact[0].id, name: exact[0].name };
  return { status: 'needs-review', candidates };
}, { target: 'taxCategory' });
