import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildReturnDraftMode } from '../returnDraftMode.js';

// ETP-5408 — the draftMode prop shared by return-material-receipt and
// return-to-vendor-shipment. Runs in plain node: `window` is stubbed with a real
// EventTarget so onConfirm's dispatch can be observed end to end.
describe('buildReturnDraftMode', () => {
  let originalWindow;

  beforeEach(() => {
    originalWindow = globalThis.window;
    globalThis.window = new EventTarget();
  });

  afterEach(() => {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  });

  it('returns exactly the generic draftMode keys plus onConfirm', () => {
    const { onConfirm, ...rest } = buildReturnDraftMode((key) => key, 'evt');
    assert.deepEqual(rest, {
      enabled: true,
      processField: 'documentAction',
      processValue: 'CO',
      label: 'confirm',
      disableWhenEmpty: true,
    });
    assert.equal(typeof onConfirm, 'function');
  });

  it('resolves the label through ui("confirm") and uses its return value', () => {
    const calls = [];
    const ui = (key) => { calls.push(key); return 'Confirmar'; };
    const draftMode = buildReturnDraftMode(ui, 'evt');
    assert.deepEqual(calls, ['confirm']);
    assert.equal(draftMode.label, 'Confirmar');
  });

  it('does not dispatch anything until onConfirm is called', () => {
    let fired = 0;
    globalThis.window.addEventListener('evt', () => { fired += 1; });
    buildReturnDraftMode((key) => key, 'evt');
    assert.equal(fired, 0);
  });

  it('onConfirm dispatches a CustomEvent with exactly the given name', () => {
    const received = [];
    globalThis.window.addEventListener('rmr:open-confirm-modal', (e) => received.push(e));
    buildReturnDraftMode((key) => key, 'rmr:open-confirm-modal').onConfirm();
    assert.equal(received.length, 1);
    assert.ok(received[0] instanceof CustomEvent);
    assert.equal(received[0].type, 'rmr:open-confirm-modal');
  });

  it('two builders with different event names do not cross', () => {
    const fired = { a: 0, b: 0 };
    globalThis.window.addEventListener('window-a:open', () => { fired.a += 1; });
    globalThis.window.addEventListener('window-b:open', () => { fired.b += 1; });
    const a = buildReturnDraftMode((key) => key, 'window-a:open');
    const b = buildReturnDraftMode((key) => key, 'window-b:open');

    a.onConfirm();
    assert.deepEqual(fired, { a: 1, b: 0 });
    b.onConfirm();
    b.onConfirm();
    assert.deepEqual(fired, { a: 1, b: 2 });
  });

  it('returns a fresh object per call (identity is the caller\'s useMemo job)', () => {
    const ui = (key) => key;
    assert.notEqual(buildReturnDraftMode(ui, 'evt'), buildReturnDraftMode(ui, 'evt'));
  });
});
