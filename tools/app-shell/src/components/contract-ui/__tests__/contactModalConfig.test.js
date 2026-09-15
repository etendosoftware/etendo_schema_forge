import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { contactModalConfig } from '../contactModalConfig.js';

/**
 * ETP-5031 follow-up — the "Más" tab's etgoWeb/etgoPhone fields must carry the
 * same format guards as the Contacts window's own form (artifacts/contacts/
 * decisions.json), so the "Create contact" quick-create popup cannot save a
 * value the Contacts window would reject.
 */
describe('contactModalConfig — "more" section format guards (ETP-5031)', () => {
  const moreSection = contactModalConfig.sections.find(s => s.id === 'more');

  it('declares the "more" section as plain with Web/Email/Phone fields, in that order', () => {
    assert.ok(moreSection, 'expected a "more" section in contactModalConfig');
    const ids = moreSection.fields.map(f => f.id);
    // Order matches the live Contacts window exactly (artifacts/contacts/decisions.json:
    // etgoWeb order 9, etgoEmail order 10, etgoPhone order 11) — confirmed against the
    // running window, not assumed from the config alone.
    assert.deepEqual(ids, ['etgoWeb', 'etgoEmail', 'etgoPhone']);
  });

  it('caps etgoPhone at 15 chars (E.164), matching the Contacts window field', () => {
    const phone = moreSection.fields.find(f => f.id === 'etgoPhone');
    assert.equal(phone.type, 'tel');
    assert.equal(phone.maxLength, 15);
  });

  it('gives etgoWeb the https:// inputPrefix, matching the Contacts window field', () => {
    const web = moreSection.fields.find(f => f.id === 'etgoWeb');
    assert.equal(web.inputPrefix, 'https://');
  });

  it('keeps etgoEmail typed as email so the generic format check applies to it', () => {
    const email = moreSection.fields.find(f => f.id === 'etgoEmail');
    assert.equal(email.type, 'email');
  });
});
