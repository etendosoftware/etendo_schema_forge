import { useMemo, useRef } from 'react';
import { toast } from 'sonner';
import { useUI } from '@/i18n';
import { describeLoadFailure } from './importActionClient.js';

/**
 * ETP-6099 — wraps an «Importar desde…» popup's `fetchDocuments` / `fetchLines` so a failed
 * candidate read is TOLD (a toast with `describeLoadFailure`: the server's refusal by its code, a
 * request with no answer by its own message, else «No se pudieron cargar los documentos») and the
 * list then shows what it shows with nothing to import: no documents / an empty document.
 *
 * The returned handlers keep their identity while `fetchDocuments` / `fetchLines` do (pass
 * module-level functions): ImportLinesModal re-reads the documents when `fetchDocuments` changes.
 * `ui` is read through a ref for the same reason.
 */
export default function useImportLoadFailureToast(fetchDocuments, fetchLines) {
  const ui = useUI();
  const uiRef = useRef(ui);
  uiRef.current = ui;
  return useMemo(() => ({
    fetchDocuments: (args) => fetchDocuments(args).catch((err) => {
      toast.error(describeLoadFailure(err, uiRef.current));
      // Both keys: the in-out popups read the target as `targetId`, the invoice ones as `invoiceId`.
      return {
        documents: [],
        sharedContext: { targetId: args?.invoiceId, invoiceId: args?.invoiceId },
        excludedByCurrency: false,
      };
    }),
    fetchLines: (args) => fetchLines(args).catch((err) => {
      toast.error(describeLoadFailure(err, uiRef.current));
      return [];
    }),
  }), [fetchDocuments, fetchLines]);
}
