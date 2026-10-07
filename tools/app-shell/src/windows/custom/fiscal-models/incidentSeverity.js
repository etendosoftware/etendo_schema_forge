// ETP-5597 — incidents severity helpers, kept in their own module (instead of
// fiscalModelsUtils.js) so the many page tests that vi.mock fiscalModelsUtils.js with an explicit
// factory keep working without having to stub these pure functions.

/**
 * ETP-5597 — single source of truth for the severity an incidents indicator must reflect.
 * Accepts one `{ blocking, warning }` counts object (a declaration's `incidents`) or an array of
 * them (aggregate over several declarations, e.g. the list KPI). Returns:
 *   - 'block' when at least one blocking incident exists (blocking always wins);
 *   - 'warn'  when there are only warnings;
 *   - 'none'  when there are no incidents at all.
 */
export function getIncidentSeverity(incidents) {
  const list = Array.isArray(incidents) ? incidents : [incidents];
  let warn = false;
  for (const inc of list) {
    if ((inc?.blocking ?? 0) > 0) return 'block';
    if ((inc?.warning ?? 0) > 0) warn = true;
  }
  return warn ? 'warn' : 'none';
}

/**
 * ETP-5597 — the visual variant (theme tokens only) for an incidents indicator, derived from
 * `getIncidentSeverity`. Blocking → destructive role + "Requiere revisión"; warning-only →
 * warning role + "Advertencia". Returns `null` for 'none' so each caller keeps its own
 * no-incidents rendering unchanged. `tone` matches the `.fm-tabs__badge--{tone}` modifiers.
 */
export function getIncidentIndicator(incidents, t) {
  const severity = getIncidentSeverity(incidents);
  if (severity === 'block') {
    return {
      severity,
      tone: 'danger',
      label: t?.('fm.kpi.incidents_sub') ?? 'Requiere revisión',
      iconColor: 'hsl(var(--destructive))',
      badgeBg: 'var(--status-destructive-bg)',
      badgeColor: 'hsl(var(--destructive))',
    };
  }
  if (severity === 'warn') {
    return {
      severity,
      tone: 'warn',
      label: t?.('fm.incidents.severity.warn') ?? 'Advertencia',
      iconColor: 'var(--status-warning-fg)',
      badgeBg: 'var(--status-warning-bg)',
      badgeColor: 'var(--status-warning-fg)',
    };
  }
  return null;
}
