import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'QuotationStatusBadge.jsx'), 'utf8');

describe('QuotationStatusBadge', () => {
  it('exports a default function component', () => {
    assert.match(src, /export default function QuotationStatusBadge/);
  });

  it('imports useUI from @/i18n', () => {
    assert.match(src, /from\s+['"]@\/i18n['"]/);
    assert.match(src, /useUI/);
  });

  it('returns null when documentStatus is missing', () => {
    assert.match(src, /data\?\.documentStatus/);
    assert.match(src, /return null/);
  });

  describe('STATUS_CONFIG entries', () => {
    const expectedKeys = {
      DR:      'statusDraft',
      UE:      'statusUnderEvaluation',
      CO:      'statusComplete',
      CA:      'statusOrderCreated',
      ETGO_CI: 'statusInvoiceCreated',
      CL:      'statusClosed',
      CJ:      'statusRejected',
      VO:      'statusVoid',
    };

    for (const [code, key] of Object.entries(expectedKeys)) {
      it(`maps ${code} to i18n key '${key}'`, () => {
        const re = new RegExp(`${code}\\s*:\\s*\\{[^}]*key:\\s*['"]${key}['"]`);
        assert.match(src, re);
      });
    }

    it('has CA mapped to the semantic success roles', () => {
      assert.match(src, /CA:\s*\{[^}]*dot:\s*'var\(--status-success-fg\)'/);
      assert.match(src, /CA:\s*\{[^}]*bg:\s*'var\(--status-success-bg\)'/);
    });

    it('has ETGO_CI mapped to the semantic success roles', () => {
      assert.match(src, /ETGO_CI:\s*\{[^}]*dot:\s*'var\(--status-success-fg\)'/);
      assert.match(src, /ETGO_CI:\s*\{[^}]*bg:\s*'var\(--status-success-bg\)'/);
    });

    it('has CJ mapped to the semantic destructive role', () => {
      assert.match(src, /CJ:\s*\{[^}]*dot:\s*'hsl\(var\(--destructive\)\)'/);
      assert.match(src, /CJ:\s*\{[^}]*bg:\s*'hsl\(var\(--destructive\) \/ 0\.12\)'/);
    });
  });

  describe('i18n compliance', () => {
    it('does not contain a literal label property anywhere (no hardcoded strings)', () => {
      assert.doesNotMatch(src, /\blabel\s*:\s*['"]/);
    });

    it('does not hardcode the English status strings', () => {
      assert.doesNotMatch(src, /['"`](Draft|Under Evaluation|Confirmed|Converted|Closed - Invoice Created|Closed - Invoiced|Voided)['"`]/);
    });

    it('renders the label through ui(cfg.key)', () => {
      assert.match(src, /\{ui\(cfg\.key\)\}/);
    });
  });
});
