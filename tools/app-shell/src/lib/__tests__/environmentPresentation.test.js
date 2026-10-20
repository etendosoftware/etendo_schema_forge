// @covers tools/app-shell/src/lib/environmentPresentation.js
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canReactivateSubscription,
  environmentPlanLabelKey,
  environmentCommercialLabel,
  environmentRelationshipLabel,
  environmentTrialLabel,
  isCanceledSubscription,
  isProductiveEnvironment,
  isPurchaseSourceDemo,
  sortEnvironments,
} from '../environmentPresentation.js';

test('recognizes productive and demo environment plans', () => {
  assert.equal(isProductiveEnvironment({ plan: 'productive' }), true);
  assert.equal(isProductiveEnvironment({ plan: 'free' }), false);
  assert.equal(environmentPlanLabelKey({ plan: 'productive' }), 'environmentProductive');
  assert.equal(environmentPlanLabelKey({ plan: 'free' }), 'environmentDemo');
});

test('shows subscription and membership state from backend metadata', () => {
  const ui = (key) => key;
  assert.equal(environmentCommercialLabel({ plan: 'free', subscriptionStatus: 'CURRENT' }, ui),
    'environmentIncludedWithSubscription');
  assert.equal(environmentCommercialLabel({ plan: 'productive', subscriptionStatus: 'CURRENT' }, ui),
    null);
  assert.equal(environmentCommercialLabel({ accessState: 'SUBSCRIPTION_REQUIRED' }, ui),
    'environmentAccessSuspended');
  assert.equal(environmentCommercialLabel({ subscriptionStatus: 'PAST_DUE' }, ui),
    'environmentPaymentGrace');
  assert.equal(environmentRelationshipLabel({ relationship: 'OWNER' }, ui), 'environmentOwner');
  assert.equal(environmentRelationshipLabel({ relationship: 'INVITED' }, ui), 'environmentInvited');
});

test('sorts productive environments before demos and keeps names deterministic', () => {
  const sorted = sortEnvironments([
    { clientId: 'demo-b', clientName: 'Beta Demo', plan: 'free' },
    { clientId: 'prod-z', clientName: 'Zulu Productive', plan: 'productive' },
    { clientId: 'prod-a', clientName: 'Acme Productive', plan: 'productive' },
  ]);

  assert.deepEqual(sorted.map(({ clientId }) => clientId), ['prod-a', 'prod-z', 'demo-b']);
});

test('shows trial status only when backend lifecycle metadata is present', () => {
  const ui = (key, params) => key === 'environmentTrialDaysRemaining'
    ? `${params.days} days left`
    : key;

  assert.equal(environmentTrialLabel({ plan: 'free' }, ui), null);
  assert.equal(environmentTrialLabel({ plan: 'free', trialDaysRemaining: 3 }, ui), '3 days left');
  assert.equal(environmentTrialLabel({ plan: 'free', trialDaysRemaining: 0 }, ui), 'environmentDemoExpired');
  assert.equal(environmentTrialLabel({ plan: 'productive', trialDaysRemaining: 3 }, ui), null);
});

test('a demo that already originated a productive environment is not a purchase source', () => {
  assert.equal(isPurchaseSourceDemo({ plan: 'free' }), true);
  assert.equal(isPurchaseSourceDemo({ plan: 'free', associatedWithProductive: false }), true);
  assert.equal(isPurchaseSourceDemo({ plan: 'free', associatedWithProductive: true }), false);
  assert.equal(isPurchaseSourceDemo({ plan: 'productive' }), false);
  assert.equal(isPurchaseSourceDemo(undefined), false);
});

// ETP-5047 — a canceled subscription makes the backend report plan "free" while the environment
// stays productive (environmentType "PRODUCTIVE", subscriptionStatus "EXPIRED"). It is not a demo.
const canceledProductive = {
  plan: 'free',
  environmentType: 'PRODUCTIVE',
  subscriptionStatus: 'EXPIRED',
  accessState: 'SUBSCRIPTION_REQUIRED',
  associatedWithProductive: false,
};

test('a canceled productive environment is not a purchase source although its plan reads free', () => {
  assert.equal(isPurchaseSourceDemo(canceledProductive), false);
  // A demo, or a legacy environment the backend reports no type for, stays a source.
  assert.equal(isPurchaseSourceDemo({ plan: 'free', environmentType: 'DEMO' }), true);
  assert.equal(isPurchaseSourceDemo({ plan: 'free', environmentType: null }), true);
});

test('a canceled productive environment is badged productive, not demo', () => {
  assert.equal(environmentPlanLabelKey(canceledProductive), 'environmentProductive');
  assert.equal(environmentPlanLabelKey({ plan: 'free', environmentType: 'DEMO' }), 'environmentDemo');
});

// The lifecycle type is compared trimmed and case-insensitively: a lower-case or padded
// "PRODUCTIVE" is still productive. A missing or empty type is not (a legacy environment).
test('normalizes the lifecycle type before treating a free-plan environment as productive', () => {
  for (const environmentType of ['productive', ' PRODUCTIVE ', 'Productive']) {
    const environment = { plan: 'free', environmentType };
    assert.equal(isPurchaseSourceDemo(environment), false, `type ${JSON.stringify(environmentType)}`);
    assert.equal(environmentPlanLabelKey(environment), 'environmentProductive',
      `type ${JSON.stringify(environmentType)}`);
  }
  for (const environment of [{ plan: 'free' }, { plan: 'free', environmentType: '' },
    { plan: 'free', environmentType: '   ' }]) {
    assert.equal(isPurchaseSourceDemo(environment), true, JSON.stringify(environment));
    assert.equal(environmentPlanLabelKey(environment), 'environmentDemo', JSON.stringify(environment));
  }
});

test('a canceled productive environment that is also marked as associated stays out and productive', () => {
  const associated = { ...canceledProductive, associatedWithProductive: true };
  assert.equal(isPurchaseSourceDemo(associated), false);
  assert.equal(environmentPlanLabelKey(associated), 'environmentProductive');
  // The plan-based predicate is deliberately unchanged: a canceled productive reads as not paying.
  assert.equal(isProductiveEnvironment(associated), false);
});

// ETP-5742 — only a CANCELED subscription is re-subscribed; an unpaid one (PAST_DUE) is fixed in
// the payment portal. The plan is not asked: it reads "free" behind a closed subscription row and
// "productive" behind the older preference projection.
test('a canceled productive environment is a canceled subscription whatever its plan reads', () => {
  assert.equal(isCanceledSubscription(canceledProductive), true);
  assert.equal(isCanceledSubscription({ ...canceledProductive, plan: 'productive' }), true);
  assert.equal(isCanceledSubscription({ plan: 'productive', subscriptionStatus: 'EXPIRED' }), true);
  for (const environment of [
    { ...canceledProductive, subscriptionStatus: 'PAST_DUE' },
    { ...canceledProductive, subscriptionStatus: 'CURRENT' },
    { plan: 'free', environmentType: 'DEMO', subscriptionStatus: 'EXPIRED' },
    { plan: 'free', subscriptionStatus: 'EXPIRED' },
    undefined,
  ]) {
    assert.equal(isCanceledSubscription(environment), false, JSON.stringify(environment));
  }
});

test('only the owner may re-subscribe a canceled environment', () => {
  assert.equal(canReactivateSubscription({ ...canceledProductive, ownedByAccount: true }), true);
  assert.equal(canReactivateSubscription({ ...canceledProductive, ownedByAccount: false }), false);
  // A backend that predates the field omits it; the button is not offered on a guess.
  assert.equal(canReactivateSubscription(canceledProductive), false);
  assert.equal(canReactivateSubscription(
    { ...canceledProductive, subscriptionStatus: 'PAST_DUE', ownedByAccount: true }), false);
});

test('a demo the account was only invited into is not a purchase source', () => {
  assert.equal(isPurchaseSourceDemo({ plan: 'free', ownedByAccount: true }), true);
  assert.equal(isPurchaseSourceDemo({ plan: 'free', ownedByAccount: false }), false);
  // A backend that predates the field omits it; the demo keeps being offered.
  assert.equal(isPurchaseSourceDemo({ plan: 'free' }), true);
});
