import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeleteVisibleForRecord } from '../../../utils/recordActions.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const detailViewSrc = readFileSync(join(__dirname, '..', 'DetailView.jsx'), 'utf8');
const rowQuickActionsSrc = readFileSync(join(__dirname, '..', 'RowQuickActions.jsx'), 'utf8');
const dataTableSrc = readFileSync(join(__dirname, '..', 'DataTable.jsx'), 'utf8');

/**
 * Regression + feature guard for the `hideDeleteButton` wiring (decisions.json →
 * window.hideDeleteButton), threaded through the generator (generate-frontend.js
 * in schema_forge_core) into two generic surfaces:
 *
 *   1. DetailView's `isDeleteButtonVisible()` — the detail-toolbar Delete button.
 *   2. RowQuickActions' `showDelete` — the per-row hover Delete icon in DataTable's
 *      list view (forwarded via DataTable's `rowQuickActions.hideDeleteButton`).
 *
 * `hideDeleteButton` is an UNCONDITIONAL opt-out: unlike `hideDeleteWhenComplete`
 * (which only hides Delete once the document reaches a non-draft status), this
 * flag hides Delete for every record regardless of status, when the window
 * author has declared it in decisions.json.
 *
 * Both source files are heavy React components (many hooks/contexts) that are
 * impractical to fully render in this suite — following the established
 * convention in this directory (see DetailView.moreMenuGating.test.js), we
 * verify the exact boolean logic via a faithful replica AND assert the live
 * source contains the expected short-circuit, so a regression that silently
 * drops the check is still caught.
 */

// Replica of the exported `isDeleteButtonVisible` from DetailView.jsx.
function isDeleteButtonVisible(isNew, recordId, data, statusField, hideDeleteWhenComplete, isProcessed, hideDeleteButton = false) {
  if (hideDeleteButton) return false;
  return !isNew && recordId && isDeleteVisibleForRecord({
    record: data,
    statusField,
    hideDeleteWhenComplete,
  }) && !(hideDeleteWhenComplete && isProcessed);
}

// Replica of RowQuickActions' `showDelete` computation.
function computeShowDelete({ row, statusField, hideDeleteWhenComplete, hideDeleteButton = false }) {
  return !hideDeleteButton && isDeleteVisibleForRecord({
    record: row,
    statusField,
    hideDeleteWhenComplete,
  });
}

describe('DetailView — isDeleteButtonVisible with hideDeleteButton (window.hideDeleteButton)', () => {
  it('hides the button unconditionally when hideDeleteButton is true, even for an eligible draft record', () => {
    assert.equal(
      isDeleteButtonVisible(false, '123', { documentStatus: 'DR' }, 'documentStatus', false, false, true),
      false,
    );
  });

  it('hides the button when hideDeleteButton is true regardless of hideDeleteWhenComplete/isProcessed', () => {
    assert.equal(
      isDeleteButtonVisible(false, '123', { documentStatus: 'DR' }, 'documentStatus', true, false, true),
      false,
    );
    assert.equal(
      isDeleteButtonVisible(false, '123', { documentStatus: 'CO' }, 'documentStatus', true, true, true),
      false,
    );
  });

  it('falls back to the existing gate when hideDeleteButton is false (default)', () => {
    assert.equal(
      isDeleteButtonVisible(false, '123', { documentStatus: 'DR' }, 'documentStatus', false, false, false),
      true,
    );
    assert.equal(
      isDeleteButtonVisible(false, '123', { documentStatus: 'DR' }, 'documentStatus', false, false),
      true,
      'defaults to false when the argument is omitted (backwards compatible)',
    );
  });

  it('still respects the pre-existing isNew/recordId guards when hideDeleteButton is false', () => {
    assert.equal(
      isDeleteButtonVisible(true, null, {}, 'documentStatus', false, false, false),
      false,
    );
  });

  it('DetailView.jsx declares hideDeleteButton = false as a default prop', () => {
    assert.match(detailViewSrc, /hideDeleteButton\s*=\s*false,/);
  });

  it('DetailView.jsx short-circuits isDeleteButtonVisible before the status-based logic', () => {
    // isDeleteButtonVisible takes an options object (ETP-4479 added `deleteAction`);
    // hideDeleteButton still wins first, before any status/deleteAction logic.
    assert.match(
      detailViewSrc,
      /export function isDeleteButtonVisible\(\{[\s\S]*?hideDeleteButton\s*=\s*false,[\s\S]*?\}\)\s*\{[\s\S]*?if\s*\(hideDeleteButton\)\s*return\s*false;/,
    );
  });

  it('DetailView.jsx forwards hideDeleteButton (OR-ed with window.readOnly) into isDeleteButtonVisible at the render call site', () => {
    assert.match(
      detailViewSrc,
      /isDeleteButtonVisible\(\{[\s\S]*?hideDeleteButton:\s*hideDeleteButton\s*\|\|\s*windowReadOnly,[\s\S]*?\}\)/,
    );
  });
});

describe('RowQuickActions — showDelete with hideDeleteButton', () => {
  it('hides the row Delete icon unconditionally when hideDeleteButton is true', () => {
    assert.equal(
      computeShowDelete({ row: { documentStatus: 'DR' }, statusField: 'documentStatus', hideDeleteWhenComplete: false, hideDeleteButton: true }),
      false,
    );
  });

  it('hides the row Delete icon even for draft records that would otherwise be deletable', () => {
    assert.equal(
      computeShowDelete({ row: { documentStatus: 'DR' }, statusField: 'documentStatus', hideDeleteWhenComplete: true, hideDeleteButton: true }),
      false,
    );
  });

  it('falls back to the existing status-based gate when hideDeleteButton is false (default)', () => {
    assert.equal(
      computeShowDelete({ row: { documentStatus: 'CO' }, statusField: 'documentStatus', hideDeleteWhenComplete: true, hideDeleteButton: false }),
      false,
      'still hidden due to hideDeleteWhenComplete on a completed record',
    );
    assert.equal(
      computeShowDelete({ row: { documentStatus: 'DR' }, statusField: 'documentStatus', hideDeleteWhenComplete: true, hideDeleteButton: false }),
      true,
    );
  });

  it('RowQuickActions.jsx declares hideDeleteButton = false as a default prop', () => {
    assert.match(rowQuickActionsSrc, /hideDeleteButton\s*=\s*false,/);
  });

  it('RowQuickActions.jsx short-circuits showDelete with readOnly/hideDeleteButton before calling isDeleteVisibleForRecord', () => {
    assert.match(
      rowQuickActionsSrc,
      /const showDelete = !readOnly && !hideDeleteButton && isDeleteVisibleForRecord\(\{/,
    );
  });
});

describe('DataTable — forwards rowQuickActions.hideDeleteButton to RowQuickActions', () => {
  it('passes hideDeleteButton from the declarative rowQuickActions config', () => {
    assert.match(
      dataTableSrc,
      /hideDeleteButton=\{rowQuickActions\.hideDeleteButton\}/,
    );
  });
});
