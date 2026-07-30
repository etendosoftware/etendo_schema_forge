/**
 * Source-level guard for BankConnectionCallbackPage.jsx — the throwaway page the Salt Edge
 * popup returns to. It relays the connection id back to the opener window via
 * postMessage + localStorage, then closes itself.
 *
 * The component imports React + i18n, so we follow the repo convention
 * (main.toaster.test.js) and assert the source invariants directly.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'BankConnectionCallbackPage.jsx'), 'utf8');

describe('BankConnectionCallbackPage — exports & deps', () => {
  it('exports a default component', () => {
    assert.match(src, /export default function BankConnectionCallbackPage\s*\(/);
  });

  it('imports the shared BANK_CONNECTION_KEY constant', () => {
    assert.match(src, /import \{ BANK_CONNECTION_KEY \} from ['"]@\/hooks\/useBankConnectionActions['"]/);
  });

  it('uses the i18n useUI hook (no hardcoded user strings)', () => {
    assert.match(src, /useUI\(\)/);
  });
});

describe('BankConnectionCallbackPage — connection id relay', () => {
  it('reads connection_id from the URL query string', () => {
    assert.match(src, /new URLSearchParams\(window\.location\.search\)/);
    assert.match(src, /params\.get\(['"]connection_id['"]\)/);
  });

  it('also accepts the camelCase connectionId variant', () => {
    assert.match(src, /params\.get\(['"]connectionId['"]\)/);
  });

  it('persists the connection id to localStorage under the shared key', () => {
    assert.match(src, /localStorage\.setItem\(BANK_CONNECTION_KEY, connectionId\)/);
  });

  it('relays the connection id to the opener via postMessage', () => {
    assert.match(src, /window\.opener\.postMessage\(/);
    assert.match(src, /type: ['"]bank-connection-connected['"], connectionId/);
  });

  it('scopes the postMessage to the current origin', () => {
    assert.match(src, /window\.location\.origin/);
  });

  it('guards localStorage/opener access against exceptions', () => {
    assert.match(src, /try \{[\s\S]*localStorage\.setItem[\s\S]*\} catch/);
    assert.match(src, /if \(window\.opener\)/);
  });
});

describe('BankConnectionCallbackPage — self close', () => {
  it('closes the window after a short delay', () => {
    assert.match(src, /setTimeout\(\(\) => \{[\s\S]*window\.close\(\)/);
  });

  it('clears the close timer on unmount', () => {
    assert.match(src, /return \(\) => clearTimeout\(timer\)/);
  });
});

describe('BankConnectionCallbackPage — rendered copy', () => {
  it('renders the callback-done message', () => {
    assert.match(src, /ui\(['"]financeAccountsBankConnectionCallbackDone['"]\)/);
  });

  it('renders the close-window hint', () => {
    assert.match(src, /ui\(['"]financeAccountsBankConnectionCallbackClose['"]\)/);
  });
});
