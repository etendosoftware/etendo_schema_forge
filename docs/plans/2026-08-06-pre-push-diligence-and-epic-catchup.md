# ETP-4352 — Pre-Push Diligence, Epic Catch-Up, and the com.etendoerp.go Sonar Gap

**Status as of 2026-08-07: both repos are now genuinely verified push-ready code-quality-wise.
`schema_forge` was already green as of 2026-08-06. `com.etendoerp.go`'s Sonar-credentials gap
(the open question this doc previously ended on) is now resolved — the user provided a real
SonarQube User Token, a real Sonar analysis ran for the first time for this repo, found and fixed
2 genuine CRITICAL code-smell violations, and re-ran clean (Quality Gate OK, 0 issues). A separate,
NOT-yet-fixed tooling gap was found in the same pass — this repo's local Sonar setup never wires
up JaCoCo, so coverage always reports as 0% regardless of real test coverage — flagged to the user,
decision deferred over the weekend. Nothing has been pushed anywhere for either repo. The user is
pausing until Monday. Resume by: (a) deciding push/PR for both repos, (b) deciding whether to fix
the JaCoCo-wiring gap in `com.etendoerp.go` now or defer it further.**

This is a direct follow-up to
`docs/plans/completed/2026-08-06/2026-08-04-gdpr-mixpanel-privacy-remediation-session.md`, which
covered ETP-4352's GDPR/Mixpanel remediation plus two bundled survey fixes and ended with: "commit
the pending identity-reset fix, then decide push/PR." Read that doc first for all prior context
(the three changesets, the identity-reset bug and its round-1/round-2 fix history, the
`docs/ops/mixpanel-gdpr-privacy-audit.md` findings). This doc does not repeat any of that —
it starts from the identity-reset fix commit and covers only what happened afterward, today.

## Starting point

The user asked to prepare everything for push (not push yet — that decision stays explicit and
separate). At that point:

- The pending identity-reset fix (round 2, from the prior session) was committed as `580b2a231` —
  "Feature ETP-4352: Reset stale Mixpanel identity in SDK load path" (2026-08-06 11:24:18 -03:00).
  As part of this same commit, `docs/surveys.md`'s GDPR section was also corrected to say
  `mixpanel-browser` persists `distinct_id` in a **cookie** (line 577: `` `mixpanel-browser`
  persists `distinct_id` in a cookie (e.g. named `mp_<TOKEN>_mixpanel`) and `` ...) — see
  "Discrepancy found" below, this supersedes a claim in the prior doc.
- A doc-completion commit followed: `90423bda8` — "Feature ETP-4352: Mark GDPR/Mixpanel
  remediation session doc complete" (2026-08-06 11:57:50 -03:00).

This brought the branch to 5 local commits total on top of the merge-base with
`origin/feature/ETP-4352`: `73fe9c812`, `39f6af0eb`, `bd8e23ac3`, `580b2a231`, `90423bda8`.

## The diligence check

The user then asked, pointedly: did you run pre-push? Sonar? coverage checks? are all tests
actually passing? The honest answer at that moment was largely **no** — none of this had been
verified yet. This prompted a real diligence pass, done properly instead of asserted.

### 1. Discovering the real pre-push hook

`schema_forge` has a genuinely comprehensive `.githooks/pre-push` hook, wired via
`git config core.hooksPath` → `.githooks` (confirmed: `git config --get core.hooksPath` returns
`.githooks`). It runs, in order: an uncommitted-changes check, a base-branch merge-conflict check,
a `data-testid` check, `./run-sonar.sh --coverage --fail-on-gate --compare-coverage` (unit tests +
SonarQube Quality Gate + coverage-vs-base-branch comparison), an offline
regeneration/drift check, and an optional (never-blocking) Playwright E2E prompt. Since nothing on
this branch had ever been pushed, this hook had never actually run for any of today's or the
prior session's work.

### 2. Running it for real

Invoked directly as a script (not via `git push`, to avoid any risk of an accidental push
mid-diagnosis). Result:
- Tests: passed (9266 at that point).
- SonarQube Quality Gate: clean, 0 issues.
- Coverage-vs-base-branch comparison: **failed** — 75.50% (this branch) vs 78.70%
  (`epic/ETP-3504` base), a 3.2 percentage-point apparent regression.

### 3. Diagnosing the coverage failure

A dedicated investigation (querying Sonar's measures API directly, cross-referencing merged lcov
data) found the root cause: the branch was **~1007 commits behind** `epic/ETP-3504` — it had
diverged long ago, and the epic had since absorbed a large amount of unrelated parallel work
(confirmed today: the eventual catch-up merge touched **1423 files**, +272798/-228911 lines — see
`git show 82245ef848d9aac4fb92dd3d1e4af1d9c2d7e7bd --stat`). Comparing total-codebase coverage %
between a stale branch and a far-advanced target is an apples-to-oranges measurement artifact, not
a real code-quality regression.

A secondary, smaller measurement artifact was also found: a legacy, shallow `node --test` file —
`tools/app-shell/src/lib/__tests__/health-events.test.js` (confirmed still present on disk) —
duplicates a thoroughly-tested file, producing false "uncovered" lines when V8 and Istanbul
coverage formats get merged. Left in place, flagged as optional future cleanup, not fixed.

Underneath both artifacts, exactly **2 genuine, real coverage gaps** were found — both in
privacy-critical code from this session's own work:
- `tools/app-shell/src/lib/surveys/survey-config.js`'s `submitSurveyResponse()` function (the
  GDPR fix's backend-persistence call) had zero test coverage.
- `tools/app-shell/src/lib/observability/providers/mixpanel.js`'s storage-throw resilience
  branches (`readResetFlag`/`writeResetFlag`'s catch blocks, for when `localStorage` access throws
  — e.g. in private browsing) were also untested.

### 4. com.etendoerp.go's parallel check

Its own `.githooks/pre-push` (9KB, confirmed present at
`{etendo_root}/modules/com.etendoerp.go/.githooks/pre-push`) turned out to **not** be wired to
`core.hooksPath` at all — confirmed today: `git config --get core.hooksPath` in that repo returns
nothing, and `.git/hooks/pre-push` does not exist. A real `git push` there would silently skip all
validation.

Running it manually first hit a blocker: two pre-existing, unrelated untracked docs
(`docs/support-chat-session-2026-06-11.md`, `docs/support-chat-session-2026-06-12.md`, present
since before this whole multi-day effort began) tripped the hook's uncommitted-changes guard. The
user was asked, confirmed these were unrelated, and explicitly said to delete them — done via
`rm` (not `git rm`, since they were untracked). Confirmed today: neither file exists anymore
(`git log --all -- docs/support-chat-session-2026-06-11.md` returns nothing, since they were
never tracked) and `git status --short` in that repo is clean.

Running the hook again then hit a genuine tooling bug: git 2.34.1 is installed, but
`git merge-tree --write-tree` requires ≥2.38, compounded by a `set -e` bug in the hook's own
conflict-check function — it crashes before its real checks ever run. This is an
environment/script gap, not a code issue. Worked around by running the 3 real underlying steps
directly:
- An XML/AD-model consistency check (`check-etgo-xml.sh`) — passed cleanly.
- Java tests — this **finally resolved a mystery from earlier in the whole ETP-4352 effort**: the
  correct invocation is plain `./gradlew test` run from the `etendo_core` root, not
  `:modules:com.etendoerp.go:test` (that task doesn't exist — Etendo's build merges every module's
  `src-test` into the root project's single `:test` task, which is why the module-scoped task
  always reported `NO-SOURCE`). With the correct command, `SurveyConfigServletTest` — confirmed
  today at 25 `@Test`-annotated methods (`grep -c "@Test"` on
  `src-test/src/com/etendoerp/go/schemaforge/SurveyConfigServletTest.java`) — genuinely ran and
  all 25 passed, covering both the new `/response` POST endpoint and the isactive/enabled
  reporting logic.
  - The overall Gradle build still reported FAILED, but due to 4 pre-existing, unrelated test
    failures (`OnboardingPsd2SyncServiceTest`, `TbaiSyncStatusInjectorIntegrationTest`,
    `ReactivatePaymentHandlerRemoveIntegrationTest`, `NeoWidgetMcpIntegrationTest`) sharing one
    root cause — a Hibernate `MappingNotFoundException` bootstrap failure in this sandbox —
    confirmed via `git show --stat` to touch none of the files this branch's 2 commits
    (`c4c71ec46`, `bfd778a03`) change.
- SonarQube for this repo could not run at all: no Sonar config found anywhere (no `.env` in
  either `modules/com.etendoerp.go/` or `etendo_core/`, and `SONAR_TOKEN`/`SONAR_HOST_URL` absent
  from every shell profile checked) — a pure missing-credentials gap, distinct from and worse than
  `schema_forge`'s situation (which at least had working Sonar config).

## Decision: catch the branch up

The user approved bringing `feature/ETP-4352` up to date with `epic/ETP-3504` to fix the
stale-baseline coverage artifact. Delegated to Clerk, who first read `docs/branch-workflow.md`
(this worktree) and weighed the approach against a real precedent already visible in this
repository's shared history — `c0fa96215`, "Merge remote-tracking branch 'origin/epic/ETP-3504'
into feature/ETP-4203" (a sibling branch in the same repo; visible from this worktree too, since
worktrees share one `.git`). Concluded **merge**, not a literal rebase, was the right/established
approach: it preserves the branch's 5 already-reviewed commits intact rather than rewriting/
replaying each one against 1007 foreign commits. `docs/branch-workflow.md` itself doesn't
prescribe merge vs. rebase for catching a feature branch up with its epic — the precedent commit
is what settled it.

Executed: `git merge origin/epic/ETP-3504 --no-ff`, landing as
`82245ef848d9aac4fb92dd3d1e4af1d9c2d7e7bd` — "Merge remote-tracking branch 'origin/epic/ETP-3504'
into feature/ETP-4352" (2026-08-06 16:01:35 -03:00). Merge parents: `90423bda8` (this branch's
previous tip) and `29069b3a5` (epic's tip at merge time). 1423 files changed, +272798/-228911.

### Conflicts

Three real conflicts arose, all in `tools/app-shell/src/lib/observability/` (`events.js`,
`health-events.js`, `payload.js`). Every other file — including `SurveyModal.jsx` — auto-merged
cleanly. Each was resolved with actual understanding of both sides' intent, not a blind
ours/theirs pick.

Most notably, in `health-events.js`: epic's side of the conflict had **re-added the exact
`identify(username)` call inside `trackSessionStarted`** that this branch's own GDPR-remediation
commit had deliberately removed — epic had, independently and for unrelated
feature-flag-targeting reasons, touched that same function. Confirmed today via
`git show 82245ef84 -- tools/app-shell/src/lib/observability/health-events.js`:

```
export async function trackSessionStarted({ username, clientId, clientName } = {}) {
  // Re-target feature flags on the signed-in identity so bucketing matches the
  // Mixpanel user this session reports as. This does NOT reintroduce identify() —
  // that call was removed entirely from the survey/session flow as part of the
  // ETP-4352 GDPR remediation and must stay gone; setFeatureFlagContext is a local
  // OpenFeature evaluation-context update, unrelated to Mixpanel identity tracking.
  setFeatureFlagContext({ username, clientId });
  if (clientId) {
    void group('account_id', clientId);
    ...
```

The resolution correctly kept epic's unrelated, legitimate addition
(`setFeatureFlagContext({ username, clientId })` — a local OpenFeature context update, verified to
never touch Mixpanel) while permanently dropping `identify()` again. The comment left in place
documents exactly why, for the next person who greps this function. Resolved carelessly (e.g. a
blind "theirs" pick on this hunk), the merge could have silently reintroduced the original PII
leak this whole effort exists to close — it did not.

### Fixup commit

A follow-up fixup commit was needed on top: `2a643f3429cdfe8dc424bd972a12ac0ab2f6a61a` —
"Feature ETP-4352: Fix stale color literals after epic/ETP-3504 catch-up" (2026-08-06 16:16:12
-03:00, 2 files, `SurveyModal.jsx` + its test, 4 lines changed). Epic had done a repo-wide hex-color
→ CSS-variable-token migration that never saw a couple of hardcoded hex/rgb literals in
`SurveyModal.jsx` (added by an ETP-4352-era commit that postdated epic's migration pass on that
file), which was tripping `semanticThemeUsage.test.js` and 3 `SurveyModal.vitest.jsx` assertions.
Fixed to match the same semantic tokens used elsewhere in that file — no behavior change, per the
commit message itself.

## Closing the 2 genuine coverage gaps

Test coverage for the 2 real gaps found during diligence (`submitSurveyResponse`,
`mixpanel.js` storage-throw branches) was added by a Tester agent and landed as
`efd6a5b49a94f3d8f93fb1b26e727480df3c8ef8` — "Feature ETP-4352: Add coverage for survey feedback
POST and Mixpanel storage errors" (2026-08-06 16:22:01 -03:00, 2 files, +163 lines):

- `tools/app-shell/src/lib/surveys/__tests__/survey-config.vitest.js`: 7 new tests for
  `submitSurveyResponse` — confirmed today by diffing the commit — covering: missing
  apiBaseUrl/token/surveyKey (no-op guard), full happy-path POST (Bearer token, JSON content-type,
  full body), empty-string `apiBaseUrl` (the real dev-mode value), omitting
  score/feedback/tags when absent, omitting whitespace-only feedback and empty tags array,
  non-ok response (warns, doesn't throw), and `fetchImpl` rejection (warns, doesn't throw).
- `tools/app-shell/src/lib/__tests__/observability-mixpanel.test.js`: 2 new tests for the
  storage-throw resilience branches — confirmed today — a throwing `storage.getItem` ("not reset
  yet", still attempts reset, harmless retry) and a throwing `storage.setItem` (reset still runs,
  no exception propagates).

The Tester agent's own completion report was cut short/incomplete, so this was independently
re-verified directly rather than trusted as-is: both touched test files were re-run directly,
confirming all new + existing tests pass.

## Final validation — genuinely green (schema_forge)

With the branch caught up and the 2 gaps closed, the REAL `.githooks/pre-push` hook was run
end-to-end one final time in `schema_forge`:

- **Exit code 0.**
- Tests: 11046 passed, 2 skipped.
- SonarQube Quality Gate: OK — 0 bugs/vulnerabilities/code smells.
- Coverage-vs-base-branch comparison: **now passes** — 78.50% (this branch) vs 78.70%
  (`epic/ETP-3504`, current), within the tool's 1.00pp tolerance.
- Data-testid check: passed.
- Offline-regeneration/drift check: passed.

`schema_forge` is now genuinely push-ready per the repo's own defined bar. This side is done.

## Discrepancy found vs. the prior doc

The prior (now-completed) doc's "Post-commit production leak" section states: "`docs/surveys.md`'s
current prose... still says 'the browser's own storage (localStorage by default)'... that line has
NOT been corrected to say cookie." Verified today: this is **no longer accurate**. The correction
is already present in `docs/surveys.md` line 577 (`` `mixpanel-browser` persists `distinct_id` in
a cookie (e.g. named `mp_<TOKEN>_mixpanel`) `` ...), and `git log --follow -p -- docs/surveys.md`
shows this text was introduced in `580b2a231` itself — the very commit the prior doc described as
"NOT YET COMMITTED" at its own time of writing. In other words: by the time that fix was actually
committed (today, at this doc's starting point), the doc correction had already been folded in,
which the prior doc's body (written before the commit) could not yet reflect. **This means "Next
steps" item 2 from the prior doc is already done — do not re-do it.**

## Then-open question — resolved 2026-08-07

`com.etendoerp.go`'s 2 commits (`c4c71ec46`, `bfd778a03`) had clean, verified Java test coverage
for the actual changed code (25/25 `SurveyConfigServletTest` tests passing, confirmed unrelated to
the 4 pre-existing sandbox failures) as of 2026-08-06. But **no Sonar/coverage verification existed
for this repo at all**, purely because `SONAR_TOKEN`/`SONAR_HOST_URL` credentials for it were never
available in this environment (confirmed on 2026-08-06: absent from every shell profile checked, no
`.env` in either `modules/com.etendoerp.go/` or `etendo_core/`).

The user was asked directly: do they have these credentials to provide, or should this be accepted
as "verified elsewhere (CI, at PR time)" rather than blocking now? **Resolved the next day — see
"2026-08-07 — com.etendoerp.go Sonar gap closed" below.** The user found/generated a real token, a
real Sonar analysis ran for this repo for the first time, found and fixed 2 genuine issues, and
re-ran clean.

## 2026-08-07 — com.etendoerp.go Sonar gap closed

Picking up the "Then-open question" above. This session was scoped entirely to `com.etendoerp.go`
(`schema_forge` was untouched today — its state below is unchanged from 2026-08-06).

1. **Real Sonar credentials obtained.** The user generated a real SonarQube User Token via the
   SonarQube UI (`https://sonar.etendo.cloud` → avatar → My Account → Security → Generate Tokens)
   and provided it. Saved to `modules/com.etendoerp.go/.env` alongside
   `SONAR_HOST_URL=https://sonar.etendo.cloud` — confirmed gitignored today
   (`git check-ignore -v .env` → `.gitignore:34:.env`). This reuses the same self-hosted SonarQube
   instance `schema_forge`'s own `.env` already pointed to — a personal/user token works across
   projects on that instance, it is not project-scoped.
2. **First-ever real Sonar analysis for this repo.** Result: **Quality Gate FAILED** — not on
   coverage, but on 2 genuine CRITICAL code-smell violations (`java:S1192`, duplicated string
   literals): the CORS header literals `"Authorization, Content-Type"` and `"GET, POST, OPTIONS"`
   were each duplicated 3× across `SurveyConfigServlet.java`'s `doGet`/`doPost`/`doOptions`.
3. **Fixed.** Extracted `ALLOWED_METHODS`/`ALLOWED_HEADERS` constants in
   `src/com/etendoerp/go/schemaforge/SurveyConfigServlet.java`, matching the exact naming
   convention already used by the sibling `NeoFavoritesServlet.java` in the same package
   (confirmed today: both files now declare `ALLOWED_METHODS`/`ALLOWED_HEADERS` the same way), and
   replaced all 3 call sites. Pure refactor, no behavior change. Verified
   `SurveyConfigServletTest`'s 25 tests still pass, via the correct `./gradlew test` invocation
   from `etendo_core` root (per the invocation fix resolved earlier in this diligence effort — the
   module-scoped task reports `NO-SOURCE`).
4. **Re-ran Sonar: Quality Gate now OK.** Confirmed today via
   `modules/com.etendoerp.go/sonar-issues-pr-only.json`: `"total": 0`, `"issues": []`, all
   conditions passing.
5. **Committed:** `77609995` — "Feature ETP-4352: Extract duplicated CORS header literals to
   constants" — on top of `bfd778a03`/`c4c71ec46` (confirmed today via
   `git log --oneline -4` in that repo).
6. **A separate, genuine, NOT-fixed tooling gap was found and explicitly left unresolved** (flagged
   to the user, decision deferred — not yet answered as of today's session end): this repo's local
   Sonar setup never measures coverage correctly. Confirmed today by reading both files:
   - `run-sonar.sh` never runs `./gradlew test jacocoTestReport` (or equivalent) before invoking
     the `sonar-scanner` CLI — the only `gradlew`/`jacoco` references in the script are inside a
     generated prompt-text string, not an actual execution step.
   - `sonar-project.properties` never sets `sonar.coverage.jacoco.xmlReportPaths` at all.

   Two separate misconfigurations, not a one-line fix. Coverage reports as 0% for this repo's
   local Sonar runs regardless of how well-tested the code actually is (confirmed:
   `SurveyConfigServlet`'s new code has 25 real passing tests, yet Sonar shows 0% coverage for it)
   — a measurement-pipeline defect, not a real test gap. It doesn't currently block anything (the
   relevant Quality Gate coverage condition's threshold is 0, so it always shows OK regardless),
   but it means local Sonar runs for this repo can never meaningfully validate coverage until
   someone fixes the wiring. **The user was asked whether to fix this now or defer it, and had not
   answered when the session paused for the weekend.**

## Current repo state (verified 2026-08-07)

**`schema_forge`** (worktree `/home/futit/entornos/etendo-go/worktrees/ETP-4352/schema_forge`,
branch `feature/ETP-4352`) — unchanged since 2026-08-06, re-verified today:
- `git status --short`: clean (the only untracked entry is this plan doc itself, being edited now).
- Last 3 commits (newest first): `efd6a5b49` (coverage), `2a643f342` (color fixup), `82245ef84`
  (merge epic) — plus everything below them from the prior session (see "Discrepancy found"
  section above for full history).
- `git log origin/feature/ETP-4352..HEAD --oneline | wc -l` → **1015** commits ahead of
  `origin/feature/ETP-4352` (mostly absorbed `epic/ETP-3504` history from the 2026-08-06 catch-up
  merge, not 1015 ETP-4352-authored commits — see above). Nothing has been pushed.

**`com.etendoerp.go`** (`/home/futit/entornos/etendo-go/etendo_core/modules/com.etendoerp.go`,
branch `feature/ETP-4352`):
- `git status --short`: clean.
- Last 3 commits (newest first): `77609995` (CORS constants extraction — today), `bfd778a03`
  (ETGO_Survey_Type table), `c4c71ec46` (survey response endpoint).
- `git log origin/feature/ETP-4352..HEAD --oneline | wc -l` → **3** (was 2 as of 2026-08-06; the
  new CORS-fix commit brings it to 3). Nothing has been pushed.

**Both repos are now, per every check performed across this whole 2-day diligence effort,
genuinely push-ready code-quality-wise.** The only remaining decisions are push/PR itself (still
the user's call) and the deferred JaCoCo-wiring question above.

## Next steps

1. **Decide push/PR for both repos.** `schema_forge` is 1015 commits ahead of
   `origin/feature/ETP-4352` (mostly absorbed epic history, see above); `com.etendoerp.go` is 3
   commits ahead of its own origin tracking branch. Nothing has been pushed anywhere for either
   repo as of now. Both are verified green — this is a pure go/no-go decision, not blocked on any
   further diligence.
2. **Decide whether to fix the JaCoCo/coverage-wiring gap in `com.etendoerp.go` now or defer it.**
   See point 6 above: `run-sonar.sh` doesn't run tests/jacoco before scanning, and
   `sonar-project.properties` doesn't point at a JaCoCo XML report. Not blocking (the coverage gate
   threshold is 0), but local Sonar coverage numbers for this repo are meaningless until fixed.
3. **Optional cleanup, not blocking:** revisit
   `tools/app-shell/src/lib/__tests__/health-events.test.js` — the legacy, shallow `node --test`
   file flagged on 2026-08-06 as a source of false "uncovered lines" noise when V8/Istanbul
   coverage formats get merged. Confirmed still present on disk as of today; still untouched.
4. **Carried forward from the prior doc's "Next steps"** (already checked, item 2 of that prior
   list is done — see "Discrepancy found" above — so it is dropped):
   - Work through the 3 manual-verification suggestions from the prior doc, if the user still
     wants to: (a) personally trying the Back button's UX feel, (b) toggling a survey off via the
     actual backoffice UI (not SQL), (c) checking the real Mixpanel dashboard directly — this is
     exactly what caught the production leak that led to the identity-reset fix, so it's the
     highest-value of the three to actually do once this branch is pushed.
   - Findings 3–6 in `docs/ops/mixpanel-gdpr-privacy-audit.md` (main `schema_forge` checkout, not
     this worktree) remain open/deferred by product decision (Finding 3) or simply not yet
     scheduled (Findings 4–6) — no action expected unless the user raises them again.
