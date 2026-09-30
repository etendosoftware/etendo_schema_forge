import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  NETWORK_ERROR_FALLBACK, NetworkError, resetErrorTranslatorForTests,
} from '@etendosoftware/app-shell-core/auth';
import esES from '../../locales/es_ES.json';

/**
 * ETP-5424 — core builds a NetworkError's `.message` through whatever translator the host
 * registered. `installErrorTranslator` is the app's one registration: it resolves keys from
 * the RENDERED locale's dictionary with the same lookup `useUI` uses, so a dropped connection
 * reads in the language every other string on screen is in.
 *
 * The module is loaded lazily so each case fails on its own while it does not exist yet,
 * rather than the whole file failing to link.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const SPANISH = 'No se pudo completar la acción. Intenta nuevamente.';

// A literal specifier makes Vite fail the whole file at transform time while the module is
// missing; a variable one is resolved at call time, so only the cases that need it fail.
const ERROR_TRANSLATOR_MODULE = '../errorTranslator.js';
async function loadErrorTranslator() {
  return import(/* @vite-ignore */ ERROR_TRANSLATOR_MODULE);
}

afterEach(() => {
  resetErrorTranslatorForTests();
});

describe('installErrorTranslator', () => {
  it('makes a NetworkError read in the installed locale', async () => {
    const { installErrorTranslator } = await loadErrorTranslator();
    installErrorTranslator({ genericLabels: { networkErrorRetry: SPANISH } });
    expect(new NetworkError({ reason: 'offline' }).message).toBe(SPANISH);
  });

  it('uses the real es_ES dictionary once the key exists there', async () => {
    const { installErrorTranslator } = await loadErrorTranslator();
    installErrorTranslator(esES);
    expect(new NetworkError({ reason: 'offline' }).message).toBe(SPANISH);
  });

  it('returns an unregister function that restores the English fallback', async () => {
    const { installErrorTranslator } = await loadErrorTranslator();
    const unregister = installErrorTranslator({ genericLabels: { networkErrorRetry: SPANISH } });
    expect(typeof unregister).toBe('function');
    unregister();
    expect(new NetworkError({ reason: 'offline' }).message).toBe(NETWORK_ERROR_FALLBACK);
  });

  it('falls back to the English default when the dictionary lacks the key', async () => {
    const { installErrorTranslator } = await loadErrorTranslator();
    installErrorTranslator({ genericLabels: {} });
    expect(new NetworkError({ reason: 'offline' }).message).toBe(NETWORK_ERROR_FALLBACK);
  });

  it('falls back when there is no dictionary at all (locale still loading)', async () => {
    const { installErrorTranslator } = await loadErrorTranslator();
    installErrorTranslator(null);
    expect(new NetworkError({ reason: 'offline' }).message).toBe(NETWORK_ERROR_FALLBACK);
  });

  it('a later install (locale switch) replaces the earlier one', async () => {
    const { installErrorTranslator } = await loadErrorTranslator();
    installErrorTranslator({ genericLabels: { networkErrorRetry: 'primero' } });
    installErrorTranslator({ genericLabels: { networkErrorRetry: SPANISH } });
    expect(new NetworkError({ reason: 'offline' }).message).toBe(SPANISH);
  });
});

describe('App.jsx wires the error translator', () => {
  const src = readFileSync(join(__dirname, '..', '..', 'App.jsx'), 'utf8');

  it('imports installErrorTranslator from the i18n errorTranslator module', () => {
    expect(src).toMatch(
      /import\s*\{[^}]*\binstallErrorTranslator\b[^}]*\}\s*from\s*['"](?:\.\/|@\/)i18n\/errorTranslator(?:\.js)?['"]/,
    );
  });

  it('calls installErrorTranslator with the rendered-locale dictionary', () => {
    // Either inline (`installErrorTranslator(dictionaries[renderedLocale])`) or through a
    // variable read from the same place.
    const inline = /installErrorTranslator\(\s*dictionaries\??\.?\[\s*renderedLocale\s*\]/.test(src);
    const viaVar = src.match(/installErrorTranslator\(\s*(\w+)\s*\)/);
    const varFromRendered = viaVar
      && new RegExp(`\\b${viaVar[1]}\\s*=\\s*dictionaries\\??\\.?\\[\\s*renderedLocale\\s*\\]`).test(src);
    expect(inline || Boolean(varFromRendered), 'installErrorTranslator must receive dictionaries[renderedLocale]').toBe(true);
  });

  it('installs it inside an effect that returns the unregister function', () => {
    expect(src).toMatch(/useEffect\(\s*\(\)\s*=>\s*(?:\{[^}]*?return\s+)?installErrorTranslator\(/);
  });
});
