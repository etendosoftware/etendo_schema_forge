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
  return String(value ?? '').replace(/https?:\/\/[^\s)]+/g, match => {
    const position = match.match(/:\d+:\d+$/)?.[0] || '';
    const raw = position ? match.slice(0, -position.length) : match;
    try { const url = new URL(raw); return `${url.origin}${url.pathname}${position}`; } catch { return '[url]'; }
  }).replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/(authorization|token|password|secret|code)=([^\s&]+)/gi, '$1=[redacted]');
}

export function redactDatadogEvent(event) {
  if (event.view) {
    event.view.url = normalizeRoute(event.view.url);
    if (event.view.referrer) event.view.referrer = normalizeRoute(event.view.referrer);
    if (event.view.name) event.view.name = normalizeRoute(event.view.name);
  }
  if (event.resource?.url) event.resource.url = normalizeRoute(event.resource.url);
  if (event.error?.resource?.url) event.error.resource.url = normalizeRoute(event.error.resource.url);
  if (event.error) {
    event.error.message = redactErrorText(event.error.message);
    if (event.error.stack) event.error.stack = redactErrorText(event.error.stack);
  }
  event.context = sanitizeEventProperties(event.context ?? {});
  delete event.context.username;
  // User names/emails are never sent. Hosts can assign an opaque account identity.
  if (event.usr) event.usr = event.usr.id ? { id: event.usr.id } : {};
  if (event.account) event.account = event.account.id ? { id: event.account.id } : {};
  return true;
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
      currentRoute = normalizeRoute(globalThis.location?.pathname || '/');
      datadogRum.startView({ name: currentRoute });
      return datadogRum;
    });
    return clientPromise;
  }

  return {
    name: 'datadog', enabled,
    capabilities: ['analytics', 'errors', 'performance', 'identity'],
    init: getClient,
    async track(name, properties) { (await getClient())?.addAction(name, properties); },
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
