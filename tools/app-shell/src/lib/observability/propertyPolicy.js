export const SNAKE_CASE = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
export const KPI_ID = /^kpi_[a-z0-9]+(?:_[a-z0-9]+)*$/;

export const KPI_NUMERIC_RANGES = new Map([
  ['attempt', { min: 0, max: 1000 }],
  ['correctCount', { min: 0, max: 1000000000 }],
  ['count', { min: 0, max: 1000000000 }],
  ['durationMs', { min: 0, max: 86400000 }],
  ['position', { min: 0, max: 1000000 }],
  ['score', { min: 0, max: 100 }],
  ['step', { min: 0, max: 1000 }],
  ['total', { min: 0, max: 1000000000 }],
  ['value', { min: -1000000000, max: 1000000000 }],
]);

export const KPI_BOOLEAN_KEYS = new Set(['critical']);

export const KPI_PROPERTY_KEYS = new Set([
  'action',
  'attempt',
  'channel',
  'component',
  'correctCount',
  'count',
  'critical',
  'durationMs',
  'entityType',
  'errorClass',
  'flow',
  'kpiId',
  'module',
  'position',
  'provider',
  'score',
  'source',
  'status',
  'step',
  'total',
  'type',
  'value',
]);

const KPI_MODULES = new Set([
  'accounting',
  'copilot',
  'contacts',
  'dashboard',
  'fixed_assets',
  'inventory',
  'onboarding',
  'products',
  'purchases',
  'sales',
  'transversal',
]);

const KPI_CHANNELS = new Set([
  'automatic',
  'email',
  'manual',
  'ocr',
  'purchase_invoice',
  'system',
  'system_email',
]);

const KPI_STATUSES = new Set([
  'abandoned',
  'blocked',
  'failed',
  'partial',
  'started',
  'success',
]);

const KPI_TOKEN_KEYS = new Set([
  'action',
  'component',
  'entityType',
  'errorClass',
  'flow',
  'provider',
  'source',
  'type',
]);

export function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function isSafeToken(value, pattern = SNAKE_CASE) {
  return typeof value === 'string' && pattern.test(value);
}

export function isSafePrimitive(value) {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

export function isNumberInRange(value, range) {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= range.min &&
    value <= range.max
  );
}

export function isSafeKpiProperty(key, value) {
  if (!KPI_PROPERTY_KEYS.has(key) || value == null || !isSafePrimitive(value)) return false;

  const range = KPI_NUMERIC_RANGES.get(key);
  if (range) return isNumberInRange(value, range);

  if (KPI_BOOLEAN_KEYS.has(key)) return typeof value === 'boolean';
  if (key === 'kpiId') return isSafeToken(value, KPI_ID);
  if (key === 'module') return KPI_MODULES.has(value);
  if (key === 'channel') return KPI_CHANNELS.has(value);
  if (key === 'status') return KPI_STATUSES.has(value);
  if (KPI_TOKEN_KEYS.has(key)) return isSafeToken(value);

  return true;
}
