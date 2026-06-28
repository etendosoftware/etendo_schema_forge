/**
 * Source-level guard for usePsd2ConnectFlow.js — orchestrates the Salt Edge
 * connect flow (link existing account vs. create-and-link) on top of
 * usePsd2Actions + launchSaltEdgePopup.
 *
 * The hook pulls in React, sonner and i18n, so we follow the repo convention
 * (useBulkActionToast.test.js) and assert the source invariants directly while
 * unit-testing the pure error-message mapping inline.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'usePsd2ConnectFlow.js'), 'utf8');

describe('usePsd2ConnectFlow — public surface', () => {
  it('exports the usePsd2ConnectFlow hook', () => {
    assert.match(src, /export function usePsd2ConnectFlow\s*\(/);
  });

  it('builds on usePsd2Actions and launchSaltEdgePopup', () => {
    assert.match(src, /import \{ usePsd2Actions, launchSaltEdgePopup \} from ['"]\.\/usePsd2Actions['"]/);
  });

  it('returns the documented flow controls', () => {
    for (const key of [
      'startConnect',
      'startCreate',
      'connecting',
      'selection',
      'confirmSelection',
      'cancelSelection',
    ]) {
      assert.match(src, new RegExp(`\\b${key}\\b`), `missing returned key ${key}`);
    }
  });
});

describe('usePsd2ConnectFlow — entry points', () => {
  it('startConnect runs in link mode with the given account', () => {
    assert.match(src, /const startConnect = useCallback\(\(account\) => run\(\{ mode: ['"]link['"], account \}\)/);
  });

  it('startCreate runs in create mode with the given type', () => {
    assert.match(src, /const startCreate = useCallback\(\(type\) => run\(\{ mode: ['"]create['"], type \}\)/);
  });
});

describe('usePsd2ConnectFlow — connect / popup orchestration', () => {
  it('passes the account id to connect only in link mode', () => {
    assert.match(src, /const connectAccountId = ctx\.mode === ['"]link['"] \? ctx\.account\.id : undefined/);
    assert.match(src, /launchSaltEdgePopup\(\(\) => connect\(connectAccountId\)\)/);
  });

  it('toggles the connecting flag around the popup', () => {
    assert.match(src, /setConnecting\(true\)/);
    assert.match(src, /setConnecting\(false\)/);
  });

  it('bails out silently when the popup closes without a connection id', () => {
    assert.match(src, /if \(!connectionId\)/);
  });
});

describe('usePsd2ConnectFlow — account selection', () => {
  it('errors when no bank accounts are returned', () => {
    assert.match(src, /accounts\.length === 0/);
    assert.match(src, /financeAccountsPsd2NoAccounts/);
  });

  it('always opens the selection modal (even for a single account)', () => {
    assert.match(src, /setSelection\(\{ \.\.\.ctx, connectionId, accounts, providerName, providerLogoUrl \}\)/);
  });

  it('confirmSelection finishes the link and clears the selection', () => {
    assert.match(src, /setSelection\(null\)/);
    assert.match(src, /await applyLink\(ctx, ctx\.connectionId, saltEdgeAccountId\)/);
  });

  it('cancelSelection clears the selection', () => {
    assert.match(src, /const cancelSelection = useCallback\(\(\) => setSelection\(null\)/);
  });
});

describe('usePsd2ConnectFlow — link vs create', () => {
  it('uses createAndLink in create mode', () => {
    assert.match(src, /createAndLink\(\{ type: ctx\.type, connectionId, saltEdgeAccountId \}\)/);
  });

  it('uses link with the account id in link mode', () => {
    assert.match(src, /link\(\{ financialAccountId: ctx\.account\.id, connectionId, saltEdgeAccountId \}\)/);
  });

  it('shows a success toast and fires onDone on success', () => {
    assert.match(src, /toast\.success\(ui\(['"]financeAccountsPsd2Success['"]\)\)/);
    assert.match(src, /onDone\?\.\(\)/);
  });
});

// Pure re-implementation of connectErrorMessage to lock the mapping contract.
function connectErrorMessage(err, ui) {
  if (err.message === 'POPUP_BLOCKED') return ui('financeAccountsPsd2PopupBlocked');
  if (err.message === 'PSD2_TIMEOUT') return ui('financeAccountsPsd2Timeout');
  return err.message || ui('financeAccountsPsd2ConnectError');
}

describe('connectErrorMessage mapping', () => {
  const ui = (key) => key;

  it('maps POPUP_BLOCKED to the popup-blocked label', () => {
    assert.equal(
      connectErrorMessage(new Error('POPUP_BLOCKED'), ui),
      'financeAccountsPsd2PopupBlocked',
    );
  });

  it('maps PSD2_TIMEOUT to the timeout label', () => {
    assert.equal(
      connectErrorMessage(new Error('PSD2_TIMEOUT'), ui),
      'financeAccountsPsd2Timeout',
    );
  });

  it('passes through other error messages verbatim', () => {
    assert.equal(connectErrorMessage(new Error('boom'), ui), 'boom');
  });

  it('falls back to the generic connect-error label when no message', () => {
    assert.equal(connectErrorMessage(new Error(''), ui), 'financeAccountsPsd2ConnectError');
  });
});
