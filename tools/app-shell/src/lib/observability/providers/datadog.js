import { normalizeRoute, sanitizeEventProperties } from '../payload.js';

// Datadog automatically adds view and error contexts to this list. The RUM SDK
// currently accepts only the four additional event types below.
export const DATADOG_RUM_FEATURE_FLAG_EVENTS = ['vital', 'action', 'long_task', 'resource'];

export function boundedSampleRate(value, fallback = 100) {
  if (value == null || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, number)) : fallback;
}

/** Only exact configured first-party API origins and NEO paths receive trace headers.
 * No broad suffix, arbitrary regex, or string-prefix origin matching is accepted.
 */
export function resolveTracingUrls(raw, logger = console) {
  if (!raw) return [];
  try {
    const bases = JSON.parse(raw);
    if (!Array.isArray(bases)) throw new Error('Expected API base array');
    return bases.map(value => {
      const base = new URL(value);
      if (!['https:', 'http:'].includes(base.protocol) || base.username || base.password ||
          base.search || base.hash || base.hostname.includes('*')) throw new Error('Invalid trusted API base');
      const path = `${base.pathname.replace(/\/$/, '')}/sws/neo`;
      return {
        match: candidate => {
          try {
            const url = new URL(candidate);
            return !url.username && !url.password && url.origin === base.origin &&
              (url.pathname === path || url.pathname.startsWith(`${path}/`));
          } catch { return false; }
        },
        propagatorTypes: ['tracecontext', 'datadog'],
      };
    });
  } catch {
    logger.warn('[observability] Invalid VITE_DATADOG_TRACE_API_BASES; trace propagation disabled');
    return [];
  }
}

/** Sanitize automatic SDK telemetry as well as manually dispatched events. */
export function redactErrorText(value) {
  const redactedUrls = String(value ?? '').replace(/https?:\/\/[^\s)]+/g, match => {
    const position = match.match(/:\d+:\d+$/)?.[0] || '';
    const raw = position ? match.slice(0, -position.length) : match;
    try { const url = new URL(raw); return `${url.origin}${url.pathname}${position}`; } catch { return '[url]'; }
  });
  return redactEmailAddresses(redactedUrls)
    .replace(/(authorization|token|password|secret|code)\s*[:=]\s*(?:bearer\s+)?[^\s&,;}]+/gi, '$1=[redacted]');
}

function isEmailLocalCharacter(character) {
  const code = character.charCodeAt(0);
  return code === 46 || code === 37 || code === 43 || code === 45 || code === 95 ||
    (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

function isEmailDomainCharacter(character) {
  const code = character.charCodeAt(0);
  return code === 45 || code === 46 || (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

function isEmailTld(value) {
  if (value.length < 2) return false;
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (!((code >= 65 && code <= 90) || (code >= 97 && code <= 122))) return false;
  }
  return true;
}

function redactEmailAddresses(value) {
  let output = '';
  let cursor = 0;
  while (cursor < value.length) {
    const at = value.indexOf('@', cursor);
    if (at < 0) return output + value.slice(cursor);
    let start = at - 1;
    while (start >= cursor && isEmailLocalCharacter(value[start])) start -= 1;
    const domainStart = at + 1;
    let end = domainStart;
    while (end < value.length && isEmailDomainCharacter(value[end])) end += 1;
    const domain = value.slice(domainStart, end);
    const dot = domain.lastIndexOf('.');
    const valid = start < at - 1 && dot > 0 && isEmailTld(domain.slice(dot + 1));
    if (valid) {
      output += value.slice(cursor, start + 1) + '[email]';
      cursor = end;
    } else {
      output += value.slice(cursor, at + 1);
      cursor = at + 1;
    }
  }
  return output;
}

function normalizeEventRoutes(event) {
  if (event.view) {
    event.view.url = normalizeRoute(event.view.url);
    if (event.view.referrer) event.view.referrer = normalizeRoute(event.view.referrer);
    if (event.view.name) event.view.name = normalizeRoute(event.view.name);
  }
  if (event.resource?.url) event.resource.url = normalizeRoute(event.resource.url);
  if (event.error?.resource?.url) event.error.resource.url = normalizeRoute(event.error.resource.url);
}

function redactEventError(event) {
  if (!event.error) return;
  const redactCause = cause => {
    if (!cause || typeof cause !== 'object') return;
    if ('message' in cause) cause.message = redactErrorText(cause.message);
    if ('stack' in cause) cause.stack = redactErrorText(cause.stack);
    if (Array.isArray(cause.causes)) cause.causes.forEach(redactCause);
  };
  redactCause(event.error);
}

function sanitizeEventIdentity(event) {
  event.context = sanitizeEventProperties(event.context ?? {});
  delete event.context.username;
  // User names/emails are never sent. Hosts can assign an opaque account identity.
  if (event.usr) event.usr = event.usr.id ? { id: event.usr.id } : {};
  if (event.account) event.account = event.account.id ? { id: event.account.id } : {};
}

export function redactDatadogEvent(event) {
  normalizeEventRoutes(event);
  redactEventError(event);
  sanitizeEventIdentity(event);
  return true;
}

function initializeDatadogRum({ env, logger, datadogRum, reactPlugin }) {
  const remoteConfigurationId = env.VITE_DATADOG_REMOTE_CONFIGURATION_ID;
  datadogRum.init({
    applicationId: env.VITE_DATADOG_APPLICATION_ID,
    clientToken: env.VITE_DATADOG_CLIENT_TOKEN,
    site: env.VITE_DATADOG_SITE,
    env: env.VITE_APP_ENV,
    service: env.VITE_DATADOG_SERVICE || 'etendo-go-web',
    version: env.VITE_APP_VERSION,
    sessionSampleRate: boundedSampleRate(env.VITE_DATADOG_SESSION_SAMPLE_RATE),
    sessionReplaySampleRate: boundedSampleRate(env.VITE_DATADOG_SESSION_REPLAY_SAMPLE_RATE, 20),
    ...(remoteConfigurationId ? { remoteConfiguration: { id: remoteConfigurationId } } : {}),
    trackFeatureFlagsForEvents: DATADOG_RUM_FEATURE_FLAG_EVENTS,
    allowedTracingUrls: resolveTracingUrls(env.VITE_DATADOG_TRACE_API_BASES, logger),
    traceSampleRate: boundedSampleRate(env.VITE_DATADOG_TRACE_SAMPLE_RATE, 20),
    traceContextInjection: 'sampled',
    defaultPrivacyLevel: 'mask',
    trackUserInteractions: true,
    trackViewsManually: true,
    trackResources: true,
    trackLongTasks: true,
    ...(typeof reactPlugin === 'function' ? { plugins: [reactPlugin({ router: false })] } : {}),
    beforeSend: redactDatadogEvent,
  });
  return datadogRum;
}

export function createDatadogProvider({
  env = {}, logger = console,
  loader = async () => {
    const [{ datadogRum }, { reactPlugin }] = await Promise.all([
      import('@datadog/browser-rum'),
      import('@datadog/browser-rum-react'),
    ]);
    return { datadogRum, reactPlugin };
  },
} = {}) {
  const requested = env.VITE_DATADOG_ENABLED === true || env.VITE_DATADOG_ENABLED === 'true';
  const enabled = requested && Boolean(env.VITE_DATADOG_APPLICATION_ID &&
    env.VITE_DATADOG_CLIENT_TOKEN && env.VITE_DATADOG_SITE && env.VITE_APP_ENV);
  let clientPromise;
  let currentRoute;
  if (requested && !enabled) logger.warn('[observability] Datadog requires application ID, client token, site and environment');

  function getClient() {
    if (!enabled) return Promise.resolve(undefined);
    if (!clientPromise) clientPromise = loader().then(({ datadogRum, reactPlugin }) => {
      initializeDatadogRum({ env, logger, datadogRum, reactPlugin });
      currentRoute = normalizeRoute(globalThis.location?.pathname || '/');
      datadogRum.startView({ name: currentRoute });
      return datadogRum;
    });
    return clientPromise;
  }

  return {
    name: 'datadog', enabled,
    capabilities: ['analytics', 'errors', 'performance', 'identity', 'featureFlagTracking'],
    init: getClient,
    async track(name, properties) { (await getClient())?.addAction(name, properties); },
    async addFeatureFlagEvaluation(key, value) {
      (await getClient())?.addFeatureFlagEvaluation(key, value);
    },
    async page(path) {
      const client = await getClient();
      const route = normalizeRoute(path);
      if (client && route !== currentRoute) {
        currentRoute = route;
        client.startView({ name: route });
      }
    },
    async identify(id) { (await getClient())?.setUser({ id }); },
    async group(key, id) {
      const client = await getClient();
      if (key === 'account_id') client?.setAccount({ id });
    },
    async captureException(error, details) {
      (await getClient())?.addError(error, sanitizeEventProperties(details));
    },
    async setContext(context) {
      (await getClient())?.setGlobalContext(sanitizeEventProperties(context));
    },
    async reset() {
      const client = await getClient();
      client?.stopSession();
      client?.clearUser();
      client?.clearAccount();
      client?.setGlobalContext({});
    },
    // Browser SDK delivery is lifecycle-managed; no public flush API exists.
    async flush() {},
  };
}
