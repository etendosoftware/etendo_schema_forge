import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'GoodsShipmentBillingBadge.jsx'), 'utf8');

describe('GoodsShipmentBillingBadge', () => {
  it('exports a default function component named GoodsShipmentBillingBadge', () => {
    assert.match(src, /export default function GoodsShipmentBillingBadge/);
  });

  it('imports useUI from @/i18n', () => {
    assert.match(src, /import\s*\{[^}]*useUI[^}]*\}\s*from\s*['"]@\/i18n['"]/);
  });

  it('imports getProgressTone from @/lib/progressTone', () => {
    assert.match(src, /import\s*\{[^}]*getProgressTone[^}]*\}\s*from\s*['"]@\/lib\/progressTone['"]/);
  });

  it('imports TONE_STYLES from @/components/ui/status-tag-tokens', () => {
    assert.match(src, /import\s*\{[^}]*TONE_STYLES[^}]*\}\s*from\s*['"]@\/components\/ui\/status-tag-tokens/);
  });

  it('does not import DocumentStatusPill (replaced by inline span + TONE_STYLES)', () => {
    assert.doesNotMatch(src, /import\s+DocumentStatusPill/);
  });

  describe('null guard — only renders when invoiced > 0', () => {
    it('reads invoiceStatus and coerces it to a number defaulting to 0', () => {
      assert.match(src, /data\?\.invoiceStatus\s*!=\s*null\s*\?\s*Number\(\s*data\.invoiceStatus\s*\)\s*:\s*0/);
    });

    it('returns null when the invoiced percentage is <= 0', () => {
      assert.match(src, /if\s*\(\s*rawPct\s*<=\s*0\s*\)\s*return null/);
    });
  });

  describe('invoice percentage calculation', () => {
    it('reads invoiceStatus from data', () => {
      assert.match(src, /data\?\.invoiceStatus/);
    });

    it('normalises invoiceStatus to a 0-1 fraction (divides by 100)', () => {
      assert.match(src, /\/\s*100/);
    });

    it('computes final display percentage via Math.round', () => {
      assert.match(src, /Math\.round\s*\(/);
    });

    it('does not read completelyInvoiced (simplified — invoiceStatus only)', () => {
      assert.doesNotMatch(src, /data\?\.completelyInvoiced/);
    });
  });

  describe('tone via getProgressTone', () => {
    it('calls getProgressTone with the normalised fraction', () => {
      assert.match(src, /getProgressTone\s*\(\s*pct\s*\)/);
    });

    it('looks up palette from TONE_STYLES using the tone', () => {
      assert.match(src, /TONE_STYLES\s*\[\s*tone\s*\]/);
    });

    it('applies palette.background as the span background', () => {
      assert.match(src, /palette\.background/);
    });

    it('applies palette.color as the span color', () => {
      assert.match(src, /palette\.color/);
    });
  });

  describe('i18n — no hardcoded English strings', () => {
    it('uses ui("invoiced") as the badge label', () => {
      assert.match(src, /ui\(['"]invoiced['"]\)/);
    });

    it('does not hardcode "Invoiced", "Partially Invoiced", or "Pending"', () => {
      assert.doesNotMatch(src, /['"](Invoiced|Partially Invoiced|Pending)['"]/);
    });
  });

  describe('rendering — inline span, no DocumentStatusPill', () => {
    it('renders a <span> element as the badge root', () => {
      assert.match(src, /<span/);
    });

    it('shows the numeric percentage in a tabular-nums span', () => {
      assert.match(src, /fontVariantNumeric.*tabular-nums/s);
    });

    it('does not render <DocumentStatusPill', () => {
      assert.doesNotMatch(src, /<DocumentStatusPill/);
    });
  });
});
