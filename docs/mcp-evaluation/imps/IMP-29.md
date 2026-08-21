# IMP-29 — Entity identifiers leak the tenant's AD language

**Registered:** 2026-08-13 (cohort C6) · **Priority:** P2 · **Class:** ♻️ same call
**Repo(s):** `schema_forge_core` + `com.etendoerp.go`
**Registry row:** `mcp-improvements-registry.md` §3 · **Evidence:** run report
[`mcp-comparison-post-audit-2026-08-13.md`](../mcp-comparison-post-audit-2026-08-13.md) §9.3

> **State of this file: opened, not investigated.** Observations only. **No source read, no DB
> queried.** The next person to work it starts at §3.

---

## 1. What was observed (`neo_discover`, `etendo-go-local`, build `8f0d1cce`)

Entity names come back in mixed languages, because they are derived from AD tab names in the tenant's
language:

| Spec | Entity identifiers as returned |
|---|---|
| `general-ledger-configuration` | `Dimensiones`, `Cuentas generales`, `Valores por defecto` |
| `monitor-verifactu` | `cabeceraDeEmisor`, `facturasRechazadas`, `facturasInválidas` |
| `tbai-facturas-enviadas` | `sincronización`, `resultadoValidación` |
| `verifactu-config` | `cabeceraDeConfiguraciónVerifactu` |
| `sii-monitor` | `issuedInvoices(previousPeriod)` |

## 2. Why this is one item and not a cosmetic gripe — three distinct problems

1. **Non-determinism across tenants.** The same spec exposes different entity names depending on the
   tenant's AD language. No recipe, no doc, no test and no `docs` topic can name an entity and be
   correct on more than one tenant. This is the clause that makes it a real item: it caps how far the
   documentation half of IMP-10/IMP-14 can ever go.
2. **Non-ASCII in a path segment.** `facturasInválidas`, `sincronización`, `resultadoValidación` are
   used where an identifier is expected. Anything that URL-encodes, logs, or round-trips through a
   system with a narrower charset now has a per-tenant failure mode.
3. **Characters requiring encoding.** `issuedInvoices(previousPeriod)` puts parentheses in an
   identifier.

Note that `Dimensiones` and `Cuentas generales` also contain a **space**, which is arguably a fourth
instance of (3) and should be covered by the same predicate rather than listed separately.

## 3. Hypotheses to knock down — none tested yet

| # | Hypothesis | How to test | Verdict |
|---|---|---|---|
| H1 | The entity name is derived at **spec-authoring** time from `AD_Tab.Name` in whatever language the authoring session used, and stored in `ETGO_SF_ENTITY` — so the leak is baked into the config rows and every tenant's DB differs | `SELECT` the entity names from `ETGO_SF_ENTITY` and compare against `AD_Tab` / `AD_Tab_Trl`; check whether the extractor reads the translated name | *not tested* |
| H2 | The name is derived at **request** time from the AD tab in the session language, so the same DB serves different identifiers to different users | Call `neo_discover` twice under two session languages on one tenant and diff | *not tested* |
| H3 | Both: authored names are stored, but a fallback re-derives them when the stored value is blank (the same per-window fallback shape as IMP-1) | Find the fallback and check which specs hit it — the affected specs above are all localization/compliance modules, which is suspicious | *not tested* |

H1 and H2 have **very different fixes**: H1 needs a slug function in `schema_forge_core`'s extractor
plus a migration of existing config rows; H2 needs the runtime to stop consulting the session
language. H3 needs both. Discriminating them is therefore the first task, and the answer decides
whether this is a `schema_forge_core` item, a `com.etendoerp.go` item, or both — the registry row
currently says both because that is the honest superset.

## 4. What a fix must not do

- **Do not lose the human-readable name.** The display name has to be kept separately (the React UI
  and the `label` fields depend on it) — this item is about the *identifier*, and a fix that ASCII-fies
  the label too would be a regression for humans while looking correct to an agent.
- **Do not rename identifiers on an existing tenant without a migration path.** Any agent recipe,
  stored prompt or saved call that names `facturasRechazadas` breaks. The non-determinism means such
  callers are already tenant-specific, but "already broken elsewhere" is not a reason to break them
  here silently.
- **Do not fix only the non-ASCII half.** Stripping accents makes the strings safer and leaves the
  identifiers still language-dependent — clause 1, the one that matters, untouched. That is this
  item's version of the looks-compliant trap.

## 5. `Done when:`

- [ ] The §3 question is answered with evidence, and the repo scope narrowed accordingly.
- [ ] Entity identifiers are **stable across AD language** — verified by discovering the same spec
      under two session languages and diffing to nothing.
- [ ] Entity identifiers are ASCII and free of characters needing URL encoding (spaces and parentheses
      included) — pinned by a test over the whole discovered surface, not a spot check.
- [ ] The display name is still available for humans, on a separate key.
- [ ] Existing config rows migrated, or the change is proven to be derive-time only.
- [ ] Re-probed by a `/mcp-comparison` run. Status moves only in the registry.
