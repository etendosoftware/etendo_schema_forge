import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'QuotationSecondaryActions.jsx'), 'utf8');

// ETP-5260 — Clone and Send both moved here from QuotationTopbarActions.jsx
// (topbarRight). See QuotationTopbarActions.test.js's "no longer imports
// CloneOrderModal or wires a Clone button itself" / "no longer renders a
// SendDocumentButton" regression guards for the sibling coverage.
describe('QuotationSecondaryActions', () => {
  it('exports a default function component named QuotationSecondaryActions', () => {
    assert.match(src, /export default function QuotationSecondaryActions/);
  });

  it('delegates to the shared DocumentSecondaryActions component', () => {
    assert.match(src, /import DocumentSecondaryActions from '@\/windows\/custom\/shared\/DocumentSecondaryActions'/);
    assert.match(src, /<DocumentSecondaryActions/);
  });

  it('forwards windowName="sales-quotation"', () => {
    assert.match(src, /windowName="sales-quotation"/);
  });

  it('delegates cloning to the cloneRecord backend action against the quotation headerEntity', () => {
    assert.match(src, /clone=\{\{ cloneActionName: 'cloneRecord', headerEntity: 'quotation' \}\}/);
  });

  // ETP-4717 — the Send button must not be available while the quotation is
  // still Draft (DR); it must be visible from "Bajo evaluación" (UE) onward.
  it('gates Send on status !== DR (never true while DR, so this is the ETP-4717 fix)', () => {
    assert.match(src, /const status = props\.data\?\.documentStatus/);
    assert.match(src, /showSend=\{Boolean\(status\) && status !== 'DR'\}/);
  });

  it('dispatches the sales-quotation:open-send-modal window event on Send click', () => {
    assert.match(
      src,
      /onSendClick=\{\(\) => window\.dispatchEvent\(new CustomEvent\('sales-quotation:open-send-modal'\)\)\}/,
    );
  });
});
