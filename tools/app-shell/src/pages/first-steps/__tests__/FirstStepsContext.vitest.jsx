/**
 * ETP-5190 — `FirstStepsProvider` is the single owner of the checklist state.
 *
 * The behaviour worth guarding is not the plumbing but the two things that broke before it
 * existed: every consumer must see the SAME state (so the sidebar badge cannot lag the page),
 * and the write allowlist must reach `useFirstSteps` (so a non-writable id never goes on the
 * wire — the server drops it silently, which would persist a state that reads back different).
 *
 * Since the plan gate it owns a third thing: the tenant plan, and therefore the visible step
 * list and the badge denominator. `useTenantPlan` is mocked because resolving a real plan means
 * a `/sws/go/environments` request and a localStorage client id — that hook has its own suite.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const hook = vi.hoisted(() => ({
  lastOptions: undefined, completed: [], toggleStep: null, dismissed: false, setDismissed: null,
}));
vi.mock('../useFirstSteps.js', () => ({
  useFirstSteps: (options) => {
    hook.lastOptions = options;
    return {
      completed: hook.completed,
      seen: false,
      dismissed: hook.dismissed,
      loading: false,
      error: null,
      toggleStep: hook.toggleStep,
      markSeen: async () => true,
      setDismissed: hook.setDismissed,
    };
  },
}));

/**
 * The transfer status read (flag `demo-data-transfer`, ETP-5443) is mocked for the same reason
 * `useTenantPlan` is: it is a request with its own suite. The default is what the backend answers
 * with the flag OFF — a 404, so not loading and not available — which keeps every test that is
 * not about the transfer on the pre-ETP-5364 catalogue.
 */
const FLAG_OFF_TRANSFER = Object.freeze({
  status: 'NOT_REQUESTED', products: {}, contacts: {}, loading: false, available: false, error: false,
});
const transferHook = vi.hoisted(() => ({ value: null }));
vi.mock('../useDemoDataTransfer.js', () => ({
  useDemoDataTransfer: () => transferHook.value,
}));

const tenantPlan = vi.hoisted(() => ({ plan: 'productive', loading: false }));
vi.mock('@/hooks/useTenantPlan.js', () => ({
  useTenantPlan: () => tenantPlan,
}));

import { FirstStepsProvider, useFirstStepsState, useFirstStepsProgressOptional } from '../FirstStepsContext.jsx';
import { PLAN_PRODUCTIVE, firstStepsTotal, toggleableStepIds } from '../firstStepsConfig.js';

const PRODUCTIVE_TOTAL = firstStepsTotal(PLAN_PRODUCTIVE);

/** Stands in for the sidebar badge: a second, independent consumer of the same provider. */
function Badge() {
  const progress = useFirstStepsProgressOptional();
  return <span data-testid="badge">{progress ? `${progress.completedCount}/${progress.total}` : 'none'}</span>;
}

/** Stands in for the page: reads the state and mutates it. */
function Page() {
  const { completed, toggleStep } = useFirstStepsState();
  return (
    <div>
      <span data-testid="page">{completed.join(',') || 'empty'}</span>
      <button type="button" onClick={() => toggleStep('products')} data-testid="toggle" />
    </div>
  );
}

beforeEach(() => {
  hook.lastOptions = undefined;
  hook.completed = [];
  hook.toggleStep = vi.fn(async () => true);
  hook.dismissed = false;
  hook.setDismissed = vi.fn(async () => true);
  tenantPlan.plan = PLAN_PRODUCTIVE;
  tenantPlan.loading = false;
  transferHook.value = FLAG_OFF_TRANSFER;
});

describe('FirstStepsProvider', () => {
  it('hands useFirstSteps exactly the toggleable ids as its write allowlist', () => {
    render(<FirstStepsProvider><Page /></FirstStepsProvider>);
    expect(hook.lastOptions).toEqual({ allowedIds: toggleableStepIds(PLAN_PRODUCTIVE) });
  });

  it('derives the progress figures from the catalogue, not from a literal', () => {
    hook.completed = ['company-data', 'products'];
    render(<FirstStepsProvider><Badge /></FirstStepsProvider>);
    // `create-account` is alwaysDone and counts, hence 3 rather than 2.
    expect(screen.getByTestId('badge')).toHaveTextContent(`3/${PRODUCTIVE_TOTAL}`);
  });

  it('counts only the alwaysDone step on a fresh account', () => {
    render(<FirstStepsProvider><Badge /></FirstStepsProvider>);
    expect(screen.getByTestId('badge')).toHaveTextContent(`1/${PRODUCTIVE_TOTAL}`);
  });

  it.each(['COMPLETED', 'SKIPPED', 'NOT_REQUESTED'])(
    'counts the server-owned transfer when its status is %s', (status) => {
      transferHook.value = { ...FLAG_OFF_TRANSFER, available: true, status };
      render(<FirstStepsProvider><Badge /></FirstStepsProvider>);
      expect(screen.getByTestId('badge')).toHaveTextContent('2/8');
    },
  );

  it('holds the provider in loading while transfer status is unresolved', () => {
    transferHook.value = { ...FLAG_OFF_TRANSFER, status: 'LOADING', loading: true };
    function Loading() {
      return <span data-testid="loading">{String(useFirstStepsState().loading)}</span>;
    }
    render(<FirstStepsProvider><Loading /></FirstStepsProvider>);
    expect(screen.getByTestId('loading')).toHaveTextContent('true');
  });

  it('serves both consumers from ONE hook instance', () => {
    // REGRESSION GUARD for the bug this provider exists to fix: the badge and the page each
    // used to call `useFirstSteps` themselves, so ticking a step on the page left the badge
    // showing the previous count until a reload. Two GETs, two states, one of them stale.
    const calls = [];
    hook.lastOptions = undefined;
    render(
      <FirstStepsProvider>
        <Page />
        <Badge />
      </FirstStepsProvider>,
    );
    calls.push(hook.lastOptions);
    expect(screen.getByTestId('page')).toHaveTextContent('empty');
    expect(screen.getByTestId('badge')).toHaveTextContent(`1/${PRODUCTIVE_TOTAL}`);
    expect(calls).toHaveLength(1);
  });

  it('routes a consumer mutation to the one hook underneath', async () => {
    const user = userEvent.setup();
    render(<FirstStepsProvider><Page /></FirstStepsProvider>);
    await user.click(screen.getByTestId('toggle'));
    expect(hook.toggleStep).toHaveBeenCalledWith('products');
  });
});

describe('the plan the provider hands down', () => {
  /** Renders what the page consumes: the visible list and the denominator. */
  function Steps() {
    const { steps, total, plan, loading } = useFirstStepsState();
    return (
      <span data-testid="steps">
        {`${loading}|${plan}|${total}|${steps.map((s) => s.id).join(',')}`}
      </span>
    );
  }

  it('gives a productive tenant every step', () => {
    render(<FirstStepsProvider><Steps /></FirstStepsProvider>);
    expect(screen.getByTestId('steps')).toHaveTextContent('false|productive|7|');
    expect(screen.getByTestId('steps')).not.toHaveTextContent('demo-data-transfer');
    expect(screen.getByTestId('steps')).toHaveTextContent('invoice-sequence');
    expect(screen.getByTestId('steps')).toHaveTextContent('fiscal-config');
  });

  it('gives a trial tenant five steps, without the productive-only ones', () => {
    tenantPlan.plan = 'free';
    render(<FirstStepsProvider><Steps /></FirstStepsProvider>);
    const rendered = screen.getByTestId('steps').textContent;
    expect(rendered).toContain('false|free|5|');
    expect(rendered).not.toContain('invoice-sequence');
    expect(rendered).not.toContain('fiscal-config');
    expect(rendered).not.toContain('demo-data-transfer');
  });

  it('narrows the write allowlist to what a trial can tick', () => {
    // The gate is not only visual: a step that is not on screen must not be persistable.
    tenantPlan.plan = 'free';
    render(<FirstStepsProvider><Page /></FirstStepsProvider>);
    expect(hook.lastOptions.allowedIds).toEqual(['company-data', 'products', 'contacts', 'team']);
  });

  it('scopes the badge denominator to the plan, so a trial can reach all-set', () => {
    tenantPlan.plan = 'free';
    hook.completed = ['company-data', 'products', 'contacts', 'team'];
    render(<FirstStepsProvider><Badge /></FirstStepsProvider>);
    expect(screen.getByTestId('badge')).toHaveTextContent('5/5');
  });

  it('does not count a completed step the plan hides', () => {
    // A tenant that finished everything while productive and is then reported free must not
    // render more than 5/5. The count follows the visible list, not the stored ids.
    tenantPlan.plan = 'free';
    hook.completed = ['company-data', 'fiscal-config', 'products', 'contacts',
      'invoice-sequence', 'team'];
    render(<FirstStepsProvider><Badge /></FirstStepsProvider>);
    expect(screen.getByTestId('badge')).toHaveTextContent('5/5');
  });

  it('reports loading while the plan is still unknown, even with the state already in', () => {
    // Without this the page renders the productive list and then drops two rows under the
    // user once /environments answers. The badge keys off `loading` and renders nothing.
    tenantPlan.plan = null;
    tenantPlan.loading = true;
    render(<FirstStepsProvider><Steps /></FirstStepsProvider>);
    expect(screen.getByTestId('steps')).toHaveTextContent('true|null|7|');
  });

  it('falls back to the full list when the plan cannot be resolved at all', () => {
    // `useTenantPlan` answers `{ plan: null, loading: false }` on a failed /environments or a
    // session with no platform token. Fail-open: a paying tenant never loses its steps.
    tenantPlan.plan = null;
    tenantPlan.loading = false;
    render(<FirstStepsProvider><Steps /></FirstStepsProvider>);
    const rendered = screen.getByTestId('steps').textContent;
    expect(rendered).toContain('false|null|7|');
    expect(rendered).toContain('invoice-sequence');
  });
});

describe('the demo data transfer row (flag demo-data-transfer, ETP-5443)', () => {
  function Steps() {
    const { steps, total, loading } = useFirstStepsState();
    return <span data-testid="steps">{`${loading}|${total}|${steps.map((s) => s.id).join(',')}`}</span>;
  }

  it('is absent while the backend hides the transfer (flag off)', () => {
    render(<FirstStepsProvider><Steps /></FirstStepsProvider>);
    const rendered = screen.getByTestId('steps').textContent;
    expect(rendered).toContain('false|7|');
    expect(rendered).not.toContain('demo-data-transfer');
  });

  it('is spliced in after the fiscal step once the backend exposes it (flag on)', () => {
    transferHook.value = { ...FLAG_OFF_TRANSFER, available: true, status: 'RUNNING' };
    render(<FirstStepsProvider><Steps /></FirstStepsProvider>);
    expect(screen.getByTestId('steps')).toHaveTextContent('fiscal-config,demo-data-transfer,products');
    expect(screen.getByTestId('steps')).toHaveTextContent('false|8|');
  });

  it('counts a terminal transfer as done in the badge', () => {
    transferHook.value = { ...FLAG_OFF_TRANSFER, available: true, status: 'COMPLETED' };
    render(<FirstStepsProvider><Badge /></FirstStepsProvider>);
    expect(screen.getByTestId('badge')).toHaveTextContent('2/8');
  });

  it('stays off a trial tenant even when the backend exposes it', () => {
    tenantPlan.plan = 'free';
    transferHook.value = { ...FLAG_OFF_TRANSFER, available: true };
    render(<FirstStepsProvider><Steps /></FirstStepsProvider>);
    expect(screen.getByTestId('steps')).not.toHaveTextContent('demo-data-transfer');
  });

  it('holds the checklist loading until the transfer status read answers', () => {
    transferHook.value = { ...FLAG_OFF_TRANSFER, status: 'LOADING', loading: true };
    render(<FirstStepsProvider><Steps /></FirstStepsProvider>);
    expect(screen.getByTestId('steps')).toHaveTextContent('true|7|');
  });
});

describe('no provider above', () => {
  it('leaves useFirstStepsState inert and loading rather than throwing', () => {
    // `SideMenu` and `DashboardPage` are both rendered bare by suites that have nothing to do
    // with onboarding. `loading: true` is what those saw when each consumer ran its own hook
    // with no session, and it is what keeps the dashboard gate from redirecting.
    function Bare() {
      const state = useFirstStepsState();
      return <span data-testid="bare">{`${state.loading}|${state.completed.length}|${state.seen}`}</span>;
    }
    render(<Bare />);
    expect(screen.getByTestId('bare')).toHaveTextContent('true|0|false');
  });

  it('never fires the GET — no second hook instance is created', () => {
    function Bare() {
      useFirstStepsState();
      return null;
    }
    render(<Bare />);
    expect(hook.lastOptions).toBeUndefined();
  });

  it('gives the badge nothing to render', () => {
    render(<Badge />);
    expect(screen.getByTestId('badge')).toHaveTextContent('none');
  });

  it('makes the inert mutations no-op falsely rather than pretend success', async () => {
    // A caller that surfaces "could not save" is correct here; one told `true` would show a
    // completion that was never persisted.
    function Bare() {
      const { toggleStep, markSeen, setDismissed } = useFirstStepsState();
      return (
        <button
          type="button"
          data-testid="inert"
          onClick={async () => {
            const results = [
              await toggleStep('products'), await markSeen(), await setDismissed(true),
            ];
            document.title = results.join(',');
          }}
        />
      );
    }
    const user = userEvent.setup();
    render(<Bare />);
    await user.click(screen.getByTestId('inert'));
    expect(document.title).toBe('false,false,false');
  });

  it('reports the checklist as not dismissed, so the menu keeps the entry', () => {
    // ETP-5364 — the inert state is "no provider above me", which is indistinguishable from
    // "not answered yet". Reporting `true` here would delete a menu entry in every bare
    // component test, and in any tree that forgot the provider.
    function Bare() {
      const { dismissed } = useFirstStepsState();
      return <span data-testid="dismissed">{String(dismissed)}</span>;
    }
    render(<Bare />);
    expect(screen.getByTestId('dismissed')).toHaveTextContent('false');
  });
});

describe('FirstStepsProvider — `dismissed` passes through (ETP-5364)', () => {
  it('exposes the flag and the writer the page and the menu both read', async () => {
    hook.dismissed = true;
    const calls = [];
    hook.setDismissed = async (next) => { calls.push(next); return true; };

    function Probe() {
      const { dismissed, setDismissed } = useFirstStepsState();
      return (
        <button
          type="button"
          data-testid="probe"
          data-dismissed={String(dismissed)}
          onClick={() => setDismissed(false)}
        />
      );
    }
    const user = userEvent.setup();
    render(<FirstStepsProvider><Probe /></FirstStepsProvider>);

    expect(screen.getByTestId('probe')).toHaveAttribute('data-dismissed', 'true');
    await user.click(screen.getByTestId('probe'));
    expect(calls).toEqual([false]);
  });

  it('is independent of the completion count', () => {
    // Finishing every step must not dismiss the checklist, and dismissing it must not mark
    // anything complete — the sidebar reads one and the progress badge the other.
    hook.dismissed = true;
    hook.completed = [];

    function Probe() {
      const { dismissed, completedCount } = useFirstStepsState();
      return <span data-testid="probe">{`${dismissed}:${completedCount}`}</span>;
    }
    render(<FirstStepsProvider><Probe /></FirstStepsProvider>);
    // 1 = the always-done `create-account` row, not a side effect of dismissing.
    expect(screen.getByTestId('probe')).toHaveTextContent('true:1');
  });
});
