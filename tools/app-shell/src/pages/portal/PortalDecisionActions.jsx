import { useState } from 'react';
import { CheckIcon, EnvelopeSimpleOpenIcon, XIcon } from '@phosphor-icons/react';
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
 * {@link PORTAL_ACCEPT_ENABLED} (PO answer to Q1: on) and the backend's `acceptAvailable`. A request
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

  if (sentTo != null) return <DecisionSentNotice email={sentTo} bar={bar} data-testid="DecisionSentNotice__a48dad" />;
  if (!decision.canDecide) {
    return (
      <DecisionBlockedNotice
        reason={decision.blockedReason}
        tenantName={tenantName}
        data-testid="DecisionBlockedNotice__a48dad" />
    );
  }

  const buttons = (
    <DecisionButtons
      bar={bar}
      acceptShown={acceptShown}
      busy={busy}
      onReject={() => setRejectOpen(true)}
      onAccept={() => submit({ decision: 'ACCEPT' })}
      data-testid="DecisionButtons__a48dad" />
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
        data-testid="PortalRejectModal__a48dad" />
    </div>
  );
}

/**
 * The portal's reject modal: the six fixed reasons (PO spec), "Otros" with a required text. Not the
 * app's `RejectQuotationModal`, which lists and creates the tenant's reasons through NEO.
 */
/** The request left: the confirmation email went to the masked address. */
function DecisionSentNotice({ email, bar }) {
  const ui = useUI();
  return (
    <p
      role="status"
      className={cn('flex items-start gap-2 text-sm', bar ? 'rounded-xl border border-border bg-card p-4' : '')}
      data-testid="portal-decision-sent"
    >
      <EnvelopeSimpleOpenIcon
        className="mt-0.5 h-4 w-4 shrink-0 text-primary"
        aria-hidden="true"
        data-testid="MailCheck__a48dad" />
      <span>{ui('portalDecisionSent', { email })}</span>
    </p>
  );
}

/** Why the quotation cannot be answered now; nothing when it is simply no longer pending. */
function DecisionBlockedNotice({ reason, tenantName }) {
  const ui = useUI();
  const key = ERROR_KEYS[reason];
  if (!key || reason === PORTAL_DECISION_ERROR.notPending) return null;
  return (
    <p className="text-sm text-muted-foreground" data-testid="portal-decision-blocked">
      {ui(key, { tenantName: tenantName ?? '' })}
    </p>
  );
}

/** Rechazar, and Aceptar when the PO enabled it. */
function DecisionButtons({ bar, acceptShown, busy, onReject, onAccept }) {
  const ui = useUI();
  return (
    <div className={cn(bar ? 'grid gap-3' : 'flex flex-wrap gap-2', bar && acceptShown ? 'grid-cols-[minmax(0,1fr)_minmax(0,2fr)]' : '')}>
      <Button
        variant="outline"
        className={bar ? 'h-14 rounded-[10px]' : ''}
        onClick={onReject}
        disabled={busy}
        data-testid="portal-decision-reject"
      >
        <XIcon className="mr-1.5 h-4 w-4" aria-hidden="true" data-testid="X__a48dad" />{ui('portalDecisionReject')}
      </Button>
      {acceptShown ? (
        <Button
          className={bar ? 'h-14 rounded-[10px] font-semibold' : ''}
          onClick={onAccept}
          disabled={busy}
          data-testid="portal-decision-accept"
        >
          <CheckIcon className="mr-1.5 h-4 w-4" aria-hidden="true" data-testid="Check__a48dad" />
          {ui(bar ? 'portalDecisionAcceptQuotation' : 'portalDecisionAccept')}
        </Button>
      ) : null}
    </div>
  );
}

function PortalRejectModal({ open, busy, documentNo, onClose, onSubmit }) {
  const ui = useUI();
  const [reason, setReason] = useState(null);
  const [text, setText] = useState('');
  const [touched, setTouched] = useState(false);
  const needsText = reason === PORTAL_REJECT_REASON_OTHER;
  const textMissing = needsText && !text.trim();
  const canSubmit = Boolean(reason) && !textMissing && !busy;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => { if (!next) onClose(); }}
      data-testid="Dialog__a48dad">
      <DialogContent className="max-w-md" data-testid="portal-reject-modal">
        <DialogHeader data-testid="DialogHeader__a48dad">
          <DialogTitle data-testid="DialogTitle__a48dad">{ui('portalRejectTitle')}</DialogTitle>
          <DialogDescription data-testid="DialogDescription__a48dad">{ui('portalRejectDescription', { number: documentNo ?? '' })}</DialogDescription>
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
                onChange={() => {
                  setReason(option.code);
                  // The text belongs to "Otros" only: leaving it clears it, so nothing typed there
                  // can travel with another reason.
                  if (option.code !== PORTAL_REJECT_REASON_OTHER) {
                    setText('');
                    setTouched(false);
                  }
                }}
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
        <DialogFooter data-testid="DialogFooter__a48dad">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={busy}
            data-testid="Button__a48dad">{ui('cancel')}</Button>
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
