import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'FmModel303Page.jsx'), 'utf8');

describe('FmModel303Page — exports', () => {
  it('has default export', () => assert.match(src, /export default/));
});

describe('FmModel303Page — composition', () => {
  it('renders FmBoxes303', () => assert.match(src, /FmBoxes303/));
  it('renders StatusPillMenu', () => assert.match(src, /StatusPillMenu/));
  it('renders Tabs', () => assert.match(src, /Tabs/));
  it('has back navigation (onBack)', () => assert.match(src, /onBack/));
});

describe('FmModel303Page — no removed features', () => {
  it('does not reference AuditReasonModal', () => assert.doesNotMatch(src, /AuditReasonModal/));
  it('does not reference CellHistoryPanel', () => assert.doesNotMatch(src, /CellHistoryPanel/));
  it('does not have manual adjustment inputs', () => assert.doesNotMatch(src, /manualAdj/));
});
