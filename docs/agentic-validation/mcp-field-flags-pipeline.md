# MCP-facing metadata — what agents see, and where it's configured

**When to read this:** a ticket (or a design question) concerns what the Etendo GO **MCP**
exposes to AI agents at the spec / entity / field level — `agentPrompt`, `businessCritical`,
`visibility`, a per-field `defaultValue`, an entity's `Java_Qualifier`, the available
methods, etc. — or asks to *change* one of those.

**The rule:** everything below is either (a) decided **only in `decisions.json`** and
persisted to the three `ETGO_SF_*` tables by the schema_forge pipeline, or (b) read live
from the Etendo AD dictionary at query time. The NEO/MCP Java **reads and surfaces** this
metadata — it never decides the (a) parts. So a ticket asking to change an (a) value is
**upstream-config**, NOT an MCP code bug. Fixing it in Java is a category error.

The three tables and the pipeline that fills them: `ETGO_SF_SPEC` (one per window/process/
report), `ETGO_SF_ENTITY` (one per tab/entity), `ETGO_SF_FIELD` (one per exposed column).

```
decisions.json → resolve-curated.js → generate-contract.js → push-to-neo.js
  → neo-writer.js → ETGO_SF_{SPEC,ENTITY,FIELD} → ./gradlew export.database
  → NEO Headless / MCP reads the tables and surfaces them to the agent
```

> Anchors below are `file:line` at the time of writing (verified 2026-06-26, ETP-4274).
> `Mcp*` files are in `com.etendoerp.go/src/com/etendoerp/go/mcp/`; `cli/` files are in schema_forge.

---

## SPEC level — surfaced by `neo_discover`

Built by `McpToolRouterSupport.buildDiscoverSpec` (`McpToolRouterSupport.java:191-198`),
called from `McpToolRouter.java:165-168`.

| Agent sees (JSON key) | Surfaced by | `ETGO_SF_SPEC` column | `decisions.json` source |
|---|---|---|---|
| `name` (kebab-case spec name) | `neo_discover` (`McpToolRouterSupport.java:191`) | `NAME` | derived via `toSpecName()` (`push-to-neo.js`) |
| `type` (`"W"` / `"P"` / `"R"`) | `neo_discover` (`:192`) | `SPEC_TYPE` | set by the push path (W for windows) |
| `agentPrompt` (only when non-empty) | `neo_discover` (`:198`) | `AGENT_PROMPT` | `window.agentPrompt` → `resolve-curated.js` → `push-to-neo.js:267` (`normalizeAgentPrompt`) → `neo-writer.js:103,118` |
| `entities` summary — array of `{ name, methods[] }` (W specs only) | `neo_discover` (`buildEntitySummaryArray`, `McpToolRouter.java:167`; name at `McpToolRouterSupport.java:91`) | join to `ETGO_SF_ENTITY` (NAME + method flags) | — (derived from included entities) |

**Stored but NOT surfaced to the agent:** `DESCRIPTION`, `AD_WINDOW_ID`, `AD_PROCESS_ID`,
`AD_MODULE_ID` (`neo-writer.js:115-118`) — they live in the spec row but `buildDiscoverSpec`
does not put them in the discover response.

---

## ENTITY level

| Agent sees / uses | Surfaced by | `ETGO_SF_ENTITY` column | `decisions.json` source |
|---|---|---|---|
| `name` (the `entity` parameter for every CRUD/schema tool) | `neo_discover` summary (`McpToolRouterSupport.java:91`), `neo_schema` | `NAME` | entity name / contract name (`neo-writer.js:173-179`, `push-to-neo.js:571-590`) |
| `methods` — which of GET / GETBYID / POST / PUT / PATCH / DELETE are allowed | `neo_discover` summary + `neo_schema` (`entitySchema.put("methods", …)`, `McpToolRouter.java:649`) | `ISGET`, `ISGETBYID`, `ISPOST`, `ISPUT`, `ISPATCH`, `ISDELETE` (`neo-writer.js:188-189,204`) | `populateWindowSpec` (`push-to-neo.js`) sets the method flags |
| `Java_Qualifier` — **NOT surfaced to the agent**; internal `NeoHandler` routing key (`NeoServlet` dispatch) | not in any agent response | `JAVA_QUALIFIER` (`neo-writer.js:189,205`) | entity-level `javaQualifier` (`resolve-curated.js:539`) |

**`draftMode`** is an entity-level concept declared in `decisions.json`
(`entities.<e>.draftMode`) and carried in the contract; it changes how `neo_create`/
`neo_update` behave but is not a standalone field in the schema response.

---

## FIELD level — surfaced by `neo_schema` (per field) and `neo_defaults`

Each field object is built by `McpToolRouterSupport.buildSchemaField`
(`McpToolRouterSupport.java:312-335`). Field metadata from the table is loaded once by
`loadFieldMetadata` (`:246-265`) and the per-field agent prompt by `loadPromptByColumnId`
(`:279-292`).

| Agent sees (JSON key) | Source kind | `ETGO_SF_FIELD` col / origin | `decisions.json` source |
|---|---|---|---|
| `name` (property key) | from AD | AD_Column property name (`:320`) | `fields.<f>.name` override (`resolve-curated.js:243`) |
| `column` (DB column) | from AD | `AD_COLUMN_ID` → columnname (`:321`) | — |
| `label` | from AD | `AD_Column.name` (`:322`) | AD (or label overrides) |
| `type` (`string`/`number`/`foreignKey`/…) | from AD | mapped from `AD_Reference` (`:323`) | `fields.<f>.type` override |
| `required` | from AD | `AD_Column.isMandatory()` (`:324`) | AD — mandatory is not a decisions knob |
| `readOnly` | computed | `isReadOnlyColumn`: PK / `DocumentNo` / auto-sequence (`:325,381-387`) | also raised by `visibility` → `ISREADONLY` (see below) |
| `defaultExpression` (only when non-empty) | from AD | `AD_Column.getDefaultValue()` read live (`:326,389-392`) | AD |
| **`businessCritical`** (boolean) | **table** | `ISBUSINESSCRITICAL` (`neo-writer.js:314`; `push-to-neo.js:375`) | **`fields.<f>.businessCritical`** (`resolve-curated.js:279`) |
| **`agentPrompt`** (only when non-empty) | **table** | `AGENT_PROMPT` (`neo-writer.js:275,316`; `push-to-neo.js:346-349,382-384`) | **`fields.<f>.agentPrompt`** (`resolve-curated.js:204`) |
| `hasSelector` + `selectorType` (`TableDir`/`Table`/`Search`/…) | computed | from `AD_Reference` (`:332,404-408`) | — |
| button info: `triggerValue`, `action`, `invokeVia:"neo_action"`, `processType`, `processName`, `processId` (button cols only) | from AD | `AD_Column.Process` / `OBUIAPPProcess` (`:334,345-364`) | AD |
| `defaultValue` (resolved on create/read) | **table + AD** | `DEFAULTVALUE` (`neo-writer.js:314`) + AD default cascade | **`fields.<f>.defaultValue`** |

### `visibility` — wired but currently sourced as a pair, not a column

`neo_schema` *can* emit `visibility` + `userRequired` (`addVisibility`,
`McpToolRouterSupport.java:396-400`), reading `ETGO_SF_FIELD.VISIBILITY`
(`loadFieldMetadata:258`). **But the schema_forge writer does not populate that column** —
`push-to-neo.js`'s `mapVisibility` (`push-to-neo.js:52-64`) converts the `decisions.json`
visibility enum into the **`ISINCLUDED` / `ISREADONLY`** pair instead
(`neo-writer.js:314`), which is what `NeoFieldFilter` uses for write-filtering. So today:

- The agent's *functional* visibility signal comes from `readOnly` (above) and from which
  fields appear at all (excluded/`discarded` fields are filtered out via `ISINCLUDED`).
- The explicit `visibility` JSON key only appears once `ETGO_SF_FIELD.VISIBILITY` is
  populated; until a backfill writes it, `addVisibility` gets `null` and skips it.
- `userRequired = ("editable" == visibility) && mandatory` — therefore also gated on that
  column being populated.

The enum mapping (`mapVisibility`): `editable`→(included, not-readonly); `readOnly`/
`system`→(included, readonly); `discarded`→(not-included).

---

## Fix recipe (for any decisions-driven value above)

1. Edit `decisions.json` — `window.agentPrompt` for the spec, `entities.<e>.javaQualifier`
   for the entity, or `entities.<e>.fields.<f>.{businessCritical,agentPrompt,visibility,defaultValue}`
   for a field.
2. `make regen ONLY=<window> PUSH_TO_NEO=1`
3. `./gradlew export.database` in Etendo root — otherwise the config only lives in the DB
   and won't survive a rebuild.

No Java change. No generated-file edit (those are outputs).

---

## `businessCritical` is advisory only

The MCP does **not** enforce `businessCritical` — there is no server-side validation that
blocks a create/update on a critical field. It is a behavioural nudge surfaced to the agent
("confirm with the user first"; the hint string is at `McpToolRouter.java:660-662`). A
ticket reporting "the MCP let me write a businessCritical field without confirmation" is
therefore **not** a code bug — enforcement was never the design.

**Subtlety (ETP-4274, 2026-06-26):** a field can be BOTH `businessCritical` AND have a
resolvable default (e.g. assets `annualDepreciation`). After the ETP-4274 create-defaults
fix, the create path auto-fills such a default when the field is omitted — which matches
`/defaults` and the UI. Not a conflict, but when triaging tickets here, verify an auto-fill
isn't silently setting a value the user was meant to decide.

---

## See also

- `docs/field-visibility-types.md` — the 4 visibility types, write-filtering
  (`NeoFieldFilter`), defaults-per-visibility, common patterns.
- `docs/contract-field-distribution.md` — which contract properties reach backend vs
  frontend.
- `docs/decisions-reference.md` — the full `decisions.json` key reference (this doc is
  linked from its Field Properties section).
