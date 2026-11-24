import { useEffect, useMemo, useRef, useState } from 'react';
import { InfoIcon, WarningCircleIcon, WarningIcon, XIcon } from '@phosphor-icons/react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog.jsx';
import { DateTimeField } from '@/components/ui/date-time-field';
import { splitWallClock, joinWallClock } from '@/components/ui/date-time-field-model.js';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { FIELD_HEIGHT } from '@/components/ui/formDensity';
import { Field, MaskedAmountInput } from '@/components/forms/fields.jsx';
import { CreatableSearchSelect } from '@/components/contract-ui/CreatableSearchSelect.jsx';
import { parseLocaleNumber } from '@/lib/parseLocaleNumber.js';
import { extractErrorMessage } from '@/hooks/useEntity.js';
import { OriginBadge } from './ConversionRateBadges.jsx';
import { formatRate } from './conversionRatesFormat.js';
import {
  fetchManualCurrencyOptions, fetchServerClock, previewManualRate,
  createManualCurrency, createManualRate, updateManualRate,
} from './conversionRatesApi.js';
import {
  formatWallClock, nowWallClock,
  isOpenEnded, displayValidTo, addMillisToWallClock, isAfterWallClock,
} from './conversionRatesModel.js';

/** Debounce of the preview request while the user types. */
export const PREVIEW_DEBOUNCE_MS = 350;


/**
 * The dialog modes:
 * - `newCurrency` — "Nueva divisa": the destination is picked among the active currencies that
 *   have no rates yet (`manualCurrencyOptions {withoutRates: true}`);
 * - `newRate` — "Nueva tasa · CHF": the destination is fixed (a manual card or group header);
 * - `edit` — "Modificar tasa · CHF": the RATE of a manual row only (any state), through action
 *   `updateManualRate`; the range is read-only (change it by deleting the rate and creating a new
 *   one). Saving asks for confirmation in a second dialog.
 */
export const DIALOG_MODES = Object.freeze({ NEW_CURRENCY: 'newCurrency', NEW_RATE: 'newRate', EDIT: 'edit' });

/** The start as `yyyy-MM-ddTHH:mm:00`, or null while the DateTimeField holds no valid value. */
export function normalizeValidFrom(value) {
  const parts = splitWallClock(value);
  return parts ? joinWallClock(parts.date, parts.time) : null;
}

/** The rate typed by the user, or null when empty / not a positive number. */
export function parseRateInput(text) {
  const { value, isValid } = parseLocaleNumber(text);
  return isValid && value != null && value > 0 ? value : null;
}

/**
 * Initial form. A new rate starts at `now` — the SERVER's minute (`serverClock`) once it is
 * known; the browser's minute is only the fallback while it loads or when it cannot be read.
 */
function initialState(mode, row, now = nowWallClock()) {
  if (mode === DIALOG_MODES.EDIT && row) {
    return {
      rateText: row.multipleRateBy == null ? '' : String(row.multipleRateBy),
      validFrom: row.validFromDate ?? '',
    };
  }
  return { rateText: '', validFrom: now };
}

/** Message keys whose refusal belongs to "Válido desde" when the answer names no field. */
const START_FIELD_ERROR_KEYS = ['ETGO_ConvRateOverlap', 'ETGO_ConvRateFutureStart', 'ETGO_ConvRateInvalidValidFrom'];

/**
 * The field a refusal belongs to (`toCurrency` | `multipleRateBy` | `validFromDate`), or null:
 * `errorField` of a `previewManualRate` answer, `field` of a write's `error` body, or — when
 * neither is present — `validFromDate` for one of {@link START_FIELD_ERROR_KEYS} in `errorKey` /
 * `messageKeys`.
 */
export function refusedField(answer) {
  if (!answer || typeof answer !== 'object') return null;
  const named = answer.errorField ?? answer.field;
  if (named) return named;
  const keys = [answer.errorKey, ...(Array.isArray(answer.messageKeys) ? answer.messageKeys : [])];
  return keys.some((k) => START_FIELD_ERROR_KEYS.includes(k)) ? 'validFromDate' : null;
}

/**
 * Whether a keydown is an Enter that submits the dialog's form: a plain Enter (no modifier, not
 * composing) on an input of the form itself. An input whose list is open (`aria-expanded="true"`,
 * the destination picker) keeps its Enter, and so does anything rendered outside the form's DOM
 * (the DateTimeField calendar popover, a select's portal list) — React bubbles those events
 * through the form, the DOM does not.
 */
export function isEnterSubmitKey(event, form) {
  if (event?.key !== 'Enter' || event.nativeEvent?.isComposing) return false;
  if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return false;
  const target = event.target;
  if (!form || !target || !form.contains(target) || target.tagName !== 'INPUT') return false;
  return target.getAttribute('aria-expanded') !== 'true';
}

function PreviewLine({ item, ui }) {
  const range = isOpenEnded(item.validTo)
    ? ui('convRatePreviewOpenRange', { from: formatWallClock(item.validFrom) })
    : ui('convRatePreviewClosedRange', { from: formatWallClock(item.validFrom), to: formatWallClock(item.validTo) });
  return <div>{`${item.fromIso} → ${item.toIso} · ${formatRate(item.rate)} · ${range}`}</div>;
}

/** Summary box: the two rates that will be created and the open range they close. */
function PreviewSummary({ preview, mode, destIso, orgIso, ui }) {
  if (!preview?.creates?.length) return null;
  const closes = preview.closes ?? [];
  const forwardClose = closes.find((c) => c.fromIso === orgIso) ?? closes[0];
  return (
    <div className="flex flex-col gap-1.5 rounded-[10px] bg-muted/60 px-3.5 py-3 text-[13px]" data-testid="convrate-dialog-summary">
      <div className="font-semibold">
        {mode === DIALOG_MODES.NEW_CURRENCY
          ? ui('convRatePreviewNewCurrencyTitle', { currency: destIso })
          : ui('convRatePreviewNewRateTitle')}
      </div>
      {preview.creates.map((item) => (
        <PreviewLine
          key={`${item.fromIso}-${item.toIso}`}
          item={item}
          ui={ui}
          data-testid="PreviewLine__51f9a2" />
      ))}
      {forwardClose && (
        <div className="text-muted-foreground" data-testid="convrate-dialog-summary-close">
          {ui('convRatePreviewCloses', {
            currency: destIso,
            from: formatWallClock(forwardClose.validFrom),
            to: formatWallClock(forwardClose.newValidTo),
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Old → new of both directions, from the server's `updateManualRate` proposal (never computed in
 * the browser). While the proposal for the typed rate is loading, the forward line shows the
 * typed rate and the inverse an ellipsis.
 */
export function editLines(row, rate, proposal) {
  const forward = proposal?.forward;
  const inverse = proposal?.inverse;
  return {
    forwardOld: formatRate(forward?.old ?? row.multipleRateBy),
    forwardNew: formatRate(forward?.new ?? rate ?? row.multipleRateBy),
    inverseOld: formatRate(inverse?.old ?? row.divideRateBy),
    inverseNew: inverse?.new != null ? formatRate(inverse.new) : '…',
  };
}

/** Edit summary: both directions, old value → new value. */
function EditSummary({ lines, destIso, orgIso, ui }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-[10px] bg-muted/60 px-3.5 py-3 text-[13px]" data-testid="convrate-dialog-summary">
      <div className="font-semibold">{ui('convRateEditSummaryTitle')}</div>
      <div data-testid="convrate-dialog-summary-forward">
        {`${orgIso} → ${destIso} · ${lines.forwardOld} → ${lines.forwardNew}`}
      </div>
      <div data-testid="convrate-dialog-summary-inverse">
        {`${destIso} → ${orgIso} · ${lines.inverseOld} → ${lines.inverseNew}`}
      </div>
    </div>
  );
}

/**
 * "¿Confirma el cambio de tasa?" — the second step of Modificar (design PopupEditarConfirmar):
 * an alert dialog over the edit dialog. "Volver" returns to the edit dialog with its values;
 * "Confirmar cambio" is the only action that saves.
 */
function ConfirmRateChangeDialog({ open, lines, row, destIso, orgIso, saving, onBack, onConfirm, ui }) {
  const period = row && !isOpenEnded(row.validToDate)
    ? ui('convRateConfirmPeriodClosed', { from: formatWallClock(row.validFromDate), to: displayValidTo(row) })
    : ui('convRateConfirmPeriodOpen', { from: formatWallClock(row?.validFromDate) });
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !saving) onBack(); }} data-testid="Dialog__convrate-confirm">
      <DialogContent
        role="alertdialog"
        className="flex w-[460px] max-w-[calc(100vw-32px)] flex-col gap-0 rounded-[14px] border-0 bg-card p-0 [&>button]:hidden"
        aria-busy={saving || undefined}
        data-testid="convrate-confirm-dialog">
        <div className="flex items-start gap-3.5 px-[22px] pb-2 pt-[22px]">
          <span
            aria-hidden="true"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
            style={{ background: '#FFF6E5', color: '#B45309' }}>
            <WarningIcon className="h-5 w-5" data-testid="WarningIcon__convrate" />
          </span>
          <div>
            <DialogTitle className="mb-2 text-[17px] font-semibold" data-testid="convrate-confirm-title">
              {ui('convRateConfirmTitle')}
            </DialogTitle>
            <DialogDescription asChild data-testid="DialogDescription__convrate-confirm">
              <div className="flex flex-col gap-2.5 leading-normal text-foreground/80">
                <div className="rounded-[10px] bg-muted/60 px-3 py-2.5 text-[13px] text-foreground" data-testid="convrate-confirm-summary">
                  <div>{`${orgIso} → ${destIso} · ${lines.forwardOld} → `}<b className="font-semibold">{lines.forwardNew}</b></div>
                  <div>{`${destIso} → ${orgIso} · ${lines.inverseOld} → `}<b className="font-semibold">{lines.inverseNew}</b></div>
                  <div className="mt-1 text-muted-foreground" data-testid="convrate-confirm-period">{period}</div>
                </div>
                <p className="m-0">{ui('convRateConfirmNewDocs')}</p>
                <p className="m-0">{ui('convRateConfirmExistingDocs')}</p>
              </div>
            </DialogDescription>
          </div>
        </div>
        <div className="flex justify-end gap-2.5 px-[22px] py-[18px]">
          <Button type="button" variant="outline" onClick={onBack} disabled={saving} data-testid="convrate-confirm-back">
            {ui('convRateConfirmBack')}
          </Button>
          <Button type="button" onClick={onConfirm} disabled={saving} data-testid="convrate-confirm-submit">
            {saving ? ui('saving') : ui('convRateConfirmSubmit')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Amber note of the edit dialog: posted invoices keep their rate. */
function EditNote({ ui }) {
  return (
    <div
      role="note"
      className="flex items-start gap-2.5 rounded-[10px] px-3.5 py-3 text-[13px]"
      style={{ background: '#FFF6E5', color: '#7A3E00' }}
      data-testid="convrate-dialog-edit-note">
      <InfoIcon className="mt-px h-4 w-4 shrink-0" aria-hidden="true" data-testid="InfoIcon__convrate" />
      <span>{ui('convRateEditNote')}</span>
    </div>
  );
}

function ErrorBox({ message }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-[10px] bg-destructive/10 px-3.5 py-3 text-[13px] text-destructive"
      data-testid="convrate-dialog-error">
      <WarningCircleIcon className="mt-px h-4 w-4 shrink-0" aria-hidden="true" data-testid="WarningCircleIcon__convrate" />
      <span>{message}</span>
    </div>
  );
}

/** Field descriptor of the "Moneda destino" picker (the shared form selector needs a key/id). */
const DESTINATION_FIELD = { key: 'convRateToCurrency', id: 'convRateToCurrency', required: true };

const TITLE_KEYS = {
  [DIALOG_MODES.NEW_CURRENCY]: 'convRateNewCurrencyTitle',
  [DIALOG_MODES.NEW_RATE]: 'convRateNewRateTitle',
  [DIALOG_MODES.EDIT]: 'convRateEditTitle',
};
const SUBMIT_KEYS = {
  [DIALOG_MODES.NEW_CURRENCY]: 'convRateCreateCurrency',
  [DIALOG_MODES.NEW_RATE]: 'convRateCreateRate',
  [DIALOG_MODES.EDIT]: 'convRateSaveChanges',
};

/** Title and primary-button label of the dialog for `mode` (an unknown mode reads as Nueva divisa). */
export function dialogTexts(mode, destIso, ui) {
  const titleKey = TITLE_KEYS[mode] ?? TITLE_KEYS[DIALOG_MODES.NEW_CURRENCY];
  const title = titleKey === TITLE_KEYS[DIALOG_MODES.NEW_CURRENCY] ? ui(titleKey) : ui(titleKey, { currency: destIso });
  return { title, submitLabel: ui(SUBMIT_KEYS[mode] ?? SUBMIT_KEYS[DIALOG_MODES.NEW_CURRENCY]) };
}

/** The error under Válido desde: required when touched and empty, future when after `now`. */
function startError(touchedDate, validFrom, inFuture, ui) {
  if (touchedDate && validFrom == null) return ui('convRateValidFromRequired');
  return inFuture ? ui('convRateValidFromFuture') : null;
}

/**
 * The validation of the form: the parsed rate and start, the field errors, the upper bound of the
 * start (the server clock aged by the time the dialog has been open) and whether the inputs allow
 * the primary action. Modificar: only the rate is editable (the range is fixed).
 */
export function validationOf({ form, touched, isEdit, dest, nowBound, ui }) {
  const rate = parseRateInput(form.rateText);
  const validFrom = normalizeValidFrom(form.validFrom);
  // No future starts: the server refuses them, so they are refused here first.
  const inFuture = Boolean(validFrom && nowBound && isAfterWallClock(validFrom, nowBound));
  const createValid = Boolean(dest && rate != null && validFrom && !inFuture);
  return {
    rate,
    validFrom,
    rateError: touched.rate && rate == null ? ui('convRateRateRequired') : null,
    dateError: startError(touched.date, validFrom, inFuture, ui),
    inputsValid: isEdit ? rate != null : createValid,
  };
}

/** Whether a write answer is a refusal: a non-2xx, an in-band `error`, or what `extra` says. */
function isRefused(res, data, extra) {
  return !res.ok || Boolean(data?.error) || extra(data);
}

/**
 * The refusal of a write: a non-2xx answer (read through `extractErrorMessage`) or an in-band
 * `data.error`, with the field it belongs to.
 */
async function refusalOf(res, data, ui) {
  if (!res.ok) {
    const body = await res.clone().json().catch(() => null);
    return { field: refusedField(body?.error ?? body), message: await extractErrorMessage(res, ui) };
  }
  const message = typeof data?.error === 'string' ? data.error : ui('convRateSaveFailed');
  return { field: refusedField(data), message };
}

/** Awaits a write and answers `{data}`, or `{refusal}` when it was refused (see {@link isRefused}). */
async function settle(request, ui, extra = () => false) {
  const { res, data } = await request;
  if (isRefused(res, data, extra)) return { refusal: await refusalOf(res, data, ui) };
  return { data };
}

/**
 * Runs `task` unless another write is in flight (`inFlight`, a ref: state alone lets a fast double
 * click send twice); `onError` receives what it throws.
 */
async function runGuarded(inFlight, setSubmitting, task, onError) {
  if (inFlight.current) return;
  inFlight.current = true;
  setSubmitting(true);
  try {
    await task();
  } catch (e) {
    onError(e);
  } finally {
    inFlight.current = false;
    setSubmitting(false);
  }
}

/** Modificar with the rate it already has: saves nothing. */
function isUnchangedEdit(isEdit, rate, row) {
  return isEdit && rate === Number(row.multipleRateBy);
}

/**
 * The server's "now" (`serverClock`), read when a create dialog opens: the default of Válido desde
 * and its upper bound. Answers the minute and the browser time of the read, so the bound can be
 * aged while the dialog stays open without trusting the browser's own clock.
 */
function useServerClock(open, mode, apiFetch, setForm) {
  const [serverNow, setServerNow] = useState(null);
  const readAt = useRef(0);
  useEffect(() => {
    if (!open || mode === DIALOG_MODES.EDIT) return undefined;
    const ctrl = new AbortController();
    setServerNow(null);
    fetchServerClock(apiFetch, ctrl.signal)
      .then((now) => {
        if (!now) return;
        readAt.current = Date.now();
        setServerNow(now);
        setForm((f) => ({ ...f, validFrom: now }));
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [open, mode, apiFetch, setForm]);
  return serverNow ? addMillisToWallClock(serverNow, Date.now() - readAt.current) : null;
}

/** "Nueva divisa": the currencies that can still receive a first manual rate. */
function useManualCurrencyOptions(open, isNewCurrency, apiFetch) {
  const [options, setOptions] = useState([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!open || !isNewCurrency) return undefined;
    const ctrl = new AbortController();
    setLoaded(false);
    fetchManualCurrencyOptions(apiFetch, ctrl.signal)
      .then((list) => {
        setOptions(list);
        setLoaded(true);
      })
      .catch((e) => {
        if (e?.name === 'AbortError') return;
        setOptions([]);
        setLoaded(true);
      });
    return () => ctrl.abort();
  }, [open, isNewCurrency, apiFetch]);
  return { options, optionsLoaded: loaded };
}

/**
 * Runs `request(signal)` debounced while `enabled`, keeping only the latest answer: an older
 * answer is aborted and ignored; disabled (or a failure) sets `null`.
 */
function useDebouncedAnswer(enabled, request, deps) {
  const [answer, setAnswer] = useState(null);
  const seqRef = useRef(0);
  useEffect(() => {
    if (!enabled) {
      setAnswer(null);
      return undefined;
    }
    const seq = ++seqRef.current;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      request(ctrl.signal)
        .then((data) => { if (seq === seqRef.current) setAnswer(data); })
        .catch((e) => { if (e?.name !== 'AbortError' && seq === seqRef.current) setAnswer(null); });
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `deps` lists what `request` reads
  }, [enabled, ...deps]);
  return [answer, setAnswer];
}

/** Modificar, "Guardar cambios": asks the server for the proposal and opens the confirmation. */
async function proposeChange(ctx) {
  const out = await settle(updateManualRate(ctx.apiFetch, { id: ctx.row.id, multipleRateBy: ctx.rate }), ctx.ui,
    (data) => !data?.proposal);
  if (out.refusal) return ctx.showRefusal(out.refusal);
  ctx.setProposal({ rate: ctx.rate, ...out.data.proposal });
  ctx.setConfirmOpen(true);
  return undefined;
}

/** "Crear divisa" / "Crear tasa". */
async function createRate(ctx) {
  const create = ctx.isNewCurrency ? createManualCurrency : createManualRate;
  const body = { toCurrency: ctx.dest.currencyId, multipleRateBy: ctx.rate, validFromDate: ctx.validFrom };
  const out = await settle(create(ctx.apiFetch, body), ctx.ui);
  if (out.refusal) return ctx.showRefusal(out.refusal);
  ctx.onSaved();
  return undefined;
}

/** "Confirmar cambio": the only step of Modificar that saves (`updateManualRate` + `confirm`). */
async function confirmChangeTask(ctx) {
  const body = { id: ctx.row.id, multipleRateBy: ctx.rate, confirm: true };
  const out = await settle(updateManualRate(ctx.apiFetch, body), ctx.ui, (data) => data?.saved === false);
  ctx.setConfirmOpen(false);
  if (out.refusal) return ctx.showRefusal(out.refusal);
  ctx.onSaved();
  return undefined;
}

/**
 * The writes of the dialog, one at a time: Crear divisa / Crear tasa, Guardar cambios (asks for
 * the proposal and opens the confirmation) and Confirmar cambio (the only step of Modificar that
 * saves). A refusal is shown in the dialog with the field it belongs to.
 */
function useRateWrites(params) {
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submitErrorField, setSubmitErrorField] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const inFlight = useRef(false);

  const ctx = {
    ...params,
    setConfirmOpen,
    showRefusal: (refusal) => {
      setSubmitErrorField(refusal.field);
      setSubmitError(refusal.message);
    },
  };
  const runOnce = (task) => runGuarded(inFlight, setSubmitting, () => task(ctx), (e) => {
    setConfirmOpen(false);
    setSubmitError(e?.message || params.ui('convRateSaveFailed'));
  });

  const submit = async (canSubmit) => {
    if (!canSubmit || inFlight.current) return;
    setSubmitError(null);
    setSubmitErrorField(null);
    // Modificar: an unchanged rate saves nothing; otherwise "Guardar cambios" only opens the
    // confirmation.
    if (isUnchangedEdit(params.isEdit, params.rate, params.row)) {
      params.onClose();
      return;
    }
    await runOnce(params.isEdit ? proposeChange : createRate);
  };

  const reset = () => {
    setConfirmOpen(false);
    setSubmitError(null);
    setSubmitting(false);
  };

  return {
    submitting,
    submitError,
    submitErrorField,
    confirmOpen,
    setConfirmOpen,
    submit,
    confirmChange: () => runOnce(confirmChangeTask),
    reset,
  };
}

/**
 * What the errors and the state of the writes mean for the form: the preview's refusal, the field
 * a refusal belongs to (overlap / future start → Válido desde), which fields show in error and
 * whether the primary action is enabled.
 */
export function formStateOf({ preview, writes, rateError, dateError, inputsValid }) {
  const previewError = preview?.error ?? null;
  const previewField = previewError ? refusedField(preview) : null;
  const submitField = writes.submitError ? writes.submitErrorField : null;
  const errorField = previewField || submitField || null;
  return {
    previewError,
    rateInError: Boolean(rateError) || errorField === 'multipleRateBy',
    startInError: Boolean(dateError) || errorField === 'validFromDate',
    canSubmit: Boolean(inputsValid) && !writes.submitting && !previewError,
  };
}

/** The summary lines of Modificar for the typed rate: the server's proposal when it is for it. */
function editLinesFor(isEdit, row, rate, proposal) {
  if (!isEdit || !row) return null;
  return editLines(row, rate, proposal?.rate === rate ? proposal : null);
}

/**
 * Enter in a field submits the primary action. The submit is deferred one tick so a field that
 * commits on Enter (DateTimeField, the rate) has published its value; `submit` then judges the
 * fresh state, so a disabled action stays disabled.
 */
function enterSubmitHandler(formRef) {
  return (event) => {
    if (!isEnterSubmitKey(event, formRef.current)) return;
    event.preventDefault();
    setTimeout(() => formRef.current?.requestSubmit(), 0);
  };
}

/** Closing (Esc, overlay) is ignored while a write runs or the confirmation is open. */
function closeHandler(blocked, onClose) {
  return (next) => {
    if (!next && !blocked) onClose();
  };
}

function originText(orgIso, orgName) {
  return orgName ? `${orgIso} · ${orgName}` : (orgIso ?? '');
}

function DialogFooterButtons({ submitting, canSubmit, submitLabel, onClose, ui }) {
  return (
    <div className="flex justify-end gap-2.5 border-t border-border px-[22px] py-3.5">
      <Button type="button" variant="outline" onClick={onClose} disabled={submitting} data-testid="convrate-dialog-cancel">
        {ui('cancel')}
      </Button>
      <Button type="submit" disabled={!canSubmit} data-testid="convrate-dialog-submit">
        {submitting ? ui('saving') : submitLabel}
      </Button>
    </div>
  );
}

function RateField({ value, onChange, onBlur, inError, error, orgIso, destIso, ui }) {
  return (
    <Field label={ui('convRateRate')} required className="min-w-0" data-testid="Field__convrate-rate">
      <div
        className={`flex ${FIELD_HEIGHT} min-w-0 items-center gap-1.5 rounded-lg border bg-card px-3 text-sm shadow-[0px_1px_2px_rgba(18,18,23,0.05)] focus-within:ring-2 focus-within:ring-focus-ring ${inError ? 'border-destructive' : 'border-[hsl(var(--border-control))]'}`}>
        <span className="shrink-0 whitespace-nowrap text-muted-foreground">{ui('convRateOneOrg', { currency: orgIso })}</span>
        <MaskedAmountInput
          bare
          grouping={false}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          isRawAllowed={(raw) => !String(raw).includes('-')}
          aria-label={ui('convRateRate')}
          aria-invalid={inError ? true : undefined}
          aria-describedby={error ? 'convrate-rate-error' : undefined}
          className="w-full min-w-0 border-0 bg-transparent p-0 outline-none focus-visible:ring-0 tabular-nums"
          data-testid="convrate-dialog-rate" />
        {destIso && <span className="shrink-0 whitespace-nowrap text-muted-foreground" data-testid="convrate-dialog-rate-suffix">{destIso}</span>}
      </div>
      {error && (
        <span id="convrate-rate-error" className="block text-xs font-normal text-destructive" data-testid="convrate-dialog-rate-error">
          {error}
        </span>
      )}
    </Field>
  );
}

/**
 * Válido desde: in error (red border, aria-invalid) on a field error or on a server refusal of the
 * start (overlap, future); the hint stays under it, as in the error design.
 */
function ValidFromField({ value, onChange, onBlur, max, inError, error, ui }) {
  return (
    <Field label={ui('convRateValidFromDateTime')} required className="min-w-0" data-testid="Field__convrate-from">
      <DateTimeField
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        max={max ?? undefined}
        invalid={inError}
        required
        aria-label={ui('convRateValidFromDateTime')}
        data-testid="convrate-dialog-valid-from-input" />
      {error && (
        <span className="block text-xs font-normal text-destructive" data-testid="convrate-dialog-date-error">{error}</span>
      )}
      <span className="block text-xs font-normal text-muted-foreground">{ui('convRateValidFromHint')}</span>
    </Field>
  );
}

/** Modificar: the range of the row, read-only, and the hint that only the rate can change. */
function EditRangeFields({ rateField, row, ui }) {
  return (
    <>
      <div className="max-w-[240px]">{rateField}</div>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
        <Field label={ui('convRateValidFromDateTime')} className="min-w-0" data-testid="Field__convrate-from">
          <DateTimeField
            value={row?.validFromDate}
            readOnly
            aria-label={ui('convRateValidFromDateTime')}
            data-testid="convrate-dialog-valid-from" />
        </Field>
        <Field label={ui('convRateValidToDateTime')} className="min-w-0" data-testid="Field__convrate-to">
          <DateTimeField
            value={isOpenEnded(row?.validToDate) ? null : row.validToDate}
            readOnly
            placeholder={ui('convRateOpenEnd')}
            aria-label={ui('convRateValidToDateTime')}
            data-testid="convrate-dialog-valid-to" />
        </Field>
      </div>
      <div className="-mt-1.5 text-xs text-muted-foreground" data-testid="convrate-dialog-edit-hint">
        {ui('convRateEditOnlyRate')}
      </div>
    </>
  );
}

/** Moneda destino: picked among the options (Nueva divisa), else the fixed currency, read-only. */
function DestinationField({ isNewCurrency, dest, destId, setDestId, options, optionsLoaded, ui }) {
  const destText = dest ? [dest.isoCode, dest.name].filter(Boolean).join(' · ') : '';
  const destinationOptions = useMemo(
    () => options.map((o) => ({ id: o.id, name: [o.isoCode, o.name].filter(Boolean).join(' · ') })),
    [options],
  );
  return (
    <Field label={ui('convRateDestinationCurrency')} required={isNewCurrency} className="min-w-0" data-testid="Field__convrate-destination">
      {isNewCurrency ? (
        <div data-testid="convrate-dialog-destination">
          <CreatableSearchSelect
            // Seeds its options from staticOptions on mount only: remount once they load.
            key={optionsLoaded ? 'convrate-dest-loaded' : 'convrate-dest-loading'}
            field={DESTINATION_FIELD}
            value={destId ?? ''}
            displayValue={destText}
            onChange={(id) => setDestId(id || null)}
            resolvedLabel={ui('convRateDestinationCurrency')}
            placeholderOverride={ui('convRateSelectCurrency')}
            staticOptions={destinationOptions}
            disabled={optionsLoaded && options.length === 0}
            data-testid="CreatableSearchSelect__convrate-dest" />
        </div>
      ) : (
        <Input
          value={destText}
          readOnly
          disabled
          aria-label={ui('convRateDestinationCurrency')}
          data-testid="convrate-dialog-destination" />
      )}
    </Field>
  );
}

/** The line under the currencies: the Nueva divisa hint, or the rate in force of Nueva tasa. */
function ModeHint({ mode, noneAvailable, currency, orgIso, destIso, ui }) {
  if (mode === DIALOG_MODES.NEW_CURRENCY) {
    return (
      <div className="-mt-1.5 text-xs text-muted-foreground" data-testid="convrate-dialog-hint">
        {noneAvailable ? ui('convRateNoCurrencyAvailable') : ui('convRateNewCurrencyHint')}
      </div>
    );
  }
  if (mode !== DIALOG_MODES.NEW_RATE || currency?.rate == null) return null;
  return (
    <div className="-mt-1.5 text-xs text-muted-foreground" data-testid="convrate-dialog-current">
      {ui('convRateCurrentRateLine', {
        org: orgIso,
        rate: formatRate(currency.rate),
        currency: destIso,
        from: formatWallClock(currency.validFrom),
      })}
    </div>
  );
}

/** Modificar: old → new of both directions and the note; a create: the preview, unless refused. */
function DialogSummary({ isEdit, row, lines, preview, previewError, mode, destIso, orgIso, ui }) {
  if (isEdit) {
    if (!row) return null;
    return (
      <>
        <EditSummary lines={lines} destIso={destIso} orgIso={orgIso} ui={ui} data-testid="EditSummary__51f9a2" />
        <EditNote ui={ui} data-testid="EditNote__51f9a2" />
      </>
    );
  }
  if (previewError) return null;
  return (
    <PreviewSummary preview={preview} mode={mode} destIso={destIso} orgIso={orgIso} ui={ui} data-testid="PreviewSummary__51f9a2" />
  );
}

/** The resolved destination: the picked option (Nueva divisa) or the fixed `currency`. */
function useDestination(isNewCurrency, currency, options, destId) {
  return useMemo(() => {
    if (!isNewCurrency) return currency ?? null;
    const opt = options.find((o) => o.id === destId);
    return opt ? { currencyId: opt.id, isoCode: opt.isoCode, name: opt.name } : null;
  }, [isNewCurrency, currency, options, destId]);
}

/**
 * ETP-6365 — "Nueva divisa" / "Nueva tasa · X" / "Modificar tasa · X". The server owns every
 * rule (inverse rate, closing the previous open range at start − 1 minute, overlap refusal):
 * the dialog shows its preview (`previewManualRate`, debounced) and its refusal messages as is.
 *
 * Tasa and Válido desde are required: the confirm button stays disabled and the field shows its
 * error until both are valid. Enter in a field submits — after the field commits its value
 * (see {@link isEnterSubmitKey}); the submit still refuses while the button would be disabled.
 * Esc and the corner X close. Every write is guarded against a double click: one request at a
 * time (`inFlight`), not only a disabled button, which a second click can beat.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {string} props.mode one of {@link DIALOG_MODES}
 * @param {string} props.orgIso organization currency ISO ("EUR")
 * @param {string} [props.orgName] its display name ("Euro")
 * @param {{currencyId: string, isoCode: string, name?: string, rate?: number, validFrom?: string}} [props.currency]
 *   the fixed destination (newRate / edit)
 * @param {object} [props.row] the history row being edited (edit)
 * @param {Function} props.apiFetch
 * @param {() => void} props.onClose
 * @param {() => void} props.onSaved called after a successful write (the dialog then closes)
 * @param {(key: string, params?: object) => string} props.ui
 */
export function ManualRateDialog({
  open, mode, orgIso, orgName, currency, row, apiFetch, onClose, onSaved, ui,
}) {
  const isEdit = mode === DIALOG_MODES.EDIT;
  const isNewCurrency = mode === DIALOG_MODES.NEW_CURRENCY;

  const [form, setForm] = useState(() => initialState(mode, row));
  const [destId, setDestId] = useState(null);
  const [touched, setTouched] = useState({ rate: false, date: false });
  const formRef = useRef(null);
  const nowBound = useServerClock(open, mode, apiFetch, setForm);
  const { options, optionsLoaded } = useManualCurrencyOptions(open, isNewCurrency, apiFetch);
  const dest = useDestination(isNewCurrency, currency, options, destId);
  const destIso = dest?.isoCode ?? '';
  const destCurrencyId = dest?.currencyId ?? null;
  const { rate, validFrom, rateError, dateError, inputsValid } = validationOf({ form, touched, isEdit, dest, nowBound, ui });

  // Debounced preview of what creating the rate would do; stale answers are aborted.
  const [preview] = useDebouncedAnswer(open && !isEdit && inputsValid,
    (signal) => previewManualRate(apiFetch, { mode, toCurrency: destCurrencyId, multipleRateBy: rate, validFromDate: validFrom }, signal),
    [mode, apiFetch, destCurrencyId, rate, validFrom]);
  // Modificar: debounced proposal (`updateManualRate` without `confirm`) for the typed rate — the
  // summary and the confirmation show the server's old → new of both directions.
  const rowId = row?.id ?? null;
  const [proposal, setProposal] = useDebouncedAnswer(open && isEdit && Boolean(rowId) && rate != null,
    (signal) => updateManualRate(apiFetch, { id: rowId, multipleRateBy: rate }, signal)
      .then(({ res, data }) => (res.ok && data?.proposal ? { rate, ...data.proposal } : null)),
    [rowId, rate, apiFetch]);
  const lines = editLinesFor(isEdit, row, rate, proposal);

  const writes = useRateWrites({
    apiFetch, ui, isEdit, isNewCurrency, row, rate, validFrom, dest, onSaved, onClose, setProposal,
  });

  // Reset every time the dialog opens (a new target or a new row).
  useEffect(() => {
    if (!open) return;
    setForm(initialState(mode, row));
    setDestId(null);
    setTouched({ rate: false, date: false });
    setProposal(null);
    writes.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset on open/target change only
  }, [open, mode, row]);

  const { previewError, rateInError, startInError, canSubmit } = formStateOf({
    preview, writes, rateError, dateError, inputsValid,
  });

  function submit(event) {
    event?.preventDefault();
    setTouched({ rate: true, date: true });
    return writes.submit(canSubmit);
  }

  const { title, submitLabel } = dialogTexts(mode, destIso, ui);
  const rateField = (
    <RateField
      value={form.rateText}
      onChange={(clean) => setForm((f) => ({ ...f, rateText: clean }))}
      onBlur={() => setTouched((t) => ({ ...t, rate: true }))}
      inError={rateInError}
      error={rateError}
      orgIso={orgIso}
      destIso={destIso}
      ui={ui}
      data-testid="RateField__51f9a2" />
  );
  const blocked = writes.submitting || writes.confirmOpen;

  return (
    <Dialog open={open} onOpenChange={closeHandler(blocked, onClose)} data-testid="Dialog__convrate">
      <DialogContent
        className="flex w-[520px] max-w-[calc(100vw-32px)] flex-col gap-0 rounded-[14px] border-0 bg-card p-0 [&>button]:hidden"
        aria-busy={writes.submitting || undefined}
        data-testid="convrate-dialog"
        data-mode={mode}>
        <form ref={formRef} onSubmit={submit} onKeyDown={enterSubmitHandler(formRef)} noValidate className="flex flex-col">
          <DialogHeader
            className="flex flex-row items-center justify-between space-y-0 border-b border-border px-[22px] py-3.5 text-left"
            data-testid="DialogHeader__51f9a2">
            <div className="flex items-center gap-2.5">
              <DialogTitle className="m-0 text-[17px] font-semibold" data-testid="convrate-dialog-title">{title}</DialogTitle>
              <OriginBadge automatic={false} ui={ui} data-testid="convrate-dialog-badge" />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onClose}
              disabled={writes.submitting}
              aria-label={ui('close')}
              title={ui('close')}
              className="h-11 w-11 rounded-full text-muted-foreground"
              data-testid="convrate-dialog-close">
              <XIcon className="h-[18px] w-[18px]" aria-hidden="true" data-testid="XIcon__convrate" />
            </Button>
          </DialogHeader>
          <DialogDescription className="sr-only" data-testid="DialogDescription__51f9a2">{ui('convRateDialogDescription')}</DialogDescription>

          <div className="flex flex-col gap-4 px-[22px] py-5">
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
              <Field label={ui('convRateOriginCurrency')} className="min-w-0" data-testid="Field__convrate-origin">
                <Input
                  value={originText(orgIso, orgName)}
                  readOnly
                  disabled
                  aria-label={ui('convRateOriginCurrency')}
                  data-testid="convrate-dialog-origin" />
              </Field>
              <DestinationField
                isNewCurrency={isNewCurrency}
                dest={dest}
                destId={destId}
                setDestId={setDestId}
                options={options}
                optionsLoaded={optionsLoaded}
                ui={ui}
                data-testid="DestinationField__51f9a2" />
            </div>

            <ModeHint
              mode={mode}
              noneAvailable={optionsLoaded && options.length === 0}
              currency={currency}
              orgIso={orgIso}
              destIso={destIso}
              ui={ui}
              data-testid="ModeHint__51f9a2" />

            {isEdit ? <EditRangeFields
              rateField={rateField}
              row={row}
              ui={ui}
              data-testid="EditRangeFields__51f9a2" /> : (
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
                {rateField}
                <ValidFromField
                  value={form.validFrom}
                  onChange={(next) => {
                    setForm((f) => ({ ...f, validFrom: next }));
                    setTouched((t) => ({ ...t, date: true }));
                  }}
                  onBlur={() => setTouched((t) => ({ ...t, date: true }))}
                  max={nowBound}
                  inError={startInError}
                  error={dateError}
                  ui={ui}
                  data-testid="ValidFromField__51f9a2" />
              </div>
            )}

            <DialogSummary
              isEdit={isEdit}
              row={row}
              lines={lines}
              preview={preview}
              previewError={previewError}
              mode={mode}
              destIso={destIso}
              orgIso={orgIso}
              ui={ui}
              data-testid="DialogSummary__51f9a2" />
            <ErrorBox message={writes.submitError ?? previewError} data-testid="ErrorBox__51f9a2" />
          </div>

          <DialogFooterButtons
            submitting={writes.submitting}
            canSubmit={canSubmit}
            submitLabel={submitLabel}
            onClose={onClose}
            ui={ui}
            data-testid="DialogFooterButtons__51f9a2" />
        </form>
      </DialogContent>
      {lines && (
        <ConfirmRateChangeDialog
          open={writes.confirmOpen}
          lines={lines}
          row={row}
          destIso={destIso}
          orgIso={orgIso}
          saving={writes.submitting}
          onBack={() => writes.setConfirmOpen(false)}
          onConfirm={writes.confirmChange}
          ui={ui}
          data-testid="ConfirmRateChangeDialog__51f9a2" />
      )}
    </Dialog>
  );
}

export default ManualRateDialog;
