import { useState } from 'react';
import { Check, MailCheck, X } from 'lucide-react';
import { useUI } from '@/i18n';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  PORTAL_DECISION_ERROR, PORTAL_ERROR, requestPortalDecision,
} from '@/lib/portal/portalApi.js';
import {
  PORTAL_ACCEPT_ENABLED, PORTAL_REJECT_REASONS, PORTAL_REJECT_REASON_OTHER,
} from './portalPresentation.js';

const MAX_REASON_TEXT = 2000;

/** The message a refused request shows, per API error. */
const ERROR_KEYS = Object.freeze({
  [PORTAL_DECISION_ERROR.cooldown]: 'portalDecisionCooldown',
  [PORTAL_DECISION_ERROR.noRecipient]: 'portalDecisionBlockedNoRecipient',
  [PORTAL_DECISION_ERROR.expired]: 'portalDecisionBlockedExpired',
  [PORTAL_DECISION_ERROR.notPending]: 'portalDecisionBlockedNotPending',
});

/**
 * Aceptar / Rechazar on a quotation the customer can still answer (ETP-6209 Part C, design
 * Documento / Movil-Documento).
 *
 * Shown only when the detail says `decision.canDecide`; when it cannot be decided for a reason the
 * customer can act on (no recipient, expired) the reason is shown instead. "Aceptar" is behind
 * {@link PORTAL_ACCEPT_ENABLED} (PO question Q1) and the backend's `acceptAvailable`. A request
 * never applies anything: it emails a confirmation to the main recipient of the original send, and
 * the panel then says where it went (masked).
 *
 * @param {'panel'|'bar'} variant the desktop panel's button row, or the mobile bottom bar
 */
export default function PortalDecisionActions({
  apiFetch, token, document, tenantName, onInvalid, variant = 'panel',
}) {
  const ui = useUI();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState(null);
  const [error, setError] = useState(null);

  const decision = document?.decision;
  if (!decision) return null;

  const acceptShown = PORTAL_ACCEPT_ENABLED && decision.acceptAvailable;
  const bar = variant === 'bar';

  const submit = async (payload) => {
    setBusy(true);
    setError(null);
    try {
      const result = await requestPortalDecision(apiFetch, token, document.id, payload);
      if (result.ok) {
        setSentTo(result.maskedEmail ?? '');
        setRejectOpen(false);
      } else {
        setError(ERROR_KEYS[result.error] ?? 'portalDecisionError');
      }
    } catch (err) {
      if (err?.code === PORTAL_ERROR.invalidLink) onInvalid();
      else setError('portalDecisionError');
    } finally {
      setBusy(false);
    }
  };

  if (sentTo != null) {
    return (
      <p
        role="status"
        className={cn('flex items-start gap-2 text-sm', bar ? 'rounded-xl border border-border bg-card p-4' : '')}
        data-testid="portal-decision-sent"
      >
        <MailCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <span>{ui('portalDecisionSent', { email: sentTo })}</span>
      </p>
    );
  }

  if (!decision.canDecide) {
    const key = ERROR_KEYS[decision.blockedReason];
    // Not pending any more (answered, closed): nothing to show — its status says it.
    if (!key || decision.blockedReason === PORTAL_DECISION_ERROR.notPending) return null;
    return (
      <p className="text-sm text-muted-foreground" data-testid="portal-decision-blocked">
        {ui(key, { tenantName: tenantName ?? '' })}
      </p>
    );
  }

  const buttons = (
    <div className={cn(bar ? 'grid gap-3' : 'flex flex-wrap gap-2', bar && acceptShown ? 'grid-cols-[minmax(0,1fr)_minmax(0,2fr)]' : '')}>
      <Button
        variant="outline"
        className={bar ? 'h-14 rounded-[10px]' : ''}
        onClick={() => setRejectOpen(true)}
        disabled={busy}
        data-testid="portal-decision-reject"
      >
        <X className="mr-1.5 h-4 w-4" aria-hidden="true" />{ui('portalDecisionReject')}
      </Button>
      {acceptShown ? (
        <Button
          className={bar ? 'h-14 rounded-[10px] font-semibold' : ''}
          onClick={() => submit({ decision: 'ACCEPT' })}
          disabled={busy}
          data-testid="portal-decision-accept"
        >
          <Check className="mr-1.5 h-4 w-4" aria-hidden="true" />
          {ui(bar ? 'portalDecisionAcceptQuotation' : 'portalDecisionAccept')}
        </Button>
      ) : null}
    </div>
  );

  return (
    <div
      className={cn('flex flex-col gap-2.5', bar ? 'rounded-xl border border-border bg-card p-4' : '')}
      data-testid={bar ? 'portal-decision-bar' : 'portal-decision-panel'}
    >
      {bar && acceptShown ? (
        <span className="text-center text-sm text-muted-foreground">
          {ui('portalDecisionAcceptHint', { tenantName: tenantName ?? '' })}
        </span>
      ) : null}
      {buttons}
      {error ? (
        <p className="text-sm text-destructive" role="alert" data-testid="portal-decision-error">
          {ui(error, { tenantName: tenantName ?? '' })}
        </p>
      ) : null}
      <PortalRejectModal
        open={rejectOpen}
        busy={busy}
        documentNo={document.documentNo}
        onClose={() => setRejectOpen(false)}
        onSubmit={(reasonCode, reasonText) => submit({ decision: 'REJECT', reasonCode, reasonText })}
      />
    </div>
  );
}

/**
 * The portal's reject modal: the six fixed reasons (PO spec), "Otros" with a required text. Not the
 * app's `RejectQuotationModal`, which lists and creates the tenant's reasons through NEO.
 */
function PortalRejectModal({ open, busy, documentNo, onClose, onSubmit }) {
  const ui = useUI();
  const [reason, setReason] = useState(null);
  const [text, setText] = useState('');
  const [touched, setTouched] = useState(false);
  const needsText = reason === PORTAL_REJECT_REASON_OTHER;
  const textMissing = needsText && !text.trim();
  const canSubmit = Boolean(reason) && !textMissing && !busy;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-w-md" data-testid="portal-reject-modal">
        <DialogHeader>
          <DialogTitle>{ui('portalRejectTitle')}</DialogTitle>
          <DialogDescription>{ui('portalRejectDescription', { number: documentNo ?? '' })}</DialogDescription>
        </DialogHeader>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-sm font-medium">{ui('portalRejectReasonLabel')}</legend>
          {PORTAL_REJECT_REASONS.map((option) => (
            <label
              key={option.code}
              className={cn(
                'flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm',
                reason === option.code ? 'border-primary bg-primary/5' : 'border-border',
              )}
            >
              <input
                type="radio"
                name="portal-reject-reason"
                value={option.code}
                checked={reason === option.code}
                onChange={() => setReason(option.code)}
                data-testid={`portal-reject-reason-${option.code.toLowerCase()}`}
              />
              {ui(option.labelKey)}
            </label>
          ))}
        </fieldset>
        {needsText ? (
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">{ui('portalRejectOtherLabel')}</span>
            <textarea
              value={text}
              maxLength={MAX_REASON_TEXT}
              onChange={(event) => setText(event.target.value)}
              onBlur={() => setTouched(true)}
              rows={3}
              className="rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-testid="portal-reject-other-text"
            />
            {touched && textMissing ? (
              <span className="text-xs text-destructive">{ui('portalRejectOtherRequired')}</span>
            ) : null}
          </label>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>{ui('cancel')}</Button>
          <Button
            onClick={() => onSubmit(reason, needsText ? text.trim() : null)}
            disabled={!canSubmit}
            data-testid="portal-reject-submit"
          >
            {ui('portalRejectSubmit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
