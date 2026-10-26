// @covers tools/app-shell/src/lib/environmentPresentation.js
// @covers tools/app-shell/src/locales/en_US.json
// @covers tools/app-shell/src/locales/es_ES.json
// @covers tools/app-shell/src/locales/es_AR.json
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  BILLING_WARNING_ESCALATION_DAYS,
  canReactivateSubscription,
  demoTrialStatus,
  environmentTrialDaysKey,
  environmentPlanLabelKey,
  environmentCommercialLabel,
  environmentRelationshipLabel,
  environmentTrialLabel,
  isCanceledSubscription,
  isProductiveEnvironment,
  isPurchaseSourceDemo,
  paymentGraceWarning,
  paymentGraceWarningDismissKey,
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

// ---------------------------------------------------------------------------------------------
// Failed renewal payment during the grace period (paymentGraceWarning)
// ---------------------------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-11-01T12:00:00.000Z');
/** A PAST_DUE environment whose grace ends `ms` after NOW. */
function pastDue(ms, extra = {}) {
  return {
    clientId: 'CLIENT-1',
    subscriptionStatus: 'PAST_DUE',
    graceEndsAt: new Date(NOW.getTime() + ms).toISOString(),
    ...extra,
  };
}

test('the escalation window is the last 3 days', () => {
  assert.equal(BILLING_WARNING_ESCALATION_DAYS, 3);
});

test('no payment warning unless the subscription is PAST_DUE', () => {
  for (const subscriptionStatus of ['CURRENT', 'EXPIRED', undefined, 'past_due']) {
    assert.equal(paymentGraceWarning(pastDue(5 * DAY_MS, { subscriptionStatus }), NOW), null,
      String(subscriptionStatus));
  }
  assert.equal(paymentGraceWarning(undefined, NOW), null);
  assert.equal(paymentGraceWarning(null, NOW), null);
});

test('no payment warning when graceEndsAt is missing or not a date', () => {
  for (const graceEndsAt of [undefined, null, '', 'not-a-date']) {
    assert.equal(paymentGraceWarning(pastDue(0, { graceEndsAt }), NOW), null, JSON.stringify(graceEndsAt));
  }
});

test('no payment warning once graceEndsAt has passed, or is exactly now', () => {
  assert.equal(paymentGraceWarning(pastDue(-1), NOW), null);
  assert.equal(paymentGraceWarning(pastDue(-10 * DAY_MS), NOW), null);
  // The 402 gate takes over at the instant itself: nothing is left of the grace to warn about.
  assert.equal(paymentGraceWarning(pastDue(0), NOW), null);
});

test('the warning carries the grace end as a Date instant', () => {
  const env = pastDue(10 * DAY_MS);
  const warning = paymentGraceWarning(env, NOW);
  assert.ok(warning.graceEndsAt instanceof Date);
  assert.equal(warning.graceEndsAt.toISOString(), env.graceEndsAt);
});

test('exactly 3 days left is escalated, 3 days and 1 ms is not', () => {
  assert.equal(paymentGraceWarning(pastDue(3 * DAY_MS), NOW).escalated, true);
  assert.equal(paymentGraceWarning(pastDue(3 * DAY_MS + 1), NOW).escalated, false);
  assert.equal(paymentGraceWarning(pastDue(1), NOW).escalated, true);
  assert.equal(paymentGraceWarning(pastDue(20 * DAY_MS), NOW).escalated, false);
});

test('only an explicit ownedByAccount: true can pay', () => {
  assert.equal(paymentGraceWarning(pastDue(5 * DAY_MS, { ownedByAccount: true }), NOW).canPay, true);
  assert.equal(paymentGraceWarning(pastDue(5 * DAY_MS, { ownedByAccount: false }), NOW).canPay, false);
  // A backend that predates the field omits it: the member copy, never a CTA on a guess.
  assert.equal(paymentGraceWarning(pastDue(5 * DAY_MS), NOW).canPay, false);
  assert.equal(paymentGraceWarning(pastDue(5 * DAY_MS, { ownedByAccount: 'true' }), NOW).canPay, false);
});

test('the dismissal key differs per client and per grace window', () => {
  const key = paymentGraceWarningDismissKey('CLIENT-1', '2026-11-10T00:00:00.000Z');
  assert.notEqual(key, paymentGraceWarningDismissKey('CLIENT-2', '2026-11-10T00:00:00.000Z'));
  assert.notEqual(key, paymentGraceWarningDismissKey('CLIENT-1', '2026-12-10T00:00:00.000Z'));
  assert.equal(key, paymentGraceWarningDismissKey('CLIENT-1', '2026-11-10T00:00:00.000Z'));
  // Missing parts do not render "undefined"/"null" into the key.
  assert.doesNotMatch(paymentGraceWarningDismissKey(undefined, null), /undefined|null/);
});

// ---------------------------------------------------------------------------------------------
// Demo trial state (demoTrialStatus, environmentTrialDaysKey, environmentTrialLabel)
// ---------------------------------------------------------------------------------------------

test('demoTrialStatus is null without a demo trial to show', () => {
  assert.equal(demoTrialStatus(undefined), null);
  assert.equal(demoTrialStatus(null), null);
  assert.equal(demoTrialStatus({ plan: 'free' }), null);
  assert.equal(demoTrialStatus({ plan: 'productive', trialDaysRemaining: 2 }), null);
  // Only an integer count is lifecycle metadata; anything else is not guessed at.
  for (const trialDaysRemaining of [null, '3', 2.5, Number.NaN]) {
    assert.equal(demoTrialStatus({ plan: 'free', trialDaysRemaining }), null, String(trialDaysRemaining));
  }
});

test('demoTrialStatus escalates in the last 3 days and expires at 0 or below', () => {
  const status = (days) => demoTrialStatus({ plan: 'free', trialDaysRemaining: days });
  assert.deepEqual(status(4), { daysRemaining: 4, expired: false, escalated: false });
  assert.deepEqual(status(3), { daysRemaining: 3, expired: false, escalated: true });
  assert.deepEqual(status(1), { daysRemaining: 1, expired: false, escalated: true });
  // Expired is its own state, not an escalated active trial.
  assert.deepEqual(status(0), { daysRemaining: 0, expired: true, escalated: false });
  assert.deepEqual(status(-2), { daysRemaining: -2, expired: true, escalated: false });
});

test('environmentTrialDaysKey is singular only for exactly one day', () => {
  assert.equal(environmentTrialDaysKey(1), 'environmentTrialDaysRemainingOne');
  for (const days of [0, 2, 3, 14]) {
    assert.equal(environmentTrialDaysKey(days), 'environmentTrialDaysRemaining', String(days));
  }
});

test('environmentTrialLabel uses the singular with one day left', () => {
  const calls = [];
  const ui = (key, params) => {
    calls.push([key, params]);
    return key;
  };
  assert.equal(environmentTrialLabel({ plan: 'free', trialDaysRemaining: 1 }, ui),
    'environmentTrialDaysRemainingOne');
  assert.deepEqual(calls.at(-1), ['environmentTrialDaysRemainingOne', { days: 1 }]);
  assert.equal(environmentTrialLabel({ plan: 'free', trialDaysRemaining: 2 }, ui),
    'environmentTrialDaysRemaining');
});

test('the singular trial label ships in every locale and never reads "1 days"', () => {
  for (const name of ['en_US', 'es_ES', 'es_AR']) {
    const dict = JSON.parse(readFileSync(new URL(`../../locales/${name}.json`, import.meta.url), 'utf8'));
    const one = dict.genericLabels?.environmentTrialDaysRemainingOne;
    assert.equal(typeof one, 'string', name);
    assert.match(one, /\b1\b/, name);
    assert.doesNotMatch(one, /\b1 days\b|\b1 días\b/, name);
  }
});
