import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { codeWithoutComments, assertAdjacentStatements } from '../sourceAdjacency.js';

describe('codeWithoutComments', () => {
  it('removes a line comment', () => {
    assert.equal(codeWithoutComments('a();\n// note\nb();'), 'a();\n\nb();');
  });

  it('removes a block comment but keeps its newlines so line numbers survive', () => {
    assert.equal(codeWithoutComments('a();\n/* one\ntwo */\nb();'), 'a();\n\n\nb();');
  });

  it('does not mistake a URL inside a string for a comment', () => {
    const src = "const u = 'https://example.com/x'; b();";
    assert.equal(codeWithoutComments(src), src);
  });

  it('does not strip comment-looking text inside a template literal', () => {
    const src = 'const u = `${base}//y`; b();';
    assert.equal(codeWithoutComments(src), src);
  });

  it('keeps an escaped quote from ending the string early', () => {
    const src = "const s = 'it\\'s // not a comment'; b();";
    assert.equal(codeWithoutComments(src), src);
  });

  it('leaves comment-free source untouched', () => {
    const src = 'a();\nb();\n';
    assert.equal(codeWithoutComments(src), src);
  });
});

// The whole point of the helper: "no intervening STATEMENT", not "no
// intervening CHARACTERS". Both directions are asserted here so the guard
// cannot be quietly weakened into something that passes for anything.
describe('assertAdjacentStatements', () => {
  const A = /setShowInvoiceConfirm\(false\);/;
  const B = /setConfirmedDocs\(\{/;

  it('passes when the two statements are directly adjacent', () => {
    const src = 'setShowInvoiceConfirm(false);\nsetConfirmedDocs({ a: 1 });';
    assert.doesNotThrow(() => assertAdjacentStatements(src, [A, B]));
  });

  it('passes when only a line comment sits between them', () => {
    const src = 'setShowInvoiceConfirm(false);\n// ETP-5381: explain something\nsetConfirmedDocs({ a: 1 });';
    assert.doesNotThrow(() => assertAdjacentStatements(src, [A, B]));
  });

  it('passes when only a block comment sits between them', () => {
    const src = 'setShowInvoiceConfirm(false);\n/* explain\n   at length */\nsetConfirmedDocs({ a: 1 });';
    assert.doesNotThrow(() => assertAdjacentStatements(src, [A, B]));
  });

  it('FAILS when a real statement is injected between them', () => {
    const src = 'setShowInvoiceConfirm(false);\ntrackEvent("invoice");\nsetConfirmedDocs({ a: 1 });';
    assert.throws(() => assertAdjacentStatements(src, [A, B]), { code: 'ERR_ASSERTION' });
  });

  it('FAILS when a statement hides behind a comment between them', () => {
    const src = 'setShowInvoiceConfirm(false);\n// why\ntrackEvent("invoice");\nsetConfirmedDocs({ a: 1 });';
    assert.throws(() => assertAdjacentStatements(src, [A, B]), { code: 'ERR_ASSERTION' });
  });

  it('FAILS when the statements appear in the wrong order', () => {
    const src = 'setConfirmedDocs({ a: 1 });\nsetShowInvoiceConfirm(false);';
    assert.throws(() => assertAdjacentStatements(src, [A, B]), { code: 'ERR_ASSERTION' });
  });

  it('FAILS when one of the statements is missing entirely', () => {
    const src = 'setConfirmedDocs({ a: 1 });';
    assert.throws(() => assertAdjacentStatements(src, [A, B]), { code: 'ERR_ASSERTION' });
  });
});
