import { useWindowAccess, WindowAccessGuard } from '@/auth/AuthContext.jsx';
import FiscalModelsPage from './FiscalModelsPage';

/**
 * "Modelos Fiscales" access is represented by the role's grant on the Tax Report window
 * (`AD_Window_ID`, proxied per ETP-5116 — only the Finanzas template grants it). Same id
 * `NeoAttachmentAuthorizer.TAX_REPORT_WINDOW_ID` / `RoleAccessMatrix.TAX_MODELS_PROXY_WINDOW_ID`
 * check in `com.etendoerp.go`.
 */
export const FISCAL_MODELS_WINDOW_ID = '3E8FEA1EA7404D979306C9EE7FD2E7E8';

/**
 * ETP-5546 — route entry: a role without the window grant sees the access-denied screen
 * instead of the page. Before this fix, `index.jsx` was a bare re-export with no guard at
 * all, so navigating directly to `/fiscal-models` rendered the full page regardless of role
 * (the sidebar already hid the entry, but the route itself enforced nothing).
 */
export default function FiscalModelsRoute(props) {
  const windowAccessTier = useWindowAccess(FISCAL_MODELS_WINDOW_ID);
  if (windowAccessTier === 'none') {
    return <WindowAccessGuard windowId={FISCAL_MODELS_WINDOW_ID} data-testid="WindowAccessGuard__fiscalmodels" />;
  }
  return <FiscalModelsPage {...props} data-testid="FiscalModelsPage__fiscalmodels" />;
}
