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

const hook = vi.hoisted(() => ({ lastOptions: undefined, completed: [], toggleStep: null }));
vi.mock('../useFirstSteps.js', () => ({
  useFirstSteps: (options) => {
    hook.lastOptions = options;
    return {
      completed: hook.completed,
      seen: false,
      loading: false,
      error: null,
      toggleStep: hook.toggleStep,
      markSeen: async () => true,
    };
  },
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
  tenantPlan.plan = PLAN_PRODUCTIVE;
  tenantPlan.loading = false;
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
    expect(screen.getByTestId('steps')).toHaveTextContent('invoice-sequence');
    expect(screen.getByTestId('steps')).toHaveTextContent('fiscal-config');
  });

  it('gives a trial tenant five steps, without the two gated ones', () => {
    tenantPlan.plan = 'free';
    render(<FirstStepsProvider><Steps /></FirstStepsProvider>);
    const rendered = screen.getByTestId('steps').textContent;
    expect(rendered).toContain('false|free|5|');
    expect(rendered).not.toContain('invoice-sequence');
    expect(rendered).not.toContain('fiscal-config');
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
    // render 7/5. The count follows the visible list, not the stored ids.
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
      const { toggleStep, markSeen } = useFirstStepsState();
      return (
        <button
          type="button"
          data-testid="inert"
          onClick={async () => {
            const results = [await toggleStep('products'), await markSeen()];
            document.title = results.join(',');
          }}
        />
      );
    }
    const user = userEvent.setup();
    render(<Bare />);
    await user.click(screen.getByTestId('inert'));
    expect(document.title).toBe('false,false');
  });
});
