import { createContext, useContext, useMemo } from 'react';
import {
  countCompletedSteps,
  firstStepsTotal,
  toggleableStepIds,
  visibleFirstSteps,
} from './firstStepsConfig.js';
import { useFirstSteps } from './useFirstSteps.js';
import { useTenantPlan } from '@/hooks/useTenantPlan.js';

/**
 * ETP-5190 — the single owner of the checklist state, mounted once in `AppLayout`.
 *
 * Three consumers read it (the page, the sidebar badge, the dashboard gate) and each running
 * its own `useFirstSteps` made the badge lag the page by a request. It also owns the tenant
 * plan, for the same reason: the visible step list, the badge denominator and the "all set"
 * state must be one answer, not three that agree by luck.
 */
const INERT_STATE = Object.freeze({
  completed: Object.freeze([]),
  seen: false,
  // Inert means "no provider above me", which is indistinguishable from "not answered yet" —
  // so it reports loading and the badge renders nothing rather than a wrong 0/7.
  loading: true,
  error: null,
  toggleStep: async () => false,
  markSeen: async () => false,
  completedCount: 0,
  plan: null,
  steps: Object.freeze(visibleFirstSteps(null)),
  total: firstStepsTotal(null),
});
const FirstStepsContext = createContext(null);

export function FirstStepsProvider({ children }) {
  const { plan, loading: planLoading } = useTenantPlan();
  // The write allowlist is plan-scoped, so a step the current plan does not show cannot be
  // persisted even if something asked. The SERVER allowlist stays the full toggleable set —
  // it knows nothing about plans, and a tenant that goes productive must be able to save the
  // two steps that just appeared.
  const firstSteps = useFirstSteps({ allowedIds: toggleableStepIds(plan) });
  const { completed, seen, loading, error, toggleStep, markSeen } = firstSteps;
  const value = useMemo(() => ({
    completed,
    seen,
    // Either half missing makes the whole thing unanswerable: the completed ids without the
    // plan cannot produce a denominator, and the plan without the ids cannot produce a count.
    // This also holds back the dashboard's one-time redirect (`useFirstStepsRedirect` gates on
    // `!loading`) until the plan is in — deliberately, since the page it redirects to would
    // otherwise render the productive list and drop two rows a moment later.
    loading: loading || planLoading,
    error,
    toggleStep,
    markSeen,
    plan,
    steps: visibleFirstSteps(plan),
    completedCount: countCompletedSteps(completed, plan),
    total: firstStepsTotal(plan),
  }), [completed, seen, loading, planLoading, error, toggleStep, markSeen, plan]);
  return <FirstStepsContext.Provider value={value}>{children}</FirstStepsContext.Provider>;
}

export function useFirstStepsState() {
  return useContext(FirstStepsContext) ?? INERT_STATE;
}

export function useFirstStepsProgressOptional() {
  return useContext(FirstStepsContext);
}

export default FirstStepsContext;
