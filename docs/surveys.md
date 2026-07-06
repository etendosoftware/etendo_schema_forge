# In-App Survey System (NPS / CSAT)

Introduced in **ETP-4352** (PR #802).

## Overview

The survey system collects product feedback from users directly inside the app, without redirecting to an external tool. It supports two survey types:

- **NPS (Net Promoter Score)** — measures overall user loyalty on a 0–10 scale.
- **CSAT (Customer Satisfaction)** — measures satisfaction with a specific workflow on a 1–5 star scale.

Surveys appear as a centered modal over the app. The system applies anti-fatigue rules so users are never over-surveyed: a global cooldown, a per-month cap, a per-survey dismissal cooldown, and per-type recurrence logic. All state is stored locally in `localStorage`; no backend calls are made for eligibility checking.

---

## Architecture

The system has four layers:

```
┌──────────────────────────────────────────────────────────────────┐
│  1. Survey Definitions   surveys.js                              │
│     id, type, sources, scaleMax, locale keys, isEligible()       │
├──────────────────────────────────────────────────────────────────┤
│  2. State Persistence    survey-state.js                         │
│     localStorage key: sf_survey_v1                               │
│     read/write helpers, markShown/Responded/Dismissed            │
├──────────────────────────────────────────────────────────────────┤
│  3. Engine / Selector    survey-engine.js                        │
│     selectNextSurvey(), anti-fatigue guards, source filter       │
│     emitSurveyTrigger() — fires the CustomEvent                  │
├──────────────────────────────────────────────────────────────────┤
│  4. React Layer          useSurveyEngine.js + SurveyModal.jsx    │
│     timers, event listeners, Mixpanel tracking, UI               │
└──────────────────────────────────────────────────────────────────┘
```

The flow from user action to survey display:

```
User confirms a document
  → incrementSurveyCounter('order' | 'invoicing')   (survey-state.js)
  → emitSurveyTrigger()                             (survey-engine.js)
    ↓
window event 'sf:survey:trigger'
  → useSurveyEngine handler (1 s debounce)
  → selectNextSurvey({ source: 'trigger' })
  → markSurveyShown()  +  track(SURVEY_SHOWN)
  → setActiveSurvey(survey)
  → SurveyModal renders
```

At login, the same hook runs `selectNextSurvey({ source: 'login' })` after a 2.5 s delay.

---

## Survey Types

| ID | Type | Trigger source | Scale | Eligibility rule |
|----|------|---------------|-------|-----------------|
| `csat_onboarding` | csat | `login` | 1–5 stars | **Disabled** — `isEligible` always returns `false` |
| `nps` | nps | `login` | 0–10 | First login >= 60 days ago AND last login <= 14 days ago |
| `csat_invoicing` | csat | `trigger` | 1–5 stars | >= 5 invoices confirmed; re-eligible after 30 more invoices AND 90 days |
| `csat_order` | csat | `trigger` | 1–5 stars | >= 5 orders confirmed; re-eligible after 30 more orders AND 90 days |

The `SURVEYS` array in `surveys.js` is evaluated in order. The first survey that passes all guards is shown. No two surveys are shown in the same pass.

---

## Anti-Fatigue Rules

`selectNextSurvey` applies these guards in order before any per-survey eligibility check:

| Rule | Value | Implementation |
|------|-------|---------------|
| Global cooldown | 30 days after any survey was shown | `isGlobalCooldownActive` in `survey-engine.js` |
| Monthly cap | Max 2 surveys per calendar month | `isMonthlyLimitReached` — key format `"YYYY-MM"` |
| Dismiss cooldown (per survey) | 21 days after a survey was dismissed | `isDismissedCooldownActive` in `survey-engine.js` |
| NPS inactivity guard | Skip NPS if user has not logged in for > 14 days | `npsIsEligible` in `surveys.js` |
| Re-respond cooldown (per survey) | 90 days after last response | Inside each `csatIs*Eligible` / `npsIsEligible` function |

The global cooldown and monthly cap are checked first. If either fails, no survey is evaluated further. The dismiss cooldown is checked per survey in the loop, so one dismissed survey does not block others that have not been dismissed recently.

---

## Source Filtering

Each survey definition declares which trigger sources can activate it:

```js
sources: ['login']    // only shown on app load / after authentication
sources: ['trigger']  // only shown when emitSurveyTrigger() is called
```

`selectNextSurvey` receives a `source` argument and skips any survey whose `sources` array does not include that value:

```js
if (source != null && survey.sources && !survey.sources.includes(source)) continue;
```

| Source value | Who passes it | Which surveys are candidates |
|---|---|---|
| `'login'` | `useSurveyEngine`, 2.5 s after authentication | `csat_onboarding`, `nps` |
| `'trigger'` | `useSurveyEngine` event handler, 1 s after `sf:survey:trigger` | `csat_invoicing`, `csat_order` |

The `sf:survey:trigger` CustomEvent is dispatched by `emitSurveyTrigger()` (exported from `survey-engine.js`) and is consumed exclusively by the `useSurveyEngine` hook. Any window component that wants to surface a trigger survey calls `emitSurveyTrigger()` after a successful document confirmation.

---

## localStorage Schema

All survey state is stored under the key **`sf_survey_v1`** as a JSON object. The schema is:

```jsonc
{
  // ISO 8601 timestamps (string | null)
  "firstLoginAt": "2025-01-15T10:00:00.000Z",  // set once, never overwritten
  "lastLoginAt":  "2025-06-20T08:30:00.000Z",  // updated on every login
  "lastShownAt":  "2025-06-20T08:30:05.000Z",  // updated whenever a survey is displayed
  "lastDismissedAt": "2025-06-01T09:00:00.000Z", // updated on any dismiss

  // Onboarding state (reserved for future use)
  "onboardingCompleted": false,
  "onboardingShown": false,

  // Document-level counters — incremented each time a document is confirmed
  "counters": {
    "invoicing": 12,  // confirmed invoices
    "order": 7        // confirmed orders
  },

  // How many times each survey has been displayed this calendar month
  // Key format: "YYYY-MM"
  "shownThisMonth": {
    "2025-06": 1
  },

  // How many times the user has responded to each survey (by survey id)
  "respondedCounts": {
    "nps": 1,
    "csat_invoicing": 2
  },

  // ISO 8601 timestamp of the last response per survey id
  "respondedAt": {
    "nps": "2025-03-10T14:00:00.000Z",
    "csat_invoicing": "2025-05-01T11:00:00.000Z"
  },

  // Counter snapshot at last response — used by CSAT recurrence logic (30-doc gap)
  "respondedCountAt": {
    "csat_invoicing": 8,   // value of counters.invoicing when the user last responded
    "csat_order": 3        // value of counters.order when the user last responded
  },

  // ISO 8601 timestamp of the last dismiss per survey id
  "dismissals": {
    "nps": "2025-04-15T09:00:00.000Z"
  }
}
```

**Key points:**
- `firstLoginAt` is written once (on first login) and is never overwritten. It gates the NPS 60-day tenure requirement.
- `respondedCountAt` is written by `markSurveyResponded` only for `csat_invoicing` and `csat_order`. It stores the value of the relevant counter at the time of response so the engine can require a gap of 30 new documents before re-showing the survey.
- All timestamps are ISO 8601 strings. Comparisons are done with `new Date(ts).getTime()`.

---

## Emitting a Trigger from a New Window

When you add a new window that processes a document (e.g., a sales quotation flow), you can hook it into the survey engine in two steps.

### Step 1 — Register a counter key in `surveys.js`

If your window introduces a new document type that needs its own eligibility tracking, add a helper set and a corresponding `isEligible` function in `surveys.js`. If you can reuse an existing counter (`'invoicing'` or `'order'`), skip this step.

### Step 2 — Import and call `incrementSurveyCounter` on successful confirmation

In your custom window actions file (e.g. `artifacts/your-window/custom/YourActions.jsx`):

```js
import { incrementSurveyCounter } from '@/lib/surveys/survey-state.js';
import { emitSurveyTrigger }     from '@/lib/surveys/survey-engine.js';

// Inside the handler that runs after a successful document confirmation:
incrementSurveyCounter('order');   // or 'invoicing', or your new key
emitSurveyTrigger();
```

`incrementSurveyCounter(key)` atomically reads the state, increments the counter, writes it back, and returns the new value.

`emitSurveyTrigger()` dispatches the `sf:survey:trigger` CustomEvent on `window`. The `useSurveyEngine` hook listens for this event and, after a 1 second debounce, calls `selectNextSurvey({ source: 'trigger' })`.

**Where to call them:** Call both after a confirmed successful API response, before any navigation or modal close. The pattern used in `PurchaseOrderActions.jsx` (line 312 in `ConfirmModal.handleConfirm`) is the canonical reference:

```js
// After successful document action API call:
incrementSurveyCounter('order');
window.dispatchEvent(new CustomEvent('purchase-order:document-created'));
// Then call emitSurveyTrigger separately once the confirm result modal closes:
// onClose: () => { ...; emitSurveyTrigger(); onRefresh?.(); }
```

The same pattern is used in `useEntity.js` for the generic document-complete flow (lines 1040–1045).

---

## Adding a New Survey

1. **Define the eligibility function** in `surveys.js`. Follow the existing pattern — the function receives `{ state, isAdmin, now }` and returns a boolean:

   ```js
   function csatNewFeatureIsEligible({ state, now }) {
     const count = state.counters.newFeature ?? 0;
     if (count < 5) return false;
     const respondedCount = state.respondedCounts['csat_new_feature'] ?? 0;
     if (respondedCount === 0) return true;
     const lastRespondedCountAt = state.respondedCountAt?.['csat_new_feature'] ?? 0;
     if (count - lastRespondedCountAt < 30) return false;
     const lastRespondedAt = state.respondedAt['csat_new_feature'];
     if (!lastRespondedAt) return true;
     return now - new Date(lastRespondedAt).getTime() >= 90 * MS_DAY;
   }
   ```

2. **Add the survey object** to the `SURVEYS` array in `surveys.js`:

   ```js
   Object.freeze({
     id: 'csat_new_feature',
     type: 'csat',
     sources: ['trigger'],
     scaleMax: 5,
     titleKey: 'surveyNewFeatureTitle',
     q2TitleKey: 'surveyNewFeatureQ2',
     q2PlaceholderKey: 'surveyNewFeatureQ2Placeholder',
     thanksKey: 'surveyNewFeatureThanks',
     isEligible: csatNewFeatureIsEligible,
   }),
   ```

   Position matters — surveys are evaluated in array order, and the first eligible one wins.

3. **Add all locale keys** to both `tools/app-shell/src/i18n/en_US.json` and `es_ES.json`. Every key referenced in the survey object (`titleKey`, `q2TitleKey`, `q2PlaceholderKey`, `thanksKey`) must exist in both files.

4. **Emit the trigger** from the relevant window action (see "Emitting a Trigger from a New Window" above).

---

## Disabling a Survey

Set `isEligible` to a function that always returns `false`. This is the pattern used for `csat_onboarding`:

```js
function csatOnboardingIsEligible() {
  return false; // onboarding survey disabled until fully implemented
}
```

The survey remains in the `SURVEYS` array (so its `id` and locale keys are not orphaned), but it will never be selected by `selectNextSurvey`. No state migrations are needed.

---

## Mixpanel Events

Three events are emitted via `track()` (from `tools/app-shell/src/lib/observability.js`). All three go to Mixpanel. `survey_shown` and `survey_responded` are also sent to the NPS channel.

### `survey_shown`

Fired by `useSurveyEngine.checkAndShowSurvey` immediately before setting the active survey.

| Property | Value |
|---|---|
| `type` | Survey type: `'nps'` or `'csat'` |
| `source` | Survey id (e.g. `'nps'`, `'csat_order'`) |
| `userId` | Authenticated username |
| `accountId` | Selected organization id (if available) |

### `survey_responded`

Fired by `useSurveyEngine.handleRespond` when the user submits a score (triggered when the modal transitions to the `'thanks'` phase).

| Property | Value |
|---|---|
| `type` | Survey type: `'nps'` or `'csat'` |
| `source` | Survey id |
| `score` | Numeric score selected by the user |
| `feedback` | Free-text response (omitted if empty) |
| `tags` | Comma-separated tag string (omitted if none selected) |
| `userId` | Authenticated username |
| `accountId` | Selected organization id (if available) |

### `survey_dismissed`

Fired by `useSurveyEngine.handleDismiss` when the user clicks the close button or the backdrop **before** responding. Not fired when the modal closes after a successful response.

| Property | Value |
|---|---|
| `type` | Survey type: `'nps'` or `'csat'` |
| `source` | Survey id |
| `userId` | Authenticated username |
| `accountId` | Selected organization id (if available) |

**Note:** Clicking the backdrop or close button **after** the thank-you screen has appeared does not fire `survey_dismissed` — `SurveyModal.handleClose` routes through `onDismiss` only when `phase !== 'thanks'`.
