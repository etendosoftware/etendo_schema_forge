import { useStatementFileRequest } from './useStatementFileRequest';

/**
 * Hook for importing a bank statement file (Cuaderno 43 or generic CSV).
 *
 * POST /sws/neo/bank-statements?action=import
 * body: { FIN_Financial_Account_ID, fileName, contentBase64 }
 *
 * Response data: { id, fileName, lineCount, discardedLines } — `lineCount` is
 * what was actually persisted and `discardedLines` how many rows the backend
 * dropped for carrying no amount. A rejected call carries `err.status` and,
 * for a known backend failure, `err.code` (e.g. `NO_VALID_LINES`).
 *
 * @returns {{
 *   importStatement: (payload: { accountId: string, fileName: string, contentBase64: string }) => Promise<object>,
 *   importing: boolean,
 *   error: Error|null
 * }}
 */
export function useStatementImport() {
  const { run, busy, error } = useStatementFileRequest('import');
  return { importStatement: run, importing: busy, error };
}
