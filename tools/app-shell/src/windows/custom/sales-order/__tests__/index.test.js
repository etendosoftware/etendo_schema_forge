import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'index.jsx'), 'utf8');

describe('SalesOrderWindow custom wrapper', () => {
  it('exports a default function component', () => {
    assert.match(src, /export default function SalesOrderWindow/);
  });

  it('delegates to GeneratedApp when recordId is present', () => {
    assert.match(src, /GeneratedApp/);
    assert.match(src, /if \(recordId\)/);
  });

  it('renders ListView for the list view (no recordId)', () => {
    assert.match(src, /ListView/);
    assert.match(src, /entity.*header/);
  });

  it('passes onCloneRow to ListView', () => {
    assert.match(src, /onCloneRow/);
    assert.match(src, /setCloneTargets/);
  });

  it('manages cloneTargets state', () => {
    assert.match(src, /useState/);
    assert.match(src, /cloneTargets/);
  });

  it('renders CloneOrderModal via portal when cloneTargets is set', () => {
    assert.match(src, /CloneOrderModal/);
    assert.match(src, /createPortal/);
    assert.match(src, /document\.body/);
  });

  it('passes records and routePrefix to CloneOrderModal', () => {
    assert.match(src, /records=\{cloneTargets\}/);
    assert.match(src, /routePrefix="\/sales-order\/"/);
  });

  it('increments refreshKey after a successful clone', () => {
    assert.match(src, /onCloned=\{/);
    assert.match(src, /setRefreshKey/);
  });

  it('clears cloneTargets on modal close', () => {
    assert.match(src, /setCloneTargets\(null\)/);
  });

  it('derives headers from useCreateContactModal', () => {
    assert.match(src, /useCreateContactModal/);
    assert.match(src, /headers/);
  });

  it('uses Sales Order entity label and breadcrumb', () => {
    assert.match(src, /Sales Order/);
    assert.match(src, /Sales \/ Sales Order/);
  });

  it('passes hidePrint to ListView', () => {
    assert.match(src, /hidePrint/);
  });

  it('imports HeaderTable from the generated sales-order artifact', () => {
    assert.match(src, /@generated\/sales-order.*HeaderTable/);
  });

  // ETP-4520 — the hand-rolled ListView bypasses GeneratedApp, so it must
  // separately receive the runtime per-tier read-only override.
  it('passes the runtime read-only effectiveWindow through to ListView', () => {
    assert.match(src, /windowAccessTier === 'read-only'/);
    assert.match(src, /window=\{effectiveWindow\}/);
  });
});
