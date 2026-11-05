import { useAuthOptional } from '@etendosoftware/app-shell-core/auth';
import { useWindowAccess } from '@/auth/AuthContext.jsx';
import { ListProgressBar } from '@/components/contract-ui/ListProgressBar.jsx';
import { AccessDeniedMessage } from '@/components/access/ProcessAccessGuard.jsx';
import { useCapabilitiesSafe } from '@/hooks/useCapabilitiesSafe.js';
import { INVOICE_INBOX_CAPABILITY, isCapabilityVisible } from '@/lib/capabilityVisibility.js';
import InvoiceInboxPage from './InvoiceInboxPage.jsx';

/**
 * "Invoice Inbox" AD window — the page's access anchor. Same id as the sidebar entry
 * (`menu.json` → `accessWindowId`), the upload endpoint (`InvoiceInboxUploadEndpoint.WINDOW_ID`)
 * and the template-role grant (`TemplateRoleWindowAccess.INVOICE_INBOX_WINDOW_ID`) in
 * com.etendoerp.go. The window has no `AD_Menu`, which is why the menu item uses
 * `accessWindowId` and never `windowId` (ETP-5240).
 */
export const INVOICE_INBOX_WINDOW_ID = '81AC659E93504927B459E0CAE80CE923';

/**
 * ETP-6049 — route entry. The sidebar only hides the entry; a URL typed by hand lands here, so
 * the page checks both axes itself: the per-account rollout (`capabilities.invoiceInbox`,
 * evaluated by the backend in `SFWindowAccessMap`) and the role's window access. Either one
 * missing shows the same access-denied screen, which does not reveal whether the feature exists.
 * Both hooks run before any return, so hook order is stable.
 *
 * While the access maps are still loading (a reload or a deep link) both read as `{}`, which would
 * flash the access-denied screen; until `accessLoaded` is true a progress bar shows instead. Once
 * loaded it still fails closed. Without an `AuthProvider` (unit tests) or with an older core that
 * does not publish `accessLoaded`, the maps are taken as loaded (same rule as `useRoleMenu`).
 */
export default function InvoiceInboxRoute(props) {
  const capabilities = useCapabilitiesSafe();
  const tier = useWindowAccess(INVOICE_INBOX_WINDOW_ID);
  const accessLoaded = useAuthOptional()?.accessLoaded;
  if (accessLoaded === false) {
    return (
      <ListProgressBar
        testId="invoice-inbox-access-loading"
        data-testid="ListProgressBar__9a1bef" />
    );
  }
  if (!isCapabilityVisible(capabilities, INVOICE_INBOX_CAPABILITY) || tier === 'none') {
    return <AccessDeniedMessage data-testid="AccessDeniedMessage__9a1bef" />;
  }
  return <InvoiceInboxPage {...props} data-testid="InvoiceInboxPage__9a1bef" />;
}
