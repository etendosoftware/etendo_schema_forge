import { useCallback, useRef, useState } from 'react';
import { ImportParseError } from '@etendosoftware/app-shell-core/lib/import/parseDelimited.js';
import {
  applyStatementMapping,
  buildStatementEntries,
  buildStatementMapping,
  parseStatementFile,
  validateStatementRow,
} from './bankStatementImportPipeline.js';

/**
 * Mapping + review state for the bank-statement import (ETP-4954).
 *
 * Extracted from `ImportStatementModal` rather than inlined: the modal already carries the
 * wizard's own view machine, and folding six more handlers into it pushed its render past
 * Sonar's S3776 complexity threshold. Keeping it here also makes the whole parse → map →
 * validate chain testable without mounting a Radix dialog.
 *
 * Every handler re-validates synchronously, which is what the review queue needs: fixing a
 * cell has to clear its error in the same render, or the row stays in the Errores tab while
 * visibly correct.
 */
export function useStatementImportReview(ui) {
  // `useUI()` may hand back a fresh function each render, and these callbacks are passed
  // straight to memoized children. Reading the translator through a ref keeps their identity
  // stable while still translating with the current locale.
  const uiRef = useRef(ui);
  uiRef.current = ui;
  const translate = useCallback((key, params) => uiRef.current(key, params), []);

  const [headers, setHeaders] = useState([]);
  const [mapping, setMapping] = useState({});
  const [fields, setFields] = useState([]);
  const [entries, setEntries] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  // The parsed file, kept so a mapping change can re-key the rows without re-reading it.
  const rawRowsRef = useRef([]);

  const clear = useCallback(() => {
    setHeaders([]);
    setMapping({});
    setFields([]);
    setEntries([]);
    setStatusFilter('all');
    rawRowsRef.current = [];
  }, []);

  /**
   * Parse, auto-map and validate an uploaded file.
   *
   * @returns {Promise<{ ok: true, rowCount: number } | { ok: false, errorKey: string|null }>}
   *   `errorKey` names the i18n message for a file the parsers rejected (empty, duplicate
   *   headers, several populated sheets); `null` falls back to the generic format message.
   */
  const loadFile = useCallback(async (file) => {
    try {
      const { headers: parsedHeaders, rows } = await parseStatementFile(file);
      if (rows.length === 0) {
        return { ok: false, errorKey: 'financeAccountStatementsImportErrorEmptyFile' };
      }
      const { mapping: autoMapping, localizedFields } = buildStatementMapping(parsedHeaders, uiRef.current);
      rawRowsRef.current = rows;
      setHeaders(parsedHeaders);
      setFields(localizedFields);
      setMapping(autoMapping);
      setEntries(buildStatementEntries(applyStatementMapping(rows, autoMapping), translate));
      setStatusFilter('all');
      return { ok: true, rowCount: rows.length };
    } catch (error) {
      // A parser's own complaint (empty file, duplicate headers, multi-sheet workbook) is
      // specific and worth showing; anything else is not something the user can act on, so it
      // falls through to the generic "unsupported format" copy.
      return {
        ok: false,
        errorKey: error instanceof ImportParseError
          ? 'financeAccountStatementsImportErrorUnreadable'
          : null,
      };
    }
  }, [translate]);

  /**
   * Re-key and re-validate every row against a mapping the user edited.
   *
   * Row edits made in the review queue are deliberately NOT preserved: the mapping decides
   * which file column feeds which field, so re-keying rebuilds each row from the file. Keeping
   * a hand-typed value would silently pin a cell to something the file no longer says.
   */
  const applyMapping = useCallback((nextMapping) => {
    setMapping(nextMapping);
    setEntries(buildStatementEntries(applyStatementMapping(rawRowsRef.current, nextMapping), translate));
  }, [translate]);

  const editField = useCallback((index, target, value) => {
    setEntries((prev) => prev.map((entry, i) => {
      if (i !== index) return entry;
      const row = { ...entry.row, [target]: value };
      return { ...entry, row, ...validateStatementRow(row, translate) };
    }));
  }, [translate]);

  const retryEntry = useCallback((index) => {
    setEntries((prev) => prev.map((entry, i) => (
      i === index ? { ...entry, ...validateStatementRow(entry.row, translate) } : entry
    )));
  }, [translate]);

  const skipEntry = useCallback((index) => {
    setEntries((prev) => prev.map((e, i) => (i === index ? { ...e, status: 'skipped' } : e)));
  }, []);

  const unskipEntry = useCallback((index) => {
    setEntries((prev) => prev.map((e, i) => (i === index ? { ...e, status: 'pending' } : e)));
  }, []);

  return {
    headers,
    mapping,
    fields,
    entries,
    statusFilter,
    setStatusFilter,
    clear,
    loadFile,
    applyMapping,
    editField,
    retryEntry,
    skipEntry,
    unskipEntry,
  };
}
