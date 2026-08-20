# ETP-4933 — Standardize Save button enablement (gate on required-field completeness)

**Status:** planned — not started
**Jira:** [ETP-4933](https://etendoproject.atlassian.net/browse/ETP-4933) — Story, Defined, Major
**Labels:** `Bloque2`, `General`, `Pasada1`
**Reporter:** Valeria Garcia · **Assignee:** Valentin Vivaldi
**Date:** 2026-08-20

## 1. Goal

The primary persist action (Save / Complete / Confirm) must be disabled until every
visible, editable, required field of the active form or modal holds a valid value,
and must re-evaluate in real time as the user fills or clears fields. The rule is
cross-cutting: one shared hook, no per-form ad-hoc implementations.

Out of scope per the ticket: secondary actions (Cancel / Close / Back), read-only
forms, filter bars, and immediate actions with no intermediate form.

## 2. Current state

### 2.1 What already exists and is reusable

**`getMissingRequiredFields(fields, editing)`** — `tools/app-shell/src/hooks/useEntity.js:557`.
Already handles the hard part correctly:

```js
.filter(f => f.required && !isReadOnly(f) && isVisible(f)
          && f.type !== 'checkbox' && f.section !== 'summary')
.filter(f => { const v = editing?.[f.key];
               return v == null || v === '' || (typeof v === 'string' && v.trim() === ''); })
```

`isReadOnly` / `isVisible` (`useEntity.js:533` / `:546`) evaluate the per-field
`readOnlyLogic` / `displayLogic` closures, so conditionally hidden or locked
required fields are correctly excluded.

**The visible-field registry** — `registerFields` (`useEntity.js:1265`) plus the
`useEffect` in `EntityForm.jsx:686`, which registers `displayFields` under a stable
`React.useId()` `formId` and removes the entry on unmount. Introduced by ETP-3894.
This is exactly the input a reactive validity hook needs.

**A declarative validation engine in core, with zero consumers** —
`schema_forge_core/packages/app-shell-core/src/lib/validation/` (ETP-4556):
`validateRecord`, `constraints/required.js`, `ERROR_CODES`, exported as
`@etendosoftware/app-shell-core/lib/validation`. Grep confirms no import anywhere in
the functional repo. Note its `skipUnchangedInvalid` option — the same policy this
plan adopts in §3.2.

### 2.2 The gaps

**(a) Required-field completeness is evaluated post-hoc, on click, and only on create.**
`handleSave` (`useEntity.js:1281`):

```js
if (isNew) {
  const fields = [...formFieldsRef.current.values()].flat();
  const missing = getMissingRequiredFields(fields, editing);
  if (missing.length > 0) return reportMissingRequiredFields(...);
}
```

The model is toast-after-click, not prevent-before-click — the inverse of what the
ticket asks for. Editing an existing record skips the check entirely.

**(b) The registry lives in a `useRef`, so it cannot drive a button's `disabled`.**
Mutating `formFieldsRef.current` triggers no re-render. Making it reactive is the
central technical problem of this task (see §7).

**(c) The generated-window Save buttons do not consult required fields at all.**
All five variants in `DetailView.jsx` gate only on saving state, dirtiness and the
accounting-balance blocks:

| Line | `data-testid` | Current `disabled=` |
|---|---|---|
| 959 | `action-save-draft` | `isSaving \|\| !isDirty \|\| blockSaveForBalance` |
| 972 | `action-save` (draftMode) | `isSaving \|\| blockCompleteForBalance \|\| (draftMode.disableWhenEmpty && no children)` |
| 1046 | `action-save` | `isDocumentReadOnly \|\| isSaving \|\| blockSaveForBalance` |
| 1061 | `action-complete` | `isSaving \|\| blockCompleteForBalance` |
| 1085 | `action-save` | `isDocumentReadOnly \|\| isSaving \|\| !isDirty \|\| blockSaveForBalance` |

`DetailView` + `EntityForm` are shared by every generated window, so these five
lines cover 23 of the ~25 checklist entries in §5.

**(d) Five divergent ad-hoc implementations of the same rule in modals.**

| Location | Implementation |
|---|---|
| `EntityCreationModal.jsx:465` | `loading \|\| !requiredFields.every(id => ...)` inline |
| `ListModalWindow.jsx:639` | `saving \|\| missingRequired.length > 0` (own computation) |
| `ProcessParamDialog.jsx:50` | `visibleParams.every(p => !p.required \|\| !!values[p.key])` |
| `InlineCreateModal.jsx:46` | `!!trimmed && !saving` (single-field case) |
| `NewPaymentEntryModal.jsx:317` | 5-term hand-written condition |

**(e) Modals with no required-field gating at all** (they gate only on
`loading` / `saving`): `ConfirmDocumentModal.jsx:244`, `ConfirmInOutModal.jsx:206`
and `:217`, `NewAccountModal.jsx:377` and `:386`, `TaxSifModal.jsx:203`,
`LifecycleConfirmModal.jsx:143`, `OrganizationPage.jsx:519`,
`ChangePasswordDialog.jsx:132`, `OAuth2ClientDialog.jsx:243`, plus
`CreateContactModal.jsx`, `LocationModalField.jsx`, `PartnerAddressPicker.jsx`.

**(f) Child-row / line-sidebar save actions** are likewise ungated:
`DetailView.jsx:3601`, `:3633` (`savingChild`), `:3815`, `:3880` (`savingLine`).

## 3. Decisions taken (product, 2026-08-20)

These resolve the points where the ticket text conflicts with current behaviour.

### 3.1 `isDirty` is kept

On an existing record, Save stays disabled when nothing has changed. Validity is
added as an extra `AND` term, not as a replacement:

```js
disabled = isSaving || !isDirty || !isValid || blockSaveForBalance
```

The ticket says an edit form "should start enabled if the existing data satisfies
validation"; we deliberately diverge, because a Save button that is active with no
pending changes is worse UX than one that is not. Tracked as open item #1 (§9).

### 3.2 Unchanged-invalid values do not block (`skipUnchangedInvalid`)

Applying the rule on edit would make any legacy record that already has an empty
required column in the database permanently unsaveable — the user could not even
correct an unrelated field, and may not have the missing datum. So, on edit:

- an empty required field the user did **not** touch does **not** block the save;
- an empty required field the user **did** touch **does** block it.

This mirrors the policy core's `validateRecord` already documents, and rides on the
existing `userChangedKeysRef` in `useEntity`. On create every entered field is a
changed key, so new-record behaviour is unaffected.

### 3.3 Full scope, one task

Hook + `DetailView` + all ~17 modals + tests + docs. Leaving modals half-migrated
preserves exactly the inconsistency the story sets out to remove.

### 3.4 All five primary buttons are gated, uniformly

The ticket covers "any primary action button that persists data", and
Complete/Confirm persists (it saves and then processes). Gating Save but not
Complete would let the user bypass validation via the other button. So all five
expressions in §2.2(c) get `|| !isValid` — including `action-save-draft` (:959).

```
959  action-save-draft   → + !isValid
972  action-save (draft) → + !isValid
1046 action-save         → + !isValid
1061 action-complete     → + !isValid
1085 action-save         → + !isValid
```

Draft-save is included by explicit product decision, for one uniform, easily
explained rule. The known trade-off: a draft exists precisely to persist incomplete
work, so a user with a half-filled document can no longer save and come back later.
The backend most likely still accepts an incomplete draft, which makes this a
UI-only restriction. Recorded as a watch item (§9 #4) — if users hit it, the fix is
to drop `!isValid` from line 959 only.

### 3.5 Checkboxes stay excluded

The `f.type !== 'checkbox'` filter in `getMissingRequiredFields` is unchanged. A
checkbox always holds a value (`true` or `false`), so "required" only means anything
if `true` is demanded — which is a business rule, not a completeness rule. Changing
it risks blocking windows where the AD marks a boolean flag `required` while its
default is `false`.

### 3.6 The disabled state must explain itself, and be assertable

The button carries a translated `title` listing the missing required fields,
following the existing `blockSaveForBalance` precedent in `DetailView`. Requires new
i18n keys in **both** `en_US.json` and `es_ES.json`.

For E2E, the reason is exposed as a **data attribute on the existing button**, not as
a separate tooltip element — same pattern as the documented `data-doc-status` /
`data-row-status` attributes (`docs/e2e-testing-guide.md:729`). It adds no DOM nodes,
is locale-independent, and leaves the `action-save` testid untouched so the 28
existing specs keep locating the button exactly as before.

```jsx
<Button data-testid="action-save"
        disabled={... || !isValid}
        data-missing-required="documentNo,businessPartner"
        title={ui('saveMissingRequired', { fields })} />
```

```js
// E2E
await expect(page.getByTestId('action-save'))
  .toHaveAttribute('data-missing-required', /businessPartner/);
```

### 3.7 The post-hoc check in `handleSave` stays as a safety net

The `if (isNew)` block at `useEntity.js:1281` is **not** removed. Once the button is
gated it almost never fires, but it still covers the paths that do not go through the
button: `handleSaveAndProcess`, programmatic saves, and any modal not yet migrated in
Phase 3. The cost is near-dead code; the benefit is zero regression risk and no
rewriting of the tests that currently assert the toast.

### 3.8 No feature flag

Ships directly, with no entry in `flags-registry.json`. The change is a single
uniform UX rule rather than a feature with incomplete slices — and the four existing
registry entries are all new functionality, not cross-cutting gating changes. If the
gating turns out to over-block somewhere, the remedy is a revert, not a kill switch.
This keeps conditional code out of a hook that every window renders.

### 3.9 The hook is two layers: a pure core plus a `useEntity` adapter

A registry-based hook would only ever work for `DetailView`. Verified against the six
modals Phase 3 must migrate — **none of them feeds the registry**:

| Modal | Renders `EntityForm` | Calls `registerFields` |
|---|---|---|
| `NewPaymentEntryModal.jsx` | no | no |
| `custom/financial-account/ManualStatementModal.jsx` | no | no |
| `custom/financial-account/NewAccountWizard.jsx` | no | no |
| `EntityCreationModal.jsx` | no | no |
| `ListModalWindow.jsx` | yes (×4) | **no** |
| `ProcessParamDialog.jsx` | no | no |

They all hold their own local state. So the hook ships as two layers:

- **`useFormValidity({ fields, values, changedKeys })`** — pure, knows nothing about
  `useEntity`. Wraps `getMissingRequiredFields` plus the §3.2 policy. This is what the
  custom modals consume, passing their own state.
- **A thin adapter inside `useEntity`** that feeds the core from the `formFieldsRef`
  registry and `userChangedKeysRef`, and re-exports `{ isValid, missingRequired }`.
  This is what `DetailView` consumes.

Without this split, Phase 3 has no implementable API.

### 3.10 The `other` section must start registering its fields

`DetailView` passes `registerFields` only to `section="principal"` (:3342) and
`section="collapsed"` (:3369). The two `section="other"` renders (:4061, :4094) do
**not**. The generated form forwards it (`<EntityForm fields={fields} {...props} />`
in e.g. `artifacts/sales-order/generated/web/sales-order/HeaderForm.jsx`), so it is
purely a missing prop.

Consequence today: a required field living in the `other` section is invisible to
validation — no toast, and under this task no gating either, so the user would see an
enabled button and a backend failure. Phase 2 must pass `registerFields` on those two
renders as well.

**Measured (2026-08-20).** Applying the real predicate (`required: true`, not
`readOnly`, not `checkbox`, `section: 'other'`) to the header form that each
generated `*Page.jsx` passes as `Form={...}`: **24 fields across 10 windows.** These
are the fields that go from "silently ignored" to "blocks the button", so they are
the regression surface to check first — two of them are checklist windows with 6
fields each.

| Window | Header form | Fields |
|---|---|---|
| `purchase-order` | `OrderForm.jsx` | `transactionDocument`, `partnerAddress`, `warehouse`, `paymentTerms`, `priceList`, `invoiceFrom` |
| `purchase-invoice` | `InvoiceForm.jsx` | `transactionDocument`, `priceList`, `accountingDate`, `paymentTerms`, `paymentMethod`, `currency` |
| `return-to-vendor-shipment` | `HeaderForm.jsx` / `ReturnShipmentForm.jsx` | `accountingDate`, `warehouse` (×2) |
| `conversion-rates` | `ConversionRateForm.jsx` | `multipleRateBy`, `divideRateBy` |
| `contacts` | `BpartnerForm.jsx` / `BusinessPartnerForm.jsx` | `creditLimit` (×2) |
| `bp-location` | `BpLocationForm.jsx` | `businessPartner` |
| `commission` | `CommissionForm.jsx` | `frequencyType` |
| `financial-account` | `AccountForm.jsx` | `country` |
| `product` | `ProductForm.jsx` | `taxCategory` |
| `sii-config` | `SiiConfigurationForm.jsx` | `cadenciaEnvoFacturasCompraASII` |

Same measurement also confirms Phase 2's reach: **64 of the 66 generated `*Page.jsx`
render `DetailView`**, so wiring those five buttons really does cover the whole
generated surface, not just the 9 windows that happen to name their header form
`HeaderForm.jsx`.

## 4. Implementation plan

### Phase 1 — `useFormValidity`, two layers (functional repo)

Per §3.9.

**1a — pure core.** New `tools/app-shell/src/hooks/useFormValidity.js`:

```js
useFormValidity({ fields, values, changedKeys }) → { isValid, missingRequired }
```

- Reuses `getMissingRequiredFields` — do **not** reimplement the predicate; it
  already encodes the `displayLogic` / `readOnlyLogic` / checkbox / summary rules,
  and `sales-order/HeaderForm.jsx` confirms it correctly excludes both
  `required + readOnly` (`documentNo`) and `required + section: 'summary'` (totals).
- Applies the §3.2 policy from `changedKeys`.
- **Memoize on `values` plus the field-key set.** The predicate invokes every field's
  `displayLogic` / `readOnlyLogic` closure; recomputing that on each keystroke is
  fine for an 11-field header like `sales-order` but not for the largest windows.
- No React state of its own, no dependency on `useEntity` — this is the layer the
  custom modals consume with their own state.

**1b — `useEntity` adapter.** Feeds the core from `formFieldsRef` and
`userChangedKeysRef`, and re-exports `{ isValid, missingRequired }` from the hook's
return object (`useEntity.js:1619`), so `DetailView` needs no new wiring. Requires
mirroring the ref into state, **guarded by a shallow comparison of the resulting key
set** — this is the render-loop risk in §7.

Build both in the functional repo: they depend on `getMissingRequiredFields`, which
lives there. Promoting the core to `@etendosoftware/app-shell-core` and consolidating
with the ETP-4556 engine is a separate follow-up (§10).

### Phase 2 — Wire `DetailView`

- Add `|| !hook.isValid` to all five `disabled=` expressions in §2.2(c) (§3.4),
  plus the `title` and `data-missing-required` from §3.6.
- Pass `registerFields` to the two `section="other"` renders, `:4061` and `:4094`
  (§3.10), and re-verify no window regresses.

Closes 23 of the ~25 checklist entries.

### Phase 3 — Normalize the modals

Every modal here consumes the **pure core** from Phase 1a with its own local state —
none of them touches the registry (§3.9). Migrate the five ad-hoc implementations
(§2.2(d)) onto it and add gating to the twelve that have none (§2.2(e)), plus the
child-row actions (§2.2(f)). Each migration means: derive a `fields` descriptor array
from whatever the modal already knows about its inputs, hand it to the core, and
replace the hand-written boolean. Order by checklist priority:

1. `NewPaymentEntryModal` — new receipt / new payment
2. Bank-statement load + edit, manual reconciliation
3. Delete-confirmation modals that require a reason field
4. Remaining masters / configuration modals

### Phase 4 — Tests (delegate to Tester)

Per `CLAUDE.md`, any test work goes to the `test-generator` subagent.

- Unit tests for `useFormValidity` covering the five Given/When/Then scenarios from
  the ticket, plus the §3.2 legacy case (untouched empty required must not block).
- One E2E per document family; read `docs/e2e-testing-guide.md` first, canonical
  reference `e2e/tests/flows/row-quick-actions.mocked.spec.js`.

### Phase 5 — Docs

- Update the affected `docs/generated-custom-windows/<window>.md` guides where
  behaviour visibly changes (self-documentation policy).
- Add a `CLAUDE.md` rule: *every primary button that persists data is gated through
  `useFormValidity`, never ad-hoc* — same shape as the existing `formatCurrency` and
  `parseCalendarDate` mandates.

## 5. Verification checklist (from the ticket)

Mandatory minimum verification. The generic rule applies to any window not listed.
Artifact names are kebab-case per the spec naming convention; `DetailView` means the
window is covered by Phase 2 with no per-window work.

### Sales

| ✓ | Ticket item | Artifact | Surface |
|---|---|---|---|
| [ ] | Presupuesto de Venta | `sales-quotation` | `DetailView` |
| [ ] | Pedido de Venta | `sales-order` | `DetailView` |
| [ ] | Factura de Venta | `sales-invoice` | `DetailView` |
| [ ] | Factura Rectificativa de Venta | `sales-invoice` (reversed variant) | `DetailView` |
| [ ] | Albarán de Venta | `goods-shipment` | `DetailView` |
| [ ] | Albarán de Devolución de Venta | `return-from-customer` | `DetailView` |

### Purchases

| ✓ | Ticket item | Artifact | Surface |
|---|---|---|---|
| [ ] | Pedido de Compra | `purchase-order` | `DetailView` |
| [ ] | Factura de Compra | `purchase-invoice` | `DetailView` |
| [ ] | Factura Rectificativa de Compra | `purchase-invoice` (reversed variant) | `DetailView` |
| [ ] | Albarán de Compra | `goods-receipt` | `DetailView` |
| [ ] | Albarán de Devolución de Compra | `return-to-vendor-shipment` — confirm vs `return-to-vendor` | `DetailView` |

### Receipts & Payments

| ✓ | Ticket item | Artifact | Surface |
|---|---|---|---|
| [ ] | Modal Nuevo cobro | `payment-in` | `windows/custom/shared/NewPaymentEntryModal.jsx:317` |
| [ ] | Modal Nuevo pago | `payment-out` | same shared modal |

### Financial Account

| ✓ | Ticket item | Artifact | Surface |
|---|---|---|---|
| [ ] | Carga de extracto bancario manual (cabecera + líneas) | `financial-account` | `custom/financial-account/ManualStatementModal.jsx` |
| [ ] | Edición de extracto bancario (manual y CSV) | `financial-account` | `ManualStatementModal.jsx` + `ImportStatementModal.jsx` |
| [ ] | Modal de conciliación manual | `financial-account` | `custom/financial-account/ReconciliationList/` — locate the link action |

### Warehouse / Inventory

| ✓ | Ticket item | Artifact | Surface |
|---|---|---|---|
| [ ] | Movimiento de mercancías | `goods-movements` | `DetailView` |
| [ ] | Consumo interno | `internal-consumption` | `DetailView` |
| [ ] | Inventario físico | `physical-inventory` | `DetailView` |

### Assets

| ✓ | Ticket item | Artifact | Surface |
|---|---|---|---|
| [ ] | Activo | `assets` | `DetailView` |
| [ ] | Amortización | `amortization` | `DetailView` (has `custom/`, re-check) |

### Masters

| ✓ | Ticket item | Artifact | Surface |
|---|---|---|---|
| [ ] | Contacto (cliente/proveedor) | `contacts` | `DetailView` + `CreateContactModal.jsx` + `EntityCreationModal.jsx:465` |
| [ ] | Producto | `product` | `DetailView` |
| [ ] | Almacén | `warehouse` | `DetailView` |

### Configuration

| ✓ | Ticket item | Artifact | Surface |
|---|---|---|---|
| [ ] | Cuenta financiera | `financial-account` | `NewAccountWizard.jsx` + `EditAccountModal.jsx` |
| [ ] | Método de pago | `payment-method` | `DetailView` |
| [ ] | Tarifa (lista de precios) | `price-list` | `DetailView` |
| [ ] | Categoría de producto | `product-category` | `DetailView` |

### Delete with confirmation

| ✓ | Ticket item | Surface |
|---|---|---|
| [ ] | Delete-confirmation modal carrying a reason or other required field | `ConfirmDocumentModal.jsx:244`, `LifecycleConfirmModal.jsx:143`, `custom/financial-account/DeleteAccountDialog.jsx` |

## 6. Acceptance criteria

Verifiable gates for REVIEW (Alex) and QA (Sentinel). Each must be checked with the
command shown, not by inspection.

```bash
# 1 — All five DetailView primary buttons gate on validity
grep -n 'disabled=' tools/app-shell/src/components/contract-ui/DetailView.jsx \
  | grep -E 'action-save|action-complete'
#   → 5 hits, every one containing !isValid (or hook.isValid)

# 1b — The `other` section now registers its fields (§3.10)
grep -c 'registerFields' tools/app-shell/src/components/contract-ui/DetailView.jsx
#   → 5 (was 3: footer + principal + collapsed; now + the two section="other")

# 1c — The pure core is reused, not reimplemented per modal
grep -rn 'getMissingRequiredFields' tools/app-shell/src | grep -v __tests__
#   → only useEntity.js (definition) and useFormValidity.js (single consumer)

# 2 — No ad-hoc required-completeness computation survives
grep -rn 'requiredFields.every\|missingRequired.length\|!p.required' \
  tools/app-shell/src/components tools/app-shell/src/windows | grep -v __tests__
#   → 0 hits outside useFormValidity.js

# 3 — The reason is exposed for E2E on every gated button
grep -rn 'data-missing-required' tools/app-shell/src | grep -v __tests__
#   → present on all Phase 2 + Phase 3 primary buttons

# 4 — i18n keys exist in BOTH locales
for l in en_US es_ES; do
  grep -c 'saveMissingRequired' tools/app-shell/src/locales/$l.json
done
#   → non-zero for both

# 5 — Full suite green, including the new useFormValidity suites
make test

# 6 — E2E green after fixture adjustment (fixtures fixed, tests NOT deleted)
#     28 specs reference action-save / action-complete / cp-confirm
```

Plus the functional scenarios from the ticket, as unit tests:

- [ ] Empty new form → Save disabled
- [ ] Last required field filled → Save enables with no further interaction
- [ ] A required field cleared again → Save disables again
- [ ] Edit form with valid existing data → enabled once something changes (§3.1)
- [ ] Delete-confirmation modal with empty reason → Confirm disabled
- [ ] **Legacy record with an untouched empty required field → still saveable (§3.2)**
- [ ] Every checklist row in §5 ticked

## 7. Risks

| Risk | Detail | Mitigation |
|---|---|---|
| **Render loop (highest)** | The `EntityForm.jsx:686` effect re-runs on every visibility change; a naive `setState` inside that path re-renders, recomputes `displayFields`, and re-fires the effect. | Only call `setState` when the derived required-key set actually differs (shallow set comparison). Expect most debug time here. |
| Legacy records unsaveable | Covered by §3.2, but the policy must be verified against a real tenant with incomplete master data. | Test with a record that has an empty required column in the DB. |
| Shared-component blast radius | `DetailView` / `EntityForm` render every window; a mistake breaks all of them at once. | `sf-validate-pipeline` does not help here (no pipeline change) — rely on the vitest suites plus one document per family manually. |
| Test breakage | 28 E2E specs click `action-save` / `action-complete` / `cp-confirm`; 5 vitest suites reference `action-save`. Fixtures with incomplete required fields now hit a disabled button. | **Fix the fixtures, never delete the tests** (coverage gate). |
| No kill switch | Per §3.8 there is no flag, so a production over-block needs a revert. | Keep Phase 2 and Phase 3 in separate commits so the modal wave can be reverted independently of the `DetailView` wave. |
| Draft-save becomes unusable for incomplete work | §3.4 gates `action-save-draft` too, by explicit decision. A user with a half-filled document can no longer persist it and return later. | One-line rollback (drop `!isValid` from :959) kept isolated in its own commit. Watch item §9 #4. |
| `other` section starts blocking | §3.10 makes previously-ignored required fields count. Correct, but a behaviour change per window. **Measured: 24 fields in 10 windows**, concentrated in `purchase-order` and `purchase-invoice` (6 each) — both on the checklist. | Check those 10 windows first, in the §3.10 order. If any of the 24 turns out to be required in the AD but genuinely optional in practice, fix it in that window's `decisions.json`, not by weakening the predicate. |
| Per-keystroke closure evaluation | The predicate runs every field's `displayLogic` / `readOnlyLogic` on each change. | Memoize on `values` + field-key set (Phase 1a). Profile the largest window, not `sales-order`. |

## 8. Impact

| Area | Scope |
|---|---|
| Source files touched | ~20 (1 new hook, `useEntity`, `DetailView`, ~17 modals) |
| Windows affected | All — `DetailView` / `EntityForm` are shared |
| Pipeline regeneration | None. No `decisions.json`, contract or generator change. |
| i18n | New keys in `en_US.json` **and** `es_ES.json` (§3.6) |
| Tests at risk | 28 E2E specs, 5 vitest suites |
| Feature flag | None (§3.8) |
| Repo split | Functional only for now; core promotion deferred (§10) |

## 9. Open items

| # | Item | Decides | When |
|---|---|---|---|
| 1 | §3.1 diverges from the ticket: Save stays disabled when nothing has changed, whereas the ticket asks for "starts enabled" on a valid edit form. | Valeria Garcia | On delivery — REVIEW must confirm it was raised |
| 2 | Albarán de Devolución de Compra: confirm whether the checklist item maps to `return-to-vendor-shipment` or `return-to-vendor`. | Dev, during Phase 2 | Before ticking the §5 row |
| 3 | Manual-reconciliation modal: locate which component under `custom/financial-account/ReconciliationList/` owns the line-linking confirm action. | Dev, during Phase 3 | Before ticking the §5 row |
| 4 | **Watch item.** Draft-save is gated per §3.4. If users report they can no longer persist half-filled documents, drop `!isValid` from `DetailView.jsx:959` — kept as an isolated commit for exactly this. | Valentin / Valeria | Post-release |
| 5 | Does NEO accept a draft POST with empty required fields? If it already rejects them, §3.4 only surfaces the error earlier; if it accepts them, §3.4 is a UI-only restriction. Worth knowing before release, not before starting. | Dev, during Phase 2 | Informs #4 |

## 10. Related debt

The ETP-4556 validation engine in `app-shell-core` shipped with **no consumers**,
while the functional repo carries its own overlapping helpers in `useEntity.js`. This
task is the natural moment either to close that gap or to record an explicit decision
that the core engine is not used. Recommended follow-up: register it via
`/feature-debt` and evaluate a `/move-to-core` migration for `useFormValidity` once
it has settled in the functional repo.
