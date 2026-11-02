// @covers tools/app-shell/src/components/contract-ui/useContactCreateTypeGate.js
/**
 * The "create contact" popups' side of the `contact-category-type` flag. One hook, called by
 * both popups (the document Contacto selector and the OCR adapter), so covering it covers the
 * toggle point of both.
 *
 *  - OFF: the pre-category-type popup — the seed flags the contact from the document type, every
 *    key is POSTed (no `createOmitUntouched`), no `validateBeforeCreate`, no requirement.
 *  - ON: the category decides — no seed type, `customer` / `vendor` omitted unless touched, a
 *    requirement for the document type and a create check that refuses a category not granting it.
 *
 * `LOOKUP_CREATE_TARGETS`, `contactTypeRequirement` and `contactCategoryFlags` are REAL; only the
 * request boundary (`useApiFetch`), i18n and the flag read are mocked.
 */
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  flags: {},
  apiFetch: vi.fn(),
  apiFetchBase: null,
  ui: (key) => `ui:${key}`,
}));

vi.mock('@/lib/flags', async (importOriginal) => ({
  ...(await importOriginal()),
  useFeatureFlag: (key) => mocks.flags[key] ?? false,
}));
vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: (base) => {
    mocks.apiFetchBase = base;
    return mocks.apiFetch;
  },
}));
vi.mock('@/i18n', () => ({ useUI: () => mocks.ui }));

import { CONTACT_CATEGORY_TYPE } from '@/lib/flags';
import { LOOKUP_CREATE_TARGETS } from '../lookupCreateTargets.js';
import { useContactCreateTypeGate } from '../useContactCreateTypeGate.js';

const BP_BASE = 'https://host/sws/neo/contacts';

function renderGate(flagOn, documentType) {
  mocks.flags[CONTACT_CATEGORY_TYPE] = flagOn;
  return renderHook(() => useContactCreateTypeGate({ documentType, bpApiBaseUrl: BP_BASE })).result.current;
}

function categoryResponse(row) {
  return { ok: true, status: 200, json: async () => ({ response: { data: [row] } }) };
}

beforeEach(() => {
  mocks.flags = {};
  mocks.apiFetch.mockReset();
  mocks.apiFetchBase = null;
});

describe('useContactCreateTypeGate', () => {
  describe.each(['sale', 'purchase'])('opened from a %s document', (documentType) => {
    it('flag OFF: seeds the document type and drops createOmitUntouched, validateBeforeCreate and the requirement', () => {
      const gate = renderGate(false, documentType);
      expect(gate.enabled).toBe(false);
      expect(gate.seedDocumentType).toBe(documentType);
      expect(gate.requirement).toBeNull();
      expect(gate.target).not.toHaveProperty('createOmitUntouched');
      expect(gate.target).not.toHaveProperty('validateBeforeCreate');
      expect(gate.target.apiBaseUrl).toBe(BP_BASE);
      expect(gate.target.windowName).toBe(LOOKUP_CREATE_TARGETS.contact.windowName);
    });

    it('flag ON: no seed type, customer/vendor omitted unless touched, a requirement and a create check', () => {
      const gate = renderGate(true, documentType);
      expect(gate.enabled).toBe(true);
      expect(gate.seedDocumentType).toBeNull();
      expect(gate.requirement).toEqual({ requiredType: documentType === 'sale' ? 'customer' : 'vendor' });
      expect(gate.target.createOmitUntouched).toEqual(['customer', 'vendor']);
      expect(typeof gate.target.validateBeforeCreate).toBe('function');
      expect(gate.target.apiBaseUrl).toBe(BP_BASE);
    });
  });

  it('flag OFF with no document type seeds nothing', () => {
    expect(renderGate(false, undefined).seedDocumentType).toBeNull();
  });

  it('flag ON from a purchase: the create check reads the category from its own spec and refuses a customer-only one', async () => {
    mocks.apiFetch.mockResolvedValue(categoryResponse({ id: 'BPG-1', etgoIscustomer: true, etgoIsvendor: false }));
    const { target } = renderGate(true, 'purchase');
    const message = await target.validateBeforeCreate({
      businessPartnerCategory: 'BPG-1', 'businessPartnerCategory$_identifier': 'Clientes',
    });
    expect(mocks.apiFetchBase).toBe('https://host/sws/neo/business-partner-category');
    expect(mocks.apiFetch).toHaveBeenCalledWith('/businessPartnerCategory/BPG-1');
    expect(message).toBe('ui:contactCategoryNotVendor');
  });
  // Which categories pass or fail is buildContactTypeCreateCheck's own rule, covered in
  // contactTypeRequirement.vitest.js; the case above only proves this hook wires it up.
});
