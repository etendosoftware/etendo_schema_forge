import { registerFkResolver } from '@etendosoftware/app-shell-core/lib/import/fkResolvers.js';
import { simSearch } from '@etendosoftware/app-shell-core/lib/simSearch.js';
import { classifyCandidates } from '@etendosoftware/app-shell-core/lib/import/resolveForeignKeys.js';

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
registerFkResolver('product-uom', async (value, { token, simSearchFn = simSearch }) => {
  const [result] = await simSearchFn({ token, entityName: 'UOM', items: [value], qtyResults: 5 });
  return classifyCandidates(result?.candidates ?? []);
});
