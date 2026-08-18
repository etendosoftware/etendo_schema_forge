import { useUI } from '@/i18n';

/**
 * Generic tri-state access-tier pill: `'full'` renders a green check pill,
 * `'readOnly'` an amber "Solo lectura"/"Read-only" pill (reuses the existing
 * `accessTierReadOnly` i18n key, unchanged since ETP-4513's
 * `RolesOverviewPage.jsx`), and anything else (`'none'`, `null`, `undefined`)
 * renders a plain gray em-dash with no pill chrome.
 *
 * Built for ETP-4907's "Configuración > Roles" window x role access matrix
 * (`RolesAccessMatrix.jsx`). Mirrors — but does NOT import, since that work
 * lives on the sibling `feature/ETP-4906` branch which is not yet merged into
 * this one — the `TierPill` component built there for the User window's own
 * role-preview matrix (`windows/custom/user/UserRolesTab.jsx`). Once
 * `feature/ETP-4906` merges, that component's local `TierPill` should be
 * reconciled to use this shared one instead of carrying its own duplicate
 * copy (flagged in this ticket's delivery report for the coordinator/Alex).
 *
 * Reuses the same `status-success`/`status-warning` semantic Tailwind
 * utilities (backed by `--status-success-*`/`--status-warning-*` CSS custom
 * properties, both with dark-mode variants) that `lib/statusBadge.js`'s
 * `getStatusBadgeProps()` already uses elsewhere in this app, rather than a
 * new ad-hoc raw-green/raw-amber color.
 */
export default function AccessTierPill({ tier, 'data-testid': dataTestId }) {
  const ui = useUI();

  if (tier === 'full') {
    return (
      <span
        className="inline-flex items-center justify-center rounded-full border border-status-success-border bg-status-success px-2 py-0.5 text-xs font-medium text-status-success-foreground"
        data-testid={dataTestId ?? 'AccessTierPill__full'}
      >
        {'✓'}
      </span>
    );
  }

  if (tier === 'readOnly') {
    return (
      <span
        className="inline-flex items-center rounded-full border border-status-warning-border bg-status-warning px-2 py-0.5 text-xs font-medium text-status-warning-foreground"
        data-testid={dataTestId ?? 'AccessTierPill__readOnly'}
      >
        {ui('accessTierReadOnly')}
      </span>
    );
  }

  return (
    <span className="text-muted-foreground" data-testid={dataTestId ?? 'AccessTierPill__none'}>
      {'—'}
    </span>
  );
}
