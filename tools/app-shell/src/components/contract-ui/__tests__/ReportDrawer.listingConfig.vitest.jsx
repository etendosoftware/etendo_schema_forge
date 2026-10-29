// ETP-5988 — the list print (ReportDrawer) applies the organization's saved list design: the CSS
// and the logo reach the jsreport payload; with no configuration the payload is the current one.
// @covers tools/app-shell/src/components/contract-ui/ReportDrawer.jsx
import { render, waitFor } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: vi.fn(() => (key) => key),
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useLocale: () => ({}),
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));
vi.mock('@/lib/useAnimatedOpen.js', () => ({ useAnimatedOpen: (open) => ({ shouldRender: open, isClosing: false }) }));
vi.mock('@/lib/resolveIdentifier.js', () => ({ resolveIdentifier: (row, key) => row?.[key] ?? '' }));
vi.mock('@/lib/statusBadge.js', () => ({ statusLabel: (raw) => raw }));

const config = vi.hoisted(() => ({ value: null, logo: 'data:image/png;base64,AAA=' }));
vi.mock('@/windows/custom/shared/docTemplateConfig.js', () => ({
  loadDocTemplateConfig: async () => config.value,
  loadCompanyLogo: async () => config.logo,
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

import ReportDrawer from '../ReportDrawer.jsx';

const PROPS = {
  open: true, onClose: vi.fn(), windowName: 'sales-order',
  columns: [{ key: 'documentNo', label: 'Document No', type: 'string' }],
  title: 'Sales Orders', apiBaseUrl: 'http://localhost:8080/etendo/neo', entity: 'sales-order',
  token: 't', sortColumn: 'creationDate', sortDirection: 'desc', activeFilters: [],
};

const reportCall = () => {
  const call = mockFetch.mock.calls.find(([url]) => url === '/jsreport/api/report');
  return call ? JSON.parse(call[1].body) : null;
};

describe('ReportDrawer — saved list design', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockImplementation((url) => {
      if (url.includes('/jsreport/api/ping')) return Promise.resolve({ ok: true });
      if (url === '/jsreport/api/report') return Promise.resolve({ ok: true, text: async () => '<html></html>' });
      return Promise.resolve({ ok: true, json: async () => ({ response: { data: [{ id: '1', documentNo: 'SO-1' }] } }) });
    });
  });

  it('renders with the saved design: its CSS reaches the jsreport payload', async () => {
    config.value = { variant: 'compact', color: '#B91C1C', font: null, fontSize: null, rowStripes: null, showLogo: null };
    render(<ReportDrawer {...PROPS} />);
    await waitFor(() => expect(reportCall()).not.toBeNull());
    const { data } = reportCall();
    expect(data.css).toContain('variant: compact');
    expect(data.css).toContain('#B91C1C');
    expect(data.meta.logo).toBeNull();
  });

  it('puts the logo in the payload only when the design shows it', async () => {
    config.value = { variant: 'classic', showLogo: 'on', logo: null };
    render(<ReportDrawer {...PROPS} />);
    await waitFor(() => expect(reportCall()).not.toBeNull());
    expect(reportCall().data.meta.logo).toBe('data:image/png;base64,AAA=');
  });

  it('with no saved design the payload carries the current CSS, untouched', async () => {
    config.value = null;
    render(<ReportDrawer {...PROPS} />);
    await waitFor(() => expect(reportCall()).not.toBeNull());
    const { data } = reportCall();
    expect(data.css).not.toContain('variant:');
    expect(data.css).not.toContain('/* style');
    expect(data.meta.logo).toBeNull();
  });
});
