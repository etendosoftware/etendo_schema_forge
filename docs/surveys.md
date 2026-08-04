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

## CSAT Predefined Responses

When a CSAT survey's score is <= 3, `SurveyModal` shows a `CannedResponseGrid` above the free-text
textarea — a 2-column grid of phrases, each with a decorative icon. `resolveCannedOptions(survey,
locale, ui, score)` prefers backend-configured responses (`getRemoteCannedResponses`) over a
hardcoded per-survey fallback list in `surveys.js`.

**Score ranges (backend-configured responses only):** each backoffice-configured response declares a
`minScore`/`maxScore` band (e.g. 1–2 vs 3), and `resolveCannedOptions` filters to the entries whose
range contains the score the user actually picked — so a 1-star and a 3-star CSAT can surface
different phrases. This only applies to responses coming from the "Survey Configuration" backoffice
window (`ETGO_Survey_Canned_Resp`, see [Configuration](#configuration)); the hardcoded fallback list
in `surveys.js` has no ranges and keeps showing unconditionally within the followup phase — it's an
offline-degradation path only, not expected to need this granularity.

| Survey | Locale keys (fallback) | Topics |
|---|---|---|
| `csat_invoicing` | `surveyInvoicingCanned1..6` | Speed, usability, templates, VAT/tax handling, sending to the client, bugs |
| `csat_order` | `surveyOrderCanned1..6` | Speed, usability, product search, order lines, confirmation, bugs |

Icons are decorative only (`aria-hidden`), never in the translated strings — clicking a card calls
`setFeedback(label)` with the plain text only (no icon), prefilling the textarea; the text remains
fully editable afterward — same "click to fill, keep editing" pattern as `ConversationView`'s
support-chat quick replies. This is presentation-only: no new state, no Mixpanel event of its own (a
canned pick still surfaces via the `feedback` property on `survey_responded` once submitted).

**Adding a canned option:** in the backoffice, add a row to the "Canned Responses" child tab under
the survey's row in the "Surveys" tab, with its score range. For the offline fallback, add a locale
key to both `en_US.json`/`es_ES.json`, then append `{ icon: '…', key: '…' }` to that survey's
`canned` array in `surveys.js`. Keep phrases tied to concrete pain points in that specific flow —
avoid generic complaints unrelated to the process being rated (e.g. pricing complaints do not
belong in a workflow-usability survey).

---

## Back Navigation

Both NPS and CSAT `followup` phases (Q2 free-text + canned responses / chips) show a **Back** button
in the footer, next to Submit. Clicking it returns to the score-selection phase (`setPhase('initial')`)
without resetting `score` — the previously picked NPS number / CSAT star stays selected, so the user
can revise it and move forward again. No Mixpanel event fires on Back.

`feedback` (and, for NPS, `tags`) ARE cleared on Back, unlike `score`. This matters most for CSAT:
the initial phase routes `score <= 3` to `followup` and `score > 3` straight to `thanks`, so a user
who types feedback against a low score, goes Back, and raises the score above 3 would otherwise
resubmit via the `thanks` branch with the old feedback still attached to the new (unrelated) score —
a data-integrity bug, not a UX nicety. Clearing `feedback`/`tags` in the `onBack` handler (before
`setPhase('initial')`) ensures a resubmission after Back always starts the followup phase fresh.

---

## Anti-Fatigue Rules

`selectNextSurvey` applies these guards in order before any per-survey eligibility check:

| Rule | Default | Implementation |
|------|-------|---------------|
| Global cooldown | 30 days after any survey was shown | `isGlobalCooldownActive` in `survey-engine.js` |
| Monthly cap | Max 2 surveys per calendar month | `isMonthlyLimitReached` — key format `"YYYY-MM"` |
| Dismiss cooldown (per survey) | 21 days after a survey was dismissed | `isDismissedCooldownActive` in `survey-engine.js` |
| NPS min tenure | Skip NPS if first login was < 60 days ago | `npsIsEligible` in `surveys.js` |
| NPS inactivity guard | Skip NPS if user has not logged in for > 14 days | `npsIsEligible` in `surveys.js` |
| CSAT document minimum | Skip CSAT invoicing/order until >= 5 documents confirmed | `csatDocumentIsEligible` in `surveys.js` |
| CSAT document gap | Re-eligible after 30 more documents since last response | `csatDocumentIsEligible` in `surveys.js` |
| Re-respond cooldown (per survey) | 90 days after last response | Inside `csatDocumentIsEligible` / `npsIsEligible` |

The global cooldown and monthly cap are checked first. If either fails, no survey is evaluated further. The dismiss cooldown is checked per survey in the loop, so one dismissed survey does not block others that have not been dismissed recently.

The global rules (cooldown, monthly cap) read from `getSurveyConfig()`; the per-survey rules (min
tenure, inactivity guard, document minimum/gap, re-respond cooldown) read from
`getSurveyTypeConfig(surveyKey)` — both in `survey-config.js`, both preferring the "Survey
Configuration" backoffice window at runtime, falling back to `VITE_SURVEY_*` build-time env vars,
then to hardcoded defaults — see [Configuration](#configuration) below. This is an internal ops
knob for the Etendo GO team, not a customer-facing setting.

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

If the new survey's eligibility follows an existing pattern (document-count-based like CSAT, or
time-based like NPS), prefer reusing `csatDocumentIsEligible`/`npsIsEligible`'s shared helpers and
reading tunables via `getSurveyTypeConfig(surveyId)` — then the only backend change needed is a new
row in the "Surveys" tab (`ETGO_Survey_Type`, add the survey's key to the `ETGO Survey Key` list
reference first) and, optionally, rows in "Canned Responses". No `AD_COLUMN` changes required. The
steps below assume a genuinely new eligibility shape instead (hardcoded literals, no backoffice
config) — write one only when the existing patterns don't fit.

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

There are two ways to disable a survey, for two different situations:

**1. Backoffice toggle (operational, reversible, no deploy) — the normal way.** Uncheck **Active**
on the survey's row in the "Surveys" tab (`ETGO_Survey_Type.isactive = 'N'`). This is a real,
data-driven kill switch, not just a tuning reset: `SurveyConfigServlet` reports that survey key
with `"enabled": false` in `perSurvey` (the row is still returned, never silently dropped — see
[Configuration](#configuration)), and `isSurveyTypeEnabled(surveyId)` in `survey-config.js` makes
`selectNextSurvey` (`survey-engine.js`) skip the survey entirely — **before** its own
`isEligible()` even runs. So an isactive='N' survey never shows, regardless of what its local
eligibility rule would otherwise decide. Flip `isactive` back to 'Y' to re-enable it — no code
change, no rebuild, takes effect on the next page load / login (same fetch as the rest of
[Configuration](#configuration)). This is the mechanism to reach for when an Etendo GO team member
needs to turn a survey off for all tenants (e.g. a survey type is temporarily noisy or broken)
without touching code.

**2. Hardcoded `isEligible: () => false` (permanent, code-level) — for surveys not ready to ship.**
This is the pattern used for `csat_onboarding`:

```js
function csatOnboardingIsEligible() {
  return false; // onboarding survey disabled until fully implemented
}
```

The survey remains in the `SURVEYS` array (so its `id` and locale keys are not orphaned), but it
will never be selected by `selectNextSurvey`. No state migrations are needed. Use this only when a
survey isn't finished yet (no backoffice row makes sense for it either) — for a survey that is
otherwise live and just needs to be turned off/on operationally, use the backoffice toggle above
instead, since that doesn't require a code change to reverse.

---

## Mixpanel Events

Four events are emitted via `track()` (from `tools/app-shell/src/lib/observability.js`), all sent to Mixpanel. `survey_shown` and `survey_responded` are also sent to the NPS channel.

**GDPR remediation (ETP-4352, see [GDPR / Data Privacy Note](#gdpr--data-privacy-note-etp-4352)
below):** none of these events identify an individual user anymore — there is no `userId` property
and `identify()` is never called from the survey flow. `accountId` was renamed to **`orgId`** (it is
the selected `AD_Org`, a different concept from the Client-level `account_id` Mixpanel Group set
elsewhere — see `docs/ops/app-shell-observability.md`). `survey_responded`'s free-text `feedback`
was replaced with a `hasComment` boolean; the actual text is persisted server-side instead (see
[`POST /sws/survey-config/response`](#post-swssurvey-configresponse) below).

### `survey_score_selected`

Fired via `useSurveyEngine.handleScoreSelected` **only when the user selects a score/star and then
abandons the survey without submitting** (close button, backdrop click, or Skip) — captures the vote
that would otherwise be lost. `SurveyModal` tracks the score locally and calls this exactly once, at
the moment of dismissal, with the last score selected (re-clicking the scale before dismissing does
not fire it multiple times). It is never fired when the user submits — `survey_responded` already
carries the score in that case, so there is no overlap between the two events.

| Property | Value |
|---|---|
| `type` | Survey type: `'nps'` or `'csat'` |
| `source` | Survey id |
| `score` | Numeric score selected by the user |
| `orgId` | Selected organization id (if available) |

### `survey_shown`

Fired by `useSurveyEngine.checkAndShowSurvey` immediately before setting the active survey.

| Property | Value |
|---|---|
| `type` | Survey type: `'nps'` or `'csat'` |
| `source` | Survey id (e.g. `'nps'`, `'csat_order'`) |
| `orgId` | Selected organization id (if available) |

### `survey_responded`

Fired by `useSurveyEngine.handleRespond` when the user submits a score (triggered when the modal transitions to the `'thanks'` phase). The free-text feedback itself is **not** included — see
`hasComment` below and [`POST /sws/survey-config/response`](#post-swssurvey-configresponse).

| Property | Value |
|---|---|
| `type` | Survey type: `'nps'` or `'csat'` |
| `source` | Survey id |
| `score` | Numeric score selected by the user |
| `hasComment` | Boolean — whether the user typed any feedback text (the text itself is never sent to Mixpanel) |
| `tags` | Comma-separated tag string (omitted if none selected) |
| `orgId` | Selected organization id (if available) |

### `survey_dismissed`

Fired by `useSurveyEngine.handleDismiss` when the user clicks the close button or the backdrop **before** responding. Not fired when the modal closes after a successful response.

| Property | Value |
|---|---|
| `type` | Survey type: `'nps'` or `'csat'` |
| `source` | Survey id |
| `orgId` | Selected organization id (if available) |

**Note:** Clicking the backdrop or close button **after** the thank-you screen has appeared does not fire `survey_dismissed` — `SurveyModal.handleClose` routes through `onDismiss` only when `phase !== 'thanks'`.

---

## Configuration

Survey tuning is layered, in this precedence order (highest wins):

1. **Backoffice window** — "Survey Configuration" in com.etendoerp.go, three tabs:
   - **Config** (`ETGO_Survey_Config`) — the truly-global settings, single row (`AD_Client_ID = '0'`).
   - **Surveys** (`ETGO_Survey_Type`) — **one row per survey** (`survey_key`: `nps`, `csat_invoicing`,
     `csat_order`, ...) holding that survey's own eligibility tunables. Adding a new survey with the
     same kind of eligibility rule (time-based or document-based) is a new row, not a new `AD_COLUMN`
     — this is the extensibility fix from the original single-row `ETGO_Survey_Config` design. The
     row's standard **Active** field (`isactive`) is a real enable/disable switch for that survey
     type — see [Disabling a Survey](#disabling-a-survey).
   - **Canned Responses** (`ETGO_Survey_Canned_Resp`) — a **child tab** of Surveys (FK
     `Etgo_Survey_Type_ID`), so responses are scoped to whichever survey row is selected.

   Served read-only via `GET /sws/survey-config/` (JWT-protected, same auth as `/sws/neo/*`).
   Fetched once via `loadRemoteSurveyConfig()` — called from `useSurveyEngine` as soon as the user
   is authenticated — and cached in-memory in `survey-config.js`. Takes effect **at runtime**, no
   rebuild needed: an Etendo GO team member edits a value in the window, and it's live for the next
   page load / login.
2. **`VITE_SURVEY_*` build-time env vars** — used only when the backoffice endpoint is
   unreachable (offline dev, backend down) or a given field wasn't returned. Mirrors the
   existing `VITE_RUM_SESSION_SAMPLE_RATE` pattern in `rum.js` (see
   `docs/ops/app-shell-observability.md`).
3. **Hardcoded defaults** in `survey-config.js` — the final fallback, always safe.

**This is an internal ops knob for the Etendo GO team — not a customer-facing setting.** The
window has no menu-driven customer visibility expectations; access is governed by normal Etendo
role/window security, same as any other backoffice window.

Canned CSAT responses (see [CSAT Predefined Responses](#csat-predefined-responses) above) follow
the same precedence: `SurveyModal` calls `getRemoteCannedResponses(surveyId, locale)` first: if the
backoffice has rows for that survey + language, their `text` (and score range) is used directly
(already locale-specific, no `ui()` lookup); otherwise it falls back to the hardcoded `survey.canned`
locale-key list in `surveys.js`.

### Global parameters — `ETGO_Survey_Config` / `VITE_SURVEY_*`

Read via `getSurveyConfig()` in `survey-config.js`.

| Window field (`ETGO_Survey_Config`) | Env var fallback | Default | Resolves to |
|---|---|---|---|
| Global Cooldown (days) | `VITE_SURVEY_GLOBAL_COOLDOWN_DAYS` | `30` | `globalCooldownMs` — global cooldown after any survey shown |
| Dismissed Cooldown (days) | `VITE_SURVEY_DISMISSED_COOLDOWN_DAYS` | `21` | `dismissedCooldownMs` — cooldown after a survey is dismissed |
| Max Surveys Per Month | `VITE_SURVEY_MAX_PER_MONTH` | `2` | `maxPerMonth` — max surveys shown per calendar month |

The servlet reads whichever active row was created first (`ORDER BY created LIMIT 1`) and ignores
any others.

### Per-survey parameters — `ETGO_Survey_Type` / `VITE_SURVEY_*`

Read via `getSurveyTypeConfig(surveyKey)` in `survey-config.js` — pass the survey's `id` (`nps`,
`csat_invoicing`, `csat_order`). Time-based fields (Min Account Age, Inactivity Guard) only apply to
login-triggered surveys like NPS; document-based fields (Min Documents, Document Gap) only apply to
trigger-based surveys like CSAT — a row leaves the fields its survey doesn't use empty.

| Window field (`ETGO_Survey_Type`) | Env var fallback | Default | Resolves to |
|---|---|---|---|
| Min Account Age (days) | `VITE_SURVEY_NPS_MIN_AGE_DAYS` | `60` | `minAccountAgeMs` — minimum account age before this survey is eligible |
| Inactivity Guard (days) | `VITE_SURVEY_NPS_INACTIVITY_DAYS` | `14` | `inactivityGuardMs` — skip if the user has been inactive longer than this |
| Min Documents | `VITE_SURVEY_CSAT_MIN_DOCS` | `5` | `minDocuments` — minimum confirmed documents before this survey is eligible |
| Document Gap | `VITE_SURVEY_CSAT_DOC_GAP` | `30` | `documentGap` — additional documents required before eligible again |
| Response Cooldown (days) | `VITE_SURVEY_RESPONSE_COOLDOWN_DAYS` | `90` | `responseCooldownMs` — re-eligibility window after a response |

`csat_invoicing` and `csat_order` each have their own row, so their Min Documents/Document Gap/
Response Cooldown can now differ independently (previously one shared value for both).

All day-based values are converted to milliseconds internally; `minDocuments`/`documentGap` are
plain counts. Invalid values (non-numeric, zero, negative — from either the window or the env var)
fall back to the next tier rather than disabling the guard.

**`Active` (`isactive`) is the enable/disable switch, not a tuning fallback.** Unchecking it does
not mean "use default thresholds instead" — it means "never show this survey, full stop", checked
before the survey's own eligibility rule even runs. See [Disabling a Survey](#disabling-a-survey)
above for how this flows end to end (servlet → `isSurveyTypeEnabled()` → `selectNextSurvey`).
`getSurveyTypeConfig()` itself is unaffected by `isactive` — it only resolves the day/count
tunables; the enable/disable check is a separate, earlier gate.

### Canned responses — `ETGO_Survey_Canned_Resp`

Each row (child of a `ETGO_Survey_Type` row): **Language** (`en_US` / `es_ES`), **Icon** (decorative,
shown in the chip), **Response Text** (the actual phrase), **Min Score** / **Max Score** (inclusive
score band this phrase applies to), **Line No** (display order). The servlet joins to the parent
`ETGO_Survey_Type` row (for its `survey_key`) and groups active rows into
`canned: { <surveyKey>: { <language>: [{icon, text, minScore, maxScore}] } }`.

### `GET /sws/survey-config/`

Implemented by `SurveyConfigServlet` (`com.etendoerp.go.schemaforge`), registered via
`AD_MODEL_OBJECT` / `AD_MODEL_OBJECT_MAPPING` like the other lightweight `/sws/*` endpoints
(`AppsServlet`, `SupportConversationsServlet`). JWT-protected — same `Authorization: Bearer <token>`
as `/sws/neo/*` — returns 401 without a valid session. Read-only; there is no write endpoint —
config is only edited through the backoffice window's native grid. Response shape:

```jsonc
{
  "globalCooldownDays": 30, "dismissedCooldownDays": 21, "maxPerMonth": 2,
  "perSurvey": {
    "nps": { "minAccountAgeDays": 60, "inactivityGuardDays": 14, "responseCooldownDays": 90, "enabled": true },
    "csat_invoicing": { "minDocuments": 5, "documentGap": 30, "responseCooldownDays": 90, "enabled": true },
    "csat_order": { "minDocuments": 5, "documentGap": 30, "responseCooldownDays": 90, "enabled": false }
  },
  "canned": {
    "csat_invoicing": { "en_US": [{ "icon": "🐢", "text": "Too slow", "minScore": 1, "maxScore": 3 }] }
  }
}
```

`perSurvey[key].enabled` mirrors `ETGO_Survey_Type.isactive` for every row that exists — the row is
always reported (even when `isactive='N'`), it just carries `enabled: false` instead of being
omitted. A survey key with no row at all simply has no entry in `perSurvey` (same as before) and is
treated as enabled client-side, since "not configured yet" is not the same as "explicitly disabled".

### `POST /sws/survey-config/response`

Added in ETP-4352 (GDPR remediation, see [GDPR / Data Privacy Note](#gdpr--data-privacy-note-etp-4352)
below) as the server-side destination for the free-text feedback that used to be sent to Mixpanel
verbatim. Same servlet (`SurveyConfigServlet`), same JWT auth as the `GET` above. Called
fire-and-forget from `useSurveyEngine.handleRespond` via `submitSurveyResponse()`
(`tools/app-shell/src/lib/surveys/survey-config.js`) right alongside the (now PII-free) Mixpanel
`survey_responded` track call — a failed POST never blocks or breaks the survey UI.

Request body:

```jsonc
{ "surveyKey": "nps", "score": 9, "feedback": "free text, optional", "tags": ["fast", "easy"] }
```

`surveyKey` is required (400 if missing/blank); `score`, `feedback` and `tags` are all optional.
Response: `{ "status": "ok" }` (201). Persists to `ETGO_Survey_Response` (module
`com.etendoerp.go`, tenant-scoped via the same JWT client/org/user claims every other `/sws/*`
endpoint uses): `survey_key`, `ad_user_id`, `score`, `feedback_text`, `tags` (stored as a
comma-joined string, same shape it used to travel to Mixpanel as), `response_date`. Mirrors the
architecture `SupportConversationsServlet#handleSubmitRating` already uses for support-chat CSAT
(persist server-side, send only a boolean signal to Mixpanel) — see that class's `rating` endpoint
for the sibling pattern.

---

## GDPR / Data Privacy Note (ETP-4352)

The `docs/ops/mixpanel-gdpr-privacy-audit.md` review (in the `schema_forge` main checkout) found
that survey events sent real user identity and free-text feedback to Mixpanel. Both gaps have been
remediated as of this change; scope was `survey_shown`, `survey_score_selected`,
`survey_responded`, `survey_dismissed`.

**Identity: fixed by removal, not pseudonymization.** The survey flow no longer calls `identify()`
at all (`useSurveyEngine.js`), and no event carries `userId`/`username` — the product decision was
to stop identifying individual users to Mixpanel outright, not to hash or otherwise pseudonymize the
login. `accountId` (the selected `AD_Org`) was renamed to **`orgId`** in the same change, to
disambiguate it from the unrelated Client-level `account_id` Mixpanel Group (`group('account_id', …)`
in `health-events.js`, which is untouched and stays exactly as it was — it identifies the tenant,
not an individual, and was explicitly out of scope). IP-based geolocation
(`providers/mixpanel.js`), consent gating, and the `identify`/`group`/`groupSet` sanitizer bypass
remain separate, lower-priority findings from the same audit — still open, tracked there.

**Free-text feedback: moved server-side, never sent to Mixpanel.** `survey_responded` used to
forward the CSAT/NPS textarea verbatim as a `feedback` property — unconstrained user input that
could contain names, emails, or other PII. It now sends only `hasComment` (a boolean), the same
pattern `SUPPORT_CSAT_SUBMITTED`/`SupportChatContext.jsx` already used for support-chat ratings. The
actual text is persisted through the new [`POST /sws/survey-config/response`](#post-swssurvey-configresponse)
endpoint into `ETGO_Survey_Response`, so product can still read it — just not through an analytics
vendor.
