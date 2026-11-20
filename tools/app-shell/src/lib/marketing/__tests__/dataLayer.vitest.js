import { beforeEach, describe, expect, it } from 'vitest';
import {
  FIRST_KEY_ACTION_MAX_AGE_MS,
  pushFirstKeyAction,
  pushLogout,
  pushOnboardingEvent,
  pushPurchase,
  pushUserIdentified,
  resetDataLayerStateForTests,
} from '../dataLayer.js';

/**
 * ETP-6363 — marketing's events in GTM's dataLayer: only where GTM is loaded, nothing personal,
 * once each.
 *
 * @covers tools/app-shell/src/lib/marketing/dataLayer.js
 */
const ACCOUNT_ID = '0123456789ABCDEF0123456789ABCDEF';

function gtmWindow() {
  return { __etendoGtmInstalled: 'GTM-TEST1', dataLayer: [] };
}

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
  };
}

const events = win => win.dataLayer.filter(message => message.event);

beforeEach(() => resetDataLayerStateForTests());

describe('where GTM is not loaded', () => {
  it('pushes nothing at all', () => {
    const win = { dataLayer: [] };
    pushOnboardingEvent('onboarding_auth_succeeded', { action: 'register', accountId: ACCOUNT_ID }, win);
    pushLogout(win);
    expect(win.dataLayer).toEqual([]);
  });
});

describe('sign-up and login', () => {
  it('reports a registration as a sign-up by email and identifies the account', () => {
    const win = gtmWindow();
    pushOnboardingEvent('onboarding_auth_succeeded', { action: 'register', accountId: ACCOUNT_ID }, win);
    expect(events(win)).toEqual([
      { event: 'sign_up', method: 'email' },
      { event: 'user_identified', user_id: ACCOUNT_ID },
    ]);
  });

  it('tells a Google sign-up from a Google login by whether the sign-in created the account', () => {
    const win = gtmWindow();
    pushOnboardingEvent('onboarding_auth_succeeded', { action: 'sso', provider: 'google', accountCreated: true }, win);
    pushOnboardingEvent('onboarding_auth_succeeded', { action: 'sso', provider: 'google', accountCreated: false }, win);
    pushOnboardingEvent('onboarding_auth_succeeded', { action: 'login' }, win);
    expect(events(win)).toEqual([
      { event: 'sign_up', method: 'google' },
      { event: 'login', method: 'google' },
      { event: 'login', method: 'email' },
    ]);
  });

  it('identifies an account once per page load, never by its address, and forgets it at logout', () => {
    const win = gtmWindow();
    pushUserIdentified(ACCOUNT_ID, win);
    pushUserIdentified(ACCOUNT_ID, win);
    pushUserIdentified('ana@empresa.es', win);
    pushLogout(win);
    pushUserIdentified(ACCOUNT_ID, win);
    expect(events(win)).toEqual([
      { event: 'user_identified', user_id: ACCOUNT_ID },
      { event: 'logout', user_id: null },
      { event: 'user_identified', user_id: ACCOUNT_ID },
    ]);
  });
});

describe('onboarding', () => {
  it('reports each step once, by its fixed name and number, and the end of the onboarding', () => {
    const win = gtmWindow();
    pushOnboardingEvent('onboarding_setup_step_completed', { type: 'profile' }, win);
    pushOnboardingEvent('onboarding_setup_step_completed', { type: 'profile' }, win);
    pushOnboardingEvent('onboarding_setup_step_completed', { type: 'company' }, win);
    pushOnboardingEvent('onboarding_setup_step_completed', { type: 'unknown' }, win);
    pushOnboardingEvent('onboarding_run_succeeded', {}, win);
    pushOnboardingEvent('onboarding_run_failed', {}, win);
    expect(events(win)).toEqual([
      { event: 'onboarding_step', step_number: 1, step_name: 'profile' },
      { event: 'onboarding_step', step_number: 2, step_name: 'company' },
      { event: 'onboarding_complete' },
    ]);
  });
});

describe('purchase', () => {
  it('reports a confirmed purchase once, with its plan, after clearing the previous ecommerce', () => {
    const win = gtmWindow();
    const storage = memoryStorage();
    const purchase = { transactionId: 'req-1', planKey: 'pro', planName: 'Pro', value: 45, currency: 'eur' };

    expect(pushPurchase(purchase, { win, storage })).toBe(true);
    expect(pushPurchase(purchase, { win, storage })).toBe(false);

    expect(win.dataLayer).toEqual([
      { ecommerce: null },
      {
        event: 'purchase',
        ecommerce: {
          transaction_id: 'req-1',
          value: 45,
          currency: 'EUR',
          items: [{ item_id: 'pro', item_name: 'Pro' }],
        },
      },
    ]);
  });

  it('still reports a purchase whose plan this browser does not know', () => {
    const win = gtmWindow();
    pushPurchase({ transactionId: 'req-2' }, { win, storage: memoryStorage() });
    expect(events(win)).toEqual([{ event: 'purchase', ecommerce: { transaction_id: 'req-2' } }]);
  });

  it('reports nothing without a transaction', () => {
    const win = gtmWindow();
    expect(pushPurchase({}, { win, storage: memoryStorage() })).toBe(false);
    expect(win.dataLayer).toEqual([]);
  });
});

describe('first key action', () => {
  const NOW = Date.parse('2026-11-20T12:00:00Z');
  const RECENT = { action: 'product', at: '2026-11-19T09:30:00Z' };

  it('reports the first milestone once per account, by its name only', () => {
    const win = gtmWindow();
    const storage = memoryStorage();

    expect(pushFirstKeyAction(ACCOUNT_ID, RECENT, { win, storage, now: NOW })).toBe(true);
    expect(pushFirstKeyAction(ACCOUNT_ID, { action: 'invoice', at: RECENT.at }, { win, storage, now: NOW })).toBe(false);

    expect(win.dataLayer).toEqual([{ event: 'first_key_action', action_name: 'product' }]);
  });

  it('reports nothing without a known milestone, a date, an account or GTM', () => {
    const storage = memoryStorage();
    const win = gtmWindow();
    expect(pushFirstKeyAction(ACCOUNT_ID, undefined, { win, storage, now: NOW })).toBe(false);
    expect(pushFirstKeyAction(ACCOUNT_ID, { action: 'ana@empresa.es', at: RECENT.at }, { win, storage, now: NOW })).toBe(false);
    expect(pushFirstKeyAction(ACCOUNT_ID, { action: 'product' }, { win, storage, now: NOW })).toBe(false);
    expect(pushFirstKeyAction('', RECENT, { win, storage, now: NOW })).toBe(false);
    expect(win.dataLayer).toEqual([]);

    const noGtm = { dataLayer: [] };
    expect(pushFirstKeyAction(ACCOUNT_ID, RECENT, { win: noGtm, storage, now: NOW })).toBe(false);
    expect(noGtm.dataLayer).toEqual([]);
  });

  it('does not report a milestone reached long before, as on the day this shipped', () => {
    const win = gtmWindow();
    const old = { action: 'order', at: new Date(NOW - FIRST_KEY_ACTION_MAX_AGE_MS - 1).toISOString() };
    expect(pushFirstKeyAction(ACCOUNT_ID, old, { win, storage: memoryStorage(), now: NOW })).toBe(false);
    expect(win.dataLayer).toEqual([]);
  });
});
