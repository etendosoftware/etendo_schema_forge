import { useAuthOptional } from '@etendosoftware/app-shell-core/auth';
import { useWindowAccess } from '@/auth/AuthContext.jsx';
import { ListProgressBar } from '@/components/contract-ui/ListProgressBar.jsx';
import { AccessDeniedMessage } from '@/components/access/ProcessAccessGuard.jsx';
import { useCapabilitiesSafe } from '@/hooks/useCapabilitiesSafe.js';
import { SEPA_REMITTANCES_CAPABILITY, isCapabilityVisible } from '@/lib/capabilityVisibility.js';
import RemittanceApp from '@generated/remittance/generated/web/remittance/index.jsx';

/**
 * Classic "Remittance" AD window (module org.openbravo.module.remittance): the page's access
 * anchor. It is the same id as the sidebar entry (`menu.json` → `accessWindowId`), the generated
 * page's own `useWindowAccess` check, and the Financiero template-role grant
 * (`TemplateRoleWindowAccess`) in com.etendoerp.go.
 */
export const REMITTANCE_WINDOW_ID = 'FF8080812E71F7C7012E71FD0499001B';

/**
 * ETP-6148 — route entry of the Remittance window (Finanzas › Remesas). The generated page
 * already turns away a role without window access, but it knows nothing about the per-account
 * rollout. The sidebar only hides the entry, so a URL typed by hand lands here, and this guard
 * checks both axes before mounting the generated window: the `sepaRemittances` capability (the
 * `sepa-remittances` flag, evaluated by the backend in `SFWindowAccessMap`) and the role's window
 * access. Either one missing shows the same access-denied screen, which does not reveal whether
 * the feature exists. With the flag off the remittance handlers answer 403 anyway; this guard
 * keeps the user from reaching a page of failing requests.
 *
 * Same shape as the invoice-inbox route guard. Both hooks run before any return, so hook order is
 * stable. While the access maps are still loading (a reload or a deep link) they read as `{}`,
 * which would flash the access-denied screen, so until `accessLoaded` is true a progress bar
 * shows instead. Once loaded it still fails closed. Without an `AuthProvider` (unit tests), or
 * with an older core that does not publish `accessLoaded`, the maps are taken as loaded.
 */
export default function RemittanceRoute(props) {
  const capabilities = useCapabilitiesSafe();
  const tier = useWindowAccess(REMITTANCE_WINDOW_ID);
  const accessLoaded = useAuthOptional()?.accessLoaded;
  if (accessLoaded === false) {
    return (
      <ListProgressBar
        testId="remittance-access-loading"
        data-testid="ListProgressBar__6148a1" />
    );
  }
  if (!isCapabilityVisible(capabilities, SEPA_REMITTANCES_CAPABILITY) || tier === 'none') {
    return <AccessDeniedMessage data-testid="AccessDeniedMessage__6148a1" />;
  }
  return <RemittanceApp {...props} data-testid="RemittanceApp__6148a1" />;
}
