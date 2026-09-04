/**
 * i18n coverage for the shipped walkthroughs (ETP-5144).
 *
 * Flow JSON stores KEYS, never sentences. `resolveStepText` guarantees a client
 * never SEES a raw key on screen (it falls back to a translated generic
 * sentence); this file is the other half of that guarantee — it makes a test
 * FAIL when a key is missing from a shipped locale, so the fallback is a safety
 * net rather than the thing users actually read.
 *
 * `findMissingFlowLabelKeys` was written for exactly this and had no caller
 * until now, which is the reason a locale gap could have shipped silently.
 *
 * es_AR is not optional here: it was added after the flows were authored, and a
 * key present in es_ES but absent in es_AR is precisely the omission this
 * catches.
 *
 * vitest, not `node --test`: the helpers come from
 * `@etendosoftware/app-shell-core/walkthrough`, which only Vite's resolver maps.
 */
import { findMissingFlowLabelKeys, normalizeFlows } from '@etendosoftware/app-shell-core/walkthrough';

import { WALKTHROUGH_FLOWS } from '../flows/index.js';
import en_US from '@/locales/en_US.json';
import es_ES from '@/locales/es_ES.json';
import es_AR from '@/locales/es_AR.json';

const LOCALES = { en_US, es_ES, es_AR };

/**
 * Keys the launcher and the overlay hardcode. They are NOT in flow data, so
 * `collectFlowLabelKeys` cannot see them — yet a missing one renders an empty
 * badge or an untranslated button.
 */
const STATIC_UI_KEYS = [
  'walkthroughLauncherTooltip',
  'walkthroughLauncherHeading',
  'walkthroughPendingHint',
  'walkthroughBadgeNew',
  'walkthroughBadgeUpdated',
  'walkthroughBadgeInProgress',
  'walkthroughBadgeCompleted',
  'walkthroughTitle',
  'walkthroughClose',
  'walkthroughNext',
  'walkthroughPrevious',
  'walkthroughExit',
  'walkthroughFinish',
  'walkthroughRetry',
  'walkthroughSkipStep',
  'walkthroughStepCounter',
  'walkthroughMissingText',
];

const { flows, errors } = normalizeFlows(WALKTHROUGH_FLOWS);

it('ships only flows the engine accepts', () => {
  // A malformed flow is DROPPED by `normalizeFlows`, so without this the
  // coverage assertions below would silently pass over a flow nobody can run.
  expect(errors).toEqual([]);
  expect(flows).toHaveLength(WALKTHROUGH_FLOWS.length);
});

describe.each(Object.keys(LOCALES))('%s', (localeName) => {
  const dictionary = LOCALES[localeName];

  it('translates every key the flows reference', () => {
    const missing = findMissingFlowLabelKeys(flows, dictionary);

    // Named in the message so a failure says WHICH key in WHICH flow, instead
    // of just a count.
    expect(missing.map((entry) => `${entry.flowId}: ${entry.key}`)).toEqual([]);
  });

  it('translates every key the launcher and overlay hardcode', () => {
    const missing = STATIC_UI_KEYS.filter(
      (key) => !Object.prototype.hasOwnProperty.call(dictionary.genericLabels ?? {}, key),
    );

    expect(missing).toEqual([]);
  });

  it('has no blank translation for a walkthrough key', () => {
    // An empty string passes a presence check and renders as nothing —
    // indistinguishable from a broken step at runtime.
    const blank = Object.entries(dictionary.genericLabels ?? {})
      .filter(([key, value]) => key.startsWith('walkthrough') && String(value).trim() === '')
      .map(([key]) => key);

    expect(blank).toEqual([]);
  });
});

it('keeps the three locales in agreement about which walkthrough keys exist', () => {
  // A key added to en_US and forgotten in es_AR is the failure mode; comparing
  // the sets catches it in whichever direction it happens.
  const keysOf = (dictionary) => Object.keys(dictionary.genericLabels ?? {})
    .filter((key) => key.startsWith('walkthrough'))
    .sort();

  const reference = keysOf(en_US);
  expect(keysOf(es_ES)).toEqual(reference);
  expect(keysOf(es_AR)).toEqual(reference);
});
