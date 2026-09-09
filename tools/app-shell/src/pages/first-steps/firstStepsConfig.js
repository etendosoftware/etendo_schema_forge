/**
 * ETP-5190 — the declarative catalogue of post-signup "First Steps" onboarding steps.
 *
 * This module is the SINGLE place a step is added, removed or reordered. `FirstStepsPage`
 * renders whatever is here and `useFirstSteps` persists only the toggleable subset, so a new
 * step needs no change in either of them (beyond its i18n keys).
 *
 * This module holds NO icon imports on purpose. It is read by `SideMenu` (for the sidebar's
 * progress badge) and by `DashboardPage` (for the one-time redirect), neither of which draws a
 * step row — and pulling `@phosphor-icons/react` in through here put the whole icon set into
 * both of their bundles and broke every suite that mocks that package with a narrow set.
 * `iconName` is resolved to a component by `firstStepsIcons.js`, which only the page imports.
 *
 * The icons are Phosphor, not lucide: the design draws this list with the Phosphor set (same
 * family `SideMenu` already uses), and the two libraries' glyphs are not interchangeable at
 * 20px — a lucide stand-in reads visibly different from the mockup.
 *
 * Every entry carries:
 *   - `id`         stable identifier, also the value persisted in `firstSteps.completed`.
 *                  The backend allowlists exactly the ids of the toggleable steps
 *                  (`TOGGLEABLE_STEP_IDS`) and silently drops anything else.
 *   - `iconName`   key into `firstStepsIcons.js`, rendered in the row's leading badge.
 *   - `titleKey`   `genericLabels` key for the row title.
 *   - `descKey`    `genericLabels` key for the expanded row's description, or `null`.
 *   - `minutes`    rough time estimate shown next to the row, or `null` to hide the chip.
 *   - `action`     what the expanded row offers, see below.
 *   - `to`         in-app route the "Configure" button navigates to. Only meaningful for
 *                  `action: 'navigate'`.
 *   - `importSpec` the window whose import descriptor the inline importer drives. Only
 *                  meaningful for `action: 'import'`.
 *   - `alwaysDone` see below.
 *
 * `action` is the extension point for what a step actually DOES:
 *   - `'navigate'`  nothing but the "Configure" button that routes to `to`;
 *   - `'company'`   the read-only summary of what the tenant entered when it created its
 *                   account, above that same "Configure" button;
 *   - `'import'`    an "Import" button that opens the window's real import dialog in place,
 *                   because sending the user off to the list view just to find the same
 *                   button is a detour, not a step;
 *   - `null`        nothing to do — the row is informational.
 *
 * `keepActionWhenDone` keeps a completed row's controls live. Ticking a step normally locks its
 * controls, which is what stops an already-run import from being run again by accident; company
 * data is the exception because "done" there means "I filled it in", and a company's details
 * are the one thing on this list a user genuinely comes back to change.
 *
 * `alwaysDone` steps are rendered as completed, are NOT toggleable and are never persisted,
 * yet they DO count toward the progress figures — which is why the counter starts at 1/7 and
 * not 0/7. Both numbers are derived from this array; never hardcode them.
 */
export const FIRST_STEPS = [
  {
    id: 'create-account',
    iconName: 'User',
    titleKey: 'firstStepsCreateAccount',
    descKey: null,
    minutes: null,
    action: null,
    to: null,
    importSpec: null,
    keepActionWhenDone: false,
    alwaysDone: true,
  },
  {
    id: 'company-data',
    iconName: 'Building',
    titleKey: 'firstStepsCompanyData',
    descKey: 'firstStepsCompanyDataDesc',
    minutes: 2,
    action: 'company',
    to: '/organization',
    importSpec: null,
    keepActionWhenDone: true,
    alwaysDone: false,
  },
  {
    id: 'fiscal-config',
    iconName: 'Bank',
    titleKey: 'firstStepsFiscalConfig',
    descKey: 'firstStepsFiscalConfigDesc',
    minutes: 3,
    action: 'navigate',
    to: '/fiscal-config',
    importSpec: null,
    keepActionWhenDone: false,
    alwaysDone: false,
  },
  {
    id: 'products',
    iconName: 'Package',
    titleKey: 'firstStepsProducts',
    descKey: 'firstStepsProductsDesc',
    minutes: 3,
    action: 'import',
    to: null,
    importSpec: 'product',
    keepActionWhenDone: false,
    alwaysDone: false,
  },
  {
    id: 'contacts',
    iconName: 'AddressBook',
    titleKey: 'firstStepsContacts',
    descKey: 'firstStepsContactsDesc',
    minutes: 3,
    action: 'import',
    to: null,
    importSpec: 'contacts',
    keepActionWhenDone: false,
    alwaysDone: false,
  },
  {
    id: 'invoice-sequence',
    iconName: 'Invoice',
    titleKey: 'firstStepsCustomizeInvoices',
    descKey: 'firstStepsCustomizeInvoicesDesc',
    minutes: 2,
    action: 'navigate',
    to: '/document-sequence',
    importSpec: null,
    keepActionWhenDone: false,
    alwaysDone: false,
  },
  {
    id: 'team',
    iconName: 'UserPlus',
    titleKey: 'firstStepsInviteTeam',
    descKey: 'firstStepsTeamDesc',
    minutes: 2,
    action: 'navigate',
    to: '/roles',
    importSpec: null,
    keepActionWhenDone: false,
    alwaysDone: false,
  },
];

/** Total number of steps shown in the progress counter (`x/TOTAL`). Derived, never hardcoded. */
export const FIRST_STEPS_TOTAL = FIRST_STEPS.length;

/**
 * The ids the user can actually toggle, and therefore the only ids that may be sent to
 * `POST /sws/go/onboarding/first-steps` — the server allowlist is exactly this set.
 *
 * `FirstStepsProvider` hands this to `useFirstSteps` as its write allowlist, which is what
 * keeps `create-account` off the wire without the hook having to import this module.
 */
export const TOGGLEABLE_STEP_IDS = FIRST_STEPS
  .filter((step) => !step.alwaysDone)
  .map((step) => step.id);

/** True when the step renders as completed — always-done, or user-completed. */
export function isStepDone(step, completed) {
  return step.alwaysDone || (Array.isArray(completed) && completed.includes(step.id));
}

/** How many of the steps read as complete, always-done ones included. */
export function countCompletedSteps(completed) {
  return FIRST_STEPS.filter((step) => isStepDone(step, completed)).length;
}

/** True once every step reads as complete — the "all set" final state. */
export function areAllStepsDone(completed) {
  return countCompletedSteps(completed) === FIRST_STEPS_TOTAL;
}

/**
 * The row the page opens on: the first toggleable step that is still incomplete. This is only
 * the DEFAULT — the user can open any row at any time and complete the steps in whatever
 * order suits them, so this must never be read as "the step that is unlocked".
 *
 * Returns `null` when everything is done (the all-set state collapses every row).
 */
export function findExpandedStepId(completed) {
  const next = FIRST_STEPS.find((step) => !step.alwaysDone && !isStepDone(step, completed));
  return next ? next.id : null;
}

/** True when the row has something to open — an always-done row is inert. */
export function isStepExpandable(step) {
  return !step.alwaysDone && Boolean(step.descKey || step.action);
}
