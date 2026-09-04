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
 *
 * ETP-5125 added the SECOND reason a cached rendering stops representing the record:
 * the renderer changed. A PDF depends on the template, the CSS, the labels/locale and
 * the Handlebars helpers as much as on the record's data, and all three of those live
 * in the code, where a change moves no timestamp at all. `isCachedRenderingStale` is
 * therefore the predicate production code calls — it composes both reasons — while
 * `isAttachmentStale` remains exactly the record-vs-file comparison ETP-4787 shipped.
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

/**
 * ETP-5125 — the instant THIS frontend bundle was built, in epoch ms, injected by
 * Vite's `define` (see `vite.config.js`).
 *
 * A rendered PDF is a function of four inputs: the record's data, the template, the
 * labels/locale and the Handlebars helpers. `isAttachmentStale` above covers only the
 * first one. The other three live in the code and moving them moves NO timestamp, so a
 * completed document cached before a template change kept serving the old design
 * forever — the ETP-5125 bug, where the printable still read "IVA%" after the labels
 * had been fixed.
 *
 * Bundle identity is the signal, because a renderer change can only reach a user
 * through a new bundle. It deliberately OVER-approximates (a deploy that leaves the
 * template untouched also invalidates), which costs one cold render per document on
 * its first open — the same trade this cache already accepts for `updated`
 * (`docs/document-printables.md`: "serving a stale document is worse than
 * re-rendering").
 *
 * `0` when the global is absent — plain `node --test`, and Vitest, whose
 * `vitest.config.js` is a separate config with no `define`. The check is then inert and
 * the cache behaves exactly as it did before, matching this module's fail-open rule.
 */
export const RENDERER_BUILD_EPOCH_MS =
  typeof __RENDERER_BUILD_EPOCH_MS__ === 'number' ? __RENDERER_BUILD_EPOCH_MS__ : 0;

/**
 * True when the cached file was written before the running bundle existed, so it was
 * produced by a different renderer.
 *
 * Same fail-open bias as the rest of this module: an unknown epoch (0, or a
 * non-finite value) or an unusable attachment timestamp yields `false`.
 *
 * @param {{ updatedAt?: string, uploadedAt?: string, createdAt?: string, creationDate?: string }|null} attachment
 * @param {number} [buildEpochMs]  overridable so tests need no global stubbing
 * @returns {boolean}
 */
export function isRenderedByOlderBundle(attachment, buildEpochMs = RENDERER_BUILD_EPOCH_MS) {
  if (!Number.isFinite(buildEpochMs) || buildEpochMs <= 0) return false;
  const writtenMs = attachmentWrittenAtMs(attachment);
  if (writtenMs == null) return false;
  return writtenMs < buildEpochMs;
}

/**
 * Whether the cached rendering of a record must be discarded and re-rendered — the
 * predicate PRODUCTION CODE SHOULD CALL. It composes the two independent reasons a
 * cached PDF stops representing the record: the record changed (ETP-4787) or the
 * renderer changed (ETP-5125).
 *
 * `isAttachmentStale` stays exported for its own spec and as this function's first
 * half; new call sites belong here, so staleness keeps being decided in exactly one
 * place (`docs/document-printables.md`).
 *
 * **The `recordUpdated` guard is load-bearing, not a formality.** Not passing
 * `recordUpdated` is ETP-4787's deliberate opt-out, and the windows that opt out —
 * purchase-invoice, goods-receipt, return-material-receipt — do so because their marked
 * attachment holds the COUNTERPARTY's own document (the supplier's invoice / the OCR
 * source, the customer's signed receipt), never a cache of something we rendered. No
 * change of ours can make those stale, and flagging one would invite overwriting a real
 * user file. Keep this check after the guard; never hoist it above.
 *
 * @param {{ updatedAt?: string, uploadedAt?: string, createdAt?: string, creationDate?: string }|null} attachment
 * @param {string|number|Date|null} recordUpdated  the record's `updated`
 * @param {number} [buildEpochMs]  overridable so tests need no global stubbing
 * @returns {boolean}
 */
export function isCachedRenderingStale(attachment, recordUpdated, buildEpochMs = RENDERER_BUILD_EPOCH_MS) {
  if (toInstantMs(recordUpdated) == null) return false;
  if (isAttachmentStale(attachment, recordUpdated)) return true;
  return isRenderedByOlderBundle(attachment, buildEpochMs);
}
