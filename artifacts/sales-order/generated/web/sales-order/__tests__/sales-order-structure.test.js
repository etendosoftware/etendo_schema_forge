/**
 * Sales Order — structural source-reading tests.
 *
 * Replaces e2e/tests/flows/sales-order-crud.spec.js which only checked
 * visibility of static elements (columns, filters, fields, buttons).
 * Those assertions are structural — they don't need a browser.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const headerTable = readFileSync(join(__dirname, '..', 'HeaderTable.jsx'), 'utf8');
const headerForm = readFileSync(join(__dirname, '..', 'HeaderForm.jsx'), 'utf8');
const headerPage = readFileSync(join(__dirname, '..', 'HeaderPage.jsx'), 'utf8');

describe('Sales Order — HeaderTable', () => {
  it('declares expected list columns', () => {
    for (const key of ['businessPartner', 'orderDate', 'documentNo', 'documentStatus', 'grandTotalAmount']) {
      assert.match(headerTable, new RegExp(`key:\\s*'${key}'`), `column ${key} missing`);
    }
  });

  it('declares filters including documentStatus and orderDate', () => {
    assert.match(headerTable, /filters.*documentNo/);
    assert.match(headerTable, /filters.*documentStatus/);
    assert.match(headerTable, /filters.*orderDate/);
  });

  it('renders DataTable with columns and filters', () => {
    assert.match(headerTable, /DataTable\s+columns=\{columns\}\s+filters=\{filters\}/);
  });
});

describe('Sales Order — HeaderForm', () => {
  it('declares businessPartner as required search field', () => {
    assert.match(headerForm, /key:\s*'businessPartner'.*required:\s*true/);
    assert.match(headerForm, /key:\s*'businessPartner'.*type:\s*'search'/);
  });

  it('declares partnerAddress as dependent on businessPartner', () => {
    assert.match(headerForm, /key:\s*'partnerAddress'.*type:\s*'dependent'/);
    assert.match(headerForm, /dependsOn:.*field:\s*'businessPartner'/);
  });

  it('declares orderDate, priceList, paymentTerms as required', () => {
    for (const key of ['orderDate', 'priceList', 'paymentTerms']) {
      assert.match(headerForm, new RegExp(`key:\\s*'${key}'.*required:\\s*true`), `${key} should be required`);
    }
  });

  it('renders EntityForm with fields', () => {
    assert.match(headerForm, /EntityForm\s+fields=\{fields\}/);
  });
});

describe('Sales Order — HeaderPage', () => {
  it('imports ListView and DetailView', () => {
    assert.match(headerPage, /import.*ListView.*DetailView.*from/);
  });

  it('imports HeaderTable and HeaderForm', () => {
    assert.match(headerPage, /import HeaderTable from/);
    assert.match(headerPage, /import HeaderForm from/);
  });

  it('imports LinesTable and LinesForm', () => {
    assert.match(headerPage, /import LinesTable from/);
    assert.match(headerPage, /import LinesForm from/);
  });
});
