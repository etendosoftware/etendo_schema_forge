/**
 * ETP-5302 — `preUnpost.js` is the single home of the "reactivating a posted document
 * reverses its accounting first" rule. It used to live only inside
 * DetailMoreActionsMenu (duplicated across its two branches), which is why the bulk
 * bar sent a bare `docAction: 'RE'` and Core rejected it with "Factura contabilizada"
 * while the form kebab succeeded. These tests pin the extracted contract so both
 * call sites (the kebab and BulkDocumentAction) can keep relying on it.
 *
 * Pure logic, no React, no hooks (deliberately not a hook — see the module header):
 * node:test, not vitest.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isPosted, runPreUnpost } from '../preUnpost.js';

/** Records `(recordId, action)` pairs and resolves whatever the test asked for. */
function spyExecute(result) {
  const calls = [];
  const fn = async (recordId, action) => {
    calls.push([recordId, action]);
    if (typeof result === 'function') return result(recordId, action);
    return result;
  };
  fn.calls = calls;
  return fn;
}

describe('isPosted', () => {
  it('treats the AD "Y" flag as posted', () => {
    assert.equal(isPosted({ posted: 'Y' }), true);
  });

  it('treats a real boolean true as posted (a JSON-typed backend row)', () => {
    assert.equal(isPosted({ posted: true }), true);
  });

  it('treats "N" as not posted', () => {
    assert.equal(isPosted({ posted: 'N' }), false);
  });

  it('treats a missing posted flag as not posted', () => {
    assert.equal(isPosted({}), false);
    assert.equal(isPosted({ posted: undefined }), false);
  });

  it('treats an absent row as not posted instead of throwing', () => {
    assert.equal(isPosted(null), false);
    assert.equal(isPosted(undefined), false);
  });

  // The AD "Posted status" reference has more members than Y/N — only 'Y' means
  // "accounting entries exist". Anything else (error, not-from-this-doc, being
  // posted, inactive period…) must NOT trigger a reversal: unposting a document
  // that was never posted is a no-op at best and an error at worst.
  for (const value of ['E', 'D', 'p', 'i']) {
    it(`treats the "${value}" posted status as not posted`, () => {
      assert.equal(isPosted({ posted: value }), false);
    });
  }

  it('treats a lowercase "y" as not posted (the AD value is uppercase)', () => {
    assert.equal(isPosted({ posted: 'y' }), false);
  });

  it('treats boolean false and the empty string as not posted', () => {
    assert.equal(isPosted({ posted: false }), false);
    assert.equal(isPosted({ posted: '' }), false);
  });
});

describe('runPreUnpost — does not apply', () => {
  it('does nothing when the action has no preUnpost flag, even for a posted record', async () => {
    const execute = spyExecute({ success: true });
    const result = await runPreUnpost({
      recordId: 'rec-1', record: { posted: 'Y' }, enabled: false, execute,
    });

    assert.deepEqual(result, { ran: false, success: true });
    assert.equal(execute.calls.length, 0);
  });

  it('does nothing when the record is not posted, even with preUnpost enabled', async () => {
    const execute = spyExecute({ success: true });
    const result = await runPreUnpost({
      recordId: 'rec-2', record: { posted: 'N' }, enabled: true, execute,
    });

    assert.deepEqual(result, { ran: false, success: true });
    assert.equal(execute.calls.length, 0);
  });

  it('does nothing when there is no record at all', async () => {
    const execute = spyExecute({ success: true });
    const result = await runPreUnpost({
      recordId: 'rec-3', record: null, enabled: true, execute,
    });

    assert.deepEqual(result, { ran: false, success: true });
    assert.equal(execute.calls.length, 0);
  });

  // `ran: false` is reported as a SUCCESS on purpose: callers read `success` to
  // decide whether to carry on to the document action, and "the step did not
  // apply" must never block the action it precedes.
  it('reports the skipped step as a success so the caller carries on', async () => {
    const result = await runPreUnpost({
      recordId: 'rec-4', record: { posted: 'N' }, enabled: true, execute: spyExecute(null),
    });

    assert.equal(result.ran, false);
    assert.equal(result.success, true);
  });
});

describe('runPreUnpost — applies', () => {
  it('unposts the record and reports a successful run', async () => {
    const execute = spyExecute({ success: true });
    const result = await runPreUnpost({
      recordId: 'rec-5', record: { posted: 'Y' }, enabled: true, execute,
    });

    assert.deepEqual(execute.calls, [['rec-5', 'unpost']]);
    assert.equal(result.ran, true);
    assert.equal(result.success, true);
    assert.equal(result.message, undefined);
  });

  it('also unposts when the posted flag is a real boolean true', async () => {
    const execute = spyExecute({ success: true });
    const result = await runPreUnpost({
      recordId: 'rec-6', record: { posted: true }, enabled: true, execute,
    });

    assert.deepEqual(execute.calls, [['rec-6', 'unpost']]);
    assert.equal(result.ran, true);
  });

  it('reports the failure AND its backend message when the unpost is rejected', async () => {
    const execute = spyExecute({ success: false, message: 'Factura contabilizada' });
    const result = await runPreUnpost({
      recordId: 'rec-7', record: { posted: 'Y' }, enabled: true, execute,
    });

    assert.deepEqual(result, {
      ran: true, success: false, message: 'Factura contabilizada',
    });
  });

  // Defensive: a `{ success }`-less answer (a transport hiccup, a handler returning
  // nothing) must read as a FAILURE, never be coerced into "fine, carry on" — that
  // would reactivate a still-posted document and reproduce the original bug.
  it('treats an empty/absent result as a failure, not a silent success', async () => {
    for (const answer of [undefined, null, {}, { success: undefined }]) {
      const result = await runPreUnpost({
        recordId: 'rec-8', record: { posted: 'Y' }, enabled: true, execute: spyExecute(answer),
      });
      assert.equal(result.ran, true);
      assert.equal(result.success, false);
    }
  });

  it('propagates a thrown/rejected unpost to the caller instead of swallowing it', async () => {
    const execute = async () => { throw new Error('network down'); };
    await assert.rejects(
      () => runPreUnpost({ recordId: 'rec-9', record: { posted: 'Y' }, enabled: true, execute }),
      /network down/,
    );
  });

  it('always requests the "unpost" action, never the caller document action', async () => {
    const execute = spyExecute({ success: true });
    await runPreUnpost({ recordId: 'rec-10', record: { posted: 'Y' }, enabled: true, execute });

    assert.equal(execute.calls[0][1], 'unpost');
  });
});
