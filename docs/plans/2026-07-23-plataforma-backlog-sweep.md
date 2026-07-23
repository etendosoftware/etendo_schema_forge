# Plataforma Backlog Sweep — Quick Wins (2026-07-23)

## Source

JQL filter (Jira, `etendoproject.atlassian.net`):

```
labels = "plataforma"
AND assignee IN (empty, currentUser())
AND status NOT IN (Done, "In Review", "In Progress")
```

31 issues, all in status **TBD**, all unassigned, all under the same epic: **ETP-3504 — "Etendo Next (New New UI)"**.

## Plan

1. Create one new Jira task under **ETP-3504**, label `plataforma`, to act as the grouping/umbrella task for this first sweep (delegated to Clerk).
2. Select a first batch of **quick wins** from the list below (small, contained, low-risk fixes).
3. Each quick win gets its own feature branch/PR, and merges into the umbrella task's branch (not directly into the epic) — same pattern as the merge-block workflow.
4. Once the batch is merged, the umbrella task's branch/PR goes to the epic in a single pass.

## Full backlog (31 issues)

### Security Hardening series (14 — sequential, NOT quick wins, large multi-part initiative)

| Key | Type | Priority | Summary |
|---|---|---|---|
| ETP-4569 | Task | Major | [Assessment] Revalidar hallazgos, threat model y decisiones de arquitectura |
| ETP-4568 | Task | Major | [Backend 1/3] Corregir formula injection en todos los exports CSV |
| ETP-4570 | Task | Major | [Backend 2/3] Implementar autorización centralizada de adjuntos |
| ETP-4571 | Task | Major | [Backend 3/3] Endurecer uploads, downloads y cache de respuestas NEO |
| ETP-4572 | Task | Major | [Delivery 1/3] Definir CSP Report-Only y monitoreo de violaciones |
| ETP-4573 | Task | Major | [Delivery 2/3] Automatizar CloudFront Response Headers Policy |
| ETP-4574 | Task | Major | [Delivery 3/3] Activar CSP y security headers en producción |
| ETP-4575 | Task | Major | [Auth 1/2] Implementar sesión backend, CSRF, rotación y logout |
| ETP-4576 | Task | Major | [Auth 2/2] Migrar frontend de Bearer localStorage a sesión cookie |
| ETP-4577 | Task | Major | [Telemetry 1/2] Implementar gateway central de sanitización |
| ETP-4578 | Task | Major | [Telemetry 2/2] Migrar proveedores y documentar data egress |
| ETP-4579 | Task | Major | [Verification] Ejecutar security re-test y actualizar reporte |
| ETP-4557 | Task | Major | [SECURITY 3/7] Integrate core validation across forms, inline grids, and imports |
| ETP-4558 | Task | Major | [SECURITY 4/7] Enforce declarative validation authoritatively in NEO Headless |
| ETP-4561 | Task | Major | [SECURITY 7/7] Characterize and harden HTML and URL output sinks |

### Candidate quick wins (bugs / small, contained fixes)

| Key | Type | Priority | Summary |
|---|---|---|---|
| ETP-4560 | Bug | Minor | [SECURITY 6/7] Neutralize spreadsheet formula injection in NEO server CSV exports |
| ETP-4559 | Bug | Minor | [SECURITY 5/7] Neutralize spreadsheet formula injection in client-generated CSV files |
| ETP-4326 | Bug | Minor | Fix 500 in aging-receivable NEO report handler: NPE in core AgingDao |
| ETP-4258 | Bug | Minor | Callout SL_Depreciate del asset group pisa defaults de calculateType/depreciate en create de activos |
| ETP-4280 | Bug | Minor | Agente no puede crear cuenta financiera de tipo tarjeta — error opaco sin diagnóstico |
| ETP-4278 | Task | Major | Poblar campo prompt en specs contacts y financial-account para diferenciar bankAccount vs account |
| ETP-4287 | Task | Major | Mark GET-only entities explicitly in MCP discovery [gaps G3/G20] |

### MCP / agentic gaps (larger, needs scoping — not quick wins by default)

| Key | Type | Priority | Summary |
|---|---|---|---|
| ETP-4601 | Task | Major | Report: compare Holded MCP vs Etendo GO MCP to identify gaps |
| ETP-4289 | Task | Major | Seed test data for empty MCP specs (Round 3 unevaluable specs) |
| ETP-4285 | Task | Major | Expose document workflow actions semantically via MCP [gaps G6/G9] |
| ETP-4279 | Task | Major | Corregir expectativa de agente sobre tipos de cuenta financiera (el dominio soporta 3, no 2) |
| ETP-4254 | Task | Major | Limpiar specs NEO de entidades no agénticas y definir criterios de exposición |
| ETP-4242 | Task | Major | No existe spec de escritura (W) para entidades del ERP |

### UX (larger, needs scoping — not quick wins by default)

| Key | Type | Priority | Summary |
|---|---|---|---|
| ETP-4582 | Task | Major | [Shared UX Findings][Platform 1/2] Harden selectors, draft state, CRUD feedback and document-line UI |
| ETP-4580 | Task | Major | [Contacts UX][CO-04-04][Depends on ETP-4554] Unify selected-address visual states |

### Other

| Key | Type | Priority | Summary |
|---|---|---|---|
| ETP-4151 | Task | Major | Store transactional email document downloads in S3 |

## Status

- [x] Umbrella Jira task created: **ETP-4657** (epic ETP-3504, label `plataforma`, unassigned)
- [x] Quick-win batch confirmed with user (all 7 candidates)
- [x] Umbrella branch created: `feature/ETP-4657`, from `feature/ETP-4554` @ `77973325e` (not pushed, no PR yet — ETP-4554 has ongoing work this sweep needs to sit on top of)
- [x] ETP-4560 (1/7 quick wins) implemented, tested, and committed:
  - Repo `com.etendoerp.go`, branch `feature/ETP-4560` (from `epic/ETP-3504` @ `18cff42b`), commit `cc80139a`.
  - Repo `etendo_schema_forge`, branch `feature/ETP-4560` — no changes needed (fix is Java-only), branch is identical to `feature/ETP-4657`.
  - First delivery from the external agent was REJECTED on review (missed `\n` and leading-whitespace-before-marker trigger cases, nothing committed, "tests passed" claim unverifiable). Fixed directly by the coordinator instead of a second round-trip; verified GREEN: `NeoCsvExportServiceTest` 9/9 (`etendo_core/build/test-results/test/TEST-com.etendoerp.go.schemaforge.NeoCsvExportServiceTest.xml`).
  - `com.etendoerp.go` `feature/ETP-4657` created from `epic/ETP-3504` @ `18cff42b` (Clerk-2), `feature/ETP-4560` merged in as a clean fast-forward → HEAD `cc80139a`. Local only, not pushed yet.
  - **User decision (2026-07-23):** going forward this sweep uses chained/stacked PRs per quick win (push branch + `gh pr create --base feature/ETP-4657 --head feature/ETP-XXXX`), not silent local merges — see [[feedback_chained_prs_for_quickwin_batches]]. ETP-4560 itself already went in via local merge before this decision landed, so it has no PR; the chain starts from the next quick win.
  - **In progress:** asked Clerk-2 to push `feature/ETP-4657` (com.etendoerp.go) to origin so the next quick win has something to PR against. Waiting on confirmation — **do not start the next quick win until this is confirmed** (explicit user instruction, 2026-07-23).
- [ ] Remaining 6 quick wins (ETP-4559, ETP-4326, ETP-4258, ETP-4280, ETP-4278, ETP-4287) — NOT started
- [ ] Each remaining quick win merged into umbrella branch via PR
- [ ] Umbrella branch/PR merged into epic

## Note (2026-07-23)

ETP-4560 scope overlaps almost entirely with **ETP-4568** ("[Security Hardening][Backend 1/3] Corregir formula injection en todos los exports CSV", same PRD `client-security-hardening-prd.md`, same file `NeoCsvExportService.java`). ETP-4568 stays out of this batch (part of the larger sequential Security Hardening series), but whoever picks it up later should reference the ETP-4560 fix instead of redoing it.
