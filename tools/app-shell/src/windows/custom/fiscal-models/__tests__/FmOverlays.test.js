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
