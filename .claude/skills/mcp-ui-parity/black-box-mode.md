# Report mode — black-box parity report

Everything here is observable from the outside: the UI through Playwright, the MCP through its
tools. No source code, configuration file or repository is needed. The output is the report in
[`template.md`](template.md); fixes are out of scope, each finding carries a *suggested fix area*
for the product team instead.

## 1. Inventory the UI (Playwright)

Log in as the tenant user (see *Before every probe session* in `SKILL.md`), open the window from
the menu, and walk it:

- **List view**: is there a *New* button? Kebab (⋮) items, row quick actions, bulk actions,
  filters, exports.
- **A record in each state** (draft, completed, closed, voided…): which buttons are shown, which
  are disabled, which fields are editable, whether *Save* and *Delete* exist.
- **Every button, modal and side panel**: open it, note its fields, options, defaults and the
  messages that block it (limits, required values, warnings).
- **Related windows reached from this one** (e.g. an invoice's *Add payment* creates a payment of
  another window): they belong to this report.
- **Network**: for every action, capture the request (`method`, path, body) and the response
  (status, body) from the browser's network log. The path shows the real route
  (`/sws/neo/<spec>/<entity>/<id>/action/<name>` vs a plain `POST`/`PUT`/`DELETE`).

Capture a screenshot for each capability and each blocked or disabled state.

Done when every visible control of every state has been opened once and either became a matrix row
or is noted as not a capability (navigation, help, favourites).

## 2. Inventory the MCP surface

For each spec the window reaches:

- The tool schemas: `spec` enums and descriptions of `etendo_create`, `etendo_update`, `etendo_delete`,
  `etendo_action`, `etendo_batch`.
- `etendo_discover`: entities, `methods`, `readOnly`, `actions[]`, `configError`, `agentPrompt`.
- `etendo_schema` with `view:"actions"`, `view:"create"` and `view:"full"` per entity.
- `etendo_defaults` and `etendo_selectors` for each create the MCP advertises — and for each one it
  hides.
- The `docs` tool: topics about this area and the recipes they give.

Done when each advertised verb and action is either a matrix row matched to a UI capability or a
row marked "must be hidden".

## 3. Measure, audit, classify

Follow *Method* and the *Surface honesty checklist* in `SKILL.md`, under the *Safe-testing
protocol*. Evidence per row: the screenshot, the UI request/response, the MCP call and answer, and
the independent re-read that confirms the outcome.

Severity scale for bugs: *Critical — data corruption* (wrong rows written), *High* (wrong data
stored, a business rule bypassed, a capability impossible), *Medium*, *Low*.

## 4. Suggested fix area

Each bug, friction and surface-to-hide row names where the fix belongs, in product terms:

| Suggested fix area | When |
|---|---|
| Hide create / update / delete from MCP | the UI never offers that verb on this entity |
| Hide action from MCP | an action or button the UI does not offer to this use case |
| Redirect button to action | a legacy button with a real equivalent the agent should use |
| Declare the action | the UI uses an action the MCP does not list, or lists without its parameters |
| Fix the action contract | parameters, required flags or allowed values differ from what the server accepts |
| Narrow the allowed values | a list parameter offers values the UI never sends |
| Make the error actionable | the message misnames the problem or the hint names no working call |
| Fix the doc recipe | the `docs` tool documents a route that fails or a tool that does not exist |
| Agent guidance | what the agent must know cannot be said by the contract (last resort) |
| Business rule outside the UI | the UI enforces a rule the server does not, so any non-UI caller bypasses it |
| Data check needed | the bug may already have written bad data |

## 5. Deliver

Fill `template.md` (leave *Implementation plan* out), attach or link the screenshots, list the test
data you created and its cleanup, and end with the open decisions for the user.
