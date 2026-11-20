// @covers tools/app-shell/src/pages/portal/portalDecisionArrival.js
// New file: no test covered this module; portalPresentation.test.js is about another module
// (the portal's presentation rules), not the way from a decision confirmation into the portal.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { portalEntryPath } from '../portalDecisionArrival.js';

describe('portalEntryPath', () => {
  it('opens the portal on the quotation, with the token path-encoded and the view in the query', () => {
    const path = portalEntryPath({ portalToken: 'tok/a b+c', quotationId: 'q-1' });

    const [pathname, search] = path.split('?');
    assert.equal(pathname, `/portal/${encodeURIComponent('tok/a b+c')}`);
    assert.deepEqual(Object.fromEntries(new URLSearchParams(search)), {
      view: 'doc', kind: 'QUOTATION', id: 'q-1',
    });
  });

  for (const [label, result] of [
    ['no answer', null],
    ['no portal token', { portalToken: null, quotationId: 'q-1' }],
    ['an empty portal token', { portalToken: '', quotationId: 'q-1' }],
    ['no quotation', { portalToken: 'tok-1', quotationId: null }],
  ]) {
    it(`is null with ${label}, so the landing keeps its own card`, () => {
      assert.equal(portalEntryPath(result), null);
    });
  }
});
