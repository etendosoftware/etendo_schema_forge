// @covers tools/app-shell/src/windows/custom/fiscal-config/__tests__/fiscalSystemCatalog.fixture.js
// The drift guard between the SPA's catalog fixture and the backend's FiscalSifRules.catalog():
// both repositories pin the same golden file by SHA-256 (see the fixture's header). The hash is
// taken over the file's own content (Vite `?raw`: the text exactly as stored, no re-serialization)
// — the same bytes FiscalSifRulesTest hashes — so a reformatted file fails here even when its data
// is unchanged.
import { createHash } from 'node:crypto';
import GOLDEN_TEXT from './fiscalSystemCatalog.golden.json?raw';
import {
  FISCAL_SYSTEM_CATALOG,
  FISCAL_SYSTEM_CATALOG_SHA256,
} from './fiscalSystemCatalog.fixture.js';

const GOLDEN_BYTES = Buffer.from(GOLDEN_TEXT, 'utf8');

describe('fiscalSystemCatalog golden file', () => {
  it('is the file com.etendoerp.go pins (same SHA-256 as FiscalSifRulesTest.GOLDEN_SHA256)', () => {
    const sha = createHash('sha256').update(GOLDEN_BYTES).digest('hex');
    expect(sha).toBe(FISCAL_SYSTEM_CATALOG_SHA256);
  });

  it('is what the fixture serves', () => {
    expect(FISCAL_SYSTEM_CATALOG).toEqual(JSON.parse(GOLDEN_BYTES.toString('utf8')));
    expect(FISCAL_SYSTEM_CATALOG.territories).toHaveLength(7);
  });
});
