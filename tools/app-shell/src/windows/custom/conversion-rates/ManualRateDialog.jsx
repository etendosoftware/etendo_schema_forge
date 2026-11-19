import { useEffect, useMemo, useRef, useState } from 'react';
import { InfoIcon, WarningCircleIcon, XIcon } from '@phosphor-icons/react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog.jsx';
import { DateField } from '@/components/ui/date-field';
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
  fetchManualCurrencyOptions, fetchServerClock, previewManualRate, createManualRate, updateManualRate,
} from './conversionRatesApi.js';
import {
  formatWallClock, formatWallClockDate, nowWallClock, parseWallClock, toWallClock,
  wallClockDate, wallClockTime, isOpenEnded, displayValidTo, addMillisToWallClock, isAfterWallClock,
} from './conversionRatesModel.js';

/** Debounce of the preview request while the user types. */
export const PREVIEW_DEBOUNCE_MS = 350;

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * The dialog modes:
 * - `newCurrency` — "Nueva divisa": the destination is picked among the active currencies that
 *   have no rates yet (`manualCurrencyOptions {withoutRates: true}`);
 * - `newRate` — "Nueva tasa · CHF": the destination is fixed (a manual card or group header);
 * - `edit` — "Modificar tasa · CHF": PATCH of a manual row's RATE only (any state); the range is
 *   read-only (change it by deleting the rate and creating a new one).
 */
export const DIALOG_MODES = Object.freeze({ NEW_CURRENCY: 'newCurrency', NEW_RATE: 'newRate', EDIT: 'edit' });

/** `yyyy-MM-ddTHH:mm:00`, or null while the date or the time is not valid yet. */
export function composeValidFrom(dateIso, time) {
  const date = parseWallClock(dateIso);
  const t = TIME_RE.exec(time ?? '');
  if (!date || !t) return null;
  return toWallClock({ ...date, hour: Number(t[1]), minute: Number(t[2]) });
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
      dateIso: wallClockDate(row.validFromDate),
      time: wallClockTime(row.validFromDate),
    };
  }
  return { rateText: '', dateIso: wallClockDate(now), time: wallClockTime(now) };
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

/** The inverse of a rate, for the edit summary only (the server stores the real one). */
function inverseOf(rate) {
  return rate ? 1 / rate : null;
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
            date: formatWallClockDate(forwardClose.newValidTo),
            time: wallClockTime(forwardClose.newValidTo),
          })}
        </div>
      )}
    </div>
  );
}

/** Edit summary: both directions, old value → new value. */
function EditSummary({ row, rate, destIso, orgIso, ui }) {
  const newRate = rate ?? Number(row.multipleRateBy);
  return (
    <div className="flex flex-col gap-1.5 rounded-[10px] bg-muted/60 px-3.5 py-3 text-[13px]" data-testid="convrate-dialog-summary">
      <div className="font-semibold">{ui('convRateEditSummaryTitle')}</div>
      <div data-testid="convrate-dialog-summary-forward">
        {`${orgIso} → ${destIso} · ${formatRate(row.multipleRateBy)} → ${formatRate(newRate)}`}
      </div>
      <div data-testid="convrate-dialog-summary-inverse">
        {`${destIso} → ${orgIso} · ${formatRate(row.divideRateBy)} → ${formatRate(inverseOf(newRate))}`}
      </div>
    </div>
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
 * error until both are valid. Enter submits (it is a form), Esc and the corner X close.
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

  // Reset every time the dialog opens (a new target or a new row).
  useEffect(() => {
    if (!open) return;
    setForm(initialState(mode, row));
    setDestId(null);
    setTouched({ rate: false, date: false });
    setPreview(null);
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
          setForm((f) => ({ ...f, dateIso: wallClockDate(now), time: wallClockTime(now) }));
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
  const validFrom = composeValidFrom(form.dateIso, form.time);
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
  }, [open, isEdit, inputsValid, apiFetch, destCurrencyId, rate, validFrom]);

  const previewError = preview?.error ?? null;
  const [submitErrorField, setSubmitErrorField] = useState(null);
  // A refusal bound to a field (overlap / future start → Válido desde) marks that field.
  const errorField = (previewError && refusedField(preview)) || (submitError && submitErrorField) || null;
  const startInError = Boolean(dateError) || errorField === 'validFromDate';
  const rateInError = Boolean(rateError) || errorField === 'multipleRateBy';
  const canSubmit = inputsValid && !submitting && !previewError;

  async function submit(event) {
    event?.preventDefault();
    setTouched({ rate: true, date: true });
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    setSubmitErrorField(null);
    try {
      let res;
      if (isEdit) {
        if (rate === Number(row.multipleRateBy)) {
          onClose();
          return;
        }
        res = await updateManualRate(apiFetch, row.id, { multipleRateBy: rate });
      } else {
        res = await createManualRate(apiFetch, {
          toCurrency: dest.currencyId,
          multipleRateBy: rate,
          validFromDate: validFrom,
        });
      }
      if (!res.ok) {
        const body = await res.clone().json().catch(() => null);
        setSubmitErrorField(refusedField(body?.error ?? body));
        setSubmitError(await extractErrorMessage(res, ui));
        return;
      }
      onSaved();
    } catch (e) {
      setSubmitError(e?.message || ui('convRateSaveFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  let title = ui('convRateNewCurrencyTitle');
  if (mode === DIALOG_MODES.NEW_RATE) title = ui('convRateNewRateTitle', { currency: destIso });
  if (isEdit) title = ui('convRateEditTitle', { currency: destIso });
  let submitLabel = ui('convRateCreateCurrency');
  if (mode === DIALOG_MODES.NEW_RATE) submitLabel = ui('convRateCreateRate');
  if (isEdit) submitLabel = ui('convRateSaveChanges');

  const rateField = (
    <Field label={ui('convRateRate')} required data-testid="Field__convrate-rate">
      <div
        className={`flex ${FIELD_HEIGHT} items-center gap-1.5 rounded-lg border bg-card px-3 text-sm shadow-[0px_1px_2px_rgba(18,18,23,0.05)] focus-within:ring-2 focus-within:ring-focus-ring ${rateInError ? 'border-destructive' : 'border-[hsl(var(--border-control))]'}`}>
        <span className="whitespace-nowrap text-muted-foreground">{ui('convRateOneOrg', { currency: orgIso })}</span>
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
        <span className="text-muted-foreground">{destIso}</span>
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
    <Field label={ui('convRateValidFromDateTime')} required data-testid="Field__convrate-from">
      <div className={`flex gap-2${startInError ? ' [&>div]:border-destructive' : ''}`} data-invalid={startInError ? 'true' : undefined}>
        <DateField
          value={form.dateIso}
          onChange={(iso) => {
            setForm((f) => ({ ...f, dateIso: iso }));
            setTouched((t) => ({ ...t, date: true }));
          }}
          required
          data-testid="convrate-dialog-date" />
        <Input
          type="time"
          value={form.time}
          onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
          onBlur={() => setTouched((t) => ({ ...t, date: true }))}
          required
          aria-label={ui('convRateTime')}
          aria-invalid={startInError ? true : undefined}
          className={`w-[96px] shrink-0 bg-card${startInError ? ' border-destructive' : ''}`}
          data-testid="convrate-dialog-time" />
      </div>
      {dateError && (
        <span className="block text-xs font-normal text-destructive" data-testid="convrate-dialog-date-error">{dateError}</span>
      )}
      <span className="block text-xs font-normal text-muted-foreground">{ui('convRateValidFromHint')}</span>
    </Field>
  );

  const orgText = orgName ? `${orgIso} · ${orgName}` : orgIso;
  const destText = dest ? [dest.isoCode, dest.name].filter(Boolean).join(' · ') : '';

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !submitting) onClose(); }} data-testid="Dialog__convrate">
      <DialogContent
        className="flex w-[520px] max-w-[calc(100vw-32px)] flex-col gap-0 rounded-[14px] border-0 bg-card p-0 [&>button]:hidden"
        aria-busy={submitting || undefined}
        data-testid="convrate-dialog"
        data-mode={mode}>
        <form onSubmit={submit} noValidate className="flex flex-col">
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
            <div className="grid grid-cols-2 gap-3">
              <Field label={ui('convRateOriginCurrency')} data-testid="Field__convrate-origin">
                <Input
                  value={orgText ?? ''}
                  readOnly
                  disabled
                  aria-label={ui('convRateOriginCurrency')}
                  data-testid="convrate-dialog-origin" />
              </Field>
              <Field label={ui('convRateDestinationCurrency')} required={isNewCurrency} data-testid="Field__convrate-destination">
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
                <div className="grid grid-cols-2 gap-3">
                  <Field label={ui('convRateValidFromDateTime')} data-testid="Field__convrate-from">
                    <Input
                      value={formatWallClock(row?.validFromDate)}
                      readOnly
                      disabled
                      aria-label={ui('convRateValidFromDateTime')}
                      data-testid="convrate-dialog-valid-from" />
                  </Field>
                  <Field label={ui('convRateValidToDateTime')} data-testid="Field__convrate-to">
                    <Input
                      value={displayValidTo(row) ?? ui('convRateOpenEnd')}
                      readOnly
                      disabled
                      aria-label={ui('convRateValidToDateTime')}
                      data-testid="convrate-dialog-valid-to" />
                  </Field>
                </div>
                <div className="-mt-1.5 text-xs text-muted-foreground" data-testid="convrate-dialog-edit-hint">
                  {ui('convRateEditOnlyRate')}
                </div>
              </>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {rateField}
                {validFromField}
              </div>
            )}

            {isEdit && row && (
              <>
                <EditSummary
                  row={row}
                  rate={rate}
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
    </Dialog>
  );
}

export default ManualRateDialog;
