import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'FiscalModelsPage.jsx'), 'utf8');

describe('FiscalModelsPage — exports', () => {
  it('has a default export', () => assert.match(src, /export default/));
});

describe('FiscalModelsPage — routing', () => {
  it('renders FmListPage', () => assert.match(src, /FmListPage/));
  it('renders FmModel303Page', () => assert.match(src, /FmModel303Page/));
  it('renders FmModel349Page', () => assert.match(src, /FmModel349Page/));
});
