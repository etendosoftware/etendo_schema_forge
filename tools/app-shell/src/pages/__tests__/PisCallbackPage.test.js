/**
 * Source-level guard for PisCallbackPage.jsx — the throwaway page the Salt Edge
 * PIS popup returns to after the user authorizes a bank transfer. It relays a
 * completion signal back to the opener window via postMessage, then closes itself.
 *
 * The component imports React + i18n, so we follow the repo convention
 * (BankConnectionCallbackPage.test.js) and assert the source invariants directly.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'PisCallbackPage.jsx'), 'utf8');

describe('PisCallbackPage — exports & deps', () => {
  it('exports a default component', () => {
    assert.match(src, /export default function PisCallbackPage\s*\(/);
  });

  it('uses the i18n useUI hook (no hardcoded user strings)', () => {
    assert.match(src, /useUI\(\)/);
  });
});

describe('PisCallbackPage — completion relay', () => {
  it('reads payment_id from the URL query string', () => {
    assert.match(src, /new URLSearchParams\(window\.location\.search\)/);
    assert.match(src, /params\.get\(['"]payment_id['"]\)/);
  });

  it('also accepts the camelCase paymentId variant', () => {
    assert.match(src, /params\.get\(['"]paymentId['"]\)/);
  });

  it('reads error_class from the URL query string', () => {
    assert.match(src, /params\.get\(['"]error_class['"]\)/);
  });

  it('also accepts the camelCase errorClass variant', () => {
    assert.match(src, /params\.get\(['"]errorClass['"]\)/);
  });

  it('relays the completion signal to the opener via postMessage', () => {
    assert.match(src, /window\.opener\.postMessage\(/);
    assert.match(src, /type: ['"]pis-completed['"], paymentId/);
  });

  it('falls back to null when no error class is present', () => {
    assert.match(src, /errorClass: errorClass \|\| null/);
  });

  it('scopes the postMessage to the current origin', () => {
    assert.match(src, /window\.location\.origin/);
  });

  it('guards opener access against exceptions', () => {
    assert.match(src, /if \(window\.opener\)/);
    assert.match(src, /try \{[\s\S]*window\.opener\.postMessage[\s\S]*\} catch/);
  });
});

describe('PisCallbackPage — self close', () => {
  it('closes the window after a short delay', () => {
    assert.match(src, /setTimeout\(\(\) => \{[\s\S]*window\.close\(\)[\s\S]*\}, 300\)/);
  });

  it('clears the close timer on unmount', () => {
    assert.match(src, /return \(\) => clearTimeout\(timer\)/);
  });
});

describe('PisCallbackPage — rendered copy', () => {
  it('renders the payment-registered message', () => {
    assert.match(src, /ui\(['"]paymentRegistered['"]\)/);
  });

  it('renders the close-window hint', () => {
    assert.match(src, /ui\(['"]financeAccountsBankConnectionCallbackClose['"]\)/);
  });
});
