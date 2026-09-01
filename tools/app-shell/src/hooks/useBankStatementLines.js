import { useMemo } from 'react';
import { useNeoResource } from './useNeoResource';

/**
 * Fetches the lines of a single bank statement.
 *
 * GET /sws/neo/bank-statements?action=lines&statementId={statementId}
 *
 * `refreshToken` (ETP-4921) exists because the lines of a statement can change without this
 * hook's own inputs changing at all: the caller that mutates them is somewhere else entirely
 * (the edit modal's `?action=update`, or a reconciliation), while every consumer here keys only
 * off `statementId`. Reloading the statement HEADERS — which is what the tab's `reload()` and its
 * refresh button do — does not touch this fetch, so the expanded accordion kept rendering the
 * pre-edit amounts until the whole window was reloaded, even though the header row above it had
 * already updated. Bumping the token is how an outside mutation says "these lines are stale".
 *
 * @param {string|null} statementId
 * @param {number|string} [refreshToken] bump to force a refetch of the same statement's lines
 * @returns {{ lines: Array<object>, loading: boolean, error: Error|null, reload: () => void }}
 */
export function useBankStatementLines(statementId, refreshToken = 0) {
  const path = statementId
    ? `/sws/neo/bank-statements?action=lines&statementId=${encodeURIComponent(statementId)}`
    : null;

  const mapPayload = useMemo(
    () => (raw) => ({ lines: Array.isArray(raw.lines) ? raw.lines : [] }),
    [],
  );

  const { data, loading, error, reload } = useNeoResource({
    path,
    deps: [statementId, refreshToken],
    mapPayload,
    label: 'useBankStatementLines',
  });

  return { lines: data?.lines ?? [], loading, error, reload };
}
