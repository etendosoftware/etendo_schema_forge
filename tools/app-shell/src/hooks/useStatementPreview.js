import { useStatementFileRequest } from './useStatementFileRequest';

/**
 * Hook for the multi-step "Importar extracto" modal. Calls
 *   POST /sws/neo/bank-statements?action=preview
 * which parses the file in-memory on the backend, computes totals and
 * returns the parsed lines WITHOUT persisting anything to the DB.
 *
 * Body: { FIN_Financial_Account_ID, fileName, contentBase64 }
 *
 * Response data shape:
 *   {
 *     format: 'C43' | 'GENERIC_CSV',
 *     fileName: string,
 *     lineCount: number,
 *     discardedLines: number,    // rows dropped for having no amount
 *     totalIn: number,
 *     totalOut: number,
 *     periodFrom: string,        // ISO date
 *     periodTo: string,          // ISO date
 *     lines: Array<{ lineNo, date, description, bpartnerName, reference, cramount, dramount }>,
 *   }
 *
 * A rejected call carries `err.status` and, for a known backend failure,
 * `err.code` (e.g. `NO_VALID_LINES` when the file has nothing importable).
 *
 * @returns {{
 *   previewStatement: (payload: { accountId, fileName, contentBase64 }) => Promise<object>,
 *   previewing: boolean,
 *   error: Error|null,
 * }}
 */
export function useStatementPreview() {
  const { run, busy, error } = useStatementFileRequest('preview');
  return { previewStatement: run, previewing: busy, error };
}
