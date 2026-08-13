# Architecture Review Guidelines

These instructions guide automated code review for the Schema Forge project.
Flag violations clearly with the specific rule broken and the file/line involved.

---

## Language Policy

- ALL code, comments, variable names, commit messages, and documentation MUST be in English.
- File names must be in English.
- The only exception is user-facing conversation (not committed to the repo).

## Project Architecture

### Stack

- **Runtime:** Node.js 22 with ESM (`"type": "module"`, `import`/`export` only, no `require()`).
- **Frontend:** React with Tailwind CSS and shadcn/ui components. Vite for dev/build.
- **Testing:** `node:test` runner with `node:assert`. No Jest, no Mocha.
- **Workspaces:** npm workspaces -- `cli/` and `tools/*`.
- **Generated backend:** Java (Etendo module using OBDal, event handlers, Etendo RX endpoints).

### Dependencies

- CLI tools must remain zero-dependency (Node.js built-ins only).
- New npm dependencies require clear justification in the PR description.
- Prefer `node:` built-in modules over third-party packages.

## File Organization

| Content | Location |
|---------|----------|
| CLI tools (extractors, validators, generators) | `cli/` |
| React decision tools | `tools/` |
| Per-window artifacts (schemas, rules, decisions, generated code) | `artifacts/{window-name}/` |
| General Etendo AD reference docs | `docs/etendo-ad/` |
| UI components (shadcn) | `tools/*/src/components/ui/` |
| Domain-specific components | `tools/*/src/components/contract-ui/` |
| Java/XML code generation templates | `templates/etendo-module/` |
| Core mappings (system columns, impact messages) | `core-maps/` |
| Project documentation | `docs/` |

### What to flag

- Window-specific data placed outside `artifacts/{window}/`.
- General Etendo AD findings placed inside `artifacts/` instead of `docs/etendo-ad/`.
- Test files not co-located in `cli/test/` or the appropriate test directory.
- Components placed in the wrong component directory.
- Duplicated logic blocks introduced in the same PR instead of extracting a shared helper or reusing an existing abstraction.
- Changes that contradict the documented runtime split: Schema Forge defines contracts/configuration, Etendo Go serves them at runtime.
- New review automation should prefer deterministic checks in `cli/` plus `.github/workflows/` instead of burying complex shell logic directly in workflow YAML.


## Review Outcome Guidance

### Request changes

- Use **request changes** when the issue is merge-blocking: duplicated code blocks, missing tests for new behavior, CommonJS usage, secrets, `.env` files, wrong directories, or contract-breaking changes without the required version/test updates.

### Comment only

- Use **comment only** for advisory findings: new dependencies that need justification, simplification opportunities, or architecture observations that do not immediately break correctness or repository policy.

## Code Patterns

### ESM

- All files use `import`/`export`. No CommonJS (`require`, `module.exports`).
- File extensions required in imports (`.js`).

### Testing

The project has two distinct test layers — do not conflate them:

| Workspace | Framework | File pattern | Runner |
|-----------|-----------|--------------|--------|
| `cli/` | `node:test` + `node:assert` | `cli/test/*.test.js` | `node --test 'cli/test/*.test.js'` |
| `tools/app-shell/` | Vitest | `**/__tests__/*.vitest.js` and `**/__tests__/*.vitest.jsx` | `npx vitest run` |

A file named `*.vitest.js` or `*.vitest.jsx` inside `tools/app-shell/` **is** a test file. Do not flag it as missing tests.

- Every new feature must include tests.
- Every process must declare at least 3 edge cases.
- Every kept business rule must have a behavioral test.

### Versioning

Three independent version numbers -- never conflate them:

- `moduleVersion` -- increments on every regeneration.
- `apiVersion` -- increments when DTO shape changes (frontend depends on this).
- `behavioralVersion` -- increments when rules/processes change (tests depend on this).

## Security Rules

- **Input validation:** Validate all user input. Prevent path traversal (`../`), command injection, and XSS.
- **No secrets in code:** Never commit `.env` files, API keys, passwords, tokens, or credentials.
- **Whitelist over blacklist:** Validate against allowed values, do not try to block bad values.
- **Sanitize file paths:** Use `path.resolve()` and validate against a base directory.

## Generated Code Contracts

- Contract tests (~145) run against JSON contract files. Changes to contracts are breaking changes.
- Integration tests (~100, JUnit) run inside Etendo via OBBaseTest.
- Flag any PR that modifies contract JSON files without updating corresponding tests.
- Flag any PR that changes DTO shapes without incrementing `apiVersion`.

## PR Workflow

- All changes go through PRs. No direct pushes to `main`.
- Every task uses an isolated git worktree (`feat/` branch).
- PRs require review and QA approval before merge.
- Squash merge only (`gh pr merge --squash`).

## What to Always Flag

1. **Direct pushes to main** -- all changes must go through PRs.
2. **New npm dependencies** without justification.
3. **Non-English content** in code, comments, variable names, or docs.
4. **Security issues** -- injection, XSS, path traversal, hardcoded secrets.
5. **Files in wrong directories** -- see File Organization table above.
6. **Missing tests** for new functionality.
7. **Breaking contract changes** without version bumps.
8. **CommonJS usage** (`require()`, `module.exports`) in any file.
9. **Large binary files** committed to the repository.
10. **`.env` or credential files** added to version control.
