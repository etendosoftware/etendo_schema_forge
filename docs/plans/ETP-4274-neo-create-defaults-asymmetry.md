# ETP-4274 — NEO Headless: `neo_create` ignores non-mandatory column defaults

**Type:** Error (Mayor) · **Repo:** `com.etendoerp.go` (Go-only) · **Branch:** `feature/ETP-4274`
**Reporter:** agentic-validation bot (label `validacion-agentica`) · Sebastian Barrozo
**Root-cause category:** code-bug (NEO Headless Java)

---

## 1. Summary

`POST /defaults` (`NeoDefaultsService.resolveDefaults`) resolves **all** applicable field
defaults — including non-mandatory ones such as `C_Currency_ID` (from session var
`@C_Currency_ID@`). But the CREATE path (`NeoDefaultsService.injectMandatoryDefaults`)
only iterates **mandatory** columns, so every legitimately-resolved non-mandatory default
the client just received from `/defaults` is **silently dropped** on `neo_create`. The
client is forced into an extra `neo_update` round-trip, and any process that depends on
that field (e.g. `neo_action(Processed)` needing a currency) fails until the round-trip
is done.

This is a **defaults/create asymmetry**: the read path is broad, the write path is
mandatory-only.

---

## 2. Reproduction (verified on local MCP `etendo-go-local`, spec `assets`)

| Step | Call | Result |
|------|------|--------|
| 1 | `neo_defaults(spec=assets, entity=assets)` | returns `"currency": "102"` (`EUR`) ✅ |
| 2 | `neo_create(spec=assets, entity=assets, {name, searchKey})` | record created with **`"currency": null`** ❌ |
| 3 | (per ticket) `neo_action(Processed)` | fails *"Currency field must be defined"* |
| 4 | Workaround `neo_update(currency="102")` then retry | succeeds |

`assets.currency` schema confirms the trigger condition:
`required: false`, `defaultExpression: "@C_Currency_ID@"`, `type: foreignKey`,
`selectorType: TableDir`. A non-mandatory column with a resolvable default.

> Repro asset (`6F2252EA988B4B81B49F48A4D1F835F7`) was created and deleted during analysis;
> local DB left clean.

---

## 3. Root cause

`src/com/etendoerp/go/schemaforge/NeoDefaultsService.java`, in
`injectMandatoryDefaults(...)`:

```java
for (Column col : adTab.getTable().getADColumnList()) {
  if (!col.isActive() || !col.isMandatory()) {   // <-- line 836: mandatory-only filter
    continue;
  }
  ...
  injectMandatoryDefaultForColumn(body, dalEntity, col, mCtx);
}
```

The `!col.isMandatory()` clause skips any non-mandatory column outright, so a column like
`C_Currency_ID` (not NOT-NULL, but with a session-var default) never reaches
`injectMandatoryDefaultForColumn`.

The per-column helper itself (`injectMandatoryDefaultForColumn`, ~line 908) is already
correct and safe — it tries, in order:
1. `tryResolveFieldDefault` — AD_Column `defaultExpression` / `@SQL=` / ETGO_SF_FIELD override
2. `tryInjectFromSession` — `#Col` / `Col` session value (this is what resolves `@C_Currency_ID@`)
3. `tryInjectFromParentValues` — `@ParentColumn@` from the parent record
4. `tryInjectFirstFromLookup` — **combo-only** first-option preselection (TableDir/Table/List)
5. `injectSafeTypeDefault` — last-resort safe numeric/boolean default

Steps 4 and 5 exist specifically to avoid **NOT NULL violations** on mandatory columns.
For **non-mandatory** columns they would be *over-injection* — e.g. preselecting the first
combo row for an optional FK, or forcing a `0`/`false` onto a column the user left blank.

So the fix is **not** "remove the mandatory filter" — that would regress. It is "also
resolve **genuine** defaults for non-mandatory columns, without the aggressive fallbacks."

---

## 4. Existing guards we MUST preserve

- **ETP-3894** (lines 933–941): `tryInjectFallbackFkDefault` was removed so we never
  silently pick the first record for a Search-type FK (`C_BPartner_ID`, Contact, etc.).
  Our change must not reintroduce any first-record pick for Search-type FKs.
- **PK columns** (line 842): skipped — DAL auto-generates UUID PKs.
- **Audit columns** (lines 848–851 + `isAuditColumn` in the helper): skipped — Hibernate
  manages them.
- **User-supplied values win**: `injectMandatoryDefaultForColumn` early-returns if
  `body.has(propName)` (line 920). Must stay.

---

## 5. Proposed fix

Keep iterating all active columns, but branch the per-column behaviour on
mandatory-ness so non-mandatory columns get only the *real* default-resolution passes
(1–3 above), never the NOT-NULL safety fallbacks (4–5).

### 5.1 Loop change

```java
for (Column col : adTab.getTable().getADColumnList()) {
  if (!col.isActive()) {
    continue;
  }
  if (Boolean.TRUE.equals(col.isKeyColumn())) {     // PK guard (unchanged)
    continue;
  }
  org.openbravo.base.model.Property prop =
      dalEntity.getPropertyByColumnName(col.getDBColumnName());
  if (prop != null && prop.isAuditInfo()) {          // audit guard (unchanged)
    continue;
  }
  injectMandatoryDefaultForColumn(body, dalEntity, col, mCtx, col.isMandatory());
}
```

### 5.2 Per-column helper change

Add a `boolean mandatory` parameter to `injectMandatoryDefaultForColumn` and gate the two
aggressive fallbacks behind it:

```java
private static void injectMandatoryDefaultForColumn(JSONObject body, Entity dalEntity,
    Column col, MandatoryDefaultContext mCtx, boolean mandatory) {
  ...
  if (body.has(propName)) return;                 // user value wins (unchanged)

  if (tryResolveFieldDefault(body, propName, col, mCtx)) return;   // defaultExpression / ETGO_SF_FIELD
  if (tryInjectFromSession(body, dalEntity, propName, col, mCtx)) return;  // @C_Currency_ID@ -> here
  if (tryInjectFromParentValues(body, dalEntity, propName, col, mCtx.parentValues)) return;

  if (!mandatory) {
    // Non-mandatory: stop here. No combo first-pick, no safe-type fallback —
    // leaving the column unset is correct (no NOT NULL risk; preserves ETP-3894).
    return;
  }

  if (tryInjectFirstFromLookup(body, dalEntity, propName, col, mCtx.neoCtx)) return;  // combo-only
  NeoDefaultsCascadeHelper.injectSafeTypeDefault(body, propName, col);
}
```

Net effect for the repro: `C_Currency_ID` is non-mandatory, has no `body` value, and
`@C_Currency_ID@` resolves via `tryInjectFromSession` (step 2) → currency is now injected
on create. No change for mandatory columns (they still get all five passes).

### 5.3 Why this satisfies the acceptance criteria

| Acceptance criterion | How it's met |
|----------------------|--------------|
| `neo_create` applies a resolved default for any column `/defaults` would return | Non-mandatory columns now run passes 1–3, the same resolution `/defaults` uses |
| User-supplied values always win | `body.has(propName)` early-return unchanged |
| PK / audit columns excluded | Guards moved into the loop, applied to all columns |
| Search-type FK fallbacks excluded (preserve ETP-3894) | Non-mandatory path stops before `tryInjectFirstFromLookup`; mandatory path keeps the existing combo-only (never Search) behaviour |
| No over-injection on existing windows (orders/invoices) | Mandatory columns unchanged; non-mandatory ones only get a value when a *genuine* default resolves — no blanket combo/safe-type fill |

---

## 6. Risk & blast radius

- **Surface:** one method (`injectMandatoryDefaults` loop) + one helper signature
  (`injectMandatoryDefaultForColumn`) and its two static overloads (lines 786–792). All
  callers go through the public overloads, so only the private signature gains a param.
- **Main regression risk:** a non-mandatory column with a `defaultExpression` that we
  previously *didn't* inject now gets injected. This is the intended behaviour, but it
  must be checked against documents that have many optional columns with defaults
  (sales-order / purchase-order / invoices) to ensure nothing unwanted is now populated
  (e.g. an optional flag flipping a downstream callout).
- **Cascade interaction:** `executeCalloutCascadeForCreate` (line 861) runs after the
  loop with the fuller `body`. More resolved fields = more accurate cascade input — but
  the cascade must be re-verified on a document window, not just `assets`.

---

## 7. Verification plan

1. **Unit/contract regression test** (delegate to Tester): create `assets` with only
   `{name, searchKey}` → assert `currency` is populated without explicit input; then
   `neo_action(Processed)` succeeds with no intermediate `neo_update`.
2. **Over-injection guard test:** create a `sales-order` / `purchase-order` header via
   `neo_create` and diff the persisted record against the pre-fix behaviour — confirm no
   *new* unexpected non-mandatory fields are set.
3. **Manual MCP re-run** of the §2 reproduction on the built branch — currency must be
   non-null on create.
4. **ETP-3894 non-regression:** create a document omitting a Search-type FK
   (`C_BPartner_ID`) → it must remain empty (no silent first-record pick).

---

## 8. Out of scope

- The `defaultExpression="0"` schema-exposure concern (ETP-4288) is a separate
  upstream-config ticket.
- No changes to `/defaults` (`resolveDefaults`) — it already behaves correctly; this
  ticket only brings the CREATE path up to parity with it.

---

## 9. Implementation checklist

- [ ] Add `boolean mandatory` param to `injectMandatoryDefaultForColumn`; gate passes 4–5.
- [ ] Move PK + audit guards into the loop; drop the `!col.isMandatory()` early-continue.
- [ ] Pass `col.isMandatory()` at the call site.
- [ ] Regression test: `assets` currency on create (+ `neo_action(Processed)`).
- [ ] Over-injection test on a document window (orders/invoices).
- [ ] Manual MCP re-verification of §2.
- [ ] Self-doc: note the parity change in `docs/neo-headless.md` if defaults behaviour is
      documented there.
