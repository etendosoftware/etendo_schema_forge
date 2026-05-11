import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'SifDataTabs.jsx'), 'utf8');

describe('SifDataTabs', () => {
  it('exports a default function component', () => {
    assert.match(src, /export default function SifDataTabs/);
  });

  it('accepts data, recordId, token, and apiBaseUrl props', () => {
    assert.match(src, /\{\s*data.*recordId.*token.*apiBaseUrl\s*\}/);
  });

  it('imports useFiscalConfig from the fiscal-config module', () => {
    assert.match(src, /import.*useFiscalConfig.*from.*fiscal-config/);
  });

  it('reads orgId from selectedOrg via useAuth', () => {
    assert.match(src, /useAuth/);
    assert.match(src, /selectedOrg/);
  });

  it('returns null when no fiscal targets apply to the current invoice spec', () => {
    assert.match(src, /return null/);
  });

  it('derives visible fiscal targets from a shared helper', () => {
    assert.match(src, /getInvoiceFiscalTargets/);
  });

  it('tracks activeTab state defaulting to sii', () => {
    assert.match(src, /useState\(['"]sii['"]\)/);
  });

  it('switches to purchase-specific SII fields for purchase invoices', () => {
    assert.match(src, /aeatsiiClaveTipoFc/);
    assert.match(src, /aeatsiiPurDescription\$_identifier/);
    assert.match(src, /PURCHASE_CLAVE_TIPO_FC_OPTIONS/);
  });

  it('calls PATCH on the current spec header endpoint', () => {
    assert.match(src, /method: 'PATCH'/);
    assert.match(src, /specName/);
    assert.match(src, /header/);
  });

  it('shows a toast error on PATCH failure', () => {
    assert.match(src, /toast\.error/);
  });

  it('uses i18n keys for fiscal status labels and field labels', () => {
    assert.match(src, /sifDataTabs\.status\.sii\.correct/);
    assert.match(src, /sifDataTabs\.status\.tbai\.sent/);
    assert.match(src, /sifDataTabs\.field\.operationDate/);
    assert.match(src, /sifDataTabs\.field\.issueDetail/);
  });
});
