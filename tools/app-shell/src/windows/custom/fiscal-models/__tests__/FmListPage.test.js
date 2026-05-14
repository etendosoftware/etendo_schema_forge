import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'FmListPage.jsx'), 'utf8');

describe('FmListPage — exports', () => {
  it('has a default export', () => assert.match(src, /export default/));
});

describe('FmListPage — KPI banners', () => {
  it('renders kpi banner container', () => assert.match(src, /fm-kpi-banner/));
  it('shows model 303 open count', () => assert.match(src, /open303/));
  it('shows model 349 pending count', () => assert.match(src, /pend349/));
});

describe('FmListPage — table', () => {
  it('renders fm-table', () => assert.match(src, /fm-table/));
  it('shows model column', () => assert.match(src, /decl\.model/));
  it('shows year column', () => assert.match(src, /decl\.year/));
  it('renders StatusPillMenu for status column', () => assert.match(src, /StatusPillMenu/));
});

describe('FmListPage — navigation', () => {
  it('calls onSelect with declaration on row click', () => assert.match(src, /onSelect/));
});
