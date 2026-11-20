/**
 * ETP-6363 — Google Tag Manager, for marketing's lead attribution.
 *
 * The container carries everything else, in marketing's hands: the default consent ("denied"),
 * Google Analytics, and HubSpot's tracking code, which shows the cookie banner and leaves the
 * `hubspotutk` cookie the sign-up sends. The app only installs it, and pushes its own events to
 * `window.dataLayer` (see dataLayer.js).
 *
 * It loads only on the production hosts: a developer's machine or a staging server must not feed
 * marketing's reports (a quarter of Mixpanel's page views came from localhost), and never in a
 * support session, where the person in the app is not the customer.
 */

/** The app's container, from marketing (2026-11-17). */
export const DEFAULT_GTM_ID = 'GTM-N8JMRDH9';
/** Where it loads unless `VITE_GTM_HOSTS` says otherwise (a comma-separated list). */
export const DEFAULT_GTM_HOSTS = ['app.etendo.ai'];

const GTM_ID_PATTERN = /^GTM-[A-Z0-9]+$/;

function hostsOf(value) {
  if (typeof value !== 'string' || !value.trim()) return DEFAULT_GTM_HOSTS;
  return value.split(',').map(host => host.trim().toLowerCase()).filter(Boolean);
}

/**
 * Which container this page loads, if any.
 *
 * @param {{ env?: object, hostname?: string, supportSession?: boolean }} options
 * @returns {string|null} the container id, or null when it must not load here
 */
export function resolveGtmId({ env = {}, hostname = '', supportSession = false } = {}) {
  if (supportSession || env.VITE_GTM_ENABLED === 'false') return null;
  const id = String(env.VITE_GTM_ID || DEFAULT_GTM_ID).trim();
  if (!GTM_ID_PATTERN.test(id)) return null;
  return hostsOf(env.VITE_GTM_HOSTS).includes(String(hostname).toLowerCase()) ? id : null;
}

/**
 * Whether this page loaded the container: the dataLayer events are pushed only then.
 *
 * @param {Window} [win] the browser's, by default
 * @returns {boolean}
 */
export function isGtmInstalled(win = globalThis.window) {
  return Boolean(win?.__etendoGtmInstalled);
}

/**
 * Installs the container: the snippet marketing gave, as code. Safe to call twice.
 *
 * @param {string|null} gtmId the container, or null to do nothing
 * @param {{ win?: Window, doc?: Document }} [target] the browser's, by default
 * @returns {boolean} whether it was installed by this call
 */
export function installGtm(gtmId, { win = globalThis.window, doc = globalThis.document } = {}) {
  if (!gtmId || !win || !doc) return false;
  if (win.__etendoGtmInstalled === gtmId) return false;
  win.__etendoGtmInstalled = gtmId;
  win.dataLayer = win.dataLayer || [];
  win.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
  const script = doc.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(gtmId)}`;
  const first = doc.getElementsByTagName('script')[0];
  if (first?.parentNode) first.parentNode.insertBefore(script, first);
  else doc.head.appendChild(script);
  return true;
}

/**
 * Reopens HubSpot's cookie banner, so the visitor can change the choice (marketing's spec: a fixed
 * "cookie settings" link). The banner is HubSpot's tracking code, loaded by GTM.
 *
 * @param {Window} [win] the browser's, by default
 */
export function showCookieBanner(win = globalThis.window) {
  if (!win) return;
  win._hsp = win._hsp || [];
  win._hsp.push(['showBanner']);
}
