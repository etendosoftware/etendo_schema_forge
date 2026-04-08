import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'SendDocumentModal.jsx'), 'utf8');

describe('SendDocumentModal', () => {
  it('exports a default function component', () => {
    assert.match(src, /export default function SendDocumentModal/);
  });

  it('exports a named SendDocumentButton component', () => {
    assert.match(src, /export function SendDocumentButton/);
  });

  it('accepts documentType, documentNo, bpName, bpEmail, documentId, windowName, token, and onClose props', () => {
    assert.match(src, /documentType.*documentNo.*bpName.*bpEmail.*documentId.*windowName.*token.*onClose/);
  });

  it('builds reportId from windowName', () => {
    assert.match(src, /print-\$\{windowName\}/);
  });

  it('renders PDF preview via iframe and report render API', () => {
    assert.match(src, /\/api\/reports\/.*\/render/);
    assert.match(src, /iframe/);
  });

  it('supports PDF download via jsreport API', () => {
    assert.match(src, /\/jsreport\/api\/report/);
    assert.match(src, /chrome-pdf/);
    assert.match(src, /\.download\s*=/);
  });

  it('pre-fills email from bpEmail when it contains @', () => {
    assert.match(src, /bpEmail.*includes\('@'\)/);
  });

  it('pre-fills subject with document type and number', () => {
    assert.match(src, /\$\{documentType\}.*#\$\{documentNo\}/);
  });

  it('disables Send button when email is empty or sending', () => {
    assert.match(src, /!to\.trim\(\)\s*\|\|\s*sending/);
  });

  it('uses toast for send confirmation', () => {
    assert.match(src, /toast\.success/);
  });

  it('handles PDF rendering errors gracefully', () => {
    assert.match(src, /pdfError/);
    assert.match(src, /Preview failed/);
  });

  it('generates download filename from windowName and documentNo', () => {
    assert.match(src, /\$\{windowName\}-\$\{documentNo\}\.pdf/);
  });
});
