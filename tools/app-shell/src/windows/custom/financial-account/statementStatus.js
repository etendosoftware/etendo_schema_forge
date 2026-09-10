/**
 * Whether a statement is still a draft — the only state that can be edited, deleted or
 * processed. `em_etgo_status` is `DRAFT` before the FIN_BankStatementProcess run, but
 * `processed` is the literal DB flag the backend actually guards on (`requireDraft` in
 * `BankStatementsHandler.java`), so both are checked to stay true even for a row whose
 * `status` lagged behind (see `BankStatementHeaderStatusHandler`'s own note on that gap).
 *
 * Shared by the row hover actions (`StatementsTable`), the row kebab (`StatementRowKebab`)
 * and the bulk-delete bar (`ImportedStatementsTab`) — a plain `.js` module (no JSX) so all
 * three can import it without creating a cycle between the two component files.
 *
 * @param {{ status?: string, processed?: string }} s
 * @returns {boolean}
 */
export function isDraftStatement(s) {
  return s.status === 'DRAFT' || s.processed === 'N';
}
