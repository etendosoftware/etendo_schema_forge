/**
 * ETP-4708 — shim-surface guard for every module promoted to
 * `@etendosoftware/app-shell-core`.
 *
 * Each promoted module left a re-export shim behind at its original `@/…` path so
 * consumers did not have to change. The failure mode this guards is silent: a shim
 * written as only `export * from '…'` drops the module's `default` export, because
 * `export *` does not forward a default. Consumers importing the default then get
 * `undefined` at runtime with no import error and no test failure anywhere — the
 * core-side unit tests cannot catch it, since they import each module directly
 * rather than through the shim.
 *
 * So: for every promoted module, import BOTH the functional shim and the core
 * module, and assert their export surfaces are identical. Comparing against core
 * rather than a hardcoded list keeps this self-maintaining — a new export added in
 * core needs no edit here, while a shim that fails to forward one fails the test.
 *
 * Requires the local-core profile, since these subpaths only exist in the published
 * package after the preview is cut:
 *   LOCAL_CORE=1 SCHEMA_FORGE_CORE=<core-checkout> npx vitest run src/__tests__/coreShimSurface.vitest.js
 */
import { describe, it, expect } from 'vitest';

// [name, shim loader (@/… — the path consumers use), core loader (the package subpath)]
const PROMOTED_MODULES = [
  ['lib/formatAmount.js',
    () => import('@/lib/formatAmount.js'),
    () => import('@etendosoftware/app-shell-core/lib/formatAmount.js')],
  ['lib/balanceTotals.js',
    () => import('@/lib/balanceTotals.js'),
    () => import('@etendosoftware/app-shell-core/lib/balanceTotals.js')],
  ['lib/documentTotals.js',
    () => import('@/lib/documentTotals.js'),
    () => import('@etendosoftware/app-shell-core/lib/documentTotals.js')],
  ['lib/resolveIdentifier.js',
    () => import('@/lib/resolveIdentifier.js'),
    () => import('@etendosoftware/app-shell-core/lib/resolveIdentifier.js')],
  ['lib/capabilityVisibility.js',
    () => import('@/lib/capabilityVisibility.js'),
    () => import('@etendosoftware/app-shell-core/lib/capabilityVisibility.js')],
  ['lib/lineFieldChange.js',
    () => import('@/lib/lineFieldChange.js'),
    () => import('@etendosoftware/app-shell-core/lib/lineFieldChange.js')],
  ['lib/selectorContext.js',
    () => import('@/lib/selectorContext.js'),
    () => import('@etendosoftware/app-shell-core/lib/selectorContext.js')],
  ['lib/selectorCatalog.js',
    () => import('@/lib/selectorCatalog.js'),
    () => import('@etendosoftware/app-shell-core/lib/selectorCatalog.js')],
  ['lib/backendErrors.js',
    () => import('@/lib/backendErrors.js'),
    () => import('@etendosoftware/app-shell-core/lib/backendErrors.js')],
  ['lib/numericValidation.js',
    () => import('@/lib/numericValidation.js'),
    () => import('@etendosoftware/app-shell-core/lib/numericValidation.js')],
  ['lib/useAnimatedOpen.js',
    () => import('@/lib/useAnimatedOpen.js'),
    () => import('@etendosoftware/app-shell-core/lib/useAnimatedOpen.js')],
  ['lib/surveys/survey-state.js',
    () => import('@/lib/surveys/survey-state.js'),
    () => import('@etendosoftware/app-shell-core/lib/surveys/survey-state.js')],
  ['hooks/useLineGrossAmount.js',
    () => import('@/hooks/useLineGrossAmount.js'),
    () => import('@etendosoftware/app-shell-core/hooks/useLineGrossAmount.js')],
  ['hooks/useCallout.js',
    () => import('@/hooks/useCallout.js'),
    () => import('@etendosoftware/app-shell-core/hooks/useCallout.js')],
  ['hooks/useDisplayLogic.js',
    () => import('@/hooks/useDisplayLogic.js'),
    () => import('@etendosoftware/app-shell-core/hooks/useDisplayLogic.js')],
  ['hooks/useNeoAction.js',
    () => import('@/hooks/useNeoAction.js'),
    () => import('@etendosoftware/app-shell-core/hooks/useNeoAction.js')],
  ['hooks/useCapabilitiesSafe.js',
    () => import('@/hooks/useCapabilitiesSafe.js'),
    () => import('@etendosoftware/app-shell-core/hooks/useCapabilitiesSafe.js')],
  ['hooks/useCatalogs.js',
    () => import('@/hooks/useCatalogs.js'),
    () => import('@etendosoftware/app-shell-core/hooks/useCatalogs.js')],
  ['hooks/useBulkActionToast.js',
    () => import('@/hooks/useBulkActionToast.js'),
    () => import('@etendosoftware/app-shell-core/hooks/useBulkActionToast.js')],
  ['components/contract-ui/ProcessParamDialog.jsx',
    () => import('@/components/contract-ui/ProcessParamDialog.jsx'),
    () => import('@etendosoftware/app-shell-core/components/contract-ui/ProcessParamDialog.jsx')],
  ['components/contract-ui/LinesSelectionBar.jsx',
    () => import('@/components/contract-ui/LinesSelectionBar.jsx'),
    () => import('@etendosoftware/app-shell-core/components/contract-ui/LinesSelectionBar.jsx')],
  ['components/contract-ui/evalTabReadOnly.js',
    () => import('@/components/contract-ui/evalTabReadOnly.js'),
    () => import('@etendosoftware/app-shell-core/components/contract-ui/evalTabReadOnly.js')],
  ['components/contract-ui/recipientEdits.js',
    () => import('@/components/contract-ui/recipientEdits.js'),
    () => import('@etendosoftware/app-shell-core/components/contract-ui/recipientEdits.js')],
  ['components/contract-ui/modal-styles.js',
    () => import('@/components/contract-ui/modal-styles.js'),
    () => import('@etendosoftware/app-shell-core/components/contract-ui/modal-styles.js')],
  ['components/CurrentWindowContext.jsx',
    () => import('@/components/CurrentWindowContext.jsx'),
    () => import('@etendosoftware/app-shell-core/components/CurrentWindowContext.jsx')],
  ['components/layout/FavoritesContext.jsx',
    () => import('@/components/layout/FavoritesContext.jsx'),
    () => import('@etendosoftware/app-shell-core/components/layout/FavoritesContext.jsx')],
  ['components/layout/PageMetaContext.jsx',
    () => import('@/components/layout/PageMetaContext.jsx'),
    () => import('@etendosoftware/app-shell-core/components/layout/PageMetaContext.jsx')],
  ['components/attachments/AttachmentIcon.jsx',
    () => import('@/components/attachments/AttachmentIcon.jsx'),
    () => import('@etendosoftware/app-shell-core/components/attachments/AttachmentIcon.jsx')],
  ['components/dashboard/DashboardDateRangeContext.jsx',
    () => import('@/components/dashboard/DashboardDateRangeContext.jsx'),
    () => import('@etendosoftware/app-shell-core/components/dashboard/DashboardDateRangeContext.jsx')],
  ['components/copilot/copilotApi.js',
    () => import('@/components/copilot/copilotApi.js'),
    () => import('@etendosoftware/app-shell-core/components/copilot/copilotApi.js')],
  ['components/copilot/ocr/ProductResolverPopup.jsx',
    () => import('@/components/copilot/ocr/ProductResolverPopup.jsx'),
    () => import('@etendosoftware/app-shell-core/components/copilot/ocr/ProductResolverPopup.jsx')],
  ['components/copilot/ocr/contactApi.js',
    () => import('@/components/copilot/ocr/contactApi.js'),
    () => import('@etendosoftware/app-shell-core/components/copilot/ocr/contactApi.js')],
  ['components/copilot/ocr/attachFile.js',
    () => import('@/components/copilot/ocr/attachFile.js'),
    () => import('@etendosoftware/app-shell-core/components/copilot/ocr/attachFile.js')],
  ['components/copilot/ocr/ingest/useBatch.js',
    () => import('@/components/copilot/ocr/ingest/useBatch.js'),
    () => import('@etendosoftware/app-shell-core/components/copilot/ocr/ingest/useBatch.js')],
  ['utils/recordActions.js',
    () => import('@/utils/recordActions.js'),
    () => import('@etendosoftware/app-shell-core/utils/recordActions.js')],
];

describe('promoted-module shims re-export the full core surface', () => {
  it('covers every module promoted by ETP-4708', () => {
    expect(PROMOTED_MODULES).toHaveLength(35);
  });

  it.each(PROMOTED_MODULES)('%s', async (name, loadShim, loadCore) => {
    const [shim, core] = await Promise.all([loadShim(), loadCore()]);
    const coreKeys = Object.keys(core).sort();
    const shimKeys = Object.keys(shim).sort();

    // The shim must expose exactly what core exposes — no missing names, no extras.
    expect(shimKeys, `${name}: shim surface diverges from core`).toEqual(coreKeys);

    // Spelled out separately: this is the `export *` trap, and an assertion naming
    // `default` explicitly is what makes a failure here self-explaining.
    if ('default' in core) {
      expect(shim, `${name}: core has a default export but the shim does not forward it — ` +
        `\`export *\` does not re-export a default; add \`export { default } from '…'\``)
        .toHaveProperty('default');
      expect(shim.default).toBe(core.default);
    }
  });
});
