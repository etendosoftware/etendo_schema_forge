import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'custom', 'fiscal-monitor', 'FiscalMonitorPage.jsx'), 'utf8');

const en = JSON.parse(readFileSync(join(__dirname, '..', '..', '..', '..', '..', 'packages', 'app-shell-core', 'src', 'locales', 'en_US.json'), 'utf8'));
const es = JSON.parse(readFileSync(join(__dirname, '..', '..', '..', '..', '..', 'packages', 'app-shell-core', 'src', 'locales', 'es_ES.json'), 'utf8'));

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

  it('renders ContactDetailModal with open={!!bpPopup.bpId}', () => {
    assert.match(src, /open=\{!!bpPopup\.bpId\}/);
  });
});

// Guards: bpPopup must carry an object with bpId, not a boolean — otherwise
// ContactDetailModal.bpId would be true/false instead of the actual partner ID.
describe('FiscalMonitorPage — bpPopup carries a string bpId (not a boolean)', () => {
  it('onBpClick lambda wraps bpId in an object (not a plain string or boolean)', () => {
    // Pattern: (bpId) => setBpPopup({ bpId })  — object shape, not setBpPopup(bpId) or setBpPopup(true)
    assert.match(src, /onBpClick.*bpId.*setBpPopup\(\{[^)]*bpId[^)]*\}\)/);
  });

  it('ContactDetailModal receives bpId from bpPopup object field', () => {
    // bpId={bpPopup.bpId} — extracted from the object, not the raw state
    assert.match(src, /bpId=\{bpPopup\.bpId\}/);
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

// Guards: VfSolveErrorModal wiring — state, handlers, and prop forwarding
describe('FiscalMonitorPage — VfSolveErrorModal wiring', () => {
  it('imports VfSolveErrorModal', () => {
    assert.match(src, /VfSolveErrorModal/);
  });

  it('declares vfErrorRows state', () => {
    assert.match(src, /vfErrorRows/);
  });

  it('declares vfErrorModalOpen state', () => {
    assert.match(src, /vfErrorModalOpen/);
  });

  it('handleVfErrorClick sets vfErrorRows and opens modal', () => {
    assert.match(src, /handleVfErrorClick/);
    assert.match(src, /setVfErrorRows/);
    assert.match(src, /setVfErrorModalOpen/);
  });

  it('handleVfResolveClick sets vfErrorRows and opens modal', () => {
    assert.match(src, /handleVfResolveClick/);
  });

  it('passes onVfErrorClick to VerifactuMonitorSection', () => {
    assert.match(src, /VerifactuMonitorSection[\s\S]*?onVfErrorClick/);
  });

  it('passes onVfResolveClick to VerifactuMonitorSection', () => {
    assert.match(src, /VerifactuMonitorSection[\s\S]*?onVfResolveClick/);
  });

  it('renders VfSolveErrorModal with open={vfErrorModalOpen}', () => {
    assert.match(src, /open=\{vfErrorModalOpen\}/);
  });

  it('VfSolveErrorModal receives rows={vfErrorRows}', () => {
    assert.match(src, /rows=\{vfErrorRows\}/);
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
