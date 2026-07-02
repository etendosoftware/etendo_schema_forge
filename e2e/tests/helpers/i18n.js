/**
 * Thin i18n helper for E2E tests.
 *
 * Mirrors the resolveUI() logic used by useUI() in the app:
 *   locale.genericLabels[key] ?? key
 *
 * Defaults to es_ES. Override with LOCALE=en_US env var.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOCALE = process.env.LOCALE || 'es_ES';

const localePath = join(
  __dirname,
  '../../../tools/app-shell/src/locales',
  `${LOCALE}.json`,
);

const genericLabels = JSON.parse(readFileSync(localePath, 'utf8')).genericLabels ?? {};

/**
 * Look up a genericLabels key, optionally interpolating {variable} placeholders.
 *
 * @param {string} key
 * @param {Record<string, string>} [vars]
 * @returns {string}
 */
export function t(key, vars = {}) {
  let str = genericLabels[key] ?? key;
  for (const [k, v] of Object.entries(vars)) {
    str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
  }
  return str;
}
