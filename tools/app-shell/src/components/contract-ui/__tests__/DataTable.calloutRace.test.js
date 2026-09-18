import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'DataTable.jsx'), 'utf8');

/**
 * Regression guard for the callout race condition fix (ETP-3662).
 *
 * Bug: pressing Enter immediately after selecting a product saved the line
 * before the callout (product → taxRate → lineGrossAmount) had resolved,
 * storing incorrect values in Classic.
 *
 * Fix: InlineAddRow tracks in-flight callout promises (pendingCalloutsRef)
 * and a synchronous values mirror (valuesRef). submitLine awaits all pending
 * callouts and reads from the ref instead of the stale closure.
 */
describe('DataTable InlineAddRow — callout race condition fix (ETP-3662)', () => {

  // ── Refs ───────────────────────────────────────────────────────────────────

  it('declares valuesRef to mirror values synchronously outside React batching', () => {
    assert.match(src, /valuesRef\s*=\s*useRef\(/);
  });

  it('declares pendingCalloutsRef as an array to track in-flight callout promises', () => {
    assert.match(src, /pendingCalloutsRef\s*=\s*useRef\(\[\]\)/);
  });

  it('keeps valuesRef in sync on every render', () => {
    assert.match(src, /valuesRef\.current\s*=\s*values/);
  });

  // ── handleChange ───────────────────────────────────────────────────────────

  it('updates valuesRef synchronously inside handleChange before React batches', () => {
    assert.match(src, /valuesRef\.current\s*=\s*\{[^}]*valuesRef\.current[^}]*\}/);
  });

  // ── Reset ──────────────────────────────────────────────────────────────────

  it('resets pendingCalloutsRef when the form resets', () => {
    assert.match(src, /pendingCalloutsRef\.current\s*=\s*\[\]/);
  });

  // ── submitLine ─────────────────────────────────────────────────────────────

  it('awaits all pending callout promises before reading values in submitLine', () => {
    assert.match(src, /await\s+Promise\.all\(pendingCalloutsRef\.current\)/);
  });

  it('runs the callout wait BEFORE the required-field validation, not after', () => {
    // Regression guard: the callout wait and the required-field check were
    // originally added independently, in the wrong relative order — a required
    // field the callout is responsible for (e.g. tax) still read as empty in
    // valuesRef, so pressing Enter right after picking a product failed
    // validation before the callout (and this wait) ever ran. If the wait ever
    // moves back after the check, this test catches it.
    const idxWait = src.indexOf('await Promise.all(pendingCalloutsRef.current)');
    const idxMissing = src.indexOf('const missing = fields.filter(f => isMissingRequired(f, valuesRef, fields));');
    assert.ok(idxWait > 0, 'callout wait not found');
    assert.ok(idxMissing > idxWait, 'required-field check must come after the callout wait');
  });

  it('defers the Enter-to-confirm handler to a macrotask instead of calling it inline', () => {
    // Regression guard: a product pick and the "save the line" Enter can arrive
    // back-to-back fast enough that handleFieldChange (which registers the
    // product's callout in pendingCalloutsRef, synchronously but as part of a
    // separate event) hasn't run yet when handleKeyDown's Enter branch fires —
    // submitLine's own callout wait only sees whatever is ALREADY in
    // pendingCalloutsRef at the moment it runs, so an unregistered callout is
    // invisible to it. Queuing handleConfirm behind a macrotask lets any
    // same-action callout registration land first.
    assert.match(src, /setTimeout\(\(\)\s*=>\s*handleConfirm\(\),\s*0\)/);
  });

  it('reads coercedValues from valuesRef.current instead of the stale closure', () => {
    assert.match(src, /coercedValues\s*=\s*\{[^}]*valuesRef\.current[^}]*\}/);
  });

  it('removes values from submitLine useCallback dependencies', () => {
    // values must NOT appear in the deps array after the submitLine callback.
    // The dep array closes the callback and must list only: data, fields, onAdd, onCancel.
    // We verify the absence of a bare `values` dep entry after `onCancel` in the dep array.
    assert.doesNotMatch(src, /\[data,\s*fields,\s*onAdd,\s*onCancel,\s*values\]/);
  });

  // ── handleFieldChange ──────────────────────────────────────────────────────

  it('captures the Promise returned by onFieldChange', () => {
    assert.match(src, /calloutPromise\s*=\s*onFieldChange\?\./);
  });

  it('pushes the callout promise into pendingCalloutsRef when it is a Promise', () => {
    assert.match(src, /pendingCalloutsRef\.current\.push\(calloutPromise\)/);
  });

  it('removes the promise from pendingCalloutsRef once it settles', () => {
    assert.match(src, /calloutPromise\.finally\(/);
    assert.match(src, /pendingCalloutsRef\.current\.filter\(p\s*=>\s*p\s*!==\s*calloutPromise\)/);
  });

  it('updates valuesRef synchronously inside applyUpdates before setValues', () => {
    // The applyUpdates callback must set valuesRef.current = next before calling setValues(next).
    assert.match(src, /valuesRef\.current\s*=\s*next[\s\S]{0,30}setValues\(next\)/);
  });

});
