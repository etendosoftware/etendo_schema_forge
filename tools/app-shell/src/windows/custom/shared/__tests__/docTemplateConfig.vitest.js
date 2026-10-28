// ETP-5988 — the loader that decides whether a document keeps the current template.
// @covers tools/app-shell/src/windows/custom/shared/docTemplateConfig.js
import { describe, it, expect, vi, beforeEach } from 'vitest';

const flag = vi.hoisted(() => ({ on: false }));
const fetchJson = vi.hoisted(() => vi.fn());

vi.mock('@/lib/flags/useFeatureFlag.js', () => ({ readFeatureFlag: () => flag.on }));
vi.mock('../pdfUtils.js', () => ({ fetchJson }));

import { loadDocTemplateConfig } from '../docTemplateConfig.js';

const BASE = 'https://api.example/sws/neo';

describe('loadDocTemplateConfig', () => {
  beforeEach(() => {
    flag.on = false;
    fetchJson.mockReset();
  });

  it('flag off: null and not a single request', async () => {
    expect(await loadDocTemplateConfig('sales-invoice', BASE, 't')).toBeNull();
    expect(fetchJson).not.toHaveBeenCalled();
  });

  it('flag on: asks for the document type and returns a saved configuration', async () => {
    flag.on = true;
    const saved = { configured: true, variant: 'modern', logo: null, footerText: 'Hi' };
    fetchJson.mockResolvedValue(saved);
    expect(await loadDocTemplateConfig('sales-order', BASE, 't')).toBe(saved);
    expect(fetchJson).toHaveBeenCalledWith(`${BASE}/doctemplateconfig?docType=sales-order`, 't');
  });

  it('flag on, nothing saved (defaults served): null, so the current template stays', async () => {
    flag.on = true;
    fetchJson.mockResolvedValue({ configured: false, variant: 'classic' });
    expect(await loadDocTemplateConfig('sales-invoice', BASE, 't')).toBeNull();
  });

  it('flag on, endpoint refuses or fails: null, printing never breaks', async () => {
    flag.on = true;
    fetchJson.mockRejectedValue(new Error('API 403'));
    expect(await loadDocTemplateConfig('sales-invoice', BASE, 't')).toBeNull();
  });

  it('no document type: null without a request', async () => {
    flag.on = true;
    expect(await loadDocTemplateConfig(null, BASE, 't')).toBeNull();
    expect(fetchJson).not.toHaveBeenCalled();
  });
});
