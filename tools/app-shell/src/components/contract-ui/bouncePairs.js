/**
 * Pure logic of the bounce pairs of the bank reconciliation (ETP-5581).
 *
 * A bounce ("rechazo" bancario in the UI) is an outgoing bank-statement line plus the line that reverses it: opposite
 * sign, exact amount, a few days later. The backend (com.etendoerp.go, behind the per-account flag
 * `bank-bounce-suggestions`) detects them; the SPA only renders what it answers:
 * - `autoMatch` groups with `kind: "bouncePair"` (the flag-off answer has no `kind` at all, and a
 *   group without one is a transaction group);
 * - `pendingLines` rows in the `bounce` state with a `bouncePair` annotation (role `original`,
 *   `bounce` or `candidate`), and `counts.bounce`;
 * - `pendingLines?status=discarded`, the discarded lines with their `bounceLink`.
 * Contract: com.etendoerp.go docs/neo-headless.md §4.12.1.1, "Discarded lines and bounce pairs".
 *
 * Plain `.js` (no JSX) so node:test can import it, same arrangement as
 * `reconciliationStatusFilter.js`.
 */

import { parseCalendarDate } from '../../lib/dateOnly.js';

/** `kind` of an autoMatch group that is a bounce pair. */
export const BOUNCE_PAIR_KIND = 'bouncePair';
/** Line state of a line of a detected pair (pendingLines). */
export const BOUNCE_STATE = 'bounce';
/** Line state of a discarded line (pendingLines?status=discarded). */
export const DISCARDED_STATE = 'discarded';
/** Confidence the backend gives a pair it would discard without asking. */
export const HIGH_CONFIDENCE = 'high';

const SIGNAL_PIS_LINK = 'pis_link';
const SIGNAL_RETURN_TEXT = 'return_text';
const SIGNAL_COUNTERPARTY = 'counterparty';

/** i18n key of the signal named in a high-confidence notice. */
const SIGNAL_LABEL_KEY = {
  [SIGNAL_PIS_LINK]: 'financeReconcileBounceSignalPisLink',
  [SIGNAL_RETURN_TEXT]: 'financeReconcileBounceSignalReturnText',
  [SIGNAL_COUNTERPARTY]: 'financeReconcileBounceSignalCounterparty',
};

/** i18n keys of each review reason: the short form (modal tag) and the long one (panel notice). */
const REASON_KEYS = {
  ambiguous: {
    short: 'financeReconcileBounceReasonAmbiguousShort',
    long: 'financeReconcileBounceReasonAmbiguous',
  },
  counterpartyOnly: {
    short: 'financeReconcileBounceReasonCounterpartyShort',
    long: 'financeReconcileBounceReasonCounterparty',
  },
  late: {
    short: 'financeReconcileBounceReasonLateShort',
    long: 'financeReconcileBounceReasonLate',
  },
  check: {
    short: 'financeReconcileBounceReasonCheckShort',
    long: 'financeReconcileBounceReasonCheck',
  },
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Whether an autoMatch group is a bounce pair. A group with no `kind` is a transaction group: that
 * is the whole flag-off answer.
 *
 * @param {object|null|undefined} group
 * @returns {boolean}
 */
export function isBouncePairGroup(group) {
  return group?.kind === BOUNCE_PAIR_KIND;
}

/**
 * Splits the autoMatch groups into transaction groups and bounce pairs, keeping each in the order
 * the backend sent it.
 *
 * @param {Array<object>} [groups]
 * @returns {{ transactionGroups: Array<object>, bouncePairs: Array<object> }}
 */
export function splitAutoMatchGroups(groups = []) {
  const transactionGroups = [];
  const bouncePairs = [];
  for (const group of groups ?? []) {
    if (isBouncePairGroup(group)) bouncePairs.push(group);
    else transactionGroups.push(group);
  }
  return { transactionGroups, bouncePairs };
}

/**
 * Whether a pair (an autoMatch group or a `bouncePair` row annotation) has several candidate
 * originals. Such a pair names no original, so it cannot be discarded until one is chosen.
 *
 * @param {object|null|undefined} pair
 * @returns {boolean}
 */
export function isAmbiguousPair(pair) {
  return !!pair?.ambiguous;
}

/**
 * Whether an autoMatch group can be checked in the modal. Every transaction group can; a bounce
 * pair only when it names both lines, i.e. it is not ambiguous.
 *
 * @param {object|null|undefined} group
 * @returns {boolean}
 */
export function isSelectableGroup(group) {
  if (!isBouncePairGroup(group)) return true;
  return !isAmbiguousPair(group) && !!group.statementLine?.id && !!group.counterpartLine?.id;
}

/**
 * Whether an autoMatch group starts checked: every transaction group (as before ETP-5581), and a
 * bounce pair only with high confidence. A pair "to review" starts unchecked.
 *
 * @param {object|null|undefined} group
 * @returns {boolean}
 */
export function defaultGroupChecked(group) {
  if (!isBouncePairGroup(group)) return true;
  return isSelectableGroup(group) && group.confidence === HIGH_CONFIDENCE;
}

/**
 * The `applySuggestions` body entry of a bounce pair.
 *
 * @param {object} group a selectable bounce-pair group
 * @returns {{ kind: string, statementLineId: string, counterpartLineId: string }}
 */
export function bouncePairPayload(group) {
  return {
    kind: BOUNCE_PAIR_KIND,
    statementLineId: group.statementLine?.id,
    counterpartLineId: group.counterpartLine?.id,
  };
}

/**
 * The `applySuggestions` body key that reports, for the KPI events the backend emits, what became of
 * every bounce pair the modal SHOWED but is not applying (ETP-5581). One constant, so the field name
 * lives in one place.
 */
export const BOUNCE_DECISIONS_KEY = 'bounceDecisions';

/** The decision a shown, not-applied pair is reported with in {@link BOUNCE_DECISIONS_KEY}. */
export const BOUNCE_DECISION = Object.freeze({
  /** Left (or turned) unchecked in the modal. */
  UNCHECKED: 'unchecked',
  /** Sent to the panel with "Revisar en el panel" during this modal session, and not re-checked. */
  SENT_TO_PANEL: 'sent_to_panel',
});

/**
 * The {@link BOUNCE_DECISIONS_KEY} entries of an apply: one per shown pair that is not checked
 * (an ambiguous pair, which cannot be checked, included). A checked pair is not listed: it travels
 * in `groups` as before. Only the `groupKey` goes, never a line id, amount or text.
 *
 * @param {Array<object>} pairs the bounce pairs the modal shows (dismissed ones already left out)
 * @param {(group: object) => boolean} isChecked the modal's check state
 * @param {Set<string>|null} [sentToPanelKeys] pairs sent to the panel during this modal session
 * @returns {Array<{ groupKey: string, decision: string }>}
 */
export function bounceDecisions(pairs, isChecked, sentToPanelKeys = null) {
  return (pairs ?? [])
    .filter((pair) => pair?.groupKey && !isChecked(pair))
    .map((pair) => ({
      groupKey: pair.groupKey,
      decision: sentToPanelKeys?.has(pair.groupKey)
        ? BOUNCE_DECISION.SENT_TO_PANEL
        : BOUNCE_DECISION.UNCHECKED,
    }));
}

/**
 * The `applySuggestions` body with {@link BOUNCE_DECISIONS_KEY} added — only when the modal showed
 * bounce pairs; an apply without pairs keeps the body it always had.
 *
 * @param {object} payload the body without bounce decisions
 * @param {Array<object>} pairs the bounce pairs the modal shows
 * @param {(group: object) => boolean} isChecked
 * @param {Set<string>|null} [sentToPanelKeys]
 * @returns {object}
 */
export function withBounceDecisions(payload, pairs, isChecked, sentToPanelKeys = null) {
  if (!pairs?.length) return payload;
  return { ...payload, [BOUNCE_DECISIONS_KEY]: bounceDecisions(pairs, isChecked, sentToPanelKeys) };
}

/**
 * The `dismissPair` body of "No es un rechazo" (ETP-5581): the line selected in the panel and, when
 * the card shows one, the other line of the pair (the chosen original of an ambiguous pair; left
 * out while none is chosen). Null when there is no line.
 *
 * @param {string} financialAccountId
 * @param {object|null} line the selected row
 * @param {object|null} model its {@link bouncePanelModel}
 * @returns {{ financialAccountId: string, statementLineId: string, counterpartLineId?: string }|null}
 */
export function dismissPairPayload(financialAccountId, line, model) {
  if (!line?.id) return null;
  const counterpartLineId = model?.other?.id ?? null;
  return {
    financialAccountId,
    statementLineId: line.id,
    ...(counterpartLineId ? { counterpartLineId } : {}),
  };
}

/**
 * The original lines a pair offers: its candidates when ambiguous, else its original.
 *
 * @param {object} group an autoMatch bounce-pair group
 * @returns {Array<object>}
 */
export function pairOriginalLines(group) {
  if (isAmbiguousPair(group)) {
    return (group.candidates ?? []).map((c) => c?.line).filter(Boolean);
  }
  return group?.statementLine ? [group.statementLine] : [];
}

/**
 * Whole days from `fromRaw` to `toRaw`, both business dates, or null when either is missing.
 * Goes through `parseCalendarDate`, so the host's timezone never shifts a day.
 *
 * @param {string|null|undefined} fromRaw
 * @param {string|null|undefined} toRaw
 * @returns {number|null}
 */
export function daysBetween(fromRaw, toRaw) {
  const from = parseCalendarDate(fromRaw);
  const to = parseCalendarDate(toRaw);
  if (!from || !to) return null;
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);
}

/**
 * Why a pair is offered with the confidence it has, as i18n keys and their parameters.
 *
 * The backend sends the confidence and the signals, not a sentence. Its rule
 * (`BankBounceDetector.confidence`) is: high with bounce wording on the same day, or with a PSD2
 * payment link backed by timing or wording, and never when ambiguous. So a "review" pair is one of:
 * - ambiguous (several originals);
 * - only the counterparty matches (no wording, no payment link);
 * - wording or a payment link, but the bounce came days later;
 * - anything else (e.g. an ambiguous group reduced to one candidate by the payment guard), which
 *   only asks the user to check the original.
 *
 * @param {object} pair an autoMatch group or a `bouncePair` annotation
 * @param {object|null} original the original line (null when unknown)
 * @param {object|null} bounce the bounce line
 * @returns {{ high: true, signalKey: string|null }
 *   | { high: false, shortKey: string, longKey: string, params: object }}
 */
export function bounceReason(pair, original, bounce) {
  if (pair?.confidence === HIGH_CONFIDENCE && !isAmbiguousPair(pair)) {
    return { high: true, signalKey: SIGNAL_LABEL_KEY[pair.signal] ?? null };
  }
  const reason = reviewReason(pair, original, bounce);
  return {
    high: false,
    shortKey: REASON_KEYS[reason.code].short,
    longKey: REASON_KEYS[reason.code].long,
    params: reason.params,
  };
}

/** The review reason code and its parameters; see {@link bounceReason}. */
function reviewReason(pair, original, bounce) {
  if (isAmbiguousPair(pair)) {
    // Only the bounce line (and the autoMatch group) carries the candidates; the annotation of a
    // `candidate` line does not, so there the count is unknown and the user is asked to check.
    const count = (pair.candidates ?? []).length;
    return count > 1 ? { code: 'ambiguous', params: { count } } : { code: 'check', params: {} };
  }
  const signals = Array.isArray(pair?.signals) ? pair.signals : [];
  const strong = signals.includes(SIGNAL_PIS_LINK) || signals.includes(SIGNAL_RETURN_TEXT);
  if (!strong && signals.includes(SIGNAL_COUNTERPARTY)) {
    return { code: 'counterpartyOnly', params: {} };
  }
  const days = daysBetween(original?.date, bounce?.date);
  if (strong && days != null && days > 0) {
    return { code: 'late', params: { days } };
  }
  return { code: 'check', params: {} };
}

/**
 * Sum of two signed line amounts, rounded to cents. The net effect of a pair; 0 for a real bounce.
 *
 * @param {object|null} a
 * @param {object|null} b
 * @returns {number|null} null when either line is missing
 */
export function pairNet(a, b) {
  if (!a || !b || a.amount == null || b.amount == null) return null;
  return Number(((Number(a.amount) || 0) + (Number(b.amount) || 0)).toFixed(2));
}

/**
 * The `status` parameter of the left panel's `pendingLines` request: `discarded` while that filter
 * is active, nothing otherwise (every other filter is applied client-side over the default answer,
 * and the backend answers `status=discarded` with the discarded lines only).
 *
 * @param {string|null|undefined} status the active filter code
 * @returns {string|undefined}
 */
export function pendingLinesStatusParam(status) {
  return status === DISCARDED_STATE ? DISCARDED_STATE : undefined;
}

/**
 * Whether the reconciliation panel shows the bounce-pair panel, instead of the candidate
 * operations, for this line: a line of a detected pair, or a discarded line.
 *
 * @param {object|null|undefined} line a pendingLines row as shown (after dismissals)
 * @returns {boolean}
 */
export function isBounceReviewLine(line) {
  if (!line) return false;
  if (line.state === DISCARDED_STATE) return true;
  return line.state === BOUNCE_STATE && !!line.bouncePair;
}

/**
 * The pendingLines rows with every line of a dismissed pair ("No es un rechazo") turned back into a
 * plain pending line. Nothing is persisted: the backend still proposes the pair, the user just
 * asked not to see it again in this session.
 *
 * Only a pending line can be offered as a bounce (`BankBounceSuggestions.PanelView.finish`), so
 * `pending` is the state it had before.
 *
 * @param {Array<object>} lines
 * @param {Set<string>} dismissedKeys `groupKey`s of the dismissed pairs
 * @returns {Array<object>} the same array when nothing changes
 */
export function withDismissedPairs(lines, dismissedKeys) {
  if (!dismissedKeys || dismissedKeys.size === 0) return lines;
  let changed = false;
  const out = lines.map((line) => {
    if (line?.state !== BOUNCE_STATE || !dismissedKeys.has(line.bouncePair?.groupKey)) return line;
    changed = true;
    const rest = { ...line, state: 'pending' };
    delete rest.bouncePair;
    return rest;
  });
  return changed ? out : lines;
}

/**
 * The per-state counts after {@link withDismissedPairs}: each line turned back moves from
 * `bounce` to `pending`. `all` does not change.
 *
 * @param {Record<string, number>} counts per-state counts from pendingLines
 * @param {Array<object>} lines the rows as the backend sent them
 * @param {Set<string>} dismissedKeys
 * @returns {Record<string, number>} the same object when nothing changes
 */
export function countsWithDismissedPairs(counts, lines, dismissedKeys) {
  if (!dismissedKeys || dismissedKeys.size === 0 || counts?.bounce == null) return counts;
  const moved = lines.filter((line) => line?.state === BOUNCE_STATE
    && dismissedKeys.has(line.bouncePair?.groupKey)).length;
  if (moved === 0) return counts;
  return {
    ...counts,
    bounce: Math.max(0, (Number(counts.bounce) || 0) - moved),
    pending: (Number(counts.pending) || 0) + moved,
  };
}

/**
 * What the bounce-pair panel shows for the selected line, or null when it is not a bounce or
 * discarded line.
 *
 * - The BOUNCE line of a pair lists its possible originals: the original, or the candidates of an
 *   ambiguous pair, which the user picks with a radio (`chosenOriginalId`).
 * - An ORIGINAL or a CANDIDATE line lists the bounce line; the selected line is the original.
 * - A DISCARDED line lists the line it was discarded with (`bounceLink.counterpartLineId`, looked
 *   up in `discardedLines`), or nothing when it was discarded on its own (Classic's per-line
 *   discard).
 *
 * `discard` is the `discardPair` body (original as `statementLineId`, bounce as
 * `counterpartLineId`, the same shape as the autoMatch group), null while no original is chosen.
 *
 * @param {object|null} line the selected row
 * @param {{ discardedLines?: Array<object>, chosenOriginalId?: string|null }} [options]
 * @returns {object|null}
 */
export function bouncePanelModel(line, { discardedLines = [], chosenOriginalId = null } = {}) {
  if (!line) return null;
  if (line.state === DISCARDED_STATE) return discardedModel(line, discardedLines);
  const pair = line.state === BOUNCE_STATE ? line.bouncePair : null;
  if (!pair) return null;
  if (pair.role === 'bounce') return bounceRoleModel(line, pair, chosenOriginalId);
  const bounce = pair.counterpartLine ?? null;
  return {
    mode: BOUNCE_STATE,
    role: pair.role,
    pair,
    rows: bounce ? [bounce] : [],
    rowBadge: 'bounce',
    selectable: false,
    chosenId: bounce?.id ?? null,
    other: bounce,
    reason: bounceReason(pair, line, bounce),
    discard: bounce ? { statementLineId: line.id, counterpartLineId: bounce.id } : null,
    net: pairNet(line, bounce),
  };
}

/** {@link bouncePanelModel} for the bounce line of a pair. */
function bounceRoleModel(line, pair, chosenOriginalId) {
  const ambiguous = isAmbiguousPair(pair);
  const options = ambiguous
    ? (pair.candidates ?? []).map((c) => c?.line).filter(Boolean)
    : [pair.counterpartLine].filter(Boolean);
  let chosen = null;
  if (ambiguous) chosen = options.find((o) => o.id === chosenOriginalId) ?? null;
  else chosen = options[0] ?? null;
  return {
    mode: BOUNCE_STATE,
    role: 'bounce',
    pair,
    rows: options,
    rowBadge: 'bounceOriginal',
    selectable: ambiguous,
    chosenId: chosen?.id ?? null,
    other: chosen,
    reason: bounceReason(pair, chosen, line),
    discard: chosen ? { statementLineId: chosen.id, counterpartLineId: line.id } : null,
    net: pairNet(line, chosen),
  };
}

/** {@link bouncePanelModel} for a discarded line. */
function discardedModel(line, discardedLines) {
  const link = line.bounceLink ?? null;
  const counterpartId = link?.counterpartLineId ?? null;
  const counterpart = counterpartId
    ? (discardedLines.find((l) => l.id === counterpartId) ?? null)
    : null;
  return {
    mode: DISCARDED_STATE,
    link,
    rows: counterpart ? [counterpart] : [],
    rowBadge: DISCARDED_STATE,
    other: counterpart,
    paired: !!counterpartId,
    net: pairNet(line, counterpart),
  };
}

/**
 * The outcome of an `applySuggestions` call that carried bounce pairs: how many transaction groups
 * and pairs succeeded, and the failed entries (a bounce refusal carries `code` and `error`).
 *
 * @param {Array<object>} results the `results` of the answer
 * @returns {{ groupsOk: number, pairsOk: number, failures: Array<object> }}
 */
export function summarizeApplyResults(results = []) {
  let groupsOk = 0;
  let pairsOk = 0;
  const failures = [];
  for (const r of results ?? []) {
    if (r?.error) {
      failures.push(r);
    } else if (r?.kind === BOUNCE_PAIR_KIND) {
      pairsOk += 1;
    } else {
      groupsOk += 1;
    }
  }
  return { groupsOk, pairsOk, failures };
}
