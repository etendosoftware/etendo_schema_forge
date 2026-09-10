# Detection plan: false and silent optimistic-locking failures

**Ticket:** ETP-5255 (absorbing ETP-5262, ETP-5263)
**Status:** active
**Scope:** `etendo_schema_forge` (React), `schema_forge_core` (shared cache), `com.etendoerp.go` (Java)

## Why this exists

Four windows failed to save correctly, all reported as one symptom — "someone else modified
this record" when nobody had. They turned out to be **four unrelated mechanisms**, and the
fourth did not raise a conflict at all: it silently overwrote. Fixing the four instances is
not the same as closing the four classes, and this plan is about the difference.

The classes below are ordered by how they were found, not by severity. Each carries a
**one-off sweep** (what is broken now) and a **permanent guard** (what stops it returning).

| Class | Mechanism | Instances found | Closed structurally? |
|---|---|---|---|
| A | `updated` token emitted without a zone offset | 3 handlers | Yes — `toAuditToken` |
| B | Post-hook writes the row after the response was serialised | 1 handler, 4 dispatch sites | Yes — dispatcher refresh |
| C | Two UI triggers into one save, same token | 3 panels | **No** |
| D | Tests asserting on source text, certifying the bug | 1 suite | No |
| E | One DB row reachable under several entity names | 2 alias groups | Partially |

## Class A — token emitted without a zone offset (Java)

Core's reader requires an offset: `JsonUtils.convertFromXSDToJavaFormat` appends `"+0000"`
to a token that lacks one instead of rejecting it, so an offsetless local time is silently
re-read as UTC and every write against that record fails by exactly the server's UTC offset.
`NeoDateFormat.toCanonical` deliberately drops the offset, which is correct for a business
date and wrong for a concurrency token.

Shipped three times: fixed once in `FinancialAccountsPageHandler`, then reintroduced
independently in `ProductPriceHandler` and `ChartOfAccountsHandler`, each time by reaching
for `toCanonical` because it is the obvious-looking tool.

**Sweep** — search by who emits the field, not by the wrong tool:

```bash
cd modules/com.etendoerp.go
grep -rn 'put(FIELD_UPDATED\|put("updated"' src/
```

Every hit must render through `NeoDateFormat.toAuditToken`. Grepping for `toCanonical`
finds the known pattern, not the class — a fourth handler will format it some other way.

**Permanent guard — runtime, ERROR level** (item **L3**; its receiving-end counterpart is
**L2** — see *Log levels* below). A grep cannot cover indirect emitters. Walk the
outgoing body at the single response choke point (`NeoServlet.writeResponse`) and log at
`ERROR` when an `updated` value carries no offset. `ERROR` rather than `WARN` because the
team reads errors through log analysis tooling and would not see a warning; there is
precedent in `NeoWriteRefusalLog.missingUpdated`, which is `ERROR` for the same reason.
This is always a code defect, never transient.

**Permanent guard — static.** In `.githooks/pre-push`, fail when `toCanonical` appears
within a few lines of `FIELD_UPDATED` or `"updated"`. Cheap, and aimed exactly at the
mistake that was made three times.

## Class B — post-hook writes after the response was built (Java)

A handler may write its record inside `afterHandle`. Returning `null` means "keep the
default result", and that result was serialised *before* the write — so the client caches a
token the row has already moved past. ETP-5122 makes the client harvest exactly that value.
Intermittent, because `NeoRecordVersion.equalToTheSecond` zeroes milliseconds: it only fails
when the second write crosses a wall-clock second boundary.

Closed by refreshing the token at the dispatcher rather than in each handler, so the
fourteen handlers that write outside `afterHandle`'s own body are covered without being
audited.

**Sweep** — the invariant is that every dispatch site that can carry a write refreshes:

```bash
cd modules/com.etendoerp.go
grep -rn '\.afterHandle(' src/
```

Current state — 4 real sites, plus two false positives worth knowing (a handler calling
`super.afterHandle`, and a comment):

| Site | Path | Refreshes |
|---|---|---|
| `NeoServletSupport:169` | REST CRUD | yes |
| `McpHookExecutor:164` | MCP | yes |
| `NeoHookDispatcher:142` | sub-endpoints | yes |
| `McpToolRouter:923` | MCP defaults | no — and correctly so: it is a `GET`, so the refresh would be a no-op by its own `isWriteMethod` guard |

**Permanent guard — the highest-value item in this plan.** A JUnit test in `src-test/`
asserting that `afterHandle` is invoked only from the known dispatch sites and that each
write-carrying one routes through `NeoAuditTokenRefresh`. A new dispatch path added without
the refresh silently reintroduces the defect; nothing else would catch it, because the
failure looks like an unreproducible 409 in production rather than a red test. Note the
`McpToolRouter` site explicitly in the test, so a future reader does not have to re-derive
why a GET is exempt.

## Class C — two UI triggers into one save (React) — NOT CLOSED

The shape: one field with two routes into the same persist call — the input's native
`onBlur`, plus a `setTimeout` armed by a stepper or a debounced effect. When the request
outlives the debounce, both fire and the second replays the token the first consumed.
Compounded by guarding on React state (a render behind) instead of a ref, and by comparing
the draft against a prop captured in an earlier render.

Three instances found and fixed the same way (converge on one `commit()` that clears the
pending timer; guard on a ref; compare against the last *persisted* value; queue rather than
drop an edit that arrives mid-flight):

- `windows/custom/contacts/ContactsFinancialPanel.jsx`
- `windows/custom/fiscal-models/models/303/FmModel303Page.jsx`
- `windows/custom/product/ProductPriceBar.jsx`

**A fourth instance was found when the sweep below was actually run** (2026-09-10) and is NOT
yet fixed:

- `windows/custom/amortization/AmortizationLinesTable.jsx`

It is the worst of the four, because it has no guard of any kind — not even a state-based
one. `saveField(lineId, line, fieldKey, value)` is reached from **four** trigger sites on the
same row (`line.id`): the asset selector's `onChange` (immediate, no blur needed, :403), the
percentage input's `onBlur` (:425), the amount input's `onBlur` (:442), and a child's
`onFieldSave` passthrough (:520). Each one issues its own `PUT /lines/{id}`, they are separate
event handlers so nothing serialises them, and the early return compares
`String(line[fieldKey] ?? '')` — `line` is the row object from the **last completed
`fetchLines()`**, i.e. a prop from an earlier render, not the last persisted value. Two of
those writes overlapping means the second carries the token the first already consumed.

**And the refusal is swallowed**, which is what makes it invisible: the call is wrapped in
`catch { /* silencioso */ }` and the success path is `if (res.ok) { fetchLines(); }` with no
`else`. A 409 produces no toast and no error state — the edit simply reappears with its old
value after the next fetch, which reads as "the app lost my change". Note the ETP-4981 comment
twelve lines below in the same file establishing the opposite rule for `DELETE` ("a failed
DELETE must never be silent"); `saveField` predates it and was never brought into line.

**The consequence is not uniform, and this decides what "fixed" means.** Where the endpoint
enforces the token, the user sees a false 409. Where it does not — `FiscalDeclCrudHandler`
`handleDeclPut` never compares `updated` — the later write silently overwrites the earlier.
The second is worse and invisible.

**Do not use "does the panel send `updated`?" to triage this** — a grep for `updated` in the
request body of all 18 custom write paths returns nothing, and that answer is wrong.
`apiFetch` injects the remembered token into every `PUT`/`PATCH` itself
(`VERSIONED_WRITE_METHODS` in `packages/app-shell-core/src/auth/api.js`), so **every** custom
write path participates in the concurrency check whether or not its own source mentions the
token. Only `useEntity` and `recordVersionAliases.js` reference the version cache directly,
which makes the token look far more localised than it is.

**Sweep:**

```bash
cd tools/app-shell/src
grep -rln "method: 'PATCH'\|method: 'PUT'" windows/custom/
grep -rn "setTimeout" windows/custom/ | grep -iE "blur|persist|save|commit"
```

For each panel that persists a field, check: is the in-flight guard a **ref** (not state)?
Does the early-return compare against the last persisted value, or against a prop? Do the
timer and the blur converge on one path?

**Permanent guard — extracted (2026-09-10).** `tools/app-shell/src/hooks/useRecordWriteQueue.js`,
and all four panels now go through it.

**The extraction found that only ONE of the three "fixed" panels was actually correct**, which is
the real lesson of this class. Reading the three implementations side by side to derive a common
contract is what exposed it — each had put the guard at a different layer, and only one layer is
the right one:

| Panel | Guard was keyed on | Verdict |
|---|---|---|
| `FmModel303Page` | the record (whole-record autosave) | correct — but by accident of shape, not design |
| `ContactsFinancialPanel` | the **field** name | correct only because exactly one field persists |
| `ProductPriceBar` | the **input** (`lastCommittedRef` per stepper) | **live defect** |
| `AmortizationLinesTable` | nothing | **live defect** |

The invariant they all missed: **`updated` is a per-RECORD token, so the record is the only
correct unit of protection.** Guarding a field or an input cannot see a sibling writing the same
row. `ProductPriceBar` renders **two** `PriceStepper`s per row — `standardPrice` and `listPrice` —
both issuing `PATCH /price/{row.id}`, each deduplicating only against its own last committed
value; stepping one then the other inside the 400 ms debounce sent two writes carrying the same
token. `ContactsFinancialPanel` keyed its in-flight map by field name, which is wrong for the same
reason and merely unreachable today — the second field to be wired up would have reintroduced the
bug with nothing to catch it.

So "three instances found and fixed" was optimistic: it was two fixed, one fixed at the wrong
layer, and one correct for the wrong reason. A per-record key makes it structural.

**Two things the migration itself taught, both now in the hook's docstring:**

- **A failed write must discard what is queued behind it.** The version cache is only refreshed by
  a *successful* response, so replaying after a refusal carries the very token that was just
  rejected. `write` returns `false` (or throws) to signal it. `ContactsFinancialPanel` already did
  this by hand and the first version of the hook silently removed the behaviour — migrating the
  third panel is what surfaced it.
- **"Did the value change?" has to be re-checked inside `write`, not only where the write is
  requested.** A coalesced replay runs later, and the value it carries may be exactly what the
  open write went on to persist. Checking only at request time turns that into a redundant round
  trip — caught by `ContactsFinancialPanel.singleFlight.vitest.jsx`, which is precisely the
  behavioural coverage a source-text suite could never have provided. Detection then collapses to "grep for panels
that PATCH without the hook", which is the same move `toAuditToken` made for class A: the
right tool becomes the discoverable one. This is a `move-to-core` candidate — see that
skill for the migration mechanics.

An eslint rule is the alternative, but `tools/app-shell` has no eslint configuration today,
so that route means standing up the infrastructure first for a weaker guarantee.

## Class F — the token is harvested ASYNCHRONOUSLY (React / core) — CLOSED

Found by the mocked-Playwright sweep, not by any of the sweeps this plan planned. It is the one
instance that survived every per-panel fix, because it lives one layer BELOW all of them.

`apiFetch` refreshes the version cache from a write's response in a floated promise
(`res.clone().json().then(rememberRecordVersion)` — `harvestWrittenVersion`). Nothing awaited it.
So a second write dispatched as soon as the first one's promise resolved — which is exactly what
`useRecordWriteQueue`'s `finally` does when it replays a coalesced edit — read the cache several
microtasks before the harvest landed, and went out with the token the first write had just
consumed. Journal captured in amortization:

```
PUT #1  amortizationPercentage  updated: <line>-V1   → response updated: <line>-V2
PUT #2  amortizationAmount      updated: <line>-V1   ← reused → 409 stale_record
```

Three things make this the nastiest instance in the whole plan:

1. **The serialisation was correct and the bug survived it.** Per-record single-flight is necessary
   and was not sufficient: ordering the writes does not help if the token is read before the
   previous response has been recorded. Every per-panel fix in Class C was therefore incomplete,
   including the ones this plan called done.
2. **The hook's own docstring asserted the thing that was false** — that the replay reads a cache
   the previous response already refreshed. It described the intent, not the behaviour. A comment
   that states an invariant nobody checks is how this class hides.
3. **It is a race, so it is intermittent.** 12/12 failures at `--workers=1`, but observed passing
   once in ~30 runs under parallel load. The user sees a 409 with no describable pattern, which is
   worse than a deterministic one. Verified as a race and not an absence: a third edit made 1.5 s
   later does carry the current token.

The same defect reached the same code from the opposite direction — `/user/{id}`, where the
header's "Activo" `Switch` (`runInlineToggleRequest`) and the detail form's Save (`useEntity`) are
two modules with no shared state writing one row. That pair cannot be fixed in any component,
which is what forced the fix down to `apiFetch` and, in doing so, closed this class too.

**Fix, in `app-shell-core/src/auth/api.js`:** `harvestWrittenVersion` returns its promise instead
of floating it, and `createApiFetch` serialises versioned writes per record — keyed on (canonical
entity, id), the same key the version cache buckets under, aliases included via
`canonicalEntityName` — awaiting the harvest before releasing the next write to that record.
Different records stay fully parallel; no global lock. Mechanism only: coalescing, rollback and
discard-on-failure stay in `useRecordWriteQueue`, which is policy.

Mutation proof, modelling the replay as two sequentially-awaited PUTs:

```
without the fix:  sent V1, sent V1  → 200, 409
with the fix:     sent V1, sent V2  → 200, 200
```

**Still open, same family, NOT fixed:** a READ's harvest (`harvestReadVersions`) is still floated,
so a write dispatched immediately after a read resolves can find an empty cache and go out with no
token at all → 400 `missing_updated`. Observed while building the probe: the writes only carried a
token once a tick was allowed to pass after the GET. In the app a React render usually intervenes,
which is why this has not been reported — it is latent, not benign. Awaiting every read's harvest
would add latency to every read in the app, so the remedy needs a decision, not a reflex.

**Lesson for this plan's method:** every sweep here greps for a pattern in the panels. This
instance has no pattern in any panel — it is an ordering property of a shared helper. The sweep
that found it was a behavioural test that measured what went out on the wire.

## Class D — tests that certify the bug (cross-cutting)

`ContactsFinancialPanel.test.js` asserted on the component's **source text**. One of its
cases required `setTimeout(onBlur, 400)` to exist — the exact mechanism that caused the
duplicate write. It passed 10/10 both before and after the fix, because it cannot tell
behaviour from formatting. It has been deleted and replaced with a behavioural suite.

The project already forbids this after ETP-4958 shipped a user-visible bug the same way.

**Sweep:**

```bash
grep -rln "readFileSync" tools/app-shell/src/windows/custom/*/__tests__/
```

Any other source-text suite is hiding bugs the same way. Treat each as unverified coverage
until rewritten behaviourally.

**Sweep result (2026-09-10).** The raw grep is useless as written: `readFileSync` matches ~180
files under `windows/custom/`, because the i18n suites read the locale JSON with it too. Filter
to suites that read a `.js`/`.jsx` **source** file and it is **75 suites** — a project-wide
condition far outside this ticket. The subset that matters here is the one asserting on save or
token *mechanics*, since those are the ones that can certify this bug class:

```bash
cd tools/app-shell/src/windows/custom
for f in $(grep -rl readFileSync --include="*.test.js" --include="*.vitest.jsx" . | sort -u); do
  grep -nE "assert\.(match|ok)\(.*(setTimeout|onBlur|updated|PATCH|PUT|debounce|inFlight|saving)" "$f" \
    | sed "s|^|$f:|"
done
```

Six suites match. Five assert on cosmetics (`saving={saving}`, a spinner, `method: 'PUT'`) and
are merely weak. **One certifies the class C defect found above**, and it is the suite for that
very file — `amortization/__tests__/AmortizationLinesTable.test.js`:

| Case | Asserts |
|---|---|
| "saves field on blur via saveField function" | `/saveField/`, `/onBlur/` |
| "saves asset selector immediately on onChange" | `/saveField\(line\.id.*'asset'/` |
| "saves to /lines/{id} via PUT through apiFetch" | `` /`\/lines\/\$\{lineId\}`/ ``, `/method.*PUT/` |
| "Enter key triggers blur to save" | the `onKeyDown` → `blur()` chain |

Between them they pin **each of the four unguarded trigger sites** as a requirement. This is
`ContactsFinancialPanel.test.js` again, one window over: the suite passes identically before and
after a fix, so it cannot distinguish the fix from the defect, and it will keep passing while
demanding the mechanism stay exactly as it is. It must be rewritten behaviourally as part of
fixing the panel, not afterwards.

**Permanent guard.** A regression test must be watched to fail. For each suite, revert the
fix in a scratch copy, confirm the test fails, restore, and verify the production file is
byte-identical again. A test nobody has seen fail is not a regression test — that is the
error that produced this whole class.

## Class E — one row under several entity names (React / core)

The version cache is keyed `(record id, entity)` because an id is only unique within a
table. But several *entity* names can address the same table, and a write through one
refreshes only its own bucket — so a later write through a sibling sends a consumed token.

The sweep below was run against all 72 contracts. **Four** windows carry alias groups, not
just the one that was reported:

| Window | Table | Entities |
|---|---|---|
| `contacts` | `C_BPartner` | `businessPartner`, `customer`, `employee`, `vendorCreditor` |
| `contacts` | `INTR_C_BPARTNER` | `intrastatAdquisitions`, `intrastatShipments` |
| `product` | `M_ServicePriceRule_Version` | `categoryPriceRuleVersion`, `priceRuleVersion` |
| `monitor-verifactu` | `etvfac_inv_sent_status_v` | `facturasAceptadas`, `facturasInvalidas`, `facturasParcialmenteAceptadas`, `facturasRechazadas` |
| `sii-monitor` | `C_Invoice` | `issuedInvoices`, `receivedInvoices`, and both `(previousPeriod)` variants |
| `sii-monitor` | `aeatsii_facturas` | the four `…SiiData` variants |

Only `contacts` is currently mitigated (aliases canonicalised in the cache, declared by the
window rather than hardcoded in the shared package).

**A group is only a defect if two of its entities are WRITTEN.** Triage attempted, and it
does **not** resolve statically — recorded here so the next person does not repeat it:

- No custom UI under `windows/custom/{product,sii-monitor,monitor-verifactu}/` issues a
  `PATCH`/`PUT` through any alias member.
- Grepping the generated pages for a write is meaningless: they delegate to `useEntity`, so
  no literal `PATCH` appears there.
- All six entities checked carry `uiPattern: 'STD'` in the contract, i.e. writable on paper.
  That reflects the AD definition, not whether the app renders them as an editable tab.

So these stay **candidates**. Two ways to settle them, in order of cost: read the generated
page for each window to see which tabs it actually renders (the same check that proved the
contacts group unreachable at the time — `BusinessPartnerPage.jsx` rendered only five tabs),
or let the runtime detector answer it, since a token from the wrong sibling shows up as an
arbitrary delta against a record with no other writer.

`etvfac_inv_sent_status_v` is a database view and the `(previousPeriod)` variants are very
likely the same rows under a different filter, so the two monitors are the least likely to
bite. `product` is the one to read first: it does write, and its price bar was a class C
instance.

**Sweep** — find every window whose contract maps two entities to one table (the key is
`tableName`, not `table`):

```bash
cd /path/to/etendo_schema_forge
python3 - <<'PY'
import json, glob, collections
for path in glob.glob('artifacts/*/contract.json'):
    ents = json.load(open(path)).get('frontendContract', {}).get('entities', {})
    by_table = collections.defaultdict(list)
    for name, e in ents.items():
        t = e.get('tableName')
        if t:
            by_table[t].append(name)
    groups = {t: n for t, n in by_table.items() if len(n) > 1}
    if groups:
        print(path)
        for t, names in groups.items():
            print('   ', t, '->', ', '.join(sorted(names)))
PY
```

**Sweep result (2026-09-10).** Re-run against all 72 contracts: **same 4 windows, 6 groups, no
new ones.** The table above is current. (The sweep prints the accented entity names verbatim —
`facturasInválidas` — so match on the table name, not the entity, when scripting against it.)

Note the constraint any fix must respect: `ad_org` and `ad_orginfo` share a primary key but
are **different tables**, and their `updated` values differ. Collapsing by id would break
them; collapsing by table does not.

**Permanent guard — derive instead of declare.** The aliasing is a fact about the data
model, and the contract already carries `table` per entity, so the cache could canonicalise
by table with no hand-maintained list — and would satisfy the `ad_org`/`ad_orginfo`
constraint by construction. Blocked on the runtime path: the app is configured from NEO
(`ETGO_SF_*`), not from `contract.json`, and the frontend does not currently receive `table`
per entity. Closing this properly means exposing it there.

## Field diagnosis — the detector that covers what the sweeps miss

`NeoRecordVersion` logs both compared timestamps, each as epoch millis, the signed delta and
the server timezone. The delta identifies the class without a debugger:

| Delta | Class |
|---|---|
| Equal to the server's UTC offset (e.g. ±3600000, ±7200000) | A — offset |
| Sub-second, or around 1000 ms | B — post-hook write |
| Two requests in the same millisecond with an identical token | C — double save |
| Arbitrary, with another real writer | Genuine conflict |

The "could not decide" guards log too, because a check that never ran used to look exactly
like one that passed. **All of this is only reachable if the level is right** — see *Log
levels* below; most of these lines are `WARN` today and therefore invisible to the tooling.

**The step that makes this useful:** count these lines somewhere aggregated rather than
waiting for a user to report. The signal should arrive before the complaint does.

## Log levels — what the tracking tooling actually sees

The team reads production through log-analysis tooling that surfaces **`ERROR` only**. A
`WARN` is written, retained, and never looked at. So for every condition in this plan the
level is not a stylistic choice: `WARN` means the signal does not exist. Four conditions must
be `ERROR`, a fifth requirement is that every line name its endpoint: L1, L2, L4 and L5 are in
place under this ticket, L3 is still to do. L5 arrived last and reverses part of L1's original
scoping — read it before acting on the "why not raise every `WARN`" reasoning below.

### L1 — a token clash (the write is refused as stale)

Two sites report it, one per layer. **Both were `WARN`; both are now `ERROR`** — done under
this ticket:

| Site | Was | Now |
|---|---|---|
| `NeoRecordVersion.logVerdict` | `WARN` | `ERROR` |
| `NeoWriteRefusalLog.staleRecord` | `WARN` | `ERROR` | The javadoc on `staleRecord` argues for `WARN` on the grounds that a
clash *can* be legitimate — somebody really did save first — and the user can recover by
reloading. That reasoning is sound in isolation and still loses: the defect we are hunting is
indistinguishable from the legitimate case at the moment of logging, and the four windows in
this plan prove the false version is the common one. A legitimate conflict logged as `ERROR`
is noise that costs a glance; a false conflict logged as `WARN` is a user-visible bug nobody
finds. Both javadocs were rewritten in the same change, since they argued the opposite and would
otherwise have read as an instruction to revert it.

The line already carries what separates the two cases: both timestamps as epoch millis, the
signed delta, and the token as sent. See the delta table above.

### L2 — an INCOMING `updated` with no zone offset

**Nothing detects this today.** `NeoRecordVersion.repairQuietly` hands the token to
`JsonUtils.convertFromXSDToJavaFormat`, which appends `"+0000"` to an offsetless value rather
than rejecting it, so the token parses cleanly and is compared **as UTC**. The unparseable
guard at `NeoRecordVersion.java:202` never fires. The check then answers confidently and
wrongly, off by exactly the server's UTC offset — the product-price defect, invisible.

**Implemented under this ticket.** `parseClientValue` now tests the raw value **before** the
repair, via `hasZoneOffset`, and logs `ERROR` naming the endpoint, the entity, the record, the
raw and repaired tokens and the server timezone. Always a defect on the emitting side — a client
that read the field from a response cannot lose the offset by itself — so it is never transient
and never user-correctable.

The verdict is deliberately **unchanged**: the write is neither refused nor skipped on account
of a missing offset. Refusing would turn a diagnostic into a behaviour change and could reject
writes that succeed today; skipping would hide the very defect being reported. The line says
outright that the verdict beside it is wrong by the server's offset.

Only the part after the `T` is examined. The date half's `-` separators would otherwise read as
a negative offset and the guard would never fire — the one real trap in the implementation, and
what the regression test pins.

Cheap, and it is the only guard that catches Class A **from the receiving end**, including
emitters this repo does not own.

### L3 — an OUTGOING `updated` with no zone offset

The Class A runtime guard at `NeoServlet.writeResponse`, already specified above and already
`ERROR`. L2 and L3 are the same defect caught at opposite ends: L3 names the handler that
emitted it, which is what a fix needs; L2 fires even when the emitter is somewhere we cannot
walk. Both are worth having — L2 is the safety net, L3 is the diagnosis.

### L4 — every line names the endpoint

A defect line has to say which surface produced it. The DAL entity name does not: several
endpoints write the same entity — a window tab, a custom handler and the MCP write path all
reach `BusinessPartner` — so `entity 'BusinessPartner', record '1000042'` says which row moved
and not which caller got it wrong, which is the only part a fix can act on.

**Implemented under this ticket.** `NeoRecordVersion.isStale` takes a fourth argument, the
route, and every line it emits (L1, L2 and all four "did not run" guards) leads with it:

```
PUT /contacts/customer/1000042
```

Built through one shared helper, `NeoRecordVersion.routeOf(httpMethod, specName, entityName,
recordId)`, rather than formatted at each call site — two callers describing the same request
differently gives a log query two shapes to match and it then matches neither reliably. The
shape mirrors what `NeoWriteRefusalLog` already emits, so the refusal line and the comparison
line for one request line up by eye.

The three-argument `isStale` is kept and delegates with a null route, which renders as
`(route not supplied)`. That keeps the fifteen existing test call sites compiling and means a
future caller that has no request context is a degraded line rather than a compile error — but
both production call sites (`NeoCrudHandler.detectStaleRecord`, `McpToolRouter`) pass a real
route today, so `(route not supplied)` appearing in production is itself a finding.

### L5 — the `unparseable` guard, and the `Z` token that could never be checked

**This section reverses a decision made earlier in the same ticket.** The four "concurrency
check did not run" guards were deliberately left at `WARN` when L1 and L2 went to `ERROR`, on
the grounds below. Probing core's parser directly overturned that for one of them.

The parse path was measured end to end (`JsonUtils.convertFromXSDToJavaFormat` followed by
`createDateTimeFormat().parse()`), host TZ `America/Argentina/Cordoba`:

| raw token | repaired | parse |
|---|---|---|
| `2026-08-28T12:30:15Z` | `2026-08-28T12:30:15Z+0000` | **UNPARSEABLE** |
| `2026-08-28T12:30:15+02:00` | `2026-08-28T12:30:15+0200` | ok |
| `2026-08-28T12:30:15+0200` | `2026-08-28T12:30:15+0200+0000` | ok |
| `2026-08-28T12:30:15+02` | `2026-08-28T12:30:15+02+0000` | **UNPARSEABLE** |
| `2026-08-28T12:30:15` | `2026-08-28T12:30:15+0000` | ok — **as UTC** |
| `2026-09-10` | `2026-09-10+0000` | **UNPARSEABLE** |
| `2026-08-28T12:30:15.123Z` | `2026-08-28T12:30:15.123+0000` | **UNPARSEABLE** |

Three consequences, in order of how much they change the picture:

**1. A `Z` token was never concurrency-checked at all.** `Z` is the most canonical way to write
UTC and is valid XML Schema, but the repair appends `+0000` to a token that already ends in `Z`,
and the result does not parse. The write then proceeded **unchecked** — the guard fired, returned
`null`, and `isStale` answered `false`. So the assumption that this guard was a theoretical
safety net was wrong: it is reachable by a perfectly well-formed emitter, and every hit is a
write that skipped the check entirely. That is the same invisible failure the whole ticket exists
to surface, on the path that looked correct. **Fixed** by `normalizeZoneDesignator`, which
rewrites a trailing `Z`/`z` to `+00:00` before the repair — verified to produce the identical
instant as an explicit `+00:00`.

`+00:00` and not `+0000`, deliberately: the repair recognises the colon form and rewrites it
cleanly, whereas an RFC822 offset is not recognised and gets a *second* `+0000` appended.

**2. Our own happy path parses by accident.** That doubled form parses only because
`SimpleDateFormat.parse()` discards trailing text once the pattern is satisfied — it accepts
`…+0200XYZZY` and `…+0200+9999` identically, and with two offsets the **first** wins. RFC822 is
exactly what `NeoDateFormat.toAuditToken` emits (it formats through the same
`createDateTimeFormat()`, so emitter and parser are symmetric — no millis, `+hhmm`), which means
the correct behaviour of the main path rests on the parser throwing away garbage. Nothing is
broken today and this is deterministic, not flaky, but it is not a property to build on.

**3. The `unparseable` guard is now `ERROR`** (`NeoRecordVersion.parseClientValue`), on this
evidence rather than on principle, and its message says that its own firing is the defect. A
well-formed token can no longer reach it: what the format accepts is `Z`, `+hh:mm` and `+hhmm`,
and `Z` is normalised first. **The other three guards stay `WARN`** — the original argument still
holds for them.

**Deliberately left failing, both reported rather than fixed:** an hour-only `+02` offset (legal
ISO 8601, *not* legal XSD) and a token carrying milliseconds — `2026-08-28T12:30:15.123Z`, which
is precisely what JavaScript's `new Date().toISOString()` produces, so any client or MCP caller
that builds a token by hand rather than echoing the server's lands here. Core's comparison is
millisecond-insensitive anyway (`areDatesEqual(d1, d2, true, false)`), so discarding them would
cost nothing semantically. Both are behaviour changes that widen what counts as a valid token,
which belongs to whoever owns the emitting contract, not to a concurrency check. They are visible
now, which is the point.

### Why not simply raise the remaining three `WARN`s

The other three "concurrency check did not run" guards stay `WARN` deliberately. They were
`DEBUG` until ETP-5255 and have never been observed in production, so their base rate is
unknown; promoting them together risks arriving with a burst of unexplained `ERROR`s and having
the whole signal muted. Raise them once L1, L2 and L5 have been quiet for a release, or
immediately if L1 turns out to land on a guard rather than on a real comparison.

The lesson from L5 is not "raise them all" — it is that the *argument from silence* was the weak
link. The guard was believed inert; a five-minute probe of the parser showed it was load-bearing.
Prefer measuring a guard's reachability over reasoning about its base rate.

## Suggested order

| # | Item | Cost | Value |
|---|---|---|---|
| ~~1~~ | **L1** — raise the two token-clash lines to `ERROR` | trivial | **done** |
| ~~2~~ | **L2** — `ERROR` on an incoming offsetless `updated` | low | **done** |
| ~~—~~ | **L4** — name the endpoint in every line | low | **done** |
| ~~—~~ | **L5** — normalise a `Z` token; raise the `unparseable` guard to `ERROR` | low | **done** |
| ~~5~~ | Class C sweep across `windows/custom/` | medium | **done** — found a 4th instance |
| ~~6~~ | Class E sweep across all contracts | low | **done** — no new groups |
| ~~10~~ | Class D audit of source-text suites | low | **done** — 75 suites, 6 relevant, 1 certifies C |
| ~~1~~ | Extract `useRecordWriteQueue`, migrate all 4 panels | high | **done** — closed C, incl. 2 live defects |
| 1 | Rewrite `AmortizationLinesTable.test.js` behaviourally + cover the hook | medium | high — the suite still pins the old mechanism |
| 3 | JUnit invariant test for `afterHandle` dispatch sites | low | high — closes B permanently |
| 4 | **L3** — runtime `ERROR` on an outgoing offsetless `updated` | low | high — total coverage of A, names the emitter |
| 5 | Decide on `+02` and millisecond tokens (see L5) | low | medium — contract owner's call |
| 6 | `pre-push` grep guard for `toCanonical` near `updated` | low | medium |
| 7 | Aggregate the diagnosis lines (needs L1–L3 first) | medium | medium |

The observability items came first because everything else in this plan is a fix whose effect is
invisible until the logging works; that part is done bar L3. Aggregation is deliberately last:
there is nothing to aggregate while the lines are `WARN`.

Items 1 and 2 are one piece of work in the right order. Fixing the panel alone leaves four
hand-written copies of the same single-flight logic in the tree, which is the condition that
produced the unguarded panel in the first place — there was no shared thing to reach for. Fixing
the panel *by* extracting the hook and migrating all four is more work and touches three panels
that are currently green, so it needs Tester covering them behaviourally before the migration,
not after.

## Known open items outside this plan

- `FiscalDeclCrudHandler.handleDeclPut` performs **no concurrency check at all**
  (`PROPERTY_UPDATED` is declared and never compared). Enforcing it is not a switch: the
  response emits `updatedAt` as epoch millis rather than an `updated` token, the id travels
  as a query parameter so the client cannot key the cache, and three callers would start
  failing at once. Needs its own ticket, including the UX decision for a 409 on a debounced
  autosave — no panel has a conflict dialog on that path today.
- `npm test --workspace=tools/app-shell` does not cover `src/windows/custom/**`. CI reaches
  those through a separate `find`, so a local run looks green while every custom-window test
  is skipped.
