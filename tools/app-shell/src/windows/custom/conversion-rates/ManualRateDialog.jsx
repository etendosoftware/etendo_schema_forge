import { useEffect, useMemo, useRef, useState } from 'react';
import { WarningCircleIcon, XIcon } from '@phosphor-icons/react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog.jsx';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { DateField } from '@/components/ui/date-field';
import { Button } from '@/components/ui/button';
import { parseLocaleNumber } from '@/lib/parseLocaleNumber.js';
import { formatPlainDecimal } from '@/lib/formatCurrency.js';
import { extractErrorMessage } from '@/hooks/useEntity.js';
import { OriginBadge } from './ConversionRateBadges.jsx';
import { formatRate } from './CurrentRatesSection.jsx';
import {
  fetchManualCurrencyOptions, previewManualRate, createManualRate, updateManualRate,
} from './conversionRatesApi.js';
import {
  formatWallClock, formatWallClockDate, nowWallClock, parseWallClock, toWallClock,
  wallClockDate, wallClockTime, isOpenEnded,
} from './conversionRatesModel.js';

/** Debounce of the preview request while the user types. */
export const PREVIEW_DEBOUNCE_MS = 350;

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * The dialog modes:
 * - `newCurrency` — "Nueva divisa": the destination is picked among the active currencies that
 *   have no rates yet (`manualCurrencyOptions {withoutRates: true}`);
 * - `newRate` — "Nueva tasa · CHF": the destination is fixed (a manual card or group header);
 * - `edit` — "Modificar tasa · CHF": PATCH of a manual, unlocked row's rate and start.
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

function initialState(mode, row) {
  if (mode === DIALOG_MODES.EDIT && row) {
    return {
      rateText: formatPlainDecimal(row.multipleRateBy),
      dateIso: wallClockDate(row.validFromDate),
      time: wallClockTime(row.validFromDate),
    };
  }
  const now = nowWallClock();
  return { rateText: '', dateIso: wallClockDate(now), time: wallClockTime(now) };
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

const READONLY_INPUT = 'flex h-10 w-full rounded-lg border border-border bg-muted px-3 text-sm text-muted-foreground';
const LABEL = 'flex flex-col gap-1.5 text-[13px] font-medium';

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
  const destIso = dest?.isoCode ?? '';
  const destCurrencyId = dest?.currencyId ?? null;

  const rate = parseRateInput(form.rateText);
  const validFrom = composeValidFrom(form.dateIso, form.time);
  const rateError = touched.rate && rate == null ? ui('convRateRateRequired') : null;
  const dateError = touched.date && validFrom == null ? ui('convRateValidFromRequired') : null;
  const inputsValid = Boolean(dest && rate != null && validFrom);

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
  const canSubmit = inputsValid && !submitting && !previewError;

  async function submit(event) {
    event?.preventDefault();
    setTouched({ rate: true, date: true });
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      let res;
      if (isEdit) {
        const body = {};
        if (rate !== Number(row.multipleRateBy)) body.multipleRateBy = rate;
        if (validFrom !== toWallClock(parseWallClock(row.validFromDate))) body.validFromDate = validFrom;
        if (Object.keys(body).length === 0) {
          onClose();
          return;
        }
        res = await updateManualRate(apiFetch, row.id, body);
      } else {
        res = await createManualRate(apiFetch, {
          toCurrency: dest.currencyId,
          multipleRateBy: rate,
          validFromDate: validFrom,
        });
      }
      if (!res.ok) {
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
  if (isEdit) submitLabel = ui('save');

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
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              aria-label={ui('close')}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              data-testid="convrate-dialog-close">
              <XIcon className="h-[18px] w-[18px]" aria-hidden="true" data-testid="XIcon__convrate" />
            </button>
          </DialogHeader>
          <DialogDescription className="sr-only" data-testid="DialogDescription__51f9a2">{ui('convRateDialogDescription')}</DialogDescription>

          <div className="flex flex-col gap-4 px-[22px] py-5">
            <div className="grid grid-cols-2 gap-3">
              <label className={LABEL}>
                {ui('convRateOriginCurrency')}
                <input value={orgText ?? ''} readOnly tabIndex={-1} className={READONLY_INPUT} data-testid="convrate-dialog-origin" />
              </label>
              {isNewCurrency ? (
                <div className={LABEL}>
                  <span id="convrate-dest-label">{ui('convRateDestinationCurrency')}</span>
                  <Select value={destId ?? ''} onValueChange={setDestId} data-testid="Select__convrate-dest">
                    <SelectTrigger
                      aria-labelledby="convrate-dest-label"
                      disabled={optionsLoaded && options.length === 0}
                      data-testid="convrate-dialog-destination">
                      <SelectValue placeholder={ui('convRateSelectCurrency')} data-testid="SelectValue__convrate-dest" />
                    </SelectTrigger>
                    <SelectContent data-testid="SelectContent__convrate-dest">
                      {options.map((o) => (
                        <SelectItem key={o.id} value={o.id} data-testid={`convrate-dest-option-${o.isoCode}`}>
                          {[o.isoCode, o.name].filter(Boolean).join(' · ')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <label className={LABEL}>
                  {ui('convRateDestinationCurrency')}
                  <input value={destText} readOnly tabIndex={-1} className={READONLY_INPUT} data-testid="convrate-dialog-destination" />
                </label>
              )}
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

            <div className="grid grid-cols-2 gap-3">
              <div className={LABEL}>
                <label htmlFor="convrate-rate-input">{ui('convRateRate')}</label>
                <span
                  className={`flex h-10 items-center gap-1.5 rounded-lg border bg-card px-3 font-normal focus-within:ring-2 focus-within:ring-focus-ring ${rateError ? 'border-destructive' : 'border-border-control'}`}>
                  <span className="whitespace-nowrap text-muted-foreground">{ui('convRateOneOrg', { currency: orgIso })}</span>
                  <input
                    id="convrate-rate-input"
                    value={form.rateText}
                    onChange={(e) => setForm((f) => ({ ...f, rateText: e.target.value }))}
                    onBlur={() => setTouched((t) => ({ ...t, rate: true }))}
                    inputMode="decimal"
                    autoComplete="off"
                    required
                    aria-invalid={rateError ? true : undefined}
                    aria-describedby={rateError ? 'convrate-rate-error' : undefined}
                    className="w-full min-w-0 border-0 bg-transparent text-sm outline-none"
                    data-testid="convrate-dialog-rate" />
                  <span className="text-muted-foreground">{destIso}</span>
                </span>
                {rateError && (
                  <span id="convrate-rate-error" className="text-xs font-normal text-destructive" data-testid="convrate-dialog-rate-error">
                    {rateError}
                  </span>
                )}
              </div>
              <div className={LABEL}>
                <span id="convrate-from-label">{ui('convRateValidFromDateTime')}</span>
                <div className="flex gap-2" role="group" aria-labelledby="convrate-from-label">
                  <DateField
                    value={form.dateIso}
                    onChange={(iso) => {
                      setForm((f) => ({ ...f, dateIso: iso }));
                      setTouched((t) => ({ ...t, date: true }));
                    }}
                    required
                    data-testid="convrate-dialog-date" />
                  <input
                    type="time"
                    value={form.time}
                    onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
                    onBlur={() => setTouched((t) => ({ ...t, date: true }))}
                    required
                    aria-label={ui('convRateTime')}
                    aria-invalid={dateError ? true : undefined}
                    className={`h-10 w-[92px] shrink-0 rounded-lg border bg-card px-2 text-sm font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring ${dateError ? 'border-destructive' : 'border-border-control'}`}
                    data-testid="convrate-dialog-time" />
                </div>
                {dateError ? (
                  <span className="text-xs font-normal text-destructive" data-testid="convrate-dialog-date-error">{dateError}</span>
                ) : (
                  mode === DIALOG_MODES.NEW_RATE && (
                    <span className="text-xs font-normal text-muted-foreground">{ui('convRateValidFromHint')}</span>
                  )
                )}
              </div>
            </div>

            {!isEdit && (
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
