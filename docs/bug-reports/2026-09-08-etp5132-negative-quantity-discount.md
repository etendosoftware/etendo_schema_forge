# Invoice with negative quantity: "Discount per product" shows 0.00 instead of the real amount

Date: 2026-09-08

Jira: [ETP-5132](https://etendoproject.atlassian.net/browse/ETP-5132)

Status: **Fixed.**

## Summary (as reported)

On an invoice where a line's quantity is negative (e.g. a return folded into the same invoice),
applying a per-line discount % makes the "Discount per product" field in the totals panel show
0,00 € instead of the real discount amount.

Example from the ticket (Agua, quantity -1, price 5,00 €, 10% per-product discount, no total
discount):

- Subtotal without discount: **-5,00 €** (already correct, untouched by this fix)
- Subtotal (net of discount): **-4,50 €** (already correct, untouched by this fix — confirmed
  live against `go.experimental.etendo.cloud` twice)
- Discount per product: showed **0,00 €**, should show **0,50 €**

## Root cause

`computeDocumentTotals()` in `tools/app-shell/src/lib/documentTotals.js:124-126` computes:

```js
const discountAmt = (grossSubtotal != null && netSubtotal != null)
  ? grossSubtotal - netSubtotal
  : null;
```

For a positive-quantity line this is always positive (gross ≥ net). For a negative-quantity line,
applying a discount reduces the *magnitude* of the negative amount, so `netSubtotal` ends up
*less negative* than `grossSubtotal` (e.g. gross -5.00, net -4.50) — which makes
`discountAmt = grossSubtotal - netSubtotal = -5.00 - (-4.50) = -0.50`, i.e. **negative**, even
though a real discount was applied. The same shape of bug applies to `totalDiscountAmt` (line
133: `netSubtotal * pct / 100`), which is negative whenever `netSubtotal` is negative.

Four call sites downstream assumed `discountAmt`/`totalDiscountAmt` is always positive when a
real discount exists, and clamped/hid the value whenever it wasn't:

1. `tools/app-shell/src/components/contract-ui/DocumentTotalsPanel.jsx:147` — "Discount per
   product" row: `discountAmt > 0 ? -${fmt(discountAmt)} : fmt(0)`.
2. `DocumentTotalsPanel.jsx:174` — "Total discount" row, read-only (completed-document) variant.
3. `DocumentTotalsPanel.jsx:210` — "Total discount" row, interactive variant.
4. `tools/app-shell/src/windows/custom/shared/documentPdf.js` (`buildOrderData`, PDF for Sales/
   Purchase Order) — `discountAmt > 0 ? ... : null` hid the breakdown rows from the printed PDF
   entirely.
5. `documentPdf.js` (`computeDiscountBreakdown`, PDF for Sales Invoice/Quotation via
   `useInvoicePdf.js`/`useQuotationPdf.js`) — `Math.max(0, grossAmount - productNetAmount)`
   clamped the raw (possibly negative) discount to 0 before it ever reached the caller.

`DocumentTotalsPanel.jsx:126`'s `hasPerProductDiscount` variable was dead code (assigned, never
read elsewhere in the file) and was removed as part of the same cleanup.

## The correct formula (derived, verified against Classic + live environment)

There is **no special case for negative quantity**. The subtraction that has always been correct
stays exactly as-is: `Subtotal = Subtotal_without_discount − discountAmt`. What changes is only
**what value is displayed** for the discount row: it must be `-discountAmt` (sign-flipped), not
the raw `discountAmt` gated to a positive-or-zero clamp.

When `discountAmt` is negative (the negative-quantity case), `-discountAmt` is positive — that is
correct, and matches how Etendo Classic already handles this. The backend post-completion stored
procedures use exactly this sign convention:

```sql
-- C_ORDER_POST1 / C_INVOICE_POST (Classic), and mirrored client-side by
-- modules/com.etendoerp.go/.../TotalDiscountService.java for the GO document-level discount:
v_Discount := -1 * Cur_TaxDiscount.LINENETAMT * DiscountPct / 100;
```

`v_Discount` is `-1 * netAmount * pct`, i.e. its sign is the *opposite* of the base net amount's
sign — exactly the sign-flip this fix applies for display. See
`docs/plans/2026-05-03-discount-feature-status.md` § *Q-B — Tax distribution* for the full
derivation of this formula (that section required no changes — it was already correct; this
report only adds the cross-reference).

**Important correction to the ticket's own example text.** CP-1 in the ticket illustrates the
expected value as "ej: -0,50 EUR" (negative). This is inconsistent with two things already
confirmed correct in the same ticket:

- CP-2's own consistency check: `Subtotal_without_discount + Discount_per_product +
  Total_discount = Subtotal` → `-5,00 + X + 0 = -4,50` only balances for `X = +0,50`, not `-0,50`.
- The already-correct Subtotal (-4,50 €), which was verified live against
  `go.experimental.etendo.cloud` and must not change.

This was verified explicitly with the user (including live testing against the experimental
environment) before implementation: **the correct sign is POSITIVE (+0,50 €)**, and this fix
implements that. If CP-1's literal text is used verbatim as an acceptance check, it will report a
false failure — check against CP-2's consistency equation instead.

With a 10% total discount also active on the same example:

- `totalDiscountAmt = netSubtotal × pct/100 = -4,50 × 10% = -0,45` (unchanged, internal)
- Total discount displayed: **0,45 €** (was 0,00 €, same bug/fix)
- Subtotal (final): -4,05 € (already correct, untouched)
- Consistency check: `-5,00 + 0,50 + 0,45 = -4,05` ✓

## Fix — the five code points

All five follow the same pattern: stop gating on "> 0" (which is only true for positive-quantity
discounts) and stop clamping to 0; gate on "the discount is non-zero" (`!== 0`, either sign) and
display the sign-flipped value (`-discountAmt`, or the caller's equivalent).

1. **`DocumentTotalsPanel.jsx:147`** ("Discount per product" row) —
   `{discountAmt > 0 ? `-${fmt(discountAmt)}` : fmt(0)}` → `{fmt(-discountAmt)}`. `fmt` already
   formats through the canonical `formatCurrency` (see CLAUDE.md § Currency & Amount
   Formatting), so the sign is rendered by the formatter itself — no manual `-` string
   concatenation needed. **Correction (2026-09-08, review pass — see the `-0,00` section below):**
   the original text here claimed that when `discountAmt` is `null` (or `0`), `-discountAmt`
   evaluates to `0` "not `null`", reproducing the old fallback with no behavior change. That is
   **false** — `-discountAmt` for `discountAmt = 0` is `-0` (IEEE-754 negative zero, not `0`), and
   the real `formatCurrency` formatter distinguishes `-0` from `0`. This DID change behavior — it
   is the review-blocking regression fixed below, not a non-issue.

2. **`DocumentTotalsPanel.jsx:174`** ("Total discount" row, read-only/completed-document
   variant) — same pattern: `fmt(-totalDiscountAmt)`.

3. **`DocumentTotalsPanel.jsx:210`** ("Total discount" row, interactive variant) — same pattern.

4. **`DocumentTotalsPanel.jsx:126`** — removed the dead `hasPerProductDiscount` variable
   (confirmed via grep: never read elsewhere in the file).

5. **`tools/app-shell/src/windows/custom/shared/documentPdf.js` (`buildOrderData`)** — Sales/
   Purchase Order PDF (via `documentPdfRegistry.js`'s `commercial()` wrapper, and the preview/
   email paths that call `buildOrderData` directly):
   ```js
   grossAmount:        discountAmt !== 0 ? grossSubtotal : null,
   discountPerProduct: discountAmt !== 0 ? -discountAmt : null,
   totalDiscountAmt:   totalDiscountAmt !== 0 ? -totalDiscountAmt : null,
   ```

6. **`documentPdf.js` (`computeDiscountBreakdown`)** — shared by `useInvoicePdf.js` (Sales
   Invoice) and `useQuotationPdf.js` (Sales Quotation/Presupuesto):
   ```js
   // was: Math.max(0, grossAmount - productNetAmount)
   const discountPerProduct = grossAmount - productNetAmount;   // signed, no clamp
   ```
   with the two callers (`useInvoicePdf.js`, `useQuotationPdf.js`) updated the same way as
   `buildOrderData` — `!== 0` gate, `-discountPerProduct`/`-totalDiscountAmt` for display.

### The PDF template also had a second, independent sign bug — fixed in the same change

`DOCUMENT_TEMPLATE` in `documentPdf.js` (the shared Handlebars template for the commercial PDF —
invoice/order/quotation) hardcoded a literal `−` character in front of both discount rows:

```hbs
<span>−{{formatCurrency discountPerProduct}}</span>
<span>−{{formatCurrency totalDiscountAmt}}</span>
```

Per `docs/document-printables.md` / the `document-printables` skill, the printed PDF must show
**the same breakdown as the on-screen panel** — and the panel (fix #1 above) no longer prepends a
literal minus; it passes an already-signed value straight to `formatCurrency`, which renders its
own sign. Keeping the template's hardcoded `−` while also flipping the data builders' sign (as in
fixes #5/#6) would have made the *positive-quantity* case print correctly by accident (double
negation) while the *negative-quantity* case printed a **visibly wrong "−0,50 €"** in the PDF
even though the on-screen panel correctly showed "0,50 €" for the same document — i.e. the fix
would have repaired the panel but left the panel/PDF mismatch the printables skill exists to
prevent.

Fix: removed the hardcoded `−` from both rows in `DOCUMENT_TEMPLATE`, and the data builders
(#5/#6) now pass the sign-flipped, already-correct value — identical convention to the panel.
This affects every document rendered through `DOCUMENT_TEMPLATE`: Sales Order, Purchase Order,
Sales Invoice, Sales Quotation (Presupuesto) — for all five entry points that reuse it (preview
panel, download, both email paths, print button/multi-select), per
`docs/document-printables.md` § *Where the printables are used*.

**Out of scope, confirmed:** Purchase Invoice has no client-rendered PDF path today
(`useInvoicePdf.js` is hardcoded to the `sales-invoice` endpoint) and no `print-purchase-invoice`
artifact exists either — it falls back to the generic `print-*` artifact, which does not render a
discount breakdown at all (grepped, zero matches). This is a pre-existing gap, unrelated to this
bug — `docs/plans/2026-05-03-discount-feature-status.md`'s testing-status table already lists
Purchase Invoice as "not yet tested" for the discount feature (line 168), consistent with there
being no discount-aware PDF path for that window yet.

## Review fix — the sign-flip introduced a second, independent bug: "-0,00 €"

Caught in review by Alex, reproduced live against the real `formatCurrency` (not the mocked
formatter the existing tests use).

**Root cause.** `{fmt(-discountAmt)}` (fix #1/#2/#3 above) is correct when `discountAmt` is
non-zero, but `discountAmt` is `0` or `null` on the vast majority of documents — most lines carry
no per-product discount at all. `-0` (unary minus on `0`) and `-null` (which coerces to `-0`, not
`null` — see the correction in fix #1 above) are both **IEEE-754 negative zero**, not `0`. The real
`formatCurrency`/`groupWithSeparators` (`tools/app-shell/src/lib/formatCurrency.js:56-58`, before
this fix) had an explicit `Object.is(num, -0)` check that rendered `-0` **with a minus sign**,
matching raw `Intl.NumberFormat` semantics — so `fmt(-0)` produced `"-0,00 €"` for the ordinary,
no-discount case. This is the same class of bug already fixed once in this repo for the jsreport
side (`templates/reports/helpers/report-html-helpers.js`'s `formatCurrency`, ETP-4898 — summing
floats can leave a `-2.9e-11` residual that rounds to zero but keeps its sign), just triggered here
by a different producer (a sign-flip on a zero/null value instead of float summation error).

The old (pre-ETP-5132) code never hit this: `discountAmt > 0 ? -${fmt(discountAmt)} : fmt(0)`
explicitly substituted `fmt(0)` (a literal positive zero) for the "no discount" branch, so `-0`
was never constructed, let alone passed to the formatter.

**Fix chosen — pipeline-level, not point-fix.** Alex's stated preference (and the one implemented):
add a `-0,00` guard directly inside `groupWithSeparators()` in `formatCurrency.js`, mirroring the
existing ETP-4898 guard in `report-html-helpers.js`, so **no future caller** across the whole
app-shell can reintroduce this class of bug by handing the formatter a sign-flipped zero/null —
not just the 3 call sites this ticket touches. The alternative (short-circuiting at each call site,
e.g. `fmt(discountAmt ? -discountAmt : 0)`) was explicitly not chosen — it only protects the sites
someone remembers to write that way.

`groupWithSeparators` (`formatCurrency.js:55-70`) now computes the rounded magnitude (`fixed =
abs.toFixed(maxFrac)`) **before** deciding the sign, and only renders `-` when that rounded
magnitude is non-zero (`Number(fixed) !== 0`). A value that rounds to zero at the display
precision — genuine `-0`, or a tiny float residual — always renders as plain `0,00`, never
`-0,00`, regardless of the input's raw sign. This intentionally changes behavior for the
`documentPdf.js`/`useInvoicePdf.js`/`useQuotationPdf.js` sign-flip pattern (fixes #5/#6 above)
too, though those three are also independently safe: they gate with `!== 0 ? -x : null` before
ever reaching the formatter, so `0` maps to `null` (never `-0`) and the formatter never sees a
sign-flipped zero from those call sites in the first place — confirmed by re-reading all three
after this fix, not assumed from the pattern alone.

**`DocumentTotalsPanel.jsx` itself needed no further change** — `fmt(-discountAmt)` (fix #1) was
always the correct call site code; the bug lived one layer down, in what the shared formatter did
with the `-0` that expression legitimately produces.

**Existing-test fallout (expected, left for Tester).** `tools/app-shell/src/lib/__tests__/
formatCurrency.test.js` has two `describe` blocks (`-0 edge case`, ~line 156; and one assertion
in the `symbol position` block, ~line 353) that explicitly pinned the OLD, now-incorrect behavior
— `formatCurrency('EUR', -0)` asserted to equal `"-0,00 €"`. These now fail by design and need
updating to assert the corrected `"0,00 €"` output. This is exactly the "the current mocks mask
this bug" gap flagged during review: any test exercising `DocumentTotalsPanel`/`documentPdf.js`
through a *mocked* `formatAmount`/`fmt` never round-trips through the real `-0` handling, so
Tester's follow-up coverage for this bug needs at least one assertion against the **real**
`formatCurrency`, not a mock, to be a meaningful regression guard.

## Files changed

- `tools/app-shell/src/lib/formatCurrency.js` (`groupWithSeparators` — the `-0,00` guard; added
  during the review fix pass, see the section above)
- `tools/app-shell/src/components/contract-ui/DocumentTotalsPanel.jsx`
- `tools/app-shell/src/windows/custom/shared/documentPdf.js` (`DOCUMENT_TEMPLATE`,
  `buildOrderData`, `computeDiscountBreakdown`)
- `tools/app-shell/src/windows/custom/shared/useInvoicePdf.js`
- `tools/app-shell/src/windows/custom/shared/useQuotationPdf.js`

## Tests

Not written here — delegated to the `test-generator` (Tester) subagent per repo policy
(CLAUDE.md § Testing, "Delegation rule"). Running the existing suite surfaced the expected
casualties — tests that pinned the OLD (buggy) source text via regex/exact-value assertions
against the sign-clamped behavior:

- `tools/app-shell/src/windows/custom/shared/__tests__/useInvoicePdf.test.js`
- `tools/app-shell/src/windows/custom/shared/__tests__/useOrderPdf.test.js`
- `tools/app-shell/src/windows/custom/shared/__tests__/usePurchaseOrderPdf.test.js`
- `tools/app-shell/src/windows/custom/shared/__tests__/useQuotationPdf.test.js`
- `tools/app-shell/src/windows/custom/shared/__tests__/documentPdfHelpers.vitest.jsx` (one test,
  `discountPerProduct is never negative (clamped to 0)`, asserts the exact behavior this fix
  removes)
- `tools/app-shell/src/lib/__tests__/formatCurrency.test.js` (review fix pass) — the `-0 edge
  case` describe block (~line 156) and one assertion in `symbol position` (~line 353) pin the OLD
  `"-0,00 €"` output; see the `-0,00` section above for the corrected expectation and why a real
  (non-mocked) formatter assertion is needed to actually guard this regression.

All other tests remain green, including `tools/app-shell/src/lib/__tests__/documentTotals.test.js`
and `.../DocumentTotalsPanel.vitest.jsx` (the internal `discountAmt`/`totalDiscountAmt`
computation in `documentTotals.js` was deliberately NOT touched by this fix — only what gets
*displayed* changed).

Two unrelated, pre-existing failures were observed while running the full suite (present before
this change, confirmed by reproducing them in isolation on this worktree): `chart-of-accounts/
__tests__/newSubAccountModal.test.js` (reads a generated file from
`node_modules/@etendosoftware/schema-forge-cli/`, not present in a non-`LOCAL_CORE` worktree) and
`tools/app-shell/test/pwa.test.js` / `auth-header-policy.test.js`'s `Accept-Language` case
(require a local `vite build` / network access unavailable in this environment). Neither touches
any file changed by this fix.

## Cross-references

- `docs/plans/2026-05-03-discount-feature-status.md` § *Q-B — Tax distribution* — the Classic/
  `TotalDiscountService` sign-flip formula this fix's convention is derived from.
- `docs/document-printables.md` — the five-entry-point/three-template model that required fixing
  the PDF template's hardcoded sign alongside the data builders, not just one or the other.
