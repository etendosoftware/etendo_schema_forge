import { parseDelimited } from '@etendosoftware/app-shell-core/lib/import/parseDelimited.js';
import { parseXlsx } from '@etendosoftware/app-shell-core/lib/import/parseXlsx.js';
import { mapColumns } from '@etendosoftware/app-shell-core/lib/import/mapColumns.js';
import { validateRow } from '@etendosoftware/app-shell-core/lib/import/validateRows.js';
import { runImportRowValidator } from '@etendosoftware/app-shell-core/lib/import/rowValidators.js';
import { parseStatementAmount } from './statementAmount.js';
import { normalizeStatementDate } from './statementDate.js';
import {
  BANK_STATEMENT_IMPORT_DESCRIPTOR,
  BANK_STATEMENT_IMPORT_FIELDS,
  BANK_STATEMENT_NUMERIC_TARGETS,
  BANK_STATEMENT_REQUIRED_TARGETS,
  bankStatementFieldLabel,
} from './bankStatementImportFields.js';

/**
 * The browser-side half of the bank-statement import (ETP-4954).
 *
 * The file used to be shipped to `?action=preview` as base64 and parsed in Java. It is now
 * parsed here so its columns can be MAPPED and its rows REVIEWED before anything is sent —
 * which is the whole point of the feature QA asked for, and impossible while the parse lives
 * behind one opaque round trip. Every step below is a generic module from
 * `@etendosoftware/app-shell-core`, the same ones the Contacts and Product imports run on; this
 * file only wires them to statements and normalizes the three value shapes statements care
 * about (date, amount, blank reference).
 *
 * The result is then POSTed to the EXISTING `?action=create` endpoint, byte-identical to what
 * the manual form sends. That is deliberate: `FIN_BankStatement` has three mandatory columns
 * with no default and no sequence (`C_Doctype_ID`, `DocumentNo`, `FIN_Financial_Account_ID`),
 * and only that endpoint resolves them along with the BSF document type, the line numbering,
 * the processing and the aggregate recomputation. Sending the rows through the generic
 * `/sws/neo/batch` path instead would have meant reimplementing all of it.
 *
 * The old `?action=import` / `?action=preview` endpoints are untouched and still serve MCP,
 * REST callers and Cuaderno 43.
 */

// `normalizeStatementDate` moved to `statementDate.js` so the row validator can use it
// without an import cycle; re-exported here because it is part of this module's surface.
export { normalizeStatementDate } from './statementDate.js';

/** Extensions parsed as a spreadsheet rather than as delimited text. */
const XLSX_RE = /\.xlsx$/i;

/**
 * Parse an uploaded statement into `{ headers, rows }`.
 *
 * Both parsers return the identical shape, so nothing downstream can tell a CSV upload from an
 * Excel one — that identity is what lets the Excel path inherit the CSV path's behaviour rather
 * than reimplementing it.
 *
 * @param {File} file
 * @returns {Promise<{ headers: string[], rows: Array<Record<string, string>> }>}
 */
export async function parseStatementFile(file) {
  if (XLSX_RE.test(file.name ?? '')) return parseXlsx(file);
  return parseDelimited(await file.text());
}

/**
 * Auto-match the file's headers onto the import fields.
 *
 * `localizedFields` is what makes the mapping UI and the templates speak the session language:
 * each field's `label` is filled in with its translated header. The legacy canonical headers
 * (`Transaction Date`, `Amount IN`, …) live in `aliases`, which `mapColumns` matches too, so a
 * file written before ETP-4954 still auto-maps — and `ImportColumnMapping`, which renders
 * `field.label` in its selects, shows the user the same column names they see on screen.
 *
 * @param {string[]} headers
 * @param {(key: string) => string} ui
 */
export function buildStatementMapping(headers, ui) {
  const localizedFields = localizeFields(ui);
  return { ...mapColumns(headers, localizedFields), localizedFields };
}

/**
 * The import fields carrying session-language `label`s.
 *
 * The descriptor deliberately declares no `label` (see `bankStatementImportFields.js`), so this is
 * what fills it in — and it must run before `ImportColumnMapping` or `ImportReviewQueue` see a
 * field, since both render `label` and would otherwise fall back to the raw target name.
 */
export function localizeFields(ui) {
  const headerFor = bankStatementFieldLabel(ui);
  return BANK_STATEMENT_IMPORT_FIELDS.map((field) => {
    const localized = headerFor(field);
    if (!localized || localized === field.label) return field;
    // The previous label, when there was one, is kept as an alias so a file written with it still
    // auto-maps — the round trip that lets a template downloaded in one language be re-uploaded.
    return {
      ...field,
      label: localized,
      aliases: [...(field.aliases ?? []), field.label].filter(Boolean),
    };
  });
}

/**
 * Re-key each parsed row from file headers onto import targets, dropping the rows that say
 * nothing.
 *
 * Only mapped headers survive: an unmapped column is data the user chose not to import, and
 * carrying it through would put it in front of `validateRow`, which knows nothing about it.
 *
 * A row whose every MAPPED cell is blank is skipped rather than reported. Both the flows this
 * replaces do exactly that — `GenericCsvBankStatementImporter.isBlankRow` skipped it on import
 * and `BankStatementsHandler.isBlankLine` still skips it on write — and it is not a mistake the
 * user made: `parseDelimited` already drops a genuinely empty LINE, but a structurally present
 * row of empty cells (`,,,,,`, or a spreadsheet row the user cleared while Excel kept it in the
 * sheet's used range) survives parsing. Reported as an error it would put "missing date" and
 * "no amount" in the review queue for a row that is not there, which is noise the user cannot
 * act on. Blankness is judged AFTER mapping on purpose: an unmapped column the user chose to
 * ignore must not keep an otherwise-empty row alive.
 */
export function applyStatementMapping(rows, mapping) {
  const pairs = Object.entries(mapping).filter(([, target]) => target);
  const mappedRows = rows.map((row) => {
    const mapped = {};
    for (const [header, target] of pairs) mapped[target] = row[header] ?? '';
    return mapped;
  });
  // With NOTHING mapped yet, "every mapped cell is blank" is vacuously true of every row, so the
  // filter below would empty the review queue for a file that auto-matched none of its columns —
  // exactly the file the mapping step exists for. An empty queue reads as "this file has no
  // data" when the real answer is "tell me which column is which", so the rows are kept and
  // fail validation instead, which is the message the user can act on.
  if (pairs.length === 0) return mappedRows;
  return mappedRows.filter((mapped) => Object.values(mapped).some((v) => String(v ?? '').trim() !== ''));
}

/**
 * Validate one mapped row: the generic checks (required, numeric) plus the statement's own
 * amount rule, contributed by the registered row validator.
 *
 * Running the descriptor's rule in the SAME pass as the generic one is what puts a negative
 * amount in front of the user as a fixable cell error. Before ETP-4954 such a line was dropped
 * on the backend without a trace, or — with both amounts negative — imported and then displayed
 * as a nonsensical netted total.
 *
 * @param {(key: string, params?: object) => string} translate `useUI()`'s translator.
 */
export function validateStatementRow(row, translate) {
  return validateRow(row, {
    requiredTargets: BANK_STATEMENT_REQUIRED_TARGETS,
    numericTargets: BANK_STATEMENT_NUMERIC_TARGETS,
    extraErrors: runImportRowValidator(BANK_STATEMENT_IMPORT_DESCRIPTOR, row, { translate }),
    translate,
  });
}

/** `{ row, errors, valid, status }` per row — the entry shape `ImportReviewQueue` consumes. */
export function buildStatementEntries(mappedRows, translate) {
  return mappedRows.map((row) => ({ row, status: 'pending', ...validateStatementRow(row, translate) }));
}

/** The entries that will actually be sent: valid, and not skipped by the user. */
export function sendableEntries(entries) {
  return entries.filter((e) => e.valid && e.status !== 'skipped');
}

/**
 * One payload line, in the exact shape `?action=create` already accepts from the manual form.
 *
 * A blank reference becomes `**`, which is what both the manual form and the pre-ETP-4954
 * importer stored — the column is mandatory in the DB and `**` is Etendo's own placeholder.
 * `bpartnerId` / `glItemId` are always null: a file carries the partner's NAME, and resolving
 * it to a record is the matching step's job, not the import's.
 */
export function toPayloadLine(row) {
  const reference = String(row.reference ?? '').trim();
  return {
    date: `${normalizeStatementDate(row.date)}T00:00:00Z`,
    reference: reference || '**',
    description: String(row.description ?? '').trim(),
    bpartnerName: String(row.bpartnerName ?? '').trim(),
    bpartnerId: null,
    glItemId: null,
    in: parseStatementAmount(row.in) || 0,
    out: parseStatementAmount(row.out) || 0,
  };
}

/**
 * Preview figures for the confirmation step, in the shape `PreviewBody` already renders — so
 * the screen the user confirms on is the existing one, unchanged, just fed locally instead of
 * by the backend.
 *
 * `discardedLines` now counts rows the user is knowingly leaving behind (still invalid, or
 * explicitly skipped) rather than rows the backend silently dropped. That is the behavioural
 * change QA has to be told about: nothing disappears without being shown first.
 */
export function buildStatementPreview(entries) {
  const sendable = sendableEntries(entries);
  const lines = sendable.map((entry, i) => {
    const line = toPayloadLine(entry.row);
    return {
      lineNo: i + 1,
      date: normalizeStatementDate(entry.row.date),
      description: line.description,
      bpartnerName: line.bpartnerName,
      cramount: line.in,
      dramount: line.out,
    };
  });
  const dates = lines.map((l) => l.date).filter(Boolean).sort();
  return {
    lineCount: lines.length,
    lines,
    // Lexicographic min/max is the correct comparison for `yyyy-MM-dd` and needs no `Date`.
    periodFrom: dates[0] ?? null,
    periodTo: dates[dates.length - 1] ?? null,
    discardedLines: entries.length - sendable.length,
  };
}

/**
 * The `?action=create` body. `process: true` matches what the import has always done — an
 * imported statement arrives processed, the same as before this change.
 */
export function buildStatementCreatePayload({ accountId, file, entries, name }) {
  const preview = buildStatementPreview(entries);
  const today = todayIso();
  return {
    accountId,
    name,
    // The statement's transaction date is its last movement, which is what the list column and
    // the account's own ordering key off. Falls back to today for a file with no usable date.
    transactionDate: `${preview.periodTo ?? today}T00:00:00Z`,
    importDate: `${today}T00:00:00Z`,
    fileName: file?.name ?? '',
    notes: '',
    process: true,
    lines: sendableEntries(entries).map((e) => toPayloadLine(e.row)),
  };
}

/** Today as `yyyy-MM-dd` in the user's own timezone — a local calendar day, never a UTC one. */
function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
