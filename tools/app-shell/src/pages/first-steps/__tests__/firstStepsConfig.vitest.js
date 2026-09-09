/**
 * ETP-5190 — the step catalogue's derived contract.
 *
 * `firstStepsConfig.js` is a pure module, but it lives under `src/pages/`, which the
 * `npm run test` node-runner glob does NOT cover (that script enumerates only
 * `src/lib`, `src/hooks`, `src/windows` and `src/locales`). A `*.test.js` here would
 * match no script and silently never run, so this suite is a `*.vitest.js` — picked up
 * by `vitest.config.js`'s `src/**\/*.vitest.{js,jsx}` include.
 */
import {
  FIRST_STEPS,
  PLAN_PRODUCTIVE,
  areAllStepsDone,
  countCompletedSteps,
  findExpandedStepId,
  firstStepsTotal,
  isProductivePlan,
  isStepDone,
  toggleableStepIds,
  visibleFirstSteps,
} from '../firstStepsConfig.js';

const ALL_TOGGLEABLE = ['company-data', 'fiscal-config', 'products', 'contacts',
  'invoice-sequence', 'team'];
/** What a free/trial tenant can tick: the same list minus the two `productiveOnly` steps. */
const TRIAL_TOGGLEABLE = ['company-data', 'products', 'contacts', 'team'];
const FREE = 'free';

/**
 * Every plan-aware helper takes the plan LAST and defaults to productive when it is absent, so
 * the calls below that pass no plan are asserting the full 7-step behaviour on purpose — that
 * default is the documented fail-open direction, not an oversight.
 */

describe('firstStepsConfig — catalogue shape', () => {
  it('exposes seven steps, in the order the page renders them', () => {
    // Numbering the user sees: 1 create-account (always done), 2 company-data,
    // 3 fiscal-config, 4 products, 5 contacts, 6 invoice-sequence, 7 team. Invoice
    // numbering sits AFTER the data loading and BEFORE the team invitations on purpose —
    // a tenant picks its invoice series once its products and contacts are in, and the
    // invitations are the last thing it does.
    expect(FIRST_STEPS.map((step) => step.id)).toEqual([
      'create-account',
      'company-data',
      'fiscal-config',
      'products',
      'contacts',
      'invoice-sequence',
      'team',
    ]);
  });

  it('derives the total from the array rather than hardcoding it', () => {
    expect(firstStepsTotal(PLAN_PRODUCTIVE)).toBe(7);
    expect(firstStepsTotal(PLAN_PRODUCTIVE)).toBe(FIRST_STEPS.length);
    expect(firstStepsTotal(FREE)).toBe(5);
  });

  it('gives every step the full descriptor the page reads', () => {
    for (const step of FIRST_STEPS) {
      expect(typeof step.id).toBe('string');
      expect(typeof step.iconName).toBe('string');
      expect(typeof step.titleKey).toBe('string');
      // `descKey`/`minutes`/`to`/`action` are nullable by design (always-done rows have none).
      expect(['string', 'object']).toContain(typeof step.descKey); // string | null
      expect(typeof step.alwaysDone).toBe('boolean');
      expect(typeof step.productiveOnly).toBe('boolean');
    }
  });

  it('gives every toggleable step a description, an action and a time estimate', () => {
    // The expanded row renders `descKey`, the action control and the minutes chip — a
    // toggleable step missing any of them would expand into an empty, dead row.
    for (const step of FIRST_STEPS.filter((s) => !s.alwaysDone)) {
      expect(step.descKey, `${step.id}.descKey`).toBeTruthy();
      expect(step.action, `${step.id}.action`).toBeTruthy();
      expect(step.minutes, `${step.id}.minutes`).toBeGreaterThan(0);
    }
  });

  it('gives each action the field it needs to actually do anything', () => {
    // `action` alone is not enough: a navigate step with no route and an import step with no
    // spec both render a control that leads nowhere.
    for (const step of FIRST_STEPS) {
      if (step.action === 'navigate') expect(step.to, `${step.id}.to`).toBeTruthy();
      if (step.action === 'import') expect(step.importSpec, `${step.id}.importSpec`).toBeTruthy();
    }
  });
});

describe('firstStepsConfig — toggleableStepIds is the write allowlist', () => {
  /**
   * REGRESSION GUARD. This array is handed to `useFirstSteps` as `allowedIds` and is the
   * ONLY thing that keeps a non-writable id off `POST /sws/go/onboarding/first-steps`.
   * `EtendoGoJwtServlet.FIRST_STEPS_IDS` allowlists exactly these six ids and silently drops
   * anything else, so sending a seventh would persist a state that reads back different from
   * what was sent — adding a step here means adding it there too.
   */
  it('is exactly the six user-writable ids, in catalogue order', () => {
    expect(toggleableStepIds(PLAN_PRODUCTIVE)).toEqual(ALL_TOGGLEABLE);
  });

  it('narrows to the four a trial tenant can reach', () => {
    // The two productiveOnly steps are not on screen for a trial, so they must not be
    // writable either — `useFirstSteps` uses this as its `allowedIds`.
    expect(toggleableStepIds(FREE)).toEqual(TRIAL_TOGGLEABLE);
  });

  it('never contains create-account, the one step that is done by definition', () => {
    // Stated as the reason, not just the value: reaching this page at all means the account
    // exists, so there is nothing for the user to do and nothing to un-tick. Making it
    // toggleable is a behaviour change, not a refactor.
    const step = FIRST_STEPS.find((s) => s.id === 'create-account');
    expect(step.alwaysDone, 'create-account must stay alwaysDone').toBe(true);
    for (const plan of [PLAN_PRODUCTIVE, FREE, undefined]) {
      expect(toggleableStepIds(plan), 'create-account must not be writable')
        .not.toContain('create-account');
    }
  });

  it('holds every non-alwaysDone step and nothing else', () => {
    expect(toggleableStepIds(PLAN_PRODUCTIVE)).toEqual(
      FIRST_STEPS.filter((step) => !step.alwaysDone).map((step) => step.id),
    );
    expect(toggleableStepIds(PLAN_PRODUCTIVE))
      .toHaveLength(firstStepsTotal(PLAN_PRODUCTIVE) - 1);
  });
});

describe('the plan gate — a trial sees a shorter checklist', () => {
  const TRIAL_VISIBLE = ['create-account', 'company-data', 'products', 'contacts', 'team'];

  it('hides exactly invoice numbering and the fiscal configuration on a free plan', () => {
    expect(visibleFirstSteps(FREE).map((s) => s.id)).toEqual(TRIAL_VISIBLE);
  });

  it('keeps the catalogue order when it filters', () => {
    // Not just the right set — the right sequence. A filter that reordered would move the
    // team invitations off the end, and the page renders this array as-is.
    const productiveOrder = visibleFirstSteps(PLAN_PRODUCTIVE).map((s) => s.id);
    const trialOrder = visibleFirstSteps(FREE).map((s) => s.id);
    expect(trialOrder).toEqual(productiveOrder.filter((id) => trialOrder.includes(id)));
  });

  it('shows every step once the tenant is productive', () => {
    expect(visibleFirstSteps(PLAN_PRODUCTIVE)).toEqual(FIRST_STEPS);
  });

  it('marks exactly the two steps that a trial cannot act on', () => {
    // Stated against the flag rather than the filtered list, so adding a third
    // productiveOnly step has to be a deliberate edit here too.
    const gated = FIRST_STEPS.filter((step) => step.productiveOnly).map((step) => step.id);
    expect(gated).toEqual(['fiscal-config', 'invoice-sequence']);
  });

  describe('an unknown plan fails OPEN', () => {
    /**
     * THE DIRECTION THAT MATTERS. `useTenantPlan` answers `null` whenever it cannot know —
     * no platform token, a failed `/sws/go/environments`, or a client id with no matching
     * row. Reading that as "free" would silently strip invoice numbering and the fiscal
     * setup from a tenant that paid for them, with nothing on screen to explain it. Showing
     * a trial two extra rows is the cheaper mistake, and it is also what every tenant saw
     * before this gate existed.
     */
    it.each([[undefined], [null]])('treats %s as productive', (plan) => {
      expect(isProductivePlan(plan)).toBe(true);
      expect(visibleFirstSteps(plan)).toEqual(FIRST_STEPS);
      expect(firstStepsTotal(plan)).toBe(7);
      expect(toggleableStepIds(plan)).toEqual(ALL_TOGGLEABLE);
    });

    it('treats any other unrecognized value as NOT productive', () => {
      // Only a genuinely absent plan opens the gate. A value that arrived and is not
      // "productive" is a free tenant, however it is spelled.
      for (const plan of [FREE, 'demo', 'trial', '']) {
        expect(isProductivePlan(plan), plan).toBe(false);
      }
    });
  });

  describe('the counters follow the visible list', () => {
    it('counts 1/5 on a fresh trial and 1/7 on a fresh productive tenant', () => {
      expect(countCompletedSteps([], FREE)).toBe(1);
      expect(firstStepsTotal(FREE)).toBe(5);
      expect(countCompletedSteps([], PLAN_PRODUCTIVE)).toBe(1);
      expect(firstStepsTotal(PLAN_PRODUCTIVE)).toBe(7);
    });

    it('reaches all-set on a trial without the two hidden steps', () => {
      // The whole point of the gate: a trial tenant must be able to finish the checklist.
      // Before it, the two productiveOnly rows made 7/7 unreachable in a trial.
      expect(areAllStepsDone(TRIAL_TOGGLEABLE, FREE)).toBe(true);
      expect(areAllStepsDone(TRIAL_TOGGLEABLE, PLAN_PRODUCTIVE)).toBe(false);
    });

    it('does not count a hidden step that is already completed', () => {
      // Reachable for real: a tenant completes everything while productive, and a later
      // /environments hiccup reports free. Counting the hidden rows would render 7/5.
      expect(countCompletedSteps(ALL_TOGGLEABLE, FREE)).toBe(5);
      expect(countCompletedSteps(ALL_TOGGLEABLE, FREE))
        .toBeLessThanOrEqual(firstStepsTotal(FREE));
    });

    it('never opens a hidden step by default', () => {
      // `findExpandedStepId` drives which row the page opens on. Returning a gated id would
      // name a row that is not rendered, and the page would open nothing at all.
      expect(findExpandedStepId(['company-data'], FREE)).toBe('products');
      expect(findExpandedStepId(['company-data', 'products'], FREE)).toBe('contacts');
      expect(findExpandedStepId(['company-data', 'products', 'contacts'], FREE)).toBe('team');
      expect(findExpandedStepId(TRIAL_TOGGLEABLE, FREE)).toBe(null);
    });

    it('picks up the two new rows the moment the tenant goes productive', () => {
      // Same stored `completed`, different plan: the trial is finished, the productive
      // tenant is sent to the first of the two steps that just appeared.
      expect(findExpandedStepId(TRIAL_TOGGLEABLE, FREE)).toBe(null);
      expect(findExpandedStepId(TRIAL_TOGGLEABLE, PLAN_PRODUCTIVE)).toBe('fiscal-config');
    });
  });
});

describe('isStepDone', () => {
  const alwaysDoneStep = FIRST_STEPS.find((s) => s.id === 'create-account');
  const toggleableStep = FIRST_STEPS.find((s) => s.id === 'products');

  it('reads an alwaysDone step as done with nothing completed', () => {
    expect(isStepDone(alwaysDoneStep, [])).toBe(true);
  });

  it('reads a toggleable step as done only when its id is in `completed`', () => {
    expect(isStepDone(toggleableStep, [])).toBe(false);
    expect(isStepDone(toggleableStep, ['products'])).toBe(true);
    expect(isStepDone(toggleableStep, ['contacts'])).toBe(false);
  });

  it('tolerates a non-array `completed`', () => {
    expect(isStepDone(toggleableStep, null)).toBe(false);
    expect(isStepDone(toggleableStep, undefined)).toBe(false);
    expect(isStepDone(alwaysDoneStep, null)).toBe(true);
  });
});

describe('countCompletedSteps', () => {
  it('starts at 1, not 0 — the alwaysDone step counts toward the progress figure', () => {
    expect(countCompletedSteps([])).toBe(1);
  });

  it('treats a missing/invalid `completed` the same as empty', () => {
    expect(countCompletedSteps(null)).toBe(1);
    expect(countCompletedSteps(undefined)).toBe(1);
  });

  it('adds one per completed toggleable step', () => {
    expect(countCompletedSteps(['company-data'])).toBe(2);
    expect(countCompletedSteps(['company-data', 'products'])).toBe(3);
    expect(countCompletedSteps(['company-data', 'products', 'contacts'])).toBe(4);
    expect(countCompletedSteps(ALL_TOGGLEABLE)).toBe(7);
  });

  it('is order-independent', () => {
    expect(countCompletedSteps(['team', 'company-data'])).toBe(3);
  });

  it('does not inflate the count for ids that are not in the catalogue', () => {
    expect(countCompletedSteps(['not-a-step'])).toBe(1);
    expect(countCompletedSteps(['company-data', 'not-a-step', ''])).toBe(2);
  });

  it('does not double-count an alwaysDone id that leaked into `completed`', () => {
    expect(countCompletedSteps(['create-account'])).toBe(1);
  });

  it('does not double-count a duplicated toggleable id', () => {
    expect(countCompletedSteps(['products', 'products'])).toBe(2);
  });

  it('never exceeds the total', () => {
    expect(countCompletedSteps([...ALL_TOGGLEABLE, 'create-account', 'ghost']))
      .toBe(firstStepsTotal(PLAN_PRODUCTIVE));
  });
});

describe('areAllStepsDone', () => {
  it('is false on a fresh account', () => {
    expect(areAllStepsDone([])).toBe(false);
  });

  it('is false while any single toggleable step is missing', () => {
    for (const missing of ALL_TOGGLEABLE) {
      const completed = ALL_TOGGLEABLE.filter((id) => id !== missing);
      expect(areAllStepsDone(completed), `missing ${missing}`).toBe(false);
    }
  });

  it('is true only once every toggleable id is present', () => {
    expect(areAllStepsDone(ALL_TOGGLEABLE)).toBe(true);
  });

  it('is not satisfiable by padding `completed` with unknown ids', () => {
    expect(areAllStepsDone(['company-data', 'products', 'contacts', 'ghost'])).toBe(false);
  });
});

describe('findExpandedStepId', () => {
  it('expands the first toggleable step on a fresh account', () => {
    expect(findExpandedStepId([])).toBe('company-data');
  });

  it('walks forward as steps are completed, skipping the alwaysDone row', () => {
    expect(findExpandedStepId(['company-data'])).toBe('fiscal-config');
    expect(findExpandedStepId(['company-data', 'fiscal-config'])).toBe('products');
    expect(findExpandedStepId(['company-data', 'fiscal-config', 'products']))
      .toBe('contacts');
  });

  it('collapses every row once they are all done', () => {
    expect(findExpandedStepId(ALL_TOGGLEABLE)).toBe(null);
  });

  it('expands the first INCOMPLETE step, not the next one after the last completed', () => {
    // Completing out of order must reopen the earlier gap rather than move on.
    expect(findExpandedStepId(['products', 'contacts', 'team'])).toBe('company-data');
    expect(findExpandedStepId(['company-data', 'fiscal-config', 'contacts',
      'invoice-sequence', 'team'])).toBe('products');
  });

  it('tolerates a missing/invalid `completed`', () => {
    expect(findExpandedStepId(null)).toBe('company-data');
    expect(findExpandedStepId(undefined)).toBe('company-data');
  });

  it('never returns an alwaysDone step id', () => {
    const alwaysDoneIds = FIRST_STEPS.filter((s) => s.alwaysDone).map((s) => s.id);
    for (const completed of [[], ['company-data'], ['company-data', 'products'],
      ['company-data', 'products', 'contacts'], ALL_TOGGLEABLE]) {
      expect(alwaysDoneIds).not.toContain(findExpandedStepId(completed));
    }
  });
});
