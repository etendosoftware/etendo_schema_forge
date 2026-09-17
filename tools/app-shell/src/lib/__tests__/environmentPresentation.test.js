import assert from 'node:assert/strict';
import test from 'node:test';
import {
  environmentPlanLabelKey,
  environmentCommercialLabel,
  environmentRelationshipLabel,
  environmentTrialLabel,
  isProductiveEnvironment,
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
    'environmentSubscriptionActive');
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
