import { AlertTriangle } from 'lucide-react';
import { useUI } from '@/i18n';
import { InfoBanner } from '@/components/InfoBanner.jsx';
import { useRoleChangeNotice } from '@/hooks/useRoleChangeNotice.js';

/**
 * ETP-5189 — "your role/permissions changed elsewhere" notice.
 *
 * Confirmed live (2026-09-11): by the time this banner is visible, the access
 * change has ALREADY been applied — ETP-5195's silent refresh already swapped
 * `windowAccess`/`capabilities`/`menuAccess` and re-rendered the menu/guards live,
 * with no reload. `useWindowAccess`/`WindowAccessGuard` (core) read that state
 * reactively too, so even a window the user has open right now re-guards itself
 * the instant access changes — confirmed no case exists where a reload is
 * actually required for correctness. The copy is therefore a pure past-tense
 * confirmation ("Your permissions have been updated"), not an instruction.
 *
 * Mounted at the app-shell root (App.jsx, alongside ServiceWorkerManager/
 * SurveyManager — all children of `AppShellRuntime`, inside its internal
 * `AuthProvider`), so it is visible regardless of which window the user is
 * looking at when the change lands. Fixed-position overlay rather than a
 * document-flow element: `App.jsx` renders it as a plain sibling of `<Routes>`
 * (see AppShellRuntime.jsx), OUTSIDE AppLayout's own layout box, so stacking it
 * in flow would push AppLayout's `h-screen`-style chrome down instead of
 * overlaying it.
 *
 * No "Reload now" action (dropped 2026-09-11, superseding the ticket's literal
 * AC #2 — nothing is left to apply, so a reload button had no real job). AC #4
 * ("cannot keep navigating unauthorized sections") is satisfied independently by
 * the reactive guards above, not by this banner — so it's safe to make this
 * DISMISSIBLE (`InfoBanner`'s own `dismissible`/`onDismiss`) rather than stuck on
 * screen for the rest of the session with no way to clear it. See
 * `useRoleChangeNotice`'s own doc comment for why dismissing doesn't suppress a
 * later, genuinely new change from re-showing it.
 */
export function RoleChangedBanner() {
  const { changed, dismiss } = useRoleChangeNotice();
  const ui = useUI();

  if (!changed) return null;

  return (
    <div
      className="fixed inset-x-0 top-0 z-50"
      role="status"
      aria-live="polite"
      data-testid="RoleChangedBanner__ecaf3f">
      <InfoBanner
        tone="warning"
        icon={AlertTriangle}
        dismissible
        onDismiss={dismiss}
        data-testid="role-changed-banner">
        {ui('roleChangedBannerMessage')}
      </InfoBanner>
    </div>
  );
}

export default RoleChangedBanner;
