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
  // Server clock read when the dialog opened, and the browser time of that read, so "now" can be
  // aged while the dialog stays open without trusting the browser's own clock.
  const [serverNow, setServerNow] = useState(null);
  const serverNowReadAt = useRef(0);
  const [destId, setDestId] = useState(null);
  const [options, setOptions] = useState([]);
  const [optionsLoaded, setOptionsLoaded] = useState(false);
  const [touched, setTouched] = useState({ rate: false, date: false });
  const [preview, setPreview] = useState(null);
  const [submitError, setSubmitError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  // Synchronous in-flight guard of the writes: state alone lets a fast double click send twice.
  const inFlight = useRef(false);
  const formRef = useRef(null);
  // Modificar: the server's proposal for the typed rate, and the confirmation step.
  const [proposal, setProposal] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Reset every time the dialog opens (a new target or a new row).
  useEffect(() => {
    if (!open) return;
    setForm(initialState(mode, row));
    setDestId(null);
    setTouched({ rate: false, date: false });
    setPreview(null);
    setProposal(null);
    setConfirmOpen(false);
    setSubmitError(null);
    setSubmitting(false);
  }, [open, mode, row]);

  // The server's "now": default of Válido desde (new rates) and its upper bound (every mode).
  useEffect(() => {
    if (!open || mode === DIALOG_MODES.EDIT) return undefined;
    const ctrl = new AbortController();
    setServerNow(null);
    fetchServerClock(apiFetch, ctrl.signal)
      .then((now) => {
        if (!now) return;
        serverNowReadAt.current = Date.now();
        setServerNow(now);
        if (mode !== DIALOG_MODES.EDIT) {
          setForm((f) => ({ ...f, validFrom: now }));
        }
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [open, mode, apiFetch]);

  // "Nueva divisa": the currencies that can still receive a first manual rate.
  useEffect(() => {
    if (!open || !isNewCurrency) return undefined;
    const ctrl = new AbortController();
    setOptionsLoaded(false);
    fetchManualCurrencyOptions(apiFetch, ctrl.signal)
      .then((list) => {
        setOptions(list);
        setOptionsLoaded(true);
      })
      .catch((e) => {
        if (e?.name === 'AbortError') return;
        setOptions([]);
        setOptionsLoaded(true);
      });
    return () => ctrl.abort();
  }, [open, isNewCurrency, apiFetch]);

  const dest = useMemo(() => {
    if (!isNewCurrency) return currency ?? null;
    const opt = options.find((o) => o.id === destId);
    return opt ? { currencyId: opt.id, isoCode: opt.isoCode, name: opt.name } : null;
  }, [isNewCurrency, currency, options, destId]);
  const destinationOptions = useMemo(
    () => options.map((o) => ({ id: o.id, name: [o.isoCode, o.name].filter(Boolean).join(' · ') })),
    [options],
  );
  const destIso = dest?.isoCode ?? '';
  const destCurrencyId = dest?.currencyId ?? null;

  const rate = parseRateInput(form.rateText);
  const validFrom = normalizeValidFrom(form.validFrom);
  const rateError = touched.rate && rate == null ? ui('convRateRateRequired') : null;
  // No future starts: the server refuses them, so they are refused here first (field error,
  // confirm disabled). The bound is the server clock aged by the time the dialog has been open.
  const nowBound = serverNow ? addMillisToWallClock(serverNow, Date.now() - serverNowReadAt.current) : null;
  const inFuture = Boolean(validFrom && nowBound && isAfterWallClock(validFrom, nowBound));
  let dateError = null;
  if (touched.date && validFrom == null) dateError = ui('convRateValidFromRequired');
  else if (inFuture) dateError = ui('convRateValidFromFuture');
  // Modificar: only the rate is editable (the range is fixed; change it by deleting and creating).
  const inputsValid = isEdit
    ? rate != null
    : Boolean(dest && rate != null && validFrom && !inFuture);

  // Debounced preview of what creating the rate would do; stale answers are aborted.
  const previewSeq = useRef(0);
  useEffect(() => {
    if (!open || isEdit || !inputsValid) {
      setPreview(null);
      return undefined;
    }
    const seq = ++previewSeq.current;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      previewManualRate(apiFetch, {
        mode,
        toCurrency: destCurrencyId,
        multipleRateBy: rate,
        validFromDate: validFrom,
      }, ctrl.signal)
        .then((data) => { if (seq === previewSeq.current) setPreview(data); })
        .catch((e) => { if (e?.name !== 'AbortError' && seq === previewSeq.current) setPreview(null); });
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [open, isEdit, mode, inputsValid, apiFetch, destCurrencyId, rate, validFrom]);

  // Modificar: debounced proposal (`updateManualRate` without `confirm`) for the typed rate — the
  // summary and the confirmation show the server's old → new of both directions.
  const proposalSeq = useRef(0);
  const rowId = row?.id ?? null;
  useEffect(() => {
    if (!open || !isEdit || !rowId || rate == null) {
      setProposal(null);
      return undefined;
    }
    const seq = ++proposalSeq.current;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      updateManualRate(apiFetch, { id: rowId, multipleRateBy: rate }, ctrl.signal)
        .then(({ res, data }) => {
          if (seq !== proposalSeq.current) return;
          setProposal(res.ok && data?.proposal ? { rate, ...data.proposal } : null);
        })
        .catch(() => { if (seq === proposalSeq.current) setProposal(null); });
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [open, isEdit, rowId, rate, apiFetch]);
  const currentProposal = proposal && proposal.rate === rate ? proposal : null;
  const lines = isEdit && row ? editLines(row, rate, currentProposal) : null;

  const previewError = preview?.error ?? null;
  const [submitErrorField, setSubmitErrorField] = useState(null);
  // A refusal bound to a field (overlap / future start → Válido desde) marks that field.
  const errorField = (previewError && refusedField(preview)) || (submitError && submitErrorField) || null;
  const startInError = Boolean(dateError) || errorField === 'validFromDate';
  const rateInError = Boolean(rateError) || errorField === 'multipleRateBy';
  const canSubmit = inputsValid && !submitting && !previewError;

  /** Shows a refusal: a non-2xx answer (read through `extractErrorMessage`) or an in-band `data.error`. */
  async function showRefusal(res, data) {
    if (!res.ok) {
      const body = await res.clone().json().catch(() => null);
      setSubmitErrorField(refusedField(body?.error ?? body));
      setSubmitError(await extractErrorMessage(res, ui));
      return;
    }
    setSubmitErrorField(refusedField(data));
    setSubmitError(typeof data?.error === 'string' ? data.error : ui('convRateSaveFailed'));
  }

  /**
   * Runs one write at a time: a call while another is in flight is dropped. A thrown error closes
   * the confirmation (when open) and shows the generic failure.
   */
  async function runOnce(task) {
    if (inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    try {
      await task();
    } catch (e) {
      setConfirmOpen(false);
      setSubmitError(e?.message || ui('convRateSaveFailed'));
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  /** Modificar, "Guardar cambios": asks the server for the proposal and opens the confirmation. */
  async function proposeChange() {
    const { res, data } = await updateManualRate(apiFetch, { id: row.id, multipleRateBy: rate });
    if (!res.ok || data?.error || !data?.proposal) {
      await showRefusal(res, data);
      return;
    }
    setProposal({ rate, ...data.proposal });
    setConfirmOpen(true);
  }

  /** "Crear divisa" / "Crear tasa". */
  async function createRate() {
    const create = isNewCurrency ? createManualCurrency : createManualRate;
    const { res, data } = await create(apiFetch, {
      toCurrency: dest.currencyId,
      multipleRateBy: rate,
      validFromDate: validFrom,
    });
    if (!res.ok || data?.error) {
      await showRefusal(res, data);
      return;
    }
    onSaved();
  }

  async function submit(event) {
    event?.preventDefault();
    setTouched({ rate: true, date: true });
    if (!canSubmit || inFlight.current) return;
    setSubmitError(null);
    setSubmitErrorField(null);
    // Modificar: an unchanged rate saves nothing; otherwise "Guardar cambios" only opens the
    // confirmation.
    if (isEdit && rate === Number(row.multipleRateBy)) {
      onClose();
      return;
    }
    await runOnce(isEdit ? proposeChange : createRate);
  }

  /** "Confirmar cambio": the only step of Modificar that saves (`updateManualRate` + `confirm`). */
  function confirmChange() {
    return runOnce(async () => {
      const { res, data } = await updateManualRate(apiFetch, { id: row.id, multipleRateBy: rate, confirm: true });
      setConfirmOpen(false);
      if (!res.ok || data?.error || data?.saved === false) {
        await showRefusal(res, data);
        return;
      }
      onSaved();
    });
  }

  /**
   * Enter in a field submits the primary action. The submit is deferred one tick so a field that
   * commits on Enter (DateTimeField, the rate) has published its value; `submit` then judges the
   * fresh state, so a disabled action stays disabled.
   */
  function onFormKeyDown(event) {
    if (!isEnterSubmitKey(event, formRef.current)) return;
    event.preventDefault();
    setTimeout(() => formRef.current?.requestSubmit(), 0);
  }

  let title = ui('convRateNewCurrencyTitle');
  if (mode === DIALOG_MODES.NEW_RATE) title = ui('convRateNewRateTitle', { currency: destIso });
  if (isEdit) title = ui('convRateEditTitle', { currency: destIso });
  let submitLabel = ui('convRateCreateCurrency');
  if (mode === DIALOG_MODES.NEW_RATE) submitLabel = ui('convRateCreateRate');
  if (isEdit) submitLabel = ui('convRateSaveChanges');

  const rateField = (
    <Field label={ui('convRateRate')} required className="min-w-0" data-testid="Field__convrate-rate">
      <div
        className={`flex ${FIELD_HEIGHT} min-w-0 items-center gap-1.5 rounded-lg border bg-card px-3 text-sm shadow-[0px_1px_2px_rgba(18,18,23,0.05)] focus-within:ring-2 focus-within:ring-focus-ring ${rateInError ? 'border-destructive' : 'border-[hsl(var(--border-control))]'}`}>
        <span className="shrink-0 whitespace-nowrap text-muted-foreground">{ui('convRateOneOrg', { currency: orgIso })}</span>
        <MaskedAmountInput
          bare
          grouping={false}
          value={form.rateText}
          onChange={(clean) => setForm((f) => ({ ...f, rateText: clean }))}
          onBlur={() => setTouched((t) => ({ ...t, rate: true }))}
          isRawAllowed={(raw) => !String(raw).includes('-')}
          aria-label={ui('convRateRate')}
          aria-invalid={rateInError ? true : undefined}
          aria-describedby={rateError ? 'convrate-rate-error' : undefined}
          className="w-full min-w-0 border-0 bg-transparent p-0 outline-none focus-visible:ring-0 tabular-nums"
          data-testid="convrate-dialog-rate" />
        {destIso && <span className="shrink-0 whitespace-nowrap text-muted-foreground" data-testid="convrate-dialog-rate-suffix">{destIso}</span>}
      </div>
      {rateError && (
        <span id="convrate-rate-error" className="block text-xs font-normal text-destructive" data-testid="convrate-dialog-rate-error">
          {rateError}
        </span>
      )}
    </Field>
  );

  // Válido desde: in error (red border, aria-invalid) on a field error or on a server refusal of
  // the start (overlap, future); the hint stays under it, as in the error design.
  const validFromField = (
    <Field label={ui('convRateValidFromDateTime')} required className="min-w-0" data-testid="Field__convrate-from">
      <DateTimeField
        value={form.validFrom}
        onChange={(next) => {
          setForm((f) => ({ ...f, validFrom: next }));
          setTouched((t) => ({ ...t, date: true }));
        }}
        onBlur={() => setTouched((t) => ({ ...t, date: true }))}
        max={nowBound ?? undefined}
        invalid={startInError}
        required
        aria-label={ui('convRateValidFromDateTime')}
        data-testid="convrate-dialog-valid-from-input" />
      {dateError && (
        <span className="block text-xs font-normal text-destructive" data-testid="convrate-dialog-date-error">{dateError}</span>
      )}
      <span className="block text-xs font-normal text-muted-foreground">{ui('convRateValidFromHint')}</span>
    </Field>
  );

  const orgText = orgName ? `${orgIso} · ${orgName}` : orgIso;
  const destText = dest ? [dest.isoCode, dest.name].filter(Boolean).join(' · ') : '';

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !submitting && !confirmOpen) onClose(); }} data-testid="Dialog__convrate">
      <DialogContent
        className="flex w-[520px] max-w-[calc(100vw-32px)] flex-col gap-0 rounded-[14px] border-0 bg-card p-0 [&>button]:hidden"
        aria-busy={submitting || undefined}
        data-testid="convrate-dialog"
        data-mode={mode}>
        <form ref={formRef} onSubmit={submit} onKeyDown={onFormKeyDown} noValidate className="flex flex-col">
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
              disabled={submitting}
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
                  value={orgText ?? ''}
                  readOnly
                  disabled
                  aria-label={ui('convRateOriginCurrency')}
                  data-testid="convrate-dialog-origin" />
              </Field>
              <Field label={ui('convRateDestinationCurrency')} required={isNewCurrency} className="min-w-0" data-testid="Field__convrate-destination">
                {isNewCurrency ? (
                  <div data-testid="convrate-dialog-destination">
                    <CreatableSearchSelect
                      // Seeds its options from staticOptions on mount only: remount once they load.
                      key={optionsLoaded ? 'convrate-dest-loaded' : 'convrate-dest-loading'}
                      field={DESTINATION_FIELD}
                      value={destId ?? ''}
                      displayValue={dest ? destText : ''}
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
            </div>

            {isNewCurrency && (
              <div className="-mt-1.5 text-xs text-muted-foreground" data-testid="convrate-dialog-hint">
                {optionsLoaded && options.length === 0 ? ui('convRateNoCurrencyAvailable') : ui('convRateNewCurrencyHint')}
              </div>
            )}
            {mode === DIALOG_MODES.NEW_RATE && currency?.rate != null && (
              <div className="-mt-1.5 text-xs text-muted-foreground" data-testid="convrate-dialog-current">
                {ui('convRateCurrentRateLine', {
                  org: orgIso,
                  rate: formatRate(currency.rate),
                  currency: destIso,
                  from: formatWallClock(currency.validFrom),
                })}
              </div>
            )}

            {isEdit ? (
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
            ) : (
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
                {rateField}
                {validFromField}
              </div>
            )}

            {isEdit && row && (
              <>
                <EditSummary
                  lines={lines}
                  destIso={destIso}
                  orgIso={orgIso}
                  ui={ui}
                  data-testid="EditSummary__51f9a2" />
                <EditNote ui={ui} data-testid="EditNote__51f9a2" />
              </>
            )}
            {!isEdit && !previewError && (
              <PreviewSummary
                preview={preview}
                mode={mode}
                destIso={destIso}
                orgIso={orgIso}
                ui={ui}
                data-testid="PreviewSummary__51f9a2" />
            )}
            <ErrorBox message={submitError ?? previewError} data-testid="ErrorBox__51f9a2" />
          </div>

          <div className="flex justify-end gap-2.5 border-t border-border px-[22px] py-3.5">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting} data-testid="convrate-dialog-cancel">
              {ui('cancel')}
            </Button>
            <Button type="submit" disabled={!canSubmit} data-testid="convrate-dialog-submit">
              {submitting ? ui('saving') : submitLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
      {isEdit && row && (
        <ConfirmRateChangeDialog
          open={confirmOpen}
          lines={lines}
          row={row}
          destIso={destIso}
          orgIso={orgIso}
          saving={submitting}
          onBack={() => setConfirmOpen(false)}
          onConfirm={confirmChange}
          ui={ui}
          data-testid="ConfirmRateChangeDialog__51f9a2" />
      )}
    </Dialog>
  );
}

export default ManualRateDialog;
