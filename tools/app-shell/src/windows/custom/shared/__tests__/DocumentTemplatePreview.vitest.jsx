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
vi.mock('../documentPdf.js', () => ({ renderDocumentHtml: (...a) => renderHtml(...a) }));
vi.mock('../useInvoicePdf.js', () => ({ buildInvoicePdfLabels: () => ({ title: 'T' }) }));

import DocumentTemplatePreview from '../DocumentTemplatePreview.jsx';

describe('DocumentTemplatePreview', () => {
  beforeEach(() => { renderHtml.state.calls = []; });

  it('renders the current document (no configuration) for classic', async () => {
    renderHtml.state.impl = async () => '<p>classic</p>';
    render(<DocumentTemplatePreview variant="classic" />);
    await waitFor(() => expect(screen.getByTestId('DocumentTemplatePreview__frame').getAttribute('srcdoc')).toBe('<p>classic</p>'));
    expect(renderHtml.state.calls[0][1]).toBeNull();
    expect(renderHtml.state.calls[0][0].documentNo).toBe('F-2026/0001');
  });

  it('renders with the chosen variant and no scripts allowed in the frame', async () => {
    renderHtml.state.impl = async () => '<p>modern</p>';
    render(<DocumentTemplatePreview variant="modern" />);
    await waitFor(() => expect(renderHtml.state.calls.length).toBeGreaterThan(0));
    expect(renderHtml.state.calls[0][1]).toEqual({ variant: 'modern' });
    expect(screen.getByTestId('DocumentTemplatePreview__frame').getAttribute('sandbox')).toBe('');
  });

  it('shows the failure instead of an empty frame', async () => {
    renderHtml.state.impl = async () => { throw new Error('jsreport 502'); };
    render(<DocumentTemplatePreview variant="compact" />);
    const error = await screen.findByTestId('DocumentTemplatePreview__error');
    expect(error.textContent).toContain('jsreport 502');
  });
});
