import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'ReturnWindowShell.jsx'), 'utf8');

describe('ReturnWindowShell', () => {

  // ── Exports ────────────────────────────────────────────────────────────────

  it('exports ReturnWindowShell as the default export', () => {
    assert.match(src, /export default function ReturnWindowShell/);
  });

  // ── Imports ────────────────────────────────────────────────────────────────

  it('imports useState and useMemo from react', () => {
    assert.match(src, /import.*useState.*useMemo.*from 'react'/);
  });

  it('imports useNavigate from react-router-dom', () => {
    assert.match(src, /import.*useNavigate.*from 'react-router-dom'/);
  });

  it('imports useRowDelete from @/hooks/useRowDelete', () => {
    assert.match(src, /import.*useRowDelete.*from '@\/hooks\/useRowDelete'/);
  });

  it('imports CloneOrderModal from @/components/contract-ui', () => {
    assert.match(src, /import CloneOrderModal from '@\/components\/contract-ui\/CloneOrderModal'/);
  });

  it('imports createPortal from react-dom', () => {
    assert.match(src, /import.*createPortal.*from 'react-dom'/);
  });

  // ── Props contract ─────────────────────────────────────────────────────────

  it('accepts windowName, recordId, apiBaseUrl, token props', () => {
    assert.match(src, /windowName, recordId, apiBaseUrl, token/);
  });

  it('accepts PageComponent prop', () => {
    assert.match(src, /PageComponent/);
  });

  it('accepts renderPreview prop', () => {
    assert.match(src, /renderPreview/);
  });

  it('accepts entity and headerEntity props', () => {
    assert.match(src, /entity,/);
    assert.match(src, /headerEntity/);
  });

  it('accepts routePrefix prop', () => {
    assert.match(src, /routePrefix/);
  });

  it('accepts duplicateAction prop', () => {
    assert.match(src, /duplicateAction/);
  });

  it('spreads remaining props via ...pageProps', () => {
    assert.match(src, /\.\.\.pageProps/);
  });

  // ── recordId branch — passes hidePrint={true} ──────────────────────────────

  it('passes hidePrint={true} to PageComponent when recordId is truthy', () => {
    assert.match(src, /hidePrint=\{true\}/);
  });

  it('renders PageComponent directly when recordId is provided', () => {
    assert.match(src, /if \(recordId\)/);
  });

  // ── List branch — quick actions ────────────────────────────────────────────

  it('passes rowQuickActions to PageComponent in list mode', () => {
    assert.match(src, /rowQuickActions=\{rowQuickActions\}/);
  });

  it('passes refreshTrigger to PageComponent in list mode', () => {
    assert.match(src, /refreshTrigger=\{refreshKey\}/);
  });

  it('passes renderPreview to PageComponent in list mode', () => {
    assert.match(src, /renderPreview=\{renderPreview\}/);
  });

  // ── duplicateAction override ───────────────────────────────────────────────

  it('uses duplicateAction prop when provided, otherwise defaults to { show: true }', () => {
    assert.match(src, /duplicateAction \|\| \{ show: true \}/);
  });

  // ── rowQuickActions structure ──────────────────────────────────────────────

  it('sets editMode to navigate in rowQuickActions', () => {
    assert.match(src, /editMode: 'navigate'/);
  });

  it('sets hideDeleteWhenComplete to true in rowQuickActions', () => {
    assert.match(src, /hideDeleteWhenComplete: true/);
  });

  // ── CloneOrderModal portal ─────────────────────────────────────────────────

  it('renders CloneOrderModal portal when cloneTargets is set', () => {
    assert.match(src, /cloneTargets && createPortal/);
  });

  it('mounts CloneOrderModal on document.body', () => {
    assert.match(src, /document\.body/);
  });

  it('passes headerEntity and routePrefix to CloneOrderModal', () => {
    assert.match(src, /headerEntity=\{headerEntity\}/);
    assert.match(src, /routePrefix=\{routePrefix\}/);
  });

  // ── Delete dialog ──────────────────────────────────────────────────────────

  it('renders deleteDialog from useRowDelete', () => {
    assert.match(src, /\{deleteDialog\}/);
  });

});
