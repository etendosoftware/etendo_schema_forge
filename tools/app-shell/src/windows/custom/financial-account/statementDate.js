/**
 * The bank-statement import's date parser — the shared one, under this window's own names.
 *
 * ETP-5350 promoted the implementation to `@/lib/importDateCell.js` when the Product import
 * needed the identical four shapes for the costing starting date. Nothing about the parser was
 * bank-specific, and a second copy would have been a second set of edge cases to get wrong
 * (`31/02`, a two-digit year, an Excel date cell, the ETP-4031/4850 timezone class).
 *
 * This file stays as the naming alias so the statement pipeline and its tests keep reading in
 * their own vocabulary. There is no second implementation here — only the two re-exports.
 */
export { normalizeImportDate as normalizeStatementDate, isInvalidImportDate as isInvalidStatementDate } from '@/lib/importDateCell.js';
