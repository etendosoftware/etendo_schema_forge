import { useMemo } from 'react';
import { useNeoResource } from './useNeoResource';

/**
 * Fetches the lines of a single bank statement.
 *
 * GET /sws/neo/bank-statements?action=lines&statementId={statementId}
 *
 * @param {string|null} statementId
 * @returns {{ lines: Array<object>, loading: boolean, error: Error|null, reload: () => void }}
 */
export function useBankStatementLines(statementId) {
  const path = statementId
    ? `/sws/neo/bank-statements?action=lines&statementId=${encodeURIComponent(statementId)}`
    : null;

  const mapPayload = useMemo(
    () => (raw) => ({ lines: Array.isArray(raw.lines) ? raw.lines : [] }),
    [],
  );

  const { data, loading, error, reload } = useNeoResource({
    path,
    deps: [statementId],
    mapPayload,
    label: 'useBankStatementLines',
  });

  return { lines: data?.lines ?? [], loading, error, reload };
}
