import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'ContactTypeToggle.jsx'), 'utf8');

describe('ContactTypeToggle', () => {
  it('accepts data and onChange props only', () => {
    assert.match(src, /export default function ContactTypeToggle\(\{ data, onChange \}\)/);
    assert.doesNotMatch(src, /recordId/);
    assert.doesNotMatch(src, /\btoken\b/);
    assert.doesNotMatch(src, /apiBaseUrl/);
  });

  it('returns null when data is falsy', () => {
    assert.match(src, /if \(!data\) return null/);
  });

  it('reads useContactsType from ContactsContext', () => {
    assert.match(src, /useContactsType/);
    assert.match(src, /from '\.\/ContactsContext'/);
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

  it('skips DB re-init on the post-save new-record transition', () => {
    assert.match(src, /!prevDataId && userSelectedRef\.current/);
  });

  it('does not fire any fetch/PATCH from handleSelect — persistence is via onChange only', () => {
    assert.match(src, /function handleSelect/);
    assert.doesNotMatch(src, /fetch\(/);
    assert.doesNotMatch(src, /method: 'PATCH'/);
    assert.doesNotMatch(src, /\/businessPartner\/\$\{recordId\}/);
  });

  it('handleSelect writes etgoIsperson into the editing state via onChange', () => {
    assert.match(src, /onChange\('etgoIsperson', newType === 'person'\)/);
  });

  it('restores the company draft, or derives it from first+last, on switch to company', () => {
    assert.match(src, /onChange/);
    assert.match(src, /if \(onChange\)/);
    assert.match(src, /if \(newType === 'company'\) syncFieldsToCompany\(\)/);
    assert.match(src, /function syncFieldsToCompany\(\)/);
    // The person names are kept as a local draft so a round-trip person → company
    // → person does not destroy them.
    assert.match(src, /personNameDraftRef\.current = \{ firstName, lastName \}/);
    // A user-owned company name wins over the derived one; only an auto-derived
    // (or empty) draft is refreshed from first+last.
    assert.match(src, /const existingDraft = String\(companyNameDraftRef\.current \|\| ''\)\.trim\(\)/);
    assert.match(src, /const companyName = companyNameAutoDerivedRef\.current \|\| !existingDraft/);
    // The draft moves only when there is a real value: an empty derivation must not erase a
    // legal name the user still owns.
    assert.match(src, /if \(companyName\) \{/);
    assert.match(src, /onChange\('name', companyName\)/);
  });

  // ETP-5350 — the label wraps an sr-only radio, so label activation synthesizes a second
  // click that bubbles back and ran handleSelect twice, wiping both drafts on every switch.
  it('stops the label from synthesizing a second click on the nested radio', () => {
    assert.match(src, /event\.preventDefault\(\)/);
    assert.match(src, /onClick=\{\(event\) =>/);
  });

  it('clears person fields (first/last name) when switching to company', () => {
    assert.match(src, /if \(firstName\) onChange\('etgoFirstname', ''\)/);
    assert.match(src, /if \(lastName\) onChange\('etgoLastname', ''\)/);
  });

  it('clears the legal name (Razón Social) when switching to person, keeping it as a draft', () => {
    assert.match(src, /else clearNameForPerson\(\)/);
    assert.match(src, /function clearNameForPerson\(\)/);
    assert.match(src, /const companyName = \(data\?\.name \|\| ''\)\.trim\(\)/);
    // Stored locally before being cleared from the payload, so switching back
    // restores it verbatim instead of re-deriving it.
    assert.match(src, /companyNameDraftRef\.current = companyName/);
    assert.match(src, /if \(companyName\) onChange\('name', ''\)/);
    assert.match(src, /if \(firstName\) onChange\('etgoFirstname', firstName\)/);
    assert.match(src, /if \(lastName\) onChange\('etgoLastname', lastName\)/);
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
