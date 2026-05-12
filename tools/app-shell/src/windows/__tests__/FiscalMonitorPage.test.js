import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'custom', 'fiscal-monitor', 'FiscalMonitorPage.jsx'), 'utf8');

const en = JSON.parse(readFileSync(join(__dirname, '..', '..', 'locales', 'en_US.json'), 'utf8'));
const es = JSON.parse(readFileSync(join(__dirname, '..', '..', 'locales', 'es_ES.json'), 'utf8'));

// Guards: ContactDetailModal wiring — modal state and API base must be present
describe('FiscalMonitorPage — ContactDetailModal wiring', () => {
  it('imports ContactDetailModal', () => {
    assert.match(src, /ContactDetailModal/);
  });

  it('declares bpPopup state variable', () => {
    assert.match(src, /bpPopup/);
  });

  it('declares setBpPopup state setter', () => {
    assert.match(src, /setBpPopup/);
  });

  it('derives contactsApiBase via neoBase(apiBaseUrl)', () => {
    assert.match(src, /contactsApiBase.*neoBase/);
  });

  it('renders ContactDetailModal with open={!!bpPopup}', () => {
    assert.match(src, /open=\{!!\s*bpPopup\}/);
  });
});

// Guards: bpPopup must carry the raw bpId string, not a boolean — otherwise
// ContactDetailModal.bpId would be true/false instead of the actual partner ID.
describe('FiscalMonitorPage — bpPopup carries a string bpId (not a boolean)', () => {
  it('onBpClick lambda passes bpId directly to setBpPopup (not true/false)', () => {
    // Pattern: (bpId) => setBpPopup(bpId)  — NOT setBpPopup(true) or setBpPopup(!!bpId)
    assert.match(src, /onBpClick.*bpId.*setBpPopup\(bpId\)/);
  });

  it('ContactDetailModal receives bpId={bpPopup} (raw state value)', () => {
    assert.match(src, /bpId=\{bpPopup\}/);
  });

  it('bpPopup is initialised to null (not false)', () => {
    assert.match(src, /useState\(null\)[\s\S]*?bpPopup|bpPopup[\s\S]*?useState\(null\)/);
  });
});

// Guards: onBpClick must be wired to all three monitor sections
describe('FiscalMonitorPage — onBpClick wiring to sections', () => {
  it('passes onBpClick to SiiMonitorSection', () => {
    assert.match(src, /SiiMonitorSection[\s\S]*?onBpClick/);
  });

  it('passes onBpClick to TbaiMonitorSection', () => {
    assert.match(src, /TbaiMonitorSection[\s\S]*?onBpClick/);
  });

  it('passes onBpClick to VerifactuMonitorSection', () => {
    assert.match(src, /VerifactuMonitorSection[\s\S]*?onBpClick/);
  });
});

// Guards: all new i18n keys added for the contact detail feature must exist in both locales
describe('i18n coverage — contactDetail and fiscalMonitor.viewContact keys', () => {
  const requiredKeys = [
    'fiscalMonitor.viewContact',
    'contactDetail.title',
    'contactDetail.name',
    'contactDetail.taxID',
    'contactDetail.taxIDKey',
    'contactDetail.location',
    'contactDetail.editLocation',
    'contactDetail.saved',
    'contactDetail.saveError',
  ];

  for (const key of requiredKeys) {
    it(`en_US.json has key "${key}"`, () => {
      assert.notEqual(en.genericLabels[key], undefined, `Missing key: ${key}`);
    });

    it(`es_ES.json has key "${key}"`, () => {
      assert.notEqual(es.genericLabels[key], undefined, `Missing key: ${key}`);
    });
  }
});
