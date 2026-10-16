# Team Development Workflow

How to work as a team on Schema Forge — from setup to merge.

---

## 1. Branching Strategy

```
main          ← production-ready, protected
  └── develop ← integration branch, all PRs target here
        ├── feature/ETP-XXXX-description   ← feature work
        ├── fix/ETP-XXXX-description       ← bug fixes
        └── docs/description               ← documentation
```

**Rules:**
- Never commit directly to `main` or `develop`
- All work happens on feature branches from `develop`
- PRs always target `develop`
- `develop` → `main` via release PR (after QA)

---

## 2. Environment Setup (New Team Member)

```bash
# 1. Clone
git clone git@github.com:etendosoftware/etendo_schema_forge.git schema-forge
cd schema-forge

# 2. Install dependencies
npm install          # root workspace (cli + tools)

# 3. Configure frontend mock mode
echo "VITE_MOCK=true" > tools/app-shell/.env

# 4. Verify
node --test 'cli/test/*.test.js'       # all tests must pass
cd tools/app-shell && npm run dev       # frontend at localhost:3100
```

**Optional — DB extraction (only if you need to re-extract from Etendo):**
```bash
cp .env.example .env
# Fill in: ETENDO_DB_HOST, ETENDO_DB_PORT, ETENDO_DB_USER, ETENDO_DB_PASSWORD, ETENDO_DB_NAME
```

---

## 3. Daily Development Flow

### Starting work

```bash
git checkout develop
git pull origin develop
git checkout -b feature/ETP-XXXX-short-description
```

### Types of work

| Task Type | What you touch | How to verify |
|-----------|---------------|---------------|
| **New window** | `cli/` extractors → `artifacts/{window}/` → run pipeline | `node --test 'cli/test/*.test.js'` |
| **Frontend component** | `tools/app-shell/src/` | `npm run dev` in app-shell, visual check |
| **Contract-UI primitive** | `tools/app-shell/src/components/contract-ui/` | All windows affected — check 2-3 representative ones |
| **CLI tool change** | `cli/src/*.js` | `node --test 'cli/test/*.test.js'` |
| **Generated code fix** | `artifacts/{window}/generated/` | Wiring completeness tests |
| **Schema/contract change** | `artifacts/{window}/schema-curated.json` → regenerate | Contract tests + frontend visual check |

### Regeneration flow (when schema or rules change)

```bash
# 1. Edit curated schema/rules
# 2. Regenerate contract
node cli/src/generate-contract.js --window sales-order

# 3. Regenerate frontend
node cli/src/generate-frontend.js --window sales-order

# 4. Run tests
node --test 'cli/test/*.test.js'

# 5. Visual check
cd tools/app-shell && npm run dev
```

---

## 4. PR Workflow

### Create PR

```bash
git push -u origin feature/ETP-XXXX-short-description
gh pr create --base develop --title "feat: description" --body "## Summary\n- What changed\n\n## Test plan\n- [ ] Tests pass\n- [ ] Visual check"
```

### PR Checklist (before requesting review)

```
[ ] All tests pass locally: node --test 'cli/test/*.test.js'
[ ] No console errors in frontend: npm run dev, open browser
[ ] Commit messages are descriptive (English only)
[ ] No secrets or .env files committed
[ ] If contract changed: regenerated frontend matches
[ ] If contract-ui changed: checked 2+ windows visually
```

### Review → Merge

```
Author creates PR → CI runs tests → Reviewer approves → Squash merge to develop
```

---

## 5. Parallel Work Rules

### Safe to work in parallel (different team members, no conflicts)

| Dev A | Dev B | Conflict risk |
|-------|-------|---------------|
| Window `sales-order` artifacts | Window `purchase-order` artifacts | None |
| CLI tool `extract-fields.js` | Frontend `DataTable.jsx` | None |
| New window extraction | Docs update | None |

### Requires coordination (talk first)

| Dev A | Dev B | Why |
|-------|-------|-----|
| `generate-frontend.js` | Any window's generated frontend | Regen will override |
| `contract-ui/` primitives | Any window visual testing | Behavior changes everywhere |
| `registry.js` / `menu.json` | Anyone adding new windows | Same file edited |
| `core-maps/system-columns.json` | Anyone running extraction | Classification changes |

### Rule: One person owns a window at a time

If you're working on `sales-order` (schema, rules, contract, generated code), nobody else touches `artifacts/sales-order/` until your PR merges.

---

## 6. Commit Conventions

```
feat: add commission window extraction and contract
fix: correct field key mismatch in OrderForm
refactor: simplify mock data generation seeding
test: add edge cases for process validation
docs: update deployment strategy for Liquibase evaluation
chore: update dependencies
```

**Rules:**
- English only in commits, code, comments, docs
- Reference Jira ticket: `feat(ETP-3505): add sales order processes`
- One logical change per commit (not one file per commit)

---

## 7. CI Pipeline (GitHub Actions)

```
PR opened/updated
  → npm install
  → node --test 'cli/test/*.test.js'
  → Report results on PR
```

**If CI fails:** Fix on your branch, push again. Never merge with failing tests.

---

## 8. Release Flow

Production updates once a day through the **daily cut**: `mergeblock/ETP-XXXX`, a cut of `develop`
with `main` merged in, reaches `main` through one PR with the full pipeline and a human merge
(regular merge, never squash). The order of operations, who does what, and what to do when the
cut's pipeline fails are in `docs/branch-workflow.md` § Daily Cut.

---

## 9. Troubleshooting

| Problem | Solution |
|---------|----------|
| Frontend shows no data | Check `VITE_MOCK=true` in `tools/app-shell/.env` |
| Tests fail after merge | Run `npm install` (dependency changes) |
| `package-lock.json` conflicts | `git checkout --theirs package-lock.json && npm install` |
| Window not showing in sidebar | Check `registry.js` and `menu.json` |
| Schema Inspector error | File `schema-raw.json` may not exist for that window — expected |
| Generated code outdated | Re-run `generate-contract.js` + `generate-frontend.js` |

---

## 10. Key File Locations

```
cli/src/                    → Pipeline tools (extractors, generators, validators)
cli/test/                   → All tests (node:test)
tools/app-shell/src/        → React SPA (app shell)
  components/contract-ui/   → Shared UI primitives (DataTable, EntityForm, ListView, DetailView)
  hooks/useEntity.js        → Data fetching hook (mock or real API)
  windows/                  → Window loader, registry
  lib/mockFetch.js          → Mock API interceptor
artifacts/{window}/         → Per-window: schema, rules, contract, generated code
core-maps/                  → system-columns.json (field classification)
docs/architecture/          → Production infrastructure docs
```
