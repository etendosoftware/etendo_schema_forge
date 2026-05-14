import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(__dirname, '..', 'fiscal-models.css'), 'utf8');
const src = readFileSync(join(__dirname, '..', 'FmCommon.jsx'), 'utf8');

describe('fiscal-models.css — key class families', () => {
  it('defines fm-status-pill', () => assert.match(css, /\.fm-status-pill/));
  it('defines fm-status-menu', () => assert.match(css, /\.fm-status-menu/));
  it('defines fm-kpi-card', () => assert.match(css, /\.fm-kpi-card/));
  it('defines fm-kpi-strip', () => assert.match(css, /\.fm-kpi-strip/));
  it('defines fm-table (dense)', () => assert.match(css, /\.fm-table/));
  it('defines fm-present-modal', () => assert.match(css, /\.fm-present-modal/));
  it('defines fm-aeat-box', () => assert.match(css, /\.fm-aeat-box/));
});

describe('FmCommon — exports', () => {
  it('exports StatusPill', () => assert.match(src, /export function StatusPill/));
  it('exports StatusPillMenu', () => assert.match(src, /export function StatusPillMenu/));
  it('exports KpiCard', () => assert.match(src, /export function KpiCard/));
  it('exports Tabs', () => assert.match(src, /export function Tabs/));
  it('exports Banner', () => assert.match(src, /export function Banner/));
  it('exports SectionCard', () => assert.match(src, /export function SectionCard/));
  it('exports EmptyState', () => assert.match(src, /export function EmptyState/));
});
