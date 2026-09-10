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

// A form/grid field is email-format-validated when its type is 'email' or its
// key/column contains "email" (case-insensitive) — but only for text-like inputs
// so a boolean/select field whose name happens to contain "email" (e.g. a
// "sendEmail" checkbox or an "emailTemplate" selector) is never treated as an
// email input. Shared by the form path (useEntity) and the grid paths
// (DataTable inline-add + InlineLinesPanel inline-edit) so detection stays DRY.
// SMTP credential fields (EmailUser, EmailUserPW, Email_Password…) also contain
// "email" but hold a username/password, not an address — they are excluded so a
// future editable exposure of one can never block a save by mis-validating it.
const EMAIL_CREDENTIAL_RE = /email_?(user(name)?|pw|password)/i;

export function isEmailField(field) {
  if (!field) return false;
  if (field.type === 'email') return true;
  const textLike = field.type == null || field.type === 'text' || field.type === 'string' || field.type === 'textarea';
  if (!textLike) return false;
  const key = String(field.key ?? '');
  const col = String(field.column ?? '');
  if (EMAIL_CREDENTIAL_RE.test(key) || EMAIL_CREDENTIAL_RE.test(col)) return false;
  return /email/i.test(key) || /email/i.test(col);
}

// ETP-4749: when a field declares `inputPrefix` (a fixed, non-editable chip rendered
// before the input — e.g. "https://" — whose text is NOT part of the stored value),
// the stored `value` only holds the part after the chip. Reconstructs the full value
// before format-checking so a prefixed field validates identically to an unprefixed
// one that stores its full value directly. Generic on purpose — not website-specific —
// so any future email/phone field that adopts a fixed prefix gets this for free.
//
// Deliberately takes the RAW value (not the caller's already-trimmed copy): the
// downstream isValidEmailAddress/isSecureUrl/isValidPhone each trim their own input
// anyway, but ONLY at the outer edges of the string they receive. A stray leading
// space in the STORED suffix (e.g. " example.com") would sit in the middle of the
// reconstructed string ("https:// example.com") — trimming `value` here first before
// prepending the prefix would silently swallow that space and hide a real malformed
// value. Passing raw `value` keeps that edge reachable while staying byte-identical
// for fields with no inputPrefix (the trim happens downstream exactly as before).
function withInputPrefix(field, value) {
  return field?.inputPrefix ? field.inputPrefix + String(value ?? '') : value;
}

// Returns the i18n KEY of the email error for a field+value, or null if valid.
// Non-email field → null. Empty/whitespace value → null (empty is valid, email
// is optional). Non-empty malformed value → 'sendModalInvalidEmail'.
// Decoupled from i18n on purpose: callers resolve the key their own way, because
// the form / grid-add-row / inline-edit paths display the error differently. This
// consolidates the validation DECISION, not the display.
export function getEmailFieldError(field, value) {
  if (!isEmailField(field)) return null;
  const s = String(value ?? '').trim();
  if (s === '') return null;
  return isValidEmailAddress(withInputPrefix(field, value)) ? null : 'sendModalInvalidEmail';
}

// ETP-5031 — requires a domain-SHAPED host after the scheme (at least two
// dot-separated labels, the last one a 2+ letter TLD, e.g. "acme.com" or
// "sub.acme.co.uk"), not just any non-whitespace text. Before this,
// "https://asda" — scheme present, garbage host — passed as a "secure URL"
// (a real value saved in production on the Contacts window). Still
// intentionally simple — a scheme+shape check, not full RFC host/URL parsing
// (no IDN, no bracketed IPv6, no single-label hosts like "https://localhost").
//
// Deliberately NOT one `(?:label\.)+tld` regex: even with each label bounded
// to a real DNS label's 63-char max, SonarQube's ReDoS heuristic (javascript:S5852)
// flags ANY group repeated with `+`/`*` that itself contains a quantified
// subpattern, regardless of whether the bound makes it actually safe — and a
// Security Hotspot needs a human to mark it Safe in the SonarQube UI even
// when the regex genuinely isn't exploitable, which blocks every push until
// someone does that by hand. Splitting the host on `.` and checking each
// label with one small, single-use `?` (not `+`/`*`) regex has no nested
// repetition for the heuristic to flag in the first place — same match
// result, no hotspot, no manual review step.
const SCHEME_HOST_RE = /^https:\/\/(\S+)$/i;
const DOMAIN_LABEL_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/i;
const TLD_RE = /^[a-z]{2,}$/i;

// True when the value is a secure URL: starts with the https:// scheme,
// immediately followed by a domain-shaped host (a bare "https://", a host
// with no dot, or anything not starting with https:// is invalid).
export function isSecureUrl(value) {
  const match = SCHEME_HOST_RE.exec(String(value ?? '').trim());
  if (!match) return false;
  // Host only — drop an optional path/query/fragment and port before
  // splitting into labels; none of those affect the domain SHAPE this checks.
  const host = match[1].split(/[/?#]/)[0].split(':')[0];
  const labels = host.split('.');
  if (labels.length < 2) return false;
  if (!TLD_RE.test(labels[labels.length - 1])) return false;
  return labels.every(label => DOMAIN_LABEL_RE.test(label));
}

// A form/grid field is website-format-validated when its type is 'url' or its
// key/column contains a 'website'/'homepage'/'url'/'web' token (camelCase or
// snake_case boundary) — so etgoWeb / EM_Etgo_Web / URL match, but 'webhook' and
// similar substrings do not. Text-like inputs only (mirrors isEmailField).
export function isWebsiteField(field) {
  if (!field) return false;
  if (field.type === 'url') return true;
  const textLike = field.type == null || field.type === 'text' || field.type === 'string' || field.type === 'textarea';
  if (!textLike) return false;
  const key = String(field.key ?? '');
  const col = String(field.column ?? '');
  // 'website'/'homepage'/'url' are distinctive enough to match as substrings.
  if (/website|homepage|url/i.test(key) || /website|homepage|url/i.test(col)) return true;
  // 'web' is too short for a substring match ('webhook', 'cobweb'), so require it
  // as a whole token — split camelCase + snake_case and check for an exact 'web'.
  const tokens = `${key} ${col}`
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^a-zA-Z0-9]+/)
    .map(t => t.toLowerCase());
  return tokens.includes('web');
}

// Returns the i18n KEY of the website error for a field+value, or null if valid.
// Non-website field → null. Empty/whitespace → null (optional). Non-empty value
// that is not a secure https URL → 'websiteInsecureUrl'. Same contract as
// getEmailFieldError: decoupled from i18n, callers resolve the key themselves.
export function getWebsiteFieldError(field, value) {
  if (!isWebsiteField(field)) return null;
  const s = String(value ?? '').trim();
  if (s === '') return null;
  return isSecureUrl(withInputPrefix(field, value)) ? null : 'websiteInsecureUrl';
}

// True when the trimmed value is a plausible phone number: only digits and the
// separator characters + ( ) - . and spaces, with AT LEAST ONE digit (so "+()"
// or "---" alone is invalid). Not a full E.164 validation — just a charset guard.
export function isValidPhone(value) {
  const s = String(value ?? '').trim();
  if (s === '') return false;
  return /^[\d+()\-.\s]+$/.test(s) && /\d/.test(s);
}

// A field is phone-format-validated when its key/column contains a "phone" token
// (case-insensitive). "phone" is distinctive enough to match as a substring (it
// covers etgoPhone / EM_Etgo_Phone / phone / alternativePhone) without the short-
// token false positives that "web" had. Text-like inputs only (mirrors isEmailField).
export function isPhoneField(field) {
  if (!field) return false;
  const textLike = field.type == null || field.type === 'text' || field.type === 'string' || field.type === 'textarea' || field.type === 'tel';
  if (!textLike) return false;
  return /phone/i.test(String(field.key ?? '')) || /phone/i.test(String(field.column ?? ''));
}

// Returns the i18n KEY of the phone error for a field+value, or null if valid.
// Non-phone field → null. Empty/whitespace → null (optional). Non-empty value
// with disallowed chars / no digit → 'phoneInvalidChars'. Same contract as the
// email/website helpers: decoupled from i18n, callers resolve the key themselves.
export function getPhoneFieldError(field, value) {
  if (!isPhoneField(field)) return null;
  const s = String(value ?? '').trim();
  if (s === '') return null;
  return isValidPhone(withInputPrefix(field, value)) ? null : 'phoneInvalidChars';
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
