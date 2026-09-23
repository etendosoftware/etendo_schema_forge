import { createContext, useContext, useMemo } from 'react';
import {
  countCompletedSteps,
  firstStepsTotal,
  toggleableStepIds,
  visibleFirstSteps,
} from './firstStepsConfig.js';
import { useFirstSteps } from './useFirstSteps.js';
import { useDemoDataTransfer } from './useDemoDataTransfer.js';
import { NO_DEMO_DATA_TRANSFER, demoDataTransferStepState } from './demoDataTransferStep.js';
import { useTenantPlan } from '@/hooks/useTenantPlan.js';

/**
 * ETP-5190 — the single owner of the checklist state, mounted once in `AppLayout`.
 *
 * Three consumers read it (the page, the sidebar badge, the dashboard gate) and each running
 * its own `useFirstSteps` made the badge lag the page by a request. It also owns the tenant
 * plan and server-owned demo transfer state, for the same reason: the visible step list, the
 * badge denominator and the "all set" state must agree across consumers.
 */
const INERT_STATE = Object.freeze({
  completed: Object.freeze([]),
  seen: false,
  dismissed: false,
  // Inert means "no provider above me", which is indistinguishable from "not answered yet" —
  // so it reports loading and the badge renders nothing rather than a wrong 0/8.
  loading: true,
  error: null,
  toggleStep: async () => false,
  markSeen: async () => false,
  setDismissed: async () => false,
  completedCount: 0,
  plan: null,
  steps: Object.freeze(visibleFirstSteps(null)),
  total: firstStepsTotal(null),
  dataTransfer: { status: 'LOADING', products: {}, contacts: {}, loading: true, available: false },
  demoDataTransfer: NO_DEMO_DATA_TRANSFER,
});
const FirstStepsContext = createContext(null);

export function FirstStepsProvider({ children }) {
  const { plan, loading: planLoading } = useTenantPlan();
  // The write allowlist is plan-scoped, so a step the current plan does not show cannot be
  // persisted even if something asked. The SERVER allowlist stays the full toggleable set —
  // it knows nothing about plans, and a tenant that goes productive must be able to save the
  // two toggleable steps that just appeared. Demo transfer uses its own server state.
  const firstSteps = useFirstSteps({ allowedIds: toggleableStepIds(plan) });
  // Flag `demo-data-transfer` (ETP-5443) is evaluated by the backend only; `available` is its
  // answer, and `demoDataTransfer` is the one value every catalogue helper below is handed.
  const dataTransfer = useDemoDataTransfer();
  const demoDataTransfer = demoDataTransferStepState(dataTransfer);
  const { completed, seen, dismissed, loading, error, toggleStep, markSeen, setDismissed } =
    firstSteps;
  const value = useMemo(() => ({
    completed,
    seen,
    // ETP-5364 — the user closed the checklist for good. Read by `AppLayout`, which feeds it to
    // `filterMenuGroupsByAccess` as the fourth menu axis, and by `FirstStepsPage` to offer
    // bringing it back. Never derived from `completedCount === total`: finishing the list is not
    // the same act as choosing to put it away. TRI-STATE — `undefined` until the GET answers,
    // and the menu filter reveals the entry only on an exact `false`. See useFirstSteps.js.
    dismissed,
    // Missing completed ids, plan, or transfer status makes progress unanswerable. The plan
    // controls the denominator, while completed ids and transfer status control the count.
    // This also holds back the dashboard's one-time redirect (`useFirstStepsRedirect` gates on
    // `!loading`) until the plan is in — deliberately, since the page it redirects to would
    // otherwise render the productive list and drop three rows a moment later.
    loading: loading || planLoading || dataTransfer.loading,
    error,
    toggleStep,
    markSeen,
    setDismissed,
    plan,
    steps: visibleFirstSteps(plan, demoDataTransfer),
    dataTransfer,
    demoDataTransfer,
    completedCount: countCompletedSteps(completed, plan, demoDataTransfer),
    total: firstStepsTotal(plan, demoDataTransfer),
  }), [completed, seen, dismissed, loading, planLoading, error, toggleStep, markSeen,
    setDismissed, plan, dataTransfer, demoDataTransfer]);
  return <FirstStepsContext.Provider value={value}>{children}</FirstStepsContext.Provider>;
}

export function useFirstStepsState() {
  return useContext(FirstStepsContext) ?? INERT_STATE;
}

export function useFirstStepsProgressOptional() {
  return useContext(FirstStepsContext);
}

export default FirstStepsContext;
