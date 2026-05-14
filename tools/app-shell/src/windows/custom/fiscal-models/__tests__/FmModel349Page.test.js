import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'FmModel349Page.jsx'), 'utf8');

describe('FmModel349Page — exports', () => {
  it('has default export', () => assert.match(src, /export default/));
});

describe('FmModel349Page — composition', () => {
  it('renders StatusPillMenu', () => assert.match(src, /StatusPillMenu/));
  it('has back navigation (onBack)', () => assert.match(src, /onBack/));
  it('renders operator table', () => assert.match(src, /operator|operador/i));
});

describe('FmModel349Page — no removed features', () => {
  it('does not reference AuditReasonModal', () => assert.doesNotMatch(src, /AuditReasonModal/));
  it('does not reference manualAdj', () => assert.doesNotMatch(src, /manualAdj/));
});
