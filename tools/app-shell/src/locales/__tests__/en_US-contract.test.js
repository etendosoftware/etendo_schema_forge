import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

const resolveLabel = (dictionary, columnName) => dictionary?.fields?.[columnName]?.label ?? null;

describe('resolveLabel en_US.json contract', () => {
  // Verify the actual en_US.json matches expected labels from the DB
  let enUS;

  // Load the actual locale file
  before(async () => {
    const url = new URL('../en_US.json', import.meta.url);
    const fs = await import('node:fs');
    enUS = JSON.parse(fs.readFileSync(url, 'utf8'));
  });

  it('en_US.json is valid and has fields key', () => {
    assert.ok(enUS.fields, 'en_US.json must have a fields key');
    assert.equal(typeof enUS.fields, 'object');
  });

  it('C_BPartner_ID resolves to Contact', () => {
    assert.equal(resolveLabel(enUS, 'C_BPartner_ID'), 'Contact');
  });

  it('DatePromised resolves to Scheduled Delivery Date', () => {
    assert.equal(resolveLabel(enUS, 'DatePromised'), 'Scheduled Delivery Date');
  });

  it('GrandTotal resolves to Total Gross Amount', () => {
    assert.equal(resolveLabel(enUS, 'GrandTotal'), 'Total Gross Amount');
  });

  it('DocStatus resolves to Document Status', () => {
    assert.equal(resolveLabel(enUS, 'DocStatus'), 'Document Status');
  });

  it('en_US.json has windows, tabs, and menus sections', () => {
    assert.ok(enUS.windows, 'must have windows key');
    assert.ok(enUS.tabs, 'must have tabs key');
    assert.ok(enUS.menus, 'must have menus key');
  });
});
