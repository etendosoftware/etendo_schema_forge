import {
  EnvelopeSimpleOpenIcon,
  CheckCircleIcon,
  CheckIcon,
  EnvelopeOpenIcon,
  EnvelopeSimpleIcon,
  XIcon,
} from '@phosphor-icons/react';
import { useState } from 'react';

import * as DialogPrimitive from '@radix-ui/react-dialog';

import { useUI } from '@/i18n';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { DialogOverlay, DialogPortal } from '@/components/ui/dialog';
import {
  PORTAL_DECISION_ERROR, PORTAL_ERROR, requestPortalDecision,
} from '@/lib/portal/portalApi.js';
import {
  PORTAL_ACCEPT_ENABLED, PORTAL_REJECT_REASONS, PORTAL_REJECT_REASON_OTHER,
} from './portalPresentation.js';
import {
  PORTAL_FIGMA_BUTTON_PRIMARY, PORTAL_FIGMA_BUTTON_SECONDARY, PORTAL_FIGMA_SHADOW,
} from './PortalBits.jsx';

const MAX_REASON_TEXT = 2000;

/** The message a refused request shows, per API error. */
const ERROR_KEYS = Object.freeze({
  [PORTAL_DECISION_ERROR.cooldown]: 'portalDecisionCooldown',
  [PORTAL_DECISION_ERROR.noRecipient]: 'portalDecisionBlockedNoRecipient',
  [PORTAL_DECISION_ERROR.expired]: 'portalDecisionBlockedExpired',
  [PORTAL_DECISION_ERROR.notPending]: 'portalDecisionBlockedNotPending',
});

/** The popup open at each step of a decision (Figma "Confirmar Presupuesto" … "Validacion"). */
const STEP = Object.freeze({
  acceptConfirm: 'acceptConfirm',
  rejectReasons: 'rejectReasons',
  rejectConfirm: 'rejectConfirm',
  sent: 'sent',
});

/**
 * Aceptar / Rechazar on a quotation the customer can still answer (ETP-6209 Part C; the popups as
 * the designer's Figma draws them, 2026-11-17).
 *
 * Shown only when the detail says `decision.canDecide` (pending and not expired); when it cannot be
 * decided for a reason the customer can act on (no recipient, expired) the reason is shown instead.
 * "Aceptar" is behind {@link PORTAL_ACCEPT_ENABLED} (PO answer to Q1: on) and the backend's
 * `acceptAvailable`.
 *
 * Every decision is asked for in popups before anything leaves:
 * - Aceptar → "¿Deseas aceptar este presupuesto?" (where the confirmation goes) → Continuar sends;
 * - Rechazar → the six reasons ("Otros" needs a text; Continuar stays disabled without it) →
 *   "Confirma tu decisión por correo" (Cancelar / Volver / Enviar solicitud) sends.
 * The request never applies anything: it emails a confirmation to the first To of the original send.
 * Its answer opens "Revisa tu correo electrónico"; once closed ("Entendido") the panel keeps saying
 * where the email went. A refused request closes the popup and says why next to the buttons.
 *
 * @param {'panel'|'bar'|'inline'} variant the panel's button row, the mobile bottom bar, or
 *   `inline`: the desktop side panel — Aceptar, Rechazar as the Figma's 32px buttons, laid out as
 *   items of the caller's own wrapping row (the caller adds "Descargar PDF" after them); notices
 *   and errors take a full line at the end of that row.
 */
export default function PortalDecisionActions({
  apiFetch, token, document, tenantName, onInvalid, variant = 'panel',
}) {
  const ui = useUI();
  const [step, setStep] = useState(null);
  const [reason, setReason] = useState(null);
  const [reasonText, setReasonText] = useState('');
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState(null);
  const [error, setError] = useState(null);

  const decision = document?.decision;
  if (!decision) return null;

  const acceptShown = PORTAL_ACCEPT_ENABLED && decision.acceptAvailable;
  const bar = variant === 'bar';
  const inline = variant === 'inline';
  // As items of the caller's wrapping row, a notice takes a whole line after the buttons.
  const noticeClass = inline ? 'order-last basis-full' : '';
  const close = () => setStep(null);
  // Where the confirmation goes: the backend names the first To of the original send, in full.
  const recipient = decision.email;

  const submit = async (payload) => {
    setBusy(true);
    setError(null);
    try {
      const result = await requestPortalDecision(apiFetch, token, document.id, payload);
      if (result.ok) {
        setSentTo(result.email ?? recipient ?? '');
        setStep(STEP.sent);
      } else {
        setStep(null);
        setError(ERROR_KEYS[result.error] ?? 'portalDecisionError');
      }
    } catch (err) {
      setStep(null);
      if (err?.code === PORTAL_ERROR.invalidLink) onInvalid();
      else setError('portalDecisionError');
    } finally {
      setBusy(false);
    }
  };

  const dialogs = (
    <>
      <AcceptConfirmDialog
        open={step === STEP.acceptConfirm}
        busy={busy}
        email={recipient}
        onClose={close}
        onContinue={() => submit({ decision: 'ACCEPT' })}
        data-testid="AcceptConfirmDialog__a48dad" />
      <RejectReasonsDialog
        open={step === STEP.rejectReasons}
        reason={reason}
        text={reasonText}
        onReason={(code) => {
          setReason(code);
          // The text belongs to "Otros" only: leaving it clears it, so nothing typed there can
          // travel with another reason.
          if (code !== PORTAL_REJECT_REASON_OTHER) setReasonText('');
        }}
        onText={setReasonText}
        onClose={close}
        onContinue={() => setStep(STEP.rejectConfirm)}
        data-testid="RejectReasonsDialog__a48dad" />
      <RejectConfirmDialog
        open={step === STEP.rejectConfirm}
        busy={busy}
        email={recipient}
        onClose={close}
        onBack={() => setStep(STEP.rejectReasons)}
        onSend={() => submit({
          decision: 'REJECT',
          reasonCode: reason,
          reasonText: reason === PORTAL_REJECT_REASON_OTHER ? reasonText.trim() : null,
        })}
        data-testid="RejectConfirmDialog__a48dad" />
      <CheckEmailDialog
        open={step === STEP.sent}
        email={sentTo ?? ''}
        onClose={close}
        data-testid="CheckEmailDialog__a48dad" />
    </>
  );

  if (sentTo != null) {
    return (
      <>
        <DecisionSentNotice email={sentTo} bar={bar} className={noticeClass} data-testid="DecisionSentNotice__a48dad" />
        {dialogs}
      </>
    );
  }
  if (!decision.canDecide) {
    return (
      <DecisionBlockedNotice
        reason={decision.blockedReason}
        tenantName={tenantName}
        className={noticeClass}
        data-testid="DecisionBlockedNotice__a48dad" />
    );
  }

  const openReject = () => { setError(null); setStep(STEP.rejectReasons); };
  const openAccept = () => { setError(null); setStep(STEP.acceptConfirm); };

  return (
    <div
      className={cn(inline ? 'contents' : 'flex flex-col gap-2.5', bar ? 'rounded-xl border border-border bg-card p-4' : '')}
      data-testid={bar ? 'portal-decision-bar' : 'portal-decision-panel'}
    >
      {bar && acceptShown ? (
        <span className="text-center text-sm text-muted-foreground">
          {ui('portalDecisionAcceptHint', { tenantName: tenantName ?? '' })}
        </span>
      ) : null}
      {inline ? (
        <InlineDecisionButtons
          acceptShown={acceptShown}
          busy={busy}
          onReject={openReject}
          onAccept={openAccept}
          data-testid="InlineDecisionButtons__a48dad" />
      ) : (
        <DecisionButtons
          bar={bar}
          acceptShown={acceptShown}
          busy={busy}
          onReject={openReject}
          onAccept={openAccept}
          data-testid="DecisionButtons__a48dad" />
      )}
      {error ? (
        <p className={cn('text-sm text-destructive', noticeClass)} role="alert" data-testid="portal-decision-error">
          {ui(error, { tenantName: tenantName ?? '' })}
        </p>
      ) : null}
      {dialogs}
    </div>
  );
}

/** The request left: the confirmation email went to this address. */
function DecisionSentNotice({ email, bar, className }) {
  const ui = useUI();
  return (
    <p
      role="status"
      className={cn('flex items-start gap-2 text-sm', bar ? 'rounded-xl border border-border bg-card p-4' : '', className)}
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
function DecisionBlockedNotice({ reason, tenantName, className }) {
  const ui = useUI();
  const key = ERROR_KEYS[reason];
  if (!key || reason === PORTAL_DECISION_ERROR.notPending) return null;
  return (
    <p className={cn('text-sm text-muted-foreground', className)} data-testid="portal-decision-blocked">
      {ui(key, { tenantName: tenantName ?? '' })}
    </p>
  );
}

/** The Figma side panel's buttons: Aceptar (primary) first, then Rechazar. */
function InlineDecisionButtons({ acceptShown, busy, onReject, onAccept }) {
  const ui = useUI();
  return (
    <>
      {acceptShown ? (
        <button type="button" className={PORTAL_FIGMA_BUTTON_PRIMARY} onClick={onAccept} disabled={busy} data-testid="portal-decision-accept">
          <CheckIcon size={20} aria-hidden="true" data-testid="Check__a48dad" />
          <span className="px-1">{ui('portalDecisionAccept')}</span>
        </button>
      ) : null}
      <button type="button" className={PORTAL_FIGMA_BUTTON_SECONDARY} onClick={onReject} disabled={busy} data-testid="portal-decision-reject">
        <XIcon size={20} className="text-[#81848F]" aria-hidden="true" data-testid="X__a48dad" />
        <span className="px-1">{ui('portalDecisionReject')}</span>
      </button>
    </>
  );
}

/** Rechazar, and Aceptar when the PO enabled it (the panel row and the mobile bar). */
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

/* ─── The Figma popups ──────────────────────────────────────────────────────────────────────── */

/** Figma "Overlay/Light" shadow. */
const MODAL_SHADOW = 'shadow-[0_0_0_1px_rgba(27,26,31,0.1),0_24px_48px_rgba(27,26,31,0.03),0_10px_18px_rgba(27,26,31,0.03),0_5px_8px_rgba(27,26,31,0.04),0_2px_4px_rgba(27,26,31,0.04)]';

/** The popups' 40px fully rounded buttons (padding 8px 12px, label 14/24 500 with 0 8px). */
const MODAL_BUTTON = 'inline-flex h-10 items-center justify-center rounded-full px-3 py-2 text-sm font-medium leading-6 transition-colors disabled:pointer-events-none';
/** The app's outline button hover (`components/ui/button`); the label keeps the Figma's colour. */
const MODAL_NEUTRAL_HOVER = 'hover:bg-accent';
const MODAL_SECONDARY = `${MODAL_BUTTON} border border-[#C7CBD3] bg-white text-[#1B1A1F] ${MODAL_NEUTRAL_HOVER} ${PORTAL_FIGMA_SHADOW}`;
const MODAL_PRIMARY = `${MODAL_BUTTON} bg-[#325CFF] text-white hover:bg-[#2849CC] disabled:opacity-50`;
const MODAL_DANGER = `${MODAL_BUTTON} bg-[#F53D6B] text-white hover:bg-[#D50B3E] disabled:bg-[#FBB1C4]`;
const MODAL_GHOST = `${MODAL_BUTTON} text-[#1B1A1F] ${MODAL_NEUTRAL_HOVER}`;

/** A popup button's label (the Figma's inner 0 8px padding). */
function ButtonLabel({ children }) {
  return <span className="px-2">{children}</span>;
}

/**
 * The Figma's common modal: 456px, white, r8, padding 8px 0 with 8px gaps, the "Overlay/Light"
 * shadow and a 32px round close button 4px from the top right. Escape, the backdrop and the X close.
 */
function PortalModal({ open, onClose, testId, children }) {
  const ui = useUI();
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogPortal data-testid="DialogPortal__a48dad">
        <DialogOverlay data-testid="DialogOverlay__a48dad" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={`fixed left-1/2 top-1/2 z-50 flex w-[456px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-2 rounded-lg bg-white py-2 outline-none ${MODAL_SHADOW}`}
          data-testid={testId}
        >
          {children}
          <DialogPrimitive.Close
            aria-label={ui('close')}
            className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-full text-[#81848F] hover:bg-[#F3F5F9]"
          >
            <XIcon size={20} aria-hidden="true" data-testid="X__a48dad" />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPortal>
    </DialogPrimitive.Root>
  );
}

const BUBBLE_TONES = Object.freeze({
  success: 'bg-[#EEFBF4] text-[#1E874C]',
  neutral: 'bg-[#F3F5F9] text-[#81848F]',
  danger: 'bg-[#FEF0F4] text-[#D50B3E]',
});

/** A modal header: centred with its 52px icon bubble, or left-aligned (the reasons step). */
function ModalHeader({ Icon, tone, title, children }) {
  const centred = Boolean(Icon);
  return (
    <div className={cn('flex flex-col gap-1 px-7 py-3', centred ? 'items-center text-center' : 'items-start text-left')}>
      {centred ? (
        <span className={cn('mb-1 flex h-[52px] w-[52px] items-center justify-center rounded-full p-[10.4px]', BUBBLE_TONES[tone])}>
          <Icon size={26} aria-hidden="true" data-testid="Icon__a48dad" />
        </span>
      ) : null}
      <DialogPrimitive.Title className="text-xl font-semibold leading-7 tracking-[-0.005em] text-[#1B1A1F]">
        {title}
      </DialogPrimitive.Title>
      <p className="text-sm leading-5 text-[#282833]">{children}</p>
    </div>
  );
}

/** "Correo de confirmación" and the recipient: the 64px grey box of the Figma. */
function ConfirmationEmail({ email }) {
  const ui = useUI();
  if (!email) return null;
  return (
    <div className="flex h-16 items-center gap-3 rounded-lg bg-[#F3F5F9] px-5 py-3" data-testid="portal-decision-email">
      <EnvelopeSimpleIcon size={24} className="shrink-0 text-[#81848F]" aria-hidden="true" data-testid="EnvelopeSimple__a48dad" />
      <span className="flex min-w-0 flex-col">
        <span className="text-xs leading-4 text-[#555B6D]">{ui('portalConfirmationEmailLabel')}</span>
        <span className="truncate text-base font-semibold leading-6 text-[#1B1A1F]">{email}</span>
      </span>
    </div>
  );
}

/** The 12/20 #555B6D note under a body. */
function ModalNote({ children }) {
  return <p className="text-xs leading-5 text-[#555B6D]">{children}</p>;
}

/** (1) "¿Deseas aceptar este presupuesto?" — Cancelar / Continuar (sends). */
function AcceptConfirmDialog({ open, busy, email, onClose, onContinue }) {
  const ui = useUI();
  return (
    <PortalModal open={open} onClose={onClose} testId="portal-accept-modal" data-testid="PortalModal__a48dad">
      <ModalHeader Icon={CheckCircleIcon} tone="success" title={ui('portalAcceptConfirmTitle')} data-testid="ModalHeader__a48dad">
        {ui('portalAcceptConfirmDescription')}
      </ModalHeader>
      <div className="flex flex-col gap-3 px-7 pb-3">
        <ConfirmationEmail email={email} data-testid="ConfirmationEmail__a48dad" />
        <ModalNote data-testid="ModalNote__a48dad">{ui('portalDecisionFinalHint')}</ModalNote>
      </div>
      <div className="flex items-center justify-between gap-3 px-7 py-3">
        <button type="button" className={MODAL_SECONDARY} onClick={onClose} disabled={busy} data-testid="portal-accept-cancel">
          <ButtonLabel data-testid="ButtonLabel__a48dad">{ui('cancel')}</ButtonLabel>
        </button>
        <button type="button" className={MODAL_PRIMARY} onClick={onContinue} disabled={busy} data-testid="portal-accept-continue">
          <ButtonLabel data-testid="ButtonLabel__a48dad">{ui('continue')}</ButtonLabel>
        </button>
      </div>
    </PortalModal>
  );
}

/** The Figma radio: a 24px box with a 14.5px circle (selected: blue ring and an 8px blue dot). */
function ReasonRadio({ checked, name, value, onChange, label, testId }) {
  return (
    <label className="flex h-6 cursor-pointer items-center gap-3 text-sm leading-6 text-[#1B1A1F]">
      <span className="relative flex h-6 w-6 shrink-0 items-center justify-center">
        <input
          type="radio"
          name={name}
          value={value}
          checked={checked}
          onChange={onChange}
          className="peer absolute inset-0 cursor-pointer opacity-0"
          data-testid={testId}
        />
        {/* Ring and dot are ONE element, so they share one centre by construction: the Figma's 14.5px
            ring with its 1.5px border, and the 8px dot painted as a radial gradient from that same
            centre. Two nested boxes (a 14.5px ring holding an 8px dot) put the dot 1.75px from the
            ring's inner edge, a fraction each side rounds differently, and it read off-centre. */}
        <span
          className={cn(
            'box-border block h-[14.5px] w-[14.5px] rounded-full border-[1.5px] bg-white peer-focus-visible:ring-2 peer-focus-visible:ring-ring',
            checked
              ? 'border-[#325CFF] [background-image:radial-gradient(circle_at_center,#325CFF_4px,transparent_4.5px)]'
              : `border-[#C7CBD3] ${PORTAL_FIGMA_SHADOW}`,
          )}
          aria-hidden="true"
          data-testid="portal-reject-radio-mark"
        />
      </span>
      {label}
    </label>
  );
}

/**
 * (3)/(4) "Rechazar presupuesto": the six fixed reasons (PO spec); "Otros" shows the required
 * "Describe el motivo" text. Not the app's `RejectQuotationModal`, which lists and creates the
 * tenant's reasons through NEO. Continuar stays disabled until a reason is chosen and, for
 * "Otros", the text is written.
 */
function RejectReasonsDialog({ open, reason, text, onReason, onText, onClose, onContinue }) {
  const ui = useUI();
  const [touched, setTouched] = useState(false);
  const needsText = reason === PORTAL_REJECT_REASON_OTHER;
  const textMissing = needsText && !text.trim();
  const canContinue = Boolean(reason) && !textMissing;

  return (
    <PortalModal open={open} onClose={onClose} testId="portal-reject-modal" data-testid="PortalModal__a48dad">
      <ModalHeader title={ui('portalRejectTitle')} data-testid="ModalHeader__a48dad">
        {ui('portalRejectDescription')}
      </ModalHeader>
      <div className="flex flex-col gap-3 px-7 pb-3">
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">{ui('portalRejectReasonLabel')}</legend>
          {PORTAL_REJECT_REASONS.map((option) => (
            <ReasonRadio
              key={option.code}
              name="portal-reject-reason"
              value={option.code}
              checked={reason === option.code}
              onChange={() => {
                onReason(option.code);
                if (option.code !== PORTAL_REJECT_REASON_OTHER) setTouched(false);
              }}
              label={ui(option.labelKey)}
              testId={`portal-reject-reason-${option.code.toLowerCase()}`}
              data-testid="ReasonRadio__a48dad" />
          ))}
        </fieldset>
        {needsText ? (
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium leading-6 text-[#1B1A1F]">
              {ui('portalRejectOtherLabel')} <span className="text-[#F53D6B]" aria-hidden="true">*</span>
            </span>
            <textarea
              value={text}
              maxLength={MAX_REASON_TEXT}
              required
              placeholder={ui('portalRejectOtherPlaceholder')}
              onChange={(event) => onText(event.target.value)}
              onBlur={() => setTouched(true)}
              className={`h-[104px] w-full resize-none rounded-lg border border-[#C7CBD3] bg-white px-4 py-2 text-sm leading-6 text-[#1B1A1F] outline-none placeholder:text-[#6B7280] focus-visible:ring-2 focus-visible:ring-ring ${PORTAL_FIGMA_SHADOW}`}
              data-testid="portal-reject-other-text"
            />
            {touched && textMissing ? (
              <span className="text-xs text-[#D50B3E]">{ui('portalRejectOtherRequired')}</span>
            ) : null}
          </label>
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-3 px-7 py-3">
        <button type="button" className={MODAL_SECONDARY} onClick={onClose} data-testid="portal-reject-cancel">
          <ButtonLabel data-testid="ButtonLabel__a48dad">{ui('cancel')}</ButtonLabel>
        </button>
        <button type="button" className={MODAL_DANGER} onClick={onContinue} disabled={!canContinue} data-testid="portal-reject-continue">
          <ButtonLabel data-testid="ButtonLabel__a48dad">{ui('continue')}</ButtonLabel>
        </button>
      </div>
    </PortalModal>
  );
}

/** (5) "Confirma tu decisión por correo" — Cancelar | Volver · Enviar solicitud (sends). */
function RejectConfirmDialog({ open, busy, email, onClose, onBack, onSend }) {
  const ui = useUI();
  return (
    <PortalModal open={open} onClose={onClose} testId="portal-reject-confirm-modal" data-testid="PortalModal__a48dad">
      <ModalHeader Icon={EnvelopeSimpleIcon} tone="danger" title={ui('portalRejectConfirmTitle')} data-testid="ModalHeader__a48dad">
        {ui('portalRejectConfirmDescription')}
      </ModalHeader>
      <div className="flex flex-col gap-3 px-7 pb-3">
        <ConfirmationEmail email={email} data-testid="ConfirmationEmail__a48dad" />
        <ModalNote data-testid="ModalNote__a48dad">{ui('portalDecisionFinalHint')}</ModalNote>
      </div>
      <div className="flex items-center justify-between gap-3 px-7 py-3">
        <button type="button" className={MODAL_SECONDARY} onClick={onClose} disabled={busy} data-testid="portal-reject-confirm-cancel">
          <ButtonLabel data-testid="ButtonLabel__a48dad">{ui('cancel')}</ButtonLabel>
        </button>
        <span className="flex items-center gap-2">
          <button type="button" className={MODAL_GHOST} onClick={onBack} disabled={busy} data-testid="portal-reject-back">
            <ButtonLabel data-testid="ButtonLabel__a48dad">{ui('goBack')}</ButtonLabel>
          </button>
          <button type="button" className={MODAL_DANGER} onClick={onSend} disabled={busy} data-testid="portal-reject-submit">
            <ButtonLabel data-testid="ButtonLabel__a48dad">{ui('portalSendRequest')}</ButtonLabel>
          </button>
        </span>
      </div>
    </PortalModal>
  );
}

/** A sentence with `{email}` set in bold, as the Figma's "Revisa tu correo electrónico" shows it. */
function WithBoldEmail({ text, email }) {
  const marker = '\u0000';
  const [before, after = ''] = text.replace(email, marker).split(marker);
  if (!email || !text.includes(email)) return text;
  return <>{before}<b className="font-semibold">{email}</b>{after}</>;
}

/** (2) "Revisa tu correo electrónico" — the request left; "Entendido" closes. */
function CheckEmailDialog({ open, email, onClose }) {
  const ui = useUI();
  return (
    <PortalModal open={open} onClose={onClose} testId="portal-check-email-modal" data-testid="PortalModal__a48dad">
      <ModalHeader Icon={EnvelopeOpenIcon} tone="neutral" title={ui('portalCheckEmailTitle')} data-testid="ModalHeader__a48dad">
        <WithBoldEmail text={ui('portalCheckEmailDescription', { email })} email={email} data-testid="WithBoldEmail__a48dad" />
      </ModalHeader>
      <div className="flex flex-col gap-3 px-7 pb-3">
        <ModalNote data-testid="ModalNote__a48dad">{ui('portalCheckEmailHint')}</ModalNote>
      </div>
      <div className="flex px-7 py-3">
        <button type="button" className={cn(MODAL_PRIMARY, 'w-full')} onClick={onClose} data-testid="portal-check-email-ok">
          <ButtonLabel data-testid="ButtonLabel__a48dad">{ui('portalUnderstood')}</ButtonLabel>
        </button>
      </div>
    </PortalModal>
  );
}
