---
name: feature-debt
description: >
  Record and score technical debt in this repo, where debt belongs to a FEATURE and the
  feature flag is the unit of accounting. Use when starting a new feature or registering a
  new feature flag; when something is being left unfinished, deferred, or accepted as debt;
  when a test is agreed but not written; when retiring a flag; or when anyone asks what
  debt a feature carries. Enforces: register the flag on day one, classify every gap into
  the taxonomy, never self-accept debt, run `make flag-debt` before delivering.
  Triggers on: "technical debt", "tech debt", "deuda técnica", "feature flag", "new flag",
  "register a flag", "flags-registry", "flag-debt", "scorecard", "defer this", "leave it
  for later", "lo dejamos para después", "accepted debt", "known gap", "TODO for now",
  "we won't test this", "retire the flag", "remove the flag", "sacar el flag", "TTL",
  "forAccount", "FeatureFlagContext", "GoFeatureFlags", "por usuario", "por email".
---

<!-- GENERATED MIRROR - DO NOT EDIT. Source: .claude/skills/feature-debt/SKILL.md - Regenerate: make sync-agents -->

# /feature-debt — Record Debt Against the Feature Flag That Owns It

Depth, rationale and worked examples: **[`docs/technical-debt-playbook.md`](../../../docs/technical-debt-playbook.md)**.
Scorer reference: `docs/flag-debt.md`. Flag system: `docs/feature-flags.md`.
Canonical facts: **`flags-registry.json`** at the repo root.

**The model in one line:** debt belongs to the feature; the flag is how it is counted,
because the flag already carries the boundary (`paths`), the clock (`ttl`) and the removal
cost (touch points).

---

## Step 1 — New feature or new flag? Register it now

Add the entry to `flags-registry.json` **on day one**, not at delivery. A registry written
by hindsight always reads clean.

- `paths` — **owned code only**: files that exist because the flag exists and are deleted
  with it. A shared file the flag merely touches goes here **never** — leaving it out is
  what lets it count as removal cost.
- `symbols` — grep terms that find every reference, **including ones that never name the
  flag** (a lazy import, a page name).
- `ttl` — the date the flag should be **gone**. A placeholder is fine only if labelled in
  `ttlNote`.

Then keep the layout rule (`docs/feature-flags.md` → *Architecture: flag code layout*):
the flag's logic lives in its own files; shared files hold greppable toggle points only.
Break it and the score keeps looking plausible while meaning nothing.

**Decide the evaluation scope on day one — and ask if the request does not say.** A flag
with backend logic is evaluated by the backend with an explicit `FeatureFlagContext`. The
default an agent reaches for, `FeatureFlagContext.forAccount(null)`, carries no email, so
every Datadog/ConfigCat rule targeted at a user silently never matches: the browser (which
sends the email) shows the feature, the backend never runs it, and "flag off" looks the same
as "flag deliberately off" (ETP-4966 family; reported by Irina and Rubén).

| Scope | Backend context | Use when |
|-------|-----------------|----------|
| **Per account/user** | `forAccount(<ETGO_ACCOUNT email>)` — resolve it as `PortalLinkPolicy#currentAccountEmail` does (`GoAccountResolver.findAccountByUsername`, admin mode, null on failure ⇒ off) | the flag can be rolled out to specific users or percentages. **Default for any feature flag.** |
| **Per tenant** | `forAccount(email).with(FeatureFlagContext.ATTRIBUTE_CLIENT_ID, clientId)` | rules by AD_Client |
| **Environment-wide** | `FeatureFlagContext.environment()` (never bare `forAccount(null)`) | only operational kill switches / startup / scheduled jobs with no user (`*-disabled`, `*-off`, `billing-reconciliation-schedule`) |

- Writing `environment()` / `forAccount(null)` for a new flag? Say in a comment why no user
  exists there. No reason ⇒ reviewers treat it as the bug.
- Do not cache a per-account result in a `static final` (the `ENVIRONMENT` constant
  pattern): it has no user to cache for. Evaluate per request.
- The request does not say who the flag targets? **Ask the human** — do not pick env-wide
  because it is simpler.
- A flag read by **both** the SPA and the backend must receive the same identity on both
  ends; see `com.etendoerp.go/docs/feature-flags-and-tenant-upgrade.md` → *Per-account
  targeting* and *Targeting key* (`targeting-key-divergence`).
- Test it: assert the email reaches the context (see `PortalLinkPolicy`/
  `EnvironmentAccessEnforcementFlagTest` for the pattern), and verify with a **per-email rule
  in Datadog on both front and back**, not with the env-level boolean.

## Step 2 — Classify every gap. Do not invent a fifth place

| The gap is… | Record it as | Where |
|-------------|--------------|-------|
| A test that does not exist | a `testSpecs` entry + a state marker | `flags-registry.json` |
| An open decision that is not a test gap | a `deferredItems` entry + a `kind` | `flags-registry.json` |
| A precise branch-level claim (which method, which branch, why coverage misleads) | `$knownGapComment` | `flags-registry.json` |
| The reasoning, alternatives, what it would take | prose | `docs/` — **in the repo whose code changed** |

**Spec states — pick one, never both:**

- `expected: true` → missing, someone will write it. Transient.
- `acceptedDebt: true` → missing, we decided not to write it. Standing. **See Step 3.**

Overloading `expected` to mean both is forbidden — that distinction is the dimension's
entire value.

**Deferred item kinds:** `precondition` (blocks the next step) 5 pts · `open` 3 pts ·
`cosmetic` 1 pt. Every `note` must answer *and therefore what?* — the consequence, not just
the mechanism. Every `ref` must be navigable: a section title or symbol, **not a bare line
number**.

**Bundling:** use `components` when several fixes share one trigger and one owner decision
(+1 pt per component beyond the first). Write the **promotion condition** into the note —
the moment a component is scheduled on its own, it becomes its own item.

**`points` override:** whole non-negative integers only. Anything else is dropped and
reported, never repaired. `points: 0` means zero on purpose.

## Step 3 — Accepted debt needs a human. Always

**Propose it. Never accept it.**

`expected: true` is a fact about the plan — write it yourself. `acceptedDebt: true`, and
deciding a `deferredItem` stays open, are commitments on behalf of the team with a standing
cost. State the gap, state the cost, **ask, and wait**.

An agent that can accept its own debt can zero the scorecard without touching the code.

## Step 4 — Verify every claim before you write it

- Writing that something is *validated / guaranteed / atomic / secure / single-use /
  never / always*? **Find the line that makes it so.** If you cannot, write what the code
  actually does and name the gap.
- Fixing a claim that turned out wrong? **Grep for the claim, not the file you were
  handed.** The same statement usually lives in a javadoc, a call-site comment and two
  docs; fixing one location preserves the contradiction in the rest.
- Writing up a reported finding? **Reproduce it first.** The report has the symptom; the
  registry needs the cause and the trigger.

## Step 5 — Score it before delivering

```bash
make flag-debt                      # all flags
make flag-debt FLAG=<key>           # one flag
make flag-debt HTML=1               # per-flag panel (git-ignored)
```

Report only — it never fails a build. Read the output and ask the governing question:
**would each entry survive thirty seconds of a reviewer checking it?** If not, fix the
entry — do not soften the wording.

## Step 6 — Retiring a flag

What expires at the TTL is the **ability to hide**, never the feature. Retiring is
committing to one of two branches — decide which first, with the human:

**Ship it (the usual branch):** the feature becomes unconditional.
1. Grep the flag's `symbols`; unwrap every toggle point — the code inside the
   conditional becomes plain code, the conditional goes.
2. Delete the flag constant, its config entries, and its control-plane setting.
3. Delete the **`flag` object** from the feature's registry entry — **never the
   entry itself**. The feature keeps its paths, specs and open items, and keeps
   scoring as `shipped`; deleting the entry would delete the *evidence*, not the
   debt.
4. Re-grep `symbols` to confirm zero remaining matches.

**Kill it:** the feature goes with the flag.
1. Delete the owned `paths` and every toggle point.
2. **Re-home each open item before deleting the entry** — to a ticket or another
   feature's entry. Anything still true of surviving code must land somewhere.
   Deletion is never closure.
3. Delete the whole feature entry; re-grep to confirm zero matches.

Either way: update the docs and index rows in **both** repos.

A permanent per-account condition (a plan, an entitlement, a permission) is **not
a third branch** — it is backend business logic that was never a flag's job. If a
flag seems to "need to live forever", the condition it guards belongs in the
backend and the flag still retires.

---

## Do not

- Register a flag at delivery time instead of day one.
- List a shared file under `paths` (inflates coverage, hides removal cost).
- Mark `acceptedDebt` without an explicit human yes.
- Cite a bare line number in a `ref`.
- Bundle components without a promotion condition.
- Commit a score. It is always derived; a stored score is a stale score.
- Describe the scorecard as "the repo's technical debt" — it measures **registered flags
  only**. Unflagged features carry unmeasured debt; say so rather than implying coverage
  that does not exist.
