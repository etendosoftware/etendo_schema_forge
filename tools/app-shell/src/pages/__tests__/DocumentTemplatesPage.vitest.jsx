// ETP-5988 — the one-selector settings page for the printed template of commercial documents.
// The i18n mock returns the key, so assertions are against keys and queries are by data-testid.
// @covers tools/app-shell/src/pages/DocumentTemplatesPage.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

const api = vi.hoisted(() => ({ list: vi.fn(), save: vi.fn() }));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

// Stable translators, like the real hooks': the page reloads when `ui` changes.
const t = vi.hoisted(() => (key) => key);
vi.mock('@/i18n', () => ({ useUI: () => t, useMenuLabel: () => t }));
vi.mock('@/components/layout/PageMetaContext', () => ({ useSetPageMeta: vi.fn() }));
// Stable, like the real hook's memoized fetch: the page reloads when it changes.
const stableFetch = vi.hoisted(() => () => null);
vi.mock('@/auth/useApiFetch.js', () => ({ useApiFetch: () => stableFetch }));
vi.mock('sonner', () => ({ toast }));
vi.mock('@/lib/neoWebhookClient.js', () => ({ NEO_BASE: '/sws/neo' }));
vi.mock('@/lib/docTemplateConfigApi.js', async (importOriginal) => ({
  ...(await importOriginal()),
  listDocTemplateConfigs: (...a) => api.list(...a),
  saveDocTemplateVariant: (...a) => api.save(...a),
}));
// The preview renders through jsreport; its own test covers it. Here it only proves the page passes the chosen variant.
vi.mock('@/windows/custom/shared/DocumentTemplatePreview.jsx', () => ({
  default: ({ variant }) => <div data-testid="preview-stub" data-variant={variant} />,
}));
// A native select keeps the assertions about the page, not about Radix's popover in jsdom.
vi.mock('@/components/ui/select', () => ({
  Select: ({ value, onValueChange, disabled, children }) => (
    <select data-testid="select" value={value} disabled={disabled}
      onChange={(e) => onValueChange(e.target.value)}>{children}</select>),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }) => <>{children}</>,
  SelectItem: ({ value, children }) => <option value={value}>{children}</option>,
}));

import DocumentTemplatesPage from '../DocumentTemplatesPage.jsx';

const select = () => screen.getByTestId('select');
const saveButton = () => screen.getByTestId('DocumentTemplatesPage__save');
// The selector is disabled while the initial load runs; changing it earlier would be overwritten.
const ready = () => waitFor(() => expect(select().disabled).toBe(false));

describe('DocumentTemplatesPage', () => {
  beforeEach(() => {
    api.list.mockReset();
    api.save.mockReset();
    toast.error.mockReset();
    toast.success.mockReset();
  });

  it('shows the saved variant and keeps Save off until the choice changes', async () => {
    api.list.mockResolvedValue([{ docType: 'sales-invoice', variant: 'modern' }]);
    render(<DocumentTemplatesPage />);
    await waitFor(() => expect(select().value).toBe('modern'));
    expect(saveButton().disabled).toBe(true);
  });

  it('shows the current (classic) template when nothing is saved', async () => {
    api.list.mockResolvedValue([]);
    render(<DocumentTemplatesPage />);
    await waitFor(() => expect(api.list).toHaveBeenCalled());
    expect(select().value).toBe('classic');
    expect(saveButton().disabled).toBe(true);
  });

  it('previews the variant being chosen, before it is saved', async () => {
    api.list.mockResolvedValue([]);
    render(<DocumentTemplatesPage />);
    await waitFor(() => expect(select().disabled).toBe(false));
    expect(screen.getByTestId('preview-stub').dataset.variant).toBe('classic');
    fireEvent.change(select(), { target: { value: 'modern' } });
    expect(screen.getByTestId('preview-stub').dataset.variant).toBe('modern');
    expect(api.save).not.toHaveBeenCalled();
  });

  it('offers exactly the current, compact and modern templates', async () => {
    api.list.mockResolvedValue([]);
    render(<DocumentTemplatesPage />);
    await waitFor(() => expect(api.list).toHaveBeenCalled());
    expect([...select().options].map((o) => o.value)).toEqual(['classic', 'compact', 'modern']);
  });

  it('saves the choice for the four commercial documents and confirms', async () => {
    api.list.mockResolvedValue([]);
    api.save.mockResolvedValue({});
    render(<DocumentTemplatesPage />);
    await ready();
    fireEvent.change(select(), { target: { value: 'compact' } });
    expect(saveButton().disabled).toBe(false);
    fireEvent.click(saveButton());
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('documentTemplatesSaved'));
    expect(api.save.mock.calls.map((c) => [c[1], c[2]])).toEqual([
      ['sales-invoice', 'compact'], ['sales-order', 'compact'],
      ['purchase-order', 'compact'], ['sales-quotation', 'compact'],
    ]);
    expect(saveButton().disabled).toBe(true);
  });

  it('a refused save (403) is shown and the server state is reloaded', async () => {
    api.list.mockResolvedValue([]);
    api.save.mockRejectedValue(Object.assign(new Error('Not allowed'), { status: 403 }));
    render(<DocumentTemplatesPage />);
    await ready();
    fireEvent.change(select(), { target: { value: 'modern' } });
    fireEvent.click(saveButton());
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
      'documentTemplatesSaveFailed', { description: 'Not allowed' }));
    expect(toast.success).not.toHaveBeenCalled();
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));
    expect(select().value).toBe('classic');
  });

  it('a failed load is reported and the selector stays on the current template', async () => {
    api.list.mockRejectedValue(new Error('boom'));
    render(<DocumentTemplatesPage />);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
      'documentTemplatesLoadFailed', { description: 'boom' }));
    expect(select().value).toBe('classic');
  });
});
