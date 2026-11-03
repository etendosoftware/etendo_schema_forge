// ETP-5988 — Settings → Printable documents: two independent sections (documents, lists), each with
// its own options, live preview and Save. The i18n mock returns the key, so assertions are against
// keys and queries are by data-testid.
// @covers tools/app-shell/src/pages/DocumentTemplatesPage.jsx
// @covers tools/app-shell/src/pages/PrintableSettingsSection.jsx
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
  saveDocTemplateSettings: (...a) => api.save(...a),
}));
// The previews render through jsreport; their own tests cover them. Here they only prove each
// section passes the settings as they are being edited.
vi.mock('@/windows/custom/shared/DocumentTemplatePreview.jsx', () => ({
  default: ({ settings }) => <div data-testid="documents-preview" data-settings={JSON.stringify(settings)} />,
}));
vi.mock('@/windows/custom/shared/ListingTemplatePreview.jsx', () => ({
  default: ({ settings }) => <div data-testid="listings-preview" data-settings={JSON.stringify(settings)} />,
}));
// A native select, named after its trigger's test id, keeps the assertions about the page.
vi.mock('@/components/ui/select', () => {
  const SelectTrigger = () => null;
  return {
    Select: ({ value, onValueChange, disabled, children }) => {
      const trigger = React.Children.toArray(children).find((c) => c.type === SelectTrigger);
      return (
        <select data-testid={trigger?.props['data-testid']} value={value} disabled={disabled}
          onChange={(e) => onValueChange(e.target.value)}>{children}</select>);
    },
    SelectTrigger,
    SelectValue: () => null,
    SelectContent: ({ children }) => <>{children}</>,
    SelectItem: ({ value, children }) => <option value={value}>{children}</option>,
  };
});

import DocumentTemplatesPage from '../DocumentTemplatesPage.jsx';

const DOC = 'DocumentTemplatesPage-documents';
const LST = 'DocumentTemplatesPage-listings';
const el = (id) => screen.getByTestId(id);
// Controls are disabled while the initial load runs; changing one earlier would be overwritten.
const ready = () => waitFor(() => expect(el(`${DOC}__variant`).disabled).toBe(false));
const settingsOf = (testId) => JSON.parse(el(testId).dataset.settings);

describe('DocumentTemplatesPage', () => {
  beforeEach(() => {
    api.list.mockReset();
    api.save.mockReset();
    toast.error.mockReset();
    toast.success.mockReset();
  });

  it('reads documents and lists apart, and keeps Save off until something changes', async () => {
    api.list.mockResolvedValue([
      { docType: 'sales-invoice', variant: 'modern', color: '#112233', font: 'serif' },
      { docType: 'listing', variant: 'compact', rowStripes: 'on' },
    ]);
    render(<DocumentTemplatesPage />);
    await waitFor(() => expect(el(`${DOC}__variant`).value).toBe('modern'));
    expect(el(`${LST}__variant`).value).toBe('compact');
    expect(el(`${DOC}__font`).value).toBe('serif');
    expect(el(`${LST}__font`).value).toBe('default');
    expect(el(`${LST}__stripes`).value).toBe('on');
    expect(el(`${DOC}__save`).disabled).toBe(true);
    expect(el(`${LST}__save`).disabled).toBe(true);
  });

  it('shows the current design with every option unset when nothing is saved', async () => {
    api.list.mockResolvedValue([]);
    render(<DocumentTemplatesPage />);
    await ready();
    expect(el(`${DOC}__variant`).value).toBe('classic');
    expect(settingsOf('documents-preview')).toMatchObject({ variant: 'classic', color: null, font: null, fontSize: null, rowStripes: null });
  });

  it('previews what is being edited before it is saved, each section its own', async () => {
    api.list.mockResolvedValue([]);
    render(<DocumentTemplatesPage />);
    await ready();
    fireEvent.change(el(`${DOC}__variant`), { target: { value: 'modern' } });
    fireEvent.click(el(`${DOC}__color-0F766E`));
    expect(settingsOf('documents-preview')).toMatchObject({ variant: 'modern', color: '#0F766E' });
    expect(settingsOf('listings-preview')).toMatchObject({ variant: 'classic', color: null });
    expect(api.save).not.toHaveBeenCalled();
  });

  it('saves the documents section for the four document types, with branding, and not the lists', async () => {
    api.list.mockResolvedValue([]);
    api.save.mockResolvedValue({});
    render(<DocumentTemplatesPage />);
    await ready();
    fireEvent.change(el(`${DOC}__variant`), { target: { value: 'compact' } });
    fireEvent.change(el(`${DOC}__footer`), { target: { value: 'IBAN ES00' } });
    fireEvent.click(el(`${DOC}__save`));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('documentTemplatesSaved'));
    expect(api.save.mock.calls.map((c) => c[1])).toEqual(['sales-invoice', 'sales-order', 'purchase-order', 'sales-quotation']);
    expect(api.save.mock.calls[0][2]).toMatchObject({ variant: 'compact', footerText: 'IBAN ES00' });
    expect(api.save.mock.calls[0][3]).toEqual({ withLogo: true, withFooter: true });
    expect(el(`${DOC}__save`).disabled).toBe(true);
  });

  it('saves the lists section for the listing type only, with a logo but no footer', async () => {
    api.list.mockResolvedValue([]);
    api.save.mockResolvedValue({});
    render(<DocumentTemplatesPage />);
    await ready();
    fireEvent.change(el(`${LST}__stripes`), { target: { value: 'on' } });
    fireEvent.click(el(`${LST}__save`));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(api.save).toHaveBeenCalledTimes(1);
    expect(api.save.mock.calls[0][1]).toBe('listing');
    expect(api.save.mock.calls[0][2]).toMatchObject({ rowStripes: 'on' });
    expect(api.save.mock.calls[0][3]).toEqual({ withLogo: true, withFooter: false });
    expect(screen.queryByTestId(`${LST}__footer`)).toBeNull();
    expect(el(`${LST}__logo-upload`)).toBeTruthy();
  });

  it('offers show-logo on the lists only, and saves it', async () => {
    api.list.mockResolvedValue([]);
    api.save.mockResolvedValue({});
    render(<DocumentTemplatesPage />);
    await ready();
    expect(screen.queryByTestId(`${DOC}__show-logo`)).toBeNull();
    expect(el(`${LST}__show-logo`).checked).toBe(false);
    fireEvent.click(el(`${LST}__show-logo`));
    expect(settingsOf('listings-preview').showLogo).toBe('on');
    fireEvent.click(el(`${LST}__save`));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(api.save.mock.calls[0][2]).toMatchObject({ showLogo: 'on' });
  });

  it('shows the saved show-logo option checked', async () => {
    api.list.mockResolvedValue([{ docType: 'listing', variant: 'classic', showLogo: 'on' }]);
    render(<DocumentTemplatesPage />);
    await waitFor(() => expect(el(`${LST}__show-logo`).checked).toBe(true));
  });

  it('the lists have no alternating rows unless chosen; a stored off reads as no', async () => {
    api.list.mockResolvedValue([{ docType: 'listing', variant: 'classic', rowStripes: 'off' }]);
    render(<DocumentTemplatesPage />);
    await waitFor(() => expect(el(`${LST}__variant`).disabled).toBe(false));
    expect(el(`${LST}__stripes`).value).toBe('default');
    const options = [...el(`${LST}__stripes`).querySelectorAll('option')].map((o) => o.value);
    expect(options).toEqual(['default', 'on']);
    // the documents keep the design default / yes / no
    expect([...el(`${DOC}__stripes`).querySelectorAll('option')].map((o) => o.value)).toEqual(['default', 'on', 'off']);
  });

  it('lets the lists have their own logo, apart from the documents', async () => {
    api.list.mockResolvedValue([]);
    render(<DocumentTemplatesPage />);
    await ready();
    const file = new File(['x'], 'l.png', { type: 'image/png' });
    fireEvent.change(el(`${LST}__logo-input`), { target: { files: [file] } });
    await waitFor(() => expect(settingsOf('listings-preview').logo).toMatch(/^data:image\/png/));
    expect(settingsOf('documents-preview').logo).toBeNull();
  });

  it('shows one section at a time and keeps the other one\'s unsaved draft when switching', async () => {
    api.list.mockResolvedValue([]);
    render(<DocumentTemplatesPage />);
    await ready();
    expect(el(`${DOC}__section`).closest('[hidden]')).toBeNull();
    expect(el(`${LST}__section`).closest('[hidden]')).not.toBeNull();
    fireEvent.change(el(`${DOC}__variant`), { target: { value: 'modern' } });
    fireEvent.click(el('DocumentTemplatesPage__tab-listings'));
    expect(el(`${DOC}__section`).closest('[hidden]')).not.toBeNull();
    expect(el(`${LST}__section`).closest('[hidden]')).toBeNull();
    fireEvent.click(el('DocumentTemplatesPage__tab-documents'));
    expect(el(`${DOC}__variant`).value).toBe('modern');
  });

  it('picks a base color and goes back to the design default', async () => {
    api.list.mockResolvedValue([{ docType: 'listing', variant: 'classic', color: '#B91C1C' }]);
    render(<DocumentTemplatesPage />);
    await waitFor(() => expect(settingsOf('listings-preview').color).toBe('#B91C1C'));
    fireEvent.click(el(`${LST}__color-default`));
    expect(settingsOf('listings-preview').color).toBeNull();
    expect(el(`${LST}__save`).disabled).toBe(false);
    fireEvent.change(el(`${LST}__color-custom`), { target: { value: '#00aa55' } });
    expect(settingsOf('listings-preview').color).toBe('#00AA55');
  });

  it('shows the server refusal and its real state when a save fails', async () => {
    api.list.mockResolvedValue([]);
    api.save.mockRejectedValue(new Error('Not allowed'));
    render(<DocumentTemplatesPage />);
    await ready();
    fireEvent.change(el(`${DOC}__variant`), { target: { value: 'modern' } });
    fireEvent.click(el(`${DOC}__save`));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
      'documentTemplatesSaveFailed', { description: 'Not allowed' }));
    expect(api.list).toHaveBeenCalledTimes(2);
  });

  it('says so when the saved design cannot be loaded', async () => {
    api.list.mockRejectedValue(new Error('boom'));
    render(<DocumentTemplatesPage />);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
      'documentTemplatesLoadFailed', { description: 'boom' }));
  });

  it('refuses a logo that is not a png, jpeg or webp image, and keeps the one it had', async () => {
    api.list.mockResolvedValue([]);
    render(<DocumentTemplatesPage />);
    await ready();
    const file = new File(['<svg/>'], 'l.svg', { type: 'image/svg+xml' });
    fireEvent.change(el(`${DOC}__logo-input`), { target: { files: [file] } });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('documentTemplatesLogoType'));
    expect(settingsOf('documents-preview').logo).toBeNull();
  });

  it('takes a png logo as a data URL and lets it be removed', async () => {
    api.list.mockResolvedValue([]);
    render(<DocumentTemplatesPage />);
    await ready();
    const file = new File(['x'], 'l.png', { type: 'image/png' });
    fireEvent.change(el(`${DOC}__logo-input`), { target: { files: [file] } });
    await waitFor(() => expect(settingsOf('documents-preview').logo).toMatch(/^data:image\/png;base64,/));
    fireEvent.click(el(`${DOC}__logo-remove`));
    expect(settingsOf('documents-preview').logo).toBeNull();
  });
});
