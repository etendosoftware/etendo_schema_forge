import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'ProductSidebar.jsx'), 'utf8');

describe('ProductSidebar — Y-axis formatting', () => {
  it('imports formatDashboardAxisTick from the shared lib', () => {
    assert.match(src, /import.*formatDashboardAxisTick.*from.*@\/lib\/dashboardNumberFormat/);
  });

  it('does not define a local formatCompact function', () => {
    assert.doesNotMatch(src, /function formatCompact/);
  });

  it('imports niceScale alongside formatDashboardAxisTick from the shared lib', () => {
    assert.match(src, /import.*niceScale.*formatDashboardAxisTick.*from.*@\/lib\/dashboardNumberFormat/);
  });

  it('calls niceScale to compute Y-axis ticks', () => {
    assert.match(src, /niceScale\(/);
  });

  it('builds Y-axis labels by mapping ticks through formatDashboardAxisTick', () => {
    assert.match(src, /formatDashboardAxisTick\(t\)/);
  });

  it('does not call formatCompact anywhere', () => {
    assert.doesNotMatch(src, /formatCompact\(/);
  });
});
