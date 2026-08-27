/**
 * attachmentFreshness.js — is the cached rendering of a record still the record?
 *
 * ETP-4787. A completed document's PDF is stored once as the record's marked
 * `Attachment` (`C_File.EM_ETGO_IsPreviewMain='Y'`, ETP-4315) and served from there on
 * every later open, which is what makes the preview instant. Until now nothing ever
 * unmarked it, so any change to the record after that first render — a corrected
 * address, a Verifactu QR that only exists once the Registro de Facturacion is
 * generated, a re-completed document — kept showing, downloading and emailing the old
 * PDF, with no symptom other than "my change is not on the document".
 *
 * The invalidation is a timestamp comparison, not an event: nothing has to remember to
 * evict the cache. Whoever modified the record moved its `updated` (DAL does it on every
 * flush, including a raw SQL fix followed by a DAL touch); if that instant is later than
 * the moment the cached file was written, the file predates the record and is stale.
 *
 * Both timestamps come from the same database server — the attachment's `uploadedAt`
 * (`Attachment.creationDate`) and the record's `updated` — so no clock skew is involved
 * and no tolerance window is needed.
 *
 * `updated` reaches the client only because `NeoFieldFilter.ALWAYS_READABLE_KEYS`
 * exempts it: it is an AD *column* on every table but not an AD *field*, so
 * `push-to-neo` cannot register it and no window could ever declare it in
 * `decisions.json`.
 */

/**
 * Parses one of the two shapes the backend emits — the attachments endpoint's UTC
 * `2026-08-24T10:15:30Z` and DAL's offset-bearing `2026-08-24T12:15:30+02:00` — into an
 * epoch millisecond count. Both are unambiguous instants, so no timezone reasoning is
 * needed here; this is NOT a calendar date and must not go through `dateOnly.js`.
 *
 * @param {string|number|Date|null|undefined} value
 * @returns {number|null} epoch ms, or null when the value is absent or unparseable
 */
export function toInstantMs(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * The instant the cached file's CURRENT contents were written — the attachment's own
 * `updated`.
 *
 * NOT `uploadedAt`. `uploadAndMarkMainAttachment` does not always insert a new row: when the
 * record already has a marked attachment the backend overwrites that one in place, so its
 * `creationDate`/`uploadedAt` keeps pointing at the FIRST render while the bytes are the
 * newest ones — verified against a live instance, where a re-render left
 * `uploadedAt: 17:08:10Z` beside `updatedAt: 00:24:01Z`. Comparing against `uploadedAt`
 * therefore never converges: the file reads as stale forever and every open pays a
 * re-render *and* an upload.
 *
 * The remaining names are fallbacks for a payload that omits `updatedAt`, not alternatives:
 * DAL stamps `updated` on insert too (checked on this instance — every `C_File` row has
 * `updated > created`, none the other way round), so when it is present it is always both
 * the newest and the right answer.
 *
 * @param {{ updatedAt?: string, uploadedAt?: string, createdAt?: string, creationDate?: string }|null} attachment
 * @returns {number|null} epoch ms, or null when no timestamp is usable
 */
export function attachmentWrittenAtMs(attachment) {
  for (const value of [
    attachment?.updatedAt,
    attachment?.uploadedAt,
    attachment?.createdAt,
    attachment?.creationDate,
  ]) {
    const ms = toInstantMs(value);
    if (ms != null) return ms;
  }
  return null;
}

/**
 * True when the cached attachment was written BEFORE the record's last modification,
 * i.e. it no longer represents the record and must be re-rendered.
 *
 * Unknown beats wrong in the safe direction here: a missing `recordUpdated` (a window
 * whose backend predates the `updated` exemption) or a missing/unparseable attachment
 * timestamp yields `false` — the cache keeps behaving exactly as it did before this
 * check existed, rather than silently disabling itself for every window.
 *
 * The comparison is strict. Both timestamps are truncated to whole seconds on the wire,
 * so an edit landing in the very same second as the upload reads as fresh; treating
 * equality as stale instead would only trade that vanishing window for a permanent one.
 *
 * @param {{ updatedAt?: string, uploadedAt?: string, createdAt?: string, creationDate?: string }|null} attachment
 *   the marked attachment's metadata, as `fetchMainAttachment` returns it
 * @param {string|number|Date|null} recordUpdated  the record's `updated`
 * @returns {boolean}
 */
export function isAttachmentStale(attachment, recordUpdated) {
  const updatedMs = toInstantMs(recordUpdated);
  if (updatedMs == null) return false;
  const writtenMs = attachmentWrittenAtMs(attachment);
  if (writtenMs == null) return false;
  return writtenMs < updatedMs;
}
