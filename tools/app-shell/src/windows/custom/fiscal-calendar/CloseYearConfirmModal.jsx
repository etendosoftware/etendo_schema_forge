import { useEffect, useState } from 'react';
import { useUI } from '@/i18n';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog.jsx';
import { readCredentialHeaders, writeHeaders } from '../../../lib/sessionHeaders.js';

const CLOSED_STATUSES = new Set(['C', 'P']);
const ACTION_BY_DIRECTION = { close: 'closeYear', undo: 'undoCloseYear' };

// This modal is rendered by fiscal-calendar's generated YearPage.jsx via the menuActions
// mechanism, so `apiBaseUrl` arrives as `api.baseUrl` (a hardcoded per-spec constant, e.g.
// "/sws/neo/fiscal-calendar") — correct for the closeYear/undoCloseYear action below, which
// really is a fiscal-calendar/year action. But the periodControl status check reads data that
// still lives on the untouched `open-close-period-control` spec (ETP-4478 rework — periodControl/
// documents were never merged into fiscal-calendar), so that fetch needs a different base:
// swap the trailing spec segment for the real one instead of reusing `apiBaseUrl` as-is.
function periodControlApiBase(apiBaseUrl) {
  return `${apiBaseUrl.replace(/\/[^/]*$/, '')}/open-close-period-control`;
}

// periodControl's LIST endpoint goes through NEO's generic DefaultJsonDataService (classic
// Openbravo datasource), which does NOT support arbitrary `fieldName=value` query params — a
// plain `?year=<id>` is silently ignored and returns ALL periods across every year unfiltered
// (confirmed live). The classic Openbravo `criteria` JSON-array param is the real mechanism.
function yearCriteria(yearId) {
  return `criteria=${encodeURIComponent(JSON.stringify([{ fieldName: 'year', operator: 'equals', value: yearId }]))}`;
}

export default function CloseYearConfirmModal({ direction, isOpen, currentRecord, token, apiBaseUrl, onClose, onSaved }) {
  const ui = useUI();
  const [allClosed, setAllClosed] = useState(false);
  const [precheckError, setPrecheckError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);

  useEffect(() => {
    if (!isOpen || !currentRecord?.id) return;
    setPrecheckError(false);
    fetch(`${periodControlApiBase(apiBaseUrl)}/periodControl?${yearCriteria(currentRecord.id)}`, {
      headers: readCredentialHeaders(),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        return res.json();
      })
      .then((body) => {
        // periodControl's LIST wraps rows as { response: { data: [...] } } (classic NEO
        // DefaultJsonDataService envelope), not a flat { data: [...] } — matches
        // useEntity.js's exact fallback pattern.
        const periods = body?.response?.data ?? (Array.isArray(body) ? body : []);
        setAllClosed(periods.length > 0 && periods.every((p) => CLOSED_STATUSES.has(p.status)));
      })
      .catch(() => {
        // Fail safe: an unreachable status check must never leave the confirm button
        // looking enabled — keep it disabled and surface the error instead.
        setAllClosed(false);
        setPrecheckError(true);
      });
  }, [isOpen, currentRecord?.id, apiBaseUrl, token]);

  const handleConfirm = async () => {
    setSubmitting(true);
    setSubmitError(false);
    try {
      const action = ACTION_BY_DIRECTION[direction];
      const res = await fetch(`${apiBaseUrl}/year/${currentRecord.id}/action/${action}`, {
        method: 'POST',
        headers: writeHeaders(),
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      onSaved?.();
      onClose?.();
    } catch {
      // A failed close/undo-close must never look like a success — keep the modal
      // open and show an error instead of calling onSaved/onClose.
      setSubmitError(true);
    } finally {
      setSubmitting(false);
    }
  };

  const titleKey = direction === 'close' ? 'closeYearTitle' : 'undoCloseYearTitle';
  const bodyKey = direction === 'close' ? 'closeYearBody' : 'undoCloseYearBody';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose?.()} data-testid="Dialog__closeyear">
      <DialogContent className="max-w-sm" data-testid="close-year-modal">
        <DialogHeader data-testid="DialogHeader__closeyear">
          <DialogTitle data-testid="DialogTitle__closeyear">{ui(titleKey)}</DialogTitle>
        </DialogHeader>
        <p className="text-sm" data-testid="close-year-body">{ui(bodyKey)}</p>
        {precheckError && (
          <p className="text-sm text-destructive" data-testid="close-year-precheck-error">{ui('genericError')}</p>
        )}
        {submitError && (
          <p className="text-sm text-destructive" data-testid="close-year-submit-error">{ui('genericError')}</p>
        )}
        <DialogFooter className="gap-2 pt-2" data-testid="DialogFooter__closeyear">
          <button type="button" data-testid="close-year-cancel" onClick={onClose}>{ui('cancel')}</button>
          <button
            type="button"
            data-testid="close-year-confirm"
            disabled={!allClosed || submitting}
            onClick={handleConfirm}
          >
            {ui(titleKey)}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
