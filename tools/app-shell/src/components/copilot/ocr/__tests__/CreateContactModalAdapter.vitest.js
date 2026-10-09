// @covers tools/app-shell/src/components/copilot/ocr/CreateContactModalAdapter.jsx

import { describe, it, expect, vi } from 'vitest';

// The adapter's pure builders are the unit under test; the modal and the category hook
// would drag the whole embedded Contacts window into the closure.
vi.mock('../../../contract-ui/RecordCreateModal.jsx', () => ({ default: () => null }));
vi.mock('../../../contract-ui/useContactCategorySeed.js', () => ({
  useContactCategorySeed: () => ({ ready: true, categorySeed: {} }),
}));

import { buildOcrContactAddressSeed } from '../CreateContactModalAdapter.jsx';

describe('buildOcrContactAddressSeed (ETP-5654)', () => {
  it('maps the OCR address keys and renames country to countryName, trimmed', () => {
    expect(buildOcrContactAddressSeed({
      address: ' Gran Vía 45 ', postalCode: '28013 ', city: ' Madrid', country: ' España ', name: 'ignored',
    })).toEqual({ address: 'Gran Vía 45', postalCode: '28013', city: 'Madrid', countryName: 'España' });
  });

  it('keeps a partial seed (only some keys present)', () => {
    expect(buildOcrContactAddressSeed({ city: 'Madrid' }))
      .toEqual({ address: '', postalCode: '', city: 'Madrid', countryName: '' });
  });

  it('returns null when the payload has no address data', () => {
    expect(buildOcrContactAddressSeed({})).toBeNull();
    expect(buildOcrContactAddressSeed(null)).toBeNull();
    expect(buildOcrContactAddressSeed({ address: '  ', city: '', postalCode: null, country: undefined })).toBeNull();
  });
});
