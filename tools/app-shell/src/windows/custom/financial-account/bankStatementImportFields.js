import { registerImportRowValidator } from '@etendosoftware/app-shell-core/lib/import/rowValidators.js';
import { parseStatementAmount, isInvalidStatementAmount } from './statementAmount.js';
import { isInvalidStatementDate } from './statementDate.js';

/**
 * Field descriptor for the bank-statement CSV/Excel import (ETP-4954).
 *
 * Shaped exactly like a `window.import.fields` block in `decisions.json`, so every generic
 * module in `@etendosoftware/app-shell-core` consumes it unchanged: `mapColumns` for the
 * auto-match, `buildTemplateCsv`/`buildTemplateXlsx` for the downloadable templates,
 * `validateRows` for the per-row checks and `ImportColumnMapping` for the manual mapping UI.
 * Statements are not a ListView window — they live in a tab of the financial account's detail
 * and import through their own modal — so the block cannot come from `decisions.json`; it is
 * declared here instead and fed to the same machinery.
 *
 * `target` is deliberately the key of the `?action=create` payload, not the AD column name.
 * That endpoint already resolves the document type, the DocumentNo, the line numbering, the
 * processing and the aggregates, so the import sends the byte-identical payload the manual form
 * sends and inherits all of it. A mapped row therefore needs no translation layer at all.
 *
 * `labelKey` (rather than `column`) is what gives the template its session-language headers:
 * these six keys are already the labels the user reads above the line grid in the manual form,
 * maintained in all three locales. Reusing them keeps the downloaded template's headers and
 * the on-screen column names literally the same string, in whatever language the session is.
 */
export const BANK_STATEMENT_IMPORT_DESCRIPTOR = 'bank-statement';

/**
 * EVERY locale's label for a field is carried in its `aliases`, not just the active session's.
 *
 * This is what makes the template round trip across languages. `ImportDialog`'s own approach —
 * injecting only the CURRENT session's resolved header as an alias — is not enough here: a
 * template downloaded by an English session (`Date`, `Contact name`, `Out`, `In`) and uploaded
 * later by a Spanish one matched 2 of its 6 columns, because only the Spanish labels were
 * aliases. The reverse direction happened to work, which made the gap asymmetric and easy to
 * miss. Locale dictionaries are lazy-loaded one at a time (ETP-4300), so the labels cannot be
 * collected at runtime; they are listed statically here and
 * `importTemplateRoundTrip.vitest.js` reads the three locale files and fails if a label is ever
 * renamed without its alias following.
 *
 * No field declares a `label`, on purpose. `label` is what `ImportColumnMapping` and
 * `ImportReviewQueue` RENDER when nothing better is supplied, so an English string there is a
 * user-facing hardcoded label — which is what it was, and what the quality gate rightly flagged.
 * The displayed name always comes from `labelKey` via `bankStatementFieldLabel`, and
 * `localizeFields` writes the resolved translation into `label` before either component sees the
 * field.
 *
 * `aliases[0]` is the Spanish term — the core's convention, and the fallback header when no label
 * resolver is injected. The English canonical headers the pre-ETP-4954 importer accepted follow it
 * as further aliases on purpose: a file that imported before this change must still auto-map
 * cleanly, and so must a CSV exported from the statements list. `mapColumns` matches on aliases as
 * well as on `label`, so nothing is lost by keeping them only there.
 */
export const BANK_STATEMENT_IMPORT_FIELDS = [
  {
    target: 'date',
    id: 'date',
    labelKey: 'financeAccountStatementsManualColDate',
    aliases: ['Fecha', 'Date', 'Transaction Date', 'Fecha Transacción', 'Fecha de transacción', 'Fecha valor'],
    required: true,
    example: '01/08/2026',
  },
  {
    target: 'reference',
    id: 'reference',
    labelKey: 'financeAccountStatementsManualColReference',
    aliases: ['Nº de referencia', 'Reference No.', 'Referencia', 'N.º de referencia'],
    // Optional on purpose: a blank reference is stored as `**`, exactly as the manual form
    // and the pre-ETP-4954 importer already did. Marking it required in the template would
    // invent a constraint neither flow has.
    required: false,
    example: 'REF-001',
  },
  {
    target: 'description',
    id: 'description',
    labelKey: 'financeAccountStatementsManualColDesc',
    aliases: ['Descripción', 'Description', 'Concepto'],
    required: false,
    example: 'Transferencia recibida',
  },
  {
    target: 'bpartnerName',
    id: 'bpartnerName',
    labelKey: 'financeAccountStatementsManualColContactName',
    aliases: ['Nombre del contacto', 'Contact name', 'Business Partner Name', 'Contacto', 'Tercero'],
    required: false,
    example: 'Cliente Ejemplo, S.L.',
  },
  {
    target: 'out',
    id: 'out',
    labelKey: 'financeAccountStatementsManualColOut',
    aliases: ['Salida', 'Out', 'Amount OUT', 'Importe salida', 'Debe', 'Cargo'],
    required: false,
    isNumeric: true,
    example: '150,00',
  },
  {
    target: 'in',
    id: 'in',
    labelKey: 'financeAccountStatementsManualColIn',
    aliases: ['Entrada', 'In', 'Amount IN', 'Importe entrada', 'Haber', 'Abono'],
    required: false,
    isNumeric: true,
    example: '0,00',
  },
];

/** Targets whose cell must parse as a number when it is not blank. */
export const BANK_STATEMENT_NUMERIC_TARGETS = BANK_STATEMENT_IMPORT_FIELDS
  .filter((f) => f.isNumeric).map((f) => f.target);

/** Targets that must carry a value. */
export const BANK_STATEMENT_REQUIRED_TARGETS = BANK_STATEMENT_IMPORT_FIELDS
  .filter((f) => f.required).map((f) => f.target);

/**
 * Resolves a field's header in the session language. Mirrors `ListView`'s `importFieldLabel`,
 * minus the `headerScope` qualifier — a statement row maps onto ONE entity, so there are no
 * same-labelled halves to disambiguate.
 *
 * @param {(key: string) => string} ui `useUI()`'s translator.
 */
export function bankStatementFieldLabel(ui) {
  return (field) => (field.labelKey ? ui(field.labelKey) : null) || field.label || field.target;
}

/**
 * The amount rule, as a row validator.
 *
 * A line is valid when it carries at least one amount above zero and NO amount below zero.
 * Rejecting negatives outright is a deliberate divergence from Etendo Classic (ETP-4954):
 * money in belongs in Entrada and money out in Salida, and a sign never substitutes for the
 * column. Before this, a row with `Salida=-50 / Entrada=-20` imported silently and was then
 * displayed as a nonsensical `Entrada +30` — the reading path collapses the pair to `cr - dr`.
 *
 * Running here rather than only at send time is what turns those rows into something the user
 * can fix: they land in the review queue's Errores tab with the offending cell flagged, instead
 * of being dropped without a trace (the pre-ETP-4954 behaviour) or failing the whole import.
 *
 * The same rule is enforced independently on the two backend paths it can reach —
 * `BankStatementsHandler.createLines` for the API and `BankStatementLinePruner` for the legacy
 * `?action=import` endpoint — so a caller that bypasses this UI cannot persist a negative line.
 */
export function validateBankStatementRow(row, ctx = {}) {
  const { translate } = ctx;
  const t = (key, fallback) => {
    if (typeof translate !== 'function') return fallback;
    const out = translate(key);
    return out && out !== key ? out : fallback;
  };
  const errors = [];
  // `validateRow`'s required check can only ask whether the cell is BLANK, and `31/02/2026` is
  // not blank — so before this an unparseable date passed every check and only failed inside
  // `toPayloadLine`, which wrote the literal string `"nullT00:00:00Z"` into the
  // `?action=create` payload. A blank cell is the required check's business, not this one's.
  if (isInvalidStatementDate(row.date)) {
    errors.push({
      target: 'date',
      message: t(
        'financeAccountStatementsImportErrorInvalidDate',
        'Not a valid date. Use the dd/mm/yyyy format, for example 01/08/2026.',
      ),
    });
  }
  for (const target of BANK_STATEMENT_NUMERIC_TARGETS) {
    // A non-numeric cell is already reported by `validateRow`'s numeric check; flagging it
    // again here would show the same cell twice in the review queue. Returns what has been
    // found SO FAR rather than `[]`, so a row that also has a bad date still reports it.
    if (isInvalidStatementAmount(row[target])) return errors;
  }
  const out = parseStatementAmount(row.out) ?? 0;
  const inn = parseStatementAmount(row.in) ?? 0;
  let hasAmountError = false;
  for (const [target, value] of [['out', out], ['in', inn]]) {
    if (value < 0) {
      hasAmountError = true;
      errors.push({
        target,
        message: t(
          'financeAccountStatementsImportErrorNegativeAmount',
          'Amounts cannot be negative: use Salida for money out and Entrada for money in.',
        ),
      });
    }
  }
  // Only complain about the missing amount when neither side is negative — a negative pair
  // also has no positive amount, and two errors for one cause read as two problems. Keyed off
  // whether an AMOUNT error was found, not off whether the whole list is empty: a row with a
  // bad date AND no amount must report both.
  if (!hasAmountError && out <= 0 && inn <= 0) {
    errors.push({
      target: 'in',
      message: t(
        'financeAccountStatementsImportErrorNoAmount',
        'The line needs a positive amount in either Salida or Entrada.',
      ),
    });
  }
  return errors;
}

registerImportRowValidator(BANK_STATEMENT_IMPORT_DESCRIPTOR, validateBankStatementRow);
