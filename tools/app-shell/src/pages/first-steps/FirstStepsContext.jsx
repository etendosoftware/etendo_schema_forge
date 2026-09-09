import { createContext, useContext, useMemo } from 'react';
import { TOGGLEABLE_STEP_IDS, countCompletedSteps, FIRST_STEPS_TOTAL } from './firstStepsConfig.js';
import { useFirstSteps } from './useFirstSteps.js';

/**
 * ETP-5190 — one owner of the First Steps state for the whole shell.
 *
 * Three places read it and they must agree: the checklist page, the dashboard's one-time
 * redirect, and the sidebar's `x/7` progress badge. Before this provider each of them called
 * `useFirstSteps` itself, which meant one GET per consumer AND — the reason this exists — a
 * sidebar badge that kept showing the old count until a page reload, because ticking a step on
 * the page mutated a different hook instance. The badge is the visible half of "the option to
 * open the panel is never hidden", so a stale count is a bug, not a cosmetic lag.
 *
 * Mounted in `AppLayout`, above both `SideMenu` and the routed `Outlet`.
 *
 * With no provider above it, `useFirstStepsState()` returns {@link INERT_STATE} rather than
 * throwing. That is not a convenience: `SideMenu` and `DashboardPage` are each rendered bare by
 * suites that have nothing to do with onboarding, and the inert value reproduces exactly what
 * they saw when every consumer called `useFirstSteps` itself with no session — permanently
 * loading, so the dashboard never redirects and the sidebar badge never renders. What it does
 * NOT do is spin up a second live hook instance, which is the divergence this provider exists
 * to remove. A real wiring mistake therefore shows as a checklist stuck on its skeleton, which
 * is visible, rather than as a checklist quietly reporting zero progress.
 */

/** @see useFirstStepsState */
const INERT_STATE = Object.freeze({
  completed: Object.freeze([]),
  seen: false,
  loading: true,
  error: null,
  toggleStep: async () => false,
  markSeen: async () => false,
  completedCount: 0,
  total: FIRST_STEPS_TOTAL,
});
const FirstStepsContext = createContext(null);

export function FirstStepsProvider({ children }) {
  const firstSteps = useFirstSteps({ allowedIds: TOGGLEABLE_STEP_IDS });
  const { completed, seen, loading, error, toggleStep, markSeen } = firstSteps;
  const value = useMemo(() => ({
    completed,
    seen,
    loading,
    error,
    toggleStep,
    markSeen,
    completedCount: countCompletedSteps(completed),
    total: FIRST_STEPS_TOTAL,
  }), [completed, seen, loading, error, toggleStep, markSeen]);
  return <FirstStepsContext.Provider value={value}>{children}</FirstStepsContext.Provider>;
}

export function useFirstStepsState() {
  return useContext(FirstStepsContext) ?? INERT_STATE;
}

/**
 * Variant for the sidebar badge, which must render nothing at all outside a provider rather
 * than fall back to a loading state it would then have to special-case. Returns `null`.
 */
export function useFirstStepsProgressOptional() {
  return useContext(FirstStepsContext);
}

export default FirstStepsContext;
