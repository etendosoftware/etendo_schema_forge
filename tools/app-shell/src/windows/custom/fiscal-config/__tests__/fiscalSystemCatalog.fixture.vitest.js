// @covers tools/app-shell/src/windows/custom/fiscal-config/__tests__/fiscalSystemCatalog.fixture.js
// The drift guard between the SPA's catalog fixture and the backend's FiscalSifRules.catalog():
// both repositories pin the same golden file by SHA-256 (see the fixture's header).
import { createHash } from 'node:crypto';
import {
  FISCAL_SYSTEM_CATALOG,
  FISCAL_SYSTEM_CATALOG_GOLDEN_TEXT,
  FISCAL_SYSTEM_CATALOG_SHA256,
} from './fiscalSystemCatalog.fixture.js';

describe('fiscalSystemCatalog golden file', () => {
  it('is the file com.etendoerp.go pins (same SHA-256 as FiscalSifRulesTest.GOLDEN_SHA256)', () => {
    const sha = createHash('sha256').update(FISCAL_SYSTEM_CATALOG_GOLDEN_TEXT, 'utf8').digest('hex');
    expect(sha).toBe(FISCAL_SYSTEM_CATALOG_SHA256);
  });

  it('is what the fixture serves', () => {
    expect(FISCAL_SYSTEM_CATALOG).toEqual(JSON.parse(FISCAL_SYSTEM_CATALOG_GOLDEN_TEXT));
    expect(FISCAL_SYSTEM_CATALOG.territories).toHaveLength(7);
  });
});
