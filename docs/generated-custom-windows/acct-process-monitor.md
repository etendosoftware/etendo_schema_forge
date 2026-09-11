# Accounting Process Monitor

## Intent

Give an administrator an observability-and-control surface for Etendo's **accounting server process** (`AD_Process.Value = 'AcctServerProcess'`), the scheduled job that posts pending accounting documents. The page answers three questions without anyone opening Etendo classic or reading a server log:

- Is a run happening right now?
- When will the process next run on its own?
- What happened on the recent runs — succeeded, failed, how long, manual or automatic?

And it adds one action the schedule cannot give: **launch a run now**, for the caller's own company, without waiting for the next automatic execution.

This is the counterpart to [`not-posted-documents.md`](not-posted-documents.md). That window shows *which documents* are still unposted and lets a user post them one by one or in bulk; this page shows *whether the background poster is healthy* and lets an admin kick it. Neither replaces the other.

Like Not Posted Documents, this has **no backing AD window** — it is a synthetic app-shell page (no artifact, no `decisions.json`, no `ETGO_SF_SPEC` row) served by a single Etendo GO webhook.

Delivered by **ETP-5269**, behind the `acct-process-monitor` feature flag (default `false`).

---

## What this page should allow

An administrator should be able to:

- read the **last status** of the process, as a human label and a tone-coded pill — never a raw `AD_PROCESS_RUN.STATUS` three-letter code
- read the **last run** start time
- read the **next automatic run** time, or `Not scheduled` when the instance has no recurring request
- **launch a run now** for their own company, and see the page converge on its own as the run appears and finishes
- read an **execution history** table: status, start, end, duration, and whether the run was Manual or Automatic
- **refresh** on demand

An administrator explicitly **cannot**:

- read the raw process log or report (see *What is deliberately not exposed*)
- change the automatic schedule from here — this page never writes the recurring request
- run the process for anyone else's company

---

## The rule that matters most: a manual run covers THIS company only

**The automatic cadence and the manual button do not have the same scope. This is a product decision (2026-09-10) that overrode the original design, and it is the single most likely thing to be silently undone by a later refactor.**

| | Automatic cadence | Manual "Run now" |
|---|---|---|
| Runs as | System (`AD_Client_ID = '0'`) | The **calling session's** client |
| Posts | **Every tenant's** documents | **Only the caller's** documents |
| Organization scope | per-client sweep | `'0'` = every organization *within* that one client |
| Request row | the long-lived recurring `AD_PROCESS_REQUEST` | a brand-new one-shot sibling row |

The mechanism is `AcctServerProcess.doExecute`, which branches on the bundle context's client: when it is `'0'` it loops over every non-System client; otherwise it processes that client alone. `SFAcctProcessMonitor.triggerManualRun` builds its `VariablesSecureApp`/`ProcessBundle` from `OBContext.getOBContext().getCurrentClient().getId()`, so the manual run takes the second branch. No change to Etendo core was needed.

Consequences to preserve:

- A client-admin of tenant A pressing the button must never post tenant B's accounting. Widening the bundle back to the recurring row's stored System context reintroduces exactly that.
- A caller whose session **is** the System context has no single company to scope to, so the trigger is **refused** (`systemClientNotScopable`) rather than silently widened. The automatic cadence already covers System; there is nothing safe for the button to do there.
- The UI says so in the hint below the button — `acctProcessManualRunHint`: *"Running it now processes only this company's pending accounting, and is in addition to the automatic schedule, which is not changed."* If the scope ever changes, that string changes with it.

Source of truth: `SFAcctProcessMonitor#triggerManualRun` javadoc (`§Why the caller's own client`), and `flags-registry.json` → `acct-process-monitor` → `$scopeChangeComment`.

---

## Interaction model

- **Route:** `/acct-process-monitor`, registered in `tools/app-shell/src/runtime-routes.jsx` via `lazyRoute('acct-process-monitor', AcctProcessMonitorPage)`. **Registered unconditionally** — see *Two gates* below.
- **Menu entry:** `Settings` group in `tools/app-shell/src/menu.json`, item name `acct-process-monitor`, label `Accounting Process` / `Proceso contable`, icon `Cog`, `capability: "isAdminOrClientAdmin"`. Additionally hidden behind the `acct-process-monitor` feature flag.
- **Implementation type:** synthetic app-shell page. No artifact directory, no `decisions.json`, no `contract.json`, no `ETGO_SF_SPEC`/`ETGO_SF_ENTITY` rows, no pipeline involvement. It does not appear in `tools/app-shell/src/windows/registry.js`.
- **Page shape:** two cards — a status card (title, subtitle, Refresh + Run now, three summary tiles, cadence hint, in-flight line, trigger outcome) and a history card (a five-column table, or an empty state).
- **Mode:** read-mostly. The only mutation is scheduling a one-shot run; nothing on this page edits any record.
- **Backend:** one endpoint, `GET /sws/neo/acctprocessmonitor`, served by `SFAcctProcessMonitor` through the NEO pseudo-spec bridge (`NeoPseudoSpecDispatcher`, pseudo-spec name `acctprocessmonitor`). `GET` only — any other method answers `405 "Acctprocessmonitor endpoint only supports GET"`.

### Two gates — and only one of them is a security boundary

This distinction is load-bearing and has already been asserted end to end, so do not "harden" it by flag-gating the route.

| Gate | Where | What it actually does |
|---|---|---|
| `acct-process-monitor` feature flag | `SideMenu.jsx`, via `useFeatureFlag(ACCT_PROCESS_MONITOR)` | Hides the **menu entry**. Visual only. Anyone can flip a flag in their own browser, and the route stays reachable with the flag off. |
| `capability: "isAdminOrClientAdmin"` in `menu.json` | `filterMenuGroupsByAccess` | Hides the **menu entry** from a non-admin. Also visual only. |
| **`NeoAccessHelper.isAdminOrClientAdmin(role)`** | `SFAcctProcessMonitor.get`, server-side | **The real authorization boundary.** Checked before anything is read *and* before anything is scheduled. A caller with a restricted role, or with no role at all, gets the `notAuthorized` payload and the endpoint neither reads history nor touches the scheduler. |

The route is registered unconditionally on purpose, following the `/upgrade` precedent documented in [`../feature-flags.md`](../feature-flags.md) §3: hiding the route would imply the flag was protecting something, which it is not. What protects the data is the server-side role check.

### Reading is the default; triggering is opt-in

The whole Etendo GO webhook family is reached over `GET` (the `BaseWebhookService.get(Map, Map)` contract the NEO bridge bridges). A side-effecting action therefore cannot be inferred from the HTTP method — it has to be asked for:

```
GET /sws/neo/acctprocessmonitor?Limit=20                   → read only
GET /sws/neo/acctprocessmonitor?Action=trigger&Limit=20    → schedule a run, then read
```

`Action` is compared case-insensitively against `"trigger"`; **any other value, including absent, is a read**. That is what keeps a bare, prefetched, bookmarked or retried GET from firing the accounting process. `Limit` defaults to 20, is clamped to 100, and falls back to 20 for anything unparseable, so a bad value is safe rather than an error.

Within a triggering request the backend **triggers first, then reads**. Reading first and patching only `history` afterwards produced a response whose own fields disagreed: `running` was captured before the job was scheduled — and since the trigger refuses outright when a run is already in progress, it was necessarily `false` in *every* successful trigger response — while `history` came from a later read. The frontend keys part of its poll off `running`, so it never started polling and the page sat there claiming a run had begun.

---

## Response shape

Success (`GET .../acctprocessmonitor?Limit=20`):

```json
{
  "error": false,
  "processName": "<AD_Process.Name for AcctServerProcess>",
  "scheduled": true,
  "nextRunTime": "2026-09-10T18:35:00",
  "running": false,
  "lastRun": {
    "id": "…", "status": "SUC",
    "startTime": "2026-09-10T18:30:00", "endTime": "2026-09-10T18:30:00",
    "duration": "00:00:00.085", "manual": false
  },
  "history": [ /* same row shape, newest first, at most `Limit` rows */ ]
}
```

A run row carries exactly six keys: `duration`, `endTime`, `id`, `manual`, `startTime`, `status`. `manual` is derived from the owning request's `CHANNEL` (`Background` → manual), so it needs no extra column and stays correct for runs created before this feature existed.

Refusal payload (HTTP **200**, not 403 — the "answer, don't 403" convention this webhook family uses):

```json
{ "error": true, "reason": "notAuthorized", "message": "Not authorized" }
```

`reason` is `notAuthorized` or `notInstalled`. The stable machine-readable `reason` exists so the frontend never has to string-match `message` — "you may not see this" and "this instance has no accounting process" need very different screens and must not be conflated. An **unrecognised** reason (an older or newer backend) falls through to the generic error state carrying the server's own message; it is deliberately *not* defaulted to `denied`, which would tell an admin they lack permission for what is really a server-side problem.

Triggering adds one field:

```json
{ "…": "…", "triggered": { "started": true, "reason": "started" } }
```

### The `triggered.reason` values

`started: true` means the job was **handed to Quartz** — not that it has run, and not even that its `AD_PROCESS_RUN` row exists yet. `ProcessMonitor.jobToBeExecuted` writes that row on the scheduler's own thread, so a read taken in the same request can legitimately see neither a `PRC` run nor a new history entry. This is why the page polls.

| `reason` | `started` | What it means to an admin | UI message key |
|---|:---:|---|---|
| `started` | `true` | The run was accepted by the scheduler. It will show up in the history within seconds. | `acctProcessTriggerStarted` |
| `alreadyRunning` | `false` | A run of this process is already in progress for this client (or a one-shot this client already queued has not fired yet). Wait for it — a second run would contend for the same unposted documents. | `acctProcessTriggerAlreadyRunning` |
| `notScheduled` | `false` | The instance has no active recurring request for the accounting process, so there is no cadence to run alongside and the button does nothing. | `acctProcessTriggerNotScheduled` |
| `schedulerUnavailable` | `false` | Quartz is in standby on this node (the no-execute background policy), where `OBScheduler.schedule(...)` silently no-ops. Reported rather than claimed as success. | `acctProcessTriggerSchedulerUnavailable` |
| `systemClientNotScopable` | `false` | The session is in the **System** context, which spans every tenant and therefore has no single company to limit the run to. Switch to a specific company. Refused, never silently widened — this is the scope decision above, enforced. | `acctProcessTriggerSystemClient` |
| `scheduleFailed` | `false` | The scheduler threw. Also the frontend's fallback when a trigger response arrives without a `triggered` object at all, or when the request itself fails. | `acctProcessTriggerFailed` |

Five of the six are refusals; `started` is the success value. A successful HTTP 200 therefore never implies the run began — callers must read `triggered.started`, and the page maps the `reason`, not the status code, to what the admin is told (`triggerMessageKey` in `AcctProcessMonitorPage.jsx`).

---

## Why a one-shot sibling request — and why `Channel.BACKGROUND`

### The recurring row is read-only. Always.

The accounting process already runs on a recurring `AD_PROCESS_REQUEST` (every 5 minutes on the reference instance; `9B2B32C0BAF146F783A50C6F69251BC4` there). **This endpoint reads that row for its identity and its `nextExecution`, and never writes it — not one column.** Triggering inserts a *separate*, brand-new one-shot `AD_PROCESS_REQUEST` pointing at the same `AD_Process`, through `OBScheduler.schedule(ProcessBundle)` — the overload that mints its own id, INSERTs its own row with status `SCH` and NULL timing, and schedules it. `TriggerProvider` maps null/unrecognised timing to `TimingOption.IMMEDIATE` (`newTrigger().startNow()`), so the run starts now and the cadence is untouched **by construction**: there is no code path here that can reach the recurring row's schedule.

Two alternatives were investigated and rejected, both because they mutate that row:

- **Invoking the "Schedule Process" AD_Process** (`0515E6559C31478E92703A3D10E6783B`) — it has `UIPattern = 'M'` and an empty `Classname`; it is the manual button on the Process Request window and rewrites the schedule of the row it is run against.
- **Updating `start_date`/`start_time` on the recurring row** — refuted from source: `OBScheduler.initialize()` reads `AD_PROCESS_REQUEST` exactly once, at Quartz startup. Afterwards triggers live in Quartz's own JobStore and nothing re-reads that table for timing, so the UPDATE would be invisible until Tomcat restarted *while still having corrupted the stored schedule*.

The one-shot carries **no frequency**, so it can never become a second recurring job.

### `Channel.BACKGROUND`, never `DIRECT`

`AcctServerProcess` reads the channel: `isDirect = bundle.getChannel() == Channel.DIRECT`, and when direct it loads its table / org / date parameters from `AD_PINSTANCE_PARA` using the bundle's pinstance id. **A scheduled one-shot has no pinstance**, and those generated finders return `""` rather than `null` when nothing matches — so `strOrg` would be silently overwritten from `"0"` to `""`, and `AcctServer.get(table, client, "", conn)` would be asked for an empty organization. **The run would report success and post nothing.**

`BACKGROUND` keeps `isDirect` false, so the manual run takes exactly the same path the automatic run takes. It also stays a distinct channel string from both `"Direct"` (the interactive *Posting by DB tables* form) and `"Process Scheduler"` (the recurring row), which is what lets the queries tell the three kinds of row apart without a new column — including the `manual` flag on every history row.

**Accepted trade-off:** `OBScheduler.initialize()` skips rescheduling a leftover `SCH` row only when its channel is `Direct` or its timing is IMMEDIATE. A `BACKGROUND` one-shot interrupted between its INSERT and firing is therefore **re-fired once on the next startup**. This is harmless and was accepted deliberately: `AcctServer` only posts documents that are *still unposted*, so the extra run is a no-op when the work already happened, and it cannot become recurring because the row carries no frequency. One redundant posting run is far better than a run that silently posts nothing.

### Concurrency: the recurring run cannot veto a manual one

`AD_Process.preventconcurrent` is `'Y'` for this process and the flag does reach the manual trigger (`TriggerGenerator` copies it into the job data map), so it is natural to assume a manual run can be vetoed while the System cadence is mid-flight. **It cannot.** `ProcessMonitor.vetoJobExecution` treats another executing job as concurrent only when it matches on **both** client and organization:

```java
boolean isSameClient = isSameParam(jobAlreadyScheduled, newJob, "Client");
if (!isSameClient || !isSameParam(jobAlreadyScheduled, newJob, "Organization")) {
  continue;                       // not concurrent — no veto
}
```

`isSameParam` compares `ProcessBundle.getContext().getClient()`. The manual one-shot runs as the **caller's** client; the recurring run is System (`'0'`). Different client, so the two are mutually invisible to the concurrency check. Scoping the bundle to the caller — done for tenant isolation — removed this scenario as a side effect.

The **only** reachable veto is another run of this process on the same client *and* the same organization: a second manual run squeezing through the TOCTOU gap in `hasRunInProgress`/`hasPendingManualRequest`, or a tenant that also holds its own recurring request. **In that case vetoing is the correct outcome and must not be worked around** — the in-flight run is already posting exactly the documents the second one would. An automatic retry was evaluated and rejected on those grounds.

**A vetoed run is not reliably distinguishable from a real failure, and no logic may assume it is.** `ProcessMonitor.stopConcurrency` writes its own `AD_PROCESS_RUN` row (this caller's client, status `ERR`, duration `"00:00:00.000"`) and puts its explanation ("Concurrent attempt to execute") in the `LOG` column, which this endpoint never exposes. `getDuration(0)` renders the identical duration string for any genuine failure that dies inside a millisecond, and neither path ever writes `RESULT` or `REPORT` — they are not even parameters of `ProcessRunData.insert`. **Do not build behaviour that branches on "zero-duration `ERR` means it was skipped".**

---

## What is deliberately NOT exposed

**`AD_PROCESS_RUN.LOG` (a CLOB of raw process output) and `REPORT` are never read into the response** — not in the list, not truncated, not behind a drill-down. `toRunJson` carries a standing comment saying so, and the page renders status, timings and duration only.

Why: the log can carry arbitrary internal detail, and this endpoint is reachable by **every client-admin**, not only by a system administrator. The column is genuinely populated in production (a cadence run on the reference instance wrote 4,153 characters), so this is a live exposure question, not a hypothetical one.

**Do not add a log column, a row-expand, a "view details" drawer, or a truncated preview.** The E2E spec deliberately feeds a `log` field into every mocked run payload and asserts the sentinel string never reaches the DOM, so a regression here fails the build rather than shipping quietly.

---

## Reactive behavior and dependencies

### The poll — why a trigger response is never the final word

The page must converge without the admin pressing Refresh, and the triggering response structurally cannot contain the new run (the `AD_PROCESS_RUN` row is written later, on the scheduler's thread). `useAcctProcessMonitor` therefore polls:

- **Cadence:** every **5 s** (`RUNNING_POLL_MS`). An idle page does not poll at all.
- **Polls while:** the backend reports `running: true`, **or** `awaitingRun` is true — the window between a successful trigger and the run becoming observable.
- **`awaitingRun` deadline:** **60 s** (`AWAIT_RUN_MS`) from the successful trigger. Generous on purpose: the run itself finishes in well under a second, but the gap being covered is scheduler latency plus one poll interval.
- **`awaitingRun` ends early** as soon as the run becomes observable — a newest-run id different from the one captured at trigger time, or the backend reporting `running`. After that `running` alone governs, so the poll stops when the run finishes. The deadline is only the backstop for the outcomes that produce *neither* signal: a run that starts and finishes between two polls, or a job the scheduler silently dropped.
- Only a run that actually **started** is awaited. A refusal sets no deadline — there is nothing coming.

`running` alone was not enough, and that was a shipped bug: the trigger refuses outright when a run is already in progress, so `running` is `false` in every *successful* trigger response. Keyed on `running` alone the poll never started, and the page kept promising "it will appear in the history shortly" while nothing arrived without a manual reload.

### Button and message states

| Condition | Effect |
|---|---|
| request in flight (`triggering`) | Run now disabled, spinner in the button; Refresh disabled too |
| `running` (backend reports `PRC`) | Run now disabled; *"A run is in progress…"* |
| `awaitingRun` and not yet `running` | Run now **stays** disabled; *"Starting the run…"* — without this the button re-enabled a moment after the click and invited a duplicate one-shot |
| `scheduled: false` | Run now disabled; the cadence hint becomes *"This process has no automatic schedule on this instance, so it cannot be launched from here."* |
| `triggerOutcome` present | One line below the card, coloured `foreground` when started and `destructive` when refused, carrying `data-reason="<reason>"` |

### Status codes

Every `AD_PROCESS_RUN.STATUS` code from `org.openbravo.scheduling.Process` is mapped to a tone and an i18n label by `RUN_STATUS_META`, rendered by `RunStatusPill` using the `status-*` semantic Tailwind utilities (never a raw green or amber; the error tone uses `destructive`, since the preset defines no `status-error`).

| Code | Label | Tone |
|---|---|---|
| `SUC` | Success | success |
| `COM` | Complete | success |
| `PRC` | Running | info |
| `SCH` | Scheduled | info |
| `ERR` | Error | error |
| `KIL` | Killed | error |
| `MIS` | Misfired | warning |
| `UNS` | Unscheduled | warning |
| `SYR` | System restart | warning |
| `PCE` | Skipped (already running) | warning |

`PCE` is mapped even though the reference instance has never produced one — the constant exists in core, so a run can carry it. An **unmapped** code falls back to the neutral tone and shows the raw code, so a status core adds later stays legible instead of disappearing.

### Read scope, and the two "in progress" probes

- **History** is resolved at the **process** level — every `ProcessRun` of every `ProcessRequest` for this process, not just the recurring request's own runs. A manual run lives on its own one-shot request, so filtering by the recurring request id would hide exactly the runs the page just started.
- **Client scope:** the caller's own client **plus System (`'0'`)**. System is included deliberately and is not a leak: the System-context cadence is the shared sweep that posts *every* client's documents, including the caller's, so its rows are the history of work done on the caller's own data. Excluding them would make the page look as though the process had never run. What the filter *does* exclude is another tenant's **manual** runs, which say nothing about this caller's accounting.
- Admin mode is on (the recurring request is a System row a tenant admin's own context cannot read), so every criteria states its client restriction explicitly and sets `setFilterOnReadableClients(false)` / `setFilterOnReadableOrganization(false)` — the scope never depends on ambient context. Note that `OBContext.setAdminMode(true)` is the **stricter** variant (it keeps the cross-client write check), chosen because this class performs no OBDal writes at all.
- **`hasRunInProgress`** shares the history scope, including System: while the instance-wide automatic run is mid-flight it is posting this client's documents too, so starting a manual run on top of it would have two jobs contending for the same unposted rows.
- **`hasPendingManualRequest`** looks at the caller's client **only**. Another tenant's queued one-shot is none of this caller's business and must not disable their button.
- Both probes are bounded by a **1-hour staleness window** (`STALE_RUN_MS`). A `PRC` row is only moved out of that state by `ProcessMonitor` when the job finishes, so a JVM killed mid-run leaves it at `PRC` forever; without the bound one orphan would disable the manual trigger permanently. The accounting process completes in well under a second here, so an hour is several orders of magnitude of head-room.

### Which recurring row wins when there is more than one

More than one is possible: the shipped configuration is a single System row, but a tenant may also hold its own recurring request for this process (the reference instance still carries a completed F&B one). The lookup excludes both one-shot channels (`Background`, `Direct`), then orders by **soonest `nextExecution`**, tie-broken by id for total determinism.

Soonest — **not** "prefer the caller's own client". The only thing this row feeds the UI is *Next automatic run*, i.e. *when will my accounting next be posted without me doing anything*. Both candidates post the caller's documents, so the truthful answer is whichever fires first. Preferring the caller's own client would actively mislead in the likely configuration: a tenant row scheduled nightly alongside a System five-minute sweep would announce tomorrow 02:00 while the documents were in fact going to be posted within minutes.

### Timestamps

The backend emits `yyyy-MM-ddTHH:mm:ss` with **no zone**, because the underlying columns are `timestamp without time zone` — server wall clock, as the rest of Etendo treats them. `parseRunTimestamp` uses `new Date(raw)`, which parses a zoneless date-time as *local* time per the language spec, so the wall clock round-trips unchanged.

This is a full instant, not a calendar date, so the repo-wide `parseCalendarDate` rule (`tools/app-shell/src/lib/dateOnly.js`) deliberately does **not** apply — that helper exists for date-only values, where a UTC-midnight parse rolls the day back under a negative offset. There is no day to roll here. A null timestamp renders as an em dash.

### Menu gating is item-level, and it covers Favorites

`SideMenu` previously flag-gated only whole **groups** (`Proof of Concept`). ETP-5269 adds per-**item** gating via a `flagGatedItems` map keyed by `menu.json` item name; an item absent from the map is never flag-gated, so the common case costs one lookup.

The filter is applied to the **Favorites** group as well. Favorites are rebuilt from the user's own saved list rather than from `menuGroups`, so the previous early-return for that group let a favourited flag-gated item stay visible with the flag off — the one hole through which a gated entry could still be reached.

---

## Gap assessment

- **The flag is not a boundary, and must not be made one.** If someone later "hardens" this by wrapping the route in the flag, the real protection (`NeoAccessHelper.isAdminOrClientAdmin`) becomes invisible and the next reviewer will assume the flag is doing security work. The E2E spec pins the current behaviour (`flag off: the route still works`).
- **No log, ever.** Every future request for "just show me why it failed" must be answered somewhere other than this endpoint (Etendo classic's Process Monitor window, or the server log). See *What is deliberately not exposed*.
- **A vetoed run looks like a failed run.** Deliberate and unfixable from here without exposing the log. No UI or backend logic may branch on zero-duration `ERR`.
- **No cancel / kill.** The page can start a run; it cannot stop one. A run stuck at `PRC` is handled only by the 1-hour staleness window, which re-enables the button — it does not clean up the row.
- **No retention or pruning** of `AD_PROCESS_RUN` rows is governed here; the page just reads the newest `Limit` of them (default 20, max 100). There is no paging and no "load more".
- **`nextRunTime` is a snapshot**, refreshed only when the page fetches. It is the recurring row's stored `nextExecution`, not a live Quartz query.
- **One-shot restart re-fire.** A `BACKGROUND` one-shot interrupted between INSERT and firing runs once more after a Tomcat restart. Accepted; harmless because `AcctServer` only posts still-unposted documents.

---

## Manual verification

Prerequisites: an Etendo GO instance with the accounting process installed and a recurring request active; a session whose role is admin or client-admin; the app served with `acct-process-monitor` enabled (`VITE_FEATURE_FLAGS='{"acct-process-monitor":true}'`, since the flag is fixed at Vite start).

1. **Menu, flag on.** Expand the sidebar, open **Configuración / Settings** and confirm an **Accounting Process** / **Proceso contable** entry sits after **Roles**. Open it; the status card and history table render.
2. **Menu, flag off.** Restart the dev server without the flag and confirm the entry is gone from Settings *and* from Favorites if it was favourited there.
3. **Route is not flag-gated.** With the flag still off, navigate directly to `/acct-process-monitor` — the page must load normally. (This is the intended behaviour, not a leak: the backend gate is what protects the data.)
4. **A bare load fires nothing.** With the network tab open, load the page and confirm the request is `GET /sws/neo/acctprocessmonitor?Limit=20` with **no `Action` parameter**, and that no new row appears in `AD_PROCESS_RUN`.
5. **Run now — convergence.** Press **Run now**. The button must disable immediately and *"Starting the run…"* must appear; within a few seconds a new row appears at the top of the history, labelled **Manual**, **without pressing Refresh**.
6. **Client scoping.** After that run, confirm in the DB that the new `AD_PROCESS_REQUEST` and `AD_PROCESS_RUN` rows carry the **caller's** `ad_client_id`, not `'0'`:
   ```sql
   SELECT r.ad_process_run_id, r.ad_client_id, r.status, r.duration, q.channel, q.ad_client_id AS request_client
   FROM ad_process_run r
   JOIN ad_process_request q ON q.ad_process_request_id = r.ad_process_request_id
   JOIN ad_process p ON p.ad_process_id = q.ad_process_id
   WHERE p.value = 'AcctServerProcess'
   ORDER BY r.start_time DESC
   LIMIT 10;
   ```
   The manual row's `channel` must be `Background` (never `Direct`), and its `request_client` must be the caller's client.
7. **The recurring row is untouched.** Snapshot the recurring request before and after, and diff every column — only scheduler-owned timing may differ:
   ```sql
   SELECT * FROM ad_process_request WHERE ad_process_request_id = '<recurring id>';
   ```
   Nothing this endpoint does may change it.
8. **Read isolation.** As tenant A's admin, confirm a manual run performed by tenant B inside the same time window does **not** appear in the history. (Runs from the System cadence *do* appear — that is intended.)
9. **No log in the DOM.** With a history row whose `AD_PROCESS_RUN.LOG` is non-empty in the DB, search the rendered page (and the network response) for any of that log text. There must be none, and there must be no expand/details affordance on a row.
10. **Refusals.** Press **Run now** twice in rapid succession, or press it while the cadence run is mid-flight on the same client/org, and confirm the refusal renders as a message (not as a started run) with `data-reason="alreadyRunning"`.
11. **System context.** Log in with a System-context session and press **Run now** — the message must be the `systemClientNotScopable` one ("Switch to a specific company…"), and nothing must be scheduled.
12. **Non-admin.** With a restricted role, the menu entry must be absent whatever the flag says, and navigating to `/acct-process-monitor` directly must render the **no-access** card, not a crash and not data.
13. **Statuses in Spanish.** Switch the UI to Spanish and confirm every status renders as a word (`Correcta`, `Error`, …) and never as `SUC`/`ERR`.

### What QA could NOT verify on the reference instance

Recorded honestly so nobody reads absence of evidence as evidence:

- **Non-admin denial at runtime.** The instance holds only one Etendo GO account, so no second, restricted session could be produced. The denial path is covered by unit tests (`SFAcctProcessMonitorTest` — restricted role, no role, and restricted-role-with-`Action=trigger`) and by the mocked E2E spec, but it was **not** exercised against a live server. Step 12 above is the first opportunity to close this.
- **Documents actually being posted.** The instance had **zero** unposted documents anywhere, so every manual run was a legitimate no-op. The run was proven to *execute with the right scope* (see below), but "the caller's pending documents got posted, and only the caller's" has not been observed end to end against a real backlog.
- **The `alreadyRunning` refusal, live.** Runs finish in roughly 85 ms, so the race could not be won by hand. Unit-covered (`A run already in progress refuses the trigger instead of stacking a second one`, `A one-shot already queued for this client refuses the trigger`), not runtime-observed.

These correspond to the open `manual-trigger-runtime-verification` item in `flags-registry.json`.

---

## Automated evidence

**Runtime evidence gathered on a live instance (ETP-5269 QA):**

- The recurring request row was **byte-identical across all 47 columns** before and after two manual runs.
- **Client scoping proven three ways**, the decisive one being `AcctServerProcess`'s own execution log: the System cadence run logged **3** "Starting background process" markers (one per tenant), while each manual run logged exactly **1**.
- **Read isolation:** another tenant's run falling inside the returned time window was absent from the response.
- The `log` column is genuinely populated in the DB (**4,153 characters** on a cadence run), and the API row keys are exactly `[duration, endTime, id, manual, startTime, status]` — the log does not cross the wire.
- The UI **converged without a manual refresh** (~9 s observed), via the 5 s poll bounded at 60 s.

**Frontend:**

- `tools/app-shell/src/pages/AcctProcessMonitorPage.jsx` — the page; `acct-process-monitor/RunStatusPill.jsx`, `acct-process-monitor/useAcctProcessMonitor.js`.
- `tools/app-shell/src/lib/acctProcessMonitorApi.js` — `fetchAcctProcessStatus` / `triggerAcctProcessRun`, both through `fetchNeoWebhookJson` (shared base URL, fresh token, `{result: "<json-string>"}` unwrap).
- `tools/app-shell/src/runtime-routes.jsx` — unconditional `lazyRoute('acct-process-monitor', …)`.
- `tools/app-shell/src/menu.json` — Settings item, `capability: "isAdminOrClientAdmin"`.
- `tools/app-shell/src/lib/flags/flag-keys.js` + `index.js` — `ACCT_PROCESS_MONITOR`, `FLAG_DEFAULTS[…] = false`.
- `tools/app-shell/src/components/layout/SideMenu/SideMenu.jsx` — `flagGatedItems` / `isFlagVisible`, applied to Favorites too.
- i18n: **43 `acctProcess*` keys**, present in all three locales (`en_US.json`, `es_ES.json`, `es_AR.json`).

**Frontend tests (93 new cases):**

- `tools/app-shell/src/pages/__tests__/AcctProcessMonitorPage.vitest.jsx` — 38 cases.
- `tools/app-shell/src/pages/acct-process-monitor/__tests__/useAcctProcessMonitor.vitest.js` — 36 cases, including the `awaitingRun` poll and its 60 s deadline.
- `tools/app-shell/src/lib/__tests__/acctProcessMonitorApi.vitest.js` — 12 cases.
- `tools/app-shell/src/pages/acct-process-monitor/__tests__/RunStatusPill.vitest.jsx` — 7 cases.
- `tools/app-shell/src/components/layout/SideMenu/__tests__/SideMenu.vitest.jsx` + `windows/__tests__/navigationExpectations.js` (`catalogFeatureFlags`) + `windows/__tests__/registry.vitest.jsx` (`capabilitySiblings`) — catalog membership and flag gating. `registry.vitest.jsx` needed the `capabilitySiblings` change because a capability is a **named boolean**, not a per-entry grant: this is the second `isAdminOrClientAdmin` entry next to `roles`, which made that latent distinction visible.
- Whole-suite result at delivery: **16,348 vitest + 2,160 node tests green**.

**E2E — `e2e/tests/flows/acct-process-monitor.mocked.spec.js`** (13/13 in **both** flag arms):

- `the initial read never carries Action, so loading the page cannot fire the process`
- `Run now converges on the new run by polling, with no manual refresh` — the mock models the real ordering (the triggering response cannot contain the new run), so the spec fails if the poll regresses
- `Run now stays disabled across the gap before the run is observable` / `… once the backend reports the run in progress`
- `a refusal is shown as a message, not as a started run`
- `never renders the raw process log, before or after a trigger` — the fixtures deliberately send a `LOG_SENTINEL` the backend would never emit
- `shows each status as a human label, never the raw three-letter code`
- `a denial from the backend renders the no-access state, not a crash`
- menu gating: `flag on: an admin sees the menu entry and it opens the page`, `flag off: the menu entry is not offered`, `flag off: the route still works — the flag is not the authorization boundary`
- non-admin: `does NOT see the menu entry, whatever the flag says`

Run it with (mock mode only; never `make dev-mock`, whose in-page `window.fetch` replacement bypasses `page.route()`):

```bash
# flag off (default)
npx vite --port 3105
E2E_USE_MOCK=1 BASE_URL=http://localhost:3105 \
  npx playwright test tests/flows/acct-process-monitor.mocked.spec.js --project=mocked

# flag on
VITE_FEATURE_FLAGS='{"acct-process-monitor":true}' npx vite --port 3105
E2E_USE_MOCK=1 BASE_URL=http://localhost:3105 E2E_ACCT_PROCESS_MONITOR_FLAG=on \
  npx playwright test tests/flows/acct-process-monitor.mocked.spec.js --project=mocked
```

**Backend (`com.etendoerp.go`):**

- `src/com/etendoerp/go/schemaforge/webhooks/SFAcctProcessMonitor.java` — the endpoint; its class javadoc is the canonical rationale for the one-shot mechanism, the channel choice and the non-exposure of the log.
- `src/com/etendoerp/go/schemaforge/NeoPseudoSpecDispatcher.java` — routes the `acctprocessmonitor` pseudo-spec; `GET` only.
- `src-test/…/webhooks/SFAcctProcessMonitorTest.java` — **31 tests**, including: the one-shot bundle is built from the calling client and not the recurring System row; the channel is `BACKGROUND`, never `DIRECT`; triggering never writes or mutates the recurring row; a bare GET never reaches the scheduler; an unrelated `Action` value is a read; `Action` matching is case-insensitive; the recurring lookup excludes both one-shot channels and is deterministically ordered; the log and report never reach the response; history and both in-progress probes use the scopes described above; a System-context caller is refused and schedules nothing; the post-trigger read order.
- `src-test/…/NeoPseudoSpecDispatcherTest.java` — **29 tests** total, two of them new: bridge dispatch with an `SFAcctProcessMonitor` instance, and `405` for a non-GET.
- Gradle result at delivery: **31 + 29 green**.

**Registry:**

- `flags-registry.json` → `acct-process-monitor` — owner, Jira, TTL `2026-12-31`, owned paths, the `$scopeChangeComment` recording the client-scope product decision, the `$defectFoundComment` recording the `DIRECT`→`BACKGROUND` defect, and the one open `manual-trigger-runtime-verification` item.

---

## See also

- [`not-posted-documents.md`](not-posted-documents.md) — the companion window: *which* documents are unposted, and posting them by hand.
- [`../feature-flags.md`](../feature-flags.md) §3 — why a frontend flag is visual gating and never authorization; the `/upgrade` precedent this page follows.
- [`app-shell-functional-flows.md`](app-shell-functional-flows.md) — the shared app-shell guide, including the other admin-only synthetic page (`/roles`, ETP-4513) this one is modelled on.
- `com.etendoerp.go/docs/neo-headless.md` §4.10–4.11 — the NEO pseudo-spec bridge pattern used to expose the webhook.
