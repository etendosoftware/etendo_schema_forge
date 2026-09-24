# ETP-5398 — Remediation Map (per-file work order)

> **Read `2026-09-24-ETP-5398-action-modal-design-contract.md` first.** That document is
> normative; this one is the work order.
>
> Line numbers were captured on branch `feature/ETP-5398` at commit `308955539`. Re-verify
> before editing — do not apply an edit by line number alone.

---

## Which clone modal — read this before touching anything

The ticket's item 4 says *"Albarán de compra → Clonar albarán, ejecutado desde la vista de
edición"*. There are **two** clone modals in this repo and it is easy to fix the wrong one:

| Component | Path | Used by |
|---|---|---|
| `CloneReceiptModal` | `artifacts/goods-receipt/custom/GoodsReceiptActions.jsx` (§ from line ~480) | **goods-receipt only — this is the ticket's modal** |
| `CloneOrderModal` | `tools/app-shell/src/components/contract-ui/CloneOrderModal.jsx` | purchase-order, sales-order, sales-invoice, goods-shipment |

`GoodsReceiptSecondaryActions.jsx:16-19` states it explicitly: goods-receipt passes
`clone={false}` and renders its own `CloneReceiptModal` because it fetches receipt lines
before POSTing `cloneRecord` — a different shape from the generic modal.

**Consequence:** the in-scope fix is `GoodsReceiptActions.jsx`, which touches **one** window.
`CloneOrderModal.jsx` touches **four**. See §5 for the recommendation on the second one.

---

## 1. `QuotationConfirmModal.jsx` — Presupuestos → Confirmar

`artifacts/sales-quotation/custom/QuotationConfirmModal.jsx` (~21 KB)

| Line | Current | Target |
|---|---|---|
| `467-470` `btnPrimary` | `background: 'var(--status-info-fg)'`, `borderRadius: 6`, `fontSize: 12`, `padding: '7px 16px'` | `background: 'hsl(var(--foreground))'`, `color: 'hsl(var(--card))'`, `borderRadius: 360`, `height: 40`, `fontSize: 14`, `padding: '8px 12px'` |
| `462-465` `btnSecondary` | `border: --border-subtle`, `background: 'transparent'`, `color: --muted-foreground`, `borderRadius: 6` | `MODAL_STYLES.btnCancel` values (§4.2) |
| `371-375` primary render | `opacity: loading ? 0.6 : 1` | swap to the disabled style object; **delete the opacity** |
| `367-368` cancel render | `opacity: loading ? 0.5 : 1` | keep `cursor`, drop `opacity` (or align to one value across all four) |
| `310` close X | `color: 'hsl(var(--muted-foreground))'` | ✅ already correct — leave |
| `458` `cardStyle` | `borderRadius: 12` | `8` |

**This is the ticket's item 1 ("botón principal azul").**

### Do not touch in this file

- `419`, `425`, `439` — the `OptionCard` radio-card selection colours. They are a *selection*
  affordance, not a button. The Figma reference uses a black border + filled radio for the
  selected card, but changing it is a separate visual decision and the ticket does not
  mention it. **Flag to the human, do not change.**
- `253`, `273` — the success/badge colours on the post-creation result screen.
- `319` — the info banner. Correct per §4.7.

---

## 2. `SendToEvaluationModal.jsx` — Presupuestos → Enviar a evaluación

`artifacts/sales-quotation/custom/SendToEvaluationModal.jsx` (~9 KB)

Its `btnPrimary` / `btnSecondary` / `cardStyle` are **byte-identical** to
`QuotationConfirmModal`'s. Apply the same edits:

| Line | Current | Target |
|---|---|---|
| `195-198` `btnPrimary` | `var(--status-info-fg)`, `borderRadius: 6`, `fontSize: 12` | §4.1 |
| `190-193` `btnSecondary` | transparent / `--border-subtle` / `--muted-foreground` | §4.2 |
| `157-161` primary render | `opacity: loading \|\| lineCount === 0 ? 0.5 : 1` | disabled style object, **no opacity** |
| `153-154` cancel render | `opacity: loading ? 0.5 : 1` | drop opacity |
| `113` close X | `--muted-foreground` | ✅ already correct |
| `186-188` `cardStyle` | `borderRadius: 12` | `8` |

### About the ticket's "two different blues" (item 2)

**The two primaries use the same token and the same hex.** Both are `--status-info-fg` =
`#1D4ED8`. There is no second blue.

What the reporter saw is the **disabled opacity mismatch**: this modal dims to `0.5` and
disables whenever `lineCount === 0` (a resting state, easy to hit), while
`QuotationConfirmModal` dims to `0.6` and only when `loading` (a transient state, hard to
catch in a screenshot). `#1D4ED8 @ 0.5` vs `#1D4ED8 @ 1.0` over white are two different
blues on screen.

Fixing §4.3 fixes item 2. **Do not go hunting for a second blue token — there isn't one.**

---

## 3. `RejectQuotationModal.jsx` — Presupuestos → Rechazar presupuesto

`artifacts/sales-quotation/custom/RejectQuotationModal.jsx` (~18 KB)

**This file is already ~90 % compliant** and is the best in-repo reference after
`MODAL_STYLES` itself. Its buttons already use `--foreground`/`--card`, `borderRadius: 360`,
`height: 40`, `fontSize: 14`, and a correct `btnPrimaryDisabled` on `--border-control`.

Only one real defect:

| Line | Current | Target |
|---|---|---|
| `400` close X | `color: 'hsl(var(--icon-secondary))'` | `color: 'hsl(var(--muted-foreground))'` |

**That single line is the ticket's item 3 ("la X se ve muy tenue").**

### Also consider (low risk, improves consistency)

| Line | Note |
|---|---|
| `450-457`, `459-465` | `width: 132` / `width: 191` are hardcoded from one Figma frame. Harmless here; **do not copy these widths into the other three modals.** |
| `467-479` | Read the `btnPrimaryDisabled` comment before editing. It documents the ETP-4554 → ETP-5378 regression where `--card` was substituted for a Figma grey and the button disappeared. That comment is the reason §3.1 of the contract exists — **keep it.** |

### Do not "fix" the icon

The ticket says this modal's primary is *"correcto en color, pero sin ícono"*. Per contract
§4.1, do **not** add an icon. Raise it with the human (the Jira comment names
`@alexandra.asto` as the design contact).

---

## 4. `GoodsReceiptActions.jsx` → `CloneReceiptModal` — Clonar albarán

`artifacts/goods-receipt/custom/GoodsReceiptActions.jsx`, section starting at line `480`.

**This is the worst offender and the highest-value fix in the ticket.**

| Line | Current | Problem | Target |
|---|---|---|---|
| `559` primary | `background: 'var(--status-info-bg)'` + `color: 'hsl(var(--card))'` | `#EFF6FF` fill with **white** text → contrast ≈ **1.07:1**. Effectively invisible; reads as permanently disabled. **This is the ticket's "tono celeste que parece deshabilitado".** | `background: 'hsl(var(--foreground))'`, `color: 'hsl(var(--card))'`, `borderRadius: 360`, `height: 40`, `fontSize: 14` |
| `559` | `opacity: loading ? 0.6 : 1` | §4.3 violation | disabled style object |
| `558` cancel | `border: '1px solid hsl(var(--card))'` + `color: 'hsl(var(--muted))'` | border in the surface colour (invisible) and label in a **background** token (invisible) | `MODAL_STYLES.btnCancel` values |
| `543` | `border: '1px solid hsl(var(--card))'` | invisible summary-card border | `hsl(var(--border-control))` |
| `536` | `border: '0.5px solid hsl(var(--card))'` | invisible panel border | `hsl(var(--border-subtle))`; also `borderRadius: 12` → `8` |
| `539` close X | `--muted-foreground` | ✅ already correct | leave |
| `512` | badge fallback `bg: 'hsl(var(--foreground))'`, `color: 'hsl(var(--muted-foreground))'` | dark-on-dark unknown-status badge | out of strict scope — **flag, don't fix silently** |

All of these are residue from the ETP-4554 hex→token migration, which mapped Figma greys
onto `--card`/`--muted` (surface tokens) instead of `--border-control`/`--muted-foreground`.
Same failure mode already fixed once in `RejectQuotationModal` by ETP-5378.

### Out of scope in this file

`326-327`, `339`, `356-363` — the receipt **toolbar** buttons (`sqBtn`, `textBtn`, the
Confirm button on `--primary`). Not modals. `362` deliberately uses `--primary`; leave it,
and see the dark-mode warning in contract §4.1.

---

## 5. `CloneOrderModal.jsx` — the shared one (RECOMMEND: separate task)

`tools/app-shell/src/components/contract-ui/CloneOrderModal.jsx`

**Not named in the ticket**, but it carries the same defects:

| Line | Current | Defect |
|---|---|---|
| `345-348` `btnPrimary` | `background: 'var(--status-info-fg)'`, `borderRadius: 7`, `fontSize: 13` | blue primary |
| `350-353` `closeBtn` | `color: 'hsl(var(--text-disabled))'` | low-contrast X |
| `306` | `opacity: (cloning \|\| blockedByUnsaved) ? 0.6 : 1` | §4.3 violation |
| `328` | `borderRadius: 12` | should be `8` |

**Recommendation: do NOT fix it inside ETP-5398.**

Rationale — it is rendered by **purchase-order, sales-order, sales-invoice and
goods-shipment**, and is covered by at least 7 test files (3 of its own, 4 mocking it). A
`Minor`-priority visual bug does not justify a blast radius across four unrelated sales and
purchasing windows in the same PR.

**Ask the human.** If they want it in, it is a mechanical repeat of §4.1–4.4; if they want it
out, propose a follow-up Jira. Either way, say which you did in the PR description.

The same applies to `tools/app-shell/src/windows/custom/shared/CloneButton.jsx:23`, which has
a genuinely malformed value — `boxShadow: '0px 1px 2px 0px hsl(var(--foreground))0D'` (a
leftover `0D` hex-alpha suffix; the shadow does not render). Out of scope, worth a follow-up.

---

## 6. Suggested order of work

1. `RejectQuotationModal.jsx:400` — one line, zero risk, closes ticket item 3.
2. `GoodsReceiptActions.jsx` `CloneReceiptModal` — highest user impact, single window, closes item 4.
3. `SendToEvaluationModal.jsx` + `QuotationConfirmModal.jsx` — identical edits, closes items 1 and 2 together.
4. Ask about `CloneOrderModal.jsx` before touching it.

Commit per step, following the repo convention (`Feature ETP-5398: <description>`, first line
≤ 80 chars, **no `Co-Authored-By`** — Git Police rejects it).

> The ticket is a Jira **Bug**, but the session instructions say to branch from `develop` onto
> `feature/ETP-5398` (which already exists and is checked out), not a hotfix branch. Follow
> the session instructions.

---

## 7. Test impact

Existing tests that touch these files:

```
artifacts/sales-quotation/custom/__tests__/QuotationConfirmModal.test.js
artifacts/sales-quotation/custom/__tests__/SendToEvaluationModal.test.js
artifacts/sales-quotation/custom/__tests__/RejectQuotationModal.test.js
artifacts/sales-quotation/custom/__tests__/reject-flow-i18n.test.js
tools/app-shell/src/components/contract-ui/__tests__/CloneOrderModal.test.js
tools/app-shell/src/components/contract-ui/__tests__/CloneOrderModal.vitest.jsx
tools/app-shell/src/components/contract-ui/__tests__/CloneOrderModal.unsavedChanges.vitest.jsx
```

Several of these are **source-reading** tests (they assert on the file's text, not on
rendered output). A style-object rewrite can break them even though behaviour is unchanged —
check them first, and update assertions only where the assertion was about the old literal.

**Note the conflict to resolve with the human:** Jira labels this ticket `NoRequiereTests`,
while the session instructions require unit tests for all added/modified code. For a
presentational-only change the honest position is: no new behavioural tests are warranted,
but every existing test must still pass. Confirm before writing new tests.

Run:

```bash
cd schema_forge
E2E_SUITE=integration E2E_BACKEND_URL=http://localhost:8080/etendogo \
  ETENDO_URL=http://localhost:8080/etendogo ./scripts/run-e2e-full.sh
```

---

## 8. Open questions for the human

1. **Figma node mismatch.** The ticket links node `306-1835` ("Confirmar pedido de compra").
   The reference walked through for this spec is node `6755-82933` (the "PopUps" section:
   Clonar albarán / Enviar a evaluación / Confirmar pedido de venta / Rechazar Presupuesto).
   They are different frames. Confirm which is normative before pixel-matching anything.
2. **Icons on primary buttons** — add, or keep as-is? (Contract §4.1 says keep.)
3. **`CloneOrderModal`** — in scope or follow-up ticket? (§5 recommends follow-up.)
4. **Summary card** — only normalise where one already exists, or add it to modals that lack
   one? (Contract §4.6 says only normalise.)
5. **`NoRequiereTests`** vs the session's test requirement (§7).

---

## 9. What this task must NOT do

- Change any token in `schema_forge_core`.
- Change handlers, state, props, `data-testid` values or i18n keys.
- Add an icon, a summary card, or any element the modal does not already render.
- Normalise modal widths.
- Edit anything under `artifacts/*/generated/`.
- `git push` (explicitly forbidden by the session instructions — the human pushes manually).
