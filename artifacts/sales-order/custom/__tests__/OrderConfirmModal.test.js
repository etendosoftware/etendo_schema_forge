import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'OrderConfirmModal.jsx'), 'utf8');

describe('OrderConfirmModal', () => {
  it('exports a default function component', () => {
    assert.match(src, /export default function OrderConfirmModal/);
  });

  it('uses the useUI() hook for translations', () => {
    assert.match(src, /from\s+['"]@\/i18n['"]/);
    assert.match(src, /useUI\(\)/);
  });

  // ETP-4312: the arrow on each "view document" button comes from code (a literal
  // " →" glyph appended after the {ui(...)} label in JSX), never from the label.
  describe('view-document button arrows (ETP-4312)', () => {
    it('renders soViewShipment label followed by a literal " →" glyph', () => {
      assert.match(src, /\{ui\('soViewShipment'\)\}\s*→/);
    });

    it('renders soViewInvoice label followed by a literal " →" glyph', () => {
      assert.match(src, /\{ui\('soViewInvoice'\)\}\s*→/);
    });
  });
});
