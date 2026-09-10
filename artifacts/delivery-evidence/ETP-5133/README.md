# ETP-5133 — Lines-table overflow scoped to avoid sidebar overlap

## Bug

At a narrow/laptop-width viewport (1366×768, 100% zoom, sidebar expanded), the Lines-tab
table in windows using `window.linesLayout: "inlineEditable"` had no scoped horizontal
scroll container. Overflow fell through to the whole detail-content pane instead of being
contained to the table, so wide column sets bled into whatever sat to the right of the
table — most visibly on **purchase-invoice**, where the table's rightmost column
(`grossAmount`) rendered underneath the attachments/document-preview side panel, with the
panel's own text ("Sin archivos adjuntos" / "Adjuntar documento") overlapping the table's
numeric values.

Of the 6 windows sharing `InlineLinesPanel.jsx` (sales-quotation, sales-invoice,
purchase-invoice, goods-shipment, goods-receipt, simple-g-l-journal), only
**purchase-invoice** visibly broke at this exact viewport/dataset — the other 5 have no
right-side panel and happened to fit without a visible symptom, even before the fix.

## Fix

Commit `738af8395` (`tools/app-shell/src/components/contract-ui/InlineLinesPanel.jsx`)
splits the table's sticky header and scrollable body into two independently-scrolled
wrapper divs, synced via `scrollLeft`:

- Body rows: `<div ref={bodyScrollRef} className="overflow-x-auto pb-6" onScroll={handleBodyScroll}>`
- Header: outer wrapper keeps `sticky top-0` with **no** overflow of its own; an inner
  `overflow-x-hidden` div is driven programmatically from the body's scroll position.

This split exists because an `overflow-x` ancestor placed directly between the sticky
header and its real scrolling ancestor silences `position: sticky` — the CSS overflow spec
forces `overflow-y` to `auto` too whenever `overflow-x` isn't `visible`, and that turns the
wrapper into the header's new (non-scrolling) sticky containing block.

## Visual evidence

All screenshots captured at 1366×768, sidebar expanded, identical synthetic 3-line dataset
per window, un-scrolled resting position (fair before/after comparison).

| Window | Before | After |
| --- | --- | --- |
| purchase-invoice | `ETP-5133-purchase-invoice-lines-overlap-before.png` | `ETP-5133-purchase-invoice-lines-overlap-after.png` |
| sales-invoice | `ETP-5133-sales-invoice-lines-overlap-before.png` | `ETP-5133-sales-invoice-lines-overlap-after.png` |
| sales-quotation | `ETP-5133-sales-quotation-lines-overlap-before.png` | `ETP-5133-sales-quotation-lines-overlap-after.png` |
| goods-shipment | `ETP-5133-goods-shipment-lines-overlap-before.png` | `ETP-5133-goods-shipment-lines-overlap-after.png` |
| goods-receipt | `ETP-5133-goods-receipt-lines-overlap-before.png` | `ETP-5133-goods-receipt-lines-overlap-after.png` |
| simple-g-l-journal | `ETP-5133-simple-g-l-journal-lines-overlap-before.png` | `ETP-5133-simple-g-l-journal-lines-overlap-after.png` |

**purchase-invoice** is the window that actually changed: the `grossAmount` column
(118,75 / 140,80 / 123,35) is now fully readable and cleanly separated from the attachments
panel, with a visible horizontal scrollbar under the table confirming the scroll is now
contained to the table instead of the whole content pane. The other 5 windows render
byte-for-byte identically before and after, as expected (no visible regression from the
scoping change).

## Tests

`e2e/tests/flows/lines-overflow-etp5133.mocked.spec.js` — permanent regression spec, one
test per window, asserting for each:

1. **Mechanism present** — the body-rows wrapper has `overflow-x: auto` (holds for all 6
   windows, even the 5 where the visual symptom never appeared).
2. **No overlap** — the lines table's bounding box does not intersect the left nav
   sidebar's bounding box (all 6 windows), and for purchase-invoice specifically, does not
   intersect the attachments side panel's bounding box either (the assertion that flipped
   from failing to passing).
3. **Sticky header still pinned** — the header wrapper's `top` position is unchanged after
   scrolling the body wrapper horizontally, guarding the exact regression the fix's
   two-wrapper split was designed to avoid.

Run: `cd e2e && E2E_CAPTURE_SCREENSHOTS=1 npx playwright test tests/flows/lines-overflow-etp5133.mocked.spec.js --project=mocked`

All 6 tests pass against the post-fix code. No regressions found.
