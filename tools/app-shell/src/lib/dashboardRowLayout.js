/**
 * ETP-5088 — Groups the dashboard's VISIBLE widgets into rows.
 *
 * The dashboard used to be three hardcoded rows. Once role gating started hiding widgets, the
 * survivors of a row absorbed the freed space through `flex-grow`, so "Cobros y pagos" — designed
 * for ~16% of its row — stretched to the full width for a Sales role, and "Productos más vendidos"
 * became a full-width band on its own.
 *
 * Rather than capping each widget (which leaves a ragged gap on the right) this packs the visible
 * widgets into rows by their design weights, so a role with fewer widgets simply gets fewer,
 * fuller rows.
 *
 * **The weights are the design's own flex-basis numbers**, kept verbatim so that with every widget
 * visible the packing reproduces the original three rows exactly — 672/213/435, then 672/443/213,
 * then 901/443. That is the property the unit test pins: gating must not redesign the dashboard
 * for the roles that see all of it.
 *
 * Dependency-free so it can be covered by a plain `node --test`, like this repo's other
 * `src/lib/` helpers.
 */

/**
 * Reference width of a full row, in the same arbitrary units as the weights. It is the sum of the
 * first design row (672 + 213 + 435).
 */
export const ROW_CAPACITY = 1320;

/**
 * Slack allowed before a widget is pushed to the next row. The three design rows do not sum to the
 * same total (1320, 1328.33 and 1344.33), so a strict capacity would split the second and third
 * ones. 30 units covers that spread and is far below the smallest weight (213), so it can never
 * let an extra widget slip into a row.
 */
export const ROW_TOLERANCE = 30;

/**
 * Packs items into rows, greedily and in order.
 *
 * Order is preserved: this never reorders widgets to fill a row better. The sequence is a product
 * decision (what a user reads first), and a packer that shuffled it would make the dashboard's
 * layout depend on which widgets a role happens to have.
 *
 * @param {Array<{weight: number}>} items - visible widgets, in display order
 * @param {{capacity?: number, tolerance?: number}} [options]
 * @returns {Array<Array<object>>} rows, each an array of the original item objects
 */
export function groupIntoRows(items, { capacity = ROW_CAPACITY, tolerance = ROW_TOLERANCE } = {}) {
  const rows = [];
  let current = [];
  let used = 0;

  for (const item of items ?? []) {
    const weight = Number(item?.weight) || 0;
    // A single item heavier than a row still gets its own row rather than being dropped.
    if (current.length > 0 && used + weight > capacity + tolerance) {
      rows.push(current);
      current = [];
      used = 0;
    }
    current.push(item);
    used += weight;
  }

  if (current.length > 0) rows.push(current);
  return rows;
}

/**
 * The tallest height among a row's widgets — a row is as tall as what it contains, so a 328px
 * chart landing next to two 234px cards is not clipped.
 *
 * @param {Array<{height: number}>} row
 * @returns {number} height in px, 0 for an empty row
 */
export function rowHeight(row) {
  return (row ?? []).reduce((tallest, item) => Math.max(tallest, Number(item?.height) || 0), 0);
}
