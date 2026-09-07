/**
 * Contract of the walkthrough Mixpanel reporting (ETP-5144) — the HOST half.
 *
 * What is asserted here is only what this app owns: turning the core's plain
 * descriptors into events in THIS catalog, and the vocabulary those events are
 * allowed to speak. Deciding a run's outcome, its duration and its revision
 * lives in `app-shell-core`'s `recordFlowFinish` and is pinned by
 * `src/walkthrough/__tests__/walkthroughProgress.test.js` over there; the
 * launcher's own counting is pinned by `WalkthroughLauncher.vitest.jsx`.
 *
 * The trap this file exists for (documented in `docs/walkthrough-flows.md`
 * §11): `lib/observability/payload.js` lists `step` in
 * `NUMERIC_EVENT_PROPERTY_KEYS`, so a step *id* string handed to `step` is
 * DROPPED at sanitization with no error anywhere. That is exactly why the index
 * travels as `step` and the authored id as `stepId`. Swap them back and the
 * drop-off report silently loses its only "where did the tour lose people"
 * datum — so every payload here is asserted AFTER `buildObservabilityEvent`,
 * i.e. as Mixpanel would actually receive it.
 *
 * vitest, not `node --test`: the module under test now imports
 * `@etendosoftware/app-shell-core/walkthrough`, and only Vite's resolver maps
 * that (to local source under LOCAL_CORE, to the package otherwise) — the same
 * reason `components/layout/TopBar/__tests__/TopBar.vitest.jsx` is a vitest file.
 */
import assert from 'node:assert/strict';

/** Where `track()` calls land. Importing the real barrel would boot Mixpanel. */
const trackCalls = [];
vi.mock('@/lib/observability.js', () => ({
  track: (name, properties) => { trackCalls.push({ name, properties }); },
}));

import {
  handleWalkthroughFinish,
  trackWalkthroughFinished,
  trackWalkthroughMenuOpened,
  trackWalkthroughStarted,
} from '../walkthrough-events.js';
import { OBSERVABILITY_EVENTS, buildObservabilityEvent } from '@/lib/observability/events.js';

const FLOWS = [
  { id: 'create-contact', revision: 1 },
  { id: 'create-product', revision: 2 },
];

/** Every `track()` call recorded for `name`, newest last. */
const calls = (name) => trackCalls.filter((call) => call.name === name);

/** The single call for `name`, asserting there was exactly one. */
function onlyCall(name) {
  const matching = calls(name);
  assert.equal(matching.length, 1, `expected exactly one ${name} event, got ${matching.length}`);
  return matching[0];
}

/** Lets the fire-and-forget `Promise.resolve(track(...))` chain settle. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  trackCalls.length = 0;
  window.localStorage.clear();
  window.localStorage.setItem('sf_auth_user', 'valentin');
});

describe('the descriptors the core hands over', () => {
  it('names the menu-open event and passes its counts through untouched', async () => {
    trackWalkthroughMenuOpened({ count: 2, total: 3 });
    await flush();

    assert.deepEqual(onlyCall('walkthrough_menu_opened').properties, { count: 2, total: 3 });
  });

  it('names the start event and keeps the PRE-run status the core read', async () => {
    trackWalkthroughStarted({
      flowId: 'create-contact', status: 'in-progress', total: 15, source: 'launcher',
    });
    await flush();

    assert.deepEqual(onlyCall('walkthrough_started').properties, {
      flowId: 'create-contact', status: 'in-progress', total: 15, source: 'launcher',
    });
  });

  it('renames the finish descriptor onto this app\'s numeric-only vocabulary', async () => {
    // The core speaks `stepIndex`/`totalSteps`; the allowlist here speaks
    // `step`/`total`. Getting this mapping wrong drops both silently.
    trackWalkthroughFinished({
      flowId: 'create-contact',
      status: 'abandoned',
      stepId: 'address-city',
      stepIndex: 12,
      totalSteps: 15,
      durationMs: 4200,
    });
    await flush();

    assert.deepEqual(onlyCall('walkthrough_finished').properties, {
      flowId: 'create-contact',
      status: 'abandoned',
      stepId: 'address-city',
      step: 12,
      total: 15,
      durationMs: 4200,
    });
  });
});

describe('handleWalkthroughFinish — the engine seam', () => {
  it('reports a completed run end to end, from the engine payload', async () => {
    handleWalkthroughFinish(
      { flowId: 'create-product', completed: true, stepId: 'price-set', stepIndex: 10, totalSteps: 11 },
      FLOWS,
    );
    await flush();

    const { properties } = onlyCall('walkthrough_finished');
    assert.equal(properties.status, 'completed');
    assert.equal(properties.flowId, 'create-product');
    assert.equal(properties.step, 10);
    assert.equal(properties.stepId, 'price-set');
    assert.equal(properties.total, 11);
  });

  it('reports an abandoned run with the step it walked away from', async () => {
    handleWalkthroughFinish(
      { flowId: 'create-contact', completed: false, stepId: 'address-city', stepIndex: 12, totalSteps: 15 },
      FLOWS,
    );
    await flush();

    const { properties } = onlyCall('walkthrough_finished');
    assert.equal(properties.status, 'abandoned');
    assert.equal(properties.stepId, 'address-city');
  });

  it('reports nothing when the engine payload carries no flow id', async () => {
    handleWalkthroughFinish(undefined, FLOWS);
    handleWalkthroughFinish({ completed: true }, FLOWS);
    await flush();

    assert.equal(calls('walkthrough_finished').length, 0);
  });
});

describe('payload sanitization — the vocabulary the events must speak', () => {
  it('keeps flowId and stepId, which were added to the safe key list for this feature', () => {
    const { properties } = buildObservabilityEvent(OBSERVABILITY_EVENTS.WALKTHROUGH_FINISHED, {
      flowId: 'create-contact',
      stepId: 'address-city',
      status: 'abandoned',
      step: 12,
      total: 15,
      durationMs: 4200,
    });

    assert.deepEqual(properties, {
      flowId: 'create-contact',
      stepId: 'address-city',
      status: 'abandoned',
      step: 12,
      total: 15,
      durationMs: 4200,
    });
  });

  it('DROPS a step id passed as `step` — `step` is numeric-only', () => {
    const { properties } = buildObservabilityEvent(OBSERVABILITY_EVENTS.WALKTHROUGH_FINISHED, {
      flowId: 'create-contact',
      step: 'address-city',
    });

    assert.equal('step' in properties, false);
    assert.equal(properties.flowId, 'create-contact');
  });

  it('drops a property the event never declared', () => {
    const { properties } = buildObservabilityEvent(OBSERVABILITY_EVENTS.WALKTHROUGH_STARTED, {
      flowId: 'create-contact',
      // Neither declared on the event nor on the safe list: a leak of business
      // data through a walkthrough event must be impossible by construction.
      documentNo: 'SO-0001',
      windowName: 'sales-order',
    });

    assert.equal('documentNo' in properties, false);
    assert.equal('windowName' in properties, false);
    assert.equal(properties.flowId, 'create-contact');
  });

  it('names the three events the launcher and the engine emit', () => {
    assert.equal(OBSERVABILITY_EVENTS.WALKTHROUGH_MENU_OPENED.name, 'walkthrough_menu_opened');
    assert.equal(OBSERVABILITY_EVENTS.WALKTHROUGH_STARTED.name, 'walkthrough_started');
    assert.equal(OBSERVABILITY_EVENTS.WALKTHROUGH_FINISHED.name, 'walkthrough_finished');
  });
});
