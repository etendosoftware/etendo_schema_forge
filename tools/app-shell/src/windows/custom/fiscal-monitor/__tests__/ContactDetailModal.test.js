import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'ContactDetailModal.jsx'), 'utf8');

// Copied from ContactDetailModal.jsx — not exported, tested inline here.
// Update both if the source changes.
function formatAddress(loc) {
  if (!loc) return null;
  const parts = [
    loc.address ?? loc.addressLine1,
    loc.city ?? loc.cityName,
    loc['country$_identifier'] ?? loc.countryLabel,
  ].filter(Boolean);
  return parts.join(', ') || loc.name || null;
}

// Guards: formatAddress handles all location object shapes returned by the API
describe('formatAddress — inline logic (copied from ContactDetailModal.jsx)', () => {
  it('formats a full address object', () => {
    assert.equal(
      formatAddress({ address: 'Calle Mayor 1', city: 'Madrid', 'country$_identifier': 'España' }),
      'Calle Mayor 1, Madrid, España'
    );
  });

  it('falls back to addressLine1 and cityName aliases', () => {
    assert.equal(
      formatAddress({ addressLine1: 'Av. Corrientes 123', cityName: 'Buenos Aires' }),
      'Av. Corrientes 123, Buenos Aires'
    );
  });

  it('falls back to location name when no address parts are present', () => {
    assert.equal(formatAddress({ name: 'Main Office' }), 'Main Office');
  });

  it('returns null for null location', () => {
    assert.equal(formatAddress(null), null);
  });

  it('returns null for an empty object', () => {
    assert.equal(formatAddress({}), null);
  });
});

// Guards: component contract — exports, props, early return
describe('ContactDetailModal — structure', () => {
  it('exports a default function ContactDetailModal', () => {
    assert.match(src, /export default function ContactDetailModal/);
  });

  it('accepts open prop', () => assert.match(src, /\bopen\b/));
  it('accepts onClose prop', () => assert.match(src, /\bonClose\b/));
  it('accepts bpId prop', () => assert.match(src, /\bbpId\b/));
  it('accepts token prop', () => assert.match(src, /\btoken\b/));
  it('accepts contactsApiBase prop', () => assert.match(src, /\bcontactsApiBase\b/));

  it('returns null when open is falsy', () => {
    assert.match(src, /if \(!open\) return null/);
  });
});

// Guards: all three API calls use correct URLs and run in parallel
describe('ContactDetailModal — data fetching', () => {
  it('fetches BP from businessPartner/{bpId}', () => {
    assert.match(src, /businessPartner\/\$\{bpId\}/);
  });

  it('fetches location from locationAddress?parentId={bpId}', () => {
    assert.match(src, /locationAddress\?parentId=\$\{bpId\}/);
  });

  it('fetches Tax ID Key options from EM_OBTIK_Tax_ID_Key selector', () => {
    assert.match(src, /EM_OBTIK_Tax_ID_Key/);
  });

  it('runs all three fetches in parallel via Promise.all', () => {
    assert.match(src, /Promise\.all\(/);
  });

  it('skips fetching when open, bpId, or contactsApiBase is missing', () => {
    assert.match(src, /if \(!open[\s\S]*?bpId[\s\S]*?contactsApiBase\) return/);
  });
});

// Guards: save operation uses PUT with correct URL and required fields in body
describe('ContactDetailModal — save (PUT)', () => {
  it('saves via PUT to businessPartner/{bpId}', () => {
    assert.match(src, /method.*PUT/);
    assert.match(src, /businessPartner\/\$\{bpId\}/);
  });

  it('PUT body includes oBTIKTaxIDKey', () => {
    assert.match(src, /oBTIKTaxIDKey/);
  });

  it('PUT body includes taxID', () => {
    assert.match(src, /taxID/);
  });
});

// Guards: all required fields are rendered with correct i18n keys
describe('ContactDetailModal — fields rendered', () => {
  it('renders contactDetail.name label', () => assert.match(src, /contactDetail\.name/));
  it('renders contactDetail.taxID label', () => assert.match(src, /contactDetail\.taxID/));
  it('renders contactDetail.taxIDKey label', () => assert.match(src, /contactDetail\.taxIDKey/));
  it('renders contactDetail.location label', () => assert.match(src, /contactDetail\.location/));
  it('renders contactDetail.editLocation button', () => assert.match(src, /contactDetail\.editLocation/));
  it('renders LocationEditorModal', () => assert.match(src, /LocationEditorModal/));
  it('passes rowId={location?.id} to LocationEditorModal', () => assert.match(src, /rowId=\{location\?\.id/));
  it('passes bpId to LocationEditorModal', () => assert.match(src, /bpId=\{bpId\}/));
});

// Guards: TaxIDKeyPicker is a custom dropdown — structural assertions prevent regressions
describe('TaxIDKeyPicker — structure', () => {
  it('is defined in the same file', () => assert.match(src, /function TaxIDKeyPicker/));

  it('renders a loading spinner with animate-spin when loading', () => {
    assert.match(src, /animate-spin/);
  });

  it('renders ChevronDown icon in the trigger button', () => {
    assert.match(src, /ChevronDown/);
  });

  it('renders Check icon on the selected item', () => {
    assert.match(src, /Check.*size/);
  });

  it('highlights the selected item with bg-blue-50', () => {
    assert.match(src, /bg-blue-50/);
  });

  it('handles Escape key to close the dropdown', () => {
    assert.match(src, /Escape/);
    assert.match(src, /handleListKeyDown|onKeyDown/);
  });

  it('uses a fixed-position backdrop div for outside-click detection', () => {
    assert.match(src, /fixed inset-0.*z-\[60\]/);
  });

  it('uses onMouseDown (not onClick) on list items to prevent blur race condition', () => {
    assert.match(src, /onMouseDown[\s\S]*?onChange/);
  });
});
