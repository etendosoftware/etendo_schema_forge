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
  it('exports CompareDrawer', () => assert.match(src, /export function CompareDrawer/));
});

describe('ConfigDrawer — structure', () => {
  it('has declarant section', () => assert.match(src, /fm\.config\.declarant\.title/));
  it('has m303 section', () => assert.match(src, /fm\.config\.m303\.title/));
  it('has m349 section', () => assert.match(src, /fm\.config\.m349\.title/));
  it('has IBAN field', () => assert.match(src, /fm\.config\.m303\.iban/));
  it('has operation keys E,A,T,S,I', () => assert.match(src, /'E', 'A', 'T', 'S', 'I'/));
});

describe('CompareDrawer — structure', () => {
  it('has compare title key', () => assert.match(src, /fm\.compare\.title/));
  it('has prev/curr/delta columns', () => assert.match(src, /fm\.compare\.prev/));
  it('has delta column header', () => assert.match(src, /fm\.compare\.delta/));
  it('has insight note', () => assert.match(src, /fm\.compare\.insight/));
});

describe('FmOverlays — no removed components', () => {
  it('does NOT export AuditReasonModal', () => assert.doesNotMatch(src, /export.*AuditReasonModal/));
  it('does NOT export CellHistoryPanel', () => assert.doesNotMatch(src, /export.*CellHistoryPanel/));
  it('does NOT contain manual adjustment logic', () => assert.doesNotMatch(src, /manualAdj/));
});

describe('PresentModal — 3 paths', () => {
  it('has presentadoAcuse path', () => assert.match(src, /presentadoAcuse/));
  it('has presentado (sin acuse) path', () => assert.match(src, /'presentado'/));
  it('has presentadoOtra path', () => assert.match(src, /presentadoOtra/));
  it('file upload tied to presentadoAcuse path', () => assert.match(src, /acuseFile/));
});
