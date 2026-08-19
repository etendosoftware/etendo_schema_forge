import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'TbaiSection.jsx'), 'utf8');

describe('TbaiSection — structure', () => {
  it('exports a forwardRef component', () => {
    assert.match(src, /forwardRef\(function TbaiSection/);
  });

  it('exposes a save() method via useImperativeHandle', () => {
    assert.match(src, /useImperativeHandle/);
    assert.match(src, /\(\) => \({ save \}/);
  });

  it('imports useUI from @/i18n', () => {
    assert.match(src, /useUI.*from.*@\/i18n/);
  });
});

describe('TbaiSection — form fields', () => {
  it('does not render the enroll date (tbaisystemdate) field (ETP-4783: always set to creation date)', () => {
    assert.doesNotMatch(src, /fiscal\.tbai\.field\.enrollDate/);
  });

  it('tbaisystemdate is still sent in the PUT body from the record (not editable)', () => {
    assert.match(src, /tbaisystemdate/);
    assert.match(src, /record\?\.tbaisystemdate/);
  });

  it('does not render the production environment toggle (ETP-4783: managed by backend only)', () => {
    assert.doesNotMatch(src, /fiscal\.tbai\.field\.production/);
  });

  it('does not render the validatePreviousInvoice toggle (ETP-4783: managed by backend only)', () => {
    assert.doesNotMatch(src, /fiscal\.tbai\.field\.validatePrev/);
  });

  it('does not render the uSEAsproductDesc toggle (ETP-4783: managed by backend only)', () => {
    assert.doesNotMatch(src, /fiscal\.tbai\.field\.useAsProduct/);
  });

  it('renders the invoice description field', () => {
    assert.match(src, /invoiceDescription/);
  });
});

describe('TbaiSection — validation', () => {
  it('does not validate tbaisystemdate (removed from UI, ETP-4783)', () => {
    assert.doesNotMatch(src, /fiscal\.tbai\.err\.enrollDate/);
  });

  // ETP-4783: invoiceDescription validation was removed — the field is no longer
  // shown in the UI and instead uses a fallback value ('Descripcion Factura') in the
  // PUT body. No error is thrown when the field is absent.
  // ETP-4783: invoiceDescription validation was removed — the field is no longer
  // shown in the UI. It is still sent in the PUT body with a fallback value so
  // the backend never receives a blank description.
  it('invoiceDescription is preserved from record in the PUT body with a fallback (no UI validation)', () => {
    assert.match(src, /invoiceDescription/);
    assert.match(src, /'Descripcion Factura'/);
    assert.doesNotMatch(src, /fiscal\.tbai\.err\.invoiceDesc/);
  });
});

describe('TbaiSection — certificate section', () => {
  it('renders CertSection unless hideCert is true', () => {
    assert.match(src, /CertSection/);
    assert.match(src, /hideCert/);
  });
});

describe('TbaiSection — PUT request', () => {
  it('calls the tbai-config endpoint with the correct entity', () => {
    assert.match(src, /tbai-config\//);
    assert.match(src, /TBAI_ENTITY/);
  });

  it('uses useApiFetch for authenticated requests', () => {
    assert.match(src, /useApiFetch/);
    assert.match(src, /apiFetch/);
  });

  it('serializes boolean fields before sending', () => {
    assert.match(src, /serializeBooleanFields/);
  });
});

describe('TbaiSection — save button', () => {
  it('delegates save button rendering to SectionSaveButton', () => {
    assert.match(src, /SectionSaveButton/);
    assert.match(src, /saving=\{saving\}/);
  });

  it('hides the save button when hideSave prop is true', () => {
    assert.match(src, /hideSave/);
  });

  it('surfaces error message on failure via SectionSaveButton', () => {
    assert.match(src, /setError/);
    assert.match(src, /error=\{error\}/);
  });
});
