# Technical Debt Playbook

**Status:** Active
**Audience:** agents and developers working in this repo and in `com.etendoerp.go`
**Companion skill:** `.claude/skills/feature-debt/` — the operational checklist. This document is the depth behind it.

Every other doc here tells you how something works. This one tells you what to do
when something is *not finished* — how to record it, how it gets counted, who is
allowed to accept it, and what happens to it later.

The reference implementation throughout is `tenant-upgrade` (ETP-4686): the paid
second-tenant flow. It is used as the example not because it is exemplary but
because it is real, and every rule below was either derived from something that
went wrong on it or was tested against it.

---

## 1. The model: debt belongs to the feature

### Why not to the file, the module, or the sprint

The usual way to track technical debt is a `TODO`, a linter suppression, or a
ticket in a backlog. All three lose the same thing: **the boundary**. A `TODO`
knows one line. A ticket knows a title. Neither can answer "what does this cost
us, and for how long?" — and a cost nobody can compute is a cost nobody pays
down.

Debt in this repo is attributed to a **feature**, and a feature is identified by
its **feature flag**. That is the whole trick. A flag is not just a switch; it is
the only artifact that already carries the three things debt accounting needs:

| Debt needs | The flag supplies it as | Where it lives |
|------------|-------------------------|----------------|
| A **boundary** — which code is this feature's? | `paths` — owned files and directories | `flags-registry.json` |
| A **clock** — how long has this been unfinished? | `ttl` — the date the flag should be gone | `flags-registry.json` |
| A **removal cost** — what does it take to undo? | touch points — references outside the owned paths | derived by grepping `symbols` |

Anything you can attach to a flag becomes measurable. Anything you cannot is a
number nobody can produce.

### The policy: every new feature is born behind a flag

**Register the flag in `flags-registry.json` on the day the feature starts, not
the day it ships.** This is the reason the phrase "everything starts from a
feature flag" is a policy here and not a slogan.

A flag registered on day one gives you:

- a place to put every gap you discover while building, at the moment you
  discover it, instead of at the end when you have forgotten the good half;
- a TTL that starts counting from the beginning of the debt, not from the moment
  someone got around to filing it;
- an owned-paths boundary that shapes where you put the code — which is exactly
  the layout rule in [`feature-flags.md`](feature-flags.md) → *Architecture: flag
  code layout*, and the reason it is a rule rather than a preference.

A flag registered at the end gives you a scorecard written by hindsight, which is
the one kind that always reads clean.

### The known generalization — read this before over-claiming

A feature **without** a flag is not debt-free. It carries the same debt; the
system simply cannot see it. The registry measures registered flags and nothing
else.

This is a real limitation and it is deliberate for v0. Do not describe the
scorecard as "the repo's technical debt" — it is *per-flag* debt for *registered*
flags. Generalizing the model to unflagged features (a feature manifest, or
attribution by directory) is an obvious next step and is **not built**. Say so
when it comes up; a measurement system that quietly implies coverage it does not
have is worse than one whose gaps are stated.

---

## 2. The taxonomy: where each kind of debt is written down

There are exactly four places debt is recorded, and they are not
interchangeable. Choosing the wrong one is the most common way an agent corrupts
this system.

| Kind of debt | Goes in | Scored? |
|--------------|---------|---------|
| A test that does not exist | `testSpecs` entry, with a state marker | yes — dimension 2 |
| An open decision that is not a test gap | `deferredItems` entry, with a `kind` | yes — dimension 5 |
| A precise, branch-level claim about *why* something is weak | `$knownGapComment` in the registry | no — it is evidence, not a score |
| The reasoning, the trade-off, the alternatives considered | a `docs/` document | no |

Everything scored is derived from the working tree by `cli/src/flag-debt.js`
reading `flags-registry.json`. **The score is never stored.** A stored score is a
stale score; see [`flag-debt.md`](flag-debt.md) → *Where debt lives*.

### 2.1 Test gaps — the four spec states

Each entry in `testSpecs.unit` / `testSpecs.e2e` is a path plus, optionally, one
marker. The path is checked for existence on disk, and the marker declares
intent:

| State | Declared as | Means | Points |
|-------|-------------|-------|--------|
| **present** | — (file exists) | On disk. | 0 |
| **pending** | `expected: true` | Missing, someone is expected to write it. **Transient.** | +5 flat if any unit spec is pending; +8 flat if any e2e spec is |
| **accepted-debt** | `acceptedDebt: true` | Missing, the team decided **not** to write it. **Standing.** | +5 **per item** (unit), +8 **per item** (e2e) |
| **missing** | neither marker | Missing, no declared intent either way. | 0 — and it should not exist; declare an intent |

Two properties of this design matter and must not be eroded:

**An empty promise never scores as a kept one.** A path in `testSpecs` that is
not on disk is a hole, whatever the surrounding prose says. This is why the
scorer checks the filesystem rather than trusting the registry.

**Overloading `expected` is forbidden.** If both markers are set, `acceptedDebt`
wins — but do not set both. The distinction between "queued" and "deliberately
deferred" is the entire value of this dimension. Collapse it and the registry
stops being trusted, at which point everything downstream of it is decoration.

The scoring shapes follow from that distinction. *Pending* is flat per list,
because the signal is "this flag's suite has a hole" and the hole closes when the
suite lands. *Accepted debt* is per item, because a standing decision is owned
individually and does **not** evaporate when the rest of the suite goes green —
which is precisely the moment it would otherwise be forgotten. E2E costs more
than unit throughout, because a flag most often breaks in the wiring, not in the
unit.

> **Worked example.** `tenant-upgrade` declares seven specs. Six exist. The
> seventh, `TenantPlanServiceTest.java`, is marked `acceptedDebt: true` with a
> note. The flag therefore scores 5 on the tests dimension with a green suite —
> deliberately. It reads as an accepted gap rather than as a clean sheet, which
> is the whole point.

### 2.2 Open items — `deferredItems`

Not every liability is a test gap or a stray reference. A flag can be holding
**open decisions**: a correctness precondition that blocks the next step, a
cosmetic follow-up parked behind a package bump, a design question nobody has
answered. Those are `deferredItems`.

```jsonc
{
  "id": "targeting-key-divergence",
  "kind": "precondition",              // precondition | open | cosmetic
  "note": "What is open, and — critically — what it blocks.",
  "refs": ["docs/feature-flags.md — 'Open: targeting keys do not match'"]
}
```

**Kinds and rates:**

| `kind` | Points | Use it for |
|--------|--------|------------|
| `precondition` | 5 | Something that **blocks** the next step. Anchored to the missing-unit-spec penalty: one decision blocking the next step costs the same as one untested unit. |
| `open` | 3 | A live question with no blocker attached. |
| `cosmetic` | 1 | Polish. **Deliberately non-zero** — a free bucket is the bucket everything gets labelled into. |

An unrecognised `kind` falls back to the `open` rate rather than suppressing the
item, and renders as `[preconditon → open rate]` so the fallback cannot be
mistaken for a valid kind. **A typo must never hide debt.**

**Bundling — `components`.** Use `components` when several fixes share one
trigger and one owner decision. A bundled item costs its kind plus **1 per
component beyond the first**, so breadth shows up without one theme swamping the
total.

> **The rule: bundle a theme, split a schedule.** They are one decision with
> several parts, and a card with eight sibling entries is a card nobody reads.
> **The promotion condition:** the moment a component gets scheduled on its own,
> promote it to its own `deferredItem`. It has stopped being part of one decision
> and must carry its own points and its own closure.
>
> `tenant-upgrade` carries this live. `real-payment-readiness` bundles seven
> components split by *trigger*: four are latent until money is real, three bite
> the moment the flag is enabled for anyone. The registry records the promotion
> condition explicitly — *if the flag ever pilots before a gateway exists, the
> three flag-on components must be promoted*. Write the condition down when you
> bundle; a bundle with no promotion condition is a bundle that will never be
> split.

**The `points` override, and why it rejects rather than repairs.** An explicit
`points` on an item overrides the formula, but **only as a whole, non-negative
number**, and it is labelled *declared* in the report. Anything else — negative,
fractional, non-numeric — is **ignored**: the derived score stands and the report
says the override was dropped.

This is reject-not-clamp, and it is deliberate. Debt cannot be negative and the
scale has no halves, so there is no honest guess at the intent. Clamping `-50` to
`0` would repair a broken entry into something that reads *exactly* like a
deliberate zero — and `points: 0` is a value someone may legitimately want. So a
`0` means zero on purpose, and a rejected override is always visible rather than
silently absorbed. When you write an override, know that a typo will be loudly
dropped, not quietly honoured.

**`refs` must be navigable.** A document plus its section or line, not a bare
filename. A reference nobody can follow is the same as no reference. Note that
section titles survive edits better than line numbers do — see §3.2.

### 2.3 `$knownGapComment` — precise claims at branch level

The registry's `$…` keys are comments. `$knownGapComment` is where a claim goes
that is too specific for a doc and too long for a `note`: which method, which
branch, which test transitively covers it, and why the coverage that exists is
misleading.

`tenant-upgrade` uses it to record that `TenantPlanService.markProductive` has
zero coverage and that of `resolvePlan` **only the exception-swallowing branch
executes** — reached transitively because `EtendoGoJwtDalHelper` holds a static
`TenantPlanService`, so an unstubbed `Preference` query NPEs into the catch and a
helper test asserts the resulting `"free"`. The one covered branch is the one
that hides failures: *exactly how a paying tenant would silently appear free.*

That is the standard. A `$knownGapComment` that says "needs more tests" is worth
nothing. One that names the branch and the consequence tells the next person
whether to care.

### 2.4 Docs — the reasoning

Scores and registry notes say *what*. Docs say *why*, *what else was considered*,
and *what it would take*. The division is not aesthetic: the registry is read by
a program, so it must stay factual and short; the docs are read by a person about
to make a decision, so they must carry the trade-off.

Which doc, per the repo-split rule: the change's **own repo**. Frontend behaviour
→ `docs/feature-flags.md` here. Backend behaviour →
`docs/feature-flags-and-tenant-upgrade.md` in `com.etendoerp.go`. A change
spanning both needs a doc update in both.

---

## 3. The protocols

Each of these came out of something that actually happened on this branch. They
are listed with their origin because a rule whose reason is forgotten is a rule
that gets optimized away.

### 3.1 Accepted debt is ALWAYS a human decision

**An agent may propose accepted debt. An agent may never accept it.**

`expected: true` — "someone should write this" — is a statement of fact about the
plan, and an agent can write it. `acceptedDebt: true` — "we have decided not to
write this" — is a commitment on behalf of the team, with a standing cost, and it
requires a human to say yes.

The same holds for a `deferredItem`. Recording that something is open is
reporting. Deciding it stays open is a decision.

**Why.** An agent that can accept its own debt can close every gap it finds by
declaring the gap acceptable, and the scorecard converges on zero while the code
does not change. The registry's authority rests entirely on the fact that no
process can grant itself absolution. The one `acceptedDebt` entry in the registry
today is labelled `USER-ACCEPTED VISIBLE DEBT` for exactly this reason.

If you are an agent and you believe something should be accepted debt: write it
up, state the cost, and ask. Then wait.

### 3.2 Verify by grep pattern, never by line number

Claims get duplicated. The same statement about behaviour typically lives in a
javadoc, a call-site comment, a module doc and a functional doc — because each
audience needs it where they are. That is not a defect to be normalized away; it
is how the information reaches people.

The consequence: **when a claim turns out to be wrong, fixing the one location
someone named leaves the contradiction standing everywhere else.**

This is documented history. Review warnings W1–W3 on this branch each named a
single location. All three claims existed in two or three places. The fix
(`6c2a7bb5`) deliberately swept every copy, and its own commit message records
why: *"the review named only one location for each, but leaving the duplicates
would have preserved the contradiction."*

So the protocol is:

1. When you fix a claim, **grep for the claim**, not for the file you were given.
   Grep the distinctive phrase, the method name, the token shape — whatever the
   claim is *about*.
2. When you cite a location in a registry `ref` or a doc, prefer a **greppable
   anchor** — a section title, a symbol name, a distinctive quoted phrase — over
   a line number. Line numbers are correct for exactly as long as nobody edits
   the file above them.
3. Where a line number genuinely helps (a specific call site), pair it with the
   symbol so the reference survives the drift: `UpgradePage.jsx:273` alongside
   `handleSubmit`.

The registry's `symbols` array is the same idea applied to the scorer: it lists
grep terms that find every reference *including the ones that never name the
flag*. `tenant-upgrade` declares `UpgradePage` and `lib/upgrade` alongside the key
itself, because `runtime-routes.jsx` only lazy-imports the page — a key-only grep
would miss a real touch point and under-report the debt.

### 3.3 Never document a property the code does not have

The highest-severity documentation defect is not an omission. It is a stated
guarantee the code does not provide, because readers act on guarantees.

**The incident.** The mock payment gate was described in a way a reader could
take as evidence that the token was validated. It is not. The backend checks the
token's *shape* — `^mock-paid-[0-9a-f]+$` — and nothing else: it does not call a
provider, does not consume the token, and does not bind it to a nonce, an account
or an amount. Anyone can hand-write `mock-paid-deadbeef` and be provisioned a
tenant.

The correction (`46b1d9321`, and `6c2a7bb5` on the backend side) says all of that
out loud, and names the gate *a placeholder for the flow, not a payment control*.

**The generalized rule.** Before writing that something is validated, checked,
guaranteed, atomic, or safe, find the line that makes it so. If you cannot find
it, write what the code actually does and name the gap. Words that need this
treatment every single time:

> *validated · verified · guaranteed · atomic · transactional · secure ·
> idempotent · never · always · single-use*

A second instance from the same branch, worth internalizing because it is subtler:
"the single change needed to take real payments" was true of the *class* and
false of the *system*. Swapping `MockPaymentService` for a gateway client is
necessary and not sufficient — replay, check-then-act and payment/provisioning
atomicity all have to close with it. A claim can be locally accurate and globally
misleading; scope your claims to what you verified.

### 3.4 Reproduce before fixing

Do not fix from a report. Reproduce the behaviour first, then fix, then confirm
the reproduction now fails to reproduce.

**Why it belongs in a debt playbook specifically.** Debt items are written from
reports — QA findings, review comments, relayed summaries. A report describes a
*symptom*; the registry entry has to name a *cause*, because the entry is what
the next person will act on. Without reproducing you can only paraphrase the
symptom, and a paraphrase in an authoritative-looking registry is worse than an
open question, because nobody re-checks it.

Reproduction is also what tells you the trigger, and the trigger is what
determines the kind, the bundling and the promotion condition. The registry
distinguishes `qa-in-flight-submit-guard` — reachable by 8 scripted same-tick
clicks, **not** by a human double-click — from the flag-on defects that bite any
user immediately. That distinction is only available to someone who tried it.

### 3.5 State consequences, not just mechanisms

A mechanism tells the reader what happens. A consequence tells them whether to
care. Debt documentation that stops at the mechanism gets skimmed and filed.

**The incident.** The plan marker was described as committing inside the
onboarding transaction — accurate, and a mechanism. What it omitted:
`markProductive` swallows its own failures, so a **paid tenant can commit
unmarked and read back as free**. The rewrite (`6c2a7bb5`) keeps the mechanism and
adds the consequence, then names what the consequence *is*: the plan is not a
guaranteed record of payment, and reconciling one is a **billing** concern, not
something this write can promise.

That last move is the one to copy. "Best-effort write" is engineering vocabulary
that costs nothing to read. "A customer may pay and appear to be on the free plan,
and reconciling that is billing's problem" is a sentence someone has to have an
opinion about.

Applied to the registry: a `note` that describes only the code is half a note.
Every note should answer *and therefore what?* — `targeting-key-divergence` does
it explicitly ("**Must be closed BEFORE the swap, not after**"), and that is why
it is legible a month later.

### 3.6 A scorecard someone can disprove in thirty seconds is worse than no scorecard

This is the governing principle; the rest are instances of it.

The scorecard's only asset is that people believe the number. One demonstrably
false entry — a spec listed as covered that does not exist, a path that moved, a
claim contradicted by the code two clicks away — destroys that for every other
entry at once, because a reader who catches one has no way to know which others
are wrong.

Concretely, this is why:

- the scorer **checks the filesystem** instead of trusting `testSpecs`;
- the score is **derived on demand** and never committed;
- `paths` must be **owned code only** — a shared file listed as owned would inflate
  coverage denominators and silently deflate touch points;
- a bad `points` override is **dropped and reported**, not repaired;
- an unknown `kind` **falls back visibly** instead of scoring zero;
- the TTL note says `PLACEHOLDER` in capitals, because a date nobody committed to
  that reads like a commitment is a false entry in exactly this sense.

When you add to the registry, apply the test literally: *if a reviewer spent
thirty seconds checking this entry, would it survive?* If not, do not soften it —
fix it or leave it out.

---

## 4. The lifecycle of a flag, and what happens to its debt

### 4.1 Registration — day one

Add the entry to `flags-registry.json`. The full field reference is in
[`flag-debt.md`](flag-debt.md) → *Registering a new flag*; three fields decide
whether the score means anything:

- **`paths`** — owned code only. Files that exist *because* the flag exists and
  are deleted with it. A shared file the flag merely touches does **not** belong
  here; leaving it out is what lets it be counted as removal cost.
- **`symbols`** — grep terms that find every reference, *including references
  that never name the flag*.
- **`ttl`** — a commitment, not a formality. A placeholder is acceptable as a
  starting point **only if labelled** (`ttlNote`).

### 4.2 Life — the TTL clock

`ttl` is the date the flag should be **gone**, not the date it ships.

Points: `0` while the TTL is in the future; `3 per started week` once it is past.
A flag one day overdue costs 3; eight days overdue costs 6. The ramp is linear
and unbounded on purpose — an abandoned flag's score keeps climbing until someone
looks at it.

`tenant-upgrade`'s TTL is `2026-10-25`, explicitly labelled as
`created + 90 days` with nobody committed to it. That is the honest state, and it
scores 0 today while remaining visible as unfinished business.

### 4.3 What "the TTL firing" looks like

Nothing fails. **v0 is report only — the command always exits 0.** Thresholds,
trend lines and CI gating are deliberately out of scope: first make the number
visible, then argue about what it should be.

What changes is the report. The lifecycle dimension starts contributing points
and the flag's card shows how far past due it is. Because deferred items render
on that same card, whoever picks up the removal sees every open decision the flag
was holding **before** starting the work those decisions block — not halfway
through it. That ordering is the reason `deferredItems` exists and the reason
they score at all.

> **Why deferred items score** (they did not, at first). The scale already charges
> accepted-debt specs per item, on the grounds that a standing decision is owned
> individually. A deferred item is exactly that kind of decision. Recording it on
> the card while leaving it out of the number made the number describe less than
> the card did — which is the failure mode this scorecard exists to prevent.

### 4.4 Retiring a flag

Retirement should be mechanical, and it is mechanical only if the layout rule was
honoured throughout:

1. **Delete the owned directories** — everything in `paths`. This is why `paths`
   must be owned code only.
2. **Grep the `symbols` and remove the touch points.** Every match outside
   `paths` and outside `conventions.frameworkPaths` is a shared file reaching into
   the flag: a route registration, a menu entry, a backend enforcement point. Each
   is a small, local deletion *if* rule 2 of the layout held and it carries no
   business logic.
3. **Re-grep to confirm zero matches** outside framework paths.
4. **Remove the flag's entry** from `flags-registry.json`, and delete its specs
   or fold them into the now-unconditional behaviour's suite.
5. **Update the docs in both repos** — the flag section, the index rows, and any
   `refs` pointing at them.

Three touch-point files are free in the score because a flag legitimately needs
about that many — a route registration, a menu entry, a backend enforcement point.
The **fourth** shared file is where smearing starts, and it costs 2 points each
from there. That number is a removal-cost estimate, and it is the number to watch
during the flag's life, not at its end.

### 4.5 What happens to accepted debt at retirement

Deleting the flag deletes its registry entry, and with it every `acceptedDebt`
spec and every `deferredItem`. **The debt does not disappear with them — only the
accounting does.** So, before deleting the entry, resolve each item explicitly:

| The item was… | Do this |
|---------------|---------|
| **Closed by the retirement itself** — the code it described is being deleted | Nothing. Note it in the removal commit so the closure is traceable. |
| **Still true of code that survives** | It is no longer flag debt; it is product debt. **Re-home it before deleting the entry** — a ticket, or the registry entry of whichever flag now owns that code. Never let deletion be the closure. |
| **A precondition for work now scheduled** | It becomes a requirement of that work. Carry the `refs` across so the reasoning survives the move. |

The failure mode this prevents is the tidy one: retiring a flag, watching the
scorecard go to zero, and concluding the debt was paid when it was merely
unreferenced. An `acceptedDebt` spec for a class that still exists is still an
untested class the morning after the flag is gone.

---

## 5. Quick reference

**Running it:**

```bash
make flag-debt                      # every registered flag, console report
make flag-debt FLAG=tenant-upgrade  # one flag
make flag-debt JSON=1               # also write flag-debt.json  (git-ignored)
make flag-debt HTML=1               # also write flag-debt.html  (git-ignored)
```

`SONAR_TOKEN` / `SONAR_HOST_URL` enable the coverage dimension; unset, coverage
reports `unavailable` and adds 0 points. Missing infrastructure must never look
like a clean bill of health, and must never block the report either.

**The five dimensions, at a glance:**

| Dimension | Answers | Rule |
|-----------|---------|------|
| 1. Touch points | How expensive is removal? | 2 pts per code file beyond the first 3 |
| 2. Tests | Is the flagged behaviour pinned? | 5 / 8 flat if pending (unit / e2e); 5 / 8 **per item** if accepted debt |
| 3. Coverage | How much owned code is untested? | 1 pt per 10 uncovered lines, per owned file |
| 4. Lifecycle | Is the flag overdue? | 3 pts per started week past TTL |
| 5. Open items | What is the flag still holding? | 5 / 3 / 1 by kind, +1 per bundled component beyond the first |

The full scale lives in the `POINTS` object at the top of
[`cli/src/flag-debt.js`](../cli/src/flag-debt.js) — one place to tune it.

**Before you deliver anything touching a flag:**

- [ ] Flag registered in `flags-registry.json` (day one, not delivery day)
- [ ] Every gap you found is recorded as a spec state or a `deferredItem`
- [ ] Nothing is marked `acceptedDebt` without a human saying yes
- [ ] Every claim you wrote is one you found the code for (§3.3)
- [ ] Every claim you fixed, you grepped for elsewhere (§3.2)
- [ ] Every note answers *and therefore what?* (§3.5)
- [ ] `make flag-debt` run, and the number is one you can defend (§3.6)

---

## Related

| Doc | Covers |
|-----|--------|
| [feature-flags.md](feature-flags.md) | The flag system itself: OpenFeature, safe defaults, the layout rule this scorecard depends on, the tenant-upgrade flow |
| [flag-debt.md](flag-debt.md) | The scorer's reference: every dimension in detail, the registry schema, how to run it |
| [paid-tenant-infrastructure.md](paid-tenant-infrastructure.md) | The `tenant-upgrade` feature end to end, as one narrative |
| `com.etendoerp.go` `docs/feature-flags-and-tenant-upgrade.md` | The backend half: server-side flags, the paywall, the plan marker |
