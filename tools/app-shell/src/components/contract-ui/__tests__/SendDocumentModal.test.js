import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'SendDocumentModal.jsx'), 'utf8');
const sendSrc = readFileSync(join(__dirname, '..', 'documentEmailSend.js'), 'utf8');

describe('SendDocumentModal', () => {
  it('exports a default function component', () => {
    assert.match(src, /export default function SendDocumentModal/);
  });

  it('exports a named SendDocumentButton component', () => {
    assert.match(src, /export function SendDocumentButton/);
  });

  // ETP-4576 dropped the `token` prop: the credential comes from the active
  // session scheme, so the modal no longer receives or threads one.
  it('accepts documentType, documentNo, bpName, bpEmail, documentId, windowName, and onClose props', () => {
    assert.match(src, /documentType.*documentNo.*bpName.*bpEmail.*documentId.*windowName.*onClose/);
    assert.doesNotMatch(src.replace(/\/\/.*$/gm, ''), /\btoken\b/);
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

  it('disables Send button when documentId is missing or sending', () => {
    assert.match(src, /!documentId\s*\|\|\s*sending/);
  });

  it('sends document email through the email contracts endpoint', () => {
    assert.match(src, /sendDocumentEmail/);
    assert.match(sendSrc, /email-contracts\/\$\{contractName\}\/send/);
    assert.match(sendSrc, /buildEmailContractCommand/);
  });

  it('derives email contract names from the window name without document-specific branches', () => {
    assert.match(sendSrc, /return `\$\{windowName\}-send`/);
    assert.doesNotMatch(sendSrc, /windowName\s*===\s*'sales-invoice'/);
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

  // ── ETP-4089: recipient handling is contract-driven ───────────────────────

  it('does not keep local email validation for contract sends', () => {
    assert.doesNotMatch(src, /function\s+isValidEmail/);
    assert.doesNotMatch(src, /sendModalNoEmail/);
  });

  // NOTE: the subject/message fields used to be hard-coded read-only here.
  // ETP-4717 made them operator-editable — that behavior (not read-only,
  // onChange wires typed edits into state, edits flow into the send payload
  // as `messageEdits`) is now covered with real DOM assertions in the
  // `SendDocumentModal — subject and message editing (ETP-4717)` describe
  // block of the sibling `SendDocumentModal.vitest.jsx`, which is a stronger
  // guarantee than a source-regex check and supersedes the old assertion.

  it('does not send caller-provided provider payload fields', () => {
    const commandStart = sendSrc.indexOf('export function buildEmailContractCommand');
    const commandEnd = sendSrc.indexOf('export async function readEmailContractResponse');
    assert.ok(commandStart > -1, 'buildEmailContractCommand export not found');
    assert.ok(commandEnd > commandStart, 'readEmailContractResponse export not found after command builder');
    const commandSrc = sendSrc.slice(commandStart, commandEnd);
    assert.doesNotMatch(commandSrc, /\bto\b/);
    assert.doesNotMatch(commandSrc, /\btemplate\b/);
    assert.doesNotMatch(commandSrc, /\bdata\b/);
  });

  // ── ETP-4003: EmailFormPanel is module-level ───────────────────────────────

  it('EmailFormPanel is defined as a function at module level (before the default export)', () => {
    // The function declaration must appear before "export default function SendDocumentModal"
    const emailPanelPos = src.indexOf('function EmailFormPanel');
    const defaultExportPos = src.indexOf('export default function SendDocumentModal');
    assert.ok(emailPanelPos > -1, 'EmailFormPanel function not found');
    assert.ok(defaultExportPos > -1, 'SendDocumentModal default export not found');
    assert.ok(emailPanelPos < defaultExportPos, 'EmailFormPanel must be defined before SendDocumentModal');
  });
});
