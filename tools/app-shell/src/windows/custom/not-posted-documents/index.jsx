import ProcessAccessGuard from '@/components/access/ProcessAccessGuard.jsx';
import NotPostedDocumentsPage from './NotPostedDocumentsPage';

/**
 * "Not Posted Documents" OBUIAPP process — the page's only access anchor (it has no
 * `AD_Window`). Same id the sidebar entry (`menu.json` → `obuiappProcessId`) and the backend
 * (`NotPostedDocumentsHandler.NOT_POSTED_DOCUMENTS_PROCESS_ID`) check.
 */
export const NOT_POSTED_DOCUMENTS_PROCESS_ID = 'D6AB95CE52D34E1599590526115E26C6';

/**
 * ETP-5485 (BUG-2) — route entry: a role without the process sees the access-denied screen
 * instead of the page, matching the sidebar, which already hides the entry for that role.
 */
export default function NotPostedDocumentsRoute(props) {
  return (
    <ProcessAccessGuard processId={NOT_POSTED_DOCUMENTS_PROCESS_ID}>
      <NotPostedDocumentsPage {...props} />
    </ProcessAccessGuard>
  );
}
