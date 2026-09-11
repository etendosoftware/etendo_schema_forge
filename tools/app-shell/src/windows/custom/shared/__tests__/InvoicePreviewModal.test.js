import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'InvoicePreview.jsx'), 'utf8');

describe('InvoicePreviewModal source', () => {
  // ETP-5087 added a trailing `territory` argument (TBAI territory gating for purchase
  // invoices) — the regex below tolerates that optional extra arg while still guarding
  // against the original bug (a `token` argument sneaking back in).
  it('calls useFiscalStatus without a token argument — signature is (id, spec, profile, apiBaseUrl, orgId[, territory])', () => {
    assert.match(src, /useFiscalStatus\(\s*invoice\?\.id,\s*specName,\s*profile,\s*apiBaseUrl,\s*orgId,(\s*territory,?)?\s*\)/);
    assert.doesNotMatch(src, /useFiscalStatus\([^)]*token[^)]*orgId/);
  });

  it('opens NewPaymentEntryModal without passing a token prop', () => {
    const modalBlock = src.match(/<NewPaymentEntryModal[\s\S]*?\/>/);
    assert.ok(modalBlock, 'expected NewPaymentEntryModal to be rendered');
    assert.doesNotMatch(modalBlock[0], /token=\{token\}/);
  });
});
