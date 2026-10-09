import { useCallback } from 'react';
import {
  getFlowStatus,
  markFlowStarted,
  useWalkthrough,
} from '@etendosoftware/app-shell-core/walkthrough';
import { useObservability } from '@etendosoftware/app-shell-core/observability';

/**
 * Starts a guided walkthrough by id from anywhere outside the topbar launcher
 * (e.g. a "Ver guía" link in an empty state), running the same three steps the
 * core `WalkthroughLauncher` runs on a menu pick, in the same order:
 *
 *   1. report the start, with the status the flow held BEFORE this run;
 *   2. mark the flow as started in the progress store;
 *   3. start the engine.
 *
 * `source` is the telemetry `source` of the run (the launcher reports
 * `'launcher'`), so a start from here is distinguishable in analytics.
 *
 * Works without providers: with no `WalkthroughProvider` the default context
 * has `available: false`, so `canLaunch` is false and `launch` is a no-op.
 *
 * @param {string} source telemetry source for the started run
 * @returns {{ canLaunch: (flowId: string) => boolean, launch: (flowId: string) => boolean }}
 */
export function useLaunchWalkthrough(source) {
  const { available, flows, start, isRunning } = useWalkthrough();
  const { trackWalkthroughStarted } = useObservability();

  const findFlow = useCallback(
    (flowId) => (available ? flows.find((flow) => flow.id === flowId) ?? null : null),
    [available, flows],
  );

  const canLaunch = useCallback((flowId) => findFlow(flowId) !== null, [findFlow]);

  const launch = useCallback((flowId) => {
    const flow = findFlow(flowId);
    if (!flow || isRunning) return false;
    trackWalkthroughStarted?.({
      flowId: flow.id,
      status: getFlowStatus(flow.id, flow.revision ?? 1),
      total: flow.steps?.length ?? 0,
      source,
    });
    markFlowStarted(flow.id);
    return start(flow.id);
  }, [findFlow, isRunning, trackWalkthroughStarted, source, start]);

  return { canLaunch, launch };
}
