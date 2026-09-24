# ETP-5398 — Action Modal Design Contract

> **Status:** specification, not yet implemented.
> **Audience:** the agent implementing ETP-5398.
> **Companion document:** `2026-09-24-ETP-5398-remediation-map.md` (per-file work order).
>
> This document defines what an action/confirmation modal MUST look like.
> The companion document says which files violate it and how to fix each one.

---

## 1. Scope

ETP-5398 is a **visual consistency bug** (Jira type `Bug`, priority `Minor`, epic
`ETP-3504 Etendo Next`, labels `Bloque2 / NoRequiereTests / Ventas`). No functional
behaviour changes. Every edit must be **purely presentational**.

Four modals are named in the ticket:

| # | Modal | File |
|---|---|---|
| 1 | Presupuestos → Confirmar | `artifacts/sales-quotation/custom/QuotationConfirmModal.jsx` |
| 2 | Presupuestos → Enviar a evaluación | `artifacts/sales-quotation/custom/SendToEvaluationModal.jsx` |
| 3 | Presupuestos → Rechazar presupuesto | `artifacts/sales-quotation/custom/RejectQuotationModal.jsx` |
| 4 | Albarán de compra → Clonar albarán | `artifacts/goods-receipt/custom/GoodsReceiptActions.jsx` → `CloneReceiptModal` |

**Modal 4 is NOT `CloneOrderModal.jsx`.** See the remediation map, §"Which clone modal".

---

## 2. Source of truth

The canonical style object **already exists** and already encodes the Figma criteria:

```
tools/app-shell/src/components/contract-ui/modal-styles.js  →  MODAL_STYLES
```

It is currently imported by exactly **one** component
(`artifacts/sales-quotation/custom/CreateRejectReasonModal.jsx`). Everything else
hand-rolls its own inline style objects. That divergence is the whole bug.

`MODAL_STYLES` is the reference for `btnCancel`, `btnSaveEnabled`, `btnSaveDisabled`,
`title`, `header` and `dialog`. Read it before writing anything.

Design tokens live in the **other repo**:
`schema_forge_core/packages/app-shell-core/src/styles.css`.
**This task must not change them.** No core bump is required — every fix is a matter of
using the *correct existing token*, in `schema_forge` only.

---

## 3. Token semantics (the part that keeps getting wrong)

Tokens carry a **role**. A background token is not a border token is not a text token.
Most of the defects in this ticket come from using a token outside its role — a
regression class already documented in `RejectQuotationModal.jsx` (see its
`btnPrimaryDisabled` comment about ETP-4554 / ETP-5378).

| Token | Light | Dark | Role — use ONLY for |
|---|---|---|---|
| `--foreground` | `222 47% 11%` (near-black) | `210 20% 98%` (near-white) | primary text; **primary button fill** |
| `--card` | `0 0% 100%` (white) | `224 30% 15%` | surface fill; **primary button label** |
| `--border-control` | `214 32% 91%` | `215 16% 58%` | control borders; **disabled button fill** |
| `--border-subtle` | — | — | hairline dividers between sections |
| `--muted-foreground` | `240 12% 48%` | `215 16% 72%` | secondary text, **close icon** |
| `--icon-secondary` | `215 16% 47%` | `215 16% 70%` | decorative icons — **NOT the close X** |
| `--text-disabled` | `225 12% 38%` | `215 16% 65%` | disabled text — **NOT the close X** |
| `--status-info-bg` | `#EFF6FF` (near-white) | `#172554` | info **banner background** — never a button fill |
| `--status-info-fg` | `#1D4ED8` | `#BFDBFE` | info **banner text/icon** — never a button fill |
| `--primary` | `222 47% 11%` | `217 91% 60%` (**blue!**) | see §4.1 warning |

### 3.1 Forbidden combinations

These exist in the code today and each one renders near-invisible content:

| Anti-pattern | Result | Seen at |
|---|---|---|
| `background: var(--status-info-bg)` + `color: hsl(var(--card))` | white text on `#EFF6FF` → **~1.07:1**, reads as disabled | `GoodsReceiptActions.jsx:559` |
| `border: 1px solid hsl(var(--card))` | border in the surface colour → invisible | `GoodsReceiptActions.jsx:536,543,558` |
| `color: hsl(var(--muted))` on text | `--muted` is a *background* token → invisible label | `GoodsReceiptActions.jsx:558` |
| `background: var(--status-info-fg)` as a button fill | blue primary; contradicts the black-primary rule | `QuotationConfirmModal.jsx:469`, `SendToEvaluationModal.jsx:197`, `CloneOrderModal.jsx:347` |

---

## 4. The contract

### 4.1 Primary button

```js
{
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  height: 40,
  padding: '8px 12px',
  borderRadius: 360,
  border: 'none',
  background: 'hsl(var(--foreground))',
  color: 'hsl(var(--card))',
  fontFamily: 'Inter, sans-serif',
  fontSize: 14, fontWeight: 500, lineHeight: '24px',
  cursor: 'pointer',
}
```

- **Fill `--foreground`, label `--card`.** This is `MODAL_STYLES.btnSaveEnabled`, and it is
  what `RejectQuotationModal` already does (the ticket confirms that modal's colour is correct).
- **Radius is `360`, not `6` / `7` / `12`.** A pill, per Figma.
- **Height is `40`, font-size `14`.** Several modals currently use `12`/`13` with `7px 16px`
  padding, which makes them visibly smaller than the rest of the app.
- Width: hug the content. Do **not** copy `RejectQuotationModal`'s hardcoded `width: 191`
  into other modals — that number came from one specific Figma frame.

> ⚠️ **Do NOT use `--primary`/`--primary-foreground` here.**
> They are identical to `--foreground`/`--card` in light mode, so a swap looks correct
> locally — but in **dark mode `--primary` is `217 91% 60%`, a saturated blue**. Using it
> would reintroduce exactly the blue-primary bug this ticket is closing, visible only to
> dark-mode users. `GoodsReceiptActions.jsx:362` (the Confirm button, out of scope) already
> uses `--primary`; leave it alone, but do not copy it.

#### Icon

The Figma reference shows an icon before the label on some primaries (`→ Continuar`,
`⧉ Clonar (1)`, `✓ Confirmar`). The ticket says *"con ícono cuando corresponda"*.

Rule: **keep whatever icon the modal renders today; do not add new ones.** Adding icons is a
design decision that is not specified per-modal in the ticket, and inventing them would put
unreviewed content in front of the user. If an icon is present, it sits **before** the label
with `gap: 8`, inherits `currentColor`, and is `15×15` (matching `CloneButton`'s `CopyIcon`).

### 4.2 Secondary button ("Cancelar")

```js
{
  boxSizing: 'border-box',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  height: 40,
  padding: '8px 12px',
  borderRadius: 360,
  background: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border-control))',
  boxShadow: '0px 1px 2px hsl(var(--foreground) / 0.05)',
  color: 'hsl(var(--foreground))',
  fontFamily: 'Inter, sans-serif',
  fontSize: 14, fontWeight: 500,
  cursor: 'pointer',
}
```

This is `MODAL_STYLES.btnCancel`. Note three things the current implementations get wrong:

- background is `--card`, **not** `transparent`
- border is `--border-control`, **not** `--border-subtle` (subtle is for dividers)
- label is `--foreground`, **not** `--muted-foreground` (a cancel button is not muted text)

### 4.3 Disabled primary — **no opacity**

```js
{
  ...primary,
  background: 'hsl(var(--border-control))',
  color: 'hsl(var(--card))',
  cursor: 'not-allowed',
}
```

This is `MODAL_STYLES.btnSaveDisabled`.

**This is the root cause of the ticket's "two different blues" (item 2) and of the
"celeste que parece deshabilitado" (item 4).** Today each modal dims its own primary with a
different ad-hoc opacity:

| File | Disabled treatment | Disabled when |
|---|---|---|
| `QuotationConfirmModal.jsx:374` | `opacity: 0.6` | `loading` |
| `SendToEvaluationModal.jsx:160` | `opacity: 0.5` | `loading \|\| lineCount === 0` |
| `CloneOrderModal.jsx:306` | `opacity: 0.6` | `cloning \|\| blockedByUnsaved` |
| `GoodsReceiptActions.jsx:559` | `opacity: 0.6` | `loading` |

`#1D4ED8` at `0.5` and `#1D4ED8` at `0.6` over white are two visibly different blues. The
reporter compared a modal in a resting-disabled state (`lineCount === 0`) against one in a
resting-enabled state and correctly saw two colours. **There is no second blue token** —
searching for one is a dead end.

**Rule: never express "disabled" with `opacity` on the fill.** Swap to the disabled style
object. `opacity` may still be used on a *spinner* or on the whole modal during a transition.

### 4.4 Close button (X)

```js
{
  background: 'none',
  border: 'none',
  padding: '2px 6px',
  borderRadius: 4,
  fontSize: 20, lineHeight: 1,
  color: 'hsl(var(--muted-foreground))',
  cursor: 'pointer',
}
```

`--muted-foreground` is the **only** accepted colour. It is the token that was explicitly
tuned for WCAG AA (see the comment at `styles.css:299`).

Ticket item 3 ("la X se ve muy tenue") is `RejectQuotationModal.jsx:400` using
`--icon-secondary`; `CloneOrderModal.jsx:352` uses `--text-disabled`. Both are wrong.

### 4.5 Shell, header, footer

| Part | Value | Source |
|---|---|---|
| Scrim | `hsl(var(--foreground) / 0.3)` | already consistent across all four — leave as is |
| Panel radius | `8px` | `MODAL_STYLES.dialog` (current files use `12`) |
| Panel shadow | the 5-layer shadow in `MODAL_STYLES.dialog` | matches Figma `Shadows/Overlay/Light` |
| Header | `space-between`, title left, X right, `1px solid hsl(var(--border-subtle))` bottom | `MODAL_STYLES.header` |
| Title | Inter 600 / 20px / 28px / `--foreground` | `MODAL_STYLES.title` |
| Footer | `space-between`: Cancelar left, primary right | `MODAL_STYLES.footer` |
| Footer gap | `10px` | `MODAL_STYLES.btnGroup` |

Panel **width** is per-modal and is NOT normalised by this ticket — the four modals are
legitimately different sizes (375 / 620 / 720 px in Figma). Do not force one width.

### 4.6 Summary card (document header)

The ticket asks for *"mismo lenguaje de tarjeta de resumen del documento en todos los
modales de confirmación"*. In Figma it is a bordered strip with N equal columns, each
`label` above `value`:

```
background: hsl(var(--muted))        /* or --card on a --muted panel */
border: 1px solid hsl(var(--border-control))
borderRadius: 8
padding: 8px 12px
label:  12px / 400 / --muted-foreground
value:  16px / 500 / --foreground
```

**Scope warning:** only modals that *already* render a document summary should be touched.
Adding a summary card to a modal that does not have one is new functionality, not a style
fix, and is out of scope for a `Bug`. Flag it to the human instead.

Long values must truncate (`overflow: hidden; text-overflow: ellipsis; white-space: nowrap`)
— the Figma frame itself overflows on `"Distribuciones Iberia S.A."`.

### 4.7 Info banner

```
background: var(--status-info-bg)
border: 0.5px solid var(--status-info-border)
color: var(--status-info-fg)
borderRadius: 10
```

This one is **already correct** in `QuotationConfirmModal:319` and
`SendToEvaluationModal:122`. It is also the only legitimate use of the `--status-info-*`
family. Leave it alone.

---

## 5. Hard rules for the implementation

1. **Additive and presentational only.** Do not change handlers, state, props, data flow,
   `data-testid` values, or i18n keys. If a style fix seems to require a behaviour change,
   stop and ask.
2. **Never use `opacity` to express a disabled fill.** §4.3.
3. **Never use a `--status-*` token as a button fill.** §3.1.
4. **Never use `--card` or `--muted` as a border or text colour.** §3.1.
5. **Verify both themes.** Every change must be checked in light *and* dark mode. The
   `--foreground`/`--card` pair inverts correctly; a raw hex or `--primary` does not.
6. **Do not edit `schema_forge_core`.** No token changes, no core bump.
7. **Do not edit generated files** (`artifacts/*/generated/`). All four targets are
   hand-written files under `custom/` or `components/contract-ui/`, so this should not come
   up — if it does, you are in the wrong file.
8. **Prefer importing `MODAL_STYLES` over re-declaring a style object.** Where a modal's
   existing structure makes a full migration risky, at minimum align the *values*, and say
   so in the PR description.

---

## 6. Definition of done

- [ ] All four modals: primary = `--foreground` fill / `--card` label, radius `360`, height `40`.
- [ ] All four modals: cancel = `MODAL_STYLES.btnCancel` values.
- [ ] All four modals: disabled primary = `--border-control` fill, **no `opacity`**.
- [ ] All four modals: close X = `--muted-foreground`.
- [ ] `CloneReceiptModal`: the invisible borders (`--card`) and invisible cancel label
      (`--muted`) are fixed.
- [ ] Verified in light and dark mode.
- [ ] No diff in `schema_forge_core`.
- [ ] No behavioural diff: same handlers, same `data-testid`, same i18n keys.
- [ ] Existing tests pass (see remediation map §"Test impact").
