import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'ReactivarModal.jsx'), 'utf8');

describe('ReactivarModal', () => {

  // ── Exports ────────────────────────────────────────────────────────────────

  it('exports ReactivarModal as the default export', () => {
    assert.match(src, /export default function ReactivarModal/);
  });

  // ── Props contract ─────────────────────────────────────────────────────────

  it('accepts dir, onConfirm, and onClose props', () => {
    assert.match(src, /\{\s*dir\s*,\s*onConfirm\s*,\s*onClose\s*\}/);
  });

  // ── Warning items ──────────────────────────────────────────────────────────

  it('renders three warning items via reactivarItem1Title, reactivarItem2Title, reactivarItem3Title', () => {
    assert.match(src, /reactivarItem1Title/);
    assert.match(src, /reactivarItem2Title/);
    assert.match(src, /reactivarItem3Title/);
  });

  it('also renders descriptions for all three warning items', () => {
    assert.match(src, /reactivarItem1Desc/);
    assert.match(src, /reactivarItem2Desc/);
    assert.match(src, /reactivarItem3Desc/);
  });

  // ── Yellow warning box ─────────────────────────────────────────────────────

  it('has yellow warning box with FFFBEB background', () => {
    assert.match(src, /#FFFBEB/);
  });

  it('uses amber stroke color #D97706 for warning icon', () => {
    assert.match(src, /#D97706/);
  });

  // ── Buttons ────────────────────────────────────────────────────────────────

  it('renders a confirm button that calls onConfirm', () => {
    assert.match(src, /onConfirm/);
    assert.match(src, /reactivarTodosModoss/);
  });

  it('renders a cancel button that calls onClose', () => {
    assert.match(src, /onClose/);
    assert.match(src, /'cancel'/);
  });

  // ── Loading state ──────────────────────────────────────────────────────────

  it('uses useState for loading state', () => {
    assert.match(src, /useState\(false\)/);
    assert.match(src, /setLoading/);
  });

  it('disables confirm button while loading', () => {
    assert.match(src, /disabled=\{loading\}/);
  });

  // ── i18n ───────────────────────────────────────────────────────────────────

  it('uses useUI hook from @/i18n', () => {
    assert.match(src, /import.*useUI.*from '@\/i18n'/);
    assert.match(src, /useUI\(\)/);
  });

});
