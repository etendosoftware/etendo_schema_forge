// ETP-5988 — the preview of a printable variant: classic renders with no configuration (the current
// document), the others with theirs; a render failure is shown, not swallowed.
// @covers tools/app-shell/src/windows/custom/shared/DocumentTemplatePreview.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

// A plain holder, not vi.fn(): vitest records a rejected mock result and reports it as a test error even when the component handles it.
const renderHtml = vi.hoisted(() => {
  const state = { impl: null, calls: [] };
  const fn = (...a) => { state.calls.push(a); return state.impl(...a); };
  return Object.assign(fn, { state });
});
const t = vi.hoisted(() => (key) => key);
vi.mock('@/i18n', () => ({ useUI: () => t }));
vi.mock('@/lib/neoWebhookClient.js', () => ({ NEO_BASE: '/sws/neo' }));
const company = vi.hoisted(() => ({ session: null }));
vi.mock('../documentPdf.js', () => ({
  renderDocumentHtml: (...a) => renderHtml(...a),
  fetchOptionalJson: async () => company.session,
  fetchImageDataUrl: async (id) => (id ? `data:image/png;base64,${id}` : null),
  buildCompanyFields: (session, _h, logo) => ({ companyName: session.organization.name, companyLogoDataUrl: logo }),
}));
vi.mock('../useInvoicePdf.js', () => ({ buildInvoicePdfLabels: () => ({ title: 'T' }) }));

import DocumentTemplatePreview from '../DocumentTemplatePreview.jsx';

describe('DocumentTemplatePreview', () => {
  it('prints the sample with the company name and logo of the session', async () => {
    company.session = { organization: { name: 'Mi Empresa' }, yourCompanyDocumentImageId: 'LOGO1' };
    renderHtml.state.impl = async () => '<p>x</p>';
    render(<DocumentTemplatePreview settings={{ variant: 'classic' }} />);
    await waitFor(() => expect(renderHtml.state.calls.length).toBeGreaterThan(0));
    const data = renderHtml.state.calls[0][0];
    expect(data.companyName).toBe('Mi Empresa');
    expect(data.companyLogoDataUrl).toBe('data:image/png;base64,LOGO1');
    expect(data.customerName).toBe('Cliente de ejemplo S.A.');
  });

  beforeEach(() => { renderHtml.state.calls = []; company.session = null; });

  it('renders the current document (no configuration) for classic', async () => {
    renderHtml.state.impl = async () => '<p>classic</p>';
    render(<DocumentTemplatePreview settings={{ variant: 'classic' }} />);
    await waitFor(() => expect(screen.getByTestId('DocumentTemplatePreview__frame').getAttribute('srcdoc')).toBe('<p>classic</p>'));
    expect(renderHtml.state.calls[0][1]).toBeNull();
    expect(renderHtml.state.calls[0][0].documentNo).toBe('F-2026/0001');
  });

  it('renders with the chosen variant and no scripts allowed in the frame', async () => {
    renderHtml.state.impl = async () => '<p>modern</p>';
    render(<DocumentTemplatePreview settings={{ variant: 'modern', color: '#0F766E', footerText: 'IBAN' }} />);
    await waitFor(() => expect(renderHtml.state.calls.length).toBeGreaterThan(0));
    expect(renderHtml.state.calls[0][1]).toEqual({ variant: 'modern', color: '#0F766E', footerText: 'IBAN' });
    expect(screen.getByTestId('DocumentTemplatePreview__frame').getAttribute('sandbox')).toBe('');
  });

  it('shows the failure instead of an empty frame', async () => {
    renderHtml.state.impl = async () => { throw new Error('jsreport 502'); };
    render(<DocumentTemplatePreview settings={{ variant: 'compact' }} />);
    const error = await screen.findByTestId('DocumentTemplatePreview__error');
    expect(error.textContent).toContain('jsreport 502');
  });
});
