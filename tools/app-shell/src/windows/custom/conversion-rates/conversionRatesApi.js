/**
 * ETP-6365 — Currency Conversion requests. Every call goes through the `apiFetch` the page got
 * from `useApiFetch(apiBaseUrl)`, whose base is the spec (`/sws/neo/conversion-rates`), so the
 * paths below are relative to it:
 *
 * - list           GET    /conversionRate?criteria=…           (forward rows only, see the model)
 * - delete         DELETE /conversionRate/{id}                  (the server removes both directions)
 * - actions        POST   /conversionRate/new/action/{name}     answer in `response.data`
 *     manualCurrencyOptions {withoutRates?} → [{id, isoCode, name, symbol}]
 *     previewManualRate {mode: "newCurrency"|"newRate", toCurrency, multipleRateBy, validFromDate}
 *       → {creates, closes, error?, errorKey?, errorField?}
 *     createManualCurrency {toCurrency, multipleRateBy, validFromDate?}   ("Nueva divisa")
 *     createManualRate {toCurrency, multipleRateBy, validFromDate?}       ("Nueva tasa")
 *       (both answer the forward row; 409 ETGO_ConvRateCurrencyHasRates / ETGO_ConvRateCurrencyNoRates
 *       carry `error.field: "toCurrency"`)
 * - record action  POST   /conversionRate/{id}/action/updateManualRate  {multipleRateBy, confirm?}
 *       ("Modificar tasa"; `multipleRateBy` is always the FORWARD rate, 1 org = X). Without
 *       `confirm` it saves nothing and answers {saved: false, proposal: {forward: {fromIso, toIso,
 *       old, new}, inverse: {fromIso, toIso, old, new}, validFrom, validTo (null when open)},
 *       warning}; with `confirm: true` it saves and answers the forward row.
 * Generic POST/PUT/PATCH are closed (405 ETGO_ConvRateUseActions).
 *     currentRates → [{currencyId, isoCode, name, symbol, origin, rate, validFrom, lastDownloadAt}]
 *     serverClock → {now: "yyyy-MM-ddTHH:mm:00"} (the server's wall clock: default and upper bound
 *       of "Válido desde", which can never be later than now)
 *
 * The writes go through the same actions the MCP uses, so both channels run one process: the
 * server creates the inverse rate, closes the previous open range at `start − 1 minute`, refuses
 * overlaps and future starts, and proposes the inverse of an edit. The UI computes none of that.
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
 * A write action. Resolves to `{ res, data }`: the raw `Response` (a refusal — 400 / 409 / 422 —
 * is read by the caller through `extractErrorMessage`, whose body is still unread thanks to the
 * clone) and `response.data` of a 2xx answer (`data.error` when the action refuses in-band).
 */
async function writeAction(apiFetch, name, body, signal, path = actionPath(name)) {
  const res = await apiFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  const json = res.ok ? await readJson(res.clone()) : null;
  return { res, data: json?.response?.data ?? null };
}

/** "Nueva divisa": the first two rates of a currency with none. */
export function createManualCurrency(apiFetch, body) {
  return writeAction(apiFetch, 'createManualCurrency', body);
}

/** "Nueva tasa": a new range for a manual currency, closing the one in force. */
export function createManualRate(apiFetch, body) {
  return writeAction(apiFetch, 'createManualRate', body);
}

/**
 * "Modificar tasa": without `confirm` the server only proposes (`{saved: false, proposal,
 * warning}`); with `confirm: true` it saves both directions.
 */
export function updateManualRate(apiFetch, { id, multipleRateBy, confirm = false }, signal) {
  return writeAction(
    apiFetch,
    'updateManualRate',
    confirm ? { multipleRateBy, confirm: true } : { multipleRateBy },
    signal,
    `${ENTITY_PATH}/${encodeURIComponent(id)}/action/updateManualRate`,
  );
}

export function deleteManualRate(apiFetch, id) {
  return apiFetch(`${ENTITY_PATH}/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
