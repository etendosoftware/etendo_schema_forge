/**
 * Client half of the attachments upload policy (ETP-5038).
 *
 * The policy — max size, accepted MIME types, accepted extensions, and the coarse type
 * groups the "Supported formats" label is built from — is owned by the BACKEND
 * (`NeoAttachmentPolicy.java`) and served by `GET /sws/neo/attachments/config`. This module
 * fetches it once per session, caches it, and exposes the helpers the dropzone needs.
 *
 * Why fetched and not hardcoded: the backend enforces the same list on upload, and two
 * hardcoded lists drift. When they drift the failure is user-hostile — the UI accepts the
 * file, the API answers 400. Same reasoning, same shape as the currency-format precedent
 * (`lib/currencyFormatConfig.js` + `NeoCurrencyFormatServlet`).
 *
 * FALLBACK_ATTACHMENT_POLICY exists so a config outage cannot make the dropzone unusable,
 * and it is deliberately a copy of the backend default rather than "allow everything" —
 * an over-permissive fallback would just move the rejection to the 400. A failed fetch is
 * NOT silent: it logs an error and the resolved policy carries `degraded: true`, so a
 * broken endpoint is visible in the console and assertable in a test instead of hiding
 * behind a fallback that happens to look right.
 */

/** Mirrors `NeoAttachmentPolicy`'s defaults. Used only until the fetch resolves, or if it fails. */
export const FALLBACK_ATTACHMENT_POLICY = Object.freeze({
  maxSizeMB: 10,
  allowedMimeTypes: Object.freeze([
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/bmp',
    'image/webp',
    'image/tiff',
    'image/heic',
    'image/heif',
    'image/svg+xml',
    'application/xml',
    'text/xml',
    'application/zip',
    'application/x-zip-compressed',
    'application/rtf',
  ]),
  allowedExtensions: Object.freeze([
    'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
    'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'tif', 'tiff', 'heic', 'heif', 'svg',
    'xml', 'zip', 'rtf',
  ]),
  typeGroups: Object.freeze(['pdf', 'word', 'excel', 'powerpoint', 'image', 'xml', 'zip', 'rtf']),
  degraded: false,
});

/** i18n key per backend type group. An unknown group falls back to its upper-cased name. */
const TYPE_GROUP_LABEL_KEYS = {
  pdf: 'attachmentsTypeGroupPdf',
  word: 'attachmentsTypeGroupWord',
  excel: 'attachmentsTypeGroupExcel',
  powerpoint: 'attachmentsTypeGroupPowerpoint',
  image: 'attachmentsTypeGroupImage',
  xml: 'attachmentsTypeGroupXml',
  zip: 'attachmentsTypeGroupZip',
  rtf: 'attachmentsTypeGroupRtf',
};

/**
 * MIME -> type group, so a per-window override that only narrows `allowedMimeTypes`
 * (the fiscal-model receipt tabs pass `['application/pdf']`) still gets an honest label
 * instead of inheriting the generic one.
 */
const MIME_TYPE_GROUPS = {
  'application/pdf': 'pdf',
  'application/msword': 'word',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'word',
  'application/vnd.ms-excel': 'excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'excel',
  'application/vnd.ms-powerpoint': 'powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'powerpoint',
  'application/xml': 'xml',
  'text/xml': 'xml',
  'application/zip': 'zip',
  'application/x-zip-compressed': 'zip',
  'application/rtf': 'rtf',
};

const ATTACHMENT_POLICY_PATH = '/sws/neo/attachments/config';

let cachedPromise = null;

function toStringArray(value) {
  return Array.isArray(value) ? value.filter((entry) => typeof entry === 'string' && entry) : null;
}

/**
 * Shapes a raw endpoint payload into a policy object, keeping the fallback's value for
 * any field the backend did not send in a usable shape.
 *
 * @param {object} raw - Parsed response body.
 * @returns {object} A complete policy object.
 */
export function normalizeAttachmentPolicy(raw) {
  const data = raw?.response?.data ?? raw?.data ?? raw ?? {};
  return {
    maxSizeMB: typeof data.maxSizeMB === 'number' && data.maxSizeMB > 0
      ? data.maxSizeMB
      : FALLBACK_ATTACHMENT_POLICY.maxSizeMB,
    allowedMimeTypes: toStringArray(data.allowedMimeTypes)
      ?? [...FALLBACK_ATTACHMENT_POLICY.allowedMimeTypes],
    allowedExtensions: (toStringArray(data.allowedExtensions)
      ?? [...FALLBACK_ATTACHMENT_POLICY.allowedExtensions]).map((ext) => ext.toLowerCase()),
    typeGroups: toStringArray(data.typeGroups) ?? [...FALLBACK_ATTACHMENT_POLICY.typeGroups],
    degraded: false,
  };
}

/**
 * Fetches the policy once per session and caches it.
 *
 * @param {Function} apiFetch - The authenticated fetch (`useApiFetch` / core `apiFetch`).
 * @param {object} [options]
 * @param {string} [options.token] - Bearer token, when the caller holds one explicitly.
 * @returns {Promise<object>} The policy; never rejects.
 */
export function resolveAttachmentPolicy(apiFetch, { token } = {}) {
  if (cachedPromise) return cachedPromise;

  cachedPromise = Promise.resolve()
    .then(() => apiFetch(ATTACHMENT_POLICY_PATH, token ? { token } : undefined))
    .then((res) => {
      if (!res?.ok) throw new Error(`attachments config fetch failed: ${res?.status}`);
      return res.json();
    })
    .then(normalizeAttachmentPolicy)
    .catch((err) => {
      // Loud on purpose: the fallback keeps uploads working, but a permanently broken
      // endpoint must not look like a healthy one.
      console.error(
        '[attachments] Could not load the upload policy from the server; '
        + 'falling back to the built-in defaults, which may not match what the backend enforces.',
        err,
      );
      return { ...FALLBACK_ATTACHMENT_POLICY, degraded: true };
    });

  return cachedPromise;
}

/** Test seam: drops the session cache so each test starts from a clean fetch. */
export function resetAttachmentPolicyCache() {
  cachedPromise = null;
}

/**
 * Whether a picked file satisfies the policy's type rules.
 *
 * Matches on MIME first (supporting `image/*`-style wildcards, which per-window overrides
 * may still use), and falls back to the extension — browsers report an empty `File.type`
 * for plenty of legitimate files, and rejecting those would be a worse bug than the one
 * this check exists to fix.
 *
 * @param {File} file - The picked file.
 * @param {{allowedMimeTypes?: string[], allowedExtensions?: string[]}} policy
 * @returns {boolean} True when the file may be uploaded.
 */
export function isFileTypeAllowed(file, policy = {}) {
  const { allowedMimeTypes, allowedExtensions } = policy;
  const hasMimeRule = Array.isArray(allowedMimeTypes) && allowedMimeTypes.length > 0;
  const hasExtensionRule = Array.isArray(allowedExtensions) && allowedExtensions.length > 0;
  if (!hasMimeRule && !hasExtensionRule) return true;

  const mime = (file?.type || '').toLowerCase();
  if (hasMimeRule && mime) {
    const mimeMatches = allowedMimeTypes.some((pattern) => {
      const p = String(pattern).toLowerCase();
      return p.endsWith('/*') ? mime.startsWith(p.slice(0, -1)) : mime === p;
    });
    if (mimeMatches) return true;
    // A declared-but-unlisted MIME is only overridable by the extension rule; without one
    // there is nothing left to consult.
    if (!hasExtensionRule) return false;
  }

  if (!hasExtensionRule) return false;
  const name = String(file?.name || '');
  const dot = name.lastIndexOf('.');
  if (dot < 0 || dot === name.length - 1) return false;
  return allowedExtensions.includes(name.slice(dot + 1).toLowerCase());
}

/**
 * Value for the file input's `accept` attribute: the MIME list plus the extensions, so the
 * OS picker still greys out unsupported files when it cannot resolve a MIME type.
 *
 * @param {{allowedMimeTypes?: string[], allowedExtensions?: string[]}} policy
 * @returns {string|undefined} The attribute value, or undefined when nothing is restricted.
 */
export function buildAcceptAttribute(policy = {}) {
  const mimes = Array.isArray(policy.allowedMimeTypes) ? policy.allowedMimeTypes : [];
  const extensions = Array.isArray(policy.allowedExtensions)
    ? policy.allowedExtensions.map((ext) => `.${String(ext).replace(/^\./, '')}`)
    : [];
  const parts = [...mimes, ...extensions];
  return parts.length ? parts.join(',') : undefined;
}

/**
 * The type groups a MIME list covers, in first-appearance order. `image/*` and any
 * concrete `image/...` both collapse to the single `image` group; a MIME with no known
 * group is skipped rather than guessed at.
 *
 * @param {string[]} [mimeTypes]
 * @returns {string[]} The groups covered.
 */
function groupsFromMimeTypes(mimeTypes) {
  if (!Array.isArray(mimeTypes)) return [];
  const groups = [];
  mimeTypes.forEach((raw) => {
    const mime = String(raw).toLowerCase();
    const group = mime.startsWith('image/') ? 'image' : MIME_TYPE_GROUPS[mime];
    if (group && !groups.includes(group)) groups.push(group);
  });
  return groups;
}

/**
 * Human, translated "Supported formats" text, derived from the SERVER's type groups so the
 * label can never claim something the backend does not accept.
 *
 * @param {{typeGroups?: string[]}} policy
 * @param {Function} ui - The `useUI()` translator.
 * @returns {string|null} The joined label, or null when the policy carries no groups.
 */
export function buildTypesLabel(policy, ui) {
  const groups = Array.isArray(policy?.typeGroups) && policy.typeGroups.length
    ? policy.typeGroups
    : groupsFromMimeTypes(policy?.allowedMimeTypes);
  if (!groups.length) return null;
  return groups
    .map((group) => {
      const key = TYPE_GROUP_LABEL_KEYS[group];
      return key ? ui(key) : String(group).toUpperCase();
    })
    .join(', ');
}
