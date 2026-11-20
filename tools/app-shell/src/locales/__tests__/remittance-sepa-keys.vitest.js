// @covers artifacts/remittance/custom/RemittanceFileCard.jsx
// @covers artifacts/remittance/custom/RemittanceSepaFileData.jsx
// @covers artifacts/remittance/custom/RemittanceAdvancedOptions.jsx
// @covers tools/app-shell/src/components/financial-accounts/CreditorIdControls.jsx
//
// A i18n key used by the remittance SEPA block / «Antes de confirmar» / account creditor field that is missing
// from a locale is SILENT: `ui()` echoes the raw key. Every literal key those files use (ui('x'), the key maps,
// ternaries) must exist in en_US, es_ES and es_AR.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import enUS from '../en_US.json';
import esAR from '../es_AR.json';
import esES from '../es_ES.json';

const SRC = join(__dirname, '..', '..');
const ROOT = join(SRC, '..', '..', '..');
const FILES = [
  join(ROOT, 'artifacts/remittance/custom/RemittanceFileCard.jsx'),
  join(ROOT, 'artifacts/remittance/custom/RemittanceSepaFileData.jsx'),
  join(ROOT, 'artifacts/remittance/custom/RemittanceAdvancedOptions.jsx'),
  join(ROOT, 'artifacts/remittance/custom/RemittanceProcessConfirmModal.jsx'),
  join(SRC, 'components/financial-accounts/CreditorIdControls.jsx'),
  join(SRC, 'windows/custom/financial-account/SepaCreditorIdSection.jsx'),
  join(SRC, 'windows/custom/financial-account/useAccountCreditorId.js'),
  join(SRC, 'lib/sepaCreditorId.js'),
];
// ui('key'), ui(cond ? 'a' : 'b'), and the quoted keys of the files' own key maps.
const KEY = /'((?:remittance|sepaCreditorId|sepaFile|financeAccountsSepa)[A-Za-z0-9]*)'/g;
// Matched by the pattern below but not dictionary keys: the spec name and the keys of the header-form gate fields.
const NOT_I18N = new Set(['remittance', 'sepaFileIban', 'sepaFileCreditorId']);
const UI_CALL = /\bui\(\s*([^)]*)\)/g;

function usedKeys() {
  const keys = new Set();
  for (const file of FILES) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(KEY)) keys.add(m[1]);
    for (const call of text.matchAll(UI_CALL)) {
      for (const m of call[1].matchAll(/'([a-z][A-Za-z0-9]*)'/g)) keys.add(m[1]);
    }
  }
  return [...keys].filter((key) => !NOT_I18N.has(key));
}

describe('remittance SEPA i18n keys', () => {
  const keys = usedKeys();

  it('finds the keys the files use', () => {
    expect(keys).toEqual(expect.arrayContaining(['remittanceFileCreditorIdHint', 'sepaCreditorIdSourceSuggested', 'remittanceSchemeB2b']));
  });

  it.each([['en_US', enUS], ['es_ES', esES], ['es_AR', esAR]])('every key used exists in %s', (_name, dictionary) => {
    const labels = { ...dictionary.genericLabels, ...dictionary.ui };
    const missing = keys.filter((key) => !(key in labels));
    expect(missing).toEqual([]);
  });
});
