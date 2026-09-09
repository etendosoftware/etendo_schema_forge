/**
 * ETP-5013 follow-up — Classic's own General Ledger report leaves a visible
 * gap between each account's block, and shows each account as its own
 * bordered box with its OWN header row (not one shared header over multiple
 * accounts). The flat (ungrouped-by-dimension) layout used to render all
 * accounts inside ONE `<table>` with a single shared `<thead>` and one
 * `<tbody>` per account (an empty spacer `<tbody><tr>` was needed between
 * them, since a CSS margin on `<tbody>` isn't rendered in table layout).
 *
 * It now reuses the EXACT same `.acct-card` structure the dimension-grouped
 * layout already used: a bordered `<div class="acct-card">` per account,
 * each with its own `<table class="report-table"><thead>...`, wrapped in a
 * `.acct-cards` flex container whose `gap` gives every card real spacing —
 * no spacer-row hack needed anymore, and no shared/duplicated header issue.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Handlebars from 'handlebars';
import { registerReportHelpers } from '../../../templates/reports/helpers/report-html-helpers.js';
import { expandBrandingPartial } from './reportBrandingPartialHelper.js';

const ARTIFACT_DIR = resolve(import.meta.dirname, '../../../artifacts/report-general-ledger');

function account(value, name) {
  return {
    value,
    name,
    opening: { amtacctdr: 0, amtacctcr: 0, total: 0 },
    subtotal: { amtacctdr: 0, amtacctcr: 0, total: 0 },
    total: { amtacctdr: 0, amtacctcr: 0, total: 0 },
    rows: [],
  };
}

function renderFlat(accounts) {
  const hb = Handlebars.create();
  const helpersCode = readFileSync(resolve(ARTIFACT_DIR, 'helpers.js'), 'utf8');
  registerReportHelpers(hb, helpersCode);
  const templateSrc = readFileSync(resolve(ARTIFACT_DIR, 'template.hbs'), 'utf8');
  const template = hb.compile(expandBrandingPartial(templateSrc));
  return template({
    meta: {
      params: { groupBy: '', showDimensions: 'false' },
      labels: {},
      descriptionLabel: 'Description',
      ui: { initialBalance: 'Initial balance', subtotal: 'Subtotal', total: 'Total' },
      groups: [{ name: 'All', accounts }],
    },
  });
}

describe('report-general-ledger — flat layout account cards (ETP-5013 follow-up)', () => {
  it('wraps every account in its own bordered .acct-card, inside .acct-cards', () => {
    const html = renderFlat([account('10000', 'Cash'), account('20000', 'Receivables')]);
    const cardsWrapperIdx = html.indexOf('class="acct-cards"');
    assert.ok(cardsWrapperIdx !== -1, 'expected an .acct-cards wrapper');
    const cardOccurrences = [...html.matchAll(/class="acct-card"/g)];
    assert.equal(cardOccurrences.length, 2, 'expected one .acct-card per account');
  });

  it('each account card carries its OWN <thead>, not a header shared across accounts', () => {
    const html = renderFlat([account('10000', 'Cash'), account('20000', 'Receivables')]);
    const theadOccurrences = [...html.matchAll(/<thead>/g)];
    assert.equal(theadOccurrences.length, 2, 'expected one <thead> per account, not one shared thead');
  });

  it('no longer renders the old spacer-row hack (.acct-spacer)', () => {
    const html = renderFlat([account('10000', 'Cash'), account('20000', 'Receivables')]);
    assert.doesNotMatch(html, /acct-spacer/);
  });

  it('the account code and name render via the same .acct-card-head markup as the grouped layout', () => {
    const html = renderFlat([account('10000', 'Cash')]);
    assert.match(html, /<div class="acct-card-head">\s*<span class="code">10000<\/span>\s*<span class="name">Cash<\/span>/);
  });

  it('.acct-cards declares a flex gap — the real spacing mechanism between cards', () => {
    const html = renderFlat([account('10000', 'Cash')]);
    const ruleMatch = html.match(/\.acct-cards\s*\{([^}]*)\}/);
    assert.ok(ruleMatch, 'expected an .acct-cards CSS rule');
    assert.match(ruleMatch[1], /display:\s*flex/);
    assert.match(ruleMatch[1], /gap:\s*3mm/);
  });
});
