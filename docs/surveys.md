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
textarea — a 2-column grid of 6 phrases, each with a decorative icon. Content is **per-survey**, not
a shared generic list: each CSAT survey object in `surveys.js` declares its own `canned` array of
`{ icon, key }` pairs, tied to what that flow's `q2PlaceholderKey` already hints at.

| Survey | Locale keys | Topics |
|---|---|---|
| `csat_invoicing` | `surveyInvoicingCanned1..6` | Speed, usability, templates, VAT/tax handling, sending to the client, bugs |
| `csat_order` | `surveyOrderCanned1..6` | Speed, usability, product search, order lines, confirmation, bugs |

Icons are decorative only (`aria-hidden`) and live in `survey.canned[].icon` in `surveys.js`, never in
the translated strings — clicking a card calls `setFeedback(label)` with the plain translated text
only (no icon), prefilling the textarea; the text remains fully editable afterward — same "click to
fill, keep editing" pattern as `ConversationView`'s support-chat quick replies. This is
presentation-only: no new state, no Mixpanel event of its own (a canned pick still surfaces via the
`feedback` property on `survey_responded` once submitted).

**Adding a canned option to a survey:** add a locale key to both `en_US.json`/`es_ES.json`, then
append `{ icon: '…', key: '…' }` to that survey's `canned` array in `surveys.js`. Keep phrases tied to
concrete pain points in that specific flow — avoid generic complaints unrelated to the process being
rated (e.g. pricing complaints do not belong in a workflow-usability survey).

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

All defaults above are read from `getSurveyConfig()` in `survey-config.js` and are overridable at build time via `VITE_SURVEY_*` env vars — see [Configuration](#configuration-vite_survey_) below. This is an internal ops knob for the Etendo GO team, not a customer-facing setting.

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

Four events are emitted via `track()` (from `tools/app-shell/src/lib/observability.js`), all sent to Mixpanel. `survey_shown` and `survey_responded` are also sent to the NPS channel.

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
| `userId` | Authenticated username |
| `accountId` | Selected organization id (if available) |

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

---

## Configuration

Survey tuning is layered, in this precedence order (highest wins):

1. **Backoffice window** — "Survey Configuration" in com.etendoerp.go (tables
   `ETGO_Survey_Config` + `ETGO_Survey_Canned_Resp`), served read-only via
   `GET /sws/survey-config/` (JWT-protected, same auth as `/sws/neo/*`). Fetched once via
   `loadRemoteSurveyConfig()` — called from `useSurveyEngine` as soon as the user is
   authenticated — and cached in-memory in `survey-config.js`. Takes effect **at runtime**, no
   rebuild needed: an Etendo GO team member edits a value in the window, and it's live for the
   next page load / login.
2. **`VITE_SURVEY_*` build-time env vars** — used only when the backoffice endpoint is
   unreachable (offline dev, backend down) or a given field wasn't returned. Mirrors the
   existing `VITE_RUM_SESSION_SAMPLE_RATE` pattern in `rum.js` (see
   `docs/ops/app-shell-observability.md`).
3. **Hardcoded defaults** in `survey-config.js` — the final fallback, always safe.

**This is an internal ops knob for the Etendo GO team — not a customer-facing setting.** The
window has no menu-driven customer visibility expectations; access is governed by normal Etendo
role/window security, same as any other backoffice window. Global config only (single row,
`AD_Client_ID = '0'`) — not per-tenant.

Canned CSAT responses (see [CSAT Predefined Responses](#csat-predefined-responses) above) follow
the same precedence: `SurveyModal` calls `getRemoteCannedResponses(surveyId, locale)` first: if the
backoffice has rows for that survey + language, their `text` is used directly (already
locale-specific, no `ui()` lookup); otherwise it falls back to the hardcoded `survey.canned`
locale-key list in `surveys.js`.

### Numeric parameters — `ETGO_Survey_Config` / `VITE_SURVEY_*`

| Window field (`ETGO_Survey_Config`) | Env var fallback | Default | Resolves to |
|---|---|---|---|
| Global Cooldown (days) | `VITE_SURVEY_GLOBAL_COOLDOWN_DAYS` | `30` | `globalCooldownMs` — global cooldown after any survey shown |
| Dismissed Cooldown (days) | `VITE_SURVEY_DISMISSED_COOLDOWN_DAYS` | `21` | `dismissedCooldownMs` — cooldown after a survey is dismissed |
| Max Surveys Per Month | `VITE_SURVEY_MAX_PER_MONTH` | `2` | `maxPerMonth` — max surveys shown per calendar month |
| NPS Min Account Age (days) | `VITE_SURVEY_NPS_MIN_AGE_DAYS` | `60` | `npsMinAgeMs` — minimum account age before NPS is eligible |
| NPS Inactivity Guard (days) | `VITE_SURVEY_NPS_INACTIVITY_DAYS` | `14` | `npsInactivityMs` — skip NPS if the user has been inactive longer than this |
| Response Re-eligibility Cooldown (days) | `VITE_SURVEY_RESPONSE_COOLDOWN_DAYS` | `90` | `responseCooldownMs` — re-eligibility window after a response, shared by NPS and both CSAT surveys |
| CSAT Min Documents | `VITE_SURVEY_CSAT_MIN_DOCS` | `5` | `csatMinDocs` — minimum confirmed documents before CSAT invoicing/order is eligible |
| CSAT Document Gap | `VITE_SURVEY_CSAT_DOC_GAP` | `30` | `csatDocGap` — additional documents required before CSAT is eligible again |

All values are whole days (converted to milliseconds internally) except `maxPerMonth`, `csatMinDocs`,
and `csatDocGap`, which are plain counts. Invalid values (non-numeric, zero, negative — from either
the window or the env var) fall back to the next tier rather than disabling the guard.

The window enforces a single global row (`AD_Client_ID = '0'`); the servlet reads whichever active
row was created first (`ORDER BY created LIMIT 1`) and ignores any others.

### Canned responses — `ETGO_Survey_Canned_Resp`

Each row: **Survey Key** (`csat_invoicing` / `csat_order`), **Language** (`en_US` / `es_ES`), **Icon**
(decorative, shown in the chip), **Response Text** (the actual phrase), **Line No** (display order).
The servlet groups active rows into `canned: { <surveyKey>: { <language>: [{icon, text}] } }`.

### `GET /sws/survey-config/`

Implemented by `SurveyConfigServlet` (`com.etendoerp.go.schemaforge`), registered via
`AD_MODEL_OBJECT` / `AD_MODEL_OBJECT_MAPPING` like the other lightweight `/sws/*` endpoints
(`AppsServlet`, `SupportConversationsServlet`). JWT-protected — same `Authorization: Bearer <token>`
as `/sws/neo/*` — returns 401 without a valid session. Read-only; there is no write endpoint —
config is only edited through the backoffice window's native grid.

---

## GDPR / Data Privacy Note (ETP-4352)

Findings from the ETP-4352 "Requerimientos Adicionales" review of what the survey events send to
Mixpanel today. Scope: `survey_shown`, `survey_score_selected`, `survey_responded`, `survey_dismissed`.

**Identifiers (`userId`, `accountId`):** these are internal opaque identifiers (username, org id),
not directly identifying values like name or email on their own. Under GDPR this is **pseudonymous
data** — it still counts as personal data (Mixpanel or anyone with access to the source system could
re-identify the user), but pseudonymization is a recognized and accepted risk-reduction measure, not
a reason to block on further anonymization work. No code change is proposed here.

**Recommendation:** confirm a Data Processing Agreement (DPA) is in place with Mixpanel covering EU
data — standard practice for any SaaS analytics vendor processing EU personal data, and Etendo GO
already uses the `api-eu.mixpanel.com` host (see `docs/ops/app-shell-observability.md`) for EU data
residency. This is an ops/legal follow-up, not a code fix.

**The actual gap:** the CSAT free-text `feedback` field (sent by `survey_responded`) is
**unconstrained user input**. A user can type anything into it, including their own name, email, or
other PII, and it is forwarded to Mixpanel verbatim today — this predates ETP-4352 and is unaffected
by the canned-response feature (picking a canned phrase just prefills the same editable field).

**Recommendation for the free-text risk:** do not implement speculative scrubbing (e.g. regex-based
email/PII stripping) without a product/compliance decision — pattern-based scrubbing is unreliable
(false negatives on PII, false positives mangling legitimate feedback) and the right mitigation
depends on Etendo GO's actual compliance posture (DPA terms, data retention policy, whether Mixpanel
is told to treat the field as sensitive). Flagging this explicitly for whoever owns compliance
sign-off is the deliverable of this note — this repo proceeds as-is for Phase 1.
