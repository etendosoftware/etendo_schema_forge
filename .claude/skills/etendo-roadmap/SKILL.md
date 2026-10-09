---
name: etendo-roadmap
description: >
  File, triage and audit public GitHub issues on the Etendo Roadmap (etendosoftware org project
  #12): pick the target repo (Etendo product issues go to etendosoftware/etendo-ai, Classic ones
  to their own repo), search for duplicates, create the issue, add it to the project and set
  Product / Team / Status, cross-link Jira, turn a Datadog finding into a Roadmap bug plus Jira
  task, or produce the read-only Roadmap hygiene report. Use before running `gh issue create` for
  an idea, bug or feature, and whenever a Roadmap item needs a field read or written. Triggers
  on: "roadmap", "Etendo Roadmap", "crear issue", "issue de GitHub", "GitHub issue", "etendo-ai",
  "Product field", "triage", "higiene del roadmap", "roadmap hygiene", "datadog", "lo vi en
  datadog", "alerta", "monitor", "error en producción".
---

# Etendo Roadmap

The single source for maintaining the Etendo Roadmap: where an issue is filed, how it reaches the
project, and every project/field/option ID. Other skills and agents point here rather than copying
any of it.

## 1. Decide whether it gets a GitHub issue

A GitHub issue is for **public** things only: an idea, bug or feature a user or customer could see
on the public roadmap. Internal work (refactors, tooling, agent config, CI, internal tech debt)
lives in Jira alone. Unsure whether something is public → ask the coordinator or the user.

**GitHub ↔ Jira is asymmetric:**

- **GitHub → Jira, required on acceptance.** Once an issue is accepted as a feature or bug, it gets
  one or more Jira tasks implementing it, created inside the current epic. Cross-link both ways:
  the GitHub issue URL in each Jira task description, and the Jira key(s) on the GitHub issue as a
  comment (`Tracked in ETP-1234, ETP-1235`). The implementing PR references the issue by its full
  form when the issue lives in another repo (`Fixes etendosoftware/etendo-ai#N`), or `Fixes #N`
  when it is in the same repo as the PR. Our PRs target `develop`, not the default branch, so a
  cross-repo `Fixes etendosoftware/etendo-ai#N` does **not** auto-close the issue: once the fix is
  merged, the issue is closed (or its Status set to `Done`) by hand, and only with the user's
  authorization.
- **An idea may stay on GitHub** with no Jira task until it is accepted.
- **Jira → GitHub is optional.** A Jira task needs no GitHub issue.

## 2. Route it to a repo

The target repo is a rule, not a choice:

| The issue is about | Product | File it in |
|---|---|---|
| The Etendo product — the SPA / Etendo GO stack: `etendo_schema_forge`, `etendo_schema_forge_core` (`schema_forge_core`), `com.etendoerp.go` | `Etendo` | **`etendosoftware/etendo-ai`** — never the code repo |
| Classic — `etendo_core` and every other module or bundle | `Classic` | that module's / bundle's own repo, as before (bug format per `/etendo-workflow-manager`: `[ETP-XXXX] <summary>`, label `bug`) |
| Both, or a repo you cannot place | — | ask before creating; pick neither on your own |

Product issues are filed centrally in `etendo-ai` so they all land on the Roadmap; the code repo is
named inside the body (an `Affected components` / `Repo:` line), not by where the issue lives.

`etendo-ai` labels: `bug` for a bug, **`Mejora`** for a feature or improvement, `idea` for an
idea, plus a `Celula*` team label when the user names a team. The repo also carries GitHub's
default `enhancement`; leave it unused, since the team tags improvements as `Mejora` (14 issues
vs 0 on 2026-10-09). Read the current set with `gh label list -R etendosoftware/etendo-ai`.

## 3. Search for duplicates

Before creating, search both the target repo and the whole org — older Etendo issues still live in
the code repos:

```bash
gh issue list -R etendosoftware/etendo-ai --state all --search "<keywords>" --limit 20
gh search issues --owner etendosoftware "<keywords>" --limit 20      # open and closed
```

A match → report it with its URL and stop; add it to the Roadmap (step 4) if it is missing there,
instead of filing a twin. Done when both searches have run and every hit is either linked or
ruled out as unrelated.

## 4. Create → add to project → set fields

Title, body and labels come from the coordinator or the user; never invent them. Every idea, bug or
feature issue **must** end up on the Roadmap with **Product** set. Also set Team, and Status
(`Todo` by default), when known; set Quarter / Start date / Target date / Score only when the user
gives them.

```bash
gh issue create -R etendosoftware/etendo-ai --title "<title>" --body-file <file> --label <bug|Mejora|idea>
gh project item-add 12 --owner etendosoftware --url <issue-url> --format json      # → .id = ITEM_ID

# Product (GraphQL only — see the gotcha below). Etendo = 4d19f0bf, Classic = 0a7608fb
gh api graphql -f query='mutation($item:ID!){updateProjectV2ItemFieldValue(input:{
  projectId:"PVT_kwDOBlBfO84BPs5X", itemId:$item, fieldId:"PVTMSF_lADOBlBfO84BPs5Xzhj9Ib0",
  value:{multiSelectOptionIds:["4d19f0bf"]}}){projectV2Item{id}}}' -f item=<ITEM_ID>

gh project item-edit --project-id PVT_kwDOBlBfO84BPs5X --id <ITEM_ID> \
  --field-id PVTSSF_lADOBlBfO84BPs5Xzg-CQWI --single-select-option-id <team-option>   # Team
gh project item-edit --project-id PVT_kwDOBlBfO84BPs5X --id <ITEM_ID> \
  --field-id PVTSSF_lADOBlBfO84BPs5Xzg-CQJ0 --single-select-option-id f75ad846        # Status=Todo
gh project item-edit --project-id PVT_kwDOBlBfO84BPs5X --id <ITEM_ID> \
  --field-id PVTIF_lADOBlBfO84BPs5Xzg-CQWQ --iteration-id <quarter-id>              # Quarter
# Dates: --date YYYY-MM-DD; Score: --number N
```

Done when the Product value has been **read back** (query below) and matches, and the report lists
the issue URL, the item ID and every field set. A call that failed is reported as pending, never as
done.

## 5. From a Datadog finding (Etendo GO, optional)

A documented path, not a mandatory one: something surfaces in Datadog (an error, a log pattern, a
monitor alert, an incident, an APM trace, a RUM error) and becomes a Roadmap bug with a Jira task.

1. **Gather the evidence.** Use the Datadog MCP tools (`mcp__plugin_datadog_mcp__*` —
   `search_datadog_logs`, `get_datadog_trace`, `search_datadog_spans`, `search_datadog_monitors`,
   `get_datadog_incident`, `search_datadog_rum_events`) and the `datadog:*` skills; follow the
   Datadog MCP's own instructions for loading its skill guides first. Read service and env names
   from the finding itself; never assume them. Done when you hold: a link to the trace, log
   query or monitor; the service and env; first and last time seen; and the frequency (count over
   a stated window).
2. **File the bug.** Run the duplicate search (step 3) with the error signature, then create it in
   `etendosoftware/etendo-ai` with label `bug` and add it to the Roadmap with Product = `Etendo`,
   Status `Todo` and the Team when known (step 4). The body carries the evidence under a
   `## Datadog evidence` heading, with every item gathered above, so the bug stands on its own
   without Datadog access. Strip customer data (emails, tax IDs, tokens) from pasted log lines.
3. **Create the Jira task** inside the current epic. Its description links the GitHub issue URL;
   then comment the Jira key on the issue (`Tracked in ETP-1234`). Done when both links exist.

Roles: Clerk creates the issue and the Jira task; the coordinator or the user supplies the Datadog
evidence (or asks for it to be gathered as above).

## 6. Project and field IDs

Etendo Roadmap = `etendosoftware` org project **#12**,
https://github.com/orgs/etendosoftware/projects/12, node ID `PVT_kwDOBlBfO84BPs5X`.

| Field | Type | Field ID | Options (option ID) |
|---|---|---|---|
| Product | MULTI_SELECT | `PVTMSF_lADOBlBfO84BPs5Xzhj9Ib0` | Classic `0a7608fb`, Etendo `4d19f0bf` |
| Status | SINGLE_SELECT | `PVTSSF_lADOBlBfO84BPs5Xzg-CQJ0` | Todo `f75ad846`, In progress `47fc9ee4`, Done `98236657`, Dropped / Archived `e9b20cd1` |
| Team | SINGLE_SELECT | `PVTSSF_lADOBlBfO84BPs5Xzg-CQWI` | Functional 💻 `9282166a`, Plataforma 🛠️ `8a5d08e5`, Localización Española 🇪🇸 `478d0b17`, Contabilidad 🧮 `c06c28c0`, Finanzas 💶 `74a3bfba`, Compras 🛒 `ff4826cc`, Ventas 🛍️ `ffd51d66`, Almacenes 🏬 `9cda8e9e`, Roles y Usuarios `b3638232` |
| Quarter | ITERATION | `PVTIF_lADOBlBfO84BPs5Xzg-CQWQ` | Q4 2026 `82e2a43e`, Q1 2027 `18fcf7e4` |
| Start date | DATE | `PVTF_lADOBlBfO84BPs5Xzg-CQWU` | `YYYY-MM-DD` |
| Target date | DATE | `PVTF_lADOBlBfO84BPs5Xzg-CQWY` | `YYYY-MM-DD` |
| Score | NUMBER | `PVTF_lADOBlBfO84BPs5Xzg-CZ40` | number |

IDs verified 2026-10-09. Quarters roll: a past quarter leaves the active list (Q3 2026 `a0844f8e`
already has). For the current set, or after any "unknown ID" error, re-read rather than guess:

```bash
gh project field-list 12 --owner etendosoftware --format json
gh api graphql -f query='{node(id:"PVT_kwDOBlBfO84BPs5X"){... on ProjectV2{fields(first:40){nodes{
  ... on ProjectV2MultiSelectField{id name multiSelectOptions{id name}}
  ... on ProjectV2IterationField{id name configuration{iterations{id title}}}}}}}}'
```

### Product gotcha

`gh project field-list` prints Product with an **empty** id and name, `gh project item-list` omits it
from its JSON entirely, and `gh project item-edit` has no flag for multi-select values. Product is
read and written through GraphQL only. The write takes `multiSelectOptionIds: [String!]` — the
**full** set, it replaces, so writing `["4d19f0bf"]` on an item tagged Classic drops Classic.
Read an item's value back with:

```bash
gh api graphql -f query='{node(id:"<ITEM_ID>"){... on ProjectV2Item{fieldValueByName(name:"Product"){
  ... on ProjectV2ItemFieldMultiSelectValue{options{id name}}}}}}'
```

The mutation's input shape was confirmed by schema introspection
(`__type(name:"ProjectV2FieldValue")`), not by mutating a real item, so the read-back in step 4 is
what proves a write.

## 7. Auth

`gh` needs scope `read:project` to read the project and `project` to write it. On a
`missing required scopes` error, stop and tell the user to run
`! gh auth refresh -h github.com -s project` — it is interactive, so the user runs it. The same
missing scope also breaks `gh pr edit`; the REST API (`gh api -X PATCH repos/<o>/<r>/pulls/<N>`)
needs no project scope.

## 8. Roadmap hygiene (read-only report)

When asked to review the Roadmap, pull every item plus Product (which item-list omits):

```bash
gh project item-list 12 --owner etendosoftware --limit 500 --format json
gh api graphql --paginate -f query='query($endCursor:String){node(id:"PVT_kwDOBlBfO84BPs5X"){
  ... on ProjectV2{items(first:100, after:$endCursor){pageInfo{hasNextPage endCursor} nodes{id
  fieldValueByName(name:"Product"){... on ProjectV2ItemFieldMultiSelectValue{options{name}}}}}}}}'
```

Report, per item (title, repo, URL), every item that has:

- a Target date in the past while Status is `Todo` or `In progress`;
- no Product, or no Team;
- no Status;
- a closed issue while Status is neither `Done` nor `Dropped / Archived`;
- an Etendo-product issue still filed in a code repo instead of `etendo-ai` (informational — it
  predates the routing rule; moving it is a user decision).

Done when every item has been checked against every criterion and the report gives a count per
criterion.

The report changes nothing. Existing items and issues are closed, moved, re-statused, transferred
or edited **only** with the user's explicit authorization for that specific change.
