import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useUI, useLocaleSwitch } from '@/i18n';
import { useBankConnectionActions } from '@/hooks/useBankConnectionActions';
import { formatCalendarDate } from '@/lib/dateOnly.js';

/**
 * ETP-6151 — the account's "Importar desde" date, read on demand from the bank-connection bridge
 * (`GET ?action=status`), for the delete confirmation of a bank-connected account.
 *
 * Read when a delete is REQUESTED (`refresh`), not once on mount: the date can be changed in
 * "Editar cuenta" while this tab stays open, and the notice must name the date that will actually
 * apply on the next sync. Nothing is fetched for an account that is not bank-connected.
 *
 * A failed read leaves the date `null`, which the notice renders as its date-less wording — the
 * warning is still true, it just cannot name the date.
 *
 * @param {string|null} accountId
 * @param {boolean} enabled whether the account is bank-connected
 * @returns {{ importFromDate: string|null, refresh: () => void }}
 */
export function useBankImportFromDate(accountId, enabled) {
  const { fetchStatus } = useBankConnectionActions();
  const [importFromDate, setImportFromDate] = useState(null);
  // Drops the answer of a read that a newer one (or an account switch) has superseded.
  const requestRef = useRef(0);

  useEffect(() => {
    requestRef.current += 1;
    setImportFromDate(null);
  }, [accountId, enabled]);

  const refresh = useCallback(() => {
    if (!enabled || !accountId || typeof fetchStatus !== 'function') return;
    requestRef.current += 1;
    const request = requestRef.current;
    Promise.resolve()
      .then(() => fetchStatus(accountId))
      .then((data) => {
        if (request === requestRef.current) setImportFromDate(data?.importFromDate || null);
      })
      .catch(() => {
        if (request === requestRef.current) setImportFromDate(null);
      });
  }, [accountId, enabled, fetchStatus]);

  return { importFromDate, refresh };
}

/**
 * ETP-6151 — the warning shown in the delete confirmation of a bank-connected account's
 * statements. The bridge re-imports whatever the bank still serves from the account's "Importar
 * desde" date onwards, and nothing records which statements were deleted, so a deleted statement
 * whose movements fall on or after that date comes back on the next sync. The way to keep them out
 * is to move the date forward, which the copy says.
 *
 * @param {{ importFromDate?: string|null, testId?: string }} props
 */
export function BankReimportNotice({ importFromDate = null, testId = 'statement-delete-bank-reimport-notice' }) {
  const ui = useUI();
  const { locale } = useLocaleSwitch();
  const date = importFromDate ? formatCalendarDate(importFromDate, locale || 'es_ES') : null;
  const text = date && date !== '—'
    ? ui('financeAccountStatementsDeleteBankReimportNotice', { date })
    : ui('financeAccountStatementsDeleteBankReimportNoticeNoDate');
  return (
    <div
      className="flex items-start gap-2 rounded-lg bg-[var(--status-warning-bg)] px-3 py-2"
      data-testid={testId}
    >
      <AlertTriangle
        className="mt-0.5 h-4 w-4 shrink-0 text-[var(--status-warning-fg)]"
        data-testid="AlertTriangle__bankreimport" />
      <p className="text-sm text-[var(--status-warning-fg)]">{text}</p>
    </div>
  );
}
