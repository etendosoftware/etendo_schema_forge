# MCP routines — chained calls and saved flows in the Etendo GO MCP

| | |
|---|---|
| Status | Draft / Pending approval |
| Jira | [ETP-6236](https://etendoproject.atlassian.net/browse/ETP-6236) |
| Issue | [etendo-ai#51](https://github.com/etendosoftware/etendo-ai/issues/51) |
| Module | `com.etendoerp.go` (MCP server, `src/com/etendoerp/go/mcp/`) |
| Related | OKR O2, KR2.1 (Etendo GO MCP vs Holded MCP) — phase 4 of the plan, single-call writes |

## 1. Goal

Let an agent run a multi-step business flow **in one call**, feeding the results of one step into the
next, and **save that flow as a routine** it can run again by passing only its parameters.

Constraint: **one new tool** (`etendo_routine`). The tool catalog must not grow with every new flow.

## 2. What exists today (GO `develop`, `237bf5288`)

- `etendo_batch` (`McpToolRouter.handleBatch` → `BatchService`) runs **only `create`** operations,
  across entities.
  - It chains with `parentRef:<opId>` (parent FK) and `"$ref:<opId>"` inside `body`
    (`BatchService.REF_PREFIX`), which **only resolves the `recordId`** of an earlier op.
  - Modes: asynchronous by default (a job that commits row by row) or `async:false` (atomic).
  - When an op triggers an Etendo process, that process commits on its own and cannot be rolled back
    (`atomic:false` + `persisted`).
- `McpToolRouter.route(toolName, args, scopes)` is the single dispatch point: it runs
  `rejectUnknownArguments`, `authorizeSpecAccess` and the per-tool handlers. `McpVectorSearchTool`
  already calls `route("etendo_list", …)` internally. A routine can therefore run **every step through
  `route()` and inherit role, spec access and scopes with no new security code**.
- `McpActionEnvelope`, `etendo_action_batch` and `McpPrintTrigger` (server-side PDF after a DocAction)
  apply unchanged when a step goes through `route()`.

`etendo_batch` is not modified by this proposal (see §6).

## 3. MVP

One tool, `etendo_routine`, with a `mode` argument:

| mode | What it does |
|---|---|
| `exec` | Runs an inline list of steps, in order, without saving them. |
| `run` | Runs a saved routine by name, with `params` (and optionally `version`). |
| `save` | Saves a routine: name, description, declared parameters and steps; or builds it from a successful inline execution (`fromExecution`, §3.5). |
| `list` | Lists the user's routines (name, description, parameters, current version). |
| `describe` | Returns one routine in full (steps and parameters); the current version by default. |
| `update` | Creates a new version of a routine and makes it current. |
| `delete` | Deletes a routine with all its versions. |
| `execution` | Reads a past execution by `executionId` (the full result of every step). |

### 3.1 Step shape

```json
{
  "id": "prod",
  "tool": "etendo_create",
  "args": { "spec": "product", "entity": "...", "body": { "name": "$param.name" } },
  "returnResult": true
}
```

- `tool`: an existing tool, executed through `route()`. Allowed in the MVP: `etendo_list`,
  `etendo_get`, `etendo_selectors`, `etendo_defaults`, `etendo_create`, `etendo_update` and
  `etendo_action`. `etendo_delete`, email and PDF tools are excluded (irreversible or with external
  effects); `save`, `update` and `exec` reject a step that uses them.
- References (string substitution inside `args`):
  - `$ref:<stepId>` → the step's `recordId` (same meaning as in `etendo_batch` today).
  - `$ref:<stepId>.<path>` → a field of the step's result (e.g. `$ref:bp.data[0].id`).
  - `$param.<name>` → a routine parameter.
  - A reference may only point to an earlier step.
- `returnResult` (optional): marks the steps whose full result goes into the response (§3.2).
- At most **20 steps** per routine; `save`, `update` and `exec` reject more. Volume belongs to
  `etendo_batch`.
- Execution is **sequential** and stops at the first error.

### 3.2 Response

Every execution (`exec` or `run`) returns an `executionId` (from phase 2, when executions are stored).

- Success: `{ ok:true, executionId, steps:[{id, ok, recordId?}], results:{<stepId>: …} }`.
  `results` holds the full result of the steps marked `returnResult:true`; when none is marked, only
  the last step's result.
- Failure: `{ ok:false, executionId, failedAt:{id, index}, error, completed:[{id, recordId}],
  pending:[ids] }`, so the agent knows what was done and what was not.
- The server stores the full result of every step; `mode:"execution"` with the `executionId` returns
  it later if the agent needs it.

**Transactions: commit step by step.** Each step commits when it finishes (an `etendo_action` already
commits on its own, so an all-or-nothing routine cannot be promised). On the first error the routine
stops and reports completed and pending steps. No atomicity is claimed.

### 3.3 Storage, ownership and versions

New tables in `com.etendoerp.go`. Like `ETGO_BATCH_JOB`, they are plain tables written over JDBC on their own pooled connection (no AD dictionary entry, no DAL entity), so storing a routine or an execution never joins the steps' business transaction:

| Table | Content |
|---|---|
| `ETGO_MCP_ROUTINE` | Name (unique per user), description, owner user, current version. |
| `ETGO_MCP_ROUTINE_VERSION` | Routine, version number, parameters JSON, steps JSON, created date. |
| `ETGO_MCP_ROUTINE_EXEC` | Routine and version (empty for an inline `exec`), user, status, date, result of every step. |

- **Routines are personal.** Only their owner lists, runs, updates and deletes them. When a routine
  runs, every step goes through `route()` with the active role, so a routine never grants more than
  that role already has. Sharing routines between users is out of the MVP.
- **Version history.** `update` creates a new version and makes it current; older versions are kept.
  `run` and `describe` accept `version` to use an older one. `delete` removes the routine and all its
  versions.
- **Typed parameters.** Each parameter declares `name`, `type` (`string`, `number`, `boolean`, `id`),
  `required` and `description`. `run` validates the values before the first step and runs nothing
  when a value is missing or has the wrong type.
- `save` and `update` validate before storing: allowed tools, references only to earlier steps,
  every used parameter declared and every declared parameter used, step limit.
- **Executions are kept indefinitely for now.** A periodic cleanup is evaluated later.

### 3.4 Discovering routines

`list` returns name, description, parameters and current version of every routine of the user, plus
a message recommending the agent to remember its available routines and list them again from time to
time to stay up to date.

The `etendo_routine` description in `tools/list` explains what routines are and that `list` shows the
user's routines. It does not embed routine names, so it does not change per user nor grow with every
routine.

### 3.5 Saving from an execution

The agent tries the steps with `exec` and, once they work, saves them without rewriting them:

```json
{"mode": "save", "fromExecution": "X1", "name": "create-product-with-price",
 "description": "Creates a product and its sales price",
 "params": {
   "name":  {"type": "string", "required": true, "description": "Product name",
             "from": ["prod.args.body.name"]},
   "price": {"type": "number", "required": true, "description": "Sales price",
             "from": ["prod.args.body.listPrice", "price.args.body.price"]}
 }}
```

- The server copies the steps of the execution and replaces every value listed in `from` with
  `$param.<name>`. One parameter may replace several values.
- Only an `exec` execution of the same user that finished with `ok:true` is accepted.
- The resulting routine goes through the same validation as an explicit `save` and starts at
  version 1.
- If a `from` path does not exist in the steps, `save` fails and names the path.

## 4. Benchmark against Holded

Add a third column to the `okr` suite of `mcp-tests`: **Etendo + routine**.

- For every test, a predefined routine that the harness saves with the run's user before starting
  (fixture). Routines are personal, so they never mix with other users'.
- The agent gets the same prompt; the harness measures whether it uses the routine, calls, tokens and
  effect.
- The report shows Etendo without routines vs Holded vs Etendo with a routine.
- **It is reported separately, as a child KR of KR2.1.** KR2.1 keeps measuring Etendo without
  preloaded routines (Holded has none). The child KR measures Etendo + routine against Holded with the
  same formula.

## 5. Implementation phases

| Phase | Scope | Done when |
|---|---|---|
| 1 | `etendo_routine` registered in `ToolRegistry`, `mode:"exec"` with `route()` per step, `$ref` and `$ref.path` substitution, `returnResult`, step limit, allowed-tool list, step-by-step commit and the §3.2 response without `executionId`. No tables yet. | An agent creates a customer and its address in one `exec` call; a failing second step reports the first as completed. |
| 2 | Tables (`ETGO_MCP_ROUTINE*`), stored executions and `executionId`, `save` (explicit and `fromExecution`), `run` with `$param` substitution, `list`, `describe`, `update` with version history, `delete`, typed parameter validation, owner-only access. | A routine saved from an `exec` runs with new parameters; another user cannot see it; `run` with `version` uses an older version. |
| 3 | `mode:"execution"`, JUnit coverage of every mode and error path. | `execution` returns every step result; tests cover the edge cases below. |
| 4 | "Etendo + routine" column in the `okr` suite, routine fixtures per test, child KR in the report and in etendo-kpis. | One full run reports the three columns and the child KR. |

Edge cases to cover (phase 3): reference to a later or missing step, missing or wrongly typed
parameter, a step with a disallowed tool, 21 steps, an `etendo_action` that commits and a later step
that fails, `fromExecution` on a failed or foreign execution, `run` of a deleted routine.

After the tables are created, run `./gradlew export.database` in the Etendo root.

## 6. Out of the MVP

- `when`: conditional steps based on earlier results (reusing `etendo_list` filter operators, not a
  second expression language).
- `forEach`: repeat a step over a list (e.g. the lines of an order).
- Optional steps (`optional:true`): skipped when they fail, with the error reported so the agent can
  fix it.
- Sharing routines between users of the same client.
- Mandatory dry-run when a step is irreversible (email, delete), which would also allow those tools.
- Consolidating report and upload tools (part C of etendo-ai#51).
- `etendo_batch` stays as it is; redirecting it to `etendo_routine` is evaluated once `forEach` and
  an asynchronous mode exist.

## 7. Decisions log

| # | Question | Decision |
|---|---|---|
| P1 | Tools allowed as steps | Read tools plus create, update and action |
| P2 | Failure semantics | Commit step by step; report completed and pending steps |
| P3/P6 | Visibility and ownership | Personal routines; only the owner sees and changes them |
| P4 | Discovery | Through `list`, with a reminder message. Reconfirmed 2026-11-12 after a pilot where the agent never called `list` (2 of 2 attempts): the routines column measures whether the agent finds them on its own; no routine names in `tools/list` (a client caches it until it reconnects) nor in other answers |
| P5 | Benchmark column | Child KR of KR2.1 ("how far do routines take us"): the KR2.1 with every task Etendo lost that has a routine replaced by its result with the routine; only those tasks are run again (`make mcp-compare-routines`). The prompt of a task with a routine ends with the hint "Tenés una rutina guardada para esto: revisá tus rutinas." (2026-11-13) |
| P7 | Updates | Version history; older versions can run |
| P8 | Response | `executionId`; `returnResult` per step, last step by default; `mode:"execution"` reads it all |
| P9 | `etendo_batch` | Unchanged |
| P10 | Execution retention | Indefinite for now |
| P11 | Parameters | Typed (`string`, `number`, `boolean`, `id`), required, description |
| P12 | Step limit | 20 |
| P13 | Save from an execution | In the MVP (`fromExecution`) |
