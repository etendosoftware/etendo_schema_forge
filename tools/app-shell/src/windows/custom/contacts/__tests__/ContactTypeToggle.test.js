import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'ContactTypeToggle.jsx'), 'utf8');

describe('ContactTypeToggle', () => {
  it('accepts data, recordId, token, apiBaseUrl props', () => {
    assert.match(src, /data/);
    assert.match(src, /recordId/);
    assert.match(src, /token/);
    assert.match(src, /apiBaseUrl/);
  });

  it('returns null when data is falsy', () => {
    assert.match(src, /if \(!data\) return null/);
  });

  it('reads useContactsType from ContactsContext', () => {
    assert.match(src, /useContactsType/);
    assert.match(src, /from '\.\/ContactsContext'/);
  });

  it('uses selectedRef to avoid stale closure in PATCH calls', () => {
    assert.match(src, /selectedRef/);
    assert.match(src, /selectedRef\.current = selected/);
  });

  it('uses userSelectedRef to track explicit user interaction', () => {
    assert.match(src, /userSelectedRef/);
    assert.match(src, /userSelectedRef\.current = true/);
    assert.match(src, /userSelectedRef\.current = false/);
  });

  it('uses prevDataIdRef to detect new-record-saved transition (null → uuid)', () => {
    assert.match(src, /prevDataIdRef/);
    assert.match(src, /prevDataIdRef\.current/);
  });

  it('initializes toggle from data.etgoIsperson supporting both boolean true and Y string', () => {
    assert.match(src, /data\.etgoIsperson === true/);
    assert.match(src, /data\.etgoIsperson === 'Y'/);
  });

  it('skips DB re-init and fires post-save PATCH when new record gets its ID', () => {
    assert.match(src, /!prevDataId && userSelectedRef\.current/);
  });

  it('fires PATCH to businessPartner endpoint using camelCase etgoIsperson key', () => {
    assert.match(src, /\/businessPartner\/\$\{recordId\}/);
    assert.match(src, /etgoIsperson/);
    assert.doesNotMatch(src, /EM_Etgo_Isperson/);
  });

  it('uses PATCH method for persistence calls', () => {
    assert.match(src, /method: 'PATCH'/);
  });

  it('handleSelect sets userSelectedRef and fires PATCH for existing records', () => {
    assert.match(src, /function handleSelect/);
    assert.match(src, /userSelectedRef\.current = true/);
    assert.match(src, /etgoIsperson: newType === 'person'/);
  });

  it('re-syncs name via onChange while auto-owned on switch to company', () => {
    assert.match(src, /onChange/);
    assert.match(src, /if \(onChange\)/);
    assert.match(src, /if \(newType === 'company'\)/);
    assert.match(src, /const lastAutoFilledNameRef = useRef\(null\)/);
    assert.match(src, /const ownedByAuto = currentName === '' \|\| currentName === lastAutoFilledNameRef\.current/);
    assert.match(src, /if \(ownedByAuto && fullName && fullName !== currentName\)/);
    assert.match(src, /onChange\('name', fullName\)/);
    assert.match(src, /lastAutoFilledNameRef\.current = null/);
  });

  it('clears person fields (first/last name) when switching to company', () => {
    assert.match(src, /if \(firstName\) onChange\('etgoFirstname', ''\)/);
    assert.match(src, /if \(lastName\) onChange\('etgoLastname', ''\)/);
  });

  it('clears the legal name (Razón Social) when switching to person', () => {
    assert.match(src, /else if \(newType === 'person'\)/);
    assert.match(src, /if \(\(data\?\.name \|\| ''\)\.trim\(\) !== ''\) onChange\('name', ''\)/);
    assert.match(src, /onChange\('name', ''\)/);
  });

  it('renders Person and Company buttons', () => {
    assert.match(src, /ui\('Person'\)/);
    assert.match(src, /ui\('company'\)/);
  });

  it('uses useEffect from react', () => {
    assert.match(src, /useEffect/);
    assert.match(src, /from 'react'/);
  });
});
