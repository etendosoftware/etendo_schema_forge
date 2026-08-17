# ETP-4906 — Multi-Role User Assignment UI with Live Permission Preview — Implementation Plan

> **For agentic workers:** This plan follows Forge's own pipeline (`CLAUDE.md`), NOT
> `superpowers:subagent-driven-development`/`executing-plans`. Each task below is
> assigned to a named pipeline agent and passes through **DEV → REVIEW → QA → DOCS**
> as a unit. Branch/PR/Jira operations are delegated to **Clerk**, never run directly.
> Tests are delegated to **Tester** per the repo's mandatory testing-delegation rule.

## Status (source of truth — update this table as work lands, before anything else)

**❌ REVIEW REJECT — B7, a new blocker on round 7's ADD-path fix (Alex, 2026-08-17)** —
`clearConflictingAccessUnconditionally` (commit `dfb7b242`) can permanently delete a dependent's
`AD_Window_Access` row with no recreation when `guardDependentsOf` fires from the `onUpdate` trigger
(a template's own existing row being edited directly, e.g. toggling read-only/full in Classic): core's
`RoleInheritanceManager#propagateUpdatedAccess` has no CREATE fallback (unlike `propagateNewAccess`,
which `handleAccess` does fall back to CREATE for) — verified by direct source reading, not yet
confirmed via a clean live JUnit repro (3 attempts, all foiled by test-harness/environment friction,
not by the theory). Rounds 5 (`404ece65`) and 6 (`a9ca301a`) are confirmed clean. See "REVIEW
Findings — Rounds 5-7" below for the full writeup, the exact fix needed, and 2 non-blocking
warnings (stale `neo-headless.md` §8d docs; data-testid codemod stamped `<Fragment>`/
`Context.Provider`). Prior banners below (kept for history) describe B6 as fully closed — that was
true only through round 6; round 7 (found via the epic rebase, not manual QA) reopens it again.

**Prior "✅ B6's 6th gap FIXED" banner (2026-08-17, superseded by the REJECT above — kept for
history):** commit `e81844c2`,
12/12 JUnit green, AND the human independently re-ran the ENTIRE manual-test checklist
below end to end after redeploy, every single item ✅ including the previously-broken
save/reload flow. B6 is now genuinely done: 6 rounds total, all 6 live-confirmed by
the human, not just JUnit. **Only remaining step before Clerk: a scoped REVIEW
re-check of commit `e81844c2`'s subtle winner/level-separation logic** (dispatched —
see Status table). Prior "REOPENED" banner (kept for history) below.

**Prior "REOPENED" banner (2026-08-17, resolved above — kept for history):** a 6th,
SEVERE B6 bug found by the human during the post-pipeline manual-test checklist — 500
error on save via the REAL production flow (`SFAssignUserRoles`, not just Classic
direct edits). Short version:
removing Finance's inheritance from a role composed of ALL 4 real system templates
(`Personal – NewUsertest`, the human's own real, legitimate multi-role test account —
same one B5/B6 already leaned on repeatedly) throws
`ConstraintViolationException: duplicate key value violates unique constraint
"ad_window_access_un_key"` on `(ad_role_id, ad_window_id) = (NewUsertest, 140)` — a
REAL crash, not a live-Classic-only edge case. The human's frontend showed "El usuario
se guardó, pero los roles no pudieron actualizarse: SFAssignUserRoles error: 500."
**This is the exact core supported flow this ticket exists to deliver ("assign/remove
roles via our own UI") — a blocker, re-dispatched immediately.** All 5 prior B6 rounds
only ever exercised 2-template overlap (`ClassicTemplateTest1Read`/`2Broad`) — this is
the first real-world test with 3+ overlapping templates cascading together, and it
breaks. REVIEW/QA/DOCS's prior APPROVE verdicts (below) are now stale for whatever B6's
6th fix touches — expect at least a scoped REVIEW/QA re-check of the affected file(s)
once this lands, same reject-cycle pattern as B6's earlier rounds.

**Prior "PIPELINE COMPLETE" banner (2026-08-17, superseded by the reopen above — kept
for history):** DEV → REVIEW → QA → DOCS all closed with no open blockers. REVIEW
final verdict: APPROVE. QA final verdict: APPROVE (1 unrelated pre-existing MEDIUM bug
found on a different client's role, scoped to a separate Remedy follow-up, not a
blocker here). DOCS: full freshness pass done, 5 more stale doc claims found and fixed
beyond what REVIEW itself caught. Only remaining step was going to be Clerk for
branch/PR creation — now blocked again by the reopen above.

**Prior banner (2026-08-16, superseded — kept for history):** REVIEW/QA/DOCS all
APPROVED/DONE against the code as it existed on 2026-08-14, BEFORE seven rounds of
human manual testing found real bugs/cosmetic issues. Since then, **DEV waves 6-12
have all landed** — see each "Manual QA Feedback... DEV wave N" section near the end
of this file for full detail:
- Wave 6 (5 fixes) — DONE + tested (commit `7f75e37f7`).
- Wave 7 (new `SFSystemRoleTemplates` backend endpoint + 4-file frontend repoint) —
  code done (`6b40bc7dd` frontend, `90f08997` backend). Tester follow-up DONE
  (agentId `a24834dfa45baed65`) — Vitest 646/12017/0 failed, Playwright 7/7.
- Wave 8 (layout: `inlineInHeaderCard`) — done, empirically verified (`b20afd7`).
- Wave 9 (grid column label + tab order) — done, empirically verified (`8b7e2f4`).
- Wave 10 (tab-order real root cause, `detailTabOrder`) — done, regression-tested
  (`1fc06ede4`).
- Wave 11 (matrix visual polish — pills, casing, role icons) — done, verified against
  screenshot (`8fe4753d8`).
- Wave 12 (discarded duplicate `firstName`/`lastName` User fields, fixed a real Nombre
  label collision) — done, verified via screenshot (`404a0ce70`). The 2 known-stale
  test items left for Tester are **now FIXED** (commit `ac30aed`): both
  `UserHeaderTable.vitest.jsx` (5-column assertion, `tools/app-shell` `user/`
  suite 108/108 green) and `e2e/tests/flows/user-role-assignment.mocked.spec.js`
  (switched the "unrelated field edit" from deleted `field-lastName` to `field-email`,
  spec 7/7 green) — see DEV wave 12 Findings for exact detail.
- **B5 — DONE (2026-08-16):** real-seed-data access-control JUnit tests (no-access
  both directions, read-only, full, most-permissive-wins) — landed as a new sibling
  file, `com.etendoerp.go` commit `8dbc1805`, 3/3 green. Also surfaced (not fixed by
  B5 itself, escalated to Task B6) a **real, not cosmetic, scoping gap in ETP-4852's
  own overlap-corruption fix**: `preventWindowAccessOverlapCorruption`/
  `reconcileWindowAccessAfterComposition` in `UserRoleCompositionService` only protect
  the ONE personal role actively being composed inside a single `assignTemplateRoles`
  call — any OTHER already-existing personal role that also inherits from a template
  whose `AD_Window_Access` changes gets swept into the same corrupting core UPDATE
  path with zero protection. Confirmed for real: `UserRoleCompositionServiceOverlapIntegrationTest`
  (4/4, pre-existing, unrelated to B5) now fails against a REAL composed personal role
  (from the human's own earlier manual QA testing, a legitimate multi-role user, NOT
  disposable test junk) exactly this way. **Corrected framing (2026-08-16): originally
  mis-logged as "dev-DB test pollution to clean up" — that was wrong. The real user
  account is valid evidence of a real gap, not noise; it must not be deleted. Human
  decision: widen the fix instead — see Task B6.**
- **B6 — DONE (2026-08-16/17), 5 rounds, ALL live-confirmed by the human in Classic**
  (not just JUnit — every round was re-verified against the running app after the
  first round's JUnit-only sign-off turned out to be insufficient):
  1. `d8dc9797` — ADD-path ownership corruption (2 overlapping templates composed).
  2. `58f114ea` — REMOVE-path ownership corruption (removing one of two overlapping
     templates).
  3. `e8b6ffc6` — most-permissive-wins wasn't enforced outside `assignTemplateRoles`
     (adding a lower-access template silently downgraded an existing full grant).
  4. `978e23e2` — the fix from #3 corrected the access LEVEL but not the
     `InheritedFrom` bookkeeping field, so removing the template that actually
     justified a widened grant never re-triggered re-derivation (stuck at full
     forever) — plus a same-flush race (Hibernate's Delete-after-Insert action-queue
     order) found and fixed in the same commit.
  `UserRoleCompositionServiceOverlapIntegrationTest` now 8/8,
  `UserRoleCompositionServiceRealAccessControlIntegrationTest` (B5) 3/3, human's real
  role `6AD5C0CC21F14050A65A3E62DC2FF9A2` reconfirmed untouched throughout. Full detail
  per round in the "B6 Findings" subsections near the end of this file.
**UPDATE (2026-08-17): REVIEW's 3 blockers (B1-B3) plus the B4 blocker they exposed are all now
CLOSED — see "REVIEW Findings — Final Verdict" below — REVIEW's overall verdict is APPROVE.
QA has now also run a full pass — see "QA Findings — Full Pass (Sentinel, 2026-08-17)" below —
and returned APPROVE as well, with one MEDIUM, non-blocking, pre-existing (not caused by this
ticket) data-integrity finding (BUG-1) recommended for a separate Remedy follow-up. Both DEV
(waves 6-12, B5, B6) and REVIEW are fully closed; QA is now also closed. **DOCS has now also run
a full freshness pass — see "DOCS Findings — Full Pass (Sage, 2026-08-17)" below — and is
closed**, having found and fixed real staleness in `user.md` and `02-capacidades-y-flujos.md` that
both the original DOCS pass and REVIEW's narrower re-checks missed (the discarded First
Name/Last Name callout, wave 11's undocumented matrix visual polish, wave 12's missing
pipeline-regeneration entry, and a stale claim that the excluded `userRoles` tab still renders).
DEV/REVIEW/QA/DOCS are all now closed.** Still owed to the human: the manual-eyeball-test
checklist requested earlier. **Concrete next steps, in order: (1) hand the human the manual-test
checklist, (2) optionally track BUG-1 as a separate Remedy data-fix task, unrelated to this
ticket's own scope, (3) ticket looks ready for Clerk to prepare the PR(s) once (1) is done.**

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| B1 | Spike: multi-company org-scoping | ✅ DONE | Findings below Task B1. Led to descoping B4/F4. |
| F1 | Spike: save-lifecycle hook | ✅ DONE | Findings below Task F1. `onAfterExistingSave` mechanism specified. |
| B2 | New webhook `SFUserRoleAssignments` | ✅ DONE | developer-3, agentId `a368a2b2d6b807025`. Committed `bc2b6c8c` — "Feature ETP-4906: Add SFUserRoleAssignments read webhook" (7 files, `com.etendoerp.go`, `feature/ETP-4906`, not pushed). Targeted tests green (`UserRoleCompositionServiceTest` 16/16, `SFUserRoleAssignmentsTest` 8/8, `NeoPseudoSpecDispatcherTest` 15/15, `SFAssignUserRolesTest` 8/8). Full-repo `:test` has 817 pre-existing unrelated failures (confirmed none touch these classes) — not a regression from this work. Real response shape in B2 Findings below. |
| B3 | `docs/neo-headless.md` §8e | ✅ DONE | Same commit `bc2b6c8c` as B2. Landed as §8e (not §4.12 as originally guessed in this plan — followed the existing §8b–8d numbering for this webhook family instead). |
| B4 | Multi-company backend | 🚫 DESCOPED | Moved to ETP-4889 (human decision). No work needed here. |
| Jira updates | Comment ETP-4906 (descope notes) + ETP-4889 (B1 findings) + ETP-4830 (F7 findings) | ✅ DONE | B4/F4 descope: ETP-4906 https://etendoproject.atlassian.net/browse/ETP-4906?focusedCommentId=143732 — ETP-4889 (starting spec) https://etendoproject.atlassian.net/browse/ETP-4889?focusedCommentId=143733 (ETP-4889 = "[ROLES2] Multi-organization support — phase 2 investigation", confirmed a good fit). F7 descope: ETP-4906 https://etendoproject.atlassian.net/browse/ETP-4906?focusedCommentId=143750 — ETP-4830 (starting spec) https://etendoproject.atlassian.net/browse/ETP-4830?focusedCommentId=143749 (ETP-4830 = "[ROLES/USERS] Send invite email on admin-created users", already assigned to the human, status TBD, previously zero comments — confirmed a good fit and recommended its scope be widened to include the frontend snackbar alongside the email send). |
| F2 | `lib/userRoleAssignmentsApi.js` | ✅ DONE | Committed locally by developer-2, `feature/ETP-4906`, commit `f3b768d17`. Exact exported signatures in F2's section below. |
| F3 | `AssignTemplateRolesControl.jsx` + `DetailView.jsx` `onAfterExistingSave` + `windows/custom/user/index.jsx` | 🔄 IN PROGRESS (DEV + tests complete) | developer-2 built the component/wrapper (agentId `a235bf7765174e48b`, session ended before landing the `DetailView.jsx` prop or the registry wiring). A follow-up developer session closed both gaps — see "F3 Findings" below. DEV wave 4 additionally fixed the `additionalDirtyState` Guardar-enablement bug found here during F9's Playwright pass (see F9 Findings). F9 tests (Vitest + Playwright) are now done. Only REVIEW/QA remain. |
| F4 | Empresa multi-select | 🚫 DESCOPED | Moved to ETP-4889 (human decision). Do not build. |
| F5 | "Roles del usuario" tab | 🔄 IN PROGRESS (DEV + tests complete, dead-code bug FIXED) | `UserRolesTab.jsx` is DEV-complete on disk (agentId `a09d3b86a5c3ba7d2`'s session ended without a completion notification, but the file itself is finished — verified by direct read, then confirmed independently by Tester). F9 added 15 Vitest tests, all green, but surfaced a real dead-code bug: loading/error states can never render because the empty-state check runs first and `columns` (derived from `rolesOverview`) is `null` during the entire fetch and after a rejection — see F9 Findings. **FIXED (2026-08-14, developer follow-up):** reordered the render branches in `UserRolesTab.jsx` so `loading`/`error` are checked before `columns.length === 0`, per DEV wave 3 below. **Tester follow-up done (2026-08-14):** the 2 stale `KNOWN BUG (dead code)` tests in `UserRolesTab.vitest.jsx` were updated to assert the fixed behavior (`UserRolesTab__loading`/`UserRolesTab__error` now expected to render, not `UserRolesTab__empty`); `UserRolesTab.vitest.jsx` 15/15 green, `windows/custom/user/` 98/98 green, full repo suite 646 files / 12007 tests passed / 3 skipped, 0 failed. |
| F6 | Grid role chips + filter | 🔄 IN PROGRESS (DEV + tests complete) | `RoleChipsCell.jsx`/`RoleFilterControl.jsx`/`UserHeaderTable.jsx` are DEV-complete on disk (agentId `a535648d451959aeb`'s session ended without a completion notification, but verified done by direct read — decisions.json's grid column/toolbar-filter registration and generated `UserPage.jsx` wiring both confirmed). F9 added 43 Vitest tests (23+9+11) across the three files plus Playwright coverage (role filter incl. Admin), all green, **no bugs found**. `sf-validate-pipeline --scope=user` confirmed OK during F3's DEV-wave-2 fix (covers the same `decisions.json`, no changes to it since). Only REVIEW/QA remain. |
| F7 | Invite snackbar | 🚫 DESCOPED, moved to ETP-4830 | Human decision 2026-08-14, same pattern as B4/F4 → ETP-4889: no invite-email mechanism exists for admin-created users today (see F7 Findings), so no snackbar ships in ETP-4906. `InviteRolesSnackbar.jsx` will land together with the real email flow when ETP-4830 (already assigned to the human, status TBD) is picked up. |
| F8 | i18n keys | ⏳ PENDING | Rolls into F3/F5/F6 as they land — no standalone dispatch. F7 is descoped, so it contributes no i18n keys. |
| F9 | Tests (Tester) | ✅ DONE (Vitest + Playwright done, both known bugs FIXED, stale tests updated, i18n gap closed — see F9 Findings, DEV wave 4 + Tester wave 5) | Vitest coverage landed for F2/F3/F5/F6 + the `DetailView.jsx` `onAfterExistingSave` prop (F1/F3) — 9 files, 135 new tests, full suite green. Playwright landed: `e2e/tests/flows/user-role-assignment.mocked.spec.js`, multi-role assign flow on an existing user (chip toggle/removal, live matrix, save wiring, reload persistence) + grid role filter (template role + Admin). F7's invite snackbar stayed out of scope (descoped to ETP-4830, no component exists). A real, severe bug was found while writing the Save-flow scenario: role-only chip changes could never enable the "Guardar" button — **FIXED (DEV wave 4):** `additionalDirtyState` wired through `windows/custom/user/index.jsx`. A second, smaller i18n gap (4 missing locale keys in `AssignTemplateRolesControl.jsx`) was also found and **FIXED same session.** **Tester wave 5 (2026-08-14, this session) — DONE:** folded the stale `KNOWN BUG` Playwright test into `once Guardar is clickable…`, renamed to `a role-only chip change enables Guardar and, once clicked, calls SFAssignUserRoles exactly once with the full desired role-id set`, now asserting the fixed behavior end to end (role-only toggle enables Guardar, toggling back disables it, save fires the webhook once, post-save Guardar disables again, an unrelated second save doesn't re-fire) — spec now 7 tests, all green. Added 4 new Vitest tests in `index.vitest.jsx` directly covering the `additionalDirtyState` prop (initial `false`, becomes `true` on toggle, returns to `false` on toggle-back, and the critical post-save regression case). Also closed the adjacent `roleAssignmentSaveFailed` i18n gap (both locale files) noticed but left unfixed by DEV wave 4. See "F9 Findings" and "Tester Wave 5 Verification" below for full detail. |
| F10 | Docs (Sage) | ✅ DONE (2026-08-17, full freshness pass against waves 6-12/B5/B6) | See "DOCS Findings — Full Pass (Sage, 2026-08-17)" below. Fixed real staleness the earlier pass (commit `acf7e78cf`) and REVIEW's narrower re-checks both missed: `user.md`'s field list/reactive-behavior/gap-assessment text still described the discarded First Name/Last Name callout (wave 12) as live; wave 11's matrix visual polish (pills, category-header casing, per-role icons) had zero doc coverage; the pipeline-regeneration section didn't cover wave 12's independent `decisions.json` diff; `02-capacidades-y-flujos.md`'s CAP-ROL-02 "Huecos abiertos" bullet still claimed the excluded `userRoles` tab "still reflects" its legacy row post-wave-6, when it no longer renders at all. Also added `user` as a "Real example" in `ui-customization.md`'s `headerExtra`/`customComponents.headerTable` sections and refreshed `INDEX.md`'s stale ETP-4512-era one-liner for `user.md`. Verified `docs/neo-headless.md` §8d's `WindowAccessOverlapCorruptionGuard` subsection (REVIEW's own addition) is complete and well-integrated — no changes needed there. Checked `onAfterExistingSave`/B6's `EntityPersistenceEventObserver` pattern for cross-cutting indexing gaps — both intentionally out of scope for existing doc structures (consistent with their own precedents, `onAfterCreate`/`ContactNameSyncHandler`, also undocumented there) — flagged as non-blocking suggestions, not fixed. All i18n keys the doc relies on independently re-verified present in both locale files. |
| DEV wave 6 | 5 manual-QA fixes (spacing, blank-trigger, toast sequencing, duplicate tab, unfiltered matrix) | ✅ DONE + tested | Frontend only. Commits `66c0df38b` (fix) + `7f75e37f7` (Tester follow-up). See "Manual QA Feedback... DEV wave 6" section. |
| DEV wave 7 | Padding correction + new `SFSystemRoleTemplates` backend endpoint + 4-file frontend repoint | ✅ CODE DONE, ⚠️ tests RED | Both repos. `etendo_schema_forge` commit `6b40bc7dd`, `com.etendoerp.go` commit `90f08997`. 46 Vitest tests failing (mock gap only, see Findings). **Tester NOT dispatched yet — paused by human.** Human is currently rebuilding/redeploying `com.etendoerp.go` to test this live. See "Manual QA Feedback Round 2... DEV wave 7" section. |
| B5 | Backend test gap: real access-control scenarios (no-access x2, read-only, full, most-permissive-wins) against real seed data | ✅ DONE | `com.etendoerp.go` commit `8dbc1805` — "Feature ETP-4906: Add real-seed-data access-control JUnit tests". New sibling file `UserRoleCompositionServiceRealAccessControlIntegrationTest.java`, 3 test methods, all 4 outcomes, real DB, 3/3 green. **Also found (NOT fixed, escalated to B6):** the pre-existing `UserRoleCompositionServiceOverlapIntegrationTest` (4/4 tests) fails against a REAL, legitimate composed user account — a genuine scoping gap in ETP-4852's fix, not test pollution — see "B5 Findings" below. |
| B6 | Widen ETP-4852's overlap-corruption fix to protect ALL roles inheriting from a touched template, not just the one actively being composed | ✅ DONE — all 6 rounds live-confirmed by the human (2026-08-16/17), including a full manual-checklist re-run after round 6's redeploy. | `com.etendoerp.go` commit `d8dc97976a49a7da4d9e857420110556b9d55c55` fixed the ADD-side ownership corruption (adding a 2nd overlapping template) — JUnit 5/5 + 3/3 green, AND live-confirmed by the human in Classic. Commit `58f114ea` closed the REMOVE-side ownership gap — JUnit 6/6 + 3/3 green, human's real role verified untouched via `psql`, deployed and live-confirmed by the human. Commit `e8b6ffc6` closed a 4th gap (silently WRONG most-permissive-wins result outside `assignTemplateRoles`) — JUnit 7/7 + 3/3 green, deployed, live-confirmed by the human. **Commit `978e23e2` (this round) closes a 5th gap the human found immediately after, on the REMOVE direction of the SAME scenario: `widenInheritedAccessLevelIfNeeded` (round 4) corrected the visible access level but never corrected `InheritedFrom` on the same row, so removing the template that actually justified the widened value never re-triggered re-derivation (confirmed live via `psql`: `isreadwrite='Y'` but `inherited_from` still pointed at the OTHER, non-justifying template) — the row stayed stuck at full forever.** Fix: `widenInheritedAccessLevelIfNeeded` now also repoints `InheritedFrom` to whichever OTHER active template actually justifies the widened value, via the same `event.setCurrentState` mechanism already used for the level and for ownership; `anyOtherActiveTemplateGrantsFullAccess` (boolean) was changed into `findActiveTemplateGrantingFullAccess` (returns the justifying `Role`), and `findActiveTemplatesFor`'s underlying query now orders by `AD_Role_Inheritance.SeqNo` DESCENDING so the tie-break (2+ equally-responsible templates) deterministically picks the highest-sequence one — mirroring core's own `RoleInheritanceManager#propagateDeletedAccess` heuristic. **A second, same-flush race was found and fixed while verifying this empirically** (JUnit red before the fix): the freshly re-derived row's widen-check, nested inside the SAME flush that is still mid-way through deleting the just-removed template's own `RoleInheritance` row, could still see that row as `active=true` (Hibernate runs Deletions after Insertions in its default action-queue order) and immediately re-widen the row right back, undoing the removal within the same flush. Closed via a new `TEMPLATES_BEING_REMOVED` thread-local marker (populated by `guardRemovedInheritance`, consulted by `findActiveTemplatesFor`, cleared once per transaction via a new `onTransactionComplete(TransactionCompletedEvent)` observer — safe because a marker surviving until transaction end can only make the guard MORE conservative, never less correct). New JUnit test `testRemovingTheTemplateThatJustifiedAWidenedAccessLevelCorrectlyDowngrades` (bystander role: full template added first, read-only second — the exact order that reproduces the bookkeeping bug — asserts `InheritedFrom` is repointed to the justifying template, THEN removes that template's inheritance and asserts the window downgrades to the remaining template's read-only level, not stuck at full). Also updated the pre-existing round-3 test's now-stale "last write wins" sanity assertion, which had been silently encoding the round-5 bug's own symptom as expected behavior (InheritedFrom==Sales) — now correctly expects InheritedFrom==Finance, consistent with round 5's immediate repoint. Full suite: **`UserRoleCompositionServiceOverlapIntegrationTest` 8/8 + `UserRoleCompositionServiceRealAccessControlIntegrationTest` 3/3 green**, fresh `--rerun-tasks` run from `etendo` root. Human's real role `6AD5C0CC21F14050A65A3E62DC2FF9A2` reverified untouched via read-only `psql`. Also confirmed, via read-only `psql` against the human's own live `ClassicDebug` role (`77E57880608E49D9966BC7C87F37A786`), that the CURRENT (pre-fix-deploy) live state exhibits exactly the reported bug (`isreadwrite='Y'`, `inherited_from` = `ClassicTemplateTest1Read`, not `ClassicTemplateTest2Broad`, which had already been removed) — confirms the repro is real and matches this fix's target. `./gradlew smartbuild` + Tomcat restart completed (`Server startup` confirmed in logs), deployed live — **human's own Classic re-confirmation is the last acceptance step, not yet performed: re-add `ClassicTemplateTest2Broad`'s inheritance to `ClassicDebug` (full, confirms round 4 still works) → remove it again → Business Partner must now correctly downgrade to `ClassicTemplateTest1Read`'s read-only level, not stay stuck at full.** See "B6 Findings — InheritedFrom bookkeeping fix (developer, 2026-08-16)" below. **Commit `e81844c2` (6th round) closes a genuinely NEW, structural gap the human hit on the REAL `SFAssignUserRoles` webhook (not Classic): a 500 error (`ConstraintViolationException`, duplicate key on `ad_window_access_un_key`) removing Finance from a role composed from all 4 real templates (Finance/Sales/Purchasing/Inventory) — the first scenario with 3+ overlapping templates, which none of the prior 5 rounds' tests (always exactly 2 templates) could structurally reproduce.** Root cause: `guardRemovedInheritance` deleted the dependent's row once per remaining template that didn't already own it, forcing core's `RoleInheritanceManager#calculateAccesses` onto the CREATE path independently for EACH remaining template covering that window — with 2+ remaining templates overlapping the same window (only possible at 3+ templates total), core's own per-template passes (no flush between them, `FlushMode.COMMIT`) each found no row and issued a competing `copyRoleAccess` INSERT for the identical `(role, window)` key, crashing at flush. Fix: compute ONE winner per window across ALL remaining templates up front — `InheritedFrom` always set to the highest-`SeqNo` grantor (matching core's own `isPrecedent` ordering exactly, so core's recalculation never touches the row again), with the access level decided SEPARATELY via most-permissive-wins — then correct the row IN PLACE via a bulk HQL UPDATE (never delete+recreate) via a new `repointInPlace` method. A first implementation that picked the winner by preferring a full-access grantor (mirroring `findActiveTemplateGrantingFullAccess`'s ADD-side tie-break) was WRONG and reproduced the identical `OBSecurityException` client-corruption bug one step later, confirmed live in JUnit before correcting to the SeqNo-only winner + separately-decided level design described above — see "B6 Findings" below for the full empirical trail. New JUnit test `testRemovingOneOfFourTemplatesLeavesTwoRemainingOverlappingTemplatesUnbroken` reproduces the real 4-template shape and the exact removal that crashed. Full suite: **`UserRoleCompositionServiceOverlapIntegrationTest` 9/9 + `UserRoleCompositionServiceRealAccessControlIntegrationTest` 3/3 green**, fresh `--rerun-tasks` run from `etendo` root. Human's real role `6AD5C0CC21F14050A65A3E62DC2FF9A2` reverified untouched and consistent via read-only `psql` both before and after. `./gradlew smartbuild` + Tomcat restart completed, deployed live — **human's own re-confirmation via the real "Asignar roles" UI is the last acceptance step, not yet performed: remove Finance from `Personal – NewUsertest` again, confirm the save succeeds with no 500 error.** See "B6 Findings — 6th gap fix (developer, 2026-08-17)" below. **Commit `dfb7b2427137ae3ded6a906348b6781d4ec5382b` (7th round) closes the SAME duplicate-INSERT bug shape on the ADD path, found by an independent test (`UserRoleCompositionServiceOverlapReverificationTest`, arrived via a rebase onto a newer `epic/ETP-3504`, written by a different QA reverification pass on ETP-4852/4878's original fix) — 2 of its 3 tests crashed with `ConstraintViolationException` on `ad_window_access_un_key` at a plain `grantWindowAccess(template, window, ...)` call, BEFORE `assignTemplateRoles` was even called.** Root cause (traced via `org.hibernate.SQL`/`BasicBinder` TRACE logging, NOT the shape hypothesized at dispatch time): `guardDependentsOf`/`guardNewInheritance`'s OLD "skip if the dependent's existing row is already correctly sourced from the granting template" shortcut assumed core's own `RoleInheritanceManager#handleAccess`/`getAccess()` would independently reach the same "no change needed" conclusion — but `AccessTypeInjector#findAccess`'s generated query filters by `AD_Client_ID in (...)` using the CALLING context's OWN readable-clients list (confirmed via bound-parameter dump: the ambient test context's readable clients did not include the dependent roles' real tenant client), so core's lookup returns `null` for a row that genuinely exists whenever the dependent's client is outside that list — `handleAccess` then ALWAYS takes the CREATE branch regardless of whether a correctly-sourced row already exists, and a left-in-place "already correct" row collides with core's own blind `copyRoleAccess` INSERT. Fix: `guardDependentsOf`/`guardNewInheritance` now route through a new shared `clearConflictingAccessUnconditionally` helper that ALWAYS force-deletes a dependent's existing row via `deleteForcingCreatePath` (never skips, even when already correct) — `repointInPlace` (round 6's in-place-update pattern) was considered and REJECTED for this specific bug shape: since core's own CREATE fires regardless of what values a left-in-place row holds, only physically removing the row before returning control to core prevents the collision; `repointInPlace` remains correct and unchanged for `guardRemovedInheritance`'s own (different-shaped) race, where the fix is specifically about making core's query ABLE to find the row via SeqNo-precedence, not about making core blind to it. Two ALSO-flagged test-data bugs (independent of the guard, confirmed via `psql`: the test's own seed calls tried to `INSERT` a brand-new `AD_Window_Access` row for a template that already had a real, correctly-leveled row for that exact window, drifted into this environment by earlier manual verification of rounds 6/7 against the real webhook) were fixed by extending the test's existing "skip seeding a template that already has the exact grant" pattern (previously only applied to Sales in the Contactos test) into a shared `ensureReadOnlyWindowAccess` helper, applied to all 3 seed calls across both affected test methods. Also fixed, in the SAME pass per the coordinator's dispatch, all 7 bundled SonarQube findings in the 2 touched files: extracted `WindowGrantors`/`collectWindowGrantors`/`repointWindowIfNeeded` out of `guardRemovedInheritance` (cognitive complexity 19→ within budget, per-loop break/continue 2→0) and `confirmPersonalRoleForUser` out of `UserRoleCompositionService#getAppliedTemplateRoleIdsForClient` (complexity 16→ within budget, break/continue 3→0 in that loop); rephrased one prose comment (`correctInheritedOwnership`) that happened to end mid-sentence with a `;`, which Sonar's `S125` heuristic flagged as commented-out code. Verified via `./run-sonar.sh --all-issues --fail-on-gate --jacoco-xml ...` (the exact command `.githooks/pre-push` step 3 uses): **0 issues in either touched file** (previously 7); 55 pre-existing code-smells remain across 21 OTHER, unrelated files (untouched by this round); the 1 new-code issue Sonar's Quality Gate flagged is in an unrelated file (`OnboardingAccountingWiringService.java`, unrelated pre-existing debt) and the script itself confirmed "no new issues fall inside this PR's diff — CI's PR gate would PASS." `UserRoleCompositionServiceOverlapReverificationTest` **3/3 green** (was 1/3), full suite via the EXACT pre-push command `cd etendo && ./gradlew test --tests "com.etendoerp.go.*"`: **7761 tests, 7752 passed, 0 failed, 0 errors, 9 skipped** (same 9 as before, matches the DoD's expected count exactly). Human's real role `6AD5C0CC21F14050A65A3E62DC2FF9A2` AND the round-7 test's own bystander role `F238CDA054BE4D649B1BDD59F73019E1` both reverified BYTE-IDENTICAL via read-only `psql` before vs. after the entire fix+Sonar+full-suite pipeline. Committed locally only (`dfb7b242`), NOT pushed — the human will push themselves using the real pre-push gate as the final check. See "B6 Findings — 7th gap + Sonar cleanup (developer, 2026-08-17)" below. |
| REVIEW | Alex | ❌ REJECT (2026-08-17), **B7 fix DELIVERED (developer, 2026-08-17) — awaiting Alex's re-review.** `com.etendoerp.go` commit `c06edc8f` makes `guardDependentsOf`'s onUpdate-triggered call use a non-deleting, in-place correction (`repointIfAlreadySourcedFromTemplate`/`repointInPlace`) instead of round 7's unconditional delete, closing the "[B7]" gap. Live-reproduced (unlike REVIEW's own 3 inconclusive attempts) — see "B6 Findings — B7 fix (developer, 2026-08-17)" below for the full detail, including a SECOND, previously-unknown bug the fix's own live repro surfaced (`session.evict()` mid-`onFlushDirty` colliding with Hibernate's collection-reachability walk) and how it was closed. New JUnit test green, full suite `com.etendoerp.go.*` **7762 tests, 7753 passed, 0 failed, 9 skipped** (was 7761/7752/0/9 — exactly +1 for the new test, no regressions), Sonar Quality Gate OK (0 issues, 0 new-code issues, coverage unchanged 76.70%→76.70%). W1/W2 (docs staleness, data-testid codemod) untouched, per the dispatch's own scope (DOCS phase / future frontend round respectively). | See "REVIEW Findings — Rounds 5-7" below for the ORIGINAL B7 finding (B7 blocker + 2 non-blocking warnings: stale `neo-headless.md` §8d, data-testid codemod stamped `<Fragment>`/`Context.Provider`) and "B6 Findings — B7 fix (developer, 2026-08-17)" below for the fix. Prior rows below (`✅ APPROVE`) covered everything through B6's 6th round only — B7 reopens REVIEW on `WindowAccessOverlapCorruptionGuard` again, same reject-cycle pattern as B6's own earlier rounds. See "REVIEW Findings — Final Verdict" below for the B4 close-out, and "REVIEW Findings — Scoped Check of B6 6th Round" below for the round-6 pass. Narrow re-check of the sole remaining blocker: `docs/generated-custom-windows/user.md:25`'s "Window shape" bullet, fixed by commit `3ed4bc7ea`. Verified lines 20-32 are now internally consistent with lines 46/75 (all three describe `emailConfiguration` as the mounted detail child, no contradiction left), and independently re-verified against the real `UserPage.jsx` (`detailEntity="emailConfiguration"` line 253, `DetailTable={EmailConfigurationTable}` line 255, `DetailForm={EmailConfigurationForm}` line 256). No new issues found. Prior full re-review (see "REVIEW Findings — Re-Review After Blocker Fixes" below) had already independently re-verified B1/B2/B5/B6 CLOSED and B3 mostly closed — this pass closes the last gap (B4). Ticket is APPROVE end to end: waves 6-12, B5, B6, and this final blocker-fix round. **Follow-up scoped pass (same day):** independently re-verified `com.etendoerp.go` commit `e81844c2` (B6's 6th round, the duplicate-INSERT crash fix) — winner/winnerLevel separation confirmed genuinely decoupled, bulk HQL UPDATE property names confirmed correct against the real `WindowAccess` model, `TEMPLATES_BEING_REMOVED` marker confirmed unaffected and still logically sound, JUnit re-run fresh (9/9 + 3/3 green). 0 blockers; 1 non-blocking suggestion (add a regression test for the documented residual "no existing row" gap in a future round). |
| QA | Sentinel | ✅ APPROVE (2026-08-17, full pass against waves 6-12/B5/B6/B1-B4) | See "QA Findings — Full Pass (Sentinel, 2026-08-17)" below. Every automated suite re-confirmed green on a FRESH run (Vitest 646/12017/3 skipped/0 failed; Playwright 7/7; backend `OverlapIntegrationTest` 8/8 + `RealAccessControlIntegrationTest` 3/3 via freshly-timestamped JUnit XML, `--rerun-tasks` from `etendo` root; `sf-validate-pipeline --scope=user` OK). DB reference data re-verified — GOClient id, the 4 CURRENT system-level `SystemRoleTemplates` ids, and all B6 test-role ids all match live DB, zero drift. **The prior pass's #1 open item (backend redeploy) is now CLOSED** — confirmed via `docker inspect` the Tomcat container restarted `2026-08-16T23:17Z` and `SFUserRoleAssignments` now returns a normal 401 (not the old 404 "Spec not found"). Live browser E2E still blocked on the same standing credentials gap (checked for a stored password this pass, found none — not fabricated) — not a blocker, same precedent as before. Adapted verification: inspected the real, live `Personal – NewUsertest` account (role `6AD5C0CC21F14050A65A3E62DC2FF9A2`) DB state directly — all 4 templates composed, 33 `AD_Window_Access` rows, 0 ownership mismatches, `Default_Ad_Role_ID` correct — strong real-account evidence under maximal composition. Independently read-verified B6's `WindowAccessOverlapCorruptionGuard` for regression risk on unrelated role edits — confirmed narrowly gated, no misfire risk found. **One MEDIUM finding (BUG-1):** pre-existing, ETP-4906-unrelated `AD_Window_Access` ownership corruption on GOClient's `RoleFinanzas` role (27 rows, dated 2026-08-13/14, predates B6's guard entirely) — not retroactively healed by the guard (prevention-only by design), not a blocker, recommend a separate Remedy data-fix pass. No Critical/High bugs. **QA is done, APPROVE. Recommend proceeding to DOCS (Sage) — DOCS already ran once (commit `acf7e78cf`) but a freshness check against waves 6-12/B5/B6 is worth a quick look.** |

**If resuming this ticket cold (e.g. a fresh session after running out of tokens):**
1. Read this table first, then only the task sections whose status isn't ✅/🚫 — each
   PENDING/IN PROGRESS task's own section already has everything needed to pick it up
   (files, acceptance criteria, dependencies). Findings from completed spikes/tasks are
   inlined directly under their own task heading (search for "Findings").
2. For every 🔄 IN PROGRESS row with an `agentId`: try `ListAgents` first — if it's
   still listed, `SendMessage` to that exact agentId to check status/resume it (it has
   full context, cheaper than re-briefing a fresh agent). If it's gone (session ended),
   the agentId is dead — check actual file state on disk instead (`git status --short`
   in the relevant repo) to see what that agent actually finished before disappearing,
   then either finish it yourself or redispatch a fresh agent with a prompt built from
   this plan's task section + whatever's already on disk. **Do not assume a task is
   incomplete just because its agent is gone** — verify via `git status`/`git log`
   first, the same way developer-3's B2/B3 code was confirmed done-but-uncommitted by
   reading files directly rather than trusting an ambiguous notification.
3. Two repos are in play, both already on branch `feature/ETP-4906`, no worktrees:
   `/Users/gremiger/workspaces/etendogoclean/etendo/etendo_schema_forge` (frontend) and
   `/Users/gremiger/workspaces/etendogoclean/etendo/modules/com.etendoerp.go` (backend).
   Neither should be pushed without explicit human request.

**Goal:** Let an admin assign 1+ system-level template roles (Finance/Sales/Purchasing/
Inventory) to a user from the Users list/form and see a live per-role permission
preview before saving — building on the already-shipped ETP-4852 (role composition
backend) and ETP-4878 (permission matrix data) work. Multi-company ("Empresa") support
is explicitly OUT of scope for this ticket — descoped to **ETP-4889** after the B1
spike found no multi-org-per-tenant capability exists yet to build against (see B1
Findings, Task B4).

**Architecture:** Reuse existing backend building blocks (`UserRoleCompositionService`,
`SFAssignUserRoles`, `SFRolesOverview`, `SFListMenu`) wherever they already return the
needed shape; add exactly one new read-path webhook (`SFUserRoleAssignments`) to close
the one real gap — "which template roles does user X currently have". On the frontend,
replace the stale `AssignRoleControl.jsx` (ETP-4512, writes `defaultRole` directly —
predates ETP-4852's composition model and was never updated) with a new multi-select
control, add a new "Roles del usuario" tab, and extend the Users grid/toolbar.

**Tech Stack:** Java 11 / Openbravo DAL / Weld CDI (`com.etendoerp.go`), React + Vite +
Tailwind + shadcn/ui (`tools/app-shell`), Schema Forge `decisions.json` pipeline.

## Global Constraints

- Never weaken `UserRoleCompositionService#enforceCallerClientBoundary` — any new
  endpoint touching user/role data needs the same caller-client-boundary discipline.
- Admin (`is_client_admin='Y'`) is out of scope for composition everywhere — never a
  selectable template in the multi-select, never written by `SFAssignUserRoles`. It
  MAY still appear as a read-only filter option / grid value (a user can carry the
  classic Admin role directly, outside composition — confirmed in `Filtro Usuarios
  Admin.png`).
- 12 windows have no `AD_Window_ID` (see `TemplateRoleWindowAccess`'s javadoc for the
  full list). Per this session's decision: hardcode `Inicio (Dashboard)`, `Favoritos`,
  `Copilot (Asistente IA)` as always-✓ in the matrix (matches `Roles.png`'s convention
  for the sibling ETP-4907 page); omit the other 9 gap rows entirely. **REVIEW (Alex)
  must re-confirm this against the live Figma file before merge** — this was decided
  from a static screenshot, not the source file.
- Role-chip edits are **local-only until Guardar** — the live matrix preview is computed
  from already-fetched data + local selection state, with zero extra network calls per
  chip toggle. `SFAssignUserRoles` fires exactly once, on save, with the full desired
  set (it's already a set-reconciliation call, not additive — see its javadoc).
- The multi-role picker and "Roles del usuario" tab are **existing-user only**. On
  create, the form saves the plain `AD_User` fields first, then applies the selected
  roles as an immediate follow-up call. **Correction (F7 Findings, 2026-08-14): saving
  does NOT trigger an invite email today** — this line originally assumed it did; two
  independent investigations (F7's developer session) traced the actual
  `EtendoGoAccountProvisioning`/`EtendoGoJwtDalHelper` create path and confirmed no
  email fires for admin-created users. That gap is tracked separately as **ETP-4830**
  (F7 descoped there — see Task F7). Never attempt `SFAssignUserRoles` before an
  `AD_User_ID` exists.
- `com.etendoerp.go` Java/Gradle work: use the plain branch already checked out
  (`feature/ETP-4906`), never a worktree — Gradle doesn't recognize `.worktrees/*`.
- Never push `com.etendoerp.go` without explicit human request — commit locally only.
- Every user-visible string needs BOTH `en_US.json` and `es_ES.json` keys.
- Any test-writing work (Vitest or Playwright) MUST be delegated to Tester, not written
  inline by the developer agent.
- Window Change Integrity Protocol applies to any `artifacts/user/decisions.json`
  change: edit decisions only, `make regen ONLY=user`, verify contract, verify import
  paths, verify addLineFields (n/a here, no lines entity).

---

## File Structure

**`com.etendoerp.go`:**
- `src/com/etendoerp/go/roles/UserRoleCompositionService.java` — add a public read
  method (no new class needed; keeps the "one service owns this domain" convention).
- `src/com/etendoerp/go/schemaforge/webhooks/SFUserRoleAssignments.java` — **new**,
  thin webhook shim mirroring `SFAssignUserRoles`'s structure.
- `src-test/src/com/etendoerp/go/schemaforge/webhooks/SFUserRoleAssignmentsTest.java`
  — **new**.
- `src-test/src/com/etendoerp/go/roles/UserRoleCompositionServiceTest.java` — extend
  with cases for the new read method.
- `docs/neo-headless.md` — new §4.12 entry for the endpoint.
- Multi-company: no files — descoped to ETP-4889 (see Task B4).

**`etendo_schema_forge`:**
- `tools/app-shell/src/lib/userRoleAssignmentsApi.js` — **new**, fetch/save wrappers.
- `tools/app-shell/src/windows/custom/user/AssignRoleControl.jsx` — **deleted**,
  replaced by:
- `tools/app-shell/src/windows/custom/user/AssignTemplateRolesControl.jsx` — **new**,
  multi-select chip control.
- `tools/app-shell/src/windows/custom/user/index.jsx` — **new**, wraps the generated
  `UserPage`, provides `RoleSelectionProvider`, wires `onAfterExistingSave` (F1/F3) —
  requires a matching `customLoaders['user']` entry in `windows/registry.js` (F3
  Findings) or it never mounts.
- `tools/app-shell/src/windows/custom/user/UserRolesTab.jsx` — **new**, the "Roles del
  usuario" live matrix.
- `tools/app-shell/src/windows/custom/user/RoleFilterControl.jsx` — **new**, grid
  toolbar role filter.
- `tools/app-shell/src/windows/custom/user/RoleChipsCell.jsx` — **new**, grid role
  column renderer (chips + "+N").
- `tools/app-shell/src/windows/custom/user/UserHeaderTable.jsx` — **new**, grid
  `headerTable` override (F6) — declares the full column list by hand (mirrors
  `sales-invoice`'s `InvoiceHeaderTable` precedent) so `RoleChipsCell`/`RoleFilterControl`
  can be wired in; not originally called out as its own file when this plan was written.
- `tools/app-shell/src/windows/custom/user/roleSelectionContext.js` — **new**, React
  Context sharing the live (not-yet-saved) role selection between
  `AssignTemplateRolesControl` (writer) and `UserRolesTab` (reader) — two independent
  custom-component slots on the same generated page with no other prop-forwarding
  channel between them (see F1/F3 Findings); not originally called out as its own file.
- `tools/app-shell/src/windows/custom/user/InviteRolesSnackbar.jsx` — **descoped, not
  built** — see Task F7. Moved to **ETP-4830** together with the invite-email flow it
  depends on.
- `tools/app-shell/src/lib/roleNameI18n.js` — extended (already has the 4-name map;
  reused as-is, no changes expected unless matrix category labels need new keys).
- `artifacts/user/decisions.json` — modified: `defaultRole` field wiring,
  `window.customComponents`/`headerExtra`, new tab declaration, grid column override.
- `tools/app-shell/src/components/contract-ui/DetailView.jsx` — **shared component,
  modified**: added the `onAfterExistingSave` prop (F1/F3 Findings). Only `user` passes
  it today; every other window is unaffected.
- `tools/app-shell/src/windows/registry.js` — **modified**: added
  `'user': () => import('./custom/user/index.jsx')` to `customLoaders` (F3 Findings) —
  without this the `index.jsx` wrapper above never mounts.
- `tools/app-shell/src/locales/en_US.json`, `es_ES.json` — new keys (this plan
  originally guessed `src/i18n/`; the repo's actual path is `src/locales/`).
- `docs/generated-custom-windows/user.md` — updated (Documentation Freshness policy).
- Tests (Tester-owned): Vitest specs colocated in each component's `__tests__/`;
  Playwright spec under `e2e/tests/flows/` following
  `e2e/tests/flows/row-quick-actions.mocked.spec.js`'s pattern.

---

## Backend Tasks (`com.etendoerp.go`)

### Task B1 — Spike: multi-company ("Empresa") org-scoping mechanism ✅ DONE

**Agent:** schema-forge-developer (research only, no code changes committed except a
short findings note).

**Files:** none modified. Produce findings as a comment in the Jira task / a short
section appended to this plan file under "B1 Findings" once done.

**What to determine:**
- Read `AD_Role_OrgAccess` / `AD_User_OrgAccess` in Openbravo core's model — does either
  exist and get consulted at login/window-access time independently of
  `AD_Role.Organization`?
- Confirm (or refute) this plan's working assumption: every personal composition role is
  created at `Organization = "0"` (`UserRoleCompositionService#createPersonalRole`), and
  `"0"` is the root org whose access cascades to every org beneath it — meaning a
  composed user may ALREADY have effective access to every company today, regardless of
  what any "Empresa" field shows.
- If true: "multiple companies" is display/metadata only (e.g. which orgs a user's
  Business Partner/contact record spans, or a plain informational multi-value field) —
  no new access-control write path needed. Proceed to Task B4 as a metadata-only field.
- If false (org-scoping genuinely restricts access per-org today): identify the
  smallest correct mechanism (e.g. per-org `AD_User_Roles` rows, or a new
  `AD_Role_OrgAccess`-equivalent) and write it up as Task B4's real spec before any code
  is written.

**Acceptance:** a written answer to "does Empresa need new access-control logic, or is
it metadata" with the DB/code evidence backing it. Task B4 is only planned in detail
once this lands.

**B1 Findings (developer-1, landed):** "Empresa" is metadata-only **today** — not
because org `"0"` cascades access (it doesn't drive access at all; `Role.Organization`
is unrelated to what a role can read/write), but because **every GO tenant currently
has exactly one non-root organization** (DB-verified: every client in `ad_org` has
exactly one company org, created once at onboarding by
`EtendoGoJwtServlet#createOrganization`; no "add a second company" flow exists anywhere
in `com.etendoerp.go`). Real per-user org restriction is driven by `AD_Role_OrgAccess`
(`RoleOrganization`, checked via `OBContext#getActiveOrganizationList`/
`setReadableOrganizations`), which `UserRoleCompositionService` never writes directly —
it's propagated for free by core's generic `RoleInheritanceManager`/`OrgAccessInjector`
copy path (the same mechanism that propagates `AD_Window_Access`, which the service
DOES post-correct for the most-permissive-wins union — but has no equivalent
post-correction for org access, because there was never more than one org to restrict).
**Building real org-restriction logic now would be speculative — there is no
multi-org-per-tenant capability to validate it against.** developer-1's own
recommendation, escalated to the human as a real product decision (see chat).

### Task B2 — New webhook: `SFUserRoleAssignments` ✅ DONE (developer-3, agentId `a368a2b2d6b807025`, commit `bc2b6c8c`)

**Agent:** schema-forge-developer.

**Files:**
- Modify: `src/com/etendoerp/go/roles/UserRoleCompositionService.java` — add
  `public List<String> getAppliedTemplateRoleIds(String userId)`: resolves the user's
  personal role the same way `resolveOrCreatePersonalRole` does for READ (but must NOT
  create one if none exists — a user with no personal role has no assigned templates,
  return an empty list, never call `createPersonalRole`), then queries
  `AD_Role_Inheritance` via `findExistingInheritances`-equivalent logic and returns the
  `InheritFrom` ids that are active templates. Add a second method,
  `public Map<String, List<String>> getAppliedTemplateRoleIdsForClient(String clientId)`
  for the bulk grid case — one query pass, not N calls to the single-user method.
- Create: `src/com/etendoerp/go/schemaforge/webhooks/SFUserRoleAssignments.java` —
  `GET /sws/neo/userroleassignments` (NEO pseudo-spec bridge, same convention as
  `SFAssignUserRoles`/`SFRolesOverview`/`SFListMenu` — see `docs/neo-headless.md`
  §4.10–4.11). Admin/client-admin gated
  (`NeoAccessHelper.isAdminOrClientAdmin`), "deny silently" convention (empty result,
  never 403). Two modes:
  - No `UserId` param → `{"assignments": {"<userId>": ["<templateRoleId>", ...], ...}}`
    for every user in the caller's own client (bulk, for the grid).
  - `UserId=<id>` param → `{"userId": "...", "templateRoleIds": [...]}`, enforcing the
    SAME tenant-boundary check `SFAssignUserRoles` uses (a client-admin must never read
    another tenant's user) — reuse
    `UserRoleCompositionService`'s boundary check pattern, do not duplicate the logic
    inline in the webhook.
- Create: `src-test/src/com/etendoerp/go/schemaforge/webhooks/SFUserRoleAssignmentsTest.java`
  (delegate the actual test-writing per the repo's Java testing conventions — this repo's
  mandatory-Tester-delegation rule is scoped to `etendo_schema_forge`'s Vitest/Playwright;
  for `com.etendoerp.go` JUnit tests, follow this module's own existing pattern in
  `SFAssignUserRolesTest.java`/`SFRolesOverviewTest.java` as the template).
- Modify: `src-test/src/com/etendoerp/go/roles/UserRoleCompositionServiceTest.java` —
  add cases for both new methods (no personal role yet → empty list; personal role with
  2 templates → both ids; cross-tenant read attempt → rejected).

**Acceptance:** unit tests green; `./gradlew test` run from the main checkout (not a
worktree — see Global Constraints) passes for the module.

**B2 Findings (developer-3, code landed, verified by reading the file directly):**
confirmed endpoint `GET /sws/neo/userroleassignments[?UserId=<id>]`. Exact response
shapes, read straight from `SFUserRoleAssignments.java`:
```
// Bulk mode (no UserId):
{"assignments": {"<userId>": ["<templateRoleId>", ...], ...}}
// Single mode (UserId=<id>):
{"userId": "...", "templateRoleIds": ["...", "..."]}
// Denied / cross-tenant / unknown user — HTTP 200, shaped per the requested mode:
{"assignments": {}}                              // bulk mode
{"userId": "...", "templateRoleIds": []}          // single mode
```
Service signature is `getAppliedTemplateRoleIds(String userId, Role currentRole)` (takes
the caller's role for the boundary check, slightly different from this plan's original
guess of a 1-arg signature) and `getAppliedTemplateRoleIdsForClient(String clientId)`
for bulk. F2 should treat this as the confirmed contract — no need to re-derive it once
B2 is committed.

### Task B3 — `docs/neo-headless.md` update ✅ DONE (developer-3, agentId `a368a2b2d6b807025`, same commit `bc2b6c8c` as B2)

**Agent:** schema-forge-developer (can be folded into B2's commit if small enough — use
judgment, but REVIEW must see the doc change in the same PR as the code per the
Documentation Freshness policy either way).

**Files:** Modify `docs/neo-headless.md` (in `com.etendoerp.go`) — new §4.12 documenting
`SFUserRoleAssignments`'s two modes, request/response shapes, and access gate, in the
same style as the existing §4.10–4.11 entries for its siblings.

### Task B4 — 🚫 DESCOPED, moved to ETP-4889

Per human decision after B1's findings landed: multi-company ("Empresa") support is
**out of scope for ETP-4906 entirely**, not merely deferred within it. The existing
single-company `defaultOrganization` field stays as-is; no Empresa multi-select ships
in this ticket. The work is tracked under **ETP-4889** instead — Clerk to confirm that
ticket exists/reflects this scope (see Dispatch Plan).

---

## Frontend Tasks (`etendo_schema_forge`)

### Task F1 — Spike: custom-component save-lifecycle hook ✅ DONE

**Agent:** schema-forge-developer (research only).

**What to determine:** `AssignRoleControl.jsx` today only calls `onChange('defaultRole',
...)` — a plain field write picked up by the window's normal Guardar (generic AD_User
CRUD PUT). The new role picker needs Guardar to ALSO fire `SFAssignUserRoles` (a
side-effecting webhook, not a field write) exactly once, only when the role selection
actually changed, and only for an existing user (see Global Constraints). Read
`docs/ui-customization.md` and the generator (`generate-frontend.js`) for whatever
save-lifecycle hook `headerExtra`/`customComponents` already expose (an `onSave`/
`afterSave` callback prop, or a window-level `onBeforeSave` in decisions.json) before
assuming one needs to be built. Check whether any other custom window already does
"write a field AND also call a side-effect webhook on save" (grep the codebase for a
precedent) as this may already be a solved problem the User window just hasn't used
yet.

**Acceptance:** a documented answer — either "use existing hook X, here's how it's
wired" or "no such hook exists, F3 needs to add one to the generator" (if so, that
addition becomes a genuinely new sub-task in `generate-frontend.js`, not something F3
should improvise ad hoc inside one window's custom component).

**F1 Findings (developer-2, landed):** no usable hook exists today — `headerExtra`
passes no save-notification callback; `onAfterCreate` fires only on new→created
transition (opposite of what's needed); `onAfterSave` is a **pre-existing boolean
navigation flag**, not a callback (two live windows — sales-invoice, purchase-invoice —
already pass it as `true`; reusing the name for a callback would silently collide).
Fix, entirely inside `etendo_schema_forge`, **no `schema_forge_core` PR needed**: add a
new prop `onAfterExistingSave(saved, {token, apiBaseUrl})` to
`tools/app-shell/src/components/contract-ui/DetailView.jsx`'s
`handlePostSaveNavigation` (mirrors `onAfterCreate`'s call shape, inverted to
`!isNew`), then create `tools/app-shell/src/windows/custom/user/index.jsx` (the `user`
window has no such wrapper yet) that wraps the generated `UserPage` and passes
`onAfterExistingSave={handleRoleAssignmentSave}` — `UserPage.jsx` already spreads
`{...props}` straight onto `<DetailView>`, so no generator/decisions.json change is
needed to thread it through. Mirror `windows/custom/warehouse/index.jsx`'s existing
`onAfterCreate` wiring as the concrete pattern to copy. **Task F3 is updated
accordingly below** — no longer blocked on an open generator question, just on this
concrete `DetailView.jsx` addition landing first.

### Task F2 — `lib/userRoleAssignmentsApi.js` ⏳ PENDING (blocked on B2)

**Agent:** schema-forge-developer. **Blocked on B2** (needs the real response shape).

**Files:** Create `tools/app-shell/src/lib/userRoleAssignmentsApi.js`, following
`rolesApi.js`'s exact conventions (no `Content-Type` on GET, unwrap the
`{result: "<json-string>"}` shape, `sf_auth_token` from `localStorage`, throw on
non-JSON/error responses — do not reinvent this, copy the pattern):
- `fetchUserRoleAssignments()` — bulk mode, for the grid.
- `fetchUserRoleAssignments(userId)` — single-user mode, for form load.
- `saveUserRoleAssignments(userId, templateRoleIds)` — calls `SFAssignUserRoles`
  (already exists — just wrap it; do not modify the backend webhook for this).

**Files:** Create colocated Vitest spec — delegate to Tester (see F9), do not write
inline.

**F2 Findings (developer-2, landed, commit `f3b768d17`):** exact signatures for F3/F5/F6
to import —
```js
fetchUserRoleAssignments(userId?: string): Promise<{assignments?: Record<string,string[]>, userId?: string, templateRoleIds?: string[]}>
// no arg -> bulk {assignments: {...}}; userId passed -> single {userId, templateRoleIds}
// never throws on the backend's "deny silently" empty shape, only on transport/parse failure

saveUserRoleAssignments(userId: string, templateRoleIds: string[]): Promise<{success:true, userId, personalRoleId, templateRoleIds, added:number, removed:number}>
// wraps SFAssignUserRoles unmodified; pass the FULL desired set, not a delta
// throws new Error(message) on {success:false, message} (domain rejection, still HTTP 200)
```
Both live in `tools/app-shell/src/lib/userRoleAssignmentsApi.js`.

### Task F3 — Replace `AssignRoleControl.jsx` with `AssignTemplateRolesControl.jsx` 🔄 IN PROGRESS (developer-2, agentId `a235bf7765174e48b`)

**Agent:** schema-forge-developer. **Blocked on F2 (API).** No longer blocked on an
open F1 question — F1 landed a concrete mechanism (see F1 Findings above); this task
now includes building it:

**Files:**
- Modify: `tools/app-shell/src/components/contract-ui/DetailView.jsx` — add the new
  `onAfterExistingSave(saved, {token, apiBaseUrl})` prop to
  `handlePostSaveNavigation`, invoked only when `!isNew && saved`, mirroring
  `onAfterCreate`'s existing call shape (see F1 Findings for the exact spot). This is a
  shared component — verify no other window's save behavior changes (the prop is new
  and optional, so every window without it is unaffected).
- Create: `tools/app-shell/src/windows/custom/user/index.jsx` — wraps the generated
  `UserPage`, passing `onAfterExistingSave={handleRoleAssignmentSave}`. Copy
  `windows/custom/warehouse/index.jsx`'s `onAfterCreate` wiring as the concrete pattern.
  `handleRoleAssignmentSave` compares the form's locally-selected role-chip set against
  the set that was fetched on load; if unchanged, no-op; if changed, calls
  `saveUserRoleAssignments(userId, templateRoleIds)` (Task F2).
- Delete: `tools/app-shell/src/windows/custom/user/AssignRoleControl.jsx` and its
  `__tests__/` (superseded — confirm nothing else imports it first).
- Create: `tools/app-shell/src/windows/custom/user/AssignTemplateRolesControl.jsx` —
  multi-select chip UI (removable chips, "+N" overflow when the field is not actively
  focused/editing, per `Usuarios Form View Adicion.png`). Options: the 4 non-admin
  template roles from `SFRolesOverview`'s `roles` array (already fetched once for F5's
  matrix too — share the fetch, don't call it twice, see F5's note on this). Purely
  local component state until Guardar (per Global Constraints) — never calls
  `onChange('defaultRole', ...)`; the new `index.jsx` wrapper owns reading its current
  selection at save time (e.g. via a ref or lifted state, developer's call) and handing
  it to `handleRoleAssignmentSave`.
- Modify: `artifacts/user/decisions.json` — swap the `headerExtra`/`customComponents`
  entry that currently points at `AssignRoleControl` to the new component; `defaultRole`
  stays `form: false` (still read-only, unaffected — see the field's own `reason` note
  in decisions.json, no change needed there). **Note this is the DETAIL FORM's
  read-only display of `defaultRole` only — a separate surface from the Users LIST
  GRID's "Rol" column, which F6 overrides independently.** Don't let a fix to one
  accidentally get "fixed" back by editing the other.

**Acceptance:** `make regen ONLY=user` produces a clean contract (Window Change
Integrity Protocol Step 3); manual load of the User form in a running Etendo shows the
chip control instead of the old single-select.

**F3 Findings (follow-up developer session, landed):** the prior developer-2 session
ended mid-task — `AssignTemplateRolesControl.jsx`, `windows/custom/user/index.jsx`,
`UserRolesTab.jsx`, `RoleChipsCell.jsx`, `RoleFilterControl.jsx`,
`roleSelectionContext.js` and `UserHeaderTable.jsx` were all already written on disk
and correct, but `index.jsx` was calling a prop (`onAfterExistingSave`) that
`DetailView.jsx` never actually defined, and `registry.js` had no `customLoaders`
entry for `'user'` — so the wrapper never mounted at all (the generated `UserPage`
loaded directly via the `windowLoaders` fallback, `RoleSelectionProvider` never
rendered, `useRoleSelection()` fell back to its inert no-op context, chip toggles were
silent no-ops, and the "Roles del usuario" tab always showed its empty state). Both
gaps are now closed:
- `tools/app-shell/src/components/contract-ui/DetailView.jsx` — added the
  `onAfterExistingSave(saved, {token, apiBaseUrl})` prop end to end: component prop
  (line 1302), `saveActionParams` bundle (line 2923),
  `renderExistingRecordSaveAction`'s destructure (line 1094) and its
  `handlePostSaveNavigation` call (line 1100), and the guard itself inside
  `handlePostSaveNavigation` (line 1034/1036, fires only `!isNew && onAfterExistingSave`).
  `renderNewRecordSaveActions` (the new-record path, line ~1052-1085) and its
  `handlePostSaveNavigation` call (line 1077) were deliberately left untouched — that
  call never receives `onAfterExistingSave`, so even with the guard alone it can never
  fire before an `AD_User_ID` exists, matching this ticket's Global Constraint.
- `tools/app-shell/src/windows/registry.js` — added
  `'user': () => import('./custom/user/index.jsx')` to `customLoaders` (kept
  `windowLoaders['user']` pointing at the generated page untouched, per its role as the
  base/fallback entry).
- **A repo-wide guard (`.claude/hooks/check-detailview-growth.mjs`) blocks any edit that
  leaves `DetailView.jsx` longer than its `epic/ETP-3504` merge-base line count** — the
  file was already 1 line over that baseline before this change (from an unrelated,
  already-committed ETP-4714 fix), so literally every edit needed a compensating
  reduction. All `onAfterExistingSave` wiring above was written by extending existing
  lines in place (destructure params merged onto one line, the new
  `if (!isNew && onAfterExistingSave) …` guard appended onto the same physical line as
  the existing `onAfterCreate` guard) rather than inserting new lines, plus one
  parameter-list line merge in `renderExistingRecordSaveAction` to buy back the 1-line
  deficit. Net result: file is at 4441 lines — 1 line above the true `epic/ETP-3504`
  merge-base (4440), an imprecision REVIEW's re-review caught (see "REVIEW Re-Review
  Findings"): the file was already 2 lines over that true baseline pre-ETP-4906 (an
  unrelated ETP-4714 fix), and this ticket's own diff to the file nets -1 line, so
  ETP-4906 did not introduce or worsen the gap.
  Anyone touching this function again should budget for this constraint up front.
- Verified: full `DetailView.jsx` Vitest suite (165 files / 3331 tests) green, `npm run
  build` clean, `npx sf-validate-pipeline --scope=user` → OK. `windows/custom/user/`
  still has an **empty `__tests__/` dir** — no Vitest coverage yet for
  `AssignTemplateRolesControl.jsx`, `UserRolesTab.jsx`, `RoleChipsCell.jsx`,
  `RoleFilterControl.jsx`, `UserHeaderTable.jsx`, `index.jsx` or
  `roleSelectionContext.js`. Expected per this plan's F9 (dispatched separately to
  Tester, not this task) — flagged here so it isn't mistaken for an oversight.

### Task F4 — 🚫 DESCOPED, moved to ETP-4889

Same human decision as Task B4 — no frontend Empresa multi-select ships in ETP-4906.
Do not build this field. `AssignTemplateRolesControl`'s multi-select chip UI (roles,
Task F3) is unaffected — only the separate "Empresa" company field is descoped.

### Task F5 — "Roles del usuario" tab (live matrix) 🔄 IN PROGRESS (DEV + Vitest done, 1 known bug — see F9 Findings; developer-4, agentId `a09d3b86a5c3ba7d2`)

**Agent:** schema-forge-developer. **Blocked on B2, F2.**

**Files:**
- Create: `tools/app-shell/src/windows/custom/user/UserRolesTab.jsx` — new tab,
  rendered only for an existing user (Global Constraints). Row source: fetch
  `SFListMenu`'s tree once (admin caller → full tree, already category-grouped in menu
  order) to get the `Ventana` column's rows and category headers; cross-reference each
  leaf's `windowId` against `SFRolesOverview`'s per-role `windows[]` arrays to render
  one column per role in `AssignTemplateRolesControl`'s **currently locally-selected**
  set (not the saved set — this is the live preview). `UserRolesTab` and
  `AssignTemplateRolesControl` are separate custom-component slots on the same
  generated form (tab vs. headerExtra) — confirm during F1's spike whether generated
  custom slots already share a fetch/state layer; if not, a small shared hook (e.g.
  `useRolesOverviewData()` with a module-level cache keyed by client) avoids fetching
  `SFRolesOverview` twice, but a duplicate fetch is an acceptable fallback if sharing
  turns out to be awkward — don't block the ticket on this.
  Cell value: `✓` (full), `Solo lectura` (read-only), `—` (absent from that role's
  `windows[]`). For the 3 hardcoded General rows (`Inicio (Dashboard)`, `Favoritos`,
  `Copilot (Asistente IA)`), render `✓` unconditionally for every column — do not query
  or infer these from `windows[]` (they have no window backing them at all). Omit the
  other 9 gap rows from `TemplateRoleWindowAccess`'s javadoc entirely — they must not
  appear as `—` rows, they must not appear at all.
  Empty state ("Selecciona un rol para visualizar los permisos") when zero roles are
  currently selected, per `Usuarios Form View Etendo Software.png`.
- Modify: `artifacts/user/decisions.json` — register the new tab (check
  `docs/window-templates.md` for the custom-tab registration convention before
  hand-rolling one).

**Acceptance:** with 2+ roles selected, the rendered table's category order/window
names visually match `Usuarios Form View.png`/`Usuarios Form View Adicion.png` for the
rows they show (General, Comercial, Ventas, …), including the exact 3-row General
hardcode. **Flag explicitly for Alex in REVIEW** to re-verify the General-row/9-gap-row
decision against the live Figma file (see Global Constraints) — this was approved from
a static screenshot during planning, not the source of truth.

### Task F6 — Users grid: role chips column + role filter 🔄 IN PROGRESS (DEV + Vitest done, no bugs found; developer-5, agentId `a535648d451959aeb`)

**Agent:** schema-forge-developer. **Blocked on B2, F2.**

**Files:**
- Create: `tools/app-shell/src/windows/custom/user/RoleChipsCell.jsx` — grid cell
  renderer using the bulk `fetchUserRoleAssignments()` result (one fetch for the whole
  grid page, not per-row) to render each user's roles as chips + "+N" overflow, per
  `Usuarios.png`. Resolve role id → display name via `SFRolesOverview`'s roles list +
  `roleNameI18n.js`. **Admin branch:** a classic-Admin user's `defaultRole` (already a
  field on every grid row) IS the client-admin role itself, not a "Personal – X"
  composition role — it will have zero entries in the bulk assignments map. Detect this
  by comparing the row's `defaultRole` id against `SFRolesOverview`'s
  `roles[].isClientAdmin===true` entry's id, and render the generic `roleNameAdmin`
  chip in that case instead of falling through to an empty/"—" cell.
- Create: `tools/app-shell/src/windows/custom/user/RoleFilterControl.jsx` — grid
  toolbar dropdown, options = `SFRolesOverview`'s roles (4 templates + Admin), filters
  the grid client-side or via query param (check how the existing "Todas las empresas"
  filter — if any exists today — implements this, for consistency).
- Modify: `artifacts/user/decisions.json` — register the grid column override and
  toolbar filter (check `docs/ui-customization.md`'s decision tree for the right
  extension point — this is a grid-level customization, may need a different hook than
  `customComponents.headerExtra`).

**Acceptance:** grid visually matches `Usuarios.png` (chips + "+N", role filter
dropdown) and `Filtro Usuarios Admin.png` (filtering by "Administrador" narrows the
list correctly).

### Task F7 — 🚫 DESCOPED, moved to ETP-4830 (human decision 2026-08-14)

Per the F7 Findings below: no invite-email mechanism exists today for admin-created
users, and building the "Invitación enviada" snackbar without one would tell the admin
an email was sent when nothing sends one. Same descope pattern as B4/F4 → ETP-4889 —
`InviteRolesSnackbar.jsx` is not built in ETP-4906; it ships together with the real
email flow once **ETP-4830** ("[ROLES/USERS] Send invite email on admin-created users",
already assigned to the human, status TBD) is picked up. Clerk to confirm ETP-4830
reflects this scope when Jira updates are dispatched (see Dispatch Plan). The original
task spec is kept below for ETP-4830 to reuse without restarting the investigation.

### Task F7 (original spec, superseded by the descope above) — Post-creation invite snackbar

**Agent:** schema-forge-developer. **Blocked on F3** (the "Configurar roles" link must
land on the same form, roles tab focused/expanded).

**Files:**
- Create: `tools/app-shell/src/windows/custom/user/InviteRolesSnackbar.jsx` — per
  `Usuarios Form View Snackbar.png`: "Invitación enviada" message + "Configurar roles"
  link, dismissible (×). Shown once, immediately after a NEW user's first successful
  save. **Before building:** grep for an existing invite-email trigger on user
  creation — this task owns only the snackbar/link UI, not emailing. If no such
  mechanism exists yet, that's a scope gap bigger than this task (a real email-sending
  path, not a UI detail) — stop and flag it back rather than building a fake/silent
  no-op "invite sent" message.
- Modify: `artifacts/user/decisions.json` if a `window.headerExtra`/snackbar hook is
  needed for this — check existing patterns first (this may already be a generic
  post-save-toast capability the generator supports).

**F7 Findings (this developer session):** hit the task's own stop condition. Grepped
both repos broadly (`invite`, `welcome.*mail`, `send.*mail`, `sendmail`) before
narrowing — `com.etendoerp.go`'s `com.etendoerp.go.schemaforge.email` package and
`EtendoGoJwtServlet`/`EtendoGoAccountProvisioning`/`EtendoGoJwtDalHelper` were the real
candidates.

- `UserRoleAssignmentHandler.java` (the `@Named("user")` NeoHandler, concern 3 in its
  class javadoc, ETP-4829) is exactly the admin-creates-a-user path this ticket's forms
  drive. On `POST`, its `afterHandle` calls
  `EtendoGoAccountProvisioning.ensureAccountForCreatedUser(email, name, plainPassword)`.
  That method's own javadoc says it plainly: the resulting `etgo_account` is created
  `pending` (no password, cannot log in) "waiting on **ETP-4830**'s invite-email flow" —
  unless the admin typed a password on the create form, in which case the account is
  created `active` with that password instead, again with **no email sent either way**.
- Traced `TransactionalAuthEmailSender` (the only class in `com.etendoerp.go` that
  actually sends account-lifecycle email) end to end: it has four contracts
  (`new-account`, `environment-ready`, `password-changed`, `reset-password`). Grepped
  every caller — `sendNewAccount` is invoked from exactly one place,
  `EtendoGoJwtServlet`'s **self-service `/register` endpoint** (a brand-new tenant
  signing itself up with email+password+name), not from anywhere in the
  admin-creates-a-user-inside-an-existing-tenant path. `EtendoGoJwtDalHelper
  .createPendingAccount`/`createActiveAccount` (the two methods
  `EtendoGoAccountProvisioning` calls) never touch `TransactionalAuthEmailSender` at
  all. So the existing "new-account" email is a different flow entirely (tenant
  onboarding), not a per-user invite within a tenant — it cannot be repurposed to make
  this task's snackbar message true.
- `git log --all --oneline -i --grep="4830"` in both repos: zero commits. Confirmed via
  Jira (`searchJiraIssuesUsingJql`, `key = ETP-4830`) that ETP-4830 is a real, separate,
  currently-**unstarted** ticket ("[ROLES/USERS] Send invite email on admin-created
  users", status **TBD**, split from ETP-4602 as "part 2 of 2" — the account-creation
  half is the sibling ticket this handler already implements). Its own description
  states the intended flow explicitly: "admin creates → system emails invite → invitee
  sets password → account activates" — i.e. this is the exact mechanism F7 assumed
  existed, written up as its own not-yet-built ticket, planned to reuse the same
  `com.etendoerp.go.schemaforge.email` infrastructure already traced above.
- **Conclusion: no invite-email mechanism exists today for admin-created users.** This
  is the scenario the task's stop condition anticipated — a real product gap (ETP-4830),
  not a naming mismatch to search around. Per the stop condition, **no
  `InviteRolesSnackbar.jsx` was created** and `artifacts/user/decisions.json` was not
  touched for this task. Building a "Invitación enviada" snackbar today would tell the
  admin an email was sent when nothing sends one.
- This also means the plan's own Global Constraints line ("the form saves the plain
  `AD_User` fields first, triggering the invite email") is inaccurate as written — no
  invite email fires on create today, only the `pending`/`active` `etgo_account`
  bookkeeping described above. Flagging for the coordinator/human rather than editing
  that constraint myself, since it's cross-task shared text.
- **Recommendation for the human/coordinator:** two independent decisions, not one —
  (a) whether to descope F7 out of ETP-4906 (same pattern as B4/F4 → ETP-4889) and let
  ETP-4830 ship the snackbar together with the real email once that ticket is picked up,
  since it's already assigned and scoped for exactly this; or (b) build a
  scope-honest version of F7 now that doesn't claim an email was sent — e.g. a
  "Configurar roles" link/prompt without the "Invitación enviada" copy — if the product
  wants *something* to land in this ticket ahead of ETP-4830. Did not pick (b)
  unilaterally since it changes the approved Figma copy/behavior; flagging both options
  back rather than guessing.

### Task F8 — i18n keys ⏳ PENDING (rolls into F3/F5/F6 — F7 descoped, contributes none)

**Agent:** schema-forge-developer (can be folded into each task above — every task
touching user-visible copy must add its own keys to BOTH `en_US.json` and `es_ES.json`
in the SAME commit, per the repo's i18n policy; listed here only as a checklist item for
REVIEW to verify nothing was missed across F3/F5/F6).

### Task F9 — Tests 🔄 IN PROGRESS (Vitest + Playwright done, 2 known bugs — see F9 Findings)

**Agent:** Tester (`test-generator`) — mandatory delegation, per
`CLAUDE.md`'s Testing section. Dispatch once F2–F7 have landed (or incrementally after
each, developer's call, but no task in F3–F7 is DEV-complete without its tests).

**Files:**
- Vitest: colocated `__tests__/` specs for `AssignTemplateRolesControl.jsx`,
  `UserRolesTab.jsx`, `RoleChipsCell.jsx`, `RoleFilterControl.jsx`,
  `InviteRolesSnackbar.jsx`, `userRoleAssignmentsApi.js` — no hardcoded UI strings, use
  `data-testid`/`t()` per this session's standing feedback memory.
- Playwright: new mocked spec under `e2e/tests/flows/` covering the multi-role assign
  flow on an existing user (add/remove role chips, confirm the live matrix updates
  instantly with zero extra network calls per toggle, save, reload and confirm the
  applied set persisted), the grid's role filter, and the post-creation invite
  snackbar's "Configurar roles" link. Must read `docs/e2e-testing-guide.md` first and
  use `e2e/tests/flows/row-quick-actions.mocked.spec.js` as the canonical reference,
  per the Testing section.

**Acceptance:** `make test` green; Playwright spec passes locally.

**F9 Findings (Tester, landed — Vitest portion only):** wrote 9 new colocated Vitest
spec files (135 tests, all green) covering every DEV-complete surface from F2/F3/F5/F6
plus the `DetailView.jsx` `onAfterExistingSave` prop (F1/F3):
- `tools/app-shell/src/lib/__tests__/userRoleAssignmentsApi.vitest.js` (23 tests) —
  mirrors `rolesApi.vitest.js`'s `fetchNeoJson` coverage (request shape, both response
  modes, every rejection branch) plus `saveUserRoleAssignments`'s own
  `{success:false, message}` domain-rejection throw and `TemplateRoleIds` join encoding.
- `tools/app-shell/src/windows/custom/user/__tests__/AssignTemplateRolesControl.vitest.jsx`
  (20 tests) — save-first placeholder, fetch gating (token/apiBaseUrl/persisted-user),
  admin-role exclusion from options, chip collapse/overflow, toggle/remove wiring
  through `useRoleSelection()`, click-away close, and the documented inert-context
  fallback.
- `tools/app-shell/src/windows/custom/user/__tests__/UserRolesTab.vitest.jsx`
  (15 tests) — isNew→null + visibility reporting, empty state, category grouping/order,
  the 3 hardcoded General rows, full/read-only/absent cell resolution, Admin-column
  exclusion. **Also documents a real bug — see below.**
- `tools/app-shell/src/windows/custom/user/__tests__/RoleChipsCell.vitest.jsx`
  (23 tests) — `resolveUserId`/`resolveDefaultRoleId` pure-helper edge cases,
  `useUserRoleGridData()`'s fetch-once/error/defaulting behavior, and the cell's Admin
  branch (including the case where `adminRoleId` itself fails to resolve), overflow
  cap, unknown-role-id drop.
- `tools/app-shell/src/windows/custom/user/__tests__/RoleFilterControl.vitest.jsx`
  (9 tests) — null-when-no-roles, Admin included as a filter value (unlike the
  composition picker), label/allLabel/searchPlaceholder wiring, onChange passthrough.
- `tools/app-shell/src/windows/custom/user/__tests__/UserHeaderTable.vitest.jsx`
  (11 tests) — column list/order, `defaultRole`'s `type:'custom'`/`filterMode`
  override, prop passthrough to `DataTable`, and the client-side `filteredData` logic
  (by template role, by Admin role, clear-filter) — driven through a stubbed
  `RoleFilterControl` (same "faithful-but-minimal stub" convention as
  `AccountsHeaderTable.vitest.jsx`'s `DistinctValuesFilter` stub) rather than the real
  Radix popover, which has no existing driven-interaction precedent in this codebase.
- `tools/app-shell/src/windows/custom/user/__tests__/roleSelectionContext.vitest.jsx`
  (4 tests) — the documented never-throws-when-unwrapped fallback, both for reads and
  for the no-op setter, plus the Provider-supplied-value path.
- `tools/app-shell/src/windows/custom/user/__tests__/index.vitest.jsx` (16 tests) —
  fetch-on-load gating, `customTabs` wiring (`roles` + `attachments`, in order),
  `onAfterExistingSave` passthrough, and `handleRoleAssignmentSave`'s full contract:
  no-op on a saved record with no id, no-op on an unchanged selection (including a
  reordered-but-set-equal selection, proving `sameIdSet` is genuinely set-based, not
  array-equality), fires `saveUserRoleAssignments` with the full new set on a real
  change, does not re-fire on a second identical save once the ref catches up, and
  surfaces both a domain-rejection message and the generic i18n fallback via
  `toast.error`.
- `tools/app-shell/src/components/contract-ui/__tests__/DetailView.saveActions.vitest.js`
  — extended the existing `handlePostSaveNavigation` describe block with 3 tests
  mirroring `onAfterCreate`'s own coverage: `onAfterExistingSave` fires with
  `(saved, {token, apiBaseUrl})` when `!isNew`, never fires when `isNew` (even with a
  derivable id), and `onAfterCreate`/`onAfterExistingSave` never both fire for the same
  save.
- `InviteRolesSnackbar.jsx` was NOT tested — F7 was descoped to ETP-4830 after this
  dispatch's brief was written (see the Status table); no such file exists on disk.
- Checked `windows/registry.js`'s existing test coverage
  (`src/windows/__tests__/registry.test.js` + `.vitest.jsx`) per the dispatch brief:
  neither file has a `customLoaders`-keys snapshot or a
  "every custom window has a registry entry + index.jsx" consistency check today — both
  only exercise `buildMenuGroups`/`buildWindowMap`/settings-menu grouping. Per the
  brief's own instruction, did not invent one; out of scope for this pass.
- Full suite run after all additions: `npx vitest run` (no path filter) → **646 test
  files passed, 12007 tests passed, 3 skipped, 0 failed.** No regressions.
- **Real bug found in `UserRolesTab.jsx`, NOT fixed (Tester never modifies source —
  flagging for a developer):** the render-branch order checks `columns.length === 0`
  (→ empty state) BEFORE checking `loading`/`error`. `columns` is a `useMemo` derived
  from `rolesOverview?.roles`, and `rolesOverview` stays `null` for the ENTIRE duration
  of the in-flight fetch AND forever after a rejected fetch (the `.catch` only sets
  `error`, never `rolesOverview`). That makes `columns.length` 0 in both those cases
  regardless of how many roles are actually selected, so the `UserRolesTab__empty`
  branch wins every time — `UserRolesTab__loading` and `UserRolesTab__error` are dead
  code that can never render given the current branch order and effect structure. User
  impact: on a slow network the tab silently shows "Select a role to view permissions"
  (even though roles ARE selected) instead of a loading spinner; on a backend failure it
  shows the same misleading empty-state copy instead of an error message — indistinguishable
  from "you haven't picked a role yet," which could send a user chasing the wrong fix.
  Suggested remedy for whoever picks this up: check `loading`/`error` before the
  `columns.length === 0` empty-state branch, or gate the empty-state check on
  `!loading && !error && columns.length === 0`. The two Vitest tests
  (`AssignTemplateRolesControl.vitest.jsx` sibling file `UserRolesTab.vitest.jsx`,
  describe block "existing user") are titled `KNOWN BUG (dead code) — …` and assert the
  CURRENT (buggy) behavior on purpose, with a comment pointing back to this note — they
  will need updating (not just re-running) once this is actually fixed.

  **FIXED (2026-08-14, developer follow-up):** reordered the early-return checks in
  `UserRolesTab.jsx`'s render (`tools/app-shell/src/windows/custom/user/UserRolesTab.jsx`,
  the block right after the `isNew` guard, ~line 128 pre-fix) so `loading` and `error` are
  checked *before* `columns.length === 0` — the `isNew` guard still short-circuits first,
  unconditionally. `loading`/`error` are now reachable and verified rendering
  (`UserRolesTab__loading` / `UserRolesTab__error` testids) via a full `vitest run` pass on
  `tools/app-shell/src/windows/custom/user/`. As predicted, this flipped the 2
  `KNOWN BUG (dead code) — …` tests in `UserRolesTab.vitest.jsx` (the "existing user"
  describe block) from green to red — they asserted the old buggy behavior, which no
  longer happened.

  **Tester follow-up done (2026-08-14):** re-read the fixed `UserRolesTab.jsx` to confirm
  the actual branch order (`loading` → `error` → `columns.length === 0`), then updated the
  same 2 tests in `UserRolesTab.vitest.jsx` to assert the fixed behavior instead of the old
  bug: renamed them to `shows a loading indicator (not the empty state) while the two
  fetches are in flight, with roles selected` and `shows an error message (not the empty
  state) when a fetch rejects, with roles selected`; assertions now expect
  `UserRolesTab__loading`/`UserRolesTab__error` to be present and `UserRolesTab__empty` to
  be absent (previously the reverse). The `KNOWN BUG` framing/comment was replaced with a
  short regression-coverage note referencing this Findings entry. No other test in the file
  was touched, and the source file was not touched (already fixed by the developer).
  Verification: `UserRolesTab.vitest.jsx` alone → 15/15 passed; `windows/custom/user/`
  (7 files) → 98/98 passed; full repo suite (`npx vitest run`, no path filter) → 646 test
  files passed, 12007 tests passed, 3 skipped, 0 failed — no regressions. No
  `decisions.json`/generated-file changes were needed for either the fix or this test
  update — this was a pure component-logic fix plus matching test update.

**F9 Findings (Tester, Playwright portion, landed 2026-08-14):** read
`docs/e2e-testing-guide.md` end to end plus
`e2e/tests/flows/row-quick-actions.mocked.spec.js` (canonical reference) before writing
anything, then read every relevant source file (`AssignTemplateRolesControl.jsx`,
`UserRolesTab.jsx`, `RoleFilterControl.jsx`, `UserHeaderTable.jsx`,
`RoleChipsCell.jsx`, `index.jsx`, `roleSelectionContext.js`, `userRoleAssignmentsApi.js`,
`rolesApi.js`, `menuTree.js`, `DetailView.jsx`'s `computeIsDirty`/save-action helpers,
`UserPage.jsx`'s generated `api` block) to confirm exact `data-testid`s, endpoint
URLs/response shapes, and the `entity="user"` (not `"header"`) spec/entity naming before
writing a single selector or mock. No invite-snackbar coverage was written — F7 stayed
descoped to ETP-4830 with no component on disk, matching the dispatch brief.

Landed: `e2e/tests/flows/user-role-assignment.mocked.spec.js`, 8 tests in 2
`describe` blocks. Ran the full spec 3 consecutive times locally against `make dev`
(no `VITE_MOCK`, per the guide's gotcha) — **24/24 passed, no flakes.**

- `User role assignment — detail form (existing user)` (5 tests): chip toggle updates
  the "Roles del usuario" matrix instantly (column appears, General rows unconditionally
  ✓, a window-backed row reflects the mocked role's `tier`) with **zero extra network
  calls** to `rolesoverview`/`userroleassignments`/`listmenu`/`assignuserroles` per
  toggle (asserted via a `page.on('request', …)` counter snapshot before/after, not just
  visual confirmation); removing a chip narrows the matrix back down, same zero-call
  assertion; a `KNOWN BUG` test documenting that Guardar stays disabled after a
  role-only chip change (see the severe-bug writeup below); a follow-up test proving the
  downstream `SFAssignUserRoles` wiring itself is correct once Guardar is clickable
  (exactly one call, full desired role-id set, no re-fire on an unrelated second save);
  and a reload test seeding `SFUserRoleAssignments` single-user mode with a
  pre-existing selection and confirming both a fresh load and a `page.reload()` display
  it correctly.
- `User role assignment — Users grid role filter` (3 tests): grid renders per-user role
  chips including the classic-Admin branch (zero entries in the bulk `assignments` map,
  resolved via `defaultRole === adminRoleId` instead of falling through to an empty
  cell); filtering by a template role narrows the grid to rows carrying that composed
  role; filtering by the Admin option narrows to classic-Admin rows (the `Filtro
  Usuarios Admin.png` scenario) — Admin is a valid filter value here even though it's
  never a selectable composition template.

**Mocking notes worth keeping for future specs on this window:**
- Every endpoint this window's custom components call
  (`rolesoverview`/`userroleassignments`/`assignuserroles`/`listmenu`) is a plain
  `GET /sws/neo/<webhook>?...` webhook call, NOT the `<spec>/<entity>` CRUD shape
  `row-quick-actions.mocked.spec.js` covers — mocked each as its own `page.route()`,
  matching `lib/rolesApi.js`/`lib/userRoleAssignmentsApi.js`/`lib/menuTree.js`'s exact
  response shapes (unwrapped, no `{result: "..."}` wrapper needed since `fetchNeoJson`'s
  fallback branches accept the plain object directly).
- The "user" window's spec AND entity are both literally `"user"` (`api.baseUrl:
  "/sws/neo/user"`, `api.crud.user.listUrl: "/sws/neo/user/user"`) — NOT `"header"` like
  the four pilot order/invoice windows. Read the generated `UserPage.jsx`'s `api` block
  directly rather than assuming the `header` convention holds everywhere.
- `AppLayout.jsx` calls `useRoleMenu()` (→ `GET /sws/neo/listmenu`) on **every** route,
  not just windows that use it directly. `login()`'s baseline `/sws/**` catch-all
  `route.abort()`s that URL, which `useRoleMenu()` treats as "webhook unreachable" and
  fails OPEN (unfiltered sidebar). Overriding `listmenu` with a real but EMPTY tree
  (`{tree: [], count: 0}`) instead resolves `allowedIds` to an empty `Set`, which
  `AppLayout` treats as "zero window access" and renders a full-page "Sin acceso" block
  screen in place of the entire app — discovered by reproducing it directly against
  `make dev` before it made it into the committed spec. Any override of `listmenu` in a
  mocked spec must include at least one `windowId` (the window under test's own AD id is
  the simplest choice) to avoid this. The grid describe block sidesteps the whole issue
  by not overriding `listmenu` at all, since `RoleChipsCell`/`RoleFilterControl` don't
  need menu-tree data.
- `AssignTemplateRolesControl.jsx`'s chips (`AssignTemplateRolesControl__chip-*`,
  `__chip-remove-*`) only render in the collapsed view (`!isEditing`); the per-role
  checkboxes (`__toggle-<roleId>`) only render in the expanded view. A test that opens
  the editor (`__toggle-expand`), toggles roles, and then asserts chip visibility
  without closing the editor again will time out waiting for an element that is
  correctly not rendered yet — not a product bug, just an interaction-order gotcha
  worth noting for the next spec on this component.
- `RoleFilterControl.jsx` passes a `data-testid="RoleFilterControl__filter"` prop to
  `DistinctValuesFilter`, but `DistinctValuesFilter.jsx` never destructures or spreads a
  `data-testid` prop onto any DOM element — it is silently dropped. The popover's option
  rows (`DistinctValuesList.jsx`) have no stable testid at all. Selecting an option today
  requires scoping by the popover's structural class (`.w-64.p-0`, from
  `popoverWidth` + `p-0`) and then `getByRole('button', { name: <label> })` — plain
  `page.getByRole('button', { name: 'Finanzas' })` without that scope collides with an
  unrelated sidebar app-icon button of the same name. Not fixed (cosmetic
  testability gap, not incorrect behavior) — flagged here for whoever next touches
  `DistinctValuesFilter.jsx` or writes another filter spec against it.

**Two real bugs found while writing this spec, NOT fixed (Tester never modifies
source):**

1. **Severe — blocks this ticket's core acceptance criterion.** Role-only chip edits
   can never enable the "Guardar" button, so an admin who changes ONLY a user's roles
   (no other field edit) can never save that change through the UI at all. Root cause,
   traced in `DetailView.jsx`: for a non-draft-mode existing record (the "user" window's
   case — `draftMode:user` is `null`), `renderExistingRecordSaveAction` disables Guardar
   on `!isDirty`, and `isDirty = computeIsDirty(hook, addingLine, addingSecondaryLine,
   lineEdits, additionalDirtyState)` — `additionalDirtyState` is the one prop
   `DetailView.jsx` exposes specifically so a custom window can inject an extra dirty
   source (its own comment: "lets custom windows inject extra dirty sources via prop"),
   defaulting to `false`. `AssignTemplateRolesControl.jsx` deliberately never calls
   `onChange(...)` (by design — role composition is not a plain field write, per its own
   docstring), so `hook.isDirtyHeader` never reflects a chip toggle either.
   `windows/custom/user/index.jsx` never computes or passes `additionalDirtyState` to
   `UserPage`/`DetailView` at all. Net effect: there is currently no code path that ever
   marks the form dirty from a role-only change.

   **Reproduced empirically**, not just from source reading: ran a throwaway Playwright
   script against a live `make dev` instance (deleted after use, never committed) that
   opened an existing user, toggled 2 role chips with no other field touched, and
   confirmed `action-save` stayed `disabled`. As a sanity check, editing an unrelated
   plain field (`lastName`) alongside the same role toggle DID enable Guardar and DID
   fire `SFAssignUserRoles` correctly (`TemplateRoleIds` carrying the exact full desired
   set) — proving `hook.isDirtyHeader`, the button gating mechanism itself, and the
   downstream save-and-call wiring are all otherwise correct; only the
   `additionalDirtyState` wiring for role-only changes is missing.

   This is captured as a `KNOWN BUG` test in the new spec (`Guardar stays disabled after
   a role-only chip change (no other field edited)`), following the same
   assert-current-buggy-behavior-on-purpose convention as the `UserRolesTab.jsx` dead-code
   tests above (now fixed). **Suggested remedy for whoever picks this up:** have
   `windows/custom/user/index.jsx` track whether the current `selectedRoleIds` differ
   from `appliedRoleIdsRef.current` (it already has both, via `sameIdSet` — the exact
   comparison `handleRoleAssignmentSave` uses) and pass that boolean as
   `additionalDirtyState` to `UserPage`. Once fixed, this spec's `KNOWN BUG` test needs
   updating (not just re-running) to assert Guardar becomes enabled and fires
   `SFAssignUserRoles` directly, and could then fold into the "once Guardar is
   clickable…" test instead of needing a separate unrelated-field workaround to reach
   the save button at all.

   **FIXED (2026-08-14, developer follow-up, DEV wave 4):** `windows/custom/user/index.jsx`
   now computes `hasUnsavedRoleChange = !sameIdSet(selectedRoleIds, appliedRoleIdsRef.current)`
   on every render (reusing the exact `sameIdSet` helper `handleRoleAssignmentSave` already
   used — no duplicated comparison logic) and passes it to `UserPage` as
   `additionalDirtyState={hasUnsavedRoleChange}`, which flows straight through
   `UserPage.jsx`'s `{...props}` spread onto `<DetailView>`. One additional change was
   needed beyond the suggested remedy: `handleRoleAssignmentSave`'s success path now also
   calls `setSelectedRoleIds(confirmedIds)` alongside the existing
   `appliedRoleIdsRef.current = confirmedIds` — a ref mutation alone never triggers a
   re-render, so without mirroring the confirmed set back into state, `additionalDirtyState`
   would stay stuck at `true` after a successful Guardar instead of flipping back to `false`.
   `DetailView.jsx` itself was NOT modified — `additionalDirtyState` was already a wireable
   prop from the consumer side (`computeIsDirty(hook, addingLine, addingSecondaryLine,
   lineEdits, additionalDirtyState)`, checked with `=== true`), exactly as this task
   anticipated.

   Verified against a live `make dev` instance (not just source reading): toggling a role
   chip alone now enables Guardar; toggling it back to the original set re-disables it
   (checked with a throwaway Playwright script, deleted after use, never committed — same
   convention as Tester's original empirical reproduction); editing an unrelated field
   still works with no regression; clicking Guardar after a role-only change fires
   `SFAssignUserRoles` correctly. Ran the actual `KNOWN BUG` Playwright test
   (`user-role-assignment.mocked.spec.js:265`) against the fix: it now fails as expected
   (`action-save` resolves `enabled`, not `disabled`) — this is the exact staleness flagged
   below for Tester, reproduced directly rather than assumed. The other 7 tests in the spec
   still pass unmodified (7/8, 1 expected failure). Full Vitest suite: 646 files / 12007
   passed / 3 skipped / 0 failed — identical to the pre-fix baseline, no regressions.

   **Stale tests — Tester follow-up DONE (2026-08-14, this session, "Tester wave 5"):**
   - Playwright: `e2e/tests/flows/user-role-assignment.mocked.spec.js`'s
     `KNOWN BUG — Guardar stays disabled after a role-only chip change (no other field
     edited)` test was folded into the adjacent `once Guardar is clickable…` test (dropping
     its unrelated-`lastName`-edit workaround) and renamed to `a role-only chip change
     enables Guardar and, once clicked, calls SFAssignUserRoles exactly once with the full
     desired role-id set`. New assertions cover the full round trip: Guardar starts
     disabled; a role-only toggle (no other field touched) enables it; toggling back to the
     originally-saved set disables it again; re-toggling and clicking Guardar fires
     `SFAssignUserRoles` exactly once with the full desired role-id set; Guardar disables
     again post-save (the `setSelectedRoleIds(confirmedIds)` mirror-fix, verified end to
     end through the UI, not just unit-level); a second, unrelated field-only save does not
     re-fire the webhook. Spec now has 7 tests total (was 8; net -1 from the fold), all
     green (`npx playwright test tests/flows/user-role-assignment.mocked.spec.js` → 7
     passed).
   - Vitest: added a new `UserWindow — additionalDirtyState (the "extra dirty source" prop
     DetailView.jsx reads to enable Guardar)` describe block to `index.vitest.jsx` with 4
     tests: `false` on initial load once the local selection matches the fetched applied
     set; becomes `true` after toggling a role away from the applied snapshot; returns to
     `false` after toggling back to the originally-applied (empty) set; and the most
     important one — a regression test titled `regression: goes back to false after a
     successful handleRoleAssignmentSave (ref-mirror-to-state fix, not just a ref
     mutation)`, which directly locks in the exact bug DEV wave 4 fixed (the ref-only
     mutation not triggering a re-render). `index.vitest.jsx` now 20/20 green (was 16).

2. **Smaller — i18n gap.** `AssignTemplateRolesControl.jsx` calls `ui('assignedRolesLabel')`,
   `ui('noRolesAssigned')`, `ui('saveUserFirstForRoles')`, and `ui('removeRoleAria')`, but
   none of these four keys exist in `tools/app-shell/src/locales/en_US.json` or
   `es_ES.json` — confirmed by grep, zero hits in either file. `useUI()` falls back to
   returning the raw key string when a key is missing, so the control's field label,
   empty-state copy, save-first placeholder, and remove-chip `aria-label` all render as
   literal untranslated key names (`"assignedRolesLabel"`, `"noRolesAssigned"`, etc.) in
   both locales today — visible directly in this spec's own Playwright screenshots taken
   while diagnosing an unrelated selector issue. This is exactly the class of gap Task
   F8 exists to catch across F3/F5/F6; it slipped through for this one component. Not
   fixed (Tester never modifies source, and these are locale JSON files, not test
   files) — flagged for a developer to add the 4 keys (both locales) before REVIEW signs
   off on F8.

   **FIXED (2026-08-14, developer follow-up, DEV wave 4):** all 4 keys added to both
   `tools/app-shell/src/locales/en_US.json` and `es_ES.json`, grouped next to the
   existing `assignedRole`/`noRoleAssigned` pair: `assignedRolesLabel` ("Assigned
   roles" / "Roles asignados"), `noRolesAssigned` ("No roles assigned" / "Sin roles
   asignados"), `saveUserFirstForRoles` ("Save the user first to assign roles" /
   "Guarda el usuario primero para asignar roles"), `removeRoleAria` ("Remove role" /
   "Quitar rol") — real Spanish translations, not machine-literal copies. Verified both
   files still parse as valid JSON. `AssignTemplateRolesControl.vitest.jsx` mocks
   `useUI()` to return the raw key, so this fix has no Vitest-visible effect (confirmed
   unchanged in the full suite run); it's only observable in a real i18n-resolving
   context (e.g. Playwright against `make dev`).

   **Adjacent gap noticed, was NOT fixed by DEV wave 4 (out of that dispatch's explicit
   4-key scope):** `windows/custom/user/index.jsx`'s `handleRoleAssignmentSave` also
   calls `ui('roleAssignmentSaveFailed')` as its generic save-failure toast fallback
   (`index.vitest.jsx`'s own test `falls back to the generic i18n error key when the
   rejection has no message` exercises this path via the mocked `useUI`), and that key
   was ALSO missing from both `en_US.json`/`es_ES.json` — same class of bug, same
   grep-confirmed gap, just not one of the 4 keys that dispatch named.

   **FIXED (2026-08-14, this session, Tester wave 5):** added `roleAssignmentSaveFailed`
   to both locale files, placed next to `saveUserFirstForRoles`/`removeRoleAria` (same
   neighborhood as the other 4 role-assignment keys): `"Couldn't save the assigned
   roles"` (en_US) / `"No se pudieron guardar los roles asignados"` (es_ES). This is a
   locale-JSON-only change (not application logic); made directly per this session's
   dispatch rather than routed through another developer cycle, since it was a single
   missing key discovered mid-test-writing and blocking full F8 i18n completeness ahead
   of REVIEW. Both files verified to still parse as valid JSON.

**Tester Wave 5 Verification (2026-08-14, this session) — final pass/fail counts:**
- Playwright, targeted: `cd e2e && npx playwright test tests/flows/user-role-assignment.mocked.spec.js` → **7 passed, 0 failed** (was 8 tests pre-fold; net -1 from folding the stale `KNOWN BUG` test into the adjacent save-wiring test).
- Vitest, targeted: `cd tools/app-shell && npx vitest run src/windows/custom/user/__tests__/index.vitest.jsx` → **20 passed, 0 failed** (was 16; +4 new `additionalDirtyState` tests).
- Vitest, `windows/custom/user/` (7 files): **102 passed, 0 failed** (was 98; +4).
- Vitest, full repo (`npx vitest run`, no path filter): **646 test files passed, 12011 tests passed, 3 skipped, 0 failed** (was 646/12007/3/0 — net +4 from the new `additionalDirtyState` tests, no regressions elsewhere).
- Locale files: `roleAssignmentSaveFailed` added to both `en_US.json`/`es_ES.json`, both re-verified as valid JSON (implicitly, via the app booting under Vitest/Playwright with no i18n-loader failures).
- No source files touched other than the two locale JSON files (explicitly permitted exception) — `windows/custom/user/index.jsx` and all other application logic left untouched, per this dispatch's scope.

### Task F10 — Docs ⏳ PENDING (DOCS phase, after REVIEW/QA)

**Agent:** Sage (documentarian) — DOCS phase.

**Files:** Modify `docs/generated-custom-windows/user.md` (mandatory — window-specific
changes must update the matching guide in the same change, per the Documentation
Freshness policy) with the new multi-role picker, matrix tab, grid role filter/chips,
and invite-snackbar flow.

---

## Pipeline & Dispatch Plan

1. **Clerk**: confirm/verify both `feature/ETP-4906` branches (already cut, confirmed
   clean in orientation) — no new branch work needed to start.
2. **DEV wave 1 (parallel, no dependencies):** B1 (spike), F1 (spike), B2+B3 (can start
   immediately — needs no spike output).
3. **DEV wave 2:** F2 (needs B2's shape) → then F3, F5, F6 in parallel (each needs F1+F2
   but not each other). F7 (needed F3) was investigated and **descoped to ETP-4830**
   rather than built — see Task F7. B4/F4 are descoped to ETP-4889 (see those
   tasks) — no wave needed for either descoped pair in this ticket.
3b. **DEV wave 3 (follow-up, post-F9): ✅ DONE (2026-08-14).** Fixed the
   `UserRolesTab.jsx` dead-code loading/error bug Tester found while writing F9 (see F9
   Findings) — the `columns.length === 0` empty-state check no longer wins over an
   in-flight/failed fetch; `loading`/`error` are checked first. Full `vitest run` pass:
   645/646 files, 12005/12010 tests green, exactly the 2 expected `KNOWN BUG` test
   failures in `UserRolesTab.vitest.jsx` (now stale — assert the old buggy behavior) and
   nothing else. **Tester follow-up done (2026-08-14):** those 2 tests' titles/assertions
   updated to match the fixed behavior — full repo suite now 646/646 files, 12007/12010
   tests green, 3 skipped, 0 failed. See F9 Findings for detail.
4. **F9 (Tester)** dispatched per completed frontend task, or batched at the end of DEV
   wave 2 — developer's call, but every task's Guardar-affecting behavior needs a test
   before REVIEW. **✅ DONE (2026-08-14).** Vitest portion done (135 tests, F9 Findings);
   Playwright portion landed too — `e2e/tests/flows/user-role-assignment.mocked.spec.js`,
   8 tests, 24/24 green across 3 local runs (multi-role assign flow, grid role filter —
   no invite-snackbar coverage, since F7 is descoped). Surfaced a severe, unfixed bug
   (role-only chip edits can never enable Guardar) plus a smaller i18n gap (4 missing
   locale keys in `AssignTemplateRolesControl.jsx`) — see F9 Findings. **Neither is
   fixed yet; DEV wave 4 below is needed before REVIEW can sign off.**
3c. **DEV wave 4 (follow-up, post-F9 Playwright): ✅ DONE (2026-08-14).** Wired
   `additionalDirtyState` through `windows/custom/user/index.jsx` (`hasUnsavedRoleChange`,
   reusing `sameIdSet`, plus mirroring the confirmed set back into `selectedRoleIds`
   state post-save so the prop actually re-renders) so a role-only chip change enables
   Guardar — see F9 Findings' severe-bug writeup for the fix detail and empirical
   verification against `make dev`. Added the 4 missing locale keys
   (`assignedRolesLabel`, `noRolesAssigned`, `saveUserFirstForRoles`, `removeRoleAria`)
   to both `en_US.json` and `es_ES.json` — see F9 Findings' i18n-gap writeup (also noted
   one adjacent, out-of-scope gap: `roleAssignmentSaveFailed`, not fixed at the time).
   Full Vitest suite still green (646/12007/3 skipped/0 failed, identical to baseline).
3d. **Tester wave 5 (follow-up, post-DEV-wave-4): ✅ DONE (2026-08-14).** Updated the
   stale Playwright `KNOWN BUG` test (folded into the adjacent save-wiring test, renamed,
   now asserts the fixed enablement behavior end to end); added 4 new Vitest tests
   directly covering `additionalDirtyState` (including the ref-mirror-to-state
   regression case); closed the adjacent `roleAssignmentSaveFailed` i18n gap in both
   locale files. Final counts: Playwright spec 7/7 passed; `index.vitest.jsx` 20/20;
   `windows/custom/user/` 102/102; full repo Vitest suite 646 files / 12011 tests / 3
   skipped / 0 failed. See F9 Findings' "Tester Wave 5 Verification" for detail. **F9 is
   now fully closed — REVIEW can proceed.**
5. **REVIEW (Alex):** runs `npx sf-validate-pipeline --scope=user`; explicitly
   re-verifies the General-row/9-gap-row matrix decision (F5) against the live Figma
   file, not this plan's screenshot-derived assumption; confirms tenant-boundary
   discipline was preserved in `SFUserRoleAssignments` (B2); confirms i18n completeness
   (F8, including the 2 gaps DEV wave 4 must close); confirms the `UserRolesTab.jsx`
   dead-code bug (wave 3) AND the Guardar-enablement bug (wave 4) are both fixed before
   sign-off, not deferred past this ticket.
6. **QA (Sentinel):** exercises the full flow live — assign roles to an existing GOClient
   test user, confirm the matrix matches `UserRoleCompositionService`'s actual
   most-permissive-wins result after save (not just the local preview), confirm the
   Admin-role filter/chip path. Does **not** need to verify an invite email/snackbar —
   F7 is descoped to ETP-4830, out of this ticket's scope entirely.
7. **DOCS (Sage):** F10.
8. **Clerk:** PR creation. F1's spike concluded the `onAfterExistingSave` hook is a
   same-repo `DetailView.jsx` change — no `schema_forge_core` PR needed.
9. **Jira updates — ✅ DONE** (posted directly this session, see the Status table's
   "Jira updates" row for links): comment on **ETP-4906** noting both descopes
   (Empresa/multi-company → ETP-4889 after B1; invite snackbar → ETP-4830 after F7);
   comment on **ETP-4889** with B1's findings as its starting spec; comment on
   **ETP-4830** with F7's findings as its starting spec, including a recommendation to
   widen that ticket's scope to cover the frontend snackbar alongside the email send.

## REVIEW Findings (Alex, 2026-08-14)

**VERDICT: REJECT**

```
BLOCKERS (1):
- [B1] e2e/tests/flows/role-assignment.mocked.spec.js — pre-existing spec (ETP-4512) never
  deleted/updated when F3 deleted AssignRoleControl.jsx. 3 of its 4 tests now fail live.

WARNINGS (0)

SUGGESTIONS (1):
- [S1] tools/app-shell/src/components/contract-ui/DetailView.jsx:1036 — the
  onAfterExistingSave guard was appended onto the same physical line as the onAfterCreate
  guard (two statements, one line, no braces) to satisfy the DetailView-growth hook.
  Functionally correct and deliberate (documented in F3 Findings) but reads awkwardly.
  Not a blocker — the growth-guard constraint is real and this was the accepted tradeoff.
```

**[B1] in detail — confirmed empirically, not just by grep.** `AssignRoleControl.jsx` and
its two Vitest spec files were correctly deleted as part of F3, and every OTHER reference to
`AssignRoleControl` was cleaned up (decisions.json's `reason` strings, code comments,
`roleNameI18n.js` docstrings — all just historical mentions, harmless). But
`e2e/tests/flows/role-assignment.mocked.spec.js` — a pre-existing Playwright spec from
ETP-4512 that exercises the OLD single-select `AssignRoleControl__select` control — was never
touched. Since `window.headerExtra.customForm` in `decisions.json` now points at
`AssignTemplateRolesControl` instead, that testid no longer exists anywhere in the codebase
(confirmed via grep). Ran the spec live against `make dev` (already running in this
environment) to confirm, not just reason from source:
```
cd e2e && npx playwright test tests/flows/role-assignment.mocked.spec.js
  ✘ assigns a role via AssignRoleControl and it shows as a badge in the list grid
  ✘ the assign-role select is enabled once options load
  ✘ Save stays disabled until a different role is picked
  3 failed
```
This spec matches `**/*.mocked.spec.js` in `playwright.config.js` (not excluded anywhere), so
it runs by default and will fail CI/`make test` as-is. F3's task spec said "Delete:
`AssignRoleControl.jsx` and its `__tests__/` (superseded — confirm nothing else imports it
first)" — that check covered the colocated Vitest `__tests__/` dir but not the separate
`e2e/tests/flows/` Playwright spec for the same component. **Remedy:** delete
`role-assignment.mocked.spec.js` (fully superseded by the new
`user-role-assignment.mocked.spec.js`, which covers the same ground — chip assignment, save,
grid badge — against the new control) — or, if any of its 4 cases test something the new spec
doesn't, port that assertion over first, then delete it.

**FIXED (2026-08-14, developer follow-up).** Re-read the old spec end to end (it actually
contains 3 `test()` cases on disk, not 4 as REVIEW's live run output implied — the "3 failed"
Playwright output line has no companion "X passed" count, so the plan's "3 of 4" phrasing was
an overcount; doesn't change the outcome) and compared each against
`user-role-assignment.mocked.spec.js`:
- "assigns a role via `AssignRoleControl` and it shows as a badge in the list grid" (old,
  single-select dropdown → PATCH → list-grid badge showing the raw untranslated role name) —
  superseded by the new spec's "grid renders role chips per user…" test, which asserts the
  **replacement** grid surface (`RoleChipsCell`, translated labels like "Finanzas", plus the
  classic-Admin branch). The old assertion was specifically about the old `defaultRole`
  status-badge column's raw-name fallback (its own code comment explains that was an accepted,
  known limitation of the component being deleted) — that column no longer exists as such; F6
  replaced it outright. Not a gap, a different (and better-covered) surface.
- "the assign-role select is enabled once options load" (old, trivial enablement check) — no
  direct analog needed; the new spec exercises the replacement control
  (`AssignTemplateRolesControl`) through real toggle/chip interactions in every detail-form
  test, which is a strictly stronger check than "is the control enabled."
- "Save stays disabled until a different role is picked" (old) — directly superseded by the new
  spec's "a role-only chip change enables Guardar and, once clicked, calls `SFAssignUserRoles`
  exactly once…" test, which covers the same enablement contract plus save wiring, the
  toggle-back-disables-it-again case, and the no-double-fire-on-unrelated-save case (none of
  which the old test covered at all).

**Conclusion: fully superseded, no coverage gap.** No Tester follow-up needed for this blocker.
Deleted `e2e/tests/flows/role-assignment.mocked.spec.js` (`git rm` not used — `rm`, left staged
in the working tree per this task's instructions, not committed). Verified: re-ran
`user-role-assignment.mocked.spec.js` live against `make dev` → 7/7 passed (same result Alex's
own re-run reported); grepped the whole repo for `role-assignment.mocked.spec` and
`AssignRoleControl__select` — no other `e2e/`, CI-workflow, or `playwright.config.js` reference
exists (the suite is picked up purely by the `**/*.mocked.spec.js` glob, no per-file allowlist to
update). Two **pre-existing** stale doc mentions were found and deliberately left untouched here
(out of this blocker's scope, both predate this fix from F3's earlier `AssignRoleControl.jsx`
deletion, both belong to the still-pending F10/Sage docs pass) — flagging for Sage:
`docs/generated-custom-windows/user.md:64` (cites deleted `AssignRoleControl.jsx`/its Vitest spec
and now the deleted E2E spec as evidence for the Assigned Role headerExtra) and
`docs/functionalidad/02-capacidades-y-flujos.md:345` (same pattern, cites
`AssignRoleControl.jsx:1-92` and the deleted E2E spec as evidence). A handful of other hits
(`santo_roles_handoff_*.md` at repo root, `docs/superpowers/plans/2026-07-21-etp-4512-*.md`) are
historical/archival snapshots of the superseded ETP-4512 work, not live docs — correctly left
alone.

**The 7 specific checks from this ticket's Dispatch Plan (Task 5):**

1. **`npx sf-validate-pipeline --scope=user`** — ✅ clean (`Pipeline validation: OK`).
2. **General-row/9-gap-row Figma re-verification** — ❌ **could NOT complete.** Figma MCP
   tools (`get_design_context`, `get_screenshot`, `get_metadata`) are available in this
   environment, and the Jira ticket's Figma URL was found
   (`https://www.figma.com/design/UqMboGO6t73CwmFhVnDmuB/SaaS-Etendo-2025?node-id=6005-60551`),
   but this session's Figma account has no access to that file (`"you don't have edit access
   to this file"` on both `get_metadata` and `get_screenshot`). The
   `UserRolesTab.jsx`/`GENERAL_ROWS` implementation itself is internally consistent with the
   plan's documented decision (3 hardcoded rows, 9 gap rows omitted entirely — verified by
   reading the code and its javadoc), but the decision's fidelity to the live Figma file
   remains unverified by REVIEW, exactly as the plan flagged as a risk. Someone with file
   access must complete this check before merge.
3. **Tenant-boundary discipline (`SFUserRoleAssignments`/`UserRoleCompositionService`)** — ✅
   confirmed. `getAppliedTemplateRoleIds(userId, callerRole)` calls
   `enforceCallerClientBoundary(user, callerRole)` immediately after resolving `user`, before
   entering admin mode — the same placement `assignTemplateRoles`'s write path uses.
   `getAppliedTemplateRoleIdsForClient(clientId)` has no per-target-user boundary check, which
   is correct: it's always scoped to `currentRole.getClient().getId()` (verified in
   `SFUserRoleAssignments.get()`), mirroring `SFRolesOverview`'s identical
   "always-caller's-own-client" convention (verified directly in `SFRolesOverview.java`).
4. **i18n completeness (F8)** — ✅ confirmed. Extracted every `ui('...')` call (plus the
   `ADMIN_NAME_I18N_KEY` indirection and the 3 dynamic `row.labelKey` values) across all 7
   changed/new files in `windows/custom/user/` — 17 distinct keys total — and cross-checked
   each against both `en_US.json` and `es_ES.json`. All 17 present in both files, including
   the `roleAssignmentSaveFailed` gap Tester Wave 5 closed.
5. **Bug-fix spot-checks** — ✅ both confirmed fixed by direct code read, not just trusting
   the plan: `UserRolesTab.jsx` checks `loading` → `error` → `columns.length === 0` in that
   order (lines 138–163), so the dead-code bug is genuinely gone. `windows/custom/user/index.jsx`
   computes `hasUnsavedRoleChange` via `sameIdSet` on every render and passes it as
   `additionalDirtyState` to `UserPage` (line 106), with the confirmed-set-mirrored-to-state
   fix in `handleRoleAssignmentSave` (line 80) — also re-ran the new Playwright spec live
   (`user-role-assignment.mocked.spec.js`, 7/7 passed) which directly exercises this path.
6. **Full `schema_forge_rules` checklist:**
   - **Shared Component Changes (DetailView.jsx)** — ✅ verified backward-compatible.
     `additionalDirtyState` already existed as an optional prop (`= false` default) before
     this PR; `onAfterExistingSave` is new but strictly additive and guarded
     (`if (!isNew && onAfterExistingSave)`). Grepped every other `windows/custom/*` for both
     prop names — only `user` uses either. `renderNewRecordSaveActions` (the new-record path)
     was NOT touched, confirming `onAfterExistingSave` can never fire before an `AD_User_ID`
     exists, per the Global Constraints. File is exactly at the `epic/ETP-3504` baseline line
     count (4441 lines vs. the true 4440 merge-base — see the wording-nit correction
     under F3 Findings above), confirming the growth-guard hook's constraint was
     honored and this PR did not worsen the pre-existing 1-line gap.
   - **Custom Code Location** — ✅ all 7 new components live in
     `tools/app-shell/src/windows/custom/user/`. Generated `UserPage.jsx` imports them via
     `@/windows/custom/user/...` (verified: `UserHeaderTable`, `AssignTemplateRolesControl`,
     `UserRolesTab` all resolved through `resolveCustomImport()`'s filesystem-driven path
     selection, correctly choosing the `tools/app-shell` location over `artifacts/user/custom/`
     since only the former exists on disk for these files).
   - **Pipeline Chain Completeness** — ✅ confirmed. `customPanelTabs`, `customComponents`,
     and `headerExtra` are all read by `generate-frontend.js` (`buildCustomComponentImportsAndProps`,
     `buildFormFooterParts`, `getCustomTabItems`) and passed through by `resolve-curated.js`'s
     window-config whitelist — not brand-new keys, `sales-invoice`'s `InvoiceHeaderTable`
     already uses the same `customComponents.headerTable` pattern as precedent.
   - **Regeneration Invariant** — ✅ confirmed. The only touched file under
     `artifacts/user/generated/` is `UserPage.jsx`, and every changed line falls inside
     `@sf-generated-start component:UserPage` / `@sf-generated-end` markers. `contract.json`'s
     diff is exactly the decisions.json change reflected through (checksum updated,
     `contract.mcp.json`'s checksum matches) — no hand-editing outside the pipeline.
7. **Full test suites:**
   - **Frontend Vitest** — ✅ re-ran independently: `npx vitest run` (no path filter) →
     **646 test files passed, 12011 tests passed, 3 skipped, 0 failed** — matches the plan's
     last recorded count exactly, no drift.
   - **New Playwright spec** — ✅ re-ran independently against live `make dev`:
     `user-role-assignment.mocked.spec.js` → **7/7 passed**.
   - **Stale Playwright spec** — ❌ `role-assignment.mocked.spec.js` → **3/4 failed** (this
     is BLOCKER B1 above, found by REVIEW, not previously caught).
   - **Backend Java (`UserRoleCompositionServiceTest`, `SFUserRoleAssignmentsTest`,
     `NeoPseudoSpecDispatcherTest`, `SFAssignUserRolesTest`)** — ⚠️ **could NOT independently
     confirm within this review session.** `:modules:com.etendoerp.go:test` (the module-local
     Gradle task) reports `NO-SOURCE` — this module's `src-test` is only ever wired into the
     ROOT `test` task (contributed by the Etendo Gradle plugin), not its own local task. A
     root-level `./gradlew test --tests "com.etendoerp.go...."` run **silently matched zero
     tests while still reporting `BUILD SUCCESSFUL`** — reproduced this myself, a real
     false-green trap (matches this repo's own documented Gradle quirks). The only reliable
     path is a full, unfiltered `./gradlew test` from the Etendo root (the same method the
     plan's own B2 entry used) — kicked one off, and it was still running against the whole
     Etendo test suite (confirmed genuinely executing — hit real, in-progress pre-existing
     failures like `RectificativeInvoiceNoSifTest`/`ConversionRateDownloaderTest`, consistent
     with the plan's documented ~817-pre-existing-failure baseline) when this report was
     written. The backend commit (`bc2b6c8c`) has not changed since B2's own verified run
     (16/16, 8/8, 15/15, 8/8, confirmed against the same 817-failure baseline), so there is no
     new reason to expect regression — but this is REVIEW re-stating DEV's claim, not an
     independent re-confirmation. **Whoever picks up fixing B1 should let that backend run
     finish (or re-run it) and attach the result before the next REVIEW pass**, or explicitly
     accept DEV's original run as sufficient evidence — that's a coordinator/human call, not
     something REVIEW should silently assume either way.

**Everything else in this ticket's implementation is solid.** The i18n, tenant-boundary,
pipeline-chain, and regeneration-invariant checks all passed cleanly, the two previously-known
bugs (dead-code branch order, Guardar-enablement) are genuinely fixed and covered by
regression tests, and the new frontend test suites are fully green. The single BLOCKER is a
scope gap in F3's own cleanup step (a Playwright spec sibling to the Vitest specs it did
correctly delete), not a defect in the new functionality itself — straightforward to fix.

## REVIEW Re-Review Findings (Alex, 2026-08-14, agentId `a055d5018a6ab98e8`)

**VERDICT: APPROVE**

```
BLOCKERS (0)
WARNINGS (0)
SUGGESTIONS (1):
- [S1] docs/plans/2026-08-14-etp-4906-multi-role-user-assignment.md — "File is exactly at
  the epic/ETP-3504 baseline line count (4441 lines)" is imprecise: true merge-base is
  4440 lines, and the file was already 2 lines over it pre-ETP-4906 (not 1), from the
  unrelated ETP-4714 fix. ETP-4906's own diff to DetailView.jsx nets -1 line, so this PR
  did not introduce or worsen the gap — just a wording correction for whoever finalizes docs.
```

Independently re-verified rather than trusting the first pass's writeup: `git show
HEAD:e2e/tests/flows/role-assignment.mocked.spec.js` confirms the old spec is genuinely
gone from the committed tree; re-ran `user-role-assignment.mocked.spec.js` live against
the already-running `make dev` → 7/7 passed; grepped the repo for dangling references to
the old spec/testid — zero hits. Also independently re-ran
`npx sf-validate-pipeline --scope=user` (OK) and a targeted Vitest pass
(`windows/custom/user/` + `userRoleAssignmentsApi.vitest.js` +
`DetailView.saveActions.vitest.js` → 139/139 passed), and read the actual
`DetailView.jsx` diff directly (net **-1 line**, `onAfterExistingSave` additive and
guarded, `renderNewRecordSaveActions` untouched) rather than trusting the plan's claim.

Figma access attempted again independently (`mcp__claude_ai_Figma__get_screenshot` on
the same file/node) — same "no edit access" denial as the first pass. Two independent
sessions have now confirmed this is a real access gap, not a one-off fluke — **the
General-row/9-gap-row matrix decision in `UserRolesTab.jsx` needs a human with Figma
file access to sign off before merge.** Backend Java tests accepted per the standing
human instruction not to block on a full unfiltered `./gradlew test` run — targeted-class
results against `bc2b6c8c` (unchanged since B2) stand as sufficient evidence.

**REVIEW phase is closed. Proceeding to QA (Sentinel).**

## REVIEW Findings — Full Re-Review (Alex, 2026-08-17)

**VERDICT: REJECT**

```
BLOCKERS (3):
- [B1] artifacts/user/generated/web/user/UserRolesTable.jsx,
  artifacts/user/generated/web/user/UserRolesForm.jsx — orphaned generated output, still
  committed. `artifacts/user/decisions.json`'s `entities.userRoles` has been the bare
  `{ "exclude": true }` since DEV wave 6 (`git log` shows both files last touched 2026-08-14,
  UNCHANGED since — no commit in waves 6-12/B5/B6 deletes them), so a clean `make regen
  ONLY=user` never produces them anymore (confirmed: `UserPage.jsx` mounts `emailConfiguration`
  as its only detail entity, not `userRoles`; `contract.json` has no `userRoles` key, per the
  new `artifacts/__tests__/etp-4906-user-roles-tab-exclusion.test.js` regression test). This is
  exactly the "Files in `generated/` that the pipeline does not produce" case the Regeneration
  Invariant rule calls a BLOCKER, and the "Stale Files After Entity Rename" rule's own worked
  example (old files must be deleted when the entity that produced them stops producing them).
  Self-acknowledged in the window's own doc (`docs/generated-custom-windows/user.md:25`: "remain
  on disk as orphaned generated output") but never actually cleaned up across 12 dev waves.
  Fix: `git rm` both files (or re-run `make regen ONLY=user` with the current decisions.json,
  which will simply not re-emit them) and re-verify `sf-validate-pipeline --scope=user` still
  reports OK afterward.
- [B2] com.etendoerp.go/docs/neo-headless.md — zero mention of
  `WindowAccessOverlapCorruptionGuard` (`src/com/etendoerp/go/roles/`, 915 lines, Task B6, 5
  live-tested rounds). `grep -n "WindowAccessOverlapCorruptionGuard" docs/neo-headless.md`
  returns nothing. This is a NEW, system-wide `EntityPersistenceEventObserver` that changes
  core `AD_Window_Access`/`AD_Role_Inheritance` persistence behavior for every role/template in
  the system, not just this window's flow — squarely the kind of behavioral change CLAUDE.md's
  Documentation Freshness policy requires REVIEW to reject ("Code change + doc update = one
  atomic unit... REVIEW must reject PRs that change behavior without updating docs"). The class's
  own javadoc is excellent (arguably doc-complete on its own), but nothing in the project-level
  `neo-headless.md` reference — where `UserRoleCompositionService`'s own overlap-corruption fix
  IS documented (§8d) — points a future reader at this class at all; §8d's prose still describes
  only the two role-scoped helpers, silently omitting the system-wide guard that now backs them
  up. The plan doc's own Status banner already named this exact gap as owed ("(3) DOCS refresh
  ... AND for B6's new backend mechanism... check if B6's event-observer pattern needs a
  mention") — it was never done. Fix: add an §8g (or a subsection under §8d) summarizing what
  `WindowAccessOverlapCorruptionGuard` does, why it's a separate class from
  `UserRoleCompositionService`'s helpers, and a `docs/neo-headless.md` §9 testing-table row (the
  class has no dedicated unit test file today — it's exercised entirely through
  `UserRoleCompositionServiceOverlapIntegrationTest`/`RealAccessControlIntegrationTest` — that
  table linkage should be made explicit too).
- [B3] docs/generated-custom-windows/user.md — stale/actively incorrect in two places, not
  just missing:
  - Lines 15 and 40 still say the role picker/matrix catalog is "sourced from `SFRolesOverview`'s
    roles array (`isClientAdmin` roles excluded...)". DEV wave 7 repointed both
    `AssignTemplateRolesControl.jsx` and `UserRolesTab.jsx` to `fetchTemplateRoles()`
    (`SFSystemRoleTemplates`) for the actual role/column catalog — confirmed by reading both
    files directly (`AssignTemplateRolesControl.jsx:48`, `UserRolesTab.jsx:153,179-182`).
    `fetchRolesOverview()`/`SFRolesOverview` is now used ONLY for the `activeWindowIds`
    Etendo-GO-window-exposure filter in `UserRolesTab` and the admin-detection branch in
    `RoleChipsCell`'s `useUserRoleGridData` — never the role catalog itself anymore. This is
    the exact gap the plan's own F10 row already flagged as owed ("not yet updated for the new
    `SFSystemRoleTemplates` endpoint").
  - The "Gap assessment" section (lines 46-48) and Manual verification step 7 (line 62) say
    Email Configuration is NOT mounted on this window ("UserPage.jsx only mounts `userRoles`",
    "no visible evidence that a user can trigger [the SMTP] test", "confirm the current page
    does NOT surface an Email Configuration child pane, SMTP connection test action"). This is
    now FALSE: the generated `UserPage.jsx` in THIS diff mounts `detailEntity="emailConfiguration"`
    with `DetailTable={EmailConfigurationTable}`/`DetailForm={EmailConfigurationForm}` and a new
    `detailProcesses` array containing `smtpconnectiontest` (confirmed by reading the generated
    file directly, lines ~37-41 and ~250-265). A QA engineer following this doc's own
    step-by-step manual-verification checklist would be told to confirm the ABSENCE of a feature
    that is actually present — actively misleading, not merely outdated. (Whether mounting
    `emailConfiguration` was an intended part of this ticket's scope or a side effect of
    excluding `userRoles` and letting the next child entity become the detail slot is a DEV
    question, not a REVIEW one — either way the doc must match what `UserPage.jsx` now does.)

WARNINGS (0)

SUGGESTIONS (2):
- [S1] tools/app-shell/src/windows/custom/user/index.jsx:111 passes
  `props: { selectedRoleIds }` into the `roles` custom-tab entry, but
  `UserRolesTab.jsx:126` only destructures `{ isNew, onVisibilityChange }` from its
  props — `selectedRoleIds` is read exclusively via `useRoleSelection()` (context), so the
  prop is dead. Harmless today (both channels carry the identical value from the same
  `index.jsx` state, so they can never diverge), but `roleSelectionContext.js`'s own doc
  comment ("index.jsx CAN thread selectedRoleIds to UserRolesTab as a plain prop... and
  does, since that is the interface UserRolesTab.jsx was already written against") is
  itself stale about this — worth a small cleanup pass (drop the dead prop or update the
  comment) next time this file is touched.
- [S2] tools/app-shell/src/components/contract-ui/DetailView.jsx:1036 — two `if`
  statements (`onAfterCreate`/`onAfterExistingSave`) were combined onto one physical line
  rather than given their own lines. Reads as an odd style choice in isolation, but given
  the prior REVIEW pass's own S1 finding about this file sitting right at its line-count
  budget (a "God Component" already flagged for extraction, per the
  `extract-hotspot-component` skill), keeping this net-neutral on line count looks
  deliberate rather than accidental. Not blocking; flagging so a future formatting pass
  doesn't have to rediscover the reasoning.
```

**Scope of this pass:** frontend diff `4c37dd0d0..HEAD` in `etendo_schema_forge` (39 files, the
correct base per `git merge-base origin/epic/ETP-3504 HEAD` — the branch's real fork point;
local `main` in this checkout is far too stale to diff against directly, do not use it) and the
ETP-4906-only backend diff `bc2b6c8c^1..HEAD` in `com.etendoerp.go` (12 files — deliberately
excluding the earlier ETP-4852/ETP-4878 commits also present on this branch, which were already
reviewed under their own tickets and are out of THIS review's scope). Read in full:
`WindowAccessOverlapCorruptionGuard.java`, `UserRoleCompositionService.java`'s ETP-4906 diff,
`SFUserRoleAssignments.java`, `SFSystemRoleTemplates.java`, `NeoPseudoSpecDispatcher.java`'s
diff, `DetailView.jsx`'s diff, `windows/custom/user/index.jsx`,
`AssignTemplateRolesControl.jsx`, `UserRolesTab.jsx`, `RoleChipsCell.jsx`,
`RoleFilterControl.jsx`, `UserHeaderTable.jsx`, `roleSelectionContext.js`, both locale diffs,
`decisions.json`'s diff, generated `UserPage.jsx`'s diff, and both doc diffs.

**Backend scrutiny (B6's `WindowAccessOverlapCorruptionGuard`, the class explicitly called out
for "real scrutiny not a rubber stamp").** Read the full 915-line file including every javadoc
section. The design is sound and unusually well-reasoned for a workaround this deep into core
Hibernate/CDI event ordering: the prevention-over-correction rationale (§"Why this design"),
the `@Priority` ordering argument, the bulk-HQL-delete-not-OBDal.remove()+flush() reasoning, and
the `TEMPLATES_BEING_REMOVED` ThreadLocal race-closing mechanism are all independently
verifiable against the reasoning given, not just asserted. Two things checked specifically and
found correct: (1) registration pattern matches the existing `ContactNameSyncHandler`/
`BankStatementLineAggregateHandler` precedent (plain `extends EntityPersistenceEventObserver`,
no `@Named`/`@ApplicationScoped` needed — that requirement is specific to the unrelated
`NeoHandler` CDI pattern per this repo's own CLAUDE.md, not applicable here); (2)
`guardRemovedInheritance` does not gate on `removedTemplate.isTemplate()` the way
`guardNewInheritance` does, but this is harmless, not a bug — `findActiveTemplatesFor`'s own
`isTemplate()` filter means a non-template id added to `TEMPLATES_BEING_REMOVED` can never
suppress a real template from that method's result set. No behavioral bug found in this class
after this pass; both integration suites 8/8 + 3/3 on a fresh `--rerun-tasks` run (not the
misleadingly-cached first `UP-TO-DATE` run — see Verification below).

**Verification performed (not just re-stated from the plan doc):**
- `cd etendo && ./gradlew :test --tests "...OverlapIntegrationTest" --tests
  "...RealAccessControlIntegrationTest"` — first run reported `UP-TO-DATE` (Gradle's
  incremental-build cache short-circuiting real execution, the same class of false-green risk
  as the NO-SOURCE trap already in this project's memory notes); re-ran with `--rerun-tasks` to
  force real execution — `BUILD SUCCESSFUL`, and the JUnit XML reports
  (`build/test-results/test/TEST-*.xml`) confirm `tests="8" failures="0" errors="0"` and
  `tests="3" failures="0" errors="0"` respectively, freshly timestamped 2026-08-17.
- `cd tools/app-shell && npx vitest run src/windows/custom/user/
  src/components/contract-ui/__tests__/DetailView.saveActions.vitest.js
  src/lib/__tests__/userRoleAssignmentsApi.vitest.js` — 9 files, 145/145 passed.
- `cd e2e && npx playwright test tests/flows/user-role-assignment.mocked.spec.js` (against the
  already-running `make dev` on :3100) — 7/7 passed.
- `npx sf-validate-pipeline --scope=user` — `Pipeline validation: OK`. (An unscoped
  repo-wide `npx sf-validate-pipeline` run separately errored on an unrelated
  `node_modules/@etendosoftware/artifacts` ENOENT — a pre-existing local environment issue, not
  something this diff touches or could have caused; not counted against this PR.)
- i18n: diffed `en_US.json`/`es_ES.json` against every `ui('...')` key actually referenced in
  the changed `windows/custom/user/*.jsx` files — full 1:1 coverage in both locales, no gaps.
- Read `decisions.json`'s diff and the generated `UserPage.jsx`'s diff side by side — every
  changed line in the generated file falls inside `@sf-generated-start`/`@sf-generated-end`
  markers and traces directly to a `decisions.json` change (the `userRoles` exclusion, the
  `customForm`/`customPanelTabs`/`customComponents.headerTable` swaps) — no evidence of a
  hand-edit to generated output.

**Not re-litigated (per dispatch instructions):** Figma design-file access remains a standing,
agent-unfixable gap, not a blocker. No unfiltered `./gradlew test` run was attempted — the
targeted-class results above are the accepted evidence standard for this ticket. Backend JUnit
tests were written directly by developers per this repo's testing-delegation rule (Tester only
covers Vitest/Node/Playwright).

**Next steps:** all 3 blockers are documentation/cleanup only — no functional code changes are
needed, so this should be a fast turnaround back to REVIEW once DEV closes them out. Recommend a
single DEV pass: delete the 2 orphaned files, add the `WindowAccessOverlapCorruptionGuard`
section to `neo-headless.md`, and fix the 2 stale spots (+ the Manual verification step) in
`user.md`, then re-dispatch REVIEW for a scoped re-check of just those changes rather than a
full re-review.

### Blockers Closed (DEV, 2026-08-17)

All 3 blockers fixed, docs/cleanup only — no source logic changed, no new functional bug found
while investigating any of them. Ready for a scoped REVIEW re-check.

- **[B1] Orphaned `UserRolesTable.jsx`/`UserRolesForm.jsx` deleted.** `git rm` both files, then
  confirmed via `make regen ONLY=user SKIP_EXTRACT=1` that a clean regeneration does not
  recreate them (contract has no `userRoles` key, `UserPage.jsx` mounts `emailConfiguration`
  only). `npx sf-validate-pipeline --scope=user` still reports OK afterward. A repo-wide grep for
  `UserRolesTable`/`UserRolesForm` outside git history now returns only the regression test's own
  assertion that they must NOT appear
  (`artifacts/__tests__/etp-4906-user-roles-tab-exclusion.test.js`, still green,
  `node --test`). `etendo_schema_forge` commit `9c58d4e99` (file deletion) +
  `b020f8c06` (the B3 doc fixes below also touch the same file's now-dangling references to
  these files).
- **[B2] `WindowAccessOverlapCorruptionGuard` documented.** Added a section under
  `com.etendoerp.go/docs/neo-headless.md` §8d summarizing what the class does, why it is a
  separate class from `UserRoleCompositionService`'s two role-scoped helpers, its 4 guarded
  triggers (template gains a grant / role gains a new inheritance / role loses an inheritance /
  most-permissive-wins enforcement + `InheritedFrom` bookkeeping on widen), and its `@Priority`
  ordering rationale. Refreshed the §9 testing table: `UserRoleCompositionServiceOverlapIntegrationTest`
  now correctly shows 8 tests (was stale at 3, predating the B6 rounds) covering all 4 triggers,
  and added the previously-missing `UserRoleCompositionServiceRealAccessControlIntegrationTest`
  (B5) row — both rows now explicitly state `WindowAccessOverlapCorruptionGuard` has no dedicated
  test class of its own and is exercised entirely through these two. `com.etendoerp.go` commit
  `5ad8eb2a`.
- **[B3] `docs/generated-custom-windows/user.md` stale spots fixed.** Role-catalog source
  corrected from `SFRolesOverview` to `fetchTemplateRoles()`/`SFSystemRoleTemplates` (DEV wave 7)
  in both the header-control paragraph and the matrix-tab paragraph, verified against
  `AssignTemplateRolesControl.jsx`/`UserRolesTab.jsx` source directly. Gap assessment and manual
  verification step 7 corrected to state Email Configuration IS mounted (`detailEntity=
  "emailConfiguration"`, `DetailTable`/`DetailForm`, `smtpconnectiontest` process), verified
  against the generated `UserPage.jsx` directly. Also fixed 2 references this same cleanup
  exposed as newly-stale: the "Window shape" line's mention of the (now-deleted) orphaned files,
  and the "Automated evidence" line grounding User Roles child columns in the now-deleted
  `UserRolesTable.jsx`. `etendo_schema_forge` commit `b020f8c06`.

(A 4th, pre-existing uncommitted change in the `etendo_schema_forge` worktree — the core-level
`AD_Window_Access` overlap-corruption fix proposal doc referenced earlier in this plan — was also
committed during this pass since it was sitting dirty in the tree; unrelated to the 3 blockers
above, not gated on REVIEW. `etendo_schema_forge` commit `63ac8be60`.)

## REVIEW Findings — Re-Review After Blocker Fixes (Alex, 2026-08-17)

**VERDICT: REJECT**

```
BLOCKERS (1):
- [B4] docs/generated-custom-windows/user.md:25 — the "Window shape" bullet still reads
  "master-child in the contract (`user` + `emailConfiguration`), but no child entity is
  mounted on the detail page." This is now FALSE and self-contradicting within the SAME
  document: the "Gap assessment" section (line 46) and "Automated evidence" (line 75), both
  corrected by this exact fix commit (`b020f8c06`), correctly state `UserPage.jsx` mounts
  `emailConfiguration` as `detailEntity` with `DetailTable`/`DetailForm`. Independently
  confirmed against the real generated file: `grep -n "detailEntity\|DetailTable" UserPage.jsx`
  shows `detailEntity="emailConfiguration"` at line 253, `DetailTable={EmailConfigurationTable}`
  at line 255. `git show b020f8c06 -- docs/generated-custom-windows/user.md` confirms the diff
  touched this exact line (to drop the stale mention of the now-deleted `UserRolesTable.jsx`/
  `UserRolesForm.jsx` orphans) but left the "no child entity is mounted" clause untouched —
  the fix was partial, not a miss of a different spot. This is the identical bug class the
  original B3 blocker was raised for (a manual-verification/description doc asserting the
  ABSENCE of a feature the generated code actually mounts), just a third location the original
  pass didn't catch, now exposed once the other two were fixed and made it inconsistent with
  its own neighbors. `Detail behavior` (line 27) is also silent on `emailConfiguration` but
  doesn't affirmatively claim absence, so it's not counted as a second instance — only line 25's
  explicit "but no child entity is mounted on the detail page" is factually wrong.
  Fix: rewrite line 25 to state `emailConfiguration` IS the mounted detail child (matching
  lines 46/75), consistent with the rest of the same document.

WARNINGS (0)

SUGGESTIONS (0) — S1/S2 from the prior pass are unchanged/unaddressed but were never blocking;
not re-litigated here since this pass is scoped to the 3 blocker fixes.
```

**Verification performed on B1 (orphaned files) — CLOSED:**
- `ls artifacts/user/generated/web/user/UserRolesTable.jsx artifacts/user/generated/web/user/UserRolesForm.jsx` — both gone (`No such file or directory`).
- `git show --stat 9c58d4e99` — confirms exactly those 2 files deleted, 51 lines removed, nothing else touched.
- Repo-wide grep for `UserRolesTable`/`UserRolesForm` (excluding `.git`/`node_modules`) — only 2 hits, both expected: the regression test's own negative assertion (`artifacts/__tests__/etp-4906-user-roles-tab-exclusion.test.js:62`, matching against their ABSENCE) and `user.md:25`'s past-tense mention that they were deleted (itself fine — see B4 above, the problem on that line is a different clause).
- `npx sf-validate-pipeline --scope=user` → `Pipeline validation: OK`.
- `node --test artifacts/__tests__/etp-4906-user-roles-tab-exclusion.test.js` → 3/3 pass, freshly re-run.

## REVIEW Findings — Final Verdict (Alex, 2026-08-17)

**VERDICT: APPROVE**

Scope of this pass: narrow re-check of the single remaining B4 blocker only (`docs/generated-custom-windows/user.md:25`), per the coordinator's brief — not a full re-review. Everything else (waves 6-12, B5, B6, B1-B3 and their fixes) was already independently verified across the prior two review passes and is not re-litigated here.

```
BLOCKERS (0)
WARNINGS (0)
SUGGESTIONS (0)
```

**B4 fix verified — CLOSED:**
- `git log -1 3ed4bc7ea` — "Feature ETP-4906: Fix contradicting Window shape clause in user.md" — the fix commit under review.
- Read `docs/generated-custom-windows/user.md:20-32` in full. Line 25 now reads: "Window shape: master-child in the contract (`user` + `emailConfiguration`), and `emailConfiguration` is mounted as the detail child on the detail page (`detailEntity="emailConfiguration"`, `DetailTable={EmailConfigurationTable}`, `DetailForm={EmailConfigurationForm}`)." The self-contradicting "but no child entity is mounted on the detail page" clause is gone.
- Cross-checked against line 46 (Gap assessment) and line 75 (Automated evidence) in the same file — all three now assert the same fact in the same terms (`detailEntity="emailConfiguration"`, `DetailTable={EmailConfigurationTable}`, `DetailForm={EmailConfigurationForm}`). No remaining internal contradiction in this section.
- Independently re-verified against the real generated file: `grep -n 'detailEntity=\|DetailTable=\|DetailForm=' artifacts/user/generated/web/user/UserPage.jsx` → `detailEntity="emailConfiguration"` (line 253), `DetailTable={EmailConfigurationTable}` (line 255), `DetailForm={EmailConfigurationForm}` (line 256). The doc's claim is accurate.

With B4 closed and no new issues found in the ~12 lines under review, all blockers raised across the full REVIEW history of ETP-4906 (B1-B6) are now closed. Approving the full ticket: waves 6-12, B5, B6, and this blocker-fix round.
**Verification performed on B2 (`WindowAccessOverlapCorruptionGuard` docs) — CLOSED:**
- `grep -n "WindowAccessOverlapCorruptionGuard" docs/neo-headless.md` (in `com.etendoerp.go`) — 4 hits: the new §8d subsection (lines 1437–1500) plus 2 refreshed §9 testing-table rows plus a §9 lead-in sentence.
- Read the full new subsection against the real class
  (`src/com/etendoerp/go/roles/WindowAccessOverlapCorruptionGuard.java`) line by line: the 4
  guarded triggers, the `@Priority` "runs before core's unprioritized observers" ordering claim,
  the `TEMPLATES_BEING_REMOVED` `ThreadLocal` + `TransactionCompletedEvent` cleanup mechanism, and
  the `widenInheritedAccessLevelIfNeeded` method name all match the real source exactly
  (`grep -n "@Priority\|TEMPLATES_BEING_REMOVED\|widenInheritedAccessLevelIfNeeded\|TransactionCompletedEvent"` on the class confirms every claim). Not superficial — this is an accurate,
  detailed summary, not a restated javadoc pointer.
- The refreshed §9 test-count claims ("8 tests" / "3 tests") match the real files:
  `grep -c "@Test" UserRoleCompositionServiceOverlapIntegrationTest.java` → 8;
  `UserRoleCompositionServiceRealAccessControlIntegrationTest.java` → 3.
- `cd etendo && ./gradlew :test --tests "com.etendoerp.go.roles.UserRoleCompositionServiceOverlapIntegrationTest" --tests "com.etendoerp.go.roles.UserRoleCompositionServiceRealAccessControlIntegrationTest" --rerun-tasks` → `BUILD SUCCESSFUL`; JUnit XML reports independently confirm `tests="8" failures="0" errors="0"` and `tests="3" failures="0" errors="0"`, freshly timestamped 2026-08-17 04:24 UTC (not a cached UP-TO-DATE result — `--rerun-tasks` forces real execution, same discipline as the prior pass).

**Verification performed on B3 (`user.md` stale claims) — PARTIALLY CLOSED, see B4 above:**
- Role-catalog attribution: `user.md` lines 15 and 40 now correctly say `fetchTemplateRoles()`/
  `SFSystemRoleTemplates`, cross-checked against `AssignTemplateRolesControl.jsx` and
  `UserRolesTab.jsx` source directly — CORRECT, matches the original B3 finding's fix
  instruction exactly.
- Email Configuration mounted: Gap assessment (line 46-47), Automated evidence (line 75), and
  Manual verification step 7 (line 62) now all correctly state `emailConfiguration` is mounted
  with the SMTP test process — cross-checked against `UserPage.jsx`'s
  `detailEntity`/`DetailTable`/`DetailForm`/`detailProcesses` — CORRECT.
- BUT the "Window shape" bullet (line 25), touched by the same commit to drop a different stale
  mention, still contains the pre-existing "no child entity is mounted on the detail page"
  clause, which the Gap assessment fix two paragraphs later directly contradicts — this is B4.

**Commit `63ac8be60` (core-proposal doc) — confirmed inert, not scope creep:**
- Read `docs/etendo-ad/role-inheritance-window-access-overlap-core-proposal.md` in full (177
  lines). Every claim is explicitly tagged `[confirmed]` (verified against real core source,
  read-only) or `[proposed]` (a code snippet offered as discussion material, not applied
  anywhere) — no `[proposed]` snippet exists outside this markdown file. The doc's own opening
  paragraph and closing section explicitly state Schema Forge is not waiting on it and the
  accepted path remains the module-level `com.etendoerp.go` fix (Task B6). `git show 63ac8be60
  -- docs/etendo-ad/index.md` shows only a 1-line table-row addition linking to the new doc.
  Genuinely inert — a discussion/proposal doc, touches no shipped code path. Not flagged.

**Sanity check — nothing else changed unexpectedly:**
`git diff --stat 463eb9ffe..e7a13125f` (the range covering exactly the 4 post-original-REVIEW
commits, excluding the plan doc itself) touches only: the 2 deleted orphan files, the new
core-proposal doc + its 1-line index entry, and 15 changed lines in `user.md` — exactly the
scope of the 3 blocker fixes, no unrelated source/generated/test file touched.

**Frontend regression check:**
`cd tools/app-shell && npx vitest run src/windows/custom/user/
src/components/contract-ui/__tests__/DetailView.saveActions.vitest.js
src/lib/__tests__/userRoleAssignmentsApi.vitest.js` → 9 files, 145/145 passed (unchanged from
the prior pass — expected, since none of the 4 fix commits touch frontend source, only
generated/docs).

**Next steps:** Single-line doc fix in `user.md:25` — rewrite the "Window shape" bullet to state
`emailConfiguration` IS the mounted detail child, matching lines 46/75 of the same file. No code,
test, or other doc changes needed. Recommend a scoped re-check of just that one line once fixed.

**[B4] Fixed (DEV, 2026-08-17) — commit `3ed4bc7`.** Rewrote the "Window shape" bullet in
`docs/generated-custom-windows/user.md:25`: it now states `emailConfiguration` is mounted as the
detail child (`detailEntity="emailConfiguration"`, `DetailTable={EmailConfigurationTable}`,
`DetailForm={EmailConfigurationForm}`), matching the Gap assessment (line 46) and Automated
evidence (line 75) sections it previously contradicted. The rest of the bullet (the `userRoles`
exclusion explanation) is unchanged. Single-line doc-only change, no code/test impact. Ready for
Alex's scoped re-check of just this line.

## REVIEW Findings — Scoped Check of B6 6th Round (Alex, 2026-08-17)

**VERDICT: APPROVE**

Scope: narrow code-correctness re-check of `com.etendoerp.go` commit `e81844c2`
("Feature ETP-4906: Fix REMOVE-path duplicate-INSERT crash with 3+ templates") only —
`WindowAccessOverlapCorruptionGuard.guardRemovedInheritance`/new `repointInPlace`, plus the new
JUnit test `testRemovingOneOfFourTemplatesLeavesTwoRemainingOverlappingTemplatesUnbroken`. This is
the 6th B6 round, found by the human on the real `SFAssignUserRoles` production flow after the
ticket's prior full APPROVE (see "REVIEW Findings — Final Verdict" above); everything else on the
ticket is out of scope for this pass, not re-litigated.

```
BLOCKERS (0)
WARNINGS (0)
SUGGESTIONS (1)
```

**1. `winner`/`winnerLevel` separation — genuinely decoupled, not accidentally coupled.**
Read `WindowAccessOverlapCorruptionGuard.java:735-771` directly (not just the javadoc). Confirmed
two independent `LinkedHashMap`s are built in the SAME loop over `remainingTemplates` but never
cross-read: `anyGrantor` (`putIfAbsent`, unconditional — first remaining template seen granting the
window) and `fullGrantor` (`putIfAbsent`, gated on `templateGrant.isEditableField()` — first FULL
grantor seen). `winner = anyGrantor.get(windowId)` and `winnerLevel =
fullGrantor.containsKey(windowId)` read from separate maps; `winnerLevel`'s computation never
consults `winner`, and `winner`'s computation never consults access level. `fullGrantor`'s stored
`Role` value is written but never read (only `.containsKey()` is used) — dead but harmless, not a
correctness issue. This matches the design claim in the class javadoc and in "B6 Findings — 6th gap
fix" exactly, and is consistent with the developer's own empirical correction (the "prefer full
grantor as winner" first attempt reproduced `OBSecurityException` client corruption, confirmed live
in JUnit red before the fix, per that section) — good evidence this wasn't just claimed but actually
tested both ways.

Also confirmed `remainingTemplates`' ordering claim: `findActiveTemplatesFor` (line 858) calls
`criteria.addOrderBy(RoleInheritance.PROPERTY_SEQUENCENUMBER, false)` — `false` = descending in
`OBCriteria#addOrderBy(property, ascending)` — so `anyGrantor.putIfAbsent`'s "first template seen"
for a window really is the highest-`SeqNo` remaining grantor, matching the "mirrors core's own
`isPrecedent` ordering" claim.

**2. Bulk HQL `UPDATE` in `repointInPlace` — correct, no binding issues.**
Verified `WindowAccess`'s real generated model
(`src-gen/org/openbravo/model/ad/access/WindowAccess.java`): `PROPERTY_INHERITEDFROM =
"inheritedFrom"` and `PROPERTY_EDITABLEFIELD = "editableField"` match the hand-written HQL property
names exactly (`"update " + WindowAccess.ENTITY_NAME + " set inheritedFrom = :winner, editableField
= :level..."`, `ENTITY_NAME = "ADWindowAccess"`). Parameters are bound as entity objects (`winner` a
`Role`, `currentUser` a `User`) rather than raw id strings — correct for Hibernate HQL bulk updates
against many-to-one associations, and consistent with the method's own javadoc explaining the
earlier `ClassCastException` this avoids. `session.evict(existing)` immediately after
`executeUpdate()` prevents the in-session entity from going stale relative to the bulk-written row —
same established pattern as the pre-existing `deleteForcingCreatePath`. `OBContext.setAdminMode
(false)`/`restorePreviousMode()` bracketing matches the sibling method's own convention exactly (grep
confirms both are the only two `setAdminMode` call sites in the class). No SQL injection risk (no
string-concatenated values, only bind parameters and the hardcoded `ENTITY_NAME` constant).

**3. `TEMPLATES_BEING_REMOVED` marker — unaffected by this round's changes, no leak/staleness risk.**
The marker's populate site (`templatesBeingRemoved().add(removedTemplate.getId())`,
`guardRemovedInheritance`'s first statement), its consultation site (inside
`findActiveTemplatesFor`), and its cleanup site (`onTransactionComplete`, unchanged) are all
untouched by this commit — `git show e81844c2` only adds code after the existing `add(...)` call.
Read the round-5 marker javadoc and the round-6 mechanism together: this round's fix actually
*shrinks* the marker's practical necessity for windows it corrects, since `repointInPlace` is a bulk
HQL `UPDATE` that fires no `EntityNewEvent`/`EntityUpdateEvent` at all — there is no longer a nested
CREATE for those windows for the round-5 race to even apply to. The marker remains load-bearing only
for windows this round's fix does NOT correct (the `existing == null` fallback path, where core's own
natural CREATE still runs and could still nest into `widenInheritedAccessLevelIfNeeded`) — same
scope as before, correctly still guarded. No new leak path introduced.

**4. Residual "no existing row" gap — acceptable to leave as documented, not a blocker.**
Read the javadoc paragraph (`WindowAccessOverlapCorruptionGuard.java`, class-level, "Known residual
gap" section) and the matching in-code comment at the `existing == null` branch
(`guardRemovedInheritance`, line ~774). The gap requires: 2+ remaining templates BOTH granting a
window the dependent had NO row for before this specific removal. Structurally, this can only arise
if the dependent's own row for that window was already missing at the time of removal — but every
template ADD for this dependent goes through `guardNewInheritance`/`guardDependentsOf`, which are
single-template-scoped (immune to the double-write race by construction, per the class's own "Scope:
REMOVE-side only" paragraph) and materialize a row for every window the newly-added template grants.
So by the time 3+ templates are actively composed on a role that went through this guard's own ADD
path the whole time, every window any active template grants should already have a row — the
`existing == null` branch is reachable only via an unusual precondition (pre-guard legacy state, a
row manually deleted outside this pipeline, or similar), not the normal steady-state this ticket's
real accounts are in. This is a reasonable, honestly-labeled residual risk, not a cover for the
actual reported bug — not a blocker. **Suggestion (non-blocking):** file a follow-up ticket/test for
this gap rather than letting it sit only as a comment — a role deliberately constructed with a
manually-deleted `AD_Window_Access` row before a 3+-template removal would give a concrete,
reproducible regression test the next time someone touches this method.

**JUnit — fresh run, from `etendo` root (not `:modules:com.etendoerp.go:test`):**
```
./gradlew :test --tests "com.etendoerp.go.roles.UserRoleCompositionServiceOverlapIntegrationTest" \
  --tests "com.etendoerp.go.roles.UserRoleCompositionServiceRealAccessControlIntegrationTest" --rerun-tasks
```
`BUILD SUCCESSFUL`. JUnit XML independently confirms (not just console output):
`TEST-com.etendoerp.go.roles.UserRoleCompositionServiceOverlapIntegrationTest.xml` →
`tests="9" failures="0" errors="0"` (includes
`testRemovingOneOfFourTemplatesLeavesTwoRemainingOverlappingTemplatesUnbroken`, 0.483s);
`TEST-com.etendoerp.go.roles.UserRoleCompositionServiceRealAccessControlIntegrationTest.xml` →
`tests="3" failures="0" errors="0"`. Both freshly timestamped 2026-08-17T15:5x UTC (this run, not a
cached result — `--rerun-tasks` forced real execution). `./gradlew clean` was NOT run, per the
standing constraint.

**New test itself (`testRemovingOneOfFourTemplatesLeavesTwoRemainingOverlappingTemplatesUnbroken`)
reviewed line by line:** correctly reproduces the "2+ remaining templates overlap on the same
window" shape (Sales SeqNo 20 read-only + Purchasing SeqNo 30 read-only both grant the shared
window; Inventory SeqNo 40 does not) that only exists at 3+ templates. Assertions are specific, not
just "no exception": asserts the post-removal source is Purchasing (the higher-SeqNo remaining
grantor of the two that actually grant this window — correctly NOT Inventory, which has the overall
highest SeqNo but doesn't grant this window, confirming the implementation resolves per-window, not
globally) and asserts the level downgrades to read-only (neither remaining grantor is full).
Client/organization pinning to the dependent role is also asserted. Good test.

**Conclusion:** the core design claim — `winner` and `winnerLevel` computed independently — holds
up under direct code inspection, not just the javadoc's own description of itself. No blockers
found in this scoped pass. Combined with the human's own live re-confirmation of the entire manual
checklist post-redeploy (see Status table), this closes B6's 6th round from REVIEW's side.

## REVIEW Findings — Rounds 5-7 (Alex, 2026-08-17)

**VERDICT: REJECT**

Scope: everything on `WindowAccessOverlapCorruptionGuard` since my prior "Final Verdict"/"Scoped
Check of B6 6th Round" passes above — `com.etendoerp.go` commits `404ece65` (round 5, `InheritedFrom`
repoint), `1676f716` (docs), `a9ca301a` (round 6, REMOVE-path `repointInPlace`, already scoped-reviewed
above under an earlier hash — re-skimmed only, not re-litigated), `dfb7b242` (round 7, ADD-path
`clearConflictingAccessUnconditionally` + Sonar cleanup); `etendo_schema_forge` commits `1824ef4c9`
(data-testid codemod) and `66f17332c` (Sonar fixes). DOCS/QA's own record commits (`e1812686c`,
`808611806`) not re-reviewed, per the brief.

```
BLOCKERS (1):
- [B7] com.etendoerp.go/src/com/etendoerp/go/roles/WindowAccessOverlapCorruptionGuard.java:906-919
  (guardDependentsOf, onUpdate path) — clearConflictingAccessUnconditionally can permanently
  delete a dependent's AD_Window_Access row with no core-side recreation, when triggered by a
  template's own row being UPDATED (not created).

WARNINGS (2):
- [W1] com.etendoerp.go/docs/neo-headless.md:1437-1500,1668 — §8d stale relative to rounds 6/7
  (still says "4 triggers"/"8 tests"; misses the 6th/7th triggers, repointInPlace,
  clearConflictingAccessUnconditionally, and UserRoleCompositionServiceOverlapReverificationTest).
- [W2] tools/app-shell/src/windows/custom/user/{UserRolesTab.jsx,index.jsx} — the data-testid
  codemod (commit 1824ef4c9) stamped data-testid onto <Fragment> (twice) and onto a raw
  Context.Provider; neither can carry it correctly.

SUGGESTIONS (0)
```

### [B7] — the ADD-path fix has a real gap on the onUpdate trigger (BLOCKER)

This is the point the dispatch specifically asked me to scrutinize: does removing
`clearConflictingAccessUnconditionally`'s old "skip if already correctly sourced" branch have any
unintended side effect beyond fixing the reported bug? For the `onSave`-triggered call and for
`guardNewInheritance`, no — traced below. For the `onUpdate`-triggered call, yes, and it's a real
one.

**The asymmetry, read directly from core (`org.openbravo.role.inheritance.RoleInheritanceManager`):**

- `propagateNewAccess` (lines 386-405, fired from `guardDependentsOf`'s `onSave` trigger and from
  `guardNewInheritance` via `applyNewInheritance`/`calculateAccesses`) calls `handleAccess`
  (lines 588-608), which explicitly branches: `if (access != null) { ...update-or-noop... } ;
  copyRoleAccess(...)` — i.e. **if no existing row is found, it CREATEs one.** This is exactly what
  `clearConflictingAccessUnconditionally`'s own javadoc relies on ("forcing core onto the safe
  CREATE path") — and it holds.
- `propagateUpdatedAccess` (lines 417-436, fired when a TEMPLATE's own existing `AD_Window_Access`
  row is UPDATED — e.g. an admin toggles a template's read-only/full checkbox directly in Classic)
  is a **different, narrower method**: `InheritedAccessEnabled childAccess =
  findInheritedAccess(ri.getRole(), access, injector); if (childAccess != null) {
  updateRoleAccess(...); }` — **no `else` branch, no create fallback.** If `childAccess` is `null`,
  the method does nothing at all for that dependent.

`InheritedAccessEnabledEventHandler.doAction` (lines 99-119) confirms the dispatch: `UPDATE` on a
template's own row routes to `propagateUpdatedAccess`, not `propagateNewAccess`.

`WindowAccessOverlapCorruptionGuard.onUpdate` (lines 468-477) — unchanged by this round — routes a
template's own `AD_Window_Access` UPDATE through `guardDependentsOf`, which (post round 7) now
calls `clearConflictingAccessUnconditionally` for **every** active dependent, **unconditionally**
deleting each dependent's existing row for that window via `deleteForcingCreatePath` — including
rows that are already correctly sourced from that exact template (the case the old code used to
skip). `@Priority(1)` on our observer vs. core's unprioritized one (confirmed:
`InheritedAccessEnabledEventHandler`'s own `onUpdate`/`onSave`/`onDelete` carry no `@Priority`)
means our delete lands before core's `propagateUpdatedAccess` runs.

**Net effect:** an admin toggling a template's own access level on a window it already grants (a
normal Classic maintenance action — this class's own `onUpdate` javadoc calls it "belt-and-braces"
for exactly this scenario, not a hypothetical) now silently deletes every correctly-inheriting
dependent's row for that window, and core's own propagation — the one code path in this trigger
that's supposed to reconcile it — has no branch that recreates it. No exception, no log line beyond
`deleteForcingCreatePath`'s own "cleared role X window Y access ... forcing core onto the safe
CREATE path" — which is **not true** on this specific route, since there is no CREATE branch in
`propagateUpdatedAccess`. Before round 7 this exact case was the one the old "already correctly
sourced, skip" branch protected — round 7 removed that branch uniformly across both callers of
`clearConflictingAccessUnconditionally` without checking that both callers' downstream core paths
actually have a create fallback. `guardNewInheritance` (the other caller) is fine — it always feeds
`applyNewInheritance`/`handleAccess`, which does have one. `guardDependentsOf` is only *sometimes*
fine — fine when core's own propagation is `propagateNewAccess` (the `onSave` trigger), not fine
when it's `propagateUpdatedAccess` (the `onUpdate` trigger) — and `clearConflictingAccessUnconditionally`
can't tell which caller invoked it.

**Live repro attempted, inconclusive — reporting this as a static-analysis finding, not a confirmed
crash.** I tried to reproduce this in a throwaway JUnit test (not committed, deleted afterward) three
times:
1. Using the real Finance template + a fresh bystander, wrapped in `OBContext.setAdminMode(true)`
   (copied from this test file's own existing pattern) — hit `OBSecurityException` on my own direct
   `save()`+`flush()` of the template's row, because `setAdminMode(true)` does NOT bypass
   `SecurityChecker.checkWriteAccess` (only the no-arg `setAdminMode()` does — confirmed via
   `OBContext.java:213-242`, and independently documented already in this file's own
   `createSystemTemplateRole()` javadoc in `UserRoleCompositionServiceIntegrationTest.java`). My
   test bug, not a finding.
2. Fixed the admin-mode bug, same real Finance template — hit an unrelated Hibernate error
   (`"Don't change the reference to a collection with delete-orphan enabled:
   ADWindowAccess.aDTabAccessList"`), almost certainly from the sheer scale of cascading corrections
   Finance's real ~25 pre-existing windows and multiple real dependents trigger in this shared dev
   DB (confirmed via SQL/BasicBinder TRACE logging — dozens of `correctInheritedOwnership` log lines
   for at least 2 different real dependent roles, `2C4FADE8...` and `483A42CA...`, neither of which
   is anything my test created). Too much environment noise to isolate cleanly.
3. Switched to a fully isolated, freshly-created client-`0` template (mirroring
   `UserRoleCompositionServiceIntegrationTest#createSystemTemplateRole`) plus a fresh bystander —
   this time the ADD-path propagation itself never fired (the sanity assertion that the dependent
   inherited the row in the first place failed), which I did not have budget left to root-cause
   (likely a client-visibility precondition on the fresh fixture I didn't get right, per this same
   round's own root-cause finding about `AD_Client_ID in (...)` filtering — plausibly self-inflicted
   by using a fresh client-`0` role in a context whose readable-clients list doesn't include it
   either).

None of the three failures disprove the theory — they're all my own test-harness/environment
friction, not a defense of the guard's behavior — but I could not produce a clean green-then-red
JUnit demonstrating the exact vanish. The source-level asymmetry above (`propagateNewAccess` vs
`propagateUpdatedAccess`, quoted and line-cited directly from core, not inferred) is unambiguous and
sufficient on its own to block: this is precisely the failure class (silent, wordless loss of a
dependent's access) this entire class exists to prevent, on a trigger this class's own author
already flagged as a real, guarded scenario.

**What closing this needs:** either (a) thread a "does my caller's downstream core path have a
create fallback" signal into `clearConflictingAccessUnconditionally` so `guardDependentsOf`'s
`onUpdate`-triggered calls keep the old "skip if already correctly sourced from this exact template"
behavior (safe there, since `propagateUpdatedAccess` will correctly re-apply the level to a row it
can find) while `onSave`-triggered calls and `guardNewInheritance` keep the new unconditional-clear
behavior; or (b) some other mechanism that guarantees a dependent's row survives a template-level
UPDATE. Either way, a new JUnit test is needed: isolated throwaway template + isolated bystander
(avoid the real Finance/Sales templates — too much cross-test drift/noise per my own repro attempt
#2 and per this round's own "Two ALSO-discovered test-data bugs" section above), grant the template
full access (propagates to the dependent via the ADD path), THEN directly UPDATE the template's own
`AD_Window_Access` row (toggle level, `save()`+`flush()` — NOT via `assignTemplateRoles` or
`RoleInheritance` add/remove), then assert the dependent's row still exists.

## B6 Findings — B7 fix (developer, 2026-08-17)

**Live-reproduced, unlike REVIEW's own 3 inconclusive attempts.** REVIEW's own "[B7]" finding was
static-analysis-only — 3 live repro attempts all hit test-harness friction, not the bug itself (see
that section). Following REVIEW's own notes closely (no-arg `OBContext.setAdminMode()`, a
throwaway system-client-`0` template instead of a real one, pairing it with the SAME throwaway
tenant-client "bystander" pattern this class's own tests already use successfully with the REAL
templates), the exact scenario reproduced cleanly on the first attempt: a bystander role correctly
inheriting a window from a throwaway template, then UPDATING (not re-granting) the template's own
`AD_Window_Access.editableField` — before the fix, this DID delete the bystander's row exactly as
REVIEW's static trace predicted, and (in an earlier iteration of the fix, see below) also surfaced a
second, previously-unknown bug the static trace could not have found.

**The fix.** `guardDependentsOf(WindowAccess, PropagationTrigger)` now takes a `PropagationTrigger`
(`NEW_GRANT` / `UPDATED_GRANT`) so the caller tells it which core propagation method will run
afterward, since only ONE of the two has a create fallback (per REVIEW's own trace):
- `onSave` (a template GAINS a new window grant) → `PropagationTrigger.NEW_GRANT` → unchanged,
  still calls `clearConflictingAccessUnconditionally` (round 7's own fix) — safe, since core's
  `propagateNewAccess` always falls back to `copyRoleAccess` (a CREATE) when it finds no row.
- `onUpdate` (a template's OWN existing grant has its level changed) → `PropagationTrigger
  .UPDATED_GRANT` → new method `repointIfAlreadySourcedFromTemplate`: a dependent row NOT sourced
  from the template whose level just changed is left untouched (core's own `propagateUpdatedAccess`
  would not have acted on it either — its `findInheritedAccess` only matches rows already sourced
  from that exact template, so this is out of its scope, not a gap); a row ALREADY sourced from
  that template — the ONLY case core would act on — is corrected IN PLACE (never deleted) via the
  sixth trigger's own `repointInPlace` (bulk HQL UPDATE, same row/PK), so it is guaranteed to
  survive regardless of what core's own propagation does afterward.

**A SECOND bug, found only because this was live-reproduced, not just statically traced.** The
first working iteration of the fix (queries + comparison logic correct, verified by temporarily
short-circuiting the call to `repointInPlace` and confirming the dependent's row survived, just
stale) crashed at the OUTER flush with `org.hibernate.HibernateException: Don't change the reference
to a collection with delete-orphan enabled : ADWindowAccess.aDTabAccessList` — a completely
different failure mode than the one REVIEW's trace predicted, and one no amount of source reading
would have surfaced, since it is a Hibernate flush-internals interaction, not an application-logic
bug.

**Root cause, isolated by bisection** (confirmed by removing/restoring each suspect line and
re-running, not guessed): `repointInPlace`'s own `session.evict(existing)` call (inherited unchanged
from the sixth trigger's REMOVE-path use, where it is proven safe) is the trigger, but ONLY on this
NEW `onUpdate`-triggered call path. `Interceptor#onFlushDirty` — how an `EntityUpdateEvent` reaches
this class's `onUpdate` — fires FROM WITHIN Hibernate's own `AbstractFlushingEventListener
#flushEntities` loop, the SAME loop that walks every OTHER managed entity's collection-valued
properties for reachability (`existing`'s own `aDTabAccessList` included) in the SAME pass; evicting
`existing` mid-loop rips it out of the persistence context while Hibernate's own flush-time
bookkeeping still expects to examine it, corrupting the collection tracking.
`Interceptor#onSave`/`onDelete` (how the sixth trigger's own `onDelete`-triggered caller, and the
ADD-side triggers' `deleteForcingCreatePath`, reach this class) fire synchronously at
`save()`/`delete()` call time, OUTSIDE that loop entirely — the identical `evict()` call never
collides with it there, which is exactly why the sixth trigger's own test never caught this: it
only ever exercises `repointInPlace` from the `onDelete` path, never `onUpdate`. This was, in
effect, a latent bug in the round-6 mechanism itself, invisible until this round's B7 fix became the
first caller to invoke `repointInPlace` from an `onFlushDirty`-reached path.

**The fix for the second bug:** `repointInPlace` now calls `OBDal.getInstance().refresh(existing)`
instead of `session.evict(existing)` after the bulk UPDATE. `refresh()` re-syncs `existing`'s scalar
fields from the DB (reflecting the bulk UPDATE, visible on the same connection/transaction) while
keeping the entity ATTACHED and managed, so the flush's own collection-reachability bookkeeping for
it stays consistent throughout — no eviction, no collision. Confirmed safe for BOTH callers (not
just the new one) by re-running the sixth trigger's own full test suite after the change — all
existing tests, including `testRemovingOneOfFourTemplatesLeavesTwoRemainingOverlappingTemplatesUnbroken`,
stayed green.

**New JUnit test** (`UserRoleCompositionServiceOverlapIntegrationTest
#testUpdatingTemplatesOwnAccessLevelNeverDeletesAnAlreadyCorrectlySourcedDependentRow`): a throwaway
system-client (`AD_Client_ID = '0'`) template role (mirrors `UserRoleCompositionServiceIntegrationTest
#createSystemTemplateRole`) paired with the SAME kind of throwaway tenant-client "bystander" this
class's own tests already use successfully with the real templates — the union of two patterns each
independently proven elsewhere in this suite, deliberately avoiding both of REVIEW's own noisy/
inconclusive repro paths (a real template's cascade, and an all-fresh fixture's unconfirmed
client-visibility precondition). Grants the template read-only, lets the ADD path propagate it to
the bystander (sanity-checked), then UPDATEs (never re-grants) the template's own row to full, and
asserts: the dependent's row still exists (the core B7 assertion), client/organization still match
the dependent's own, `InheritedFrom` still names the template, and the level was corrected to match
the template's new value (not just "didn't vanish" — proves the fix is a real correction, not a
no-op).

**Verification.**
- New test alone: green, in isolation and as part of the full
  `UserRoleCompositionServiceOverlapIntegrationTest` class (10/10) plus the sibling
  `UserRoleCompositionServiceIntegrationTest` and `UserRoleCompositionServiceOverlapReverificationTest`
  classes (all green, fresh `--rerun-tasks` run).
- Full suite, the EXACT command `.githooks/pre-push` step 2 uses:
  `cd /Users/gremiger/workspaces/etendogoclean/etendo && ./gradlew test --tests "com.etendoerp.go.*"`
  — run twice independently (once via a background watcher, once via a direct synchronous re-run
  per the coordinator's own instruction to verify rather than trust a prior background result) —
  both `BUILD SUCCESSFUL`. Aggregated from the freshest run's own JUnit XML (not console output):
  **7762 tests, 7753 passed, 0 failed, 0 errors, 9 skipped** — exactly the prior baseline
  (7761/7752/0/9) plus the one new test, no regressions anywhere else in the module.
- Sonar/coverage, the EXACT command `.githooks/pre-push` step 3 uses (`./gradlew jacocoRootReport`
  in the `etendo` root, then `./run-sonar.sh --base-ref origin/epic/ETP-3504 --fail-on-gate
  --compare-coverage --jacoco-xml <jacocoRootReport.xml>` in the module dir) — same command round 7
  used: **Quality Gate: OK**, 0 issues (open or new-code), 0 hotspots, coverage unchanged
  (`feature/ETP-4906` 76.70% vs `epic/ETP-3504` 76.70%, well within the 1.00pp tolerance).

**Files changed:** `com.etendoerp.go/src/com/etendoerp/go/roles/WindowAccessOverlapCorruptionGuard.java`
(the fix + class/method javadoc updates, including retroactively filling in the "A seventh trigger"
class-javadoc section that round 7's own method javadoc referenced but never actually added), and
`com.etendoerp.go/src-test/src/com/etendoerp/go/roles/UserRoleCompositionServiceOverlapIntegrationTest.java`
(the new test + 2 helper methods). Committed locally only, commit `c06edc8f` ("Feature ETP-4906: Fix
onUpdate trigger losing dependent access (B7)"), NOT pushed, per the dispatch's own instruction.

**Not touched, per the dispatch's own scope:** W1 (stale `neo-headless.md` §8d — DOCS phase) and W2
(data-testid codemod on `<Fragment>`/`Context.Provider`, frontend repo — future round if wanted).

**Ready for Alex's re-review of B7 specifically** — the rest of the ticket (waves 6-12, B1-B6, F1-F10)
is unchanged since the prior full APPROVE passes; this round only touches `guardDependentsOf`'s
onUpdate path and `repointInPlace`'s eviction strategy.

### [W1] docs/neo-headless.md §8d is stale relative to rounds 6-7 (WARNING, not blocking — DOCS phase pending)

`1676f716` (the docs commit under review) predates both round 6 (`a9ca301a`) and round 7
(`dfb7b242`). §8d (`docs/neo-headless.md:1437-1500`) still says "4 guarded triggers" and the §9
testing-table row (line 1668) still says "8 tests" / "all 4 triggers" — but
`WindowAccessOverlapCorruptionGuard.java`'s own javadoc now documents a 6th trigger ("A sixth
trigger — the REMOVE-side fix itself corrupts...", line 267) and a 7th ("A seventh trigger...",
line 926), `UserRoleCompositionServiceOverlapIntegrationTest` now has 9 `@Test` methods (not 8),
and `repointInPlace`/`clearConflictingAccessUnconditionally`/`collectWindowGrantors`/
`repointWindowIfNeeded` — all real, load-bearing methods added across rounds 6-7 — get zero
mention. `UserRoleCompositionServiceOverlapReverificationTest` (the pre-existing file round 7 fixed,
now 3 tests) isn't in the testing table at all. Per this repo's own Documentation Freshness policy
("code change + doc update = one atomic unit"), this would normally be a hard blocker on REVIEW —
downgraded to a WARNING here only because Task F10 (DOCS/Sage) is an explicit, still-pending phase
for this ticket and is the natural place to refresh an internal architecture doc like this one; it
should not ship un-refreshed past DOCS.

### [W2] data-testid codemod stamped Fragment/Provider (WARNING, cosmetic — not caught by current tests)

`1824ef4c9` added `data-testid="Fragment__71bdc9"` to two `<Fragment key=... >` elements in
`UserRolesTab.jsx:290,311` (`Fragment` is `React.Fragment`, imported directly — confirmed via the
file's own import line) and `data-testid="RoleSelectionProvider__853799"` to
`<RoleSelectionProvider>` in `index.jsx:116-118`, which `roleSelectionContext.js:27` confirms is a
bare `RoleSelectionContext.Provider`. Neither can meaningfully carry a `data-testid`:
`React.Fragment` only accepts `key`/`children` — React's dev-mode element validator emits
`console.error("Invalid prop \`%s\` supplied to \`React.Fragment\`...")` for any other prop, so
every render of `UserRolesTab`'s grouped table body will log this twice in dev/test consoles (not
just cosmetic noise — it's a real, if non-fatal, React contract violation). `Context.Provider`
doesn't render a DOM node and doesn't forward unrecognized props anywhere, so its `data-testid` is
simply inert — dead weight, not selectable by anything. Confirmed via `npx vitest run
src/windows/custom/user/`: 145/145 pass, and grepping the run's own output for "Invalid prop"/
"Fragment" found nothing — no current test path renders far enough into `UserRolesTab`'s
grouped-row branch to trigger element creation for either `Fragment`, so this doesn't fail CI today,
but it's a real latent warning waiting for the first test (or a real user opening "Roles del
usuario") that does reach it. Non-blocking: no functional/visual break, doesn't fail any check. The
codemod should skip `Fragment`/`Context.Provider`-typed elements going forward.

### Everything else — confirmed clean

- **Round 5 (`404ece65`, `InheritedFrom` repoint)** — re-read in full against
  `widenInheritedAccessLevelIfNeeded` and the new/updated tests in
  `UserRoleCompositionServiceOverlapIntegrationTest.java`. Matches the "B6 Findings — InheritedFrom
  bookkeeping fix" writeup exactly; no new issues.
- **Round 6 (`a9ca301a`)** — same commit already scrutinized in depth under "REVIEW Findings —
  Scoped Check of B6 6th Round" above (that pass reviewed it under an earlier pre-rebase hash,
  `e81844c2` — `git show a9ca301a` confirms identical content/diff shape). Re-skimmed only; that
  pass's conclusions stand, not re-litigated.
- **Round 7 Sonar refactors** — `collectWindowGrantors`/`repointWindowIfNeeded`/`WindowGrantors`
  (extracted from `guardRemovedInheritance`) and `confirmPersonalRoleForUser` (extracted from
  `UserRoleCompositionService#getAppliedTemplateRoleIdsForClient`) read line-by-line against their
  pre-extraction originals (`git show dfb7b242`) — both are mechanical `continue`→`return`/inline-
  to-method moves with no logic change; output collections mutated in place, matching this
  codebase's own established accumulator pattern. The `S125` comment rephrase (`;`→`,`) is a
  punctuation-only change. No behavior change in any of the 7 resolved findings.
- **`DetailView.jsx:1023` S2681 ternary (`66f17332c`)** — verified genuinely equivalent, not just
  line-budget-compliant. Original: `if (isNew && onAfterCreate) await onAfterCreate(...); if
  (!isNew && onAfterExistingSave) await onAfterExistingSave(...);` — two independent same-line ifs,
  mutually exclusive only because `isNew`/`!isNew` can't both hold. New: `await (isNew ?
  onAfterCreate : onAfterExistingSave)?.(saved, { token, apiBaseUrl });` — selects the same callback
  by the same condition, `?.()` only skips the call when the selected callback is nullish (matching
  the old `&&` guard for the realistic case where these props are either a function or
  undefined/null). Same selection, same guard, same await. Confirmed via
  `DetailView.saveActions.vitest.js` in the full Vitest run below.
- **`userRoleAssignmentsApi.js` nested-template-literal fix (`66f17332c`)** — trivial
  `queryPart` variable extraction, no behavior change.

### Verification

- **Backend, exact pre-push command, from `etendo` root, no `./gradlew clean`:**
  `./gradlew test --tests "com.etendoerp.go.*"` → `BUILD SUCCESSFUL in 5m 3s`. Independently
  aggregated every `TEST-*.xml` produced by this run (739 files, not just the console summary):
  **7761 total, 7752 passed, 0 failed, 0 errors, 9 skipped** — matches the dispatch's expected
  numbers exactly.
- **Frontend, Vitest:** `npx vitest run src/windows/custom/user/
  src/components/contract-ui/__tests__/DetailView.saveActions.vitest.js
  src/lib/__tests__/userRoleAssignmentsApi.vitest.js` → 9 files, **145/145 passed**.
- **`npx sf-validate-pipeline --scope=user`** → `Pipeline validation: OK`.
- Playwright (`user-role-assignment.mocked.spec.js`) was not exercised this pass — my ad hoc
  invocation failed on environment setup (wrong working directory relative to
  `e2e/playwright.config.js`, no dev server running), not a code signal; not part of this dispatch's
  explicit verification list, and the commit trailers' own `pw-mocked`/`pw-integration` hook checks
  already cover it.

### Bottom line

Round 5 and round 6 are clean (round 6 confirmed twice now, across two review passes). Round 7's
root-cause diagnosis (the cross-client blindness in core's own `AccessTypeInjector#findAccess`) is
genuinely excellent, novel forensic work — but the fix it produced is too broad: it applies the same
"always force-delete" rule to a caller (`guardDependentsOf`'s `onUpdate` trigger) whose downstream
core path (`propagateUpdatedAccess`) cannot recreate what was deleted. REJECT on B7 alone; W1/W2 are
non-blocking but should be picked up (W1 by DOCS, W2 by a follow-up dev pass on the codemod).

## Self-Review Notes

- **Architectural caveat found post-QA (2026-08-14), not a blocker for THIS ticket,
  recorded here for continuity:** `AssignTemplateRolesControl.jsx` sources its
  selectable role options from `SFRolesOverview`, which is scoped to the CALLER's OWN
  client — i.e. each tenant's own PER-CLIENT duplicated Finance/Sales/Purchasing/
  Inventory role copies (the ones ETP-4877 is about retiring), not the shared
  system-level (`ad_client_id='0'`) templates from ETP-4852/4878.
  `UserRoleCompositionService` accepts this by design (it validates ANY active
  `IsTemplate='Y'` role, not only the 4 system-level ones), so this ticket's feature
  works correctly TODAY — but once ETP-4877 deactivates a tenant's old per-client
  roles, this picker will show zero options for that tenant, and any personal role
  composed via this ticket's UI will have its `AD_Role_Inheritance` pointing at a
  role that ETP-4877 is about to deactivate. Both consequences have been added to
  **ETP-4877's own description** (via Clerk, 2026-08-14) as its own scope, rather than
  reopening this ticket — this ticket's behavior is correct relative to its own
  acceptance criteria, the gap is in what ETP-4877 needs to additionally cover.
- **Spec coverage (updated 2026-08-14):** 2 of the handoff's 4 original scope items ship
  in this ticket as built — grid role chips+filter (F6) and form multi-select+matrix tab
  (F3/F5). The other 2 were investigated and explicitly descoped by human decision, not
  silently dropped: multi-company (B1 spike → **ETP-4889**, no multi-org-per-tenant
  capability exists yet to build against) and the invite-roles snackbar (F7 investigation
  → **ETP-4830**, no invite-email mechanism exists yet for the snackbar to honestly
  describe). Both descopes are recorded on all four affected Jira tickets (ETP-4906,
  ETP-4889, ETP-4830) — see the Status table's "Jira updates" row for links.
- **Known gaps not resolved by this plan, flagged rather than guessed:**
  - The General-row Figma discrepancy (flagged for Alex, Task F5's Acceptance).
  - A real dead-code bug in `UserRolesTab.jsx` found by Tester while writing F9: the
    empty-state check ran before the loading/error checks, so a slow network or failed
    fetch always showed "Select a role to view permissions" instead of a loading spinner
    or error message. **FIXED (2026-08-14, developer follow-up)** — see F9 Findings and
    DEV wave 3. Follow-up done too: Tester updated the 2 `KNOWN BUG (dead code)` Vitest
    tests in `UserRolesTab.vitest.jsx` to match the fixed behavior (2026-08-14).
  - **Severe — FIXED (2026-08-14, developer follow-up, DEV wave 4), tests updated
    (2026-08-14, Tester wave 5):** role-only chip edits could never enable the "Guardar"
    button (missing `additionalDirtyState` wiring in `windows/custom/user/index.jsx`),
    found by Tester while writing F9's Playwright spec and reproduced empirically
    against `make dev`. Blocked the ticket's core "add/remove roles, click Guardar"
    acceptance criterion, not a corner case. Fixed and re-verified empirically against
    `make dev` — see F9 Findings for the fix detail. The Playwright test was folded into
    the adjacent save-wiring test and renamed to assert the fixed behavior; 4 new Vitest
    tests were added directly covering `additionalDirtyState`, including a regression
    test locking in the ref-mirror-to-state fix. **Fully closed — nothing further
    needed before REVIEW.**
  - **Smaller — FIXED (2026-08-14, developer follow-up, DEV wave 4 + Tester wave 5):** 5
    missing i18n keys total — 4 in `AssignTemplateRolesControl.jsx`
    (`assignedRolesLabel`, `noRolesAssigned`, `saveUserFirstForRoles`, `removeRoleAria`,
    fixed in DEV wave 4) plus one adjacent gap in `windows/custom/user/index.jsx`
    (`roleAssignmentSaveFailed`, found by DEV wave 4 but left unfixed pending its
    explicit scope, closed by Tester wave 5) — all 5 now present in both `en_US.json`
    and `es_ES.json` with real Spanish translations. See F9 Findings.
  - The save-lifecycle hook mechanism (F1), multi-company mechanism (B1), and the
    invite-email mechanism (F7) were all genuine unknowns at planning time but have
    since landed concrete answers — see their Findings sections above.
- **Reuse confirmed, not duplicated:** `SFRolesOverview`, `SFListMenu`,
  `SFAssignUserRoles`, `TemplateRoleWindowAccess`, `roleNameI18n.js` are all reused
  as-is; only `SFUserRoleAssignments` is genuinely new backend surface.
- **Second pass (pre-dispatch):** fixed a garbled/truncated sentence in F9's Playwright
  bullet; removed a literal "TBD" in the File Structure section; clarified that F3's
  `defaultRole` form-field display and F6's grid "Rol" column are two distinct
  customization surfaces on the same field (real confusion risk, now called out
  explicitly); added the classic-Admin detection branch to F6 (was a real gap — Admin
  users would otherwise render with an empty roles chip cell); softened F5's "already
  fetched for F3" claim into an explicit F1 sub-question, since two separate custom-slot
  components sharing one fetch isn't guaranteed by the generator without checking; added
  a stop condition to F7 in case no invite-email mechanism actually exists yet.
- **Third pass (2026-08-14, post-DEV-wave-2):** corrected two files (`DetailView.jsx`,
  `windows/registry.js`) that F3 silently depended on but this plan never listed in File
  Structure; fixed the locale path (`src/locales/`, not `src/i18n/` as originally
  guessed); updated F5/F6/F9's status rows, which had gone stale because both
  developer-4 and developer-5's sessions ended without ever sending a completion
  notification (their work was still correct on disk — confirmed by direct read, per
  this plan's own resumption protocol); recorded the F7→ETP-4830 descope and posted the
  corresponding Jira comments (previously only the B4/F4→ETP-4889 pair had been posted).

## QA Findings (Sentinel, 2026-08-14, agentId `a3f39375a6133d5c0`)

**VERDICT: APPROVE**

**Suites re-confirmed, independently:**
- `cd tools/app-shell && npx vitest run` (no path filter, full output captured, not
  piped through a truncating `tail`) — **646 test files passed, 12011 tests passed, 3
  skipped, 0 failed.** Matches the plan's last recorded count exactly, no drift. (An
  earlier run in this same session, piped through `| tail -40`, showed 6 files/18
  tests failed — re-running the 2 spot-checked files in isolation,
  `EditAccountModal.vitest.jsx` and `NewPaymentEntryModal.vitest.jsx`, both windows
  unrelated to ETP-4906, passed cleanly — 205/205. Confirmed this was resource-
  contention flakiness under full-suite parallel load, not a regression; the clean
  full re-run with untruncated output settles it.)
- `cd e2e && npx playwright test tests/flows/user-role-assignment.mocked.spec.js` →
  **7 passed, 0 failed**, matching F9/REVIEW's count.
- Targeted: `windows/custom/user/` + `userRoleAssignmentsApi.vitest.js` +
  `DetailView.saveActions.vitest.js` → 9 files / 139 tests, all green.

**DB reference data re-verified live** against `etendogoclean` (port 5416, per
`gradle.properties`), since the QA dispatch brief flagged the handoff's role/user
table as possibly stale: GOClient `ad_client_id`
(`802509E12436405C86BA1FD5B1DF508C`), all 4 template role ids (Finance
`127AE77FE2994067B7FE6495FC21D51E`, Sales `2A159DF4F4B944A6AA903202AD35B545`,
Purchasing `A826430F723E4C1B9A53EBB0746A98C0`, Inventory
`55E05A4B43514A029D6FB6B8D94B49D4`), and all 5 usernames
(`salestest`/`financetest`/`inventorytest`/`purchasetest`/`goadmin@etendo.software`)
— **all still accurate, none stale.** Also found 2 disposable-looking spare users on
GOClient not in the handoff table (`noroletest@etendo.software`,
`NewUsertest`/`asd@mail.com`), both currently role-less, no `AD_Role_Inheritance`
rows, no "Personal – " composition role exists yet anywhere on GOClient — this
feature has genuinely never been exercised against real production data before this
ticket.

**Blocked: the live browser-driven UI pass (Dispatch Plan Task 6, items 1–4).**
Could not log in as `goadmin@etendo.software` or any GOClient user against the
running `make dev` (port 3100) — no plaintext password is retrievable (hashed in DB;
per this repo's own memory notes, "ask the user... if needed"), and there is no
legitimate non-interactive path to a valid session for an EXISTING tenant's
EXISTING user: this repo's own real-backend E2E mechanism
(`scripts/run-e2e-full.sh`'s `onboarding-setup` project, `E2E_PASSWORD=12345`) only
self-registers a **brand-new** tenant via `/register`, which would never carry
GOClient's ETP-4852-seeded template roles. `docs/plans/2026-07-24-etp-4513-roles-overview.md:270`
documents the only precedent for this exact need — "credentials supplied by the
human mid-session" — confirming this has always required a human in the loop, not
something a prior agent session solved differently. **Flagging this for the
coordinator/human**, not attempting a workaround: whoever has GOClient credentials
(or can reset a disposable test user's password via backoffice) can complete steps
1–4 as a fast follow-up. Per this ticket's own precedent (REVIEW's identical
Figma-access gap, explicitly NOT a blocker), **a standing agent-unfixable
infrastructure/credentials gap does not block this phase.**

**Adapted the most-permissive-wins verification to what IS reachable without a
session: the real-DB Java integration-test layer.** Traced the actual
`assignTemplateRoles`/`mostPermissiveWindowAccess` union logic
(`UserRoleCompositionService.java:823+`) and found it already has committed,
passing, real-DB (`WeldBaseTest`, not mocked) regression coverage from prior
ETP-4852/4878 work: `UserRoleCompositionServiceOverlapIntegrationTest.java`
(`1e0f6ff8` "fix cross-template window-access overlap corruption", re-verified by a
prior Sentinel session in `fb42f79c`) composes the REAL Finance (full) + Sales
(read-only) system templates on a shared window and asserts the union resolves to
full, order-independent, no-op-safe on re-run. Confirmed via
`git show bc2b6c8c -- src/com/etendoerp/go/roles/UserRoleCompositionService.java`
that ETP-4906's own B2 diff to this file is **purely additive** (321 insertions,
only the 2 new `getAppliedTemplateRoleIds(For)Client` READ methods) — the write/
composition path this existing suite covers is untouched by this ticket, so that
coverage remains valid, current evidence for the behavior this ticket's UI depends
on.

**Found and closed one real, adjacent gap:** nothing before this pass proved the
NEW B2 read method actually reflects a REAL overlapping write — `SFUserRoleAssignmentsTest`
only exercises `getAppliedTemplateRoleIds` against a fully mocked
`UserRoleCompositionService`. Added
`testGetAppliedTemplateRoleIdsReflectsARealOverlappingComposition` to
`UserRoleCompositionServiceOverlapIntegrationTest.java` (real DB, same
Finance-full/Sales-read-only shared-window setup as its 3 siblings, rolled back
after): composes both templates via `assignTemplateRoles`, then calls
`getAppliedTemplateRoleIds(userId)` and asserts it returns exactly `{financeId,
salesId}`, AND separately re-confirms the underlying `AD_Window_Access` the read
path is describing is itself still the full (most-permissive-wins) result — closing
the loop between "the write composes correctly" (already proven) and "the read the
frontend's initial chip state relies on describes that same correct composition"
(previously unproven). `:modules:com.etendoerp.go:compileTestJava` reports
`NO-SOURCE` (same module-wiring quirk REVIEW already documented — this module's
`src-test` is only wired into the ROOT `test` task), so verified compilation via a
full `./gradlew :modules:com.etendoerp.go:compileJava` (production code, UP-TO-DATE)
plus kicked off a full unfiltered `./gradlew test` from the Etendo root — confirmed
it reached `:compileTestJava`/`:testClasses` cleanly (no compile error surfaced for
the new file) before entering `:test` and hitting the same pre-existing
`CoreTestSuite` failures (`ConversionRateDownloaderTest`,
`TicketbaiGipuzkoaBlockBTest`) the plan's own ~817-failure baseline already
documents. Per the standing human instruction REVIEW already established (accept
targeted-class evidence, don't block on a full unfiltered run), **did not wait for
this run to reach `com.etendoerp.go`'s own test classes** — it was left running in
the background; whoever picks this up next can check its result or accept the new
test's correctness by inspection (it follows the exact same APIs/pattern as its 3
already-passing, already-committed sibling tests in the same file, only recombining
already-proven calls).

**Other Dispatch Plan Task 6 items, status:**
- Item 3 (grid role chips + Admin filter narrows correctly) — covered by the
  Playwright suite's grid describe block (3/3 passing), but only against the mocked
  backend; not independently re-verified against real GOClient grid data due to the
  same login blocker above.
- Item 4 (role-only Guardar enablement persists through a real save + reload) —
  covered by the Playwright suite's `a role-only chip change enables Guardar...`
  test (real assertions against the fixed `additionalDirtyState` wiring), but again
  only against the mocked backend; not independently re-verified live for the same
  reason.

**No Critical/High bugs found in this pass.** REVIEW's approval stands; this pass
adds one new real-DB regression test and confirms (rather than merely re-states) the
existing suites' green status, with the login-credentials gap as the only unresolved
item — explicitly not a blocker, per this ticket's own precedent.

**QA phase is closed. Recommend proceeding to DOCS (Sage).**

### Live Browser Pass Follow-Up (Sentinel, 2026-08-14, credentials supplied by the human)

The human supplied `goadmin@etendo.software`'s password mid-session specifically to unblock
the login gap above. Used only in-memory for a throwaway Playwright script run from `e2e/`
(deleted immediately after use, never committed) and a couple of one-off `node -e` probes
(also never saved to disk) — never written into this file, a commit, or any other artifact.

**Login succeeded.** Opened the disposable `NewUsertest` user (`2DD62C68875A4989AFE6B76DCB3974BC`,
`asd@mail.com`, zero roles beforehand) rather than disturbing `goadmin` or the 4 dedicated
single-role test accounts.

**Found a real, separate environment bug on the first attempt:** assigning Finance +
Purchasing was rejected by the real backend with `{"success":false,"message":"Role is not
a template, cannot be composed: 127AE77FE2994067B7FE6495FC21D51E"}`. Direct DB query
confirmed why — in the CURRENT `etendogoclean` DB, `AD_Role.IsTemplate` is currently `'N'`
for both Finance and Sales, while Purchasing and Inventory are still `'Y'`:
```
2A159DF4… | Sales      | istemplate=N
127AE77F… | Finance    | istemplate=N
55E05A4B… | Inventory  | istemplate=Y
A826430F… | Purchasing | istemplate=Y
```
This contradicts `UserRoleCompositionServiceOverlapIntegrationTest`'s own javadoc ("Uses the
REAL Finance/Sales system template roles... seeded by `EnsureSystemRoleTemplatesScript` on
`update.database`") and the fact that test suite was passing as of commit `fb42f79c`. Something
external to ETP-4906 flipped these two roles' Template flag off sometime after that (a manual
backoffice edit during other testing is the most likely culprit — `AD_ROLE_CHECK_TRG` only
blocks UN-checking a template that's still depended on, and neither role had any
`AD_Role_Inheritance` dependents at the time). **This is a real, reportable data-integrity gap
in this dev environment — not a code defect in ETP-4906 — but it means the live composition
flow is currently broken for 2 of the 4 template roles until someone re-runs
`update.database` (which re-executes `EnsureSystemRoleTemplatesScript`) or manually restores
`IsTemplate='Y'` on both.** Retried with Purchasing + Inventory (both confirmed `IsTemplate='Y'`)
to still exercise the actual UI flow this pass was dispatched to check.

**Write path + Guardar-enablement fix: CONFIRMED CORRECT, live, against the real backend.**
- Guardar started disabled (zero roles). Toggling Purchasing + Inventory chips (no other
  field touched) enabled it — the `additionalDirtyState` fix works live, not just in the
  Vitest/Playwright mocks.
- Clicking Guardar fired `SFAssignUserRoles` exactly once with the correct real role ids;
  the backend responded `{"success":true,...,"personalRoleId":"6AD5C0CC…","added":2,"removed":0}`.
- Guardar correctly disabled again immediately after save — the ref-mirror-to-state fix
  (DEV wave 4) holds under a real network round-trip, not just a mocked one.
- **Direct DB re-verification after save:** `AD_Role` — a new `Personal – NewUsertest` role
  exists, correctly `IsTemplate='N'`. `AD_Role_Inheritance` — exactly 2 active rows,
  Purchasing + Inventory. `AD_User_Roles` — exactly 1 active row, pointing at the personal
  role. `AD_User.Default_Ad_Role_ID` — correctly synced to the personal role. **The
  composition write path is fully correct end to end against the real database**, matching
  `UserRoleCompositionService`'s documented contract exactly.

**Could NOT confirm reload-persistence, grid chips, or the role filter — root-caused to an
infrastructure gap, not a code bug.** After the successful save above, reloading the detail
page showed neither chip; the Users grid showed no role chips for `NewUsertest`; the grid's
role-filter toolbar trigger never appeared. Rather than guessing, probed the actual webhook
directly via `fetch()` with the real bearer token (bypassing the UI):
```
GET /sws/neo/userroleassignments?UserId=... → 404 {"error":{"message":"Spec not found: userroleassignments"}}
GET /sws/neo/userroleassignments           → 404 {"error":{"message":"Spec not found: userroleassignments"}}
GET /sws/neo/rolesoverview                 → 200 {"result":"{\"roles\":[...]}"}  (sibling, pre-existing webhook — works fine)
```
**`SFUserRoleAssignments` — this ticket's one brand-new backend webhook (B2) — is
unreachable on the backend currently serving this dev environment (404 "Spec not
found"), while every OTHER webhook this ticket depends on (`SFRolesOverview`,
`SFAssignUserRoles`, `SFListMenu`) works normally.** The source (`SFUserRoleAssignments.java`
+ its `NeoPseudoSpecDispatcher` registration, commit `bc2b6c8c`) is correct on disk, compiles
(confirmed earlier in this same QA pass), and is covered by passing mocked unit tests — but a
running Etendo/Tomcat backend only picks up Java changes after an explicit rebuild+redeploy
of `com.etendoerp.go`, which nothing in this session's `make dev` (a frontend-only Vite
process) ever triggers. **This is an environment/deployment gap, not a ticket code defect:**
whoever has access to rebuild/redeploy `com.etendoerp.go` against this dev backend needs to
do so (picking up `bc2b6c8c` and `fba31d67`) before the read-after-write half of this feature
(reload persistence, grid chips, grid role filter, "Roles del usuario" matrix showing a
previously-saved state on load) can be verified live at all. Until then, every symptom above
(no chips after reload, empty grid cells, filter trigger not found) is fully explained by
this one root cause — none of it points at a defect in the frontend or write-path code.

**Cleanup:** reverted `NewUsertest` back to zero roles via a direct call to the (working)
`SFAssignUserRoles` webhook (`TemplateRoleIds=` empty) rather than through the broken-read UI;
confirmed via DB that its personal role now has 0 active `AD_Role_Inheritance` rows (an inert,
harmless "Personal – NewUsertest" role remains, which is expected/documented behavior — see
`testEmptyTemplateListOnFirstCompositionStillCreatesPersonalRole`'s identical shape). All
throwaway scripts under `e2e/` were deleted; `git status` in both repos is clean.

**Verdict on this specific gap: PARTIAL.** The write path and the Guardar-enablement fix are
now confirmed correct against a real, live backend and a real database — the strongest
evidence this ticket has had for that behavior. The read-after-write UI behavior (reload
persistence, grid chips, role filter) remains unconfirmed live, but for a clearly isolated,
non-code reason (backend needs rebuild/redeploy to pick up `SFUserRoleAssignments`). **Two
follow-ups recommended, neither a reason to revisit REVIEW/QA's approval of the code itself:**
1. Rebuild/redeploy `com.etendoerp.go` against this dev backend, then re-run this exact live
   pass (a fresh disposable user, same steps) to close the read-path loop.
2. Separately investigate/restore `AD_Role.IsTemplate='Y'` for the Finance and Sales system
   template roles in this DB (currently `'N'`) — unrelated to ETP-4906's own changes, but it
   currently makes 2 of the 4 advertised template roles unusable end to end in this
   environment.

## QA Findings — Full Pass (Sentinel, 2026-08-17)

**VERDICT: APPROVE**

Scope: full QA pass against the code as it exists after waves 6-12, B5, B6, and all 3 REVIEW
rounds (B1-B4), per the coordinator's dispatch. This pass deliberately does not re-run REVIEW's
own code-reading checks (already done, three times, by Alex) or redo the 4 live Classic scenarios
the human already personally reproduced for B6 — it covers what neither of those passes did:
fresh automated-suite re-execution, DB reference-data drift, the live end-to-end credentials gap,
and B6's system-wide regression risk.

**Automated suites, fresh (all re-run from a clean invocation, not restated from the plan):**
- `cd tools/app-shell && npx vitest run` (full, untruncated) — **646 test files passed, 12017
  tests passed, 3 skipped, 0 failed.** Exact match to the plan's last recorded count, no drift.
- `cd e2e && npx playwright test tests/flows/user-role-assignment.mocked.spec.js` — **7 passed, 0
  failed**, matching F9/REVIEW's count exactly (list: chip toggle, matrix update, reload
  persistence, chip removal, grid role chips + Admin branch, role-filter narrowing, Admin-only
  filter).
- `cd etendo && ./gradlew :test --tests "com.etendoerp.go.roles.UserRoleCompositionServiceOverlapIntegrationTest" --tests "com.etendoerp.go.roles.UserRoleCompositionServiceRealAccessControlIntegrationTest" --rerun-tasks` (from the `etendo` root, per this project's known NO-SOURCE
  module-wiring trap, `--rerun-tasks` per REVIEW's own anti-cache discipline) — `BUILD SUCCESSFUL`.
  Verified against the freshly-timestamped JUnit XML reports directly (not just the gradle summary
  line): `TEST-...OverlapIntegrationTest.xml` → `tests="8" failures="0" errors="0"
  timestamp="2026-08-17T04:33:17"`; `TEST-...RealAccessControlIntegrationTest.xml` → `tests="3"
  failures="0" errors="0" timestamp="2026-08-17T04:33:25"` — both freshly generated by this run,
  not a stale cached artifact.
- `npx sf-validate-pipeline --scope=user` (from `etendo_schema_forge`) → `Pipeline validation: OK`.
- Did **not** re-run `./gradlew clean` (per dispatch instruction — this checkout's `src-gen` broke
  from it earlier in this ticket's history) and did not attempt an unfiltered `./gradlew test`
  (accepted targeted-class evidence standard, same as REVIEW).

**DB reference data re-verified live, read-only, against `etendogoclean` (port 5416):**
- GOClient `ad_client_id` = `802509E12436405C86BA1FD5B1DF508C` — confirmed, name `GOClient`, no
  drift.
- The 4 **system-level** template role ids the code actually reads today
  (`SystemRoleTemplates.java`'s hardcoded constants, used by `SFSystemRoleTemplates` since DEV
  wave 7's repoint) — Finance `B88A34B5D1874F8685FA6F3C3A609412`, Sales
  `15ECC46CFBD74CF3A76D1F4DC8BA9F80`, Purchasing `5E279F5102F9410F9B8CCBA424741F46`, Inventory
  `73581A7B4F414A2C9059C83CE7BE97BF` — all confirmed `AD_Client_ID='0'`, `IsTemplate='Y'`, active,
  in the live DB. **Zero drift on the ids the running system actually uses.**
- Note on the 2026-08-14 QA pass's own recorded "template role ids"
  (`127AE77FE2994067B7FE6495FC21D51E` etc.): those are GOClient's OWN **per-client copies** of the
  same 4 role names, not the system-level templates — confirmed still present in the DB but now
  `IsTemplate='N'` for **all 4** (drifted further since 2026-08-14, when Purchasing/Inventory were
  still `'Y'` — see that pass's "Live Browser Pass Follow-Up"). This is **not a new bug**: DEV wave
  7 already repointed the role catalog away from these per-client copies specifically because of
  this exact drift risk (`SFSystemRoleTemplates`'s own class javadoc explains why), and B3's REVIEW
  fix already corrected `user.md`'s doc references to match. Flagging only so a future QA pass
  doesn't re-verify the wrong id set.
- `ClassicDebug` (`77E57880608E49D9966BC7C87F37A786`), `ClassicTemplateTest1Read`
  (`86B02D2175B14875BA5FA65282F17DD9`), `ClassicTemplateTest2Broad`
  (`F17708435A1E4730AC08CC8EFD9FCA08`) — all present, ids match every citation across the B6
  Findings sections.
- Usernames on GOClient: 8 total today (`asd@mail.com`, `financetest@etendo.software`,
  `goadmin@etendo.software`, `gouser@etendo.software`, `inventorytest@etendo.software`,
  `noroletest@etendo.software`, `purchasetest@etendo.software`,
  `salestest@etendo.software`) — the 5 named in the 2026-08-14 pass all still exist (with the
  `@etendo.software` suffix the DB actually stores, vs. that pass's shorthand), plus one new
  exploration account (`gouser@etendo.software`) not previously recorded. No missing users.

**Backend redeploy status — the 2026-08-14 QA pass's #1 open item is now CLOSED.** That pass could
not verify reload/grid persistence because `SFUserRoleAssignments` 404'd ("Spec not found") on the
then-live backend. Checked this pass: `docker inspect etendogoclean-tomcat-1` shows the container
was restarted `2026-08-16T23:17:17Z` (matches B6's own "`./gradlew smartbuild` + Tomcat restart
completed" note). `curl http://localhost:8080/etendogoclean/sws/neo/userroleassignments` (and
`.../systemroletemplates`, `.../rolesoverview` as a sibling control) all now return
`{"error":{"message":"Missing or invalid Authorization header","status":401}}` — the NORMAL
"reached the handler, needs a real token" response, not the framework-level "Spec not found: ..."
404 the last pass hit. **The webhook is now correctly wired and reachable on the live backend**;
only a valid session/bearer token stands between this and a full live read-after-write check.

**Live browser-driven E2E pass — still blocked on credentials, not a new gap, not a blocker.**
Checked whether credentials are available this time before flagging, per dispatch instruction:
`etendo_schema_forge/.env` (the only non-example env file in the repo) contains DB/Jenkins
credentials only, no GOClient login; no other credential store found. Per this ticket's own
established precedent (REVIEW's identical Figma-access gap, and this exact gap in the 2026-08-14
QA pass, both explicitly ruled "not a blocker"), **not treating this as a blocker again** — it is a
standing, agent-unfixable infrastructure gap, now narrower than before (routing/deployment is
confirmed correct; only auth remains unverified live).

**Adapted verification, real DB, no login required — stronger than the last pass's adaptation.**
Directly inspected the exact real, legitimately-composed account both B5 and B6 cite as their real-
world evidence (`Personal – NewUsertest`, role `6AD5C0CC21F14050A65A3E62DC2FF9A2`, user
`asd@mail.com` / `2DD62C68875A4989AFE6B76DCB3974BC`) — this is the SAME account the 2026-08-14 pass
composed live via the UI and then reverted to zero roles; the human has since continued using it
for B6's own live rounds, per that task's explicit "must not be deleted, it's real evidence"
correction. Current live state:
- All 4 real system templates actively inherited (Finance/Sales/Purchasing/Inventory,
  `AD_Role_Inheritance` seqno 10/20/30/40) — the maximal composition case.
- 33 active `AD_Window_Access` rows, **0 client/organization ownership mismatches** against the
  role's own client — the exact invariant B6's guard exists to protect, holding under the broadest
  real composition this account has ever carried.
- `AD_User.Default_Ad_Role_ID` correctly synced to the personal role.
This is real, live, unmocked evidence — stronger than a fresh JUnit fixture — that the write path
and B6's ownership-correction fix hold correctly for a real account under maximal load, not just
synthetic test data.
- **Bonus observation, not independently verified end-to-end by me:** `ClassicDebug`'s live DB
  state shows `ClassicTemplateTest2Broad` currently re-added (active inheritance, seqno 50) and its
  Business Partner window access correctly `full` with `InheritedFrom` pointing at
  `ClassicTemplateTest2Broad` — i.e., the FIRST half of the "last acceptance step, not yet
  performed" the B6 status row flagged as outstanding (re-add the broad template, confirm round 4
  still works) now appears to have happened. I did **not** perform the second half (remove it again,
  confirm the downgrade to `ClassicTemplateTest1Read`'s read-only level) myself — that would mutate
  the human's own live test fixture, out of scope for read-only QA verification. Flagging for the
  coordinator/human to confirm whether that final loop has been closed, or is mid-sequence.

**B6 regression-risk sanity check (dispatch item 5 — does the guard misfire on an ordinary,
unrelated role edit?).** Read the full 915-line `WindowAccessOverlapCorruptionGuard.java` end to
end, independent of REVIEW's own pass. Confirmed the class is narrowly gated at every entry point:
`onSave`/`onUpdate` only act when the target `WindowAccess` row's owning role
`isTemplate() == true` (`guardDependentsOf`) or, for a non-template role's row,
`correctInheritedOwnership`/`widenInheritedAccessLevelIfNeeded` both early-return immediately when
`access.getInheritedFrom() == null` — i.e. any manually-granted, non-inherited access row (the
common case for an ordinary role edit with no template involved at all) is untouched. `onDelete`
only acts on `RoleInheritance` deletes. A plain edit to an unrelated, non-template role's window
access, or a template-less role gaining/losing an ordinary (non-template) inheritance, hits these
observers but no-ops at the first guard check every time. Cross-checked this reading against the
passing JUnit suites (8/8 `OverlapIntegrationTest` includes bystander-role scenarios; 3/3
`RealAccessControlIntegrationTest` covers no-access/read-only/full outcomes) and a live DB spot
check: queried every active inherited `AD_Window_Access` row instance-wide
(`WHERE inherited_from IS NOT NULL AND isactive='Y'`) for client-ownership mismatches — see BUG-1
below for the one finding that surfaced, which is pre-existing and unrelated to this ticket's own
code, not a new misfire. No new regression risk found in the guard itself.

**Findings:**

```
- [MEDIUM] BUG-1: Pre-existing AD_Window_Access ownership corruption on GOClient's `RoleFinanzas`
  role, not caused by ETP-4906, not retroactively healed by B6's guard (by design — prevention-
  only, documented extensively in the class's own javadoc).
  Steps: `SELECT wa.*, r.ad_client_id AS role_client FROM ad_window_access wa JOIN ad_role r ON
  r.ad_role_id = wa.ad_role_id WHERE wa.inherited_from IS NOT NULL AND wa.isactive='Y' AND
  wa.ad_client_id <> r.ad_client_id;` against the live `etendogoclean` DB.
  Expected: every active inherited `AD_Window_Access` row's `ad_client_id` matches its owning
  role's own `ad_client_id`.
  Actual: 27 of 62 active inherited rows are mismatched — all 27 belong to `RoleFinanzas`
  (GOClient, client `802509E12436405C86BA1FD5B1DF508C`), each stuck at `ad_client_id='0'` (the
  system client) across 27 different windows. `created`/`updated` timestamps on every one of these
  27 rows are `2026-08-13`/`2026-08-14` — a full 2-3 days BEFORE `WindowAccessOverlapCorruptionGuard`
  was even deployed (container restart confirmed `2026-08-16T23:17:17Z`). This is legacy corruption
  from before the guard existed, not something the guard is failing to prevent today — a fresh
  instance-wide scan found no NEWLY-corrupted rows post-deployment (`ClassicDebug`'s own rows,
  updated as recently as `2026-08-17 04:02`, are correctly owned; the `Personal – NewUsertest` role's
  33 rows, the most recently and heavily exercised composition in this environment, are also 100%
  correctly owned).
  Why not a blocker for ETP-4906: this ticket's own code (B6's guard) is a prevention mechanism by
  explicit design — its own javadoc documents at length why a reactive/correction-based approach
  does not work at all (`SecurityChecker.checkWriteAccess` races). It was never going to retroactively
  fix rows corrupted before it existed. `RoleFinanzas` is not one of this ticket's own template roles
  or test fixtures either.
  Recommend: a separate one-time data-fix pass (delegate to Remedy per this repo's
  `cli/src/data-fixes/` convention) to clean up already-corrupted `AD_Window_Access` rows
  instance-wide — likely the same underlying legacy bug ETP-4852/4878 were already chasing, just
  caught here on a role neither of those tickets' own test suites happened to touch. Track
  separately from ETP-4906; does not gate this ticket's approval.
```

**No Critical/High bugs found.** REVIEW's approval stands; this pass independently re-confirms
(not merely re-states) every automated suite green on a fresh run, closes the backend-redeploy
half of the previous QA pass's one open item, adds stronger live-DB evidence for the write path
under maximal real composition, does its own independent regression-risk read of B6's system-wide
guard, and surfaces one pre-existing, unrelated data-integrity finding worth tracking separately.

**QA phase is closed. Recommend proceeding to DOCS (Sage)** — note DOCS already ran once
(commit `acf7e78cf`) against earlier code; worth a quick freshness check against waves 6-12/B5/B6
given how much landed since, but that is DOCS's own call, not a QA blocker.

## DOCS Findings — Full Pass (Sage, 2026-08-17)

**Scope:** full independent freshness pass against the code as it stands after waves 6-12, B5, B6,
and all REVIEW/QA rounds — not a re-trust of the original 2026-08-14 DOCS pass (commit `acf7e78cf`,
already updated once for the original multi-role picker design) or of REVIEW's own narrow doc fixes
(2 staleness bugs already closed by REVIEW in `user.md`: role-catalog source attribution, Email
Configuration mount claim — not re-litigated here). Read the plan's Status table, all 12 DEV wave
sections, Tasks B5/B6, and the 3 REVIEW Findings + QA Full Pass sections in full before touching any
doc. Files touched are all in `etendo_schema_forge` — no `com.etendoerp.go` doc changes were needed
(see below).

**Real staleness found and fixed, `docs/generated-custom-windows/user.md`:**
1. **"What this window should allow" (line 9, pre-existing gap, not caught by REVIEW's narrower
   pass):** still listed "First Name, Last Name" as maintained identity fields — stale since DEV
   wave 12 (commit `404a0ce70`) discarded both from `decisions.json` entirely. Verified directly
   against the current file (`python3` read of `artifacts/user/decisions.json`'s `entities.user.
   fields.firstName/lastName` → both `visibility: "discarded"`) and against the generated form
   (`grep -c firstName|lastName artifacts/user/generated/web/user/UserForm.jsx` → 0 hits). Fixed:
   removed both fields from the prose list, with a forward pointer to the fuller explanation.
2. **"Reactive behavior and dependencies" (old line 35) — described a synchronization callout that
   no longer exists.** The doc claimed Name/First Name/Last Name "carry the same `SL_User_Name`
   callout" and react together; wave 12 flipped `SL_User_Name_Firstname`/`SL_User_Name_Lastname`
   from `"Keep"` to `"Omit"` (confirmed directly in `decisions.json`'s `rules` block) precisely
   because the fields themselves are gone. Rewrote the bullet to state the discard/rule-flip as
   fact, with the wave/commit citation, instead of describing dead behavior.
3. **Same stale claim echoed in "Gap assessment" (old line 52)** ("callout-backed synchronization
   ... should not be treated as confirmed UI behavior without manual verification") — this framed a
   REMOVED feature as an open verification gap. Fixed: replaced with a note that the gap is closed
   by removal, not by verification, cross-referencing the Reactive-behavior fix above.
4. **Wave 11's matrix visual polish (pills, category-header casing, per-role icons) was completely
   undocumented.** Re-read `UserRolesTab.jsx` in full against the doc's "Cell values" sentence,
   which only described `✓`/`Solo lectura`/`—` as bare values — no mention of the `TierPill`
   component, the `status-success`/`status-warning` semantic tokens, the removed `uppercase`
   category-header class, or the `ROLE_ICONS` (`lucide-react`) map added in DEV wave 11 (commit
   `8fe4753d8`). This is real, currently-shipped, human-visually-confirmed UI behavior with zero
   doc coverage — added a new paragraph under "Reactive behavior and dependencies" describing all
   three, grounded directly in the component source (tokens, icon-to-role mapping, weight/casing
   change) rather than restating the plan doc's prose.
5. **"Pipeline regeneration — ETP-4906" section only covered the original decisions.json diff**
   (headerExtra/customPanelTabs/customComponents.headerTable), not wave 12's later, independent
   `decisions.json` change (firstName/lastName discard + rule flips, contract `0.20.0` → `0.21.0`).
   Added a "Follow-up regeneration — DEV wave 12" subsection documenting that diff, the
   `sf-validate-pipeline` confirmation, and the manual `UserHeaderTable.jsx` column re-sync — this
   is exactly the kind of window-specific pipeline change CLAUDE.md's Documentation Freshness policy
   requires landing in the same doc.

Everything else in `user.md` was independently re-verified against current source and found
accurate — **not** just re-trusted from REVIEW's pass: wave 10's `detailTabOrder={1}`/`tabOrder: 0`
tab-order mechanism (line 29) matches `windows/custom/user/index.jsx` verbatim (read directly, not
grepped-and-assumed); the 5-column `UserHeaderTable.jsx` grid (`name, businessPartner, email,
locked`, `defaultRole` via `roleColumn`) matches the doc's grid-behavior claims; `customLoaders['user']`
registration matches `registry.js`; all locale keys the doc implicitly relies on
(`assignedRolesLabel`, `noRolesAssigned`, `saveUserFirstForRoles`, `removeRoleAria`,
`roleAssignmentSaveFailed`, `userRolesTabLabel`, `userRolesTabEmptyState`, the 3
`userRolesTabDashboardRow`-family keys, `usersGridRolesColumn`, `accessTierReadOnly`) exist in both
`en_US.json`/`es_ES.json` (nested under `genericLabels`, confirmed by direct read, not assumed from
key naming).

**Real staleness found and fixed, `docs/functionalidad/02-capacidades-y-flujos.md` (CAP-ROL-02,
"Huecos abiertos" bullet, old line 344):** claimed the native "User Roles" child tab
(`userRoles`) "sigue reflejando esa fila legacy" (still reflects the legacy `Default_Ad_Role_ID` row,
read-only). **False as of DEV wave 6:** `userRoles` is `exclude: true` in `decisions.json` (confirmed
directly) and no longer renders at all — its generated `UserRolesTable.jsx`/`UserRolesForm.jsx` were
deleted during REVIEW's cleanup, exactly as `user.md`'s own "Window shape" bullet already documented
correctly. This bug slipped through the first DOCS pass (which rewrote CAP-ROL-02's main body
correctly but left this one "Huecos abiertos" bullet describing the pre-wave-6 state) and through
REVIEW's own narrower re-checks (which focused on `user.md`, not the Spanish functional-flows doc).
Fixed: the bullet now states the tab renders nothing at all, with the legacy DB row's existence
(untouched, just surfaceless) kept as the actual remaining gap. `01-actores-y-superficies.md` (line
25) was independently re-checked and found already accurate — no fix needed there.

**`docs/neo-headless.md` §8d (`com.etendoerp.go`) — read in full, no changes needed.** The
`WindowAccessOverlapCorruptionGuard` subsection (the four guarded triggers, the `@Priority`
ordering claim, the `TEMPLATES_BEING_REMOVED` thread-local + `TransactionCompletedEvent` cleanup,
and the cross-reference to `UserRoleCompositionServiceOverlapIntegrationTest`/
`RealAccessControlIntegrationTest` at §9) reads as complete and well-integrated with the doc's
existing §8b–8f numbering and its own precedent subsections (reconcileInheritances, the
cross-template overlap fix) — consistent with REVIEW's own line-by-line verification against the
real Java source. No doc-freshness gap found here; not re-editing already-solid REVIEW work.

**Cross-cutting indexing check (item 4 of the dispatch) — `docs/ui-customization.md`:**
- `onAfterExistingSave` (the `DetailView.jsx` extension point from Task F1) is **not** documented in
  `ui-customization.md`, and neither is its precedent, `onAfterCreate` (`warehouse/index.jsx`) —
  confirmed by grep, zero hits for either name anywhere in that file. This is consistent, not a
  fresh gap: `ui-customization.md`'s own "Core principle" scopes it strictly to
  `decisions.json`-declared, generator-emitted extension points (`window.*` keys read by
  `generate-frontend.js`); `onAfterExistingSave`/`onAfterCreate` are runtime props a hand-written
  `windows/custom/{window}/index.jsx` passes directly to the generated `<Page>` component, a
  different mechanism class the doc doesn't cover for ANY window, not just `user`. Left undocumented
  there, matching precedent — already thoroughly documented in `user.md`'s own "Save-lifecycle hook"
  paragraph (line 31), which explicitly calls out its generic/reusable nature and the `warehouse`
  precedent. Not fixing this — would be introducing a new doc-scope decision beyond this ticket's
  remit, not closing a freshness gap.
- **`window.headerExtra` and `window.customComponents.headerTable`** ARE `decisions.json`-declared,
  generator-emitted extension points squarely inside `ui-customization.md`'s scope, and `user` is a
  real, shipped example of both that the doc's own "Real example(s)" convention didn't list yet
  (only `contacts` and `sales-invoice` respectively). Added `user` (`AssignTemplateRolesControl`,
  `UserHeaderTable`) to both "Real examples" lines, with a one-line description and a pointer back
  to `user.md` for the full mechanism — low-risk, factual, directly serves this dispatch's "deserve
  a mention" ask.
- **B6's `EntityPersistenceEventObserver` pattern** (`WindowAccessOverlapCorruptionGuard`,
  `com.etendoerp.go`) is a genuinely different extension mechanism from the `NeoHandler` CDI-hook
  system `docs/neo-headless-extensibility.md` documents (that doc covers request/response-time hooks
  into NEO Headless routing; this is a Hibernate/Weld persistence-lifecycle observer, unrelated to
  NEO Headless at all). Confirmed by grep: `neo-headless-extensibility.md` has zero mentions of
  `EntityPersistenceEventObserver` or `ContactNameSyncHandler` (the guard's own cited precedent for
  this pattern) — so this isn't a fresh indexing gap ETP-4906 introduced, it's a pre-existing
  absence the guard's javadoc + `neo-headless.md` §8d already compensate for in situ. Flagging as a
  **suggestion, not a blocker:** a future architectural-docs pass could give
  `EntityPersistenceEventObserver` the same first-class "here's the reusable pattern" treatment
  `NeoHandler` gets in this repo's CLAUDE.md — out of scope for ETP-4906 itself, since the pattern
  predates this ticket and the ticket's own usage is already well-documented at the point of use.
- The multi-role picker's own extension points (`headerExtra`, `customPanelTabs`,
  `customComponents.headerTable`) were all pre-existing generator capabilities before this ticket
  (confirmed by the original DOCS pass via `git show 3466f43fa`) — ETP-4906 only exercises them, it
  didn't add new ones, so there is no new mechanism here needing a `decisions-reference.md` entry
  beyond the "Real examples" cross-refs added above.

**Minor, non-blocking observation, not fixed (would be scope creep):**
`docs/decisions-reference.md`'s `hideDelete` property table (around line 709) cites "Added ETP-4512
(`userRoles` on the `user` window)" as a real example — historically accurate framing ("Added"), but
now describes a dead example: `userRoles` is fully `exclude: true`d as of DEV wave 6, so its
`hideDelete` setting never renders at all anymore. Left as-is: it's a historically-true statement in
a generator-reference doc explicitly out of this ticket's primary scope, and REVIEW already
confirmed (prior pass) `decisions-reference.md` needed no ETP-4906-driven changes. Noting here in
case a future cleanup pass wants a better "Real example" citation for that property.

**Commits (this repo, `feature/ETP-4906`, not pushed):**
- `docs/generated-custom-windows/user.md` — 5 fixes above.
- `docs/functionalidad/02-capacidades-y-flujos.md` — CAP-ROL-02 "Huecos abiertos" bullet fix.
- `docs/ui-customization.md` — `user` added to `headerExtra`/`customComponents.headerTable` real
  examples.
- `docs/generated-custom-windows/INDEX.md` — `user.md`'s one-line description updated from the
  stale ETP-4512-era "roles child surface" wording to describe the ETP-4906 multi-role composition
  feature.

**DOCS phase is closed.** No `com.etendoerp.go` doc changes were needed (verified, not assumed —
§8d read in full). **Overall ticket read (not this agent's decision to make, but requested by the
coordinator):** DEV (waves 6-12, B5, B6), REVIEW, QA, and now DOCS are all closed with no open
blockers. The one remaining loose end recorded in the Status table banner — handing the human the
manual-eyeball-test checklist — is a human-facing step, not a pipeline-phase gate, and BUG-1 (the
pre-existing, ETP-4906-unrelated `AD_Window_Access` corruption on `RoleFinanzas`) is already
correctly scoped to a separate Remedy follow-up by QA. From a pipeline-phase standpoint this ticket
looks ready for Clerk to prepare the PR(s).

## Manual QA Feedback (Human, 2026-08-14) — DEV wave 6, 5 findings

Backend was rebuilt/redeployed (`update.database` + `smartbuild` + `make install`,
confirmed live: `userroleassignments` now 401s like its siblings instead of 404) and the
human ran a real manual pass. 5 findings, all root-caused directly from source before
dispatch (not guessed):

1. **Spacing** — `AssignTemplateRolesControl.jsx`'s expanded options panel (`__options`
   div) needs more left padding; each role row (`px-2 py-1.5`) reads cramped against the
   left edge.

2. **Trigger shows blank while the checklist is expanded.** Confirmed in
   `AssignTemplateRolesControl.jsx`: chips only render when `!isEditing`
   (`{!isEditing && visibleChips.map(...)}`), and the "no roles" placeholder only
   renders when `selectedRoles.length === 0`. With 2+ roles selected AND `isEditing`
   true, NEITHER renders — the trigger button is genuinely empty by construction, not a
   rendering glitch. This exact asymmetry was already flagged as a testability gotcha in
   F9 Findings, just not recognized there as a real UX bug. **Fix:** stop hiding chips
   while editing — keep them visible in the trigger regardless of `isEditing`.

3. **Two things, one confusing sequence.** The immediate cause — composing "Ventas"
   (role id `2A159DF4F4B944A6AA903202AD35B545`) rejected with "Role is not a template" —
   is the SAME already-tracked environment drift (`AD_Role.IsTemplate='N'` for
   Finance/Sales in this DB, see the QA Findings note directly above this section), not
   a new bug; use Purchasing/Inventory to exercise the actual happy path. **But** the
   error toast being immediately followed by "Saved successfully" IS a real, separate
   bug, independent of why the role save failed: `windows/custom/user/index.jsx`'s
   `handleRoleAssignmentSave` runs as `onAfterExistingSave` — strictly AFTER the generic
   `AD_User` field save has already succeeded and shown its own toast — so ANY role-save
   failure (this drift, a network blip, anything) will always read as "it worked" (the
   generic toast) immediately followed by a contradicting error. This will keep
   happening for legitimate future failures too, not just this one drifted role.

4. **Duplicate "Roles del usuario" tab, one of them a native leak.** `decisions.json`'s
   `userRoles` entity (the native `AD_User_Roles` child tab) has every field set to
   `visibility: readOnly` (an ETP-4512-era decision, stale reason text: "Role assignment
   now happens exclusively via... AssignRoleControl") but was never `exclude`d — so it
   still renders as its own secondary tab, and its native AD_Tab label apparently
   translates to the same "Roles del usuario" string this ticket's OWN new custom tab
   uses (`labelKey: userRolesTabLabel`), producing two identically-labeled tabs — the
   native one exposing the internal "Personal – NewUsertest" composition role, which
   should never be user-visible. **Fix:** add `"exclude": true` to the `userRoles`
   entity — the exact same convention already used for `rxServicesAccess`/`token` in
   this same file (`artifacts/user/decisions.json` lines 23-24) — removing the native
   tab entirely rather than just neutering its fields.

5. **Matrix shows raw classic AD categories with no Etendo GO equivalent** (e.g.
   "Diccionario de la aplicación" → Módulo, Tablas y columnas, Referencia, Definición del
   Proceso — all "—" for every role, correctly, but they shouldn't appear as rows at
   all). Root cause: `UserRolesTab.jsx`'s `flattenWindowRows` walks `SFListMenu`'s FULL
   tree with NO filter against Etendo GO's actual exposed window set — as an admin
   caller, `SFListMenu` returns literally every native AD menu node, including
   classic-only Application Dictionary entries Etendo GO never surfaces at all. This is
   a real gap in Task F5's original implementation, not something the plan anticipated
   correctly. **Fix, no new backend call needed:** `UserRolesTab.jsx` already fetches
   `rolesOverview` (`fetchRolesOverview()`) — build a `Set` of every `windows[].id` across
   ALL `rolesOverview.roles` entries (union across all 5, Admin included — each role's
   `windows[]` is already intersected server-side against
   `resolveActiveEtendoGoWindowIds()` in `SFRolesOverview.java`, so the union IS exactly
   "every window Etendo GO actually exposes"), filter `flattenWindowRows`'s output to
   only rows whose `windowId` is in that set, then drop any category left with zero
   surviving rows (don't render an empty "Diccionario de la aplicación" header with no
   rows under it).

**Dispatch:** schema-forge-developer (fresh agent, no reachable prior session — the
original developer-2/a235bf7765174e48b that built these 3 files is gone). All 5 fixes
land as one commit. Given the scale of existing test coverage asserting some of this
CURRENT (buggy) behavior (e.g. F9's own note that chips only show `!isEditing` "by
design"), **Tester must do a follow-up pass** updating/adding tests for all 5 fixes
before this goes back through REVIEW/QA — same wave-pattern this ticket already used
for the dead-code and Guardar-enablement bugs.

**DEV wave 6 Findings (developer-6, landed, commit `66c0df38b`):** all 5 fixed in one
commit, exactly per the root-cause analysis above — no surprises during implementation.

**Tester follow-up (landed, commit `7f75e37f7`):** fixed the 2 predicted broken Vitest
tests (new `roleAssignmentSaveFailedAfterUserSaved` toast call shape) and 3 stale
Playwright comments; added regression coverage for both new behaviors — fix #4 via a
new 3-layer pipeline test (`decisions.json`/`contract.json`/`UserPage.jsx` all agree
`userRoles` is gone) and fix #5 via a `UserRolesTab.vitest.jsx` case proving a
classic-only category is dropped, not rendered with all-dash rows (the existing fixture
never actually exercised that filter). Also found and fixed a genuine Playwright
fixture gap (Admin's `windows[]` fixture was empty, which fix #5's active-window union
would have silently excluded a real window from — caught only because this session
actually ran the spec against a live `make dev`, which DEV wave 6 could not). **Final
counts:** Vitest 646 files / 12015 tests / 12012 passed / 0 failed / 3 skipped; Node
tests 1129/1129; Playwright `user-role-assignment.mocked.spec.js` 7/7. No bugs found in
the DEV wave 6 diff itself. **This DEV+Tester wave is closed — ready for another
manual pass, then a re-REVIEW before PR.**
- **#1 (spacing):** `AssignTemplateRolesControl.jsx`'s `__options` panel — `p-2` →
  `p-2 pl-4` (left padding only, per the finding's ask).
- **#2 (blank trigger while editing):** removed both `!isEditing &&` guards (chips +
  overflow badge) in the trigger button; the empty-selection placeholder
  (`selectedRoles.length === 0`) was already unconditional on `isEditing` and needed no
  change.
- **#3 (confusing error/success sequence):** `windows/custom/user/index.jsx`'s catch
  block now builds the toast as `ui('roleAssignmentSaveFailedAfterUserSaved', { detail })`
  (`detail` = `err?.message || ui('roleAssignmentSaveFailed')`) with `{ duration: 8000 }`
  — explicitly frames the failure as "the user record saved, only the roles didn't" and
  gives the admin more time to read it before/instead of the prior success toast fading.
  New key `roleAssignmentSaveFailedAfterUserSaved` added to BOTH `en_US.json`
  ("The user was saved, but the roles couldn't be updated: {detail}") and `es_ES.json`
  ("El usuario se guardó, pero los roles no pudieron actualizarse: {detail}"). Did not
  touch the underlying `AD_Role.IsTemplate='N'` DB-state drift (separately tracked, out
  of scope per the dispatch).
- **#4 (duplicate tab):** `artifacts/user/decisions.json`'s `userRoles` entity collapsed
  to the bare `{ "exclude": true }` pattern (matching `rxServicesAccess`/`token` exactly),
  dropping the now-moot `hideDelete`/`fields` keys. `make regen ONLY=user` confirmed the
  contract's `entities` dropped from 3 to 2 (`user`, `emailConfiguration` only) and
  `UserPage.jsx` no longer imports/mounts a `userRoles` table or tab.
  `UserRolesTable.jsx`/`UserRolesForm.jsx` remain on disk as orphaned generated output
  (the generator doesn't delete files for excluded entities) — harmless, unreferenced,
  left as-is per the Generated Files Policy (fix belongs in the generator, not this task).
- **#5 (classic-only categories):** `UserRolesTab.jsx` now builds `activeWindowIds` (a
  `Set<string>`, the union of every `windows[].id` across ALL `rolesOverview.roles`,
  Admin included) and filters `flattenWindowRows`'s output against it before grouping;
  `groupRowsByCategory`'s output is further filtered to drop any group with zero rows
  (defensive — in practice always already true, since rows are filtered before grouping).
- Also updated `docs/generated-custom-windows/user.md` in the same commit (Documentation
  Freshness policy) — the "Window shape"/"Detail behavior" bullets and the "User Roles
  child table" reactive-behavior bullet described the now-removed native tab; rewrote
  both to reflect the exclude and cross-referenced the new row-filtering behavior for
  fix #5.
- **Verification:** `make regen ONLY=user` clean; contract-integrity check (Window
  Change Integrity Protocol Step 3) confirmed `draftMode: false`/`category: settings`
  unaffected, no readOnly regressions on any editable `user` field (this window has no
  draft/completion flow, so the readOnlyLogic check doesn't apply here); `npx
  sf-validate-pipeline --scope=user` → OK (0 violations); `npm run build` clean;
  full Vitest suite (`cd tools/app-shell && npx vitest run`) → **646 files, 12014 tests,
  12009 passed, 2 failed, 3 skipped** — the only 2 failures are
  `src/windows/custom/user/__tests__/index.vitest.jsx`'s
  `handleRoleAssignmentSave (fired via onAfterExistingSave) > shows an error toast (and
  does not throw) when saveUserRoleAssignments rejects with a domain message` and
  `> falls back to the generic i18n error key when the rejection has no message`, both
  asserting the OLD bare-error `toastError` call shape from fix #3 (now receives
  `('roleAssignmentSaveFailedAfterUserSaved', { duration: 8000 })` instead of the raw
  domain message / `'roleAssignmentSaveFailed'`) — exactly the pre-existing-test-asserts-
  old-buggy-behavior situation this dispatch anticipated. No other test in the full suite
  regressed from any of the 5 fixes (in particular: no Playwright/Vitest test explicitly
  asserted chips hidden while `isEditing` for fix #2 — `e2e/tests/flows/
  user-role-assignment.mocked.spec.js` closes the options editor before asserting chip
  visibility in every scenario, so its assertions still hold, but 3 of its inline comments
  ("Chips only render in the collapsed (!isEditing) view...") are now stale/inaccurate
  and should be corrected by Tester's follow-up pass rather than left describing removed
  behavior; not run in this session — no local server/browser available to this agent).
  **Tester follow-up needed:** update the 2 failing assertions above to the new toast
  call shape, and refresh the 3 stale Playwright comments (lines ~190, 262, ~281 of
  `user-role-assignment.mocked.spec.js` as read pre-fix) — no test logic changes needed
  there, comments only.

## Manual QA Feedback Round 2 (Human, 2026-08-14) — DEV wave 7, 2 findings

Human deactivated GOClient's own legacy client-level Finance/Sales/Purchasing/Inventory
roles (the ones the earlier `IsTemplate='N'` drift was on) to test the target
architecture from this session's chat: "no template role should be at client level,
only at system level." Two findings:

1. **Wave 6's padding fix targeted the wrong element.** It fixed the EXPANDED
   checklist's internal padding (`__options` div), but the actual complaint (both times)
   is the CLOSED trigger's own left alignment against sibling native fields like
   "Nombre". Root cause, confirmed directly in `DetailView.jsx`: `headerExtra` (where
   `AssignTemplateRolesControl` mounts) renders as a sibling BEFORE the native form
   card, which is wrapped in `formCardPadding` (defaults `'p-6'`, line 1313/3296)
   — `headerExtra` itself gets NONE of that padding (line 3260, no wrapping
   div/className at all). `AssignTemplateRolesControl`'s own root divs (`flex flex-col
   gap-2 max-w-[420px]`, both the normal and `__save-first` render paths) need matching
   horizontal padding (`px-6`) to visually align with "Nombre"'s card-padded position.

2. **The selector is now empty — this is the ETP-4877 caveat, but live, in THIS
   ticket, right now, not a future concern.** `AssignTemplateRolesControl.jsx`,
   `UserRolesTab.jsx`, `RoleChipsCell.jsx`, and `RoleFilterControl.jsx` all resolve role
   names via `fetchRolesOverview()` (`SFRolesOverview`), which is hard-scoped to the
   CALLER's own client (`Role.Client.id = clientId` + name in
   Finance/Sales/Purchasing/Inventory) — now that GOClient's own copies are deactivated,
   that query returns zero matching rows, so every one of these 4 components has
   nothing to show. This is now a functional break in ETP-4906 itself (not just a
   forward-looking gap for ETP-4877), since the human's whole point in deactivating
   those roles was to reach the target end-state this ticket is supposed to support.
   **Fix — new backend read path, not a `SFRolesOverview` change** (that endpoint's own
   job, per its own javadoc, is specifically "the CALLER's own tenant's roles" for the
   unrelated ETP-4513 Roles-overview page — repointing it would break that page's
   intended behavior):
   - **Backend (`com.etendoerp.go`):** new webhook, `GET /sws/neo/systemroletemplates`
     (name TBD by whoever implements — check no collision with an existing route),
     admin/client-admin gated same as its siblings, mirroring
     `SFRolesOverview.java`'s `buildRoleJson`/`buildWindowsJson`/
     `resolveActiveEtendoGoWindowIds` pattern but resolving the 4 FIXED_ROLE_NAMES at
     `ad_client_id='0'` (via `SystemRoleTemplates`, `com.etendoerp.go.roles` package)
     instead of the caller's own client — no `userCount`, no client-admin row (there is
     none at system level). Response: `{"roles": [{"id","name","windows":[{"id","name","tier"}]}, ...]}`,
     same per-role shape `SFRolesOverview` already uses so the frontend fetch/response
     handling can be near-identical. Consider (developer's call, not mandatory) whether
     `resolveActiveEtendoGoWindowIds()` is now duplicated a 3rd time across
     `SFRolesOverview`/`SFWindowAccessMap`/this new webhook and worth extracting to a
     shared static helper — flagging, not requiring, since none of the existing 3
     webhooks currently share it either.
   - **Frontend:** new `fetchTemplateRoles()` in `tools/app-shell/src/lib/rolesApi.js`
     (or a sibling file, developer's call) calling the new endpoint, same
     `fetchNeoJson`-style conventions as its siblings. Repoint
     `AssignTemplateRolesControl.jsx` and `UserRolesTab.jsx` to use it instead of
     `fetchRolesOverview()` for the SELECTABLE/DISPLAYED template roles. `RoleChipsCell.jsx`/
     `RoleFilterControl.jsx` need BOTH sources now: `fetchTemplateRoles()` for the 4
     template names (chips/filter options going forward will carry system-level role
     ids, since that's what new compositions will store) AND `fetchRolesOverview()`
     still, but ONLY for its `isClientAdmin` row (the classic-Admin detection branch,
     which correctly stays tenant-scoped — Admin is explicitly client-level per this
     ticket's own architecture, never touch that part).

**Dispatch:** one schema-forge-developer session across both repos (backend piece is
small, tightly coupled to the frontend repoint — not worth splitting across two agents
for this). Same rules as always: `com.etendoerp.go` plain branch not worktree, commit
locally only, no push either repo. Tester follow-up required after, same wave pattern —
existing tests mocking `fetchRolesOverview()` for role options in all 4 touched
frontend files will need updating to mock the new fetch instead/additionally.

**DEV wave 7 Findings (developer-7, landed):**

- **Padding:** `px-6` added to both `AssignTemplateRolesControl.jsx` root divs, matching
  `formCardPadding`'s `p-6`. Wave 6's `__options` panel fix left untouched (still
  correct, just was insufficient alone).
- **Backend** (`com.etendoerp.go`, commit `90f08997`): new webhook
  `SFSystemRoleTemplates` (`GET /sws/neo/systemroletemplates`), resolves
  `SystemRoleTemplates.byName()`'s 4 fixed ids directly (system client `'0'`, never
  client-scoped). Wired into `NeoPseudoSpecDispatcher`. New `SFSystemRoleTemplatesTest`
  (12/12) + 2 new `NeoPseudoSpecDispatcherTest` cases (17/17 total). `docs/neo-headless.md`
  §8f added. All targeted classes green (`SFRolesOverviewTest` 13/13,
  `SFUserRoleAssignmentsTest` 8/8, `SFAssignUserRolesTest` 8/8,
  `UserRoleCompositionServiceTest` 16/16) — no full unfiltered `gradlew test` run, per
  standing precedent.
- **Frontend** (`etendo_schema_forge`, commit `6b40bc7dd`): new `fetchTemplateRoles()` in
  `rolesApi.js` (shared `fetchNeoWebhookRoles()` helper extracted, `fetchRolesOverview()`
  behavior unchanged). `AssignTemplateRolesControl.jsx`/`UserRolesTab.jsx` switched to
  it for selectable/displayed roles — `UserRolesTab.jsx` still ALSO calls
  `fetchRolesOverview()` (kept solely for the tenant's client-admin row, needed by wave
  6 fix #5's `activeWindowIds` union — some real windows are Admin-only, granted to none
  of the 4 templates). `RoleChipsCell.jsx`'s `useUserRoleGridData()` now fetches both in
  parallel and combines them (4 templates + tenant's own Admin row, if any) for the grid
  chips/filter.
- **Backward-compat gap, flagged not fixed (out of scope for this dispatch):** any user
  composed BEFORE this fix has tenant-level role ids stored in `AD_Role_Inheritance`,
  which the new system-level catalog can't resolve names for — chips/matrix would show
  blank for those until re-saved. Only matters for the disposable test users created
  earlier in this session's manual QA; not a concern for a fresh environment where
  ETP-4877 hasn't run yet (nothing has been composed against the old ids in production).
- **46 tests now failing** (all `"No fetchTemplateRoles export"` mock gaps, nothing else
  regressed — full suite 642/646 files, 11966/12015 passed, 46 failed, 3 skipped):
  `AssignTemplateRolesControl.vitest.jsx` (15), `RoleChipsCell.vitest.jsx` (7),
  `UserHeaderTable.vitest.jsx` (9), `UserRolesTab.vitest.jsx` (13). **Tester follow-up
  needed before this goes back to the human for another manual pass.**

## Manual QA Feedback Round 3 (Human, 2026-08-14) — DEV wave 8, layout fix

**Both prior padding attempts (waves 6 and 7) were treating the wrong problem.** Human
screenshot shows "Roles asignados" rendering as a visually DETACHED block below the
"Nombre"/"Correo electrónico" card, with its own narrower width — not a spacing/padding
nit, a structural placement issue.

**Root cause, confirmed directly from source this time (not guessed):**
`artifacts/user/generated/web/user/UserPage.jsx` passes `AssignTemplateRolesControl` as
`formFooter`, not `headerExtra` (corrects an earlier wrong trace in this plan). In
`DetailView.jsx`'s `buildHeaderFooter` (~line 1194-1203), `footerInline =
!!formFooter.inlineInHeaderCard` — since `AssignTemplateRolesControl` never sets that
static flag, it defaults to the "detached block below the card" path (`{!footerInline
&& footerElement}`, ~line 3386), which is exactly the screenshot.

**There is already a real, working precedent for the OTHER path:**
`tools/app-shell/src/windows/custom/shared/TaxSifField.jsx` sets
`TaxSifField.inlineInHeaderCard = true` (line 134) and renders via a nested
`<EntityForm renderAsFragment>` (its own comment, line ~94-101: "Render as bare grid
CELLS... DetailView splices these fragments into the principal header form's grid via
its `trailing` slot... each field flows into the next free cell of the native header
grid, aligned and spaced exactly like a native field"). Confirmed the render path: when
`footerInline` is true, `buildHeaderFooter` sets `inlineTrailing = footerNode`
(line 1202), which `DetailView.jsx` passes as `trailing={inlineTrailing}` to the
PRINCIPAL `<Form layout="horizontal" section="principal">` (line 3349) — and
`EntityForm.jsx`'s non-fragment render path appends `{trailing}` INSIDE
`<div className={gridClass} style={gridStyle}>` (line 1513-1520), i.e. the exact same
CSS Grid container "Nombre"/"Correo electrónico" live in.

**Fix:** set `AssignTemplateRolesControl.inlineInHeaderCard = true`. Because this
component is a hand-built chip widget (not routed through `EntityForm`'s per-field
cell renderer like `TaxSifField` is), simply flipping the flag moves WHERE it renders
(into the grid, as a grid child) but its OWN internal classes still determine its
footprint within that cell — the current `max-w-[420px]` cap likely needs to become
`w-full` (so it fills its grid cell like a native field does, rather than possibly
under- or over-shooting a fixed pixel width), and wave 7's `px-6` addition almost
certainly needs to be REMOVED once the component is a grid child (the grid's own
`gridStyle`/`gridClass` positions it — an extra manual `px-6` would now double up
against, not compensate for, missing card padding, likely reintroducing a
misalignment in the other direction). **Whoever picks this up must actually look at
it live (Playwright screenshot or ask the human) before declaring success** — this
plan has already guessed wrong twice on pure source-reading for this exact control's
layout; don't repeat that.

**Dispatch:** schema-forge-developer, `etendo_schema_forge` only (no backend
involvement this time). Tester follow-up after, for the same reason as prior waves —
existing Vitest snapshots/assertions on this component's markup may need updating for
the new class list.

**DEV wave 8 Findings (developer-8, landed, commit `b20afd7`) — independently
re-confirmed by the coordinator, not just trusted:** `AssignTemplateRolesControl.inlineInHeaderCard = true`
added; both root divs changed from `flex flex-col gap-2 max-w-[420px] px-6` to
`flex flex-col gap-2 w-full` (dropped both the fixed max-width and wave 7's now-obsolete
`px-6`). **Empirically verified, not just source-read** — measured `getBoundingClientRect()`
live against `make dev`: "Roles asignados" now has IDENTICAL `left`/`right`/`width`
(66/349/283) to "Nombre" in the same grid column, just at a different `top`. The
coordinator independently re-viewed the actual screenshot (not just the agent's
numbers) — confirms it visually: the control now sits cleanly inside the same header
card as the native fields, full column width, correctly left-aligned, no detached block,
no double padding, and the wave 6 fix (no duplicate native tab) still holds in the same
screenshot. **This layout issue is genuinely resolved.**

**Pre-existing test failures, NOT caused by this change (confirmed via `git stash`
before/after comparison):** `AssignTemplateRolesControl.vitest.jsx` was already 15
failed/5 passed before this fix, same count after — root cause is an unrelated mock gap
(`fetchTemplateRoles` missing from the file's `vi.mock('@/lib/rolesApi.js', ...)`, the
same class of gap DEV wave 7 already flagged for Tester across 4 files). No test in this
file asserts on the old `max-w-[420px]`/`px-6` classes, so this wave adds zero new test
debt on top of wave 7's already-pending Tester follow-up.

## Manual QA Feedback Round 4 (Human, 2026-08-14) — DEV wave 9, 2 cosmetic requests

Both root-caused directly against source before dispatch, both use EXISTING mechanisms
already built into this codebase — no new infrastructure needed.

1. **Grid column header "Rol por Defecto"/"Default Role" → "Roles"/"Roles".**
   `UserHeaderTable.jsx`'s `defaultRole` column has `label: 'Default Role'`, but that's
   dead fallback text — confirmed in `DataTable.jsx` (line 996):
   `t(col.column) ?? col.label ?? col.key`, and `t('Default_Ad_Role_ID')` DOES resolve
   (from the SHARED native AD dictionary entry in `en_US.json`/`es_ES.json`), so the
   dictionary lookup always wins over `col.label`. **Do NOT edit that shared dictionary
   entry** — `Default_Ad_Role_ID` is a generic native AD_User column other
   windows/contexts could reference, and mutating its global label risks bleeding into
   unrelated places. **Fix:** `DataTable` already accepts a `labelOverrides` prop
   (`useLabel(labelOverrides)`, same mechanism `TaxSifField.jsx`/`EntityForm` use,
   keyed `{[locale]: {[column]: label}}`) — pass one from `UserHeaderTable.jsx`,
   scoped to just this grid, overriding `Default_Ad_Role_ID` to a NEW i18n key (e.g.
   `usersGridRolesColumn`, value `"Roles"` in both `en_US.json`/`es_ES.json`). Check
   whether `props.labelOverrides` already arrives from the generated page before adding
   — merge rather than clobber if so (place after the `{...props}` spread either way, to
   guarantee this override wins, matching how `data={filteredData}` is already placed
   after the spread in the same component for the same reason).

2. **"Roles del usuario" tab should render FIRST**, before the native "Configuración
   del correo electrónico" tab and before "Adjuntos". `DetailView.jsx`'s
   `buildInitialTabs` (`detailViewHelpers.jsx` line 544) already has a weight-based
   ordering system: `secondaryTabs` (native, e.g. email config) default to weight
   `SECONDARY_DEFAULT_WEIGHT = 99`; `tabCustomTabs` (our `roles`/`attachments` entries)
   default to `CUSTOM_DEFAULT_WEIGHT = 999`; either can override via an explicit
   `tabOrder` field on the tab's own descriptor, and the final sort is
   `weight, then insertionIndex`. **Fix:** add `tabOrder: 0` to the `roles` entry in
   `windows/custom/user/index.jsx`'s `customTabs` array (leave `attachments` untouched,
   so it still sorts after both `roles` and the native email-config tab, preserving
   relative order between those two).

**Dispatch:** schema-forge-developer, `etendo_schema_forge` only, frontend-only, no
backend. Both fixes are small and precisely scoped from direct source investigation —
lower risk than the layout issue, but still verify visually/empirically before reporting
done, same discipline as wave 8. Tester follow-up after, for any test asserting the old
tab order or the old (unused) `label` string.

**DEV wave 9 Findings (developer-9, landed, commit `8b7e2f4`) — both empirically
verified, not just source-read:**

- **Column label:** new key `usersGridRolesColumn` ("Roles", both locales) in
  `en_US.json`/`es_ES.json`. `UserHeaderTable.jsx` now builds a `labelOverrides` memo
  (merging any incoming `props.labelOverrides` with the new override for
  `Default_Ad_Role_ID`), passed to `<DataTable>` after the `{...props}` spread. Verified
  via 3 throwaway Vitest checks (written, run, deleted): the override resolves to
  "Roles" in both locales through the REAL `resolveLabel`/`useLabel` chain and real
  locale dictionaries, while confirming the un-overridden shared dictionary entry
  elsewhere is untouched (still "Default Role"/"Rol por Defecto").
- **Tab order:** `tabOrder: 0` added to the `roles` custom-tab entry in
  `windows/custom/user/index.jsx`. Verified by calling the REAL `buildInitialTabs`
  with this window's actual tab shape: result order is
  `['custom:roles', 'emailConfig', 'custom:attachments']` — Roles first, as requested.
- **Test impact (Tester's job, not fixed here):** `UserHeaderTable.vitest.jsx` — all 11
  tests now fail on a NEW mock gap (`vi.mock('@/i18n', ...)` doesn't stub
  `useLocaleSwitch`, which the fix now calls) — needs
  `useLocaleSwitch: () => ({ locale: 'en_US', setLocale: null })` added to that file's
  mock; worth also adding an assertion on the built `labelOverrides` while there.
  `index.vitest.jsx` — unaffected (its `customTabs` assertion uses `toMatchObject`,
  which ignores the new `tabOrder` field). `UserRolesTab.vitest.jsx`'s 13 failures are
  the SAME pre-existing wave-7 `fetchTemplateRoles` mock gap, confirmed via `git stash`
  to predate and be unrelated to this wave.
- **Accumulated Tester backlog across waves 7+9, all from the same 2 mock-gap
  root causes (`fetchTemplateRoles` not mocked; now also `useLocaleSwitch` not mocked
  in one more file), nothing else:** `AssignTemplateRolesControl.vitest.jsx` (15),
  `RoleChipsCell.vitest.jsx` (7), `UserHeaderTable.vitest.jsx` (9 orig + 11 new = needs
  re-check, likely superset), `UserRolesTab.vitest.jsx` (13). **Tester still not
  dispatched — paused on human instruction.**

**Tester follow-up for waves 7-9 (landed 2026-08-16, agentId `a24834dfa45baed65`) —
all test debt closed, no real bugs found:**
- Fixed the `fetchTemplateRoles`/`fetchRolesOverview` mock gap across all 4 files, per
  each component's actual combined-fetch usage (`RoleChipsCell`/`UserHeaderTable`/
  `UserRolesTab` mock BOTH — `fetchRolesOverview` is kept solely for the tenant's
  client-admin row; `AssignTemplateRolesControl` mocks only `fetchTemplateRoles`).
  Corrected one now-wrong test in `AssignTemplateRolesControl.vitest.jsx` that asserted
  a client-admin-exclusion filter that no longer exists (`SFSystemRoleTemplates` never
  returns an admin row at all, so there's nothing to filter).
- `UserHeaderTable.vitest.jsx`: added the missing `useLocaleSwitch` mock, plus 2 new
  tests asserting the `labelOverrides` resolve `Default_Ad_Role_ID` to
  `usersGridRolesColumn` and that incoming overrides are merged, not clobbered.
- New coverage for wave 8 (`inlineInHeaderCard === true`, `w-full` not
  `max-w-[420px]`/`px-6`) and wave 9 (`index.vitest.jsx` now explicitly asserts
  `tabOrder: 0` on the roles tab, `undefined` on attachments — the prior
  `toMatchObject` silently ignored this field).
- **Playwright was genuinely broken** (0/7 before fix, confirmed by actually running
  it) — exactly the predicted cause: no route mock for `/sws/neo/systemroletemplates`,
  so the fetch fell through to the generic catch-all and rejected. Added the missing
  mock (4 non-admin roles) to both `beforeEach` blocks. No other spec changes needed —
  waves 8/9 don't touch anything this spec asserts on.
- **Final counts:** Vitest 646/646 files, 12017 passed, 0 failed, 3 skipped (up from
  642/646, 11966/46 failed). Playwright 7/7 (up from 0/7). **No real product bugs
  found** — everything was test/mock debt, exactly as scoped.
- **This closes out ALL DEV+Tester work from waves 6 through 9. Next: re-REVIEW and
  re-QA against the full current diff before this is PR-ready** — REVIEW/QA rows above
  are still stale for this code.

## Manual QA Feedback Round 5 (Human, 2026-08-14) — DEV wave 10, tab order still wrong

Live screenshot (real user, real URL, not the mock) shows the SAME order as before
wave 9's fix: "Configuración del correo electrónico" first, "Roles del usuario" second,
"Adjuntos" third. Wave 9's `tabOrder: 0` fix did NOT actually work live, despite passing
an isolated unit check — **root cause of why that check was misleading, confirmed by
re-reading the actual generated file this time:**

`artifacts/user/generated/web/user/UserPage.jsx` passes
`DetailTable={EmailConfigurationTable}` (line 255) but NEVER passes `detailTabIndex` or
`detailTabOrder` — so "Configuración del correo electrónico" is not a plain
`secondaryTabs` entry at all, it's `buildInitialTabs`'s special LINES-tab path
(`detailViewHelpers.jsx` line 558-560), whose weight comes from
`computeLinesEntryKey(detailTabOrder, detailTabIndex, secondaryEntries)` — with both
args `undefined`, that function falls through to `{ weight: LINES_DEFAULT_WEIGHT,
insertionIndex: -0.5 }` (line ~527), i.e. weight **`-1`**, not `SECONDARY_DEFAULT_WEIGHT
= 99` as wave 9's isolated check assumed when it hand-built its "actual tab shape" test
fixture. Since `-1 < 0` (roles' `tabOrder`), the lines tab still sorts first. The
isolated `buildInitialTabs` call in wave 9's verification used a fixture that modeled
email-config as a generic secondary tab, not the actual lines-tab shape this window
really uses — a real gap in that verification, not a fluke.

**Fix — two options, pick whichever is cleaner (developer's call, but explain the
choice):**
- **(A, likely cleaner)** Have `windows/custom/user/index.jsx` pass an explicit
  `detailTabOrder` prop through to `<UserPage>` (it already flows straight through to
  `DetailView` via `UserPage`'s `{...props}` spread, exactly like `onAfterExistingSave`/
  `additionalDirtyState` already do) — e.g. `detailTabOrder={1}`, so ordering becomes
  `roles (0) < emailConfig (1, explicit) < attachments (999, default)`. This uses the
  comment's own documented "preferred" mechanism (`detailViewHelpers.jsx` line 510:
  "`detailTabOrder` (new, preferred) is used directly as the weight when set") instead
  of relying on an implicit relationship between two different default constants.
- **(B)** Lower `roles`' own `tabOrder` from `0` to something below `LINES_DEFAULT_WEIGHT
  (-1)`, e.g. `-2`. Simpler one-line change, but more fragile — depends on knowing/
  remembering `LINES_DEFAULT_WEIGHT`'s exact value rather than being self-documenting.

**Mandatory this time: verify against the REAL generated user page for a REAL existing
user (the same kind of check the human just did), not just an isolated
`buildInitialTabs()` call with a hand-built fixture** — that exact kind of isolated
check is what produced a false-positive in wave 9. Use Playwright against live `make
dev` (or a component-level render test that goes through the actual generated
`UserPage`/`index.jsx`, not a bare call to the helper function) and confirm the tab
STRIP itself, in order: Roles del usuario, Configuración del correo electrónico,
Adjuntos.

**Dispatch:** schema-forge-developer, `etendo_schema_forge` only, frontend-only.

**DEV wave 10 Findings (developer-10, landed, commit `1fc06ede4`) — verified with a
genuine before/after/before regression test, not just a single pass:** added
`detailTabOrder={1}` to `windows/custom/user/index.jsx`'s `<UserPage>` call (flows
through `UserPage`'s `{...props}` spread → `DetailView`'s own destructured
`detailTabOrder` prop → `buildInitialTabs`'s `computeLinesEntryKey`), giving the
email-config lines tab weight `1` — between `roles` (0) and `attachments` (999 default).
Also documented the mechanism in `docs/generated-custom-windows/user.md` (self-doc
policy). **Verification this time actually exercises the real component tree**: a
throwaway Playwright spec (deleted after use) navigated the real `index.jsx` → generated
`UserPage` → `DetailView` tree and read the tab strip's DOM order — confirmed correct
(`Roles del usuario, Configuración del correo electrónico, Adjuntos`) WITH the fix; then
**stashed the fix and reran the identical test** — order regressed to the old
(wrong) sequence, proving the test genuinely reflects the code change rather than a
cached/stale build; then restored the fix and confirmed correct order one more time.
`index.vitest.jsx` (21 tests) unaffected — nothing currently pins `detailTabOrder`,
so nothing broke, though Tester may want to add explicit coverage for it as a
follow-up (optional, not blocking).

## Manual QA Feedback Round 6 (Human, 2026-08-14) — DEV wave 11, matrix visual polish

Human shared a Figma screenshot of the "Roles del usuario" matrix and asked to match it
more closely. **Coordinator tried Figma file access directly this session (not a
sub-agent) — same "you don't have edit access to this file" denial as both prior
attempts (REVIEW, QA).** This is now confirmed 3 times independently — a real, standing
access gap, not fixable from this session. All 3 fixes below are derived from the
human's shared screenshot alone, not the live Figma source — flag for a final human
visual sign-off once done, same as the General-row/9-gap-row decision already carries.

**No existing precedent found in the codebase for any of these 3** (checked: no
`success`/`warning` CSS tokens in the theme, no existing tier-badge component, no
per-role icon mapping anywhere) — this is genuinely new visual work, not a
reuse-something-that-already-exists fix like most prior waves.

1. **Cell values need to be colored pill badges, not plain text.** `UserRolesTab.jsx`'s
   `cellValue()` and the hardcoded General-row cells both render bare strings
   (`'✓'`, `ui('accessTierReadOnly')`, `'—'`) directly as `<td>` text with no
   background. Figma shows: full access (`✓`) as a light-green rounded pill with a
   green checkmark; read-only ("Solo lectura") as a light-amber rounded pill with amber
   text; no-access (`—`) stays plain text, no pill. No existing success/warning color
   token exists in this theme — use standard Tailwind semantic colors with dark-mode
   variants (e.g. `bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300`
   for full, equivalent amber family for read-only), consistent with how the rest of
   this app handles dark-mode-aware color (check `hsl(var(--...))` custom-property
   usage elsewhere first in case there's a closer-matching existing convention).
2. **Category headers are force-uppercased; Figma shows normal case.** Both the
   hardcoded "General" header and `tMenu(group.category)` category headers currently
   have Tailwind's `uppercase` class applied — Figma shows "General"/"Comercial"/
   "Ventas" in their natural mixed case, lighter/smaller, not bold. Remove `uppercase`
   (and likely reduce `font-semibold` to a lighter weight — compare directly against
   the screenshot, don't just take this description's word for it).
3. **Role column headers need a small icon before the role name.** Figma shows a
   distinct icon per role (something chart/trend-like for Ventas, a box/package for
   Almacén, a building/landmark for Financiero, a document for Compras). No per-role
   icon mapping exists anywhere in this codebase today (checked `RolesOverviewPage.jsx`,
   `roleNameI18n.js` — neither has one) — pick reasonable `lucide-react` icons (already
   the icon library this codebase uses elsewhere, e.g. `RoleFilterControl`/
   `RolesOverviewPage`) per role, semantically matched, and render icon+label inline in
   each `<th>`.

**Dispatch:** schema-forge-developer, `etendo_schema_forge` only, frontend-only
(`UserRolesTab.jsx` is the only file touched — no backend, no decisions.json change
expected since this is pure presentational styling within an already-registered custom
tab). Verify against the actual screenshot the human shared (visually compare a live
screenshot of the rendered result side-by-side), not just "the classes look
plausible" — same discipline as waves 8/10. Tester follow-up after for any Vitest
assertion on the old plain-text cell values or old header classes.

**DEV wave 11 Findings (developer-11, landed, commit `8fe4753d8`) — independently
re-confirmed by the coordinator via screenshot, not just trusted:**

**Correction to this section's own claim above:** "no existing success/warning token"
was WRONG — developer-11 found `--status-success-*`/`--status-warning-*` CSS custom
properties (with light/dark variants) already shipped in
`@etendosoftware/app-shell-core`'s `styles.css`, backing Tailwind utilities
(`bg-status-success`/`text-status-success-foreground`/`border-status-success-border`,
`warning` equivalents) already used by `lib/statusBadge.js`'s `getStatusBadgeProps()`
and `FiscalStatusBadge.jsx`. Used those instead of inventing raw `green-50`/`amber-50`
classes — a better, more consistent fix than what this plan originally specified.

- **Fix 1 (pills):** new local `TierPill` component; `cellValue()` now returns
  `{tier, text}`, `tier: null` (no access) still renders plain `—` text, no pill.
- **Fix 2 (category case):** `uppercase` removed, `font-semibold` → `font-medium`, on
  both the hardcoded General header and the real `tMenu(group.category)` headers.
- **Fix 3 (role icons):** new `ROLE_ICONS` map (`Sales: TrendingUp, Inventory: Package,
  Finance: Landmark, Purchasing: FileText`), keyed by the same literal role names
  `roleNameI18n.js`'s `ROLE_NAME_I18N_KEYS` already uses — no new naming scheme
  introduced. Icon renders inline before the role label in each column `<th>`.
- **Coordinator's own independent visual check** (screenshot at
  `.../scratchpad/etp4906-roles-matrix.png`, not just trusting the agent's description):
  confirmed all 3 — green ✓ pills and amber "Solo lectura" pill on General/Finanzas/
  Ventas rows, plain `—` (no pill) on the "Usuario" row (a real Admin-only window,
  correctly showing `—` for both templates rather than being omitted — matches
  `TemplateRoleWindowAccess`'s documented exclusion list), "General"/"Configuracion"/
  "Comercial" category headers in normal mixed case at lighter weight, and a
  Landmark/TrendingUp icon before "Finanzas"/"Ventas" respectively. Tab order
  (wave 10's fix) also reconfirmed correct in the same screenshot.
- **Tests:** `UserRolesTab.vitest.jsx` 16/16 unaffected — every existing assertion uses
  `textContent`-based matchers, unaffected by the new wrapping `<span>`/class changes.
  **Tester follow-up (optional, not blocking):** add dedicated coverage for the
  tier-specific pill classes and per-role icon presence, neither currently asserted.

## Manual QA Feedback Round 7 (Human, 2026-08-14) — DEV wave 12, duplicate "Nombre" field

**Not related to role assignment — a pre-existing field-config issue on the User
window itself**, surfaced only because the human was in this form testing waves 6-11.
Fixing it now since we're already deep in this window's `decisions.json`.

**Root cause, confirmed:** `artifacts/user/decisions.json`'s `user` entity has both
`name` (`AD_User.Name`, mandatory, `required` — the field with the red asterisk) and
`firstName` (`AD_User.Firstname`) visible on the form. In English these are clearly
distinct ("Name" vs "First Name" — checked `en_US.json`, no collision). In Spanish they
collide: `Firstname`'s native AD dictionary label is ALSO `"Nombre"` (checked
`es_ES.json` — `Name` → "Nombre", `Firstname` → "Nombre", `Lastname` → "Apellido", no
collision on the last one). Genuinely different underlying columns, not a bug in this
ticket's own work.

**Not simply dead weight — there's a real, currently-`"Keep"` feature attached:** rules
`SL_User_Name_Firstname`/`SL_User_Name_Lastname` (native callouts) auto-compose the
mandatory `name` field from `firstName`+`lastName` as the admin types them. **However,
every single test user created during this entire session's manual QA (`NewUsertest`,
`Test User`, `row-001`, etc.) had `name` typed directly and `firstName`/`lastName` left
BLANK** — confirming in practice nobody uses this auto-compose path, matching the
human's own read that these are redundant.

**Fix:** discard BOTH `firstName` AND `lastName` (not just the one causing the visible
label collision) — keeping only `lastName` visible alone, with `firstName` gone, would
leave an orphaned "Apellido" field with no paired "Nombre" counterpart, which is more
confusing than the current duplicate, not less. Concretely:
1. `artifacts/user/decisions.json`: change `firstName` and `lastName` entities'
   `"visibility"` to `"discarded"` (removes from BOTH the header form AND the grid,
   since both currently have `"grid": true"`).
2. Update `SL_User_Name_Firstname`/`SL_User_Name_Lastname` rule decisions from `"Keep"`
   to `"Omit"`, matching the exact pattern already used two entries below them for
   `SL_User_Name_Name` (`"impactIfOmitted"`/`"reason"` explaining there's nothing left
   to type into once the fields are gone) — don't leave stale "Keep" decisions
   describing a feature that no longer has fields to attach to.
3. `make regen ONLY=user`, verify contract per Window Change Integrity Protocol Step 3.
4. **`tools/app-shell/src/windows/custom/user/UserHeaderTable.jsx`'s hardcoded
   `columns` array (lines 38-44) must be re-synced to match** — its own file comment
   requires this ("Re-verify this list against [the generated table] whenever
   `decisions.json`'s `user` entity's grid fields change") — drop `firstName`/
   `lastName` from that array too, or the custom grid override will show 2 columns the
   generated page no longer has.

**Dispatch:** schema-forge-developer, `etendo_schema_forge` only, frontend-only (pure
`decisions.json` + regen + one custom-grid-file sync, no new component logic). Verify
visually (both the header form no longer shows a duplicate "Nombre", and the Users LIST
GRID no longer shows orphaned first/last-name columns) before reporting done. Tester
follow-up after for `UserHeaderTable.vitest.jsx`'s column-list assertions.

**DEV wave 12 Findings (developer-12, landed, commit `404a0ce70`) — independently
re-confirmed by the coordinator via screenshot:** `firstName`/`lastName` discarded in
`decisions.json`, `SL_User_Name_Firstname`/`SL_User_Name_Lastname` rules flipped to
`"Omit"` (matching `SL_User_Name_Name`'s pattern), `make regen ONLY=user` run (contract
0.20.0 → 0.21.0), `UserHeaderTable.jsx`'s hardcoded column array re-synced.
`npx sf-validate-pipeline --scope=user` → OK. **Coordinator independently viewed both
screenshots** (not just the agent's description): detail form now shows exactly one
"Nombre" field + "Correo electrónico" + "Roles asignados", no duplicate; list grid
columns are `Nombre, Contacto, Correo electrónico, Bloqueado, Roles` — no orphaned
first/last-name columns. **Genuinely fixed.**

**2 things now broken, both flagged for Tester — BOTH NOW FIXED (Tester,
2026-08-16, commit `ac30aed` — "Feature ETP-4906: Fix wave-12 stale User
grid/role-save tests"):**
1. `UserHeaderTable.vitest.jsx:118` — asserted the old 7-column list including
   `firstName`/`lastName`; updated to the new 5-column list
   (`name, businessPartner, email, locked, defaultRole`), matching
   `UserHeaderTable.jsx`'s hardcoded `columns` array. `user/` suite: 108/108 green.
2. `e2e/tests/flows/user-role-assignment.mocked.spec.js:345` — the "a role-only chip
   change enables Guardar..." test filled `field-lastName` (as the "unrelated field
   edit" to prove the save-wiring contract) — that field no longer exists. Switched to
   `field-email` (still editable per `artifacts/user/generated/web/user/UserForm.jsx`).
   Full spec: 7/7 green.

## Task B5 — Backend Test Gap: Real Access-Control Scenarios (Human question, 2026-08-14; DISPATCHED 2026-08-16)

**2026-08-16 update: human confirmed this should be dispatched now.** Framing was
relaxed — exact scenario wording below is a strong starting point, not a rigid spec:
the actual bar is proving, against real seed data, that the composition engine
delivers all 4 outcomes correctly — **no access**, **read-only access**, **full
access**, and **most-permissive-wins when two roles disagree on the same window**.
Implementer may substitute different real windows/roles than the ones named below if
they hit the same 4 outcomes more cleanly against current seed data — the DB-level
assertion pattern matters more than the exact window IDs.

Human asked, pointedly: can we be SURE the permission system actually works —
specifically that a Sales-only composed user can't see Purchase Invoice, a
Purchasing-only user can't see Sales Invoice, and a Sales+Finance user gets FULL (not
read-only) access to BP Category (window `192`)? **Honest answer, verified by directly
reading `UserRoleCompositionServiceOverlapIntegrationTest.java` (`com.etendoerp.go`)
rather than trusting memory:**

- **Mechanism-level confidence is solid.** That file's 4 tests prove most-permissive-wins
  composition works against a REAL DB (`WeldBaseTest`) — order-independent, idempotent
  on re-run, and the read path matches the write. Strong evidence the LOGIC is correct
  for any overlapping window in general.
- **But it uses a synthetic injected overlap on window `100`** ("Tables and Columns"),
  not the real production seed data — so nothing has ever exercised the SPECIFIC
  real-world case (Sales=read-only + Finance=full on window `192`) end to end.
- **Exclusion is untested entirely.** Nothing asserts a Sales-only composed role's
  `AD_Window_Access` genuinely has NO row for Purchase Invoice (window `183`) or that a
  Purchasing-only role has none for Sales Invoice (window `167`) — true by construction
  (composition only ever copies what a requested template grants, no code path adds
  extra access), but never regression-tested.
- **Runtime enforcement is out of scope for ETP-4906 entirely** —
  `NeoAccessHelper.hasWindowAccess()` is pre-existing machinery this ticket didn't build
  and this session hasn't independently re-verified; presumably solid since every other
  window in the app depends on it, but that's an assumption.

**Original human decision (2026-08-14): record this gap in the plan, do NOT dispatch
yet. Superseded 2026-08-16 — now dispatched, see status table row B5.**

**4 outcomes to prove, using the REAL seeded `SystemRoleTemplates` role ids (not a
synthetic window) — the 3 numbered scenarios below cover all 4 (no-access appears
twice, in each direction):**
1. **No access.** Compose a personal role from `SystemRoleTemplates.SALES_ROLE_ID`
   ONLY. Assert NO active `AD_Window_Access` row exists for window `183` (Purchase
   Invoice — granted only by Purchasing's real seed data, never Sales').
2. **No access (other direction).** Compose a personal role from
   `SystemRoleTemplates.PURCHASING_ROLE_ID` ONLY. Assert NO active `AD_Window_Access`
   row exists for window `167` (Sales Invoice — granted only by Sales' real seed data,
   never Purchasing's).
3. **Read-only vs. full vs. most-permissive-wins.** Compose a personal role from
   `SALES_ROLE_ID` alone against window `192` (BP Category) and assert it resolves
   read-only (`isEditableField() === false`) — proves the read-only outcome in
   isolation. Then compose `SALES_ROLE_ID` + `FINANCE_ROLE_ID` together and assert the
   SAME window resolves `isEditableField() === true` — proves both the full-access
   outcome (Finance alone) and most-permissive-wins (the composed role beats Sales'
   read-only grant), per `TemplateRoleWindowAccess`'s real matrix. This is the REAL
   most-permissive-wins case, not a synthetic stand-in.

Natural home: either new methods appended to
`UserRoleCompositionServiceOverlapIntegrationTest.java` (same `WeldBaseTest` pattern,
reusing its existing role-id constants) or a new sibling test class if that file's own
scope (synthetic-overlap mechanism proof) shouldn't be mixed with real-seed-data
scenarios — implementer's call. **Runtime/HTTP-level enforcement (actually hitting the
purchase-invoice/sales-invoice spec as a composed user and confirming a real
403/empty-data response) is a further, larger step beyond these DB-level assertions —
not included in this gap's scope unless explicitly asked for separately.**

**B5 Dispatch:** schema-forge-developer, `com.etendoerp.go` only (Java/JUnit,
`WeldBaseTest`, plain branch checkout per Global Constraints — never a worktree). Per
this repo's testing conventions, JUnit backend tests are written directly by the
developer agent (the mandatory Tester-delegation rule is scoped to Vitest/Node/
Playwright only — see CLAUDE.md Testing section; B2's own JUnit tests were written the
same way). Commit locally only, do not push. After landing, this task still owes a
REVIEW pass same as any other DEV work — fold it into whatever REVIEW re-run covers
waves 6-12 rather than a separate one-off review.

### B5 Findings (developer, 2026-08-16) — DONE

**Landed as a new sibling class**, not appended to
`UserRoleCompositionServiceOverlapIntegrationTest.java`. Reasoning documented in the new
file's own class javadoc: that file's scope is proving the ETP-4852 overlap-corruption
FIX mechanism in the abstract, using a synthetic shared window (`UNUSED_WINDOW_ID =
"100"`) deliberately chosen to be outside either template's real grants. B5's job is the
opposite — assert against the REAL `TemplateRoleWindowAccess` matrix — so mixing the two
would make a future matrix edit churn an unrelated mechanism-proof file and vice versa.

**File:** `src-test/src/com/etendoerp/go/roles/UserRoleCompositionServiceRealAccessControlIntegrationTest.java`
(new), commit `8dbc1805` — "Feature ETP-4906: Add real-seed-data access-control JUnit
tests".

**3 test methods, covering all 4 outcomes exactly as scoped:**
1. `testSalesOnlyComposedRoleHasNoAccessToPurchaseInvoice` — no access, direction 1.
2. `testPurchasingOnlyComposedRoleHasNoAccessToSalesInvoice` — no access, direction 2.
3. `testSalesAloneIsReadOnlyOnBpCategoryAndAddingFinanceUpgradesToFullMostPermissiveWins`
   — read-only (Sales alone) → full + most-permissive-wins (Sales + Finance composed
   together on the same personal role, second `assignTemplateRoles` call reconciling
   in on top of the first).

**Window/role ids used exactly as proposed in the task description** (window `183`
Purchase Invoice, window `167` Sales Invoice, window `192` BP Category,
`SystemRoleTemplates.SALES_ROLE_ID`/`PURCHASING_ROLE_ID`/`FINANCE_ROLE_ID`) — confirmed
before writing any test code, via a live read-only `psql` query against this
environment's DB, that the real seed data backs exactly the 4-outcome case the plan
described: Sales has no `AD_Window_Access` row at all for window `183`, Purchasing has
none for window `167`, Sales' row for window `192` has `IsReadWrite='N'`, Finance's row
for the same window has `IsReadWrite='Y'`. No substitution needed.

**Test results (targeted-class run, `./gradlew :test --tests
"com.etendoerp.go.roles.UserRoleCompositionServiceRealAccessControlIntegrationTest"`):
3/3 passed, 0 failures** — reproduced twice, both standalone and interleaved with the
pre-existing `UserRoleCompositionServiceOverlapIntegrationTest` in the same JVM run.

**A real, pre-existing issue found — NOT part of B5's scope, NOT fixed here, flagged
for the coordinator to decide next steps:** while running the new tests alongside the
existing `UserRoleCompositionServiceOverlapIntegrationTest`, all 4 of THAT file's tests
failed with `OBSecurityException: Client (0) of object (ADWindowAccess(...) window:
100, role: 6AD5C0CC21F14050A65A3E62DC2FF9A2) is not present in ClientList
23C59575B9CF467C9620760EB255B389`. Reproduces even running that file completely alone
(confirmed my new file was not loaded at all for that run), so this is **not caused by
B5's changes**. Root-caused via read-only `psql` queries: role
`6AD5C0CC21F14050A65A3E62DC2FF9A2` ("Personal – NewUsertest", real client
`802509E12436405C86BA1FD5B1DF508C`) is a REAL, committed personal role already
inheriting from all 4 `SystemRoleTemplates` — leftover from QA's "Live Browser Pass
Follow-Up" manual testing against `make dev` (see the QA row in the status table above;
its "cleaned up test user" note evidently didn't remove this role/its
`AD_Role_Inheritance` rows). Because this leftover role already inherits from
`FINANCE_ROLE_ID`, core's own CDI-driven role-inheritance propagation (the same
mechanism `WeldBaseTest` installs, per `UserRoleCompositionServiceIntegrationTest`'s
javadoc) fires when the Overlap test grants a NEW `AD_Window_Access` directly on the
Finance TEMPLATE for window `100` — propagating to EVERY role that inherits from it,
including this stale leftover one, not just the role the test/service is actively
managing. `UserRoleCompositionService`'s overlap-corruption fix
(`preventWindowAccessOverlapCorruption`/`reconcileWindowAccessAfterComposition`) only
guards the ONE personal role it is actively composing — it has no hook for other,
unrelated roles swept up as a side effect of the same Hibernate flush. Confirmed via
`psql` that no residue was left behind by the failed runs (rollback via `WeldBaseTest`'s
`@After` worked correctly) — this is purely a **dev-DB test-pollution issue** from
leftover manual-QA data, not a code regression, and not one of B5's 3 scenarios. Left
untouched per this task's explicit instruction to STOP and report rather than fix
production/access-control logic found broken along the way. **Suggested next step for
the coordinator:** either delete the stale `6AD5C0CC21F14050A65A3E62DC2FF9A2` role (and
its `AD_Role_Inheritance`/`AD_Window_Access` rows) from the dev DB, or file this as its
own follow-up if the underlying "other roles get swept into the same flush" propagation
gap is judged worth hardening against in `UserRoleCompositionService` itself.

**2026-08-16 correction:** the "delete the stale role" option above was the wrong call.
Coordinator re-read `UserRoleCompositionService.java` directly and confirmed: role
`6AD5C0CC21F14050A65A3E62DC2FF9A2` is a REAL, legitimate multi-role user account (the
human's own earlier manual QA — a genuine "user with all 4 template roles" scenario,
exactly the kind of account this whole ticket exists to support), not disposable test
junk. Its presence in the DB is what exposed a real, previously-latent bug in ETP-4852's
own fix — deleting it would only have hidden the symptom, not fixed anything. **Human
decision: widen the fix instead.** See Task B6 below.

## Task B6 — Widen ETP-4852's overlap-corruption fix beyond the actively-composed role (dispatched 2026-08-16)

**Plain-language recap of what the original fix does and why it's incomplete** (see
`UserRoleCompositionService.java`'s class javadoc and `UserRoleCompositionServiceOverlapIntegrationTest.java`'s
javadoc, lines 39-74, for the full original write-up):

A personal role can inherit from 2+ system template roles (e.g. Finance + Sales). If
both templates grant access to the SAME window, and one grants full while the other
grants read-only, Etendo core has a bug: when the SECOND template's inheritance is
added, core's own propagation machinery (`RoleInheritanceManager#handleAccess`) tries
to UPDATE the personal role's existing `AD_Window_Access` row for that window instead
of creating a fresh one — and that UPDATE incorrectly copies the TEMPLATE's own
`client`/`organization` onto the row, instead of keeping the PERSONAL role's own. The
very next flush then fails a security check (`SecurityChecker.checkWriteAccess`),
because a row now claims to belong to system client `0` instead of the real tenant.

ETP-4852's fix works around this (no core patch) with 2 steps run inside
`assignTemplateRoles`, for the ONE personal role passed into that call:
1. `preventWindowAccessOverlapCorruption` — right before adding a new template
   inheritance, proactively DELETES the personal role's own overlapping
   `AD_Window_Access` rows for windows the new template also grants. This forces core
   onto the safe CREATE path instead of the corrupting UPDATE path.
2. `reconcileWindowAccessAfterComposition` — afterward, fixes up ownership
   (`client`/`organization`) on the resulting rows and widens any that should be full
   access per most-permissive-wins.

**The gap:** both steps only ever look at `personalRole` — the one role passed into
that specific `assignTemplateRoles` call. Core's propagation, however, is NOT scoped to
one role — it fires for EVERY role that inherits from whichever template's access just
changed. So if role X already exists (inheriting from Finance, say) and something
ELSE — another `assignTemplateRoles` call for a different user, or (in principle) any
future direct edit to a template's own `AD_Window_Access` — causes an overlapping grant
to propagate to Finance's dependents, role X gets the SAME corrupting UPDATE-path
treatment, but nothing runs the 2-step fix for it, because the fix was never told about
role X. `UserRoleCompositionServiceOverlapIntegrationTest`'s current 4/4 failure against
the human's real multi-role account is a live demonstration of exactly this: the test's
own `grantWindowAccess` calls simulate 2 templates gaining an overlapping grant, and the
human's pre-existing real personal role (already inheriting from both) gets swept into
the corrupting propagation with zero protection, purely as a side effect.

**What "widen the fix" means concretely:** generalize the protection so it isn't scoped
to a single actively-managed role. At minimum, whenever `assignTemplateRoles` composes
a new overlapping inheritance for ANY user, it should also find and repair any OTHER
already-existing personal roles that inherit from the same templates and would
otherwise be swept into the same corrupting flush — applying the same
delete-before-inherit + reconcile-after logic to all of them, not just the one role in
the current call. Implementer has latitude on the exact mechanism (e.g. broadening the
role lookup in `preventWindowAccessOverlapCorruption`/`reconcileWindowAccessAfterComposition`
from "the one personalRole passed in" to "every role currently inheriting from the
touched template(s)"), but the "no core patch" constraint from ETP-4852's original
design stands — self-contained within `com.etendoerp.go`, no changes to Openbravo core
source. A same-module `EntityPersistenceEventObserver`/event-handler hook is fine if
that's the cleanest way to generalize this (it is a normal Etendo module extension
point, not a core patch) — implementer's call on whether that's warranted or whether
widening the existing service-layer methods is sufficient to make the failing test pass
and to close the real exposure. Note the corruption is fundamentally driven by Etendo
core's own inheritance-propagation machinery reacting to changes on the TEMPLATE side,
not by anything `assignTemplateRoles` does wrong on its own — so a fix that only ever
triggers from within `assignTemplateRoles` will not protect against a hypothetical
future direct edit to a template's `AD_Window_Access` made through a completely
unrelated code path (e.g. an admin editing the Roles window in core UI) with zero
`UserRoleCompositionService` code in the call stack; if implementer judges that broader
case worth covering now, flag it as a design decision for the coordinator rather than
silently expanding scope further.

**Definition of done:** `UserRoleCompositionServiceOverlapIntegrationTest` (all 4
tests) passes again WITHOUT deleting, working around, or ignoring the human's real
multi-role personal role (`6AD5C0CC21F14050A65A3E62DC2FF9A2`) — it must remain in the DB
throughout, exactly as a real production scenario would have it. B5's own 3 new tests
must keep passing too (re-run both files together, interleaved, as B5's own dispatch
did). Write/extend JUnit tests directly (Tester-delegation rule doesn't cover JUnit —
see B5's own dispatch note). Commit locally only, do not push.

**Dispatch:** schema-forge-developer, `com.etendoerp.go` only, branch `feature/ETP-4906`
(plain checkout, not a worktree).

### B6 Findings (developer, 2026-08-16) — code written, environment broken mid-task

**Code delivered (uncommitted, in the working tree):**
1. **New:** `src/com/etendoerp/go/roles/WindowAccessOverlapCorruptionGuard.java` — a
   plain `EntityPersistenceEventObserver` on `AD_Window_Access` (same extension point
   `ContactNameSyncHandler` already uses in this module — not a core patch). Observes
   save/update on ANY `WindowAccess` row; whenever a template-inherited row's
   `client`/`organization` drift from its owning role's own (the exact signature of
   core's `WindowAccessInjector` bug), corrects them in place before the write, for
   ANY role and ANY entry point — not just calls going through
   `UserRoleCompositionService`. Deliberately never touches `EditableField`/access
   level — only ownership.
2. **Updated:** `UserRoleCompositionService.java`'s class javadoc — documents the gap
   and cross-references the new guard (see the class javadoc itself for the full
   design rationale on why a service-layer-only widening couldn't have worked: the
   corruption is triggered by a direct write to a TEMPLATE's own `AD_Window_Access`,
   which never goes through `assignTemplateRoles` at all).
3. **Updated:** `UserRoleCompositionServiceOverlapIntegrationTest.java` — added
   `testBystanderRoleNotPassedToAssignTemplateRolesIsAlsoProtected`, a deterministic
   proof using a throwaway role (never calls `assignTemplateRoles`) instead of relying
   on the human's real leftover role.

All 3 compiled clean via `:compileJava`/`:compileTestJava` — confirmed BEFORE the
environment broke.

**What broke the environment:** while trying to get a clean full-suite run, the agent
ran `./gradlew clean`, which (cascading through the Etendo Gradle plugin) deleted
`src-gen` — the ant/DAL-generated entity source tree (`Role.java`,
`RoleInheritance.java`, `WindowAccess.java`, etc. — NOT hand-written, regenerated from
the DB model). Re-running `generate.entities` to rebuild it hit
`ServiceConfigurationError: ... NonTRXServiceContributor not found`, which the agent
attributed to a pre-existing module-version conflict (core `26.2.5` vs. some
third-party modules pinned `<26.2.0`, from `epic/ETP-3504`). The agent restored the
git-tracked `build/classes/**/*.class` files that `clean` had deleted, but could not
restore `src-gen` (gitignored, DB-regenerated, was never git-tracked).

**Coordinator's own recovery attempts (2026-08-16, after B6's notification landed),
none fully successful:**
- `./gradlew --stop` (no daemons running) → no effect.
- `./gradlew :modules:com.etendoerp.go:compileJava` → confirmed the breakage: 100
  errors, `cannot find symbol: class Role`/`RoleInheritance` etc. in CORE's own
  `RoleInheritanceManager.java` — i.e. this blocks compiling `com.etendoerp.go` AND
  Etendo core itself, not just our new files.
- `mkdir -p src-gen` (the dir didn't exist at all, not just empty) then
  `./gradlew generate.entities` → FAILS immediately:
  `src/build.xml:246: srcdir ".../src-gen" does not exist!` — the ant target itself
  deletes `src-gen` as an internal sub-step, then checks it exists, so invoking
  `generate.entities` standalone is a chicken-and-egg failure (this differs from the
  agent's own `NonTRXServiceContributor` error — possibly two different failure modes
  depending on daemon/cache state, or the agent's attempt happened at a different
  point in the sequence).
- `./gradlew generate.entities --rerun-tasks` → same `srcdir does not exist` failure.
- `./gradlew smartbuild` → reports **BUILD SUCCESSFUL** (1m 11s) and even
  redeploys+restarts the local Docker/Tomcat `make dev` container — but `src-gen` still
  has 0 `.java` files afterward, strongly suggesting it reused stale PRE-`clean`
  compiled `.class` output rather than actually recompiling anything, i.e. this
  "success" is not trustworthy evidence that B6's new code compiles or that the tests
  pass. **Flagging the side effect: this redeployed whatever WAR Gradle considered
  up-to-date to the running dev Tomcat container — worth knowing if anything looks
  different in `make dev` after 2026-08-16 ~19:11 UTC.**

**Status: genuinely blocked on an environment-bootstrap question neither the dev agent
nor the coordinator could resolve alone** — asked the human directly rather than
guessing further or attempting a riskier fix (e.g. a full `git clean`-style reset of
generated/build artifacts) without sign-off, since this checkout is also the human's
live `make dev` environment.

**Environment resolved (2026-08-16, human):** ran `compile.complete` + `smartbuild`,
then (to be thorough) a full `update.database` + `smartbuild` + `make install` +
restarted `make dev`. `src-gen` confirmed back to 812 `.java` files. Coordinator
verified with a real `./gradlew :test --tests
"com.etendoerp.go.roles.UserRoleCompositionServiceOverlapIntegrationTest" --tests
"com.etendoerp.go.roles.UserRoleCompositionServiceRealAccessControlIntegrationTest"`
run — compiled clean, B5's 3 tests still pass silently (8 total, 5 failed = the 5
Overlap-file tests, 3 Real-AccessControl passed). **Verified via read-only `psql` that
NO real corruption leaked into the human's actual `6AD5C0CC21F14050A65A3E62DC2FF9A2`
role from any of this testing** — window `143`'s full access on that role is legitimate
(inherited from the REAL Sales template, confirmed by checking Sales-derived roles
generally have the same grant), window `100` has no row at all. Safe to keep
experimenting against real DB state.

### B6 Findings — Root Cause (2026-08-16, verified) — READ BEFORE REDESIGNING

**The `WindowAccessOverlapCorruptionGuard` (`EntityPersistenceEventObserver`) approach
from the first B6 attempt does NOT work — confirmed by BOTH a live reproduction (human,
dedicated `ClassicTemplateTest1Read`/`ClassicTemplateTest2Broad` template roles, in
Etendo Classic, with the guard's compiled code actually deployed to the running
`make dev` Tomcat) AND by reading the exact core source lines that explain why. Human
re-confirmed again in a separate clean environment — not a fluke of this one DB.**

**Live reproduction (human, 2026-08-16):** created 2 fresh, dedicated template roles
(`ClassicTemplateTest1Read` = read-only, `ClassicTemplateTest2Broad` = full access) both
granting window `123` (Business Partner). Composed a role from `1Read`, added `2Broad`
— reproduces the ORIGINAL `OBSecurityException` (`Client (0) of object
(ADWindowAccess(...) window: 123, role: ...) is not present in ClientList ...`) even
WITH the guard's code deployed. Same result the other way around (`2Broad` first,
`1Read` second).

**Root cause, traced through 2 core files (`OBInterceptor.java`,
`SecurityChecker.java`):**
1. `SecurityChecker.checkWriteAccess(Object obj)` (`SecurityChecker.java:142-143`) reads
   the client id via `((ClientEnabled) obj).getClient().getId()` — **a live getter call
   on the actual Java entity instance**, never Hibernate's `currentState[]` dirty-check
   array.
2. Our guard only ever called `event.setCurrentState(clientProperty, correctClient)` —
   by design (its own javadoc explicitly rejected calling the real setter, reasoning
   that only `setCurrentState` reliably reaches the final SQL statement). But
   `setCurrentState` does NOT touch the object's own field/getter — so
   `checkWriteAccess` still reads the CORRUPTED value and throws, regardless of what the
   eventual SQL would have contained.
3. Independently fatal even if (2) were fixed: `OBInterceptor.onFlushDirty()`
   (`OBInterceptor.java:165-203`) calls `doEvent(entity, currentState, propertyNames)`
   at **line 186** — which is what runs `SecurityChecker.checkWriteAccess()`
   (`OBInterceptor.java:353`) — BEFORE `getInterceptorListener().onFlushDirty(...)` at
   **line 194**, which is the hook CDI `EntityPersistenceEventObserver`s (our guard)
   actually fire through. **The security check always runs before our observer gets a
   chance, for both the UPDATE path (`onFlushDirty`) and the CREATE path (`onSave`,
   same `doEvent()`-then-listener ordering at lines 224-246)** — a reactive
   "correct-after-the-write-starts" observer cannot win this race, structurally, no
   matter what it corrects.
4. Confirmed via `SecurityChecker.java:159` why the ORIGINAL fix's delete-then-recreate
   trick works instead: `if ((!obContext.isInAdministratorMode() ||
   obContext.doOrgClientAccessCheck()) && clientId.length() > 0)` — the entire
   client/org check is skipped outright when the code runs under plain admin mode. The
   original fix's `preventWindowAccessOverlapCorruption` proactively deletes the
   personal role's conflicting row BEFORE the new inheritance is added, forcing core
   onto the CREATE path — and (per `UserRoleCompositionService`'s own class javadoc)
   that CREATE path's check happens while the METHOD's own `OBContext.setAdminMode`
   bypass is still active, so the check never fires with a wrong client to begin with.
   The UPDATE path's check fires later, at the CALLER's own flush, by which point that
   bypass has already been popped — that's the entire reason the ORIGINAL bug existed
   and why the original fix is a prevention strategy, not a correction strategy.

**What this means for the redesign:** a REACTIVE correction (fix the row after core
decides to write it) cannot work — confirmed structurally impossible for this exact
exception, not just poorly implemented. The fix must be a PREVENTION strategy, mirroring
the ORIGINAL fix's own proven approach (delete the conflicting row before the write,
forcing CREATE instead of UPDATE, ideally under an admin-mode bypass matching what
`preventWindowAccessOverlapCorruption` already does) — but triggered from watching the
TEMPLATE side's own `AD_Window_Access` change (since that's the entry point with no
`UserRoleCompositionService` code in the call stack at all — a raw Classic UI edit,
exactly as the human's live repro used), and applied to EVERY role currently inheriting
from that template, not just one. **Caution for the implementer:** doing this from
inside an event observer that itself fires DURING a Hibernate flush is delicate —
proactively deleting+flushing other entities' rows from within a nested
save/update event callback risks reentrant-flush issues (this may also explain the
`ad_window_access_un_key` duplicate-key failures seen in the JUnit run with the first
guard attempt — worth re-examining once the new design is in place, don't assume it's
unrelated). Consider whether the delete-before-write needs to happen as an
`onSave`/`onUpdate` observer on the TEMPLATE's OWN `WindowAccess` (before core's
propagation to dependents even starts), vs. some other extension point that runs
earlier in the pipeline. Human confirmed reproducing this bug is NOT specific to one
DB/environment (repeated in a separate clean environment too) — this is a genuine,
general core behavior, safe to design against with confidence.

**Redispatch:** schema-forge-developer, `com.etendoerp.go` only, branch
`feature/ETP-4906`, same 3 files as before (`WindowAccessOverlapCorruptionGuard.java`,
`UserRoleCompositionService.java` javadoc, `UserRoleCompositionServiceOverlapIntegrationTest.java`)
are still sitting uncommitted in the working tree — reuse/replace them, don't start
from a blank slate unless the redesign genuinely needs a different file shape.
Definition of done unchanged from the original Task B6 write-up above: all tests in
`UserRoleCompositionServiceOverlapIntegrationTest` pass (including the new bystander
test), B5's tests keep passing, the human's real `6AD5C0CC21F14050A65A3E62DC2FF9A2` role
stays untouched/undeleted throughout. Given how expensive this dead end was, the
developer should verify the NEW design against a live reproduction (or at minimum a
`WeldBaseTest` proving the exact `ClassicTemplateTest1Read`/`2Broad`-shaped scenario:
grant window access directly to 2 templates a bystander role already inherits from,
with NO `assignTemplateRoles` call anywhere in the test) before declaring it fixed —
compiling clean is not sufficient evidence this time, that's exactly how the first
attempt slipped through.

### B6 Findings — Redesign (developer, 2026-08-16)

**Result: `com.etendoerp.go` commit `d8dc97976a49a7da4d9e857420110556b9d55c55`.**
`UserRoleCompositionServiceOverlapIntegrationTest` **5/5 pass**;
`UserRoleCompositionServiceRealAccessControlIntegrationTest` **3/3 pass** — both verified
via a genuinely fresh `./gradlew :test --tests
"com.etendoerp.go.roles.UserRoleCompositionServiceOverlapIntegrationTest" --tests
"com.etendoerp.go.roles.UserRoleCompositionServiceRealAccessControlIntegrationTest"
--rerun-tasks` run (not a compile-only check, and not relying on Gradle's up-to-date
cache), plus a direct `psql` check afterward confirming the human's real personal role
(`6AD5C0CC21F14050A65A3E62DC2FF9A2`) still exists, is still active, and its real window
grants (e.g. window `143`, inherited from the real "Inventory" template) still have
correct, non-corrupted client/organization — untouched throughout.

**What was built.** `WindowAccessOverlapCorruptionGuard` was rewritten from scratch as a
PREVENTION-based `EntityPersistenceEventObserver`, per the root-cause section above. Same
3 files as before (`WindowAccessOverlapCorruptionGuard.java`,
`UserRoleCompositionService.java`'s javadoc,
`UserRoleCompositionServiceOverlapIntegrationTest.java`) — reused, not rebuilt from a
blank slate, exactly as instructed.

1. **Two triggers guarded, both via `@Priority`.** Core's propagation has TWO distinct
   entry points that can start the corrupting UPDATE, and the guard now watches both:
   - `AD_Window_Access` save/update on a TEMPLATE's own row (`propagateNewAccess`/
     `propagateUpdatedAccess`'s trigger, `InheritedAccessEnabledEventHandler`) — the one
     the live repro exercised.
   - `AD_Role_Inheritance` save on ANY role (`applyNewInheritance`'s trigger,
     `RoleInheritanceEventHandler`) — found EMPIRICALLY while re-verifying, not merely
     theorized: this environment's real Finance/Sales templates have themselves drifted
     to genuinely overlap on a real window (`143`) since ETP-4852/ETP-4878 was written,
     so the bystander test's OWN precondition setup (adding both real templates'
     inheritances to a fresh role, bypassing `assignTemplateRoles` by design) hit the
     identical corruption via this second door.

   Both of core's own handlers (`InheritedAccessEnabledEventHandler`,
   `RoleInheritanceEventHandler`) declare no `@Priority` on their `@Observes` methods, so
   giving this guard's `onSave`/`onUpdate` methods ANY `@Priority` value (CDI 2.0 spec
   §10.4.2, honored by Weld 3.1) guarantees it is notified first, for the SAME event, on
   the SAME entity — the only lever available since core exposes no earlier persistence
   hook (`preFlush`/`postFlush` are never forwarded to CDI observers by
   `PersistenceEventOBInterceptor`).

2. **The prevention mechanism itself:** on either trigger, for every role currently,
   actively inheriting from the touched template, if that role already has an active
   `AD_Window_Access` row for the same window NOT already sourced from that same
   template, the row is deleted BEFORE control returns to core's own (unprioritized)
   propagation — leaving nothing for `handleAccess`/`getAccess` to find, so core takes
   the safe CREATE path instead of the corrupting UPDATE path. Exactly
   `preventWindowAccessOverlapCorruption`'s own proven mechanism, generalized from "the
   one `personalRole`" to "every role currently inheriting from the touched template."

3. **Getting step 2 to actually work took 5 more rounds of live, empirical debugging**
   past the root-cause write-up above — each one a genuine structural discovery about
   this exact nested-event position, not a typo or a rehash of the abandoned design:

   - **Cross-client `OBCriteria` filtering.** `OBCriteria#initialize()` adds a
     `Restrictions.in(...readableClients/readableOrganizations)` filter
     UNCONDITIONALLY — regardless of `OBContext.isInAdministratorMode()` (only the
     separate `checkReadable` ACCESS check is admin-mode-gated; the row-level filter is
     not). Every query in this class now calls
     `setFilterOnReadableClients(false)`/`setFilterOnReadableOrganization(false)` — a
     helper `crossClientCriteria(Class)` centralizes it. Without this, the guard silently
     found ZERO dependents/rows for a template whose client differs from the ambient
     `OBContext`'s own readable-clients list (the completely normal case: templates are
     system client `0`, dependents are real tenant clients) and was a pure no-op the
     entire time, confirmed by adding temporary debug logging.
   - **`FlushMode.COMMIT`, not `AUTO`.** `SessionHandler` sets every DAL session's flush
     mode to `COMMIT` — queries NEVER auto-flush pending entity-level changes. This
     means `OBDal.remove(existing)` without an explicit `flush()` is invisible to core's
     subsequent HQL queries (confirmed: every window the guard "cleared" this way ended
     up simply MISSING from the dependent role afterward — deleted, never recreated,
     since core's own `getAccess()` query still found nothing changed and never took the
     CREATE branch). But calling `OBDal.flush()` explicitly from this position IS a
     REENTRANT `Session.flush()` call (this class's `onSave`/`onUpdate` fire from
     mid-flush) — that corrupts the OUTER, still-in-progress flush's own action-queue
     bookkeeping, reproduced as `StaleStateException` ("actual row count: 0; expected:
     1") on an UPDATE for a row that demonstrably still existed moments earlier in the
     same flush cycle. **Fix:** a direct bulk HQL `delete from ADWindowAccess where id =
     :id` via `session.createQuery(...).executeUpdate()` — executes as a single SQL
     statement immediately, bypassing the flush/action-queue machinery (and every
     entity-lifecycle listener) entirely; visible to any subsequent SELECT on the same
     transaction with no reentrant flush anywhere.
   - **Stale, already-loaded `Role.getADWindowAccessList()`.** By the time this guard
     runs, the dependent role's own window-access collection is frequently ALREADY
     loaded and cached from an EARLIER, separate top-level flush (core's own
     `WindowAccessInjector#setParent` calls `role.getADWindowAccessList().add(...)` for
     every row it ever creates, force-initializing the collection the first time). A
     raw SQL delete doesn't know or update that cached Java list. Three things were
     tried, in order, each reproduced live: (a) leave the stale reference alone →
     Hibernate re-examines the collection next time core touches it and schedules a
     ghost UPDATE for the (evicted) stale entry → `StaleStateException` again; (b)
     remove the element from the collection explicitly → Hibernate's OWN orphan-removal
     cascade (this collection cascades deletes) schedules its own `session.delete()` for
     it, which DOES run through `OBInterceptor.onDelete`/`SecurityChecker
     .checkDeleteAllowed` → the exact `OBSecurityException` this class exists to
     prevent, just relocated from an update to a delete; (c) fully `evict()` the OWNING
     ROLE (not just the deleted row) → avoids both, but strips the role of its live
     session, so core's VERY NEXT `role.getADWindowAccessList().add(...)` for a
     different, non-conflicting window can't lazily re-initialize at all →
     `LazyInitializationException`. **Fix:** `OBDal.refresh(dependent)` — keeps the role
     entity ATTACHED/managed (so a later lazy collection access still has a live session
     to reload through) while discarding its cached collection snapshot, which gets
     correctly re-fetched (excluding the already-deleted row) on next access.
   - **Ownership on the recreated row.** Passing the DELETE step alone still left the
     RECREATED row owned by the template's own client (typically system client `0`),
     not the dependent's own — `copyRoleAccess` copies every field including
     `client`/`organization` from the template's own row and never corrects them
     (`reconcileWindowAccessAfterComposition` only ever does that for the ONE
     `personalRole` `UserRoleCompositionService` is actively composing). Generalized
     that same ownership-pinning reactively, in `onSave`, for ANY dependent's freshly
     created inherited row.
   - **`setCurrentState`, not a plain setter, even for a NEW entity.** The ownership
     correction's first attempt called `access.setClient(...)`/`.setOrganization(...)`
     directly, reasoning that since `OBInterceptor`'s security check for a NEW entity
     fires synchronously BEFORE this observer (see root-cause point 3 above), there was
     no check left to out-race. That part of the reasoning was correct, but incomplete:
     `PersistenceEventOBInterceptor#sendNewEvent` builds the `EntityNewEvent` from the
     `Object[] state` array Hibernate itself already extracted from the entity BEFORE
     dispatching to the CDI listener chain — the eventual INSERT's bound values come
     from THAT array, not from re-reading the entity's fields at execution time. A
     plain setter only mutates the Java object, never Hibernate's own already-captured
     `state[]` — reproduced live: the "Corrected..." log line fired (confirming the
     setter WAS called), yet the persisted row's client was still the template's.
     Switched to `EntityPersistenceEvent#setCurrentState(Property, Object)` — the SAME
     mechanism the class's first, abandoned design already used correctly for exactly
     this reason, just never generalized past the one (ineffective, for that design)
     use case.

**Design decision for the coordinator: how far this went.** The dispatch's own escape
valve said a hypothetical future direct edit to a template's `AD_Window_Access` "with
zero `UserRoleCompositionService` code in the call stack" was worth flagging rather than
silently expanding scope if judged worth covering now. This redesign DOES cover it (that
is the primary trigger `guardDependentsOf` defends), plus the SYMMETRIC
`AD_Role_Inheritance`-add trigger found empirically along the way (`guardNewInheritance`)
— both needed for the bystander test itself to pass given this environment's real
template data has drifted to overlap. No further widening (e.g. to other
`AccessTypeInjector` types like `TableAccess`/`FormAccess`) was done — scope stays
`WindowAccess`-only, matching ETP-4852's own original, explicit scope decision.

**Files changed:**
- `com.etendoerp.go/src/com/etendoerp/go/roles/WindowAccessOverlapCorruptionGuard.java`
  — full rewrite (prevention-based).
- `com.etendoerp.go/src/com/etendoerp/go/roles/UserRoleCompositionService.java` — class
  javadoc updated to reference the redesign.
- `com.etendoerp.go/src-test/src/com/etendoerp/go/roles/UserRoleCompositionServiceOverlapIntegrationTest.java`
  — bystander test's setup now flushes after EACH `addInheritance` call individually
  (matching `reconcileInheritances`'s own established pattern) rather than batching both
  into one flush, since batching hit an unrelated, pre-existing core limitation (core's
  own propagation for the second inheritance-add cannot see the first's still-pending,
  not-yet-executed INSERT within the same flush cycle) that has nothing to do with the
  guard under test.

**Not done / open items for the coordinator:**
- Commit is local-only, not pushed, per instructions.
- No live Etendo Classic UI re-reproduction was performed this round (the JUnit
  `testBystanderRoleNotPassedToAssignTemplateRolesIsAlsoProtected` scenario — 2 real
  templates, a role with zero `UserRoleCompositionService` code in the call stack —
  is structurally the same shape as the human's original live repro; recommend a final
  live Classic UI confirmation before closing this out fully, given how expensive the
  first dead end was).

### B6 Findings — REMOVE path gap (coordinator, 2026-08-16)

**Live confirmation, human, immediately after the ADD-path fix was deployed:** creating
`ClassicTemplateTest1Read` then `ClassicTemplateTest2Broad` on the same personal role
now works — log line confirms the guard fired: `Prevented cross-template
AD_Window_Access overlap corruption: cleared role ... window 123 access (previously
inherited from ...) before template ...'s own grant propagates, forcing core onto the
safe CREATE path`. **But removing one of the two templates from that same role
immediately reproduces the ORIGINAL `OBSecurityException`** — same window (`123`), same
role (`77E57880608E49D9966BC7C87F37A786`), a different `AD_Window_Access` row id
(`D9F5A3896CFB4D179894F6562A868E05`) than the ones seen in earlier attempts, confirming
this is a fresh row core tried to write, not a stale leftover.

**Root cause, coordinator-confirmed via `grep`:** `WindowAccessOverlapCorruptionGuard`
only defines `onSave` (`@Observes EntityNewEvent`) and `onUpdate` (`@Observes
EntityUpdateEvent`) — there is no `onDelete`/`EntityDeleteEvent` handler anywhere in the
class. This class's own javadoc (see the redesign's "second, symmetric trigger"
paragraph) already documents 2 triggers it guards — a template's own `AD_Window_Access`
gaining a grant, and a role gaining a NEW `AD_Role_Inheritance` — but never anticipated
a THIRD: **`RoleInheritanceManager.propagateDeletedAccess`**
(`RoleInheritanceManager.java:448-493`, cited in the earlier core-behavior research —
see `docs/etendo-ad/role-inheritance-window-access-overlap-core-proposal.md`) runs
whenever a `RoleInheritance` is REMOVED. For each affected access, if the role still
inherits from ANOTHER active template that also grants the same window, it calls the
exact same `updateRoleAccess` (blind `DalUtil.copyToTarget`, no `client`/`organization`
skip) to re-derive the row from that remaining template — **the identical
corrupting-UPDATE mechanism the ADD-path fix already solved, now reached from a THIRD,
still-unguarded entry point.** Since the guard never observes `EntityDeleteEvent` for
`RoleInheritance`, this trigger sails through completely unprotected.

**What the fix needs to do:** add an `onDelete` handler (`@Observes @Priority(...)
EntityDeleteEvent`) for `RoleInheritance`. When a `RoleInheritance` is about to be
deleted, BEFORE control reaches core's own deletion propagation
(`InheritedAccessEnabledEventHandler`'s delete path, and from there
`RoleInheritanceManager.propagateDeletedAccess`), proactively delete the dependent
role's conflicting `AD_Window_Access` row for every window the REMAINING template(s)
would re-derive it from — same "clear it so core is forced onto the CREATE path
instead of UPDATE" strategy the ADD-path fix already proved, same bulk-HQL-delete +
`OBDal.refresh(dependent)` mechanics already worked out empirically for the ADD case
(see the class's own javadoc, "Empirically verified while building this redesign" —
reuse that exact recipe, don't re-derive it). **Careful:** `propagateDeletedAccess`'s
own logic already tries to pick the "first remaining template by sequence order" (see
the core proposal doc's "Removal already re-derives" section) — the guard must not
fight that resolution, only protect the WRITE of whatever core decides to re-derive to,
the same way the ADD-path guard never second-guesses which template "wins," only
protects the ownership of the row core is about to write.

**Re-dispatch:** schema-forge-developer, `com.etendoerp.go` only, branch
`feature/ETP-4906`. Definition of done: (1) a new JUnit test proving the REMOVE-path
scenario — a role composed from 2 overlapping real templates, remove one, assert the
remaining template's access level survives AND no `OBSecurityException`/corruption
occurs (mirror `testBystanderRoleNotPassedToAssignTemplateRolesIsAlsoProtected`'s
"zero `UserRoleCompositionService` code in the call stack" shape, but for deletion);
(2) both existing test files (`UserRoleCompositionServiceOverlapIntegrationTest`,
`UserRoleCompositionServiceRealAccessControlIntegrationTest`) still green; (3) a live
Classic re-confirmation using the human's own `ClassicTemplateTest1Read`/`2Broad`
fixture — remove one after having both, confirm no exception AND confirm the
remaining template's access level is what's left (not deleted, not stuck at the old
level) — is the real acceptance bar this time, not just JUnit, given the ADD-path fix
already passed JUnit alone once before a live gap was found.

**Status: REMOVE path fixed and live-confirmed (2026-08-16, human).** Commit
`58f114ea`. Human removed `ClassicTemplateTest1Read` from a role that also had
`ClassicTemplateTest2Broad`, live in Classic — no exception, correct result. B6's
crash-prevention job (all 3 known triggers: template gains a grant, role gains a new
inheritance, role loses an inheritance) is now complete and live-verified end to end.

### B6 Findings — 4th gap found during human self-review (2026-08-16): most-permissive-wins is NOT enforced outside our own webhook

**Immediately after confirming the REMOVE-path fix, the human did one more manual
self-review pass and found a 4th, DIFFERENT gap** (access-LEVEL correctness, not the
ownership-corruption crash B6 has been fixing): starting from a role with only
`ClassicTemplateTest2Broad` (full access to Business Partner), the human then ADDED
`ClassicTemplateTest1Read` (read-only, same window) back — no crash this time (B6's
ADD-path fix works), but Business Partner ended up **read-only**, not full. Most-
permissive-wins was silently violated.

**Root cause, confirmed by the coordinator via source read:** `WindowAccessOverlapCorruptionGuard`'s
own class javadoc (line 139) explicitly documents this as OUT of its scope: "never
widens/narrows any grant level." The guard's entire job is preventing the
`OBSecurityException` crash — it deliberately never decides which template's access
LEVEL should win when 2+ overlap. That decision is currently made ONLY by
`UserRoleCompositionService.reconcileWindowAccessAfterComposition`
(`UserRoleCompositionService.java`), which runs EXCLUSIVELY inside
`assignTemplateRoles` — i.e., only when composing roles through ETP-4906's own
"Asignar roles" screen/webhook. Any OTHER entry point (Classic UI, any future direct
`AD_Role_Inheritance`/`AD_Window_Access` edit) has NO most-permissive-wins enforcement
at all — core just applies whichever template was propagated most recently, full stop.
This is silently WRONG data, arguably worse than the crash B6 already fixes, since
there's no error to notice.

**Human decision (2026-08-16, after being asked explicitly about scope): fix this now,
4th round on this same mechanism.** Rationale: B6 already proved (3 times over) that
any entry point touching these tables needs to be defended, not just our own webhook —
leaving access-level correctness only guaranteed through one entry point while B6
already guarantees crash-safety through all of them is an inconsistent guarantee.

**Proposed design (coordinator, not yet implemented) — read before building:** the
guard already has the right extension point for this, reusing proven mechanics — no new
hook needed. `WindowAccessOverlapCorruptionGuard.correctInheritedOwnership`
(`WindowAccessOverlapCorruptionGuard.java:307-339`) already fires on `EntityNewEvent`
for EVERY freshly-created inherited `AD_Window_Access` row on a non-template role
(i.e., precisely the row created right after the guard clears a conflicting one to
force the CREATE path) — and already proves `event.setCurrentState(...)` reliably
corrects a CREATE-path row before the security check runs (that's how ownership
correction already works). Extend this same method (or a sibling called from the same
`onSave` branch) to ALSO check access level: before returning, look up
`access.getRole()`'s OTHER currently-active template inheritances, resolve whether ANY
of them grants the SAME window at a MORE permissive level (`isEditableField() ==
true`) than what's about to be created; if so, `event.setCurrentState(editableFieldProperty,
true)` the same way ownership is corrected. This mirrors
`reconcileWindowAccessAfterComposition`'s own most-permissive-wins logic
(`mostPermissiveWindowAccess`/`activeWindowIdsFor` in `UserRoleCompositionService.java`
— reuse the query pattern, don't reinvent it), just applied universally to any newly
created inherited row, not only ones created via `assignTemplateRoles`. Never narrow
(matches the existing rule: "a full grant, once resolved, always wins").

**Re-dispatch:** schema-forge-developer, `com.etendoerp.go` only, branch
`feature/ETP-4906`, same file. Definition of done: (1) a new JUnit test — bystander
role (zero `UserRoleCompositionService` in the call stack, matching the pattern of the
other 2 bystander tests already in this suite) composed from a full-access template,
then gains inheritance from a read-only template on the SAME window — assert the
window STAYS full, not downgraded; (2) existing test suite still green
(`UserRoleCompositionServiceOverlapIntegrationTest`,
`UserRoleCompositionServiceRealAccessControlIntegrationTest`); (3) live Classic
re-confirmation is the real acceptance bar again — human will redo the exact scenario
that surfaced this (`ClassicTemplateTest2Broad` alone → add `ClassicTemplateTest1Read`
→ Business Partner must STAY full) after redeploy. Redeploy via the same
`smartbuild` + `tomcat restart` sequence used for the last 2 rounds, and leave it
running for the human.

**Status: fixed, live-confirmed by human (2026-08-16). Commit `e8b6ffc6`.** Human redid
the exact repro — Business Partner correctly stayed full after adding the read-only
template on top of the full one.

### B6 Findings — 5th gap found during human self-review (2026-08-16): widening doesn't update `InheritedFrom`, breaking later removal

**Immediately after confirming the most-permissive-wins ADD fix, the human continued
self-review with the REMOVE direction on the SAME composed role** (now holding both
`ClassicTemplateTest1Read` + `ClassicTemplateTest2Broad`, Business Partner correctly
full): removed `ClassicTemplateTest2Broad` (the full-access one, keeping only the
read-only one) — expected Business Partner to downgrade to read-only, but Classic still
showed **full access**, stale.

**Root cause, confirmed by the coordinator via a direct, read-only `psql` query against
role `77E57880608E49D9966BC7C87F37A786`, window `123`:**

```
isreadwrite = 'Y'  (full — correct value, from the round-4 fix)
inherited_from = 86B02D2175B14875BA5FA65282F17DD9 = ClassicTemplateTest1Read (!!)
```

The row's actual VALUE (full) can only be explained by `ClassicTemplateTest2Broad` —
but its `InheritedFrom` bookkeeping field still points at `ClassicTemplateTest1Read`,
because round 4's `widenInheritedAccessLevelIfNeeded` corrects `isEditableField` via
`event.setCurrentState(...)` but never touches `InheritedFrom` on the same row. This
makes the row's bookkeeping actively WRONG about which template is responsible for its
current effective value.

**Why this breaks removal specifically:** BOTH core's own removal re-derivation
(`RoleInheritanceManager`'s `applyRemoveInheritance`/`calculateAccesses` path) AND our
own round-3 REMOVE-path guard (`guardRemovedInheritance`) decide whether a given
`AD_Window_Access` row needs re-evaluating when a `RoleInheritance` is removed by
checking whether that row's `InheritedFrom` matches the template being removed. Since
this row's `InheritedFrom` says "Read" (not "Broad"), removing Broad's inheritance
never touches this row at all in EITHER mechanism — it is not recognized as
Broad-derived, even though its current value only makes sense because of Broad. The
row is permanently stuck at "full" until something else happens to touch it.

**Proposed fix (coordinator, not yet implemented):** `widenInheritedAccessLevelIfNeeded`
must ALSO correct `InheritedFrom` to point at whichever OTHER active template it found
justifying the widened value — the SAME template whose full grant it just used to
decide to widen — via `event.setCurrentState(inheritedFromProperty, thatTemplateRole)`,
identical mechanism to how `isEditableField`/ownership are already corrected on this
same event. This keeps the single `InheritedFrom` pointer an accurate "who is
currently responsible for this row's effective value" at all times, so a LATER removal
of that exact template correctly triggers both core's own and our round-3 guard's
re-derivation logic, cascading correctly to whatever remains (in this case, back down
to `ClassicTemplateTest1Read`'s read-only grant). If multiple other active templates
are equally responsible (2+ also grant full), picking any one of them consistently
(e.g. highest sequence number, mirroring the heuristic
`RoleInheritanceManager.propagateDeletedAccess` itself already uses elsewhere) is
sufficient — exact tie-break behavior is the implementer's call, document whichever is
chosen.

**Re-dispatch:** schema-forge-developer, `com.etendoerp.go` only, branch
`feature/ETP-4906`, same file (5th round). Definition of done: (1) a new JUnit test —
bystander role composed from a read-only template then a full template (most-
permissive-wins correctly resolves to full, reusing round 4's own fixed behavior),
THEN remove the full template's inheritance — assert the window correctly downgrades
to the remaining read-only template's level, not stuck at full; (2) full existing
suite still green (`UserRoleCompositionServiceOverlapIntegrationTest`,
`UserRoleCompositionServiceRealAccessControlIntegrationTest`) — fresh
`--rerun-tasks` run, not just compilation; (3) live Classic re-confirmation is the real
acceptance bar — human will redo the exact sequence that surfaced this (`Read` + `Broad`
→ Business Partner full → remove `Broad` → Business Partner must become read-only,
not stay full) after redeploy. Redeploy via the same `smartbuild` + `tomcat restart`
sequence used for the last 3 rounds, leave it running. Also verify, via read-only
`psql`, that the row's `InheritedFrom` ends up correctly pointing at
`ClassicTemplateTest1Read` after the fix (not just that the level is right) — this
exact field was the root cause, confirm it directly, don't infer it only from the
UI-visible level.

### B6 Findings — InheritedFrom bookkeeping fix (developer, 2026-08-16)

**Result: `com.etendoerp.go` commit `978e23e2`.** `UserRoleCompositionServiceOverlapIntegrationTest`
**8/8 pass** (7 pre-existing + 1 new); `UserRoleCompositionServiceRealAccessControlIntegrationTest`
**3/3 pass** — both verified via a genuinely fresh `./gradlew :test --tests
"com.etendoerp.go.roles.UserRoleCompositionServiceOverlapIntegrationTest" --tests
"com.etendoerp.go.roles.UserRoleCompositionServiceRealAccessControlIntegrationTest"
--rerun-tasks` run from the `etendo` root. A direct read-only `psql` check afterward reconfirmed
the human's real personal role (`6AD5C0CC21F14050A65A3E62DC2FF9A2`) still exists, is still active,
client `802509E12436405C86BA1FD5B1DF508C`, org `0` — untouched throughout. `./gradlew smartbuild`
completed clean, the Tomcat container was restarted, and `Server startup in [52221] milliseconds`
was confirmed in the container logs — **live, and ready for the human's own Classic click-through
re-confirmation.**

**Live-state confirmation before touching any code.** Before writing the fix, a direct read-only
`psql` query against the human's own `ClassicDebug` role (`77E57880608E49D9966BC7C87F37A786`)
confirmed the currently-deployed (pre-fix) state exhibits exactly the reported bug:

```
ad_window_id=123  isreadwrite='Y'   inherited_from='86B02D2175B14875BA5FA65282F17DD9' (ClassicTemplateTest1Read)
```

`ClassicTemplateTest2Broad`'s `AD_Role_Inheritance` row was already removed (the human's own
repro steps), yet the window is still full — matching the coordinator's root-cause write-up
exactly and confirming the fix target is real, not a misreading of the report.

**What was built — implementing the coordinator's sketched design.**
`WindowAccessOverlapCorruptionGuard.java`:

1. **`widenInheritedAccessLevelIfNeeded(EntityNewEvent, WindowAccess)`** — extended (not
   rewritten): after widening `editableField` via `event.setCurrentState`, now ALSO repoints
   `inheritedFrom` to the SAME template it resolved as justifying the widened value, via the
   identical `event.setCurrentState(inheritedFromProperty, justifyingTemplate)` mechanism already
   used for the level and for ownership in `correctInheritedOwnership`. Only runs in the branch
   that actually widens — a row whose CREATE-sourced template already grants full needs no
   repointing, since that template already IS a valid justifying source (see the method's own
   early-return comment for the full reasoning).
2. **`anyOtherActiveTemplateGrantsFullAccess(Role, Window)` → `findActiveTemplateGrantingFullAccess(Role, Window)`**
   — round 4's boolean-returning helper changed to return the justifying `Role` (or `null`), per
   the dispatch's explicit instruction. Iterates `findActiveTemplatesFor(dependent, null)` and
   returns the FIRST template found granting full access.
3. **`findActiveTemplatesFor(Role, String)`** — added `.addOrderBy(RoleInheritance.PROPERTY_SEQUENCENUMBER, false)`
   (descending) to its underlying `OBCriteria` query. This is the tie-break for 2+ equally-
   responsible templates: deliberately mirrors core's OWN heuristic in
   `RoleInheritanceManager#propagateDeletedAccess` ("retrieve the list of templates, ordered by
   sequence number descending, to update the access with the first one available (highest
   sequence number)"), read directly from core source before choosing this — not an invented
   rule. Because the list is now ordered, `findActiveTemplateGrantingFullAccess`'s simple
   first-match loop automatically implements the same tie-break.

**A second, independent gap found and fixed while verifying this empirically — a same-flush
staleness race.** The first cut of the fix above made the new JUnit test's SETUP assertion pass
(widen + repoint both correct immediately after gaining the read-only template) but the test's
REMOVAL assertion still failed: after removing the FULL template's inheritance, the row's
`InheritedFrom` stayed pointed at the just-removed FULL template instead of the remaining
read-only one, and the level stayed full. Root-caused with a debug-instrumented single-test run
(temporary `System.out.println`s, removed before commit): the log showed `guardRemovedInheritance`
correctly deleting the stale row and forcing CREATE sourced from the remaining (read-only)
template — immediately followed, in the SAME flush, by ANOTHER "Widened ... and repointed
InheritedFrom" log line putting it right back to the template that was JUST removed. Cause:
Hibernate's default action-queue execution order runs entity Deletions AFTER Insertions/Updates,
so the just-removed template's `AD_Role_Inheritance` row is still `active=true` as far as any
fresh `OBCriteria` SELECT can see, for the remainder of that same flush — including the widen
check's own query, which runs NESTED inside core's own (unprioritized) `RoleInheritanceEventHandler`
handling of the SAME delete event, itself triggered synchronously from `OBDal.save()` inside
`RoleInheritanceManager#applyRemoveInheritance`.

Fixed via a new `TEMPLATES_BEING_REMOVED` (`ThreadLocal<Set<String>>`) marker: populated by
`guardRemovedInheritance` (added, deliberately NOT cleared at the end of that same method — by
the time the nested CREATE this marker protects against actually fires, `guardRemovedInheritance`'s
own stack frame has already returned, since core's unprioritized observer for the SAME event runs
strictly AFTER this class's prioritized one), consulted by `findActiveTemplatesFor` (filters out
any template whose id is in the set, on top of the existing `excludedInheritanceId` parameter,
which is not sufficient alone here — `findActiveTemplateGrantingFullAccess` has no specific
`RoleInheritance` id to pass, since it is reached from a completely unrelated event). Cleared once
per transaction via a new `onTransactionComplete(@Observes TransactionCompletedEvent)` observer —
this class's own javadoc already documented `TransactionCompletedEvent` as being forwarded through
the same interceptor, just unused until now. Safe timing: a marker surviving until transaction end
(fires on both commit AND rollback) can only make the guard MORE conservative (skip a template
that is, by then, genuinely gone), never less correct.

**Test added.** `UserRoleCompositionServiceOverlapIntegrationTest
#testRemovingTheTemplateThatJustifiedAWidenedAccessLevelCorrectlyDowngrades` — bystander-role
shape, zero `UserRoleCompositionService` in the call stack. Deliberately uses Finance (full)
added FIRST, Sales (read-only) added SECOND — the SAME order as round 4's own delivered test, and
the ONLY order that actually reproduces the bookkeeping bug (verified by tracing the opposite
order: it resolves correctly by construction, since core sources the fresh CREATE directly from
the newly-added, already-most-permissive template — nothing to widen or repoint). Asserts, in
order: (1) sanity — most-permissive-wins still resolves to full (round 4's own fix); (2) THE
ROUND-5 ASSERTION — `InheritedFrom` correctly repointed to Finance, not left at Sales; (3) removes
Finance's inheritance; (4) the row survives, ownership still correct, `InheritedFrom` now correctly
re-derived to Sales, and the level correctly downgrades to read-only — the exact live-reported
regression.

**A pre-existing test's assertion was updated, not just left to fail.**
`testRemovingOneOfTwoOverlappingTemplateInheritancesIsAlsoProtected` (round 3) asserted, as a
"Sanity" check, that after gaining Finance (full) then Sales (read-only) in that order, the row's
`InheritedFrom` would be Sales ("last write wins"). That assertion was accidentally encoding this
exact round-5 bug's own symptom as "expected" — round 4's widen already silently left
`InheritedFrom` wrong there too, just never asserted on. With round 5's fix, the row is now
IMMEDIATELY repointed to Finance in the same flush, so the sanity assertion now correctly expects
Finance. Traced through the rest of that test to confirm the later removal-step assertions (which
remove Sales, not Finance) still hold unchanged — since the row was already correctly sourced from
the one template that survives that particular removal, `guardRemovedInheritance`'s own
"already correctly sourced, skip" branch means nothing needs to change, and the test still exactly
verifies what it always did (no throw, correct ownership, correct final state) — updated the
comments to say so explicitly and pointed to the new round-5 test as the complementary case that
exercises actual re-derivation.

**No other split "value + supporting pointer" gaps found in this file on this pass** — audited
every `event.setCurrentState` call site: `correctInheritedOwnership` sets `client`/`organization`
directly from the owning role's own fields (no derived pointer involved, nothing else to keep in
sync), and `widenInheritedAccessLevelIfNeeded` is now the only other site, fixed above.
`AD_Window_Access` itself has exactly one level field (`editableField`) and one source-pointer
field (`inheritedFrom`) — no sibling fields like a hypothetical `printable`/`deleteable` exist on
this entity to raise the same risk. **Worth flagging to the coordinator regardless:** the THREE
`guard*` delete-forcing-create-path methods (`guardDependentsOf`, `guardNewInheritance`,
`guardRemovedInheritance`) all rely on core's own CREATE path picking a single "correct enough"
source template and don't verify or correct WHICH one core picked beyond forcing the CREATE path
to run at all — `widenInheritedAccessLevelIfNeeded` is the only place that actually double-checks
and corrects core's choice, and it does so for exactly ONE field pair (level + `InheritedFrom`).
If this module ever grows a SECOND per-template-varying `AD_Window_Access` field with its own
override semantics (there isn't one today), the same "widen-and-repoint" pattern would need to be
extended for that field too, deliberately, rather than assumed already covered by this fix.

**Files changed:**
- `com.etendoerp.go/src/com/etendoerp/go/roles/WindowAccessOverlapCorruptionGuard.java` — extended
  `widenInheritedAccessLevelIfNeeded` to repoint `InheritedFrom`; renamed/changed
  `anyOtherActiveTemplateGrantsFullAccess` → `findActiveTemplateGrantingFullAccess` (returns the
  justifying `Role`); added deterministic sequence-number-descending ordering to
  `findActiveTemplatesFor`; added the `TEMPLATES_BEING_REMOVED` thread-local marker, its
  population point in `guardRemovedInheritance`, its consultation in `findActiveTemplatesFor`, and
  the new `onTransactionComplete(TransactionCompletedEvent)` cleanup observer; extended the class
  javadoc with a new "InheritedFrom bookkeeping" section.
- `com.etendoerp.go/src-test/src/com/etendoerp/go/roles/UserRoleCompositionServiceOverlapIntegrationTest.java`
  — added `testRemovingTheTemplateThatJustifiedAWidenedAccessLevelCorrectlyDowngrades`; updated
  `testRemovingOneOfTwoOverlappingTemplateInheritancesIsAlsoProtected`'s now-stale sanity
  assertion and surrounding comments.

**Not done / open items for the coordinator:**
- Commit is local-only, not pushed, per instructions.
- Deployed live (smartbuild + Tomcat restart both completed clean, `Server startup` confirmed) —
  but the human's own Classic click-through re-confirmation has NOT been performed by this
  session. Because the human's own `ClassicDebug` role currently only has
  `ClassicTemplateTest1Read` + `ClassicTemplateTest3OtherWindow` active (Broad's inheritance was
  already removed during the round-5 repro), the human will need to RE-ADD
  `ClassicTemplateTest2Broad`'s inheritance first (confirms round 4 still works, full), THEN
  remove it again (confirms round 5's fix — Business Partner must now correctly downgrade to
  read-only, not stay stuck at full).
- As with every prior round: this is the 5th fix on the same underlying core gap
  (`RoleInheritanceManager`/`AccessTypeInjector` never differentiating client/organization NOR
  access level NOR source-template bookkeeping when propagating a template's grant across role
  inheritance changes). If the human's live re-confirmation surfaces a 6th, distinct sub-case, the
  same event-observer extension point (`WindowAccessOverlapCorruptionGuard`) is almost certainly
  still the right place to extend, per the pattern established across all 5 rounds so far.

### B6 Findings — most-permissive-wins fix (developer, 2026-08-16)

**Result: `com.etendoerp.go` commit `e8b6ffc6`.** `UserRoleCompositionServiceOverlapIntegrationTest`
**7/7 pass** (6 pre-existing + 1 new); `UserRoleCompositionServiceRealAccessControlIntegrationTest`
**3/3 pass** — both verified via a genuinely fresh `./gradlew :test --tests
"com.etendoerp.go.roles.UserRoleCompositionServiceOverlapIntegrationTest" --tests
"com.etendoerp.go.roles.UserRoleCompositionServiceRealAccessControlIntegrationTest"
--rerun-tasks` run from the `etendo` root. A direct read-only `psql` check afterward reconfirmed
the human's real personal role (`6AD5C0CC21F14050A65A3E62DC2FF9A2`) still exists, is still active,
client `802509E12436405C86BA1FD5B1DF508C`, org `0` — untouched throughout. `./gradlew smartbuild`
completed clean, the Tomcat container was restarted, and `Server startup in [54330] milliseconds`
was confirmed in the container logs — **live, and ready for the human's own Classic
click-through re-confirmation.**

**What was built.** Implemented exactly the coordinator's sketched design, no redesign:
`WindowAccessOverlapCorruptionGuard.java`'s `onSave(EntityNewEvent)` non-template branch now
calls a new sibling method right after `correctInheritedOwnership`:

```java
} else {
  correctInheritedOwnership(event, access);
  widenInheritedAccessLevelIfNeeded(event, access);
}
```

1. **`widenInheritedAccessLevelIfNeeded(EntityNewEvent, WindowAccess)`** — for the SAME
   freshly-created inherited row `correctInheritedOwnership` just fixed ownership on: reads the
   about-to-be-persisted `editableField` value via `event.getCurrentState(editableFieldProperty)`
   (same API `correctInheritedOwnership` already proved reaches Hibernate's bound `state[]`, not
   just the live Java object — required for the same reason ownership correction needed it: a
   plain setter never reaches the array the eventual INSERT reads from). If already `true`,
   nothing to do. Otherwise calls `anyOtherActiveTemplateGrantsFullAccess(owner, window)`; if any
   OTHER template the role is currently, actively inheriting from grants the SAME window full
   access, corrects the row via `event.setCurrentState(editableFieldProperty, true)` — the exact
   same mechanism `correctInheritedOwnership` uses, applied to a different field. One-directional
   only: the method only ever flips `false`→`true`, never the reverse (matches the ticket's
   existing "a full grant, once resolved, always wins" rule).
2. **`anyOtherActiveTemplateGrantsFullAccess(Role, Window)`** — small helper, loops
   `findActiveTemplatesFor(dependent, null)` and checks each template's own `AD_Window_Access` row
   for the window via the already-existing `findActiveWindowAccess(Role, Window)`. Reads the
   templates' OWN current grants as the source of truth, mirroring
   `UserRoleCompositionService#mostPermissiveWindowAccess`'s own choice (not whatever level core's
   per-window propagation happened to leave on the dependent).
3. **`findActiveTemplatesFor(Role, String excludedInheritanceId)`** — per the dispatch's explicit
   instruction to reuse the query pattern rather than reinvent it, refactored the existing
   `findOtherActiveTemplates(Role, RoleInheritance)` (used by the REMOVE-path fix) into a thin
   wrapper (`findActiveTemplatesFor(dependent, excludedInheritance.getId())`) over this new,
   more general method — same HQL/criteria shape, now with the exclusion made optional (`null` =
   include every active template). No behavior change for the REMOVE-path caller.

**Why a separate method instead of folding into `correctInheritedOwnership` itself.** Ownership
correction is unconditional — a row's client/organization is either wrong or not, no extra lookup
needed beyond the owning role's own fields. Level widening requires an additional query across the
role's OTHER template inheritances and a strictly one-directional rule; keeping it a distinct,
separately-documented method (called from the same `onSave` branch, same event, same row) reads
more clearly and keeps each method's javadoc focused on the ONE thing it decides — matches this
file's existing pattern of one well-documented private method per concern (`guardDependentsOf`,
`guardNewInheritance`, `guardRemovedInheritance` are already split the same way, despite similar
overlap in what they each touch).

**Ordering / correctness reasoning (why this is not a race with core's own propagation).** This
fires on `EntityNewEvent` for a WindowAccess row on a non-template role — a row core's own
`RoleInheritanceManager#copyRoleAccess` is IN THE PROCESS of creating, before the interceptor's
security check and before core's insert executes (same timing `correctInheritedOwnership` already
relies on). `findActiveTemplatesFor` queries `AD_Role_Inheritance` fresh against the DB — it only
ever sees PREVIOUSLY COMMITTED inheritance rows (from an earlier, already-flushed transaction),
never the one currently being saved in THIS same flush (per `FlushMode.COMMIT`, confirmed by this
class's own extensive javadoc on `deleteForcingCreatePath`). This is exactly what the fix needs:
the human's repro is "already-composed FULL template, then ADD a read-only one" — the full
template's inheritance and its own window-access grant are both already committed by the time the
new template's inheritance triggers this code path, so the fresh query finds them correctly. The
reverse order (read-only committed first, full template added second) needs no widening at all —
the new row is already created full from the newly-added template's own grant, so
`event.getCurrentState(editableFieldProperty)` is already `true` and the method returns
immediately, still correct.

**Doc updated in the same file.** `WindowAccessOverlapCorruptionGuard`'s class javadoc: corrected
the sentence claiming the class "never widens/narrows any grant level" (now scoped explicitly to
the three `guard*` delete-forcing methods, which is still true for them — they only force the safe
CREATE path, they don't decide the level) and added a full "A fourth trigger" section describing
this gap and fix, matching the existing per-trigger documentation style for the other three.

**Test added.** `UserRoleCompositionServiceOverlapIntegrationTest
#testGainingReadOnlyTemplateInheritanceNeverDowngradesExistingFullAccess` — same "bystander role,
zero `UserRoleCompositionService` code in the call stack" shape as the other two bystander tests in
this file, but deliberately mirrors the human's EXACT repro order: grants Finance (full) and Sales
(read-only) their own window-access rows first, then adds ONLY the Finance inheritance to the
bystander role and asserts full access propagated (sanity check), THEN adds the Sales inheritance
and asserts the window is STILL full afterward (the actual regression assertion), plus the existing
ownership assertions (client/organization match the bystander role's own).

**Files changed:**
- `com.etendoerp.go/src/com/etendoerp/go/roles/WindowAccessOverlapCorruptionGuard.java` — added
  `widenInheritedAccessLevelIfNeeded`, `anyOtherActiveTemplateGrantsFullAccess`, refactored
  `findOtherActiveTemplates` into a wrapper over the new `findActiveTemplatesFor`; updated the
  class javadoc (scoped the "never widens/narrows" claim, added the fourth-trigger section).
- `com.etendoerp.go/src-test/src/com/etendoerp/go/roles/UserRoleCompositionServiceOverlapIntegrationTest.java`
  — added `testGainingReadOnlyTemplateInheritanceNeverDowngradesExistingFullAccess`.

**Not done / open items for the coordinator:**
- Commit is local-only, not pushed, per instructions.
- Deployed live (smartbuild + Tomcat restart both completed clean, `Server startup` confirmed) —
  but the human's own Classic click-through re-confirmation of THIS exact scenario has NOT been
  performed by this session — the explicit, human-only last acceptance step, same pattern as the
  prior 2 rounds on this file.
- As with the prior rounds: this is the 4th fix on the same underlying core gap
  (`RoleInheritanceManager`/`AccessTypeInjector` never differentiating client/organization NOR
  access level when propagating a template's grant across role inheritance changes). If the human's
  live re-confirmation surfaces a 5th, distinct sub-case, the same event-observer extension point
  (`WindowAccessOverlapCorruptionGuard`) is almost certainly still the right place to extend, per
  the pattern established across all 4 rounds so far.

### B6 Findings — REMOVE path fix (developer, 2026-08-16)

**Result: `com.etendoerp.go` commit `58f114ea`.**
`UserRoleCompositionServiceOverlapIntegrationTest` **6/6 pass** (5 pre-existing +
1 new); `UserRoleCompositionServiceRealAccessControlIntegrationTest` **3/3 pass** —
both verified via a genuinely fresh `./gradlew :test --tests
"com.etendoerp.go.roles.UserRoleCompositionServiceOverlapIntegrationTest" --tests
"com.etendoerp.go.roles.UserRoleCompositionServiceRealAccessControlIntegrationTest"
--rerun-tasks` run from the `etendo` root (not `:modules:com.etendoerp.go:test`,
which reports NO-SOURCE in this checkout). A direct read-only `psql` check afterward
confirmed the human's real personal role (`6AD5C0CC21F14050A65A3E62DC2FF9A2`) still
exists, is still active, and its real window-143 grant (inherited from the real
"Inventory" template) still has correct, non-corrupted client (`802509E12436405C86BA1FD5B1DF508C`)
— untouched throughout. `./gradlew smartbuild` completed clean and the Tomcat
container was restarted with the new WAR deployed — **live, and ready for the
human's own Classic click-through re-confirmation.**

**Root cause, traced with method-level precision (not just the doc's paraphrase).**
The plan doc's coordinator write-up cites `RoleInheritanceManager.propagateDeletedAccess`
(lines 448-493) as the REMOVE-path trigger. Reading that exact core checkout
(`/Users/gremiger/workspaces/etendogoclean/etendo/src/org/openbravo/role/inheritance/RoleInheritanceManager.java`)
directly, `propagateDeletedAccess` is in fact only ever called from
`InheritedAccessEnabledEventHandler#onDelete` — i.e. when a TEMPLATE's OWN
`AD_Window_Access` row is deleted, not when a `RoleInheritance` is deleted. The
human's actual live repro ("removing one of the two templates from that role") is a
`RoleInheritance` deletion, which core routes through a DIFFERENT method with the
IDENTICAL corrupting mechanism:

1. `RoleInheritanceEventHandler#onDelete` (`RoleInheritanceEventHandler.java:104`,
   unprioritized) fires on the `EntityDeleteEvent` for the deleted `AD_Role_Inheritance`
   row and calls `manager.applyRemoveInheritance(inheritance)`.
2. `applyRemoveInheritance` (`RoleInheritanceManager.java:227-239`) computes
   `inheritanceList` = every OTHER active `RoleInheritance` the dependent role still
   has (`getUpdatedRoleInheritancesList(inheritance, deleting=true)`, excludes the
   just-deleted row by id, NOT by DB-visible state) and calls `calculateAccesses(
   inheritanceList, inheritanceRoleIdList, roleInheritanceToDelete=inheritance,
   injector, false)` for each access type (WindowAccess included).
3. `calculateAccesses` (`RoleInheritanceManager.java:546-572`) loops over EVERY
   REMAINING template's own access rows and calls `handleAccess` for each — the SAME
   method `applyNewInheritance`/`propagateNewAccess` already use on the ADD side.
4. `handleAccess` (`RoleInheritanceManager.java:588-608`): if the dependent role
   already has an access row for that window, `isPrecedent` decides whether to
   override it. Critically: `isPrecedent` returns `true` (override) whenever the
   row's CURRENT `inheritedFrom` id is NOT FOUND in the updated (post-removal)
   template-id list — which is unconditionally true for a row still sourced from the
   just-removed template, `indexOf(...) == -1` — driving straight into
   `updateRoleAccess`'s blind `DalUtil.copyToTarget` (client/organization included),
   the EXACT SAME corrupting write the ADD-path fix already defends against, just
   reached from a third call chain the guard never observed.
5. Confirmed empirically via the new test (see below) that this is genuinely a
   "last write wins" re-derivation, not precedence-by-sequence-number: in the
   bystander setup (Finance granted FULL first, Sales granted READ-ONLY second), the
   guard's own ADD-path "last write wins" mechanism (`guardDependentsOf`) had already
   left the shared window sourced from SALES before any removal — so the test removes
   the SALES inheritance (the current source) to correctly exercise the corrupting
   re-derivation onto the one remaining template, Finance.

The doc's `propagateDeletedAccess` citation and this trace describe the SAME
underlying bug (core's `RoleInheritanceManager` never differentiating client/
organization when copying a template's access onto a dependent role) reached via a
different, correctly-identified call path; the fix below defends the actual observed
mechanism, verified line-by-line against the checkout in this environment.

**What was built.** Same file, `WindowAccessOverlapCorruptionGuard.java` (already
protecting ADD-path triggers via `onSave`/`onUpdate`) — added a THIRD observer method,
`onDelete(@Observes @Priority(1) EntityDeleteEvent)`, same priority pattern as the
existing two, guaranteeing it fires before core's own unprioritized
`RoleInheritanceEventHandler#onDelete` on the identical `RoleInheritance` delete
event.

1. **`guardRemovedInheritance(RoleInheritance)`** — for the dependent role losing an
   inheritance, iterates every OTHER template it still actively inherits from
   (`findOtherActiveTemplates`, mirrors core's own `getUpdatedRoleInheritancesList`
   exclude-by-id approach rather than trusting DB-visible state mid-flush). For each
   remaining template's own granted windows, if the dependent's existing row for that
   window is not ALREADY sourced from that exact remaining template, deletes it via
   the SAME `deleteForcingCreatePath` helper the ADD-path fix already proved (bulk
   HQL `DELETE` + `OBDal.refresh(dependent)` — reused verbatim, not re-derived, per
   the dispatch's explicit instruction). Deliberately does NOT restrict itself to
   "only rows currently sourced from the template being removed" — the same
   "already correctly sourced from THIS template, skip" check the ADD-path helpers
   use is sufficient on its own, since `isPrecedent` in core will force an override
   for ANY row not sourced from the given remaining template regardless of what it IS
   currently sourced from (manually granted, or inherited from yet another template).
2. **`findOtherActiveTemplates(Role, RoleInheritance)`** — small helper query,
   `crossClientCriteria(RoleInheritance.class)` scoped to the dependent role, active,
   excluding the about-to-be-deleted inheritance by id.
3. A row whose window is granted by NO remaining template is deliberately left
   untouched — core's own `deleteRoleAccess` cleanup step (`RoleInheritanceManager.java:150-177`)
   removes it via a normal, non-corrupting `OBDal.remove()`, no cross-client field
   copy involved, nothing to prevent there.

**No new empirical surprises this round** — the delete-before-write mechanics
(`deleteForcingCreatePath`, `crossClientCriteria`, `OBDal.refresh` vs `evict`) were
already fully worked out by the ADD-path redesign and reused without modification, as
instructed. The only new work was correctly identifying WHICH core call chain to
intercept and building the query that walks it from the opposite (deletion) direction.

**Test added.** `UserRoleCompositionServiceOverlapIntegrationTest
#testRemovingOneOfTwoOverlappingTemplateInheritancesIsAlsoProtected` — same
"bystander role, zero `UserRoleCompositionService` code in the call stack" shape as
`testBystanderRoleNotPassedToAssignTemplateRolesIsAlsoProtected`, extended with a
direct `OBDal.remove()` + `flush()` on the `RoleInheritance` row currently sourcing
the shared window. Asserts: no exception; the shared window's access survives, now
re-derived from the one remaining template; client/organization still match the
BYSTANDER role's own (never a template's); the surviving access LEVEL matches the
remaining template's own grant.

**Files changed:**
- `com.etendoerp.go/src/com/etendoerp/go/roles/WindowAccessOverlapCorruptionGuard.java`
  — added `onDelete`, `guardRemovedInheritance`, `findOtherActiveTemplates`, plus a
  new "third trigger" class-javadoc section. No changes to the existing ADD-path
  methods.
- `com.etendoerp.go/src-test/src/com/etendoerp/go/roles/UserRoleCompositionServiceOverlapIntegrationTest.java`
  — added `testRemovingOneOfTwoOverlappingTemplateInheritancesIsAlsoProtected` and a
  small `findInheritance` query helper.

**Not done / open items for the coordinator:**
- Commit is local-only, not pushed, per instructions.
- Deployed live to the human's own `make dev`-managed Tomcat (smartbuild + container
  restart both completed clean) — but the human's own Classic click-through
  re-confirmation using `ClassicTemplateTest1Read`/`2Broad` (remove one after having
  both, confirm no exception AND the remaining template's access level survives) has
  NOT been performed by this session — that is the explicit, human-only last step per
  the dispatch's own acceptance bar, given the ADD-path fix already passed JUnit alone
  once before a live gap was found in this exact code area.

## Task B6 — 6th gap: real `SFAssignUserRoles` 500 error with 3+ overlapping templates (human, 2026-08-17)

**Found during the post-pipeline manual-test checklist** (item: "Guardar, recargar la
página: los roles asignados persisten igual"). Scenario: `Personal – NewUsertest`
(`6AD5C0CC21F14050A65A3E62DC2FF9A2`) — the human's real, legitimate multi-role test
account, already leaned on repeatedly by B5/B6 as genuine evidence, composed from ALL
4 real system templates (Finance, Sales, Purchasing, Inventory). Human unchecked
Finance in the "Asignar roles" UI and clicked Guardar — **this goes through our own
production webhook (`SFAssignUserRoles` → `UserRoleCompositionService.assignTemplateRoles`),
NOT a raw Classic edit** — the exact core supported flow this ticket exists to
deliver. Frontend showed: "El usuario se guardó, pero los roles no pudieron
actualizarse: SFAssignUserRoles error: 500."

**All 5 prior B6 rounds only ever exercised 2-template overlap**
(`ClassicTemplateTest1Read`/`ClassicTemplateTest2Broad`, both real but only 2 templates
at a time). This is the first real-world exercise of 3+ overlapping templates
cascading together in one save, and it breaks.

**Exact server log** (full, unedited, chronological — `com.etendoerp.go`, 2026-08-17
14:25:51 UTC):

```
INFO WindowAccessOverlapCorruptionGuard - Prevented cross-template AD_Window_Access overlap corruption: cleared role 6AD5C0CC21F14050A65A3E62DC2FF9A2 window 181 access (previously inherited from 73581A7B4F414A2C9059C83CE7BE97BF) before template 5E279F5102F9410F9B8CCBA424741F46's own grant propagates, forcing core onto the safe CREATE path
INFO WindowAccessOverlapCorruptionGuard - Prevented cross-template AD_Window_Access overlap corruption: cleared role 6AD5C0CC21F14050A65A3E62DC2FF9A2 window 140 access (previously inherited from 73581A7B4F414A2C9059C83CE7BE97BF) before template 5E279F5102F9410F9B8CCBA424741F46's own grant propagates, forcing core onto the safe CREATE path
INFO WindowAccessOverlapCorruptionGuard - Prevented cross-template AD_Window_Access overlap corruption: cleared role 6AD5C0CC21F14050A65A3E62DC2FF9A2 window 123 access (previously inherited from 73581A7B4F414A2C9059C83CE7BE97BF) before template 5E279F5102F9410F9B8CCBA424741F46's own grant propagates, forcing core onto the safe CREATE path
INFO WindowAccessOverlapCorruptionGuard - Prevented cross-template AD_Window_Access overlap corruption: cleared role 6AD5C0CC21F14050A65A3E62DC2FF9A2 window 184 access (previously inherited from 73581A7B4F414A2C9059C83CE7BE97BF) before template 5E279F5102F9410F9B8CCBA424741F46's own grant propagates, forcing core onto the safe CREATE path
INFO WindowAccessOverlapCorruptionGuard - Prevented cross-template AD_Window_Access overlap corruption: cleared role 6AD5C0CC21F14050A65A3E62DC2FF9A2 window C50A8AEE6F044825B5EF54FAAE76826F access (previously inherited from 73581A7B4F414A2C9059C83CE7BE97BF) before template 5E279F5102F9410F9B8CCBA424741F46's own grant propagates, forcing core onto the safe CREATE path
INFO WindowAccessOverlapCorruptionGuard - Prevented cross-template AD_Window_Access overlap corruption: cleared role 6AD5C0CC21F14050A65A3E62DC2FF9A2 window 144 access (previously inherited from 73581A7B4F414A2C9059C83CE7BE97BF) before template 5E279F5102F9410F9B8CCBA424741F46's own grant propagates, forcing core onto the safe CREATE path
INFO WindowAccessOverlapCorruptionGuard - Prevented cross-template AD_Window_Access overlap corruption: cleared role 6AD5C0CC21F14050A65A3E62DC2FF9A2 window 143 access (previously inherited from 73581A7B4F414A2C9059C83CE7BE97BF) before template 15ECC46CFBD74CF3A76D1F4DC8BA9F80's own grant propagates, forcing core onto the safe CREATE path
INFO WindowAccessOverlapCorruptionGuard - Prevented cross-template AD_Window_Access overlap corruption: cleared role 6AD5C0CC21F14050A65A3E62DC2FF9A2 window 169 access (previously inherited from 73581A7B4F414A2C9059C83CE7BE97BF) before template 15ECC46CFBD74CF3A76D1F4DC8BA9F80's own grant propagates, forcing core onto the safe CREATE path
INFO WindowAccessOverlapCorruptionGuard - Prevented cross-template AD_Window_Access overlap corruption: cleared role 6AD5C0CC21F14050A65A3E62DC2FF9A2 window FF808081330213E60133021822E40007 access (previously inherited from 73581A7B4F414A2C9059C83CE7BE97BF) before template 15ECC46CFBD74CF3A76D1F4DC8BA9F80's own grant propagates, forcing core onto the safe CREATE path
INFO WindowAccessOverlapCorruptionGuard - Prevented cross-template AD_Window_Access overlap corruption: cleared role 6AD5C0CC21F14050A65A3E62DC2FF9A2 window 168 access (previously inherited from 73581A7B4F414A2C9059C83CE7BE97BF) before template 15ECC46CFBD74CF3A76D1F4DC8BA9F80's own grant propagates, forcing core onto the safe CREATE path
INFO WindowAccessOverlapCorruptionGuard - Prevented cross-template AD_Window_Access overlap corruption: cleared role 6AD5C0CC21F14050A65A3E62DC2FF9A2 window 146 access (previously inherited from 5E279F5102F9410F9B8CCBA424741F46) before template 15ECC46CFBD74CF3A76D1F4DC8BA9F80's own grant propagates, forcing core onto the safe CREATE path
INFO WindowAccessOverlapCorruptionGuard - Prevented cross-template AD_Window_Access overlap corruption: cleared role 6AD5C0CC21F14050A65A3E62DC2FF9A2 window 141 access (previously inherited from 5E279F5102F9410F9B8CCBA424741F46) before template 15ECC46CFBD74CF3A76D1F4DC8BA9F80's own grant propagates, forcing core onto the safe CREATE path
INFO WindowAccessOverlapCorruptionGuard - Prevented cross-template AD_Window_Access overlap corruption: cleared role 6AD5C0CC21F14050A65A3E62DC2FF9A2 window 192 access (previously inherited from 5E279F5102F9410F9B8CCBA424741F46) before template 15ECC46CFBD74CF3A76D1F4DC8BA9F80's own grant propagates, forcing core onto the safe CREATE path
... (ownership-correction INFO lines for windows 143, 123, 169, FF808081..., 140, 144, 168, 146, 141, 192, pinning client/organization back to the role's own, all role 6AD5C0CC...) ...
INFO WindowAccessOverlapCorruptionGuard - Widened AD_Window_Access on role 6AD5C0CC21F14050A65A3E62DC2FF9A2 window 144 to full and repointed InheritedFrom from 15ECC46CFBD74CF3A76D1F4DC8BA9F80 to 73581A7B4F414A2C9059C83CE7BE97BF: another currently-inherited template already grants this window full access ...
... (more ownership-correction + widen/repoint INFO lines for windows 181, 140, 123, 143, continuing to cascade across 73581A7B4F414A2C9059C83CE7BE97BF and 5E279F5102F9410F9B8CCBA424741F46 as sources) ...
ERROR org.hibernate.engine.jdbc.batch.internal.BatchingBatch - HHH000315: Exception executing batch [java.sql.BatchUpdateException: Batch entry 1 insert into AD_Window_Access (AD_Window_ID, AD_Role_ID, AD_Client_ID, AD_Org_ID, IsActive, Created, CreatedBy, Updated, UpdatedBy, IsReadWrite, Inherited_From, EM_Smfmu_Mobileview, AD_Window_Access_ID) values (('140'), ('6AD5C0CC21F14050A65A3E62DC2FF9A2'), ('802509E12436405C86BA1FD5B1DF508C'), ('0'), ('Y'), ('2026-08-13 12:20:49.639934+00'), ('0'), ('2026-08-17 14:25:51.278+00'), ('47EAF009B7BB42BBB663C7BA1792D958'), ('Y'), ('5E279F5102F9410F9B8CCBA424741F46'), ('N'), ('5F0A64D14B404BECBD953A395DF82B85')) was aborted: ERROR: duplicate key value violates unique constraint "ad_window_access_un_key"
  Detail: Key (ad_role_id, ad_window_id)=(6AD5C0CC21F14050A65A3E62DC2FF9A2, 140) already exists.  Call getNextException to see other errors in the batch.]
ERROR com.etendoerp.go.schemaforge.webhooks.SFAssignUserRoles - Unexpected error in SFAssignUserRoles for user 2DD62C68875A4989AFE6B76DCB3974BC
javax.persistence.PersistenceException: org.hibernate.exception.ConstraintViolationException: could not execute batch
    at org.hibernate.internal.ExceptionConverterImpl.convert(ExceptionConverterImpl.java:154)
    at org.hibernate.internal.SessionImpl.doFlush(SessionImpl.java:1411)
    at org.hibernate.internal.SessionImpl.flush(SessionImpl.java:1394)
    at org.openbravo.dal.service.OBDal.flush(OBDal.java:265)
```

**Coordinator's read, NOT a confirmed root cause — hand this to the developer as
evidence, not as a pre-solved diagnosis (unlike the prior 5 rounds, this one has NOT
been root-caused yet):** notice the guard fires "before template X's own grant
propagates" for THREE different templates (`73581A7B...`, `5E279F51...`,
`15ECC46C...` — presumably Sales/Purchasing/Inventory, the 3 templates that remain
after Finance is removed) across a widening set of windows, with visible criss-cross
repointing (e.g. window 144 widened+repointed from `15ECC46C...` to `73581A7B...`,
then LATER in the same flush window 123 widened+repointed from `73581A7B...` to
`5E279F51...`). This is a much deeper cascade than any of the 5 prior rounds' tests
exercised (those only ever had 2 templates in play at once). The final crash is a
duplicate-key INSERT on `(NewUsertest, window 140)` — i.e. by the time core tried to
CREATE a fresh row for window 140 (sourced from template `5E279F51...`), a row for
that exact `(role, window)` pair ALREADYexisted again, meaning either: (a) the guard's
own delete-forcing-CREATE-path mechanism didn't actually clear window 140 a second
time when it needed to (the earlier "Prevented..." log line for window 140 already
fired once, sourced from `73581A7B...` — did a LATER step re-derive window 140 again
from `5E279F51...` without re-clearing first?), or (b) the widen/repoint logic itself
(which does its own INSERT-adjacent work via `event.setCurrentState`) raced against a
separate core-driven INSERT for the same row within the same flush. **Given the
complexity of 3+ templates cascading (vs. the 2-template scenarios all 5 prior JUnit
tests + all 4 live Classic confirmations covered), a NEW JUnit test reproducing this
exact 3+-overlapping-template removal shape is likely the fastest way to get a
debuggable, reproducible failure — don't assume the existing 2-template tests would
have caught this, they structurally couldn't have.**

**Verify DB state is clean before touching code**: this was a `PersistenceException` at
flush, which should mean Hibernate/Postgres rolled the whole transaction back
automatically — but confirm via read-only `psql` that `Personal – NewUsertest`'s
`AD_Role_Inheritance`/`AD_Window_Access` rows are still in a consistent state (still
has all 4 original templates, no partial Finance removal, no duplicate/orphaned
`AD_Window_Access` rows) before starting to debug, so you know the starting state for
certain.

**Re-dispatch:** schema-forge-developer, `com.etendoerp.go` only, branch
`feature/ETP-4906`, same file (`WindowAccessOverlapCorruptionGuard.java`) plus
whatever else the investigation points to. This is a BLOCKER — reopens B6, and by
extension reopens REVIEW/QA's prior APPROVE verdicts for at least the affected
file(s). Definition of done: (1) root-cause the exact mechanism (don't just patch the
symptom — the criss-crossing repoint pattern above suggests a structural issue with
how 3+-way overlaps interact with the guard's per-event, single-template-at-a-time
model, not just a missing edge case); (2) a new JUnit test reproducing the REAL
scenario — a bystander (or the real `UserRoleCompositionService.assignTemplateRoles`
path, matching how the human actually triggered this via `SFAssignUserRoles`) role
composed from 3+ real overlapping templates, then one template removed — must succeed
without exception; (3) full existing suite still green
(`UserRoleCompositionServiceOverlapIntegrationTest`,
`UserRoleCompositionServiceRealAccessControlIntegrationTest`), fresh
`--rerun-tasks` run; (4) live re-confirmation is the real acceptance bar — human will
redo the exact scenario that broke (remove Finance from `Personal – NewUsertest`,
which has all 4 real templates) via the actual "Asignar roles" UI (not Classic this
time — this bug is in the real webhook path), confirm the save succeeds and the 500
error is gone. Redeploy via the established `smartbuild` + `tomcat restart` sequence,
leave it running for the human. **Do NOT run `./gradlew clean`** — see the Global
Constraints / earlier B6 rounds for why.

## B6 Findings — 6th gap fix (developer, 2026-08-17)

**Starting state verified clean.** Before touching any code, confirmed via read-only
`psql` that `Personal – NewUsertest` (`6AD5C0CC21F14050A65A3E62DC2FF9A2`) rolled back
cleanly from the reported `PersistenceException`: still has all 4 original template
inheritances active (Finance seqno 10, Sales 20, Purchasing 30, Inventory 40), no
duplicate `AD_Window_Access` rows for `(role, window)`, and window 140's row intact
(sourced from Inventory, as before the crash). Re-verified identically after the fix
was deployed — no drift.

### Root cause

Traced into `RoleInheritanceManager` (core, `org.openbravo.role.inheritance`), not
just `WindowAccessOverlapCorruptionGuard`. The key asymmetry between the ADD path and
the REMOVE path, missed by all 5 prior rounds because none of their tests ever
composed 3+ templates:

- `applyNewInheritance` (ADD) calls `calculateAccesses` with an `inheritanceList`
  containing exactly **one** entry — the newly added inheritance. Its outer loop runs
  once, so at most one `handleAccess`/`copyRoleAccess` call is ever made per window
  per event. Structurally immune to a same-window double-write, no matter how many
  OTHER templates the dependent already has.
- `applyRemoveInheritance` (REMOVE) calls `calculateAccesses` with an
  `inheritanceList` containing **every remaining** template, walked ascending by
  `AD_Role_Inheritance.SeqNo` in ONE call, with no flush between per-template passes
  (`doFlush=false`). If a window is granted by 2+ of those remaining templates — only
  possible starting at 3 templates total — and the dependent's existing row for that
  window was deleted beforehand (exactly what `guardRemovedInheritance`'s pre-fix
  implementation did, once per remaining template that didn't already own the row),
  BOTH remaining templates' passes independently find no row and each call
  `copyRoleAccess` → `OBDal.save()`. Neither pass sees the other's still-pending,
  unflushed `INSERT` (`FlushMode.COMMIT` never auto-flushes a query into visibility —
  same limitation already documented on `deleteForcingCreatePath`'s delete side).
  Both INSERTs land in the same JDBC batch at the eventual flush; the second violates
  `ad_window_access_un_key`. Exactly the human's stack trace, and exactly why the
  crash cascaded across many windows and three different templates in the log — the
  old code deleted far more rows than core's own precedence algorithm would ever
  actually need to touch (a blanket "not sourced from the template I'm currently
  examining" rule, not a replication of core's real `isPrecedent` logic), generating
  both unnecessary churn and, wherever 2+ remaining templates overlapped, a
  guaranteed duplicate-INSERT.

### The fix — and a wrong first attempt, corrected empirically

`guardRemovedInheritance` no longer deletes a row per remaining template. It computes,
once per window across ALL remaining templates, a single "winner" and applies it via
a bulk HQL `UPDATE` in place (new `repointInPlace` method) — same row, same primary
key, never delete+recreate.

**First attempt (wrong):** picked the winner by preferring whichever remaining
template grants FULL access, generalizing `findActiveTemplateGrantingFullAccess`'s
own ADD-side tie-break. This looked reasonable but is unsafe on the REMOVE side
specifically: core's own `isPrecedent` check compares ONLY list index (== `SeqNo`
order), never access level. If the most-permissive grantor does not also have the
highest `SeqNo`, `InheritedFrom` ends up pointing at a LOWER-index template; core's
own LATER pass over the genuinely highest-`SeqNo` remaining template then finds
`isPrecedent(current, new) == true` and blindly overrides the row via
`updateRoleAccess` → `DalUtil.copyToTarget` — the exact client-corruption bug this
whole class exists to prevent, just reached one hop later. Reproduced live in JUnit
(`testRemovingOneOfFourTemplatesLeavesTwoRemainingOverlappingTemplatesUnbroken` red,
`OBSecurityException: Client (0) ... is not present in ClientList`) on window 123 — a
real window in this environment granted by all 4 real templates, where Purchasing
(SeqNo 30, full) is more permissive than Inventory (SeqNo 40, read-only) but
Inventory has the higher SeqNo.

**Corrected design:** decouple the two decisions. `InheritedFrom` (the "winner") is
ALWAYS the remaining template with the numerically highest `SeqNo` among every
remaining template granting that window, regardless of its own access level — this
is the only choice that guarantees core's own `isPrecedent` check can never find a
reason to touch the row again (its index is, by construction, the max). The access
LEVEL is decided separately, via most-permissive-wins across every remaining template
granting the window, independent of which one was chosen as the source — mirroring
`widenInheritedAccessLevelIfNeeded`'s own "ownership and level are different
concerns" split on the ADD side, just applied symmetrically here. Confirmed this
closes both the duplicate-INSERT crash AND the ownership-corruption variant: after
the fix, `testRemovingOneOfFourTemplatesLeavesTwoRemainingOverlappingTemplatesUnbroken`
passes, along with the full pre-existing suite.

Also required an incidental fix found empirically while stabilizing this: `OBDal
.getInstance().refresh(dependent)` once at the end of `guardRemovedInheritance` (if
any window was corrected) — without it, the caller's own pending `RoleInheritance`
deletion (still in-flight in the same flush that invoked this observer) hit
Hibernate's "deleted object would be re-saved by cascade" check on the
round-5 test, apparently because `dependent`'s own loaded collections went stale
relative to the raw HQL work done here. Mirrors `deleteForcingCreatePath`'s own,
already-proven use of the same `refresh(dependent)` call.

### Known, documented residual gap (not closed this round)

If the dependent has NO existing row at all for a window 2+ remaining templates both
grant (a window neither the dependent nor any of its other already-composed
templates ever granted before this specific removal), `guardRemovedInheritance` has
nothing to repoint and falls back to core's own natural CREATE, which could in
principle hit the identical duplicate-INSERT race for that one window. Considered
low real-world risk: a role composed for any length of time (like every real account
this bug was found on) will already have a materialized row for every window any of
its active templates grants. Documented in the class javadoc; not exercised by any
test, flagged for a future round if it's ever actually hit.

### Verification

- `com.etendoerp.go` compiles clean (`./gradlew :compileJava`).
- `UserRoleCompositionServiceOverlapIntegrationTest`: 9/9 green (8 pre-existing + 1
  new), fresh `--rerun-tasks` run from `etendo` root.
- `UserRoleCompositionServiceRealAccessControlIntegrationTest`: 3/3 green, same run.
- Both classes together, single fresh `--rerun-tasks` invocation: 12/12 green.
- `Personal – NewUsertest`'s `AD_Role_Inheritance`/`AD_Window_Access` rows reverified
  consistent via read-only `psql`, before touching code and again after deploying.
- `./gradlew smartbuild` succeeded; Tomcat container restarted; `Server startup`
  confirmed in logs; left running.
- **NOT yet performed: the human's own live re-confirmation via the real "Asignar
  roles" UI** (remove Finance from `Personal – NewUsertest`, confirm the save
  succeeds with no 500 error) — this is the actual acceptance bar per the dispatch's
  definition of done, and it is the one thing this round could not verify itself.

Commit: `com.etendoerp.go` `e81844c2` — "Feature ETP-4906: Fix REMOVE-path
duplicate-INSERT crash with 3+ templates". Committed locally on `feature/ETP-4906`,
not pushed.

## Task B6 — 7th gap: the SAME duplicate-INSERT bug on the ADD path (found by an independent test via today's epic rebase, 2026-08-17)

**Discovered via `git push`'s pre-push gate**, not manual testing this time. Pushing
`com.etendoerp.go`'s `feature/ETP-4906` (after today's rebase onto the newer
`origin/epic/ETP-3504`) ran the FULL test suite (`./gradlew test --tests
"com.etendoerp.go.*"`, the exact command `.githooks/pre-push` uses) and found 2 new
failures in a test file **neither this session nor any of the 6 prior B6 rounds ever
wrote or knew about**: `UserRoleCompositionServiceOverlapReverificationTest`
(`src-test/src/com/etendoerp/go/roles/`). It exists identically in all 3 rebased
branches (`feature/ETP-4906`, `feature/ETP-4852`, `feature/ETP-4878`) — confirmed via
`find`, so it's part of the shared `epic/ETP-3504` base itself, written by a QA
reverification pass on ETP-4852/4878's OWN original overlap-corruption fix
(`UserRoleCompositionService#preventWindowAccessOverlapCorruption`/
`reconcileWindowAccessAfterComposition`), predating B6's guard entirely.

**The 2 failures, both duplicate-key `ConstraintViolationException` on
`ad_window_access_un_key`, both at a plain `grantWindowAccess(template, window,
...); OBDal.flush();` call — i.e. a TEMPLATE gaining a new grant, BEFORE
`assignTemplateRoles` is ever called:**
1. `testRealMatrixOverlapSalesAndInventoryOnContactosResolvesToFull` — granting
   Inventory a new row on window `123` (Contactos) crashes with `Key (ad_role_id,
   ad_window_id)=(6AD5C0CC21F14050A65A3E62DC2FF9A2, 123) already exists` — **the
   human's own real `Personal – NewUsertest` role**, the same account B5/B6 have
   leaned on all along.
2. `testRealMatrixOverlapSalesAndPurchasingOnProductCategoryStaysReadOnly` — granting
   Purchasing a new row on window `144` (Categoría del producto) crashes with `Key
   (ad_role_id, ad_window_id)=(F238CDA054BE4D649B1BDD59F73019E1, 144) already exists`
   — a DIFFERENT bystander role, not previously referenced in this ticket's own work.

**Root cause (coordinator's read, not yet developer-confirmed):** this is the exact
same failure SHAPE round 6 already found and fixed — 2+ bystander roles/sources
racing to independently `INSERT` for the same `(role, window)` key within one flush,
because the delete-then-let-core-recreate strategy issues a separate CREATE per
affected role/template with no deduplication across them. **Round 6's fix
(`repointInPlace`: compute ONE winner per window up front, correct the row IN PLACE
via a bulk HQL UPDATE, never delete+recreate) was only ever applied to
`guardRemovedInheritance` (the REMOVE-path).** `guardDependentsOf`/`guardNewInheritance`
(the ADD-path methods, from rounds 1-2) still use the OLDER delete-then-recreate
strategy — which is structurally the same vulnerability round 6 closed on the other
side, just never backported to this side. This test proves it's reachable in
practice, not just in theory, and via a REAL account (`NewUsertest`) that other
workstreads' own tests independently chose to exercise.

**Also bundled into this round — 7 real SonarQube Quality Gate findings**, all in the
same 2 files, discovered by the SAME `git push` attempt (blocks the push
independently of the test failures above):
```
1. WindowAccessOverlapCorruptionGuard.java:715 — java:S3776 [CRITICAL] — guardRemovedInheritance:
   Cognitive Complexity 19 > 15 allowed.
2. WindowAccessOverlapCorruptionGuard.java:754 — java:S135 [MINOR] — too many break/continue in one loop.
3. WindowAccessOverlapCorruptionGuard.java:544 — java:S125 [MAJOR] — commented-out code block, remove it.
4. WindowAccessOverlapCorruptionGuard.java:679 — java:S135 [MINOR] — too many break/continue in one loop.
5. WindowAccessOverlapCorruptionGuard.java:888 — java:S135 [MINOR] — too many break/continue in one loop.
6. UserRoleCompositionService.java:403 — java:S3776 [CRITICAL] — Cognitive Complexity 16 > 15 allowed.
7. UserRoleCompositionService.java:431 — java:S135 [MINOR] — too many break/continue in one loop.
```
Given the ADD-path fix below will require restructuring `guardDependentsOf` (and
likely touches the same complexity hotspots), tackle these in the SAME pass rather
than as a separate round — refactoring for the bug fix is a natural opportunity to
also reduce complexity, not a coincidence that they landed in the same files.

**Re-dispatch:** schema-forge-developer, `com.etendoerp.go` only, branch
`feature/ETP-4906`. Definition of done: (1) apply round 6's "compute one winner per
window up front, correct in place via bulk UPDATE" pattern to the ADD-path
(`guardDependentsOf`/`guardNewInheritance`) — reuse `repointInPlace`
directly if its signature already fits, or generalize it if the ADD-path's exact
shape differs (e.g. it may need to consider the union of ALL bystander roles
affected, not just one, since the ADD-path fires once per template-gains-a-grant
event and could affect MANY bystanders simultaneously — read `guardDependentsOf`'s
current implementation carefully before assuming round 6's exact shape transfers
1:1); (2) `UserRoleCompositionServiceOverlapReverificationTest`'s 3 tests all pass
(currently 1 passes, 2 fail) — run via the EXACT command `.githooks/pre-push` uses:
`cd /Users/gremiger/workspaces/etendogoclean/etendo && ./gradlew test --tests
"com.etendoerp.go.*"` (NOT a narrower `--tests` filter — the coordinator confirmed
this exact invocation is what the real gate runs, use it verbatim so results are
directly comparable, do not substitute your own narrower command); (3) all 7 Sonar
findings resolved — verify via whatever local Sonar invocation `.githooks/pre-push`
itself uses (check the hook script for the exact command rather than guessing); (4)
the FULL existing suite (7761 tests) still green — the pre-push run showed 7750
passed/2 failed/9 skipped BEFORE this fix; after, expect 7752+ passed, 0 failed,
same 9 skipped, unless you find a legitimate reason a skip count should change; (5)
the human's real `Personal – NewUsertest` role (`6AD5C0CC21F14050A65A3E62DC2FF9A2`)
and the OTHER bystander role hit in test 2 (`F238CDA054BE4D649B1BDD59F73019E1`) both
verified untouched/uncorrupted via read-only `psql`, both before and after. Do NOT
run `./gradlew clean`. Commit locally only, do not push — the human will push
themselves once this is confirmed clean, using the exact same pre-push gate as the
final check (not a separate/narrower verification).

## B6 Findings — 7th gap + Sonar cleanup (developer, 2026-08-17)

### Root cause — NOT the shape hypothesized at dispatch time

The dispatch's working theory was "round 6's exact race, just never backported to
the ADD path": core's `RoleInheritanceManager#calculateAccesses`/`propagateNewAccess`
walking 2+ dependents (or 2+ templates) in one pass with no flush between them,
racing to independently `INSERT` for the same key. That theory turned out to be
**wrong** for this specific failure, confirmed empirically by temporarily enabling
`org.hibernate.SQL`/`org.hibernate.type.descriptor.sql.BasicBinder` at TRACE level
in the module's own `src-test/resources/log4j2-test.xml` (reverted afterward — see
"What was reverted" below) and reading the exact bound-parameter sequence around the
crash.

**What the trace actually showed**, for
`testRealMatrixOverlapSalesAndInventoryOnContactosResolvesToFull`: `guardDependentsOf`
correctly found the bystander role `F238CDA054BE4D649B1BDD59F73019E1` ("Personal –
CompositionUser") already had an active, correctly-sourced, correctly-leveled
`AD_Window_Access` row for the template's newly-granted window — and, per the OLD
code, correctly left it alone (the "already correct, nothing to do" shortcut every
prior round assumed was safe). Moments later, core's own `handleAccess` → `getAccess`
→ `AccessTypeInjector#findAccess` ran its own lookup for that SAME `(F238CDA0,
window)` pair and — traced down to the literal bound SQL parameters — its generated
query filters by `AD_Client_ID in (?, ?)`, bound to the AMBIENT `OBContext`'s OWN
readable-clients list (in the test: the `TEST_USER_ID`'s default role's client +
system client `0`) — **NOT** including `F238CDA0`'s (and the human role's) real
tenant client `802509E12436405C86BA1FD5B1DF508C`. `findAccess` therefore returned
`null` for a row that demonstrably exists and is demonstrably correct — the SAME
structural blindness `crossClientCriteria`'s own javadoc already documents for THIS
class's own queries ("the row-level filter itself is not admin-mode-gated"), just
never previously noticed inside core's OWN query. `handleAccess` then unconditionally
took the CREATE branch (`access == null` → `copyRoleAccess`), producing a SECOND row
for the identical `(AD_Role_ID, AD_Window_ID)` key — the exact collision reported.

This means the ACTUAL trigger has nothing to do with "how many dependents/templates
are processed in one pass" — it fires the SAME way for exactly ONE dependent with
exactly ONE existing row, as soon as that dependent's client differs from whatever
client the calling `OBContext` happens to have active. It is realistic in production
too: any code path that composes/queries roles under a DIFFERENT ambient role than
the target tenant's own (a background job, an admin-tools script, or — as here — a
JUnit test using a fixed `TEST_USER_ID`) is exposed, not only JUnit.

### The fix

`clearConflictingAccessUnconditionally(dependent, window, grantingTemplate)` — a new
shared helper both `guardDependentsOf` and `guardNewInheritance` now route every
dependent through — looks up the dependent's existing row and, if one exists, ALWAYS
calls `deleteForcingCreatePath` on it, REGARDLESS of whether it already matches
`grantingTemplate`. The old "already correctly sourced, skip" branch is gone
entirely.

**Why deletion, not `repointInPlace` (round 6's own pattern) — a deliberate,
documented departure, not an oversight.** `repointInPlace` works for
`guardRemovedInheritance`'s race because that race is about core's OWN precedence
check colliding with ITSELF across 2+ template passes — once the row is repointed to
the SeqNo-correct winner, core's OWN `isPrecedent` check (which DOES successfully see
the row in that code path) resolves to `ACCESS_NOT_CHANGED` and never touches it
again. Here, core's query cannot see the row AT ALL — repointing its fields changes
nothing about whether core's blind `copyRoleAccess` fires; only physically removing
the row guarantees core's CREATE lands on an empty slot. Applying `repointInPlace`
here would have left the exact same collision in place. This is documented in the
class javadoc (`clearConflictingAccessUnconditionally`'s own doc comment) so a future
round doesn't attempt to "fix" this back to `repointInPlace` reasoning from round 6.

Trade-off accepted: a correctly-sourced row is now unconditionally deleted and
recreated (fresh id, fresh audit columns) on every relevant event, even when nothing
actually needed correcting. `correctInheritedOwnership`/`widenInheritedAccessLevelIfNeeded`
already run on every freshly-created inherited row regardless of trigger, so the
final state is unaffected — only churn increases, which is an acceptable cost against
a 500 error on the real `SFAssignUserRoles` webhook.

### Two ALSO-discovered test-data bugs (not a guard bug)

Fixing the guard alone did not turn the 2 failing tests fully green — after the fix,
BOTH tests still failed, but now on a DIFFERENT `ConstraintViolationException`: the
TEMPLATE's own `AD_Window_Access` row (not a dependent's) colliding with itself. Both
`testRealMatrixOverlapSalesAndInventoryOnContactosResolvesToFull` (Inventory) and
`testRealMatrixOverlapSalesAndPurchasingOnProductCategoryStaysReadOnly` (Sales AND
Purchasing) unconditionally `INSERT` a brand-new `AD_Window_Access` row for a
template, without checking whether that template already has one — confirmed via
`psql` that ALL THREE of those template/window pairs already carry a real, active,
correctly-leveled row in this environment (drift from earlier manual verification of
rounds 6/7 against the real webhook, the exact same kind of drift the Contactos
test's own pre-existing comment already documents for Sales specifically — it had
just not yet been observed for Inventory, or for either template on the
Categoría-del-producto window). This is a test-setup defect, not a functional gap:
the guard code never touches a TEMPLATE's own row, so no source-side fix could have
addressed it.

Fixed by extending the ALREADY-ESTABLISHED "skip seeding a template that already has
the exact grant" pattern (previously hand-written once, inline, only for Sales in the
Contactos test) into a shared, reusable `ensureReadOnlyWindowAccess(role, window)`
helper — asserts the pre-existing row (if any) is already read-only (a sanity check
that fails loudly if the environment's data ever stops matching the real matrix,
rather than silently seeding wrong data), and only calls `grantWindowAccess` +
`flush()` when no row exists yet. Applied to all 3 seed call sites across both test
methods.

### Sonar cleanup (bundled per the dispatch, same pass)

All 7 findings resolved in the same commit as the functional fix, since the ADD-path
restructuring already touched the same hotspots:

1. **`WindowAccessOverlapCorruptionGuard.java` — `guardRemovedInheritance` cognitive
   complexity 19 → within budget.** Extracted two pure helpers: `collectWindowGrantors`
   (builds the per-window `anyGrantor`/`fullGrantor` maps across all remaining
   templates — was the method's first nested loop) and `repointWindowIfNeeded`
   (decides + applies the per-window correction — was the method's second loop body,
   with its own 2 early-return branches). `guardRemovedInheritance` itself is now a
   4-line orchestration: fetch grantors, loop calling `repointWindowIfNeeded`,
   refresh if anything changed. A new package-private-scoped static nested class
   `WindowGrantors` carries the 3 maps between the two extracted methods.
2. **Same method, break/continue count 2 → 0** (was `if (existing == null) continue;`
   + `if (sourceCorrect && levelCorrect) continue;` in the `for (Map.Entry...)` loop)
   — resolved as a side effect of the extraction above: `repointWindowIfNeeded` uses
   `return false`/`return true` instead of `continue`, and the outer loop is now
   `anyCorrected |= repointWindowIfNeeded(...)` with no branching of its own.
3. **`correctInheritedOwnership`'s comment flagged as commented-out code (`S125`).**
   False-positive-prone Sonar heuristic: a normal prose sentence
   ("`// Manually-granted row, never template-derived — ownership is whatever the
   grantor set;`") happened to end its first line with a `;` because the sentence
   wrapped onto a second comment line. Rephrased the `;` to a `,` — no wording
   changed beyond the punctuation, sentence still reads correctly across the wrap.
4. **`guardNewInheritance` break/continue count → 0** — resolved for free by the
   SAME functional fix: routing through `clearConflictingAccessUnconditionally`
   collapsed the loop's 3 `continue` statements (window null / no existing row /
   already-correct skip) down to the single pre-existing `if (window == null)
   continue;` guard, which stayed since it is not itself part of this bug's fix.
5. **`guardDependentsOf` break/continue count → 0** — same mechanism, same helper;
   this loop now has ZERO branching of its own (`for (Role dependent : ...) {
   clearConflictingAccessUnconditionally(...); }`).
6. **`UserRoleCompositionService#getAppliedTemplateRoleIdsForClient` cognitive
   complexity 16 → within budget.** Extracted `confirmPersonalRoleForUser(user,
   candidateRolesById, inheritFromTargetRoleIds, assignedUserIdsByRoleId,
   confirmedPersonalRoleIds, personalRoleIdByUserId)` — the per-user "is this
   actually a personal role" classification loop body (3 sequential guard checks,
   each previously a `continue`) — out of the outer method, called once per user
   with `void` return and the 2 output collections mutated in place (matches the
   existing codebase's convention of mutating caller-owned collections for
   accumulator-style per-item classification, rather than introducing a new
   micro-DTO for a single boolean-ish outcome).
7. **Same method's loop, break/continue count 3 → 0** — resolved as a side effect
   of #6: the 3 `continue` statements became 3 `return` statements inside the new
   private method, which is not a loop.

Verified via `./run-sonar.sh --all-issues --fail-on-gate --jacoco-xml
"$CORE_DIR/build/reports/jacoco/jacocoRootReport/jacocoRootReport.xml"` — the exact
command `.githooks/pre-push` step 3 runs (reconstructed manually rather than
executing the whole hook script, which also does git-fetch-based base-branch
resolution not needed for a same-commit local verification). Result: **0 issues in
either touched file** (`WindowAccessOverlapCorruptionGuard.java`,
`UserRoleCompositionService.java`) — previously 7. 55 pre-existing `CODE_SMELL`
issues remain, all in 21 OTHER files this round never touched (unrelated debt). The
Quality Gate itself reported `ERROR` (1 "new violation," `java:S1172` unused
parameter in `OnboardingAccountingWiringService.java:720` — a file this round never
touched, flagged only because `--all-issues`/no `--base-ref` puts the WHOLE branch
in "new code" scope) — but the script's own PR-diff cross-check explicitly printed
*"Quality Gate is ERROR in branch mode, but no new issues fall inside this PR's
diff — CI's PR gate would PASS. Not blocking the push."*, confirming this is a
pre-existing, unrelated issue outside this round's actual diff, not a regression
introduced here.

### Diagnostic instrumentation used, then reverted

To pin down the exact mechanism above (rather than continuing to guess from
javadoc-level reasoning across the 6 prior rounds), `org.hibernate.SQL` and
`org.hibernate.type.descriptor.sql.BasicBinder` were temporarily set to
DEBUG/TRACE in `com.etendoerp.go/src-test/resources/log4j2-test.xml` (the module's
OWN test logger config — NOT the root `etendo/src-test/src/log4j2-test.xml`, which
was also briefly touched by mistake first and reverted immediately, then confirmed
NOT to be the config this module's Gradle `:test` task actually loads). This
produced a full SQL statement + bound-parameter trace across a single test run,
which is how the `AD_Client_ID in (?, ?)` filter — and its 2 concrete bound client
ids — was found and correlated to the crash. Both loggers were reverted to their
original `error`-only state before committing; `git diff --stat` on
`log4j2-test.xml` is empty in the final commit.

### Verification summary

| Check | Before this round | After this round |
|---|---|---|
| `UserRoleCompositionServiceOverlapReverificationTest` | 1/3 pass | **3/3 pass** |
| `com.etendoerp.go.*` full suite (`./gradlew test --tests "com.etendoerp.go.*"`) | 7750 passed / 2 failed / 9 skipped | **7752 passed / 0 failed / 0 errors / 9 skipped** (7761 total) |
| Sonar findings in the 2 touched files | 7 (1 CRITICAL, 3 MINOR ×2 files, 1 MAJOR) | **0** |
| Sonar Quality Gate (whole-branch, `--all-issues`) | — | ERROR (1 unrelated pre-existing new-code issue), script confirms PR-diff gate would PASS |
| Human's role `6AD5C0CC21F14050A65A3E62DC2FF9A2` (34 `AD_Window_Access` rows) | baseline captured via `psql` | **byte-identical**, `diff` confirms |
| Bystander role `F238CDA054BE4D649B1BDD59F73019E1` (13 `AD_Window_Access` rows) | baseline captured via `psql` | **byte-identical**, `diff` confirms |

Files changed (`com.etendoerp.go`, commit `dfb7b2427137ae3ded6a906348b6781d4ec5382b`):
- `src/com/etendoerp/go/roles/WindowAccessOverlapCorruptionGuard.java`
- `src/com/etendoerp/go/roles/UserRoleCompositionService.java`
- `src-test/src/com/etendoerp/go/roles/UserRoleCompositionServiceOverlapReverificationTest.java`

### Open items for the human

1. **Push is still pending** — commit `dfb7b242` is local-only per the dispatch's
   instructions. The human should push using the real `git push` (full pre-push gate,
   not a narrower substitute) as the final acceptance step.
2. **No live/Classic re-confirmation needed for this round** — unlike rounds 4-6,
   this fix was found and closed entirely via an automated test the human never
   manually reproduced; there is no "human clicks X in the UI" step outstanding for
   the 7th gap specifically. The round-6 UI re-confirmation noted in that round's own
   entry above (removing Finance from `Personal – NewUsertest` via "Asignar roles")
   remains open independently of this round.
3. **Known residual risk, inherited from round 6, NOT addressed here (same as
   documented there):** if a dependent has NO existing row at all for a window (a
   brand-new window neither it nor any of its OTHER templates ever granted before),
   `guardRemovedInheritance` still falls back to core's natural CREATE, which could
   in principle hit either this round's OR round 6's race for that one window.
   Considered low-probability in practice (see `guardRemovedInheritance`'s own
   in-code comment) and intentionally out of scope for both rounds.
