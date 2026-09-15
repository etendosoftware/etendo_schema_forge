import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'InvoicePreview.jsx'), 'utf8');

describe('InvoicePreviewModal source', () => {
  // ETP-5229 rewrote useFiscalStatus to derive status synchronously from the
  // invoice's own header record — no more network params (token/apiBaseUrl/orgId).
  // Signature is (invoice, specName, profile, territory, cutoverDates) — the
  // corrected design (live-tested fix) added a 5th cutoverDates arg carrying the
  // earliest-ever cutover per system, built from earliestSiiCutoverDate/
  // earliestTbaiCutoverDate/earliestVerifactuCutoverDate.
  it('calls useFiscalStatus with the invoice record and the earliest-cutover-dates object, not a network-fetch signature', () => {
    assert.match(
      src,
      /useFiscalStatus\(\s*invoice,\s*specName,\s*profile,\s*territory,\s*\{\s*sii:\s*earliestSiiCutoverDate,\s*tbai:\s*earliestTbaiCutoverDate,\s*verifactu:\s*earliestVerifactuCutoverDate,?\s*\}\s*,?\s*\)/,
    );
    assert.doesNotMatch(src, /useFiscalStatus\([^)]*token[^)]*\)/);
    assert.doesNotMatch(src, /useFiscalStatus\([^)]*apiBaseUrl[^)]*\)/);
    assert.doesNotMatch(src, /useFiscalStatus\([^)]*orgId[^)]*\)/);
  });

  it('opens NewPaymentEntryModal without passing a token prop', () => {
    const modalBlock = src.match(/<NewPaymentEntryModal[\s\S]*?\/>/);
    assert.ok(modalBlock, 'expected NewPaymentEntryModal to be rendered');
    assert.doesNotMatch(modalBlock[0], /token=\{token\}/);
  });
});
