---
name: etendo-roadmap
description: >
  File, triage and audit public GitHub issues on the Etendo Roadmap (etendosoftware org project
  #12): pick the target repo (Etendo product issues go to etendosoftware/etendo-ai, Classic ones
  to their own repo), search for duplicates, create the issue, add it to the project and set
  Product / Team / Status, cross-link Jira, turn a Datadog finding (or the Jira task it backs)
  into a Roadmap issue, or produce the read-only Roadmap hygiene report. Use before running `gh
  issue create` for an idea, bug or feature, and whenever a Roadmap item needs a field read or
  written. Triggers on: "roadmap", "Etendo Roadmap", "crear issue", "issue de GitHub", "GitHub
  issue", "etendo-ai", "Product field", "triage", "higiene del roadmap", "roadmap hygiene",
  "datadog", "lo vi en datadog", "alerta", "monitor", "error en producción".
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
  one or more Jira tasks implementing it, created inside the current epic. Cross-link both ways
  (recipe below). The implementing PR references the issue by its full
  form when the issue lives in another repo (`Fixes etendosoftware/etendo-ai#N`), or `Fixes #N`
  when it is in the same repo as the PR. Our PRs target `develop`, not the default branch, so a
  cross-repo `Fixes etendosoftware/etendo-ai#N` does **not** auto-close the issue: once the fix is
  merged, the issue is closed (or its Status set to `Done`) by hand, and only with the user's
  authorization.
- **An idea may stay on GitHub** with no Jira task until it is accepted.
- **Jira → GitHub is optional.** A Jira task needs no GitHub issue.

### Cross-link recipe

**GitHub side** — comment the key AND the full Jira URL; a bare key is not clickable on a public
repo:

```bash
gh issue comment <issue-url> --body "Tracked in ETP-1234 (https://etendoproject.atlassian.net/browse/ETP-1234)"
```

**Jira side** — append the issue URL to the task description through Jira REST v2: GET → append →
PUT → read back. Use REST, not `jira issue edit`: its markdown conversion mangles the existing
`{{…}}` and `h1.` wiki markup. Auth is the `login` from `~/.config/.jira/.config.yml` plus
`$JIRA_API_TOKEN`:

```bash
KEY=ETP-1234; ISSUE_URL=https://github.com/etendosoftware/etendo-ai/issues/N
AUTH="$(awk '/^login:/{print $2}' ~/.config/.jira/.config.yml):$JIRA_API_TOKEN"
API=https://etendoproject.atlassian.net/rest/api/2/issue/$KEY
D=$(mktemp -d)
curl -s -u "$AUTH" "$API?fields=description" | jq -j '.fields.description // ""' > "$D/old"
{ cat "$D/old"; printf '\n\nGitHub issue: %s' "$ISSUE_URL"; } > "$D/new"
jq -n --rawfile d "$D/new" '{fields:{description:$d}}' \
  | curl -s -u "$AUTH" -X PUT -H 'Content-Type: application/json' --data @- "$API"
curl -s -u "$AUTH" "$API?fields=description" | jq -j '.fields.description // ""' > "$D/after"
head -c "$(wc -c < "$D/old")" "$D/after" 2>/dev/null | cmp -s - "$D/old" && grep -qF "$ISSUE_URL" "$D/after" && echo LINK-OK
```

Done when the comment exists and the read-back prints `LINK-OK`: the old description is an exact
prefix of the new one, so the append replaced nothing. A missing `LINK-OK` means "inspect the
description by hand", not "the append failed": Jira may normalize CRLF or trailing whitespace on
save. Never re-append blindly, since that duplicates the line.

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
the code repos — with 2–3 keyword variants, each run through both commands:

1. the **distinctive identifier**: a method name, error string or log fragment
   (`server/discover`);
2. the **noun phrase** of the title (`stateless mode`);
3. the **protocol or feature term** (`MCP`).

```bash
gh issue list -R etendosoftware/etendo-ai --state all --search "<keywords>" --limit 20
gh search issues --owner etendosoftware "<keywords>" --limit 20      # open and closed
```

Pair a generic term with a distinctive one: on its own, "MCP spec" pulls in every NEO "spec"
issue. The same search answers the reverse question "I see this log line — is it tracked?": run
the log text against `etendo-ai` and Jira (`jira issue list -q 'text ~ "<fragment>"'`).

A match → report it with its URL and stop; add it to the Roadmap (§4) if it is missing there,
instead of filing a twin. Done when every variant has run through both commands and every hit is
either linked or ruled out with a one-line reason (`#41 — NEO spec loader, unrelated`).

## 4. Create → add to project → set fields

**Pre-flight first.** Run `gh auth status` and confirm its token scopes list `project`. Missing →
stop BEFORE `gh issue create` and hand the user the fix in §7. Creating the issue and then failing
on `item-add` leaves a half-done state.

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

**Read back** everything that was written:

```bash
gh issue view <issue-url> --json title,labels,projectItems
gh api graphql -f query='query($item:ID!){node(id:$item){... on ProjectV2Item{
  p:fieldValueByName(name:"Product"){... on ProjectV2ItemFieldMultiSelectValue{options{id name}}}
  t:fieldValueByName(name:"Team"){... on ProjectV2ItemFieldSingleSelectValue{optionId name}}
  s:fieldValueByName(name:"Status"){... on ProjectV2ItemFieldSingleSelectValue{optionId name}}}}}' \
  -f item=<ITEM_ID>
```

`projectItems` shows only the project title and Status, never Product or Team: it confirms the
add, and the GraphQL read is still what proves the fields.

Done when title, labels, Product, Team and Status read back as intended, and the report lists the
issue URL, the item ID and every field set. A call that failed is reported as pending, never as
done.

**A scope error mid-way** (the issue exists, a `gh project` call failed): keep going with the steps
that need no project scope — the cross-link comment and the Jira link (§1) — and report each
project step (item-add, Product, Team, Status) as pending with the §7 fix. Re-run only those steps
once the scope is granted, against the issue that already exists; the issue is created once.

## 5. From a Datadog finding (Etendo GO, optional)

A documented path, not a mandatory one: something surfaces in Datadog (an error, a log pattern, a
monitor alert, an incident, an APM trace, a RUM error) and ends up tracked. A finding is not always
a bug: one that reveals a missing feature (MCP `server/discover` unsupported → ETP-5640) is labelled
`Mejora`; a defect is labelled `bug`. Either way the body carries the `## Datadog evidence` section.

### Gather the evidence (every entry point)

Use the Datadog MCP tools (`mcp__plugin_datadog_mcp__*` — `search_datadog_logs`,
`get_datadog_trace`, `search_datadog_spans`, `search_datadog_monitors`, `get_datadog_incident`,
`search_datadog_rum_events`) and the `datadog:*` skills; follow the Datadog MCP's own instructions
for loading its skill guides first. `/datadog:ddtoolsets` enables a missing toolset; the
`datadog://mcp/whoami` resource shows which Datadog identity the MCP runs as. Read service and env
names from the finding itself; never assume them.

Done when you hold: a link to the trace, log query or monitor; the service and env; first and last
time seen; and the frequency (count over a stated window). Strip customer data (emails, tax IDs,
tokens) from every pasted log line.

### Entry points

Pick the one that matches what already exists:

- **(a) Datadog → issue → Jira.** Nothing is tracked yet. Run the duplicate search (§3) with the
  error signature, file the issue in `etendosoftware/etendo-ai` with the evidence under
  `## Datadog evidence` and add it to the Roadmap with Product = `Etendo`, Status `Todo` and the
  Team when known (§4). Then create the Jira task inside the current epic and cross-link both ways
  (§1).
- **(b) Jira first.** The Jira task already exists. Find its Datadog evidence — the task
  description or its analysis doc usually names the log line — gather it as above, then file the
  issue (§3, §4) and cross-link it to that task (§1). The existing task is the Jira side; create no
  second one.
- **(c) Datadog → Jira only.** Ask the user whether to publish a public issue; the user decides,
  every time. On a no, create only the Jira task inside the current epic, with the
  `## Datadog evidence` section in its description.

Done when every artifact the entry point calls for exists and the cross-links read back (§1).

Roles: Clerk creates the issue and the Jira task; the coordinator or the user supplies the Datadog
evidence (or asks for it to be gathered as above).

### Marking the finding in Datadog: decided scope

Traceability lives in the GitHub issue (with the Datadog query link) and the Jira task,
cross-linked both ways. Nothing is written back into Datadog:

- **Datadog Cases (Work Management) are not used.** Logs are immutable and a Case does not mark or
  filter them; it is a separate work item pointing at them, duplicating the issue and the task.
- **Error Tracking** only takes `error`-status events, so WARN lines never become Issues. Backend
  `etendo-core` logs do not reach it at all today (only `etendo-go-web`, the SPA, does), likely
  because Java stack traces are ingested as separate lines. For an SPA error, optionally comment
  and triage its Error Tracking Issue; that needs the `error-tracking` toolset plus MCP write
  permissions, which are not exposed today (see §9).

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
Read an item's value back with the combined query in §4.

The mutation's input shape was confirmed by schema introspection
(`__type(name:"ProjectV2FieldValue")`), not by mutating a real item, so the read-back in §4 is
what proves a write.

## 7. Auth

`gh` needs scope `read:project` to read the project and `project` to write it; §4's pre-flight
checks it before anything is created. On a `missing required scopes` error, stop and tell the user to run
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

## 9. Open questions / revisit later

Recorded so they are not re-investigated from scratch; none is current practice.

- **Datadog Cases** could later serve as a work queue with a native Jira link. Blocked so far: the
  Datadog MCP exposes no write tools even with the Standard role — an org-level MCP write setting
  is suspected.
- **Multiline log aggregation** for the Java source would let backend `etendo-core` errors reach
  Error Tracking.
- **A log monitor** whose message carries the Jira and GitHub links is the lightweight option if
  in-Datadog visibility is ever needed.
