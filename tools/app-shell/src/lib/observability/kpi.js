import { isPlainObject, isSafeKpiProperty, isSafeToken } from './propertyPolicy.js';

export function buildKpiProperties(properties = {}) {
  if (!isPlainObject(properties)) return {};

  const safeProperties = {};

  for (const [key, value] of Object.entries(properties)) {
    if (isSafeKpiProperty(key, value)) {
      safeProperties[key] = value;
    }
  }

  return safeProperties;
}

export async function trackKpiEvent(trackFn, eventName, properties = {}) {
  if (typeof trackFn !== 'function' || !isSafeToken(eventName)) return undefined;

  const safeProperties = buildKpiProperties(properties);
  return trackFn(eventName, safeProperties);
}
