/**
 * ETP-6365 — Currency Conversion requests. Every call goes through the `apiFetch` the page got
 * from `useApiFetch(apiBaseUrl)`, whose base is the spec (`/sws/neo/conversion-rates`), so the
 * paths below are relative to it:
 *
 * - list           GET    /conversionRate?criteria=…           (forward rows only, see the model)
 * - create         POST   /conversionRate                       {toCurrency, multipleRateBy, validFromDate}
 * - update         PATCH  /conversionRate/{id}                  {multipleRateBy?, validFromDate?}
 * - delete         DELETE /conversionRate/{id}                  (the server removes both directions)
 * - read actions   POST   /conversionRate/new/action/{name}     answer in `response.data`
 *     manualCurrencyOptions {withoutRates?} → [{id, isoCode, name, symbol}]
 *     previewManualRate {toCurrency, multipleRateBy, validFromDate} → {creates, closes, error?, errorKey?}
 *     currentRates → [{currencyId, isoCode, name, symbol, origin, rate, validFrom, lastDownloadAt}]
 *     serverClock → {now: "yyyy-MM-ddTHH:mm:00"} (the server's wall clock: default and upper bound
 *       of "Válido desde", which can never be later than now)
 *
 * The server creates the inverse rate, closes the previous open range at `start − 1 minute`
 * and refuses overlaps; the UI never computes any of that, it only shows the preview.
 */
import { buildHistoryQuery } from './conversionRatesModel.js';

export const ENTITY_PATH = '/conversionRate';

function actionPath(name) {
  return `${ENTITY_PATH}/new/action/${name}`;
}

async function readJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

class RatesRequestError extends Error {
  constructor(status) {
    super(`HTTP ${status}`);
    this.name = 'RatesRequestError';
    this.status = status;
  }
}

async function postAction(apiFetch, name, body, signal) {
  const res = await apiFetch(actionPath(name), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
    signal,
  });
  if (!res.ok) throw new RatesRequestError(res.status);
  const json = await readJson(res);
  return json?.response?.data;
}

/** Forward rows of the history matching `criteria`, newest first. */
export async function fetchHistory(apiFetch, criteria, signal) {
  const res = await apiFetch(`${ENTITY_PATH}?${buildHistoryQuery(criteria)}`, { signal });
  if (!res.ok) throw new RatesRequestError(res.status);
  const json = await readJson(res);
  return json?.response?.data ?? [];
}

/** The rate in force today for every currency that has one (the "Vigentes hoy" cards). */
export async function fetchCurrentRates(apiFetch, signal) {
  const data = await postAction(apiFetch, 'currentRates', {}, signal);
  return Array.isArray(data) ? data : [];
}

/** The server's current minute, `yyyy-MM-ddTHH:mm:00` wall clock, or null when unavailable. */
export async function fetchServerClock(apiFetch, signal) {
  const data = await postAction(apiFetch, 'serverClock', {}, signal);
  return typeof data?.now === 'string' ? data.now : null;
}

/** Active currencies that can still receive a FIRST manual rate (no rates yet, never USD/GBP). */
export async function fetchManualCurrencyOptions(apiFetch, signal) {
  const data = await postAction(apiFetch, 'manualCurrencyOptions', { withoutRates: true }, signal);
  return Array.isArray(data) ? data : [];
}

/**
 * What creating the rate would do (two creates, the ranges it closes) or why it would be
 * refused (`error`, HTTP 200 all the same). Read-only.
 */
export async function previewManualRate(apiFetch, body, signal) {
  return (await postAction(apiFetch, 'previewManualRate', body, signal)) ?? null;
}

/**
 * Write helpers resolve to the raw `Response`: the caller reads the NEO error envelope
 * (`extractErrorMessage`) on a refusal (400/409/422) and shows its translated message as is.
 */
export function createManualRate(apiFetch, body) {
  return apiFetch(ENTITY_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function updateManualRate(apiFetch, id, body) {
  return apiFetch(`${ENTITY_PATH}/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function deleteManualRate(apiFetch, id) {
  return apiFetch(`${ENTITY_PATH}/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
