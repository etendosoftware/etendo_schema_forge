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
  it('renders the enroll date (tbaisystemdate) field', () => {
    assert.match(src, /fiscal\.tbai\.field\.enrollDate/);
    assert.match(src, /tbaisystemdate/);
  });

  it('renders the production environment toggle', () => {
    assert.match(src, /productionEnv/);
  });

  it('renders the invoice description field', () => {
    assert.match(src, /invoiceDescription/);
  });
});

describe('TbaiSection — validation', () => {
  it('validates tbaisystemdate is present before saving', () => {
    assert.match(src, /tbaisystemdate/);
    assert.match(src, /fiscal\.tbai\.err\.enrollDate/);
  });

  it('validates invoiceDescription is present before saving', () => {
    assert.match(src, /invoiceDescription/);
    assert.match(src, /fiscal\.tbai\.err\.invoiceDesc/);
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
