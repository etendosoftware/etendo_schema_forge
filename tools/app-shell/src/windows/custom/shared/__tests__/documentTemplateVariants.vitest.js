// ETP-5988 — template selection for the commercial documents.
// @covers tools/app-shell/src/windows/custom/shared/documentTemplateVariants.js
import { describe, it, expect } from 'vitest';
import { DOCUMENT_TEMPLATE, DOCUMENT_CSS } from '../documentPdf.js';
import {
  FOOTER_ANCHOR,
  resolveDocumentTemplate,
  applyTemplateConfigData,
} from '../documentTemplateVariants.js';

const resolve = (config) => resolveDocumentTemplate(config, DOCUMENT_TEMPLATE, DOCUMENT_CSS);

describe('resolveDocumentTemplate', () => {
  it('without a configuration returns the current template and CSS themselves', () => {
    const { template, css } = resolve(null);
    expect(template).toBe(DOCUMENT_TEMPLATE);
    expect(css).toBe(DOCUMENT_CSS);
  });

  it('the footer anchor exists in the current template exactly once', () => {
    expect(DOCUMENT_TEMPLATE.split(FOOTER_ANCHOR)).toHaveLength(2);
  });

  it('classic without a footer changes nothing', () => {
    const { template, css } = resolve({ variant: 'classic', logo: null, footerText: null });
    expect(template).toBe(DOCUMENT_TEMPLATE);
    expect(css).toBe(DOCUMENT_CSS);
  });

  it.each(['compact', 'modern'])('%s appends its CSS to the current one, never replacing it', (variant) => {
    const { css } = resolve({ variant });
    expect(css.startsWith(DOCUMENT_CSS)).toBe(true);
    expect(css.length).toBeGreaterThan(DOCUMENT_CSS.length);
    expect(css).toContain(`variant: ${variant}`);
  });

  it('no variant touches the Verifactu QR rules', () => {
    for (const variant of ['compact', 'modern']) {
      const extra = resolve({ variant }).css.slice(DOCUMENT_CSS.length);
      expect(extra).not.toContain('inv-verifactu');
    }
  });

  it('an unknown variant falls back to the current CSS', () => {
    expect(resolve({ variant: 'fancy' }).css).toBe(DOCUMENT_CSS);
  });

  it('a footer inserts one escaped block before the standard footer', () => {
    const { template, css } = resolve({ variant: 'classic', footerText: 'Thanks' });
    expect(template).toContain('{{customFooter}}');
    expect(template).not.toContain('{{{customFooter}}}');
    expect(template.indexOf('{{customFooter}}')).toBeLessThan(template.indexOf(FOOTER_ANCHOR));
    expect(css).toContain('.inv-custom-footer');
    expect(DOCUMENT_TEMPLATE).not.toContain('customFooter');
  });
});

describe('applyTemplateConfigData', () => {
  it('without a configuration returns the very same data object', () => {
    const data = { companyLogoDataUrl: 'data:company' };
    expect(applyTemplateConfigData(data, null)).toBe(data);
  });

  it('copies the data with the configured logo and footer; the caller object is untouched', () => {
    const data = { companyLogoDataUrl: 'data:company', documentNo: 'X' };
    const out = applyTemplateConfigData(data, { logo: 'https://cdn.example.com/l.png', footerText: 'Hi' });
    expect(out).not.toBe(data);
    expect(out.companyLogoDataUrl).toBe('https://cdn.example.com/l.png');
    expect(out.customFooter).toBe('Hi');
    expect(out.documentNo).toBe('X');
    expect(data.companyLogoDataUrl).toBe('data:company');
    expect(data.customFooter).toBeUndefined();
  });

  it('keeps the company logo when the configuration has none', () => {
    const out = applyTemplateConfigData({ companyLogoDataUrl: 'data:company' }, { variant: 'modern', logo: null });
    expect(out.companyLogoDataUrl).toBe('data:company');
  });
});
