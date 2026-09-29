import { useUI } from '@/i18n';
import { useRoleMenu } from '@/hooks/useRoleMenu.js';

/**
 * ETP-5485 — the access-denied screen, with the exact markup, `data-testid` and i18n key of
 * `@etendosoftware/app-shell-core`'s `WindowAccessGuard`, so a page gated by something other
 * than an `AD_Window` looks the same as any other window the user cannot open. Core does not
 * export its inline markup, so this is a copy: keep it in sync with core's `WindowAccessGuard`
 * (move it to core the next time core's auth module is touched).
 */
export function AccessDeniedMessage() {
  const ui = useUI();
  return (
    <div
      className="flex h-full w-full items-center justify-center p-10 text-center text-sm text-muted-foreground"
      data-testid="window-access-denied"
    >
      {ui('windowAccessDenied')}
    </div>
  );
}

/**
 * ETP-5485 — route guard for a page whose access anchor is a PROCESS (`OBUIAPP_Process_ID` or
 * `AD_Process_ID`), not an `AD_Window`. `WindowAccessGuard` cannot gate those: it only reads
 * `windowAccess[windowId]`. This reads the same role-filtered id set the sidebar filters menu
 * items by (`useRoleMenu()` over `SFListMenu`, which lists window AND process ids), so the page
 * and its sidebar entry always agree.
 *
 * Before this guard, "Documentos no contabilizados" hid from the sidebar for a role without
 * its process grant, but opening `/not-posted-documents` directly still mounted the page:
 * filters, "0 registros" and the raw backend "Forbidden".
 *
 * `useRoleMenu()` states:
 * - `undefined` (still loading) → a neutral loading placeholder. Neither the page (it would
 *   fire requests) nor the denied screen (an authorized user would see it flash).
 * - `null` (menu webhook unreachable) → fail OPEN, like the sidebar. The backend still answers
 *   403, and the page turns that into the same denied screen.
 * - `Set` → children when it holds `processId`, the denied screen otherwise.
 */
export default function ProcessAccessGuard({ processId, children = null }) {
  const allowedIds = useRoleMenu();
  const ui = useUI();
  if (allowedIds === undefined) {
    return (
      <div className="py-8 text-center text-xs text-muted-foreground" data-testid="process-access-loading">
        {ui('loading')}
      </div>
    );
  }
  if (allowedIds === null || allowedIds.has(String(processId))) return children;
  return <AccessDeniedMessage />;
}
