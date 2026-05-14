# Copilot PR Review Gate

> **Status:** APPLIED in repository automation
> **Last updated:** 2026-04-14

## Context

This repository already had deterministic PR automation (`core-approval.yml`, `test.yml`, `pr-architecture-alert.yml`), but the architecture review was limited to a PR comment with a few regex-based findings.

The goal of this change is to make pull request review stricter and more useful for the cases that repeatedly hurt this codebase:

- duplicated blocks introduced during feature work
- changes that break the documented repository architecture
- missing tests for new behavior
- CommonJS usage inside a Node.js 22 ESM repository
- secrets, `.env` files, and oversized files

## Decision

We keep two layers, with different responsibilities:

1. **GitHub Copilot review instructions** in `.github/copilot-review-instructions.md`
   - These guide native Copilot review comments when Copilot review is enabled in repository or organization rulesets.
   - They stay advisory, because GitHub Copilot reviews do not approve PRs or request changes.

2. **A deterministic GitHub Actions review gate** in `.github/workflows/pr-architecture-alert.yml`
   - This runs on PR open, reopen, and synchronize events.
   - It delegates the review logic to `cli/src/pr-review.js`.
   - It can update a PR summary comment and, when blockers exist, submit a `REQUEST_CHANGES` review through the GitHub API.
   - The workflow keeps the historic job context `architecture-check` so the repository ruleset can require the check without a disruptive status-check rename.
   - The workflow only runs for PRs targeting `develop` or `epic/ETP-3504`.



This split matches GitHub's current model: Copilot comments are useful guidance, while merge-blocking behavior must come from repository automation.

## Review outcomes

The gate classifies findings into two severities:

- **warning**
  - advisory only
  - updates the PR summary comment
  - does not fail the workflow
- **blocker**
  - updates the PR summary comment
  - creates a `REQUEST_CHANGES` review for the current head SHA
  - fails the workflow so the check can be required in branch protection

When a later push fixes all blockers, the workflow dismisses prior bot change requests and removes the summary comment.

## Detection scope

`cli/src/pr-review.js` is intentionally deterministic and zero-dependency. It inspects the diff between the PR base SHA and head SHA and looks for:

- duplicated added code blocks (normalized contiguous added-line runs)
- new npm dependencies in `package.json`
- committed `.env` files or obvious credential markers
- the currently enforced directory-placement rules: test-file placement and artifact JSON files that must live under `artifacts/`
- new source files without corresponding test files
- CommonJS patterns (`require`, `module.exports`) in changed JS/TS files
- changed files larger than the repository threshold

The goal is not to replace human review. The goal is to catch obvious architecture drift before review time is wasted.

## Operational notes

- For the full Copilot experience, repository or organization admins still need to enable **automatic Copilot review** via GitHub rulesets.
- The action itself does not enable Copilot; it enforces the same repository rules in a machine-checkable way.
- The repository ruleset now targets `refs/heads/develop` and `refs/heads/epic/ETP-3504`, enabling Copilot review on push and requiring the `architecture-check` status check on those branches.

- Because the review gate is implemented as a CLI module plus tests, behavior changes must update:
  - `cli/test/pr-review.test.js`
  - `.github/copilot-review-instructions.md`
  - this document

## Files involved

- `.github/workflows/pr-architecture-alert.yml`
- `.github/copilot-review-instructions.md`
- `cli/src/pr-review.js`
- `cli/test/pr-review.test.js`
