// @covers tools/app-shell/src/pages/portal/portalDecisionArrival.js
// New file: no test covered this module; portalPresentation.test.js is about another module
// (the portal's presentation rules), not the way from a decision confirmation into the portal.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { portalDecisionNotice, portalEntryPath } from '../portalDecisionArrival.js';

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

describe('portalDecisionNotice', () => {
  const neutral = (messageKey, number = 'PR/0001') => ({
    messageKey, tone: 'neutral', number, reasonCode: null, reasonText: null,
  });

  for (const [label, result, expected] of [
    [
      'an acceptance applied now',
      { state: 'confirmed', appliedNow: true, decision: 'ACCEPT', documentNo: 'PR/0001', reasonCode: 'PRICE' },
      { messageKey: 'portalNoticeAccepted', tone: 'success', number: 'PR/0001', reasonCode: null, reasonText: null },
    ],
    [
      'a rejection applied now, with its reason and the "Otros" text',
      {
        state: 'confirmed', appliedNow: true, decision: 'REJECT', documentNo: 'PR/0001',
        reasonCode: 'OTHER', reasonText: 'Ya no lo necesitamos',
      },
      {
        messageKey: 'portalNoticeRejected', tone: 'success', number: 'PR/0001',
        reasonCode: 'OTHER', reasonText: 'Ya no lo necesitamos',
      },
    ],
    [
      'a confirmation already applied by an earlier open',
      { state: 'confirmed', appliedNow: false, decision: 'REJECT', documentNo: 'PR/0001', reasonCode: 'PRICE' },
      neutral('portalNoticeAlreadyAnswered'),
    ],
    ['a voided request (another decision won)', { state: 'voided', documentNo: 'PR/0001' }, neutral('portalNoticeAlreadyAnswered')],
    ['a quotation no longer pending', { state: 'not_pending', documentNo: 'PR/0001' }, neutral('portalNoticeNotPending')],
    ['an expired quotation', { state: 'expired', documentNo: 'PR/0001' }, neutral('portalNoticeExpired')],
    ['an unknown state, and no number', { state: 'weird' }, neutral('portalNoticeNotPending', '')],
  ]) {
    it(`describes ${label}`, () => {
      assert.deepEqual(portalDecisionNotice(result), expected);
    });
  }
});
