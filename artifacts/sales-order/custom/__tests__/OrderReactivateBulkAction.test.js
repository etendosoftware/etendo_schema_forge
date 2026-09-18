import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'OrderReactivateBulkAction.jsx'), 'utf8');

describe('OrderReactivateBulkAction', () => {
  it('exports a default function component', () => {
    assert.match(src, /export default function OrderReactivateBulkAction/);
  });

  it('delegates to the shared BulkDocumentAction', () => {
    assert.match(src, /import BulkDocumentAction from '@\/components\/contract-ui\/BulkDocumentAction'/);
    assert.match(src, /<BulkDocumentAction \{\.\.\.props\}/);
  });

  // ETP-5302 — the floating bulk bar's button reads "Procesar" (`process`).
  // "Confirmar" is now the dropdown OPTION label (`confirm`, emitted by
  // BulkDocumentAction's own action builder), not the button label, and the old
  // `confirmBulk` key has been deleted from every locale file.
  it('labels the bulk button with the process key, never the deleted confirmBulk key', () => {
    assert.match(src, /labelKey="process"/);
    assert.doesNotMatch(src, /confirmBulk/);
  });

  it('passes a rowFilter that blocks reactivating an order with linked documents', () => {
    assert.match(src, /rowFilter=\{rowFilter\}/);
    assert.match(src, /action === 'RE'[\s\S]{0,120}hasLinkedDocuments/);
  });

  it('uses i18n for the rejection message (no hardcoded strings)', () => {
    assert.match(src, /useUI/);
    assert.match(src, /ui\('cannotReactivateLinkedDocs'\)/);
  });
});
