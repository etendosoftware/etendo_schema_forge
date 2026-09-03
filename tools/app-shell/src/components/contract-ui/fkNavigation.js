/**
 * ETP-5075 — Generic click-through navigation for read-only foreign-key values.
 *
 * Registry mapping an **AD column name** to the window a read-only FK value should
 * navigate to. Keyed by column (not by `reference`) on purpose: the generated form
 * descriptors carry both `column` and `reference`, but the generated grid columns carry
 * only `column` — keying by column lets the same registry drive the detail form AND the
 * list grid without any change to the generators in `schema_forge_core`.
 *
 * Same shape of idea as `components/related-documents/docChipTypes.jsx`: one map from
 * contract data to a UI behavior, written once and reused by every window.
 *
 * Two kinds of entry:
 *
 * - **FK that already points at a document header** — omit `idField`. The FK's own value
 *   IS the target record id, so the link is `/{window}/{fkValue}`.
 * - **FK that points at a LINE** (as in `M_MatchInv`) — a line has no window of its own,
 *   and cross-window navigation in the app-shell only ever reaches a header. The parent
 *   document id is not part of an FK's response shape (a foreign key returns the id plus
 *   a `$_identifier` label, nothing more), so it has to be injected into the row by the
 *   entity's `NeoHandler` in `afterHandle`. `idField` names the key the handler writes.
 *
 * Adding a window to this feature is a one-line entry here — plus, for the line case, a
 * handler that injects the parent id. Nothing else: no `decisions.json` property, no
 * generator change, no core release.
 */

/**
 * @typedef {object} FkNavigationTarget
 * @property {string} window - Route segment of the target window (its spec name).
 * @property {string} [idField] - Key on the current record holding the target record id.
 *   Omit when the FK's own value is already the target id.
 */

/** @type {Record<string, FkNavigationTarget>} */
export const FK_NAVIGATION_TARGETS = {
  // ETP-5075 — Receipt-Invoice Link (M_MatchInv): both FKs point at LINES, so the parent
  // document ids are injected per row by MatchedInvoiceHandler (com.etendoerp.go).
  C_InvoiceLine_ID: { window: 'purchase-invoice', idField: 'invoiceHeaderId' },
  M_InOutLine_ID: { window: 'goods-receipt', idField: 'receiptHeaderId' },
};

/**
 * Resolve the route a read-only FK value should navigate to.
 *
 * Fails CLOSED — returns `null` whenever navigation cannot be resolved, so the caller
 * keeps its existing non-clickable rendering. That is what makes this safe to wire into
 * the shared form/grid renderers: a column with no entry here behaves exactly as before.
 *
 * @param {string|null|undefined} column - AD column name of the field (e.g. `C_InvoiceLine_ID`).
 * @param {object|null|undefined} record - The row/record being rendered.
 * @returns {string|null} Route to navigate to, or `null` when not navigable.
 */
export function resolveFkNavigation(column, record) {
  if (!column || !record) return null;
  const target = FK_NAVIGATION_TARGETS[column];
  if (!target) return null;

  // `idField` names a handler-injected parent id; without it the FK's own value is the id.
  const rawId = target.idField ? record[target.idField] : record[column];
  if (rawId == null) return null;
  const id = String(rawId).trim();
  if (!id) return null;

  return `/${target.window}/${id}`;
}
