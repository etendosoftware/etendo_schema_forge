/**
 * CANONICAL set of `field.type`/`col.type` values that count as "numeric" for
 * keystroke masking, live-total calculation and commit-time coercion.
 *
 * ETP-5107 — before this, `DataTable.jsx` (`NUMERIC_FIELD_TYPES`),
 * `InlineLinesPanel.jsx` (`NUMERIC_TYPES`) and `ListModalWindow.jsx`
 * (`NUMERIC`) each hand-maintained their own, slightly different list —
 * `DataTable.jsx`'s was missing `'price'`, which meant a window whose
 * `decisions.json` declares `type: "price"` for an add-line column silently
 * got NO numeric masking/coercion at all. See
 * docs/plans/2026-09-08-etp5107-price-input-locale-fix.md §6.3.4.
 *
 * Every one of the three files above must import this constant instead of
 * maintaining its own copy. The masking/parsing gate MUST always be "is this
 * field's declared `type` numeric", never "does the current string value
 * happen to look numeric" — `InlineLinesPanel.jsx`'s `EditCell` renders the
 * exact same generic input for numeric AND plain-text fields (e.g.
 * `Descripción`), so gating by type is what keeps a text field from being
 * incorrectly masked.
 */
export const NUMERIC_FIELD_TYPES = new Set([
  'number',
  'integer',
  'decimal',
  'quantity',
  'amount',
  'price',
  'percent',
  'signedDelta',
]);

/** Amount/price-shaped types — always rendered with 2 fixed decimals and,
 * in `MaskedAmountInput`, with live thousands-grouping while typing. */
export const TWO_DECIMAL_FIELD_TYPES = new Set(['amount', 'price']);
