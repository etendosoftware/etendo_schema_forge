import { KPI_BOOLEAN_KEYS, KPI_NUMERIC_RANGES, isNumberInRange } from './propertyPolicy.js';

const DENYLISTED_PROPERTY_KEYS = new Set([
  'authCode',
  'authorization',
  'businessPartner',
  'businessPartnerName',
  'code',
  'documentId',
  'documentNo',
  'hash',
  'id',
  'label',
  'name',
  'oauthState',
  'query',
  'rawUrl',
  'recordId',
  'search',
  'state',
  'token',
  'url',
]);

const SAFE_EVENT_PROPERTY_KEYS = new Set([
  'account_id',
  'action',
  'accuracy',
  'app',
  'attempt',
  'category',
  'channel',
  'component',
  'correctCount',
  'count',
  'critical',
  'document_type',
  'durationMs',
  'enabled',
  'entity',
  'entityType',
  'environment',
  'errorClass',
  'event',
  'flow',
  'functional_area',
  'hostname',
  'kpiId',
  'locale',
  'module',
  'mockMode',
  'operation',
  'position',
  'provider',
  'route',
  'routePattern',
  'score',
  'specName',
  'source',
  'status',
  'step',
  'supportRequested',
  'timestamp',
  'total',
  'type',
  'username',
  'value',
  'windowName',
]);

const NUMERIC_EVENT_PROPERTY_KEYS = new Map([
  ['accuracy', { min: 0, max: 100 }],
  ...KPI_NUMERIC_RANGES,
]);

const BOOLEAN_EVENT_PROPERTY_KEYS = new Set([
  ...KPI_BOOLEAN_KEYS,
  'enabled',
  'mockMode',
  'supportRequested',
]);

const SKIP_PROPERTY = Symbol('skip-property');

function toPathname(value = '/') {
  const raw = String(value || '/');

  try {
    return new URL(raw, 'https://observability.local').pathname || '/';
  } catch {
    return raw.split(/[?#]/, 1)[0] || '/';
  }
}

function sanitizeSegment(segment) {
  return Array.from(segment)
    .filter(char => isAllowedRouteChar(char))
    .join('');
}

function isAllowedRouteChar(char) {
  return isAlphaNumeric(char) || ['.', '_', '~', '-'].includes(char);
}

function isAlphaNumeric(char) {
  const code = char.charCodeAt(0);
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122)
  );
}

function isHexChar(char) {
  const code = char.charCodeAt(0);
  return (code >= 48 && code <= 57) || (code >= 97 && code <= 102);
}

function isNumericId(segment) {
  return segment.length > 0 && Array.from(segment).every(char => {
    const code = char.charCodeAt(0);
    return code >= 48 && code <= 57;
  });
}

function isHexId(segment) {
  const compact = segment.replaceAll('-', '').toLowerCase();
  return compact.length >= 16 && Array.from(compact).every(isHexChar);
}

function isOpaqueId(segment) {
  return segment.length >= 12 && Array.from(segment).every(char => (
    isAlphaNumeric(char) || char === '_' || char === '-'
  ));
}

function isRecordDetailRoute(segments) {
  return segments.length === 2 && segments[0] !== 'artifacts';
}

function isDynamicSegment(segment) {
  return isNumericId(segment) || isHexId(segment) || isOpaqueId(segment);
}

export function normalizeRoute(value = '/') {
  const pathname = toPathname(value);
  const segments = pathname
    .split('/')
    .map(sanitizeSegment)
    .filter(Boolean);

  if (segments.length === 0) return '/';

  const normalized = segments.map((segment, index) => {
    if (isRecordDetailRoute(segments) && index === 1) return ':recordId';
    if (index > 0 && isDynamicSegment(segment)) return ':id';
    return segment;
  });

  return `/${normalized.join('/')}`;
}

export function extractWindowName(route = '/') {
  const [firstSegment] = normalizeRoute(route).split('/').filter(Boolean);
  return firstSegment && !firstSegment.startsWith(':') ? firstSegment : undefined;
}

export function sanitizeEventProperties(properties = {}) {
  const sanitized = {};

  for (const [key, value] of Object.entries(properties ?? {})) {
    const safeValue = sanitizeEventProperty(key, value);
    if (safeValue !== SKIP_PROPERTY) sanitized[key] = safeValue;
  }

  return sanitized;
}

function sanitizeEventProperty(key, value) {
  if (DENYLISTED_PROPERTY_KEYS.has(key) || !SAFE_EVENT_PROPERTY_KEYS.has(key)) {
    return SKIP_PROPERTY;
  }
  if (value == null) return SKIP_PROPERTY;

  if (NUMERIC_EVENT_PROPERTY_KEYS.has(key)) {
    return isSafeNumberForKey(key, value) ? value : SKIP_PROPERTY;
  }

  if (BOOLEAN_EVENT_PROPERTY_KEYS.has(key)) {
    return typeof value === 'boolean' ? value : SKIP_PROPERTY;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : SKIP_PROPERTY;
  }

  return typeof value === 'string' || typeof value === 'boolean' ? value : SKIP_PROPERTY;
}

function isSafeNumberForKey(key, value) {
  return isNumberInRange(value, NUMERIC_EVENT_PROPERTY_KEYS.get(key));
}

export function buildEventPayload({
  properties = {},
  context = {},
  metadata = {},
  route,
  timestamp = new Date().toISOString(),
} = {}) {
  const normalizedRoute = route ? normalizeRoute(route) : undefined;
  const safeProperties = sanitizeEventProperties(properties);
  const safeContext = sanitizeEventProperties(context);
  const safeMetadata = sanitizeEventProperties(metadata);
  const windowName = normalizedRoute ? extractWindowName(normalizedRoute) : undefined;

  return {
    ...safeMetadata,
    ...safeContext,
    ...safeProperties,
    timestamp,
    ...(normalizedRoute ? { route: normalizedRoute, routePattern: normalizedRoute } : {}),
    ...(windowName ? { windowName } : {}),
  };
}
