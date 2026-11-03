// ETP-5988 — client of GET|PUT /sws/neo/doctemplateconfig.
// @covers tools/app-shell/src/lib/docTemplateConfigApi.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  COMMERCIAL_DOC_TYPES, DEFAULT_SETTINGS, LISTING_DOC_TYPES, currentSettings, listDocTemplateConfigs,
  saveDocTemplateSettings,
} from '../docTemplateConfigApi.js';

const ok = (body) => ({ ok: true, status: 200, json: async () => body });
const fail = (status, body) => ({ ok: false, status, json: async () => body });

describe('docTemplateConfigApi', () => {
  it('lists the configurations of the organization', async () => {
    const calls = [];
    const configs = await listDocTemplateConfigs(async (path) => {
      calls.push(path);
      return ok({ orgId: 'O', configs: [{ docType: 'sales-order', variant: 'modern' }] });
    });
    assert.deepEqual(calls, ['/doctemplateconfig']);
    assert.equal(configs[0].variant, 'modern');
  });

  it('a list without configs is an empty list', async () => {
    assert.deepEqual(await listDocTemplateConfigs(async () => ok({})), []);
  });

  it('a refused list carries the server message and status', async () => {
    await assert.rejects(
      listDocTemplateConfigs(async () => fail(403, { message: 'Not allowed' })),
      (e) => e.message === 'Not allowed' && e.status === 403);
  });

  it('saves a document type with every option, unset ones as explicit nulls, as a PUT', async () => {
    let seen;
    await saveDocTemplateSettings(async (path, options) => { seen = { path, options }; return ok({}); },
      'sales-invoice', { ...DEFAULT_SETTINGS, variant: 'compact', color: '#1A73E8', footerText: 'Thanks' });
    assert.equal(seen.path, '/doctemplateconfig');
    assert.equal(seen.options.method, 'PUT');
    assert.deepEqual(JSON.parse(seen.options.body), {
      docType: 'sales-invoice', variant: 'compact', color: '#1A73E8', font: null, fontSize: null,
      rowStripes: null, showLogo: null, logo: null, footerText: 'Thanks',
    });
  });

  it('the list print sends its logo but no footer; a section sends only what it offers', async () => {
    let seen;
    await saveDocTemplateSettings(async (_p, options) => { seen = options; return ok({}); },
      'listing', { ...DEFAULT_SETTINGS, logo: 'https://x/l.png', footerText: 'x', font: 'serif' }, { withLogo: true, withFooter: false });
    let body = JSON.parse(seen.body);
    assert.equal(body.font, 'serif');
    assert.equal(body.logo, 'https://x/l.png');
    assert.equal('footerText' in body, false);
    await saveDocTemplateSettings(async (_p, options) => { seen = options; return ok({}); },
      'listing', { ...DEFAULT_SETTINGS, logo: 'https://x/l.png' }, { withLogo: false, withFooter: false });
    body = JSON.parse(seen.body);
    assert.equal('logo' in body, false);
  });

  it('a refused save rejects with the status; an empty error body keeps the fallback message', async () => {
    const res = { ok: false, status: 400, json: async () => { throw new Error('no body'); } };
    await assert.rejects(saveDocTemplateSettings(async () => res, 'sales-invoice', DEFAULT_SETTINGS),
      (e) => e.status === 400 && /Failed to save/.test(e.message));
  });

  it('shows the first saved section settings and the defaults when nothing is saved', () => {
    assert.deepEqual(currentSettings([], COMMERCIAL_DOC_TYPES), DEFAULT_SETTINGS);
    assert.equal(currentSettings([{ docType: 'purchase-order', variant: 'modern' }], COMMERCIAL_DOC_TYPES).variant, 'modern');
    assert.equal(currentSettings([{ docType: 'goods-shipment', variant: 'modern' }], COMMERCIAL_DOC_TYPES).variant, 'classic');
    assert.equal(currentSettings([{ docType: 'sales-invoice', variant: 'fancy' }], COMMERCIAL_DOC_TYPES).variant, 'classic');
    assert.equal(COMMERCIAL_DOC_TYPES.length, 4);
  });

  it('documents and the list print are read apart', () => {
    const configs = [
      { docType: 'sales-invoice', variant: 'modern', color: '#112233', font: 'serif' },
      { docType: 'listing', variant: 'compact', rowStripes: 'off', fontSize: 'large' },
    ];
    assert.equal(currentSettings(configs, COMMERCIAL_DOC_TYPES).variant, 'modern');
    assert.equal(currentSettings(configs, COMMERCIAL_DOC_TYPES).color, '#112233');
    const listing = currentSettings(configs, LISTING_DOC_TYPES);
    assert.equal(listing.variant, 'compact');
    assert.equal(listing.rowStripes, 'off');
    assert.equal(listing.color, null);
  });

  it('reads and sends the list print show-logo option', async () => {
    assert.equal(currentSettings([{ docType: 'listing', variant: 'classic', showLogo: 'on' }], LISTING_DOC_TYPES).showLogo, 'on');
    assert.equal(currentSettings([{ docType: 'listing', variant: 'classic', showLogo: 'sí' }], LISTING_DOC_TYPES).showLogo, null);
    let seen;
    await saveDocTemplateSettings(async (_p, options) => { seen = options; return ok({}); },
      'listing', { ...DEFAULT_SETTINGS, showLogo: 'on' }, { withBranding: false });
    assert.equal(JSON.parse(seen.body).showLogo, 'on');
  });

  it('a value the page does not know is shown as unset', () => {
    const settings = currentSettings([{ docType: 'listing', variant: 'modern', font: 'comic', fontSize: 'huge', rowStripes: 'maybe' }], LISTING_DOC_TYPES);
    assert.equal(settings.font, null);
    assert.equal(settings.fontSize, null);
    assert.equal(settings.rowStripes, null);
  });
});
