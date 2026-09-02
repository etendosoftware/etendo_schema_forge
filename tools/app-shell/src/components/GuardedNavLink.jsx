import { NavLink, useNavigate } from 'react-router-dom';
import { requestNavigation } from '@/lib/unsavedChanges.js';

/**
 * A `NavLink` that asks before leaving a form with unsaved changes (ETP-5073 / DOC-08).
 *
 * Renders a real anchor, so middle-click, cmd/ctrl-click and "open in new tab" keep working —
 * and those are deliberately NOT guarded: they open a second tab and leave the current form
 * exactly where it is, so there is nothing to lose and a prompt would be pure friction.
 *
 * Everything else routes through the navigation gate, which navigates straight away when no form
 * is dirty. See the navigation-guard section of `lib/unsavedChanges.js` for why the interception
 * is here rather than in a react-router blocker.
 */
// @data-testid-ignore — this is a pass-through wrapper: every caller supplies its own
// `data-testid` through `...rest`, and the codemod appends its generated attribute AFTER the
// spread, where it silently wins over the caller's. Adding one here makes every consumer's testid
// unreachable (it breaks this component's own suite and SideMenu's).
export function GuardedNavLink({ to, onClick, ...rest }) {
  const navigate = useNavigate();
  return (
    <NavLink
      // Placed BEFORE {...rest} on purpose: this is a fallback, not an override. Every caller
      // passes its own testid (SideMenu's nav entries, and GuardedNavLink.vitest.jsx queries by
      // "link"), and the codemod's default placement after the spread would have silently replaced
      // all of them.
      data-testid="NavLink__1b6d6d"
      {...rest}
      to={to}
      onClick={(event) => {
        onClick?.(event);
        // A caller that already handled this click owns it.
        if (event.defaultPrevented) return;
        // Let the browser handle the "open elsewhere" gestures natively.
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        if (typeof event.button === 'number' && event.button !== 0) return;
        event.preventDefault();
        requestNavigation(() => navigate(to));
      }}
      data-testid={rest['data-testid'] ?? 'NavLink__1b6d6d'} />
  );
}

export default GuardedNavLink;
