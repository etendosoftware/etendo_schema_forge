import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'QuotationTopbarActions.jsx'), 'utf8');

describe('QuotationTopbarActions', () => {
  it('exports a default function component', () => {
    assert.match(src, /export default function QuotationTopbarActions/);
  });

  it('accepts data, recordId, token, and apiBaseUrl props', () => {
    assert.match(src, /\{\s*data.*recordId.*token.*apiBaseUrl\s*\}/);
  });

  it('returns null when documentStatus is missing', () => {
    assert.match(src, /data\?\.documentStatus.*return null/s);
  });

  it('renders a SendDocumentButton', () => {
    assert.match(src, /SendDocumentButton/);
  });

  it('renders SendDocumentModal via createPortal when triggered', () => {
    assert.match(src, /createPortal/);
    assert.match(src, /SendDocumentModal/);
  });

  it('passes documentType Quotation to SendDocumentModal', () => {
    assert.match(src, /documentType="Quotation"/);
  });

  it('passes windowName sales-quotation to SendDocumentModal', () => {
    assert.match(src, /windowName="sales-quotation"/);
  });

  it('imports SendDocumentModal and SendDocumentButton from contract-ui', () => {
    assert.match(src, /from\s+['"]@\/components\/contract-ui\/SendDocumentModal['"]/);
  });
});
