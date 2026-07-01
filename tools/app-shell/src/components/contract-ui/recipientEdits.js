const EMAIL_PATTERN = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;

export function normalizeEmailAddress(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return '';
  const at = trimmed.lastIndexOf('@');
  if (at < 0) return trimmed;
  return trimmed.slice(0, at) + '@' + trimmed.slice(at + 1).toLowerCase();
}

export function isValidEmailAddress(value) {
  const normalized = normalizeEmailAddress(value);
  return normalized !== '' && EMAIL_PATTERN.test(normalized);
}

export function normalizeRecipientList(values) {
  const seen = new Set();
  const result = [];
  for (const value of values ?? []) {
    const normalized = normalizeEmailAddress(value);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

/**
 * Diffs the trusted base To list against the user's final channel lists.
 * Returns null when nothing changed so untouched sends stay byte-identical.
 */
export function buildRecipientEdits(baseRecipients, finalRecipientsByChannel) {
  const base = normalizeRecipientList(baseRecipients);
  const finalTo = normalizeRecipientList(finalRecipientsByChannel?.to);
  const finalCc = normalizeRecipientList(finalRecipientsByChannel?.cc);
  const baseKeys = new Set(base.map(a => a.toLowerCase()));
  const finalToKeys = new Set(finalTo.map(a => a.toLowerCase()));

  const toAdd = finalTo.filter(a => !baseKeys.has(a.toLowerCase()));
  const toRemove = base.filter(a => !finalToKeys.has(a.toLowerCase()));

  const edits = {};
  if (toAdd.length || toRemove.length) {
    edits.to = {};
    if (toAdd.length) edits.to.add = toAdd;
    if (toRemove.length) edits.to.remove = toRemove;
  }
  if (finalCc.length) {
    edits.cc = { add: finalCc };
  }
  return Object.keys(edits).length ? edits : null;
}
