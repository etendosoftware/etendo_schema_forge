import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'LinesBottomSection.jsx'), 'utf8');

describe('LinesBottomSection', () => {
  it('exports a default function component', () => {
    assert.match(src, /export default function LinesBottomSection/);
  });

  it('accepts all expected props', () => {
    for (const prop of [
      'recordId', 'data', 'token', 'apiBaseUrl', 'api',
      'notesField', 'onFieldChange', 'notesFocused', 'setNotesFocused',
      'lines', 'pendingLine', 'editingLine', 'lineConfig',
      'totalDiscountPct', 'onTotalDiscountChange',
      'relatedDocuments', 'showTotals', 'notesExtra',
    ]) {
      assert.match(src, new RegExp(`\\b${prop}\\b`), `missing prop: ${prop}`);
    }
  });

  it('showTotals defaults to true', () => {
    assert.match(src, /showTotals\s*=\s*true/);
  });

  it('renders DocumentTotalsPanel when showTotals is true', () => {
    assert.match(src, /DocumentTotalsPanel/);
    assert.match(src, /showTotals\s*&&/);
  });

  it('derives isReadOnly from documentStatus !== DR', () => {
    assert.match(src, /documentStatus\s*!==\s*'DR'/);
  });

  it('renders RelatedDocumentsComponent when provided', () => {
    assert.match(src, /RelatedDocumentsComponent\s*&&/);
    assert.match(src, /<RelatedDocumentsComponent/);
  });

  it('renders the notesField area when notesField is truthy', () => {
    assert.match(src, /notesField\s*&&/);
    assert.match(src, /data\?\.\[notesField\]/);
  });

  it('uses useUI for the docs and notes section labels', () => {
    assert.match(src, /useUI\(\)/);
    assert.match(src, /ui\('docs'\)/);
    assert.match(src, /ui\('notes'\)/);
  });

  it('passes editingLine and pendingLine to DocumentTotalsPanel for live totals', () => {
    assert.match(src, /pendingLine=\{pendingLine[^}]*\}/);
    assert.match(src, /editingLine=\{editingLine[^}]*\}/);
  });

  it('shows notes as a textarea when notesFocused, plain text otherwise', () => {
    assert.match(src, /<textarea/);
    assert.match(src, /notesFocused\s*\?/);
  });

  it('renders NotesExtraComponent slot when provided', () => {
    assert.match(src, /NotesExtraComponent\s*&&/);
    assert.match(src, /<NotesExtraComponent/);
  });

  it('imports DocumentTotalsPanel from the local module', () => {
    assert.match(src, /import DocumentTotalsPanel from '\.\/DocumentTotalsPanel\.jsx'/);
  });
});
