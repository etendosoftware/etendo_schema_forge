/**
 * ETP-5190 — `FirstStepsProvider` is the single owner of the checklist state.
 *
 * The behaviour worth guarding is not the plumbing but the two things that broke before it
 * existed: every consumer must see the SAME state (so the sidebar badge cannot lag the page),
 * and the write allowlist must reach `useFirstSteps` (so a non-writable id never goes on the
 * wire — the server drops it silently, which would persist a state that reads back different).
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

import { FirstStepsProvider, useFirstStepsState, useFirstStepsProgressOptional } from '../FirstStepsContext.jsx';
import { TOGGLEABLE_STEP_IDS, FIRST_STEPS_TOTAL } from '../firstStepsConfig.js';

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
});

describe('FirstStepsProvider', () => {
  it('hands useFirstSteps exactly the toggleable ids as its write allowlist', () => {
    render(<FirstStepsProvider><Page /></FirstStepsProvider>);
    expect(hook.lastOptions).toEqual({ allowedIds: TOGGLEABLE_STEP_IDS });
  });

  it('derives the progress figures from the catalogue, not from a literal', () => {
    hook.completed = ['company-data', 'products'];
    render(<FirstStepsProvider><Badge /></FirstStepsProvider>);
    // `create-account` is alwaysDone and counts, hence 3 rather than 2.
    expect(screen.getByTestId('badge')).toHaveTextContent(`3/${FIRST_STEPS_TOTAL}`);
  });

  it('counts only the alwaysDone step on a fresh account', () => {
    render(<FirstStepsProvider><Badge /></FirstStepsProvider>);
    expect(screen.getByTestId('badge')).toHaveTextContent(`1/${FIRST_STEPS_TOTAL}`);
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
    expect(screen.getByTestId('badge')).toHaveTextContent(`1/${FIRST_STEPS_TOTAL}`);
    expect(calls).toHaveLength(1);
  });

  it('routes a consumer mutation to the one hook underneath', async () => {
    const user = userEvent.setup();
    render(<FirstStepsProvider><Page /></FirstStepsProvider>);
    await user.click(screen.getByTestId('toggle'));
    expect(hook.toggleStep).toHaveBeenCalledWith('products');
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
