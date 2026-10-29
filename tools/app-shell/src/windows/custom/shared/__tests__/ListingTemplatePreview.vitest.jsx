// ETP-5988 — the preview of the list-print design: the same jsreport template as the print drawer,
// with the settings as they are being edited; no option set is the current print.
// @covers tools/app-shell/src/windows/custom/shared/ListingTemplatePreview.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

const t = vi.hoisted(() => (key) => key);
const jsreport = vi.hoisted(() => ({ calls: [], impl: null }));
vi.mock('@/i18n', () => ({ useUI: () => t }));
const logoLoader = vi.hoisted(() => ({ calls: 0, value: 'data:image/png;base64,AAA=' }));
vi.mock('@/lib/neoWebhookClient.js', () => ({ NEO_BASE: '/sws/neo' }));
vi.mock('../docTemplateConfig.js', () => ({ loadCompanyLogo: async () => { logoLoader.calls += 1; return logoLoader.value; } }));
vi.mock('@/components/contract-ui/ReportDrawer.jsx', () => ({
  renderViaJsreport: (...a) => { jsreport.calls.push(a); return jsreport.impl(...a); },
}));

import ListingTemplatePreview from '../ListingTemplatePreview.jsx';

describe('ListingTemplatePreview', () => {
  beforeEach(() => { jsreport.calls = []; logoLoader.calls = 0; logoLoader.value = 'data:image/png;base64,AAA='; });

  it('renders with a configuration even when no option is set: a saved list print has no stripes', async () => {
    jsreport.impl = async () => ({ text: async () => '<p>list</p>' });
    render(<ListingTemplatePreview settings={{ variant: 'classic', color: null, font: null, fontSize: null, rowStripes: null }} />);
    await waitFor(() => expect(screen.getByTestId('ListingTemplatePreview__frame').getAttribute('srcdoc')).toBe('<p>list</p>'));
    const [recipe, , columns, rows, filters, , config] = jsreport.calls[0];
    expect(recipe).toBe('html');
    expect(config).toEqual({ variant: 'classic', color: null, font: null, fontSize: null, rowStripes: null });
    expect(columns.map((c) => c.key)).toEqual(['documentNo', 'date', 'partner', 'status', 'amount']);
    expect(rows.length).toBeGreaterThan(3);
    expect(filters).toEqual([]);
  });

  it('renders with the settings being edited', async () => {
    jsreport.impl = async () => ({ text: async () => '<p>x</p>' });
    const settings = { variant: 'modern', color: '#0F766E', font: 'serif', fontSize: 'large', rowStripes: 'off' };
    render(<ListingTemplatePreview settings={settings} />);
    await waitFor(() => expect(jsreport.calls.length).toBeGreaterThan(0));
    expect(jsreport.calls[0][6]).toEqual(settings);
  });

  it('carries the company logo only when the design shows it', async () => {
    jsreport.impl = async () => ({ text: async () => '<p>x</p>' });
    const { unmount } = render(<ListingTemplatePreview settings={{ variant: 'classic', showLogo: 'on' }} />);
    await waitFor(() => expect(jsreport.calls.length).toBeGreaterThan(0));
    expect(jsreport.calls[0][7]).toBe('data:image/png;base64,AAA=');
    unmount();

    jsreport.calls = [];
    logoLoader.calls = 0;
    render(<ListingTemplatePreview settings={{ variant: 'classic', showLogo: null }} />);
    await waitFor(() => expect(jsreport.calls.length).toBeGreaterThan(0));
    expect(jsreport.calls[0][7]).toBeNull();
    expect(logoLoader.calls).toBe(0);
  });

  it('a company without a logo prints the list without one', async () => {
    logoLoader.value = null;
    jsreport.impl = async () => ({ text: async () => '<p>x</p>' });
    render(<ListingTemplatePreview settings={{ variant: 'classic', showLogo: 'on' }} />);
    await waitFor(() => expect(jsreport.calls.length).toBeGreaterThan(0));
    expect(jsreport.calls[0][7]).toBeNull();
  });

  it('shows the failure instead of an empty frame', async () => {
    jsreport.impl = async () => { throw new Error('jsreport 502'); };
    render(<ListingTemplatePreview settings={{ variant: 'compact' }} />);
    const error = await screen.findByTestId('ListingTemplatePreview__error');
    expect(error.textContent).toContain('jsreport 502');
  });

  it('lays the page out landscape, as the list print is', async () => {
    jsreport.impl = async () => ({ text: async () => '' });
    render(<ListingTemplatePreview settings={{ variant: 'classic' }} />);
    const frame = await screen.findByTestId('ListingTemplatePreview__frame');
    expect(frame.style.width).toBe('1123px');
    expect(frame.style.height).toBe('794px');
  });
});
