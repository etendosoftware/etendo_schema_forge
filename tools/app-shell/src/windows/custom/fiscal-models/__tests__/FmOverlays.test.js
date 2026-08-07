import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'FmOverlays.jsx'), 'utf8');

describe('FmOverlays — exports', () => {
  it('exports PresentModal', () => assert.match(src, /export function PresentModal/));
  it('exports FileGenModal', () => assert.match(src, /export function FileGenModal/));
  it('exports NewDeclModal', () => assert.match(src, /export function NewDeclModal/));
  it('exports IncidentTray', () => assert.match(src, /export function IncidentTray/));
  it('exports DrillDownPanel', () => assert.match(src, /export function DrillDownPanel/));
  it('exports ConfigDrawer', () => assert.match(src, /export function ConfigDrawer/));
});

describe('ConfigDrawer — structure', () => {
  it('has declarant section', () => assert.match(src, /fm\.config\.declarant\.title/));
  it('has m303 section', () => assert.match(src, /fm\.config\.m303\.title/));
  it('has m349 section', () => assert.match(src, /fm\.config\.m349\.title/));
  it('has IBAN field', () => assert.match(src, /fm\.config\.m303\.iban/));
  it('has operation keys E,A,T,S,I', () => assert.match(src, /'E', 'A', 'T', 'S', 'I'/));
});

describe('FmOverlays — no removed components', () => {
  it('does NOT export AuditReasonModal', () => assert.doesNotMatch(src, /export.*AuditReasonModal/));
  it('does NOT export CellHistoryPanel', () => assert.doesNotMatch(src, /export.*CellHistoryPanel/));
  it('does NOT contain manual adjustment logic', () => assert.doesNotMatch(src, /manualAdj/));
  it('does NOT export CompareDrawer', () => assert.doesNotMatch(src, /export function CompareDrawer/));
  it('does NOT reference T1_2026_BOXES (was CompareDrawer-only)', () => assert.doesNotMatch(src, /T1_2026_BOXES/));
});

describe('PresentModal — 2 paths', () => {
  it('has submitted_ack path', () => assert.match(src, /submitted_ack/));
  it('has submitted (no ack) path', () => assert.match(src, /'submitted'/));
  it('does not have a submitted_ext path', () => assert.doesNotMatch(src, /submitted_ext/));
  it('file upload tied to submitted_ack path', () => assert.match(src, /acuseFile/));
});
