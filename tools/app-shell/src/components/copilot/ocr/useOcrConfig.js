import { useCallback, useEffect, useState } from 'react';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { getNeoBaseUrl } from '@/lib/neoBaseUrl.js';

/**
 * What the extraction tool is asked for a document type — the tool, the question and the strict
 * JSON schema of its answer — read from the server's OCR configuration
 * (`GET /sws/neo/ocrconfig?docType=<id>`).
 *
 * The configuration lives once, on the server, and is the same one the MCP's document-reading tools
 * use, so the application and an agent ask the model exactly the same thing. There is deliberately
 * no local copy to fall back to: a second copy is how the two drift apart. When the configuration
 * cannot be loaded the status is `'error'` and the caller offers a retry.
 *
 * @param {string|null|undefined} docTypeId the OCR doc type id (the spec name); a falsy value does nothing
 * @param {boolean} [enabled=true] set to false to skip the request (e.g. the record is not new)
 * @returns {{
 *   status: 'idle'|'loading'|'ready'|'error',
 *   config: { docType: string, toolName: string, question: string, schema: object } | null,
 *   retry: () => void,
 * }}
 */
export function useOcrConfig(docTypeId, enabled = true) {
  const apiFetch = useApiFetch('');
  const [state, setState] = useState({ status: 'idle', config: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!docTypeId || !enabled) return undefined;
    let cancelled = false;
    setState({ status: 'loading', config: null });
    (async () => {
      try {
        const res = await apiFetch(
          `${getNeoBaseUrl()}/ocrconfig?docType=${encodeURIComponent(docTypeId)}`,
          { baseUrl: '' },
        );
        const json = res.ok ? await res.json() : null;
        if (cancelled) return;
        const usable = json?.question && json?.schema && json?.toolName;
        setState(usable ? { status: 'ready', config: json } : { status: 'error', config: null });
      } catch {
        if (!cancelled) setState({ status: 'error', config: null });
      }
    })();
    return () => { cancelled = true; };
  }, [docTypeId, enabled, apiFetch, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, retry };
}
