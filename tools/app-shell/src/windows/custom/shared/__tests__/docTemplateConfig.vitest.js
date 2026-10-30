// ETP-5988 — the loader that decides whether a document keeps the current template. It is NOT gated
// by the settings flag: a choice that exists is applied to every print.
// @covers tools/app-shell/src/windows/custom/shared/docTemplateConfig.js
import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchJson = vi.hoisted(() => vi.fn());
vi.mock('../pdfUtils.js', () => ({ fetchJson, fetchOptionalJson: vi.fn(), fetchImageDataUrl: vi.fn() }));

import { loadDocTemplateConfig } from '../docTemplateConfig.js';

const BASE = 'https://api.example/sws/neo';

describe('loadDocTemplateConfig', () => {
  beforeEach(() => {
    fetchJson.mockReset();
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('asks for the document type and returns a saved configuration', async () => {
    const saved = { configured: true, variant: 'modern', logo: null, footerText: 'Hi' };
    fetchJson.mockResolvedValue(saved);
    expect(await loadDocTemplateConfig('sales-order', BASE, 't')).toBe(saved);
    expect(fetchJson).toHaveBeenCalledWith(`${BASE}/doctemplateconfig?docType=sales-order`, 't');
  });

  it('reads the list print configuration the same way', async () => {
    fetchJson.mockResolvedValue({ configured: true, variant: 'compact' });
    await loadDocTemplateConfig('listing', BASE, 't');
    expect(fetchJson).toHaveBeenCalledWith(`${BASE}/doctemplateconfig?docType=listing`, 't');
  });

  it('nothing saved (defaults served): null, so the current template stays', async () => {
    fetchJson.mockResolvedValue({ configured: false, variant: 'classic' });
    expect(await loadDocTemplateConfig('sales-invoice', BASE, 't')).toBeNull();
  });

  it('endpoint refuses or fails: null, printing never breaks', async () => {
    fetchJson.mockRejectedValue(new Error('API 403'));
    expect(await loadDocTemplateConfig('sales-invoice', BASE, 't')).toBeNull();
  });

  it('no document type: null without a request', async () => {
    expect(await loadDocTemplateConfig(null, BASE, 't')).toBeNull();
    expect(fetchJson).not.toHaveBeenCalled();
  });
});
