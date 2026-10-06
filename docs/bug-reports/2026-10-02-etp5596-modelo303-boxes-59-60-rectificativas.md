# Modelo 303 (Etendo Go) — casillas 59/60 no incluían rectificativas/notas de crédito intracomunitarias de venta

Date: 2026-10-02

Jira: [ETP-5596](https://etendoproject.atlassian.net/browse/ETP-5596) — "Modelo 303: las casillas
59 y 60 no incluyen las facturas rectificativas en operaciones intracomunitarias de venta"

Status: **Implemented, REVIEW-approved, QA PASSED, live-verified. Branch `feature/ETP-5596` in
`com.etendoerp.go` (commit `e3881666a`), not yet pushed/PR'd.** This repo (`schema_forge`) has no
code change for this fix — it is a pure backend Java fix in `com.etendoerp.go`. This document
exists only to satisfy this repo's Documentation Freshness policy (bug diagnoses land in
`docs/bug-reports/`), mirroring the precedent set by
`2026-09-24-etp5317-invoice-delivery-status-percentage-mismatch.md` for GO-only fixes.

## Symptom

Every sales-side intracommunity operation (entrega intracomunitaria de bienes/servicios) that is a
**rectificativa / nota de crédito** — negative or positive — was silently dropped from the
corresponding Modelo 303 boxes in Etendo Go. No error, no log; the amount was simply never summed.

Affected:
- **Casilla 59** — Entregas intracomunitarias de bienes y servicios
- **Casilla 60** — Exportaciones y operaciones asimiladas

Casilla 61 ("Operaciones no sujetas o con inversión del sujeto pasivo") has the identical root
cause in Go, but was explicitly scoped out: it only applies to the 2021-and-earlier form, and the
system cannot create a 2021 declaration at all, so it is unreachable in practice.

## Root cause

File: `modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/Fiscal303BoxesHandler.java`

- `fillAdditionalInfoBoxes()` computed boxes 59 and 60 via `fillGroupBoxes(...)`, which internally
  called `helper.calculateAmountsMap(rates, InvoiceType.ONLY_NORMAL)` — hardcoded to
  `ONLY_NORMAL`, excluding everything classified as `InvoiceType.ONLY_MEMO_AND_CORRECTIVE`
  (rectificativas/notas de crédito).
- For boxes that have a dedicated rectification "pair" (14/15, 25/26, 40/41), Go correctly
  complements that `ONLY_NORMAL` call with a second call to `fillMemoCorrectiveBoxPair(...)` that
  adds the rectificativa delta.
- **Boxes 59 and 60 never had that second call** — and the "pair" pattern does not even apply to
  them, because neither box has a dedicated rectification counterpart box.

### Reference (Classic)

`modules/org.openbravo.module.aeat303.es/src/org/openbravo/module/aeat303/es/report/v2014/AEAT303Report2014.java`,
`generatePage3()`: boxes 59, 60 (and 61) are computed in a **single pass** with
`InvoiceType.ALL` (normals + rectificativas + both signs at once). Classic has no
`fillMemoCorrectiveBoxPair`-equivalent for these boxes — a box with no dedicated rectification
counterpart is correctly computed with one `ALL` pass, not a paired `ONLY_NORMAL` + delta.

`Fiscal303BoxesHandler` reuses Classic's calculation engine directly (imports
`org.openbravo.module.aeat303.es.api.InvoiceType`,
`org.openbravo.module.aeat303.es.util.AEAT303CalculationsHelper`,
`org.openbravo.module.aeat303.es.report.v2014.AEAT303Report2014Dao`). The shared
`calculateAmountsMap` helper has no bug — it works correctly for any `InvoiceType` passed to it.
The defect was 100% in Go's orchestration (`fillAdditionalInfoBoxes`), which over-generalized the
paired pattern (`ONLY_NORMAL` + `fillMemoCorrectiveBoxPair`) onto boxes that Classic always
computed with `ALL` in a single pass.

## Fix

Changed the box 59/60 calculation in `fillAdditionalInfoBoxes()` from
`fillGroupBoxes(..., InvoiceType.ONLY_NORMAL)` to a direct pass with `InvoiceType.ALL`, mirroring
Classic's `generatePage3()`. No `fillMemoCorrectiveBoxPair` call added for these two boxes — they
have no dedicated pair. No other boxes (14/15, 25/26, 40/41, 61) were touched.

Files touched (both in `com.etendoerp.go`):
- `src/com/etendoerp/go/schemaforge/Fiscal303BoxesHandler.java`
- `src-test/src/com/etendoerp/go/schemaforge/Fiscal303BoxesHandlerTest.java`

## Live verification

Verified in dev with 3 invoices against the same intracommunity customer:
normal (102,50€) + rectificativa negativa REC-1000011 (-10,25€) + rectificativa positiva
REC-1000012 (+30,75€) → casilla 59 = 123,00€ (correct net). Casilla 60 (exportaciones) also
verified live with a non-EU customer / "Exportaciones (%N=>0%)" rate and fills correctly. Both
rectificativa signs confirmed on both boxes. Unit tests: 100 pass, 0 failures. REVIEW (Alex) and
QA (Sentinel) approved.

QA initially flagged as a gap that the "nota de crédito" subtype (ARC/APC document-classification
path in `AEAT303CalculationsHelper`, distinct from the "Es rectificativa" checkbox path) was not
tested. Clarified by the user: **not a gap, inapplicable** — Etendo Go only offers "Factura
normal" and "Factura rectificativa" as invoice doctypes; there is no independent nota-de-crédito
doctype (that only exists in Classic). The only rectificativa path reachable in Go was already
tested live, both signs.

## Scope notes

- **Out of scope:** casilla 61 (2021-only form, unreachable — see Symptom above).
- **Out of scope:** adding a "Factura Rectificativa" type to SII Compras — tracked separately, not
  related to this bug.
- No `schema_forge` artifact / `decisions.json` / window config change — this is a pure backend fix
  with no frontend or window impact.

## Documentation impact check (this repo's Documentation Freshness policy)

- `com.etendoerp.go/docs/aeat-303-submit-endpoint.md` documents the `/neo/fiscal303/submit`
  endpoint contract, not the box-calculation logic in `fillAdditionalInfoBoxes()` — it does not
  mention boxes 59/60 or the `ONLY_NORMAL`/`ALL` distinction, so nothing there was stale or needed
  correcting.
- No other file in `com.etendoerp.go` (searched `docs/`, `README.md`, ADRs) documents the Modelo
  303 box-calculation behavior or lists "boxes 59/60 only include normal invoices" as a known
  limitation. `com.etendoerp.go` has no bug-reports-style folder of its own (its `docs/` holds
  feature/API references and ADRs only) — this write-up is the only diagnostic record of the bug,
  hence it is committed here per `schema_forge`'s own convention.
