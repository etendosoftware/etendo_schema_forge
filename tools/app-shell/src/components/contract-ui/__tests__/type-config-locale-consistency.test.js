import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const modalSrc = readFileSync(join(__dirname, '..', 'ConfirmResultModal.jsx'), 'utf8');

// Locale files live in the shared core package.
const localesDir = join(__dirname, '..', '..', '..', '..', '..', '..', 'packages', 'app-shell-core', 'src', 'locales');
const es = JSON.parse(readFileSync(join(localesDir, 'es_ES.json'), 'utf8'));
const en = JSON.parse(readFileSync(join(localesDir, 'en_US.json'), 'utf8'));

// Expected doc-type → viewKey mapping defined in ConfirmResultModal.TYPE_CONFIG.
// Bridges the modal's derived primary label to the i18n catalog.
const EXPECTED = {
  facturaCompra: 'poViewInvoice',
  facturaVenta: 'soViewInvoice',
  salida: 'soViewShipment',
  entrada: 'poViewReceipt',
};

describe('TYPE_CONFIG viewKey ↔ locale consistency (ETP-4312)', () => {
  describe('source still maps each doc type to its expected viewKey', () => {
    for (const [type, viewKey] of Object.entries(EXPECTED)) {
      it(`${type} → viewKey: '${viewKey}'`, () => {
        // Match e.g.  facturaCompra: { ... viewKey: 'poViewInvoice', ... }
        const re = new RegExp(`${type}:\\s*\\{[^}]*viewKey:\\s*'${viewKey}'`, 's');
        assert.match(modalSrc, re);
      });
    }
  });

  describe('every viewKey resolves in BOTH locales', () => {
    for (const viewKey of Object.values(EXPECTED)) {
      it(`${viewKey} exists in es_ES and en_US genericLabels`, () => {
        assert.equal(typeof es.genericLabels[viewKey], 'string', `${viewKey} missing in es_ES`);
        assert.equal(typeof en.genericLabels[viewKey], 'string', `${viewKey} missing in en_US`);
      });
    }
  });
});
