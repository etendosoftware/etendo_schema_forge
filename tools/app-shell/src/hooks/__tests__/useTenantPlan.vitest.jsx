/**
 * ETP-5190 — `useTenantPlan` resolves the plan of the environment the shell is inside.
 *
 * `useEnvironmentSwitch` is mocked: it owns a `/sws/go/environments` request, a localStorage
 * token lookup and the tenant-switch navigation, none of which is what this hook does. What
 * this hook does is pick the matching row and answer three-valued — productive, free, or
 * "cannot know" — and the third value is the one worth guarding, because the checklist treats
 * it as productive on purpose.
 */
import { render, screen } from '@testing-library/react';

const env = vi.hoisted(() => ({ value: { environments: [], loading: false, currentClientId: undefined } }));
vi.mock('../useEnvironmentSwitch.js', () => ({
  useEnvironmentSwitch: () => env.value,
}));

import { useTenantPlan } from '../useTenantPlan.js';

const PRODUCTIVE_CLIENT = 'CLIENT-PROD';
const FREE_CLIENT = 'CLIENT-FREE';
const ENVIRONMENTS = [
  { clientId: PRODUCTIVE_CLIENT, clientName: 'Paid', plan: 'productive' },
  { clientId: FREE_CLIENT, clientName: 'Trial', plan: 'free' },
];

function Probe() {
  const { plan, loading } = useTenantPlan();
  return <span data-testid="plan">{`${plan}|${loading}`}</span>;
}

const setEnv = (value) => {
  env.value = { environments: [], loading: false, currentClientId: undefined, ...value };
};

const read = () => {
  render(<Probe />);
  return screen.getByTestId('plan').textContent;
};

beforeEach(() => setEnv({}));

describe('useTenantPlan', () => {
  it('reports productive for a client whose row says so', () => {
    setEnv({ environments: ENVIRONMENTS, currentClientId: PRODUCTIVE_CLIENT });
    expect(read()).toBe('productive|false');
  });

  it('reports free for a client whose row says anything else', () => {
    setEnv({ environments: ENVIRONMENTS, currentClientId: FREE_CLIENT });
    expect(read()).toBe('free|false');
  });

  it('picks the row by client id, not by position', () => {
    // The switcher sorts productive environments first, so trusting index 0 would report
    // every account that owns one paid tenant as productive in ALL of its tenants.
    setEnv({ environments: ENVIRONMENTS, currentClientId: FREE_CLIENT });
    expect(read()).toBe('free|false');
  });

  it('treats a missing plan field as free', () => {
    // An older backend that predates ETP-4686 omits `plan` entirely. Absent-on-the-row is a
    // different thing from absent-because-we-could-not-ask, and it means "not paid".
    setEnv({ environments: [{ clientId: FREE_CLIENT }], currentClientId: FREE_CLIENT });
    expect(read()).toBe('free|false');
  });

  it('normalizes case and padding the way the switcher badge does', () => {
    // Same predicate as the "Productivo" badge, so the two can never disagree.
    setEnv({
      environments: [{ clientId: PRODUCTIVE_CLIENT, plan: '  PRODUCTIVE ' }],
      currentClientId: PRODUCTIVE_CLIENT,
    });
    expect(read()).toBe('productive|false');
  });

  describe('when it cannot know', () => {
    it('answers null while the environment list is still loading', () => {
      setEnv({ loading: true });
      expect(read()).toBe('null|true');
    });

    it('answers null, not free, once loading ends with no list', () => {
      // A session with no platform token, or a request that threw. `isProductivePlan(null)`
      // is true, so the checklist shows everything rather than silently stripping the two
      // productive-only steps from a tenant that paid for them.
      expect(read()).toBe('null|false');
    });

    it('answers null when the current client matches no row', () => {
      setEnv({ environments: ENVIRONMENTS, currentClientId: 'CLIENT-GONE' });
      expect(read()).toBe('null|false');
    });

    it('answers null when there is no current client id at all', () => {
      setEnv({ environments: ENVIRONMENTS });
      expect(read()).toBe('null|false');
    });

    it('does not read a stale list while a fresh load is in flight', () => {
      // `loading` wins over whatever the previous render left in `environments` — otherwise
      // switching tenants would briefly report the plan of the one just left.
      setEnv({ environments: ENVIRONMENTS, currentClientId: PRODUCTIVE_CLIENT, loading: true });
      expect(read()).toBe('null|true');
    });

    it('tolerates a non-array environment list', () => {
      setEnv({ environments: null, currentClientId: FREE_CLIENT });
      expect(read()).toBe('null|false');
    });
  });
});
