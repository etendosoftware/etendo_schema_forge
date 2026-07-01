# ETP-4083 Cross-Domain Plan: DetailView / generate-frontend Refactor + Estimate Skill

## Domains

- `platform-change`: behavior-preserving cognitive-complexity refactor of the
  long routines in `tools/app-shell/src/components/contract-ui/DetailView.jsx`.
  UI helpers (title, row-click/label, inline row update, delete row) are
  extracted into pure functions, each covered by a focused vitest suite:
  `DetailView.uiHelpers.vitest.js`, `DetailView.titleHelpers.vitest.js`,
  `DetailView.rowClickAndLabel.vitest.js`, `DetailView.inlineRowUpdate.vitest.js`,
  `DetailView.deleteRow.vitest.js`, and `DetailView.extractedHelpers.vitest.js`.
  No rendering or data-flow change.
- `generator-change`: matching behavior-preserving helper extraction in
  `cli/src/generate-frontend.js`, landing alongside its tests
  (`cli/test/generate-frontend.test.js`). No change to generated output
  (confirmed by the generator unit tests and the Offline Regeneration Check).
- `unknown` (Claude developer tooling): the new `estimate` skill under
  `.claude/skills/estimate/` (`SKILL.md`, `points-table.md`,
  `calibration-log.md`). Classified `unknown` only because `.claude/skills/`
  has no scope glob; it is local developer tooling that produces task estimates
  and has zero runtime, generator, or window impact. It ships here because it is
  the deliverable of the same ETP-4083 task as the refactor sweep above.

## Why This Cannot Be Split Cleanly

This PR is one ETP-4083 unit: a pair of pure, behavior-preserving extractions
made to lower cognitive complexity (one on the shared `DetailView`, one on the
`generate-frontend` generator), each paired with the tests that prove the
extracted code is exercised, plus the `estimate` skill that the same ticket asked
for. The extractions carry no functional change and have no independent review
value on their own; the skill is documentation/tooling. Reviewed together they
are coherent as "the ETP-4083 readability pass plus its estimation tooling";
split apart they would yield trivial PRs with no standalone value.

## Review Order

1. Platform refactor — `DetailView.jsx`: confirm extracted helpers are called
   identically and the six `DetailView.*.vitest.js` suites exercise each one.
2. Generator refactor — `cli/src/generate-frontend.js`: confirm extracted
   helpers preserve behavior, covered by `generate-frontend.test.js` and the
   Offline Regeneration Check.
3. Estimate skill — `.claude/skills/estimate/*`: documentation/tooling review
   only; no executable runtime path.
4. Review this plan.

## Tests

- App-shell vitest: the six new `DetailView.*.vitest.js` suites pass.
- CLI suite: `generate-frontend.test.js` passes; Offline Regeneration Check and
  Pipeline Validation stay green (no generated-output drift).
- No DB, NEO push, or `export.database` involved — these are source-level
  refactors plus a tooling/skill addition.

## Rollback

Every change is behavior-preserving (helper extractions plus added tests) or
inert (a Claude skill), so rollback is a straight revert of the PR merge commit.
Each extraction is an isolated, atomically committed change, so a single
regression can be reverted with `git revert <commit>` without touching the
others. No data migration, NEO re-push, or `export.database` is required —
reverting fully restores prior behavior. Detection is via the existing unit
suites and the Offline Regeneration Check.
