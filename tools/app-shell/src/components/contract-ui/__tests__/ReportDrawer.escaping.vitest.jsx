// @covers tools/app-shell/src/components/contract-ui/ReportDrawer.jsx
// ETP-4561 — the local HTML fallback preview (jsreport down) is written with
// document.write into a same-origin iframe: record values, filters, title and column
// labels must be HTML-encoded there. Before the fix they were interpolated raw.
import { render, waitFor } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: vi.fn(() => (key) => key),
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useLocale: () => ({}),
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));
vi.mock('@/lib/useAnimatedOpen.js', () => ({
  useAnimatedOpen: (open) => ({ shouldRender: open, isClosing: false }),
}));
vi.mock('@/lib/resolveIdentifier.js', () => ({
  resolveIdentifier: (row, key) => row?.[key] ?? '',
}));
vi.mock('@/lib/statusBadge.js', () => ({ statusLabel: (raw) => raw }));

const mockFetch = vi.fn();
global.fetch = mockFetch;

import ReportDrawer from '../ReportDrawer.jsx';

const IMG = '<img src=x onerror="window.__xss=1">';
const SCRIPT = '<script>window.__xss=1</script>';

describe('ReportDrawer fallback preview output encoding', () => {
  beforeEach(() => {
    delete window.__xss;
    mockFetch.mockImplementation((url) => {
      if (url.includes('/jsreport/api/ping')) return Promise.resolve({ ok: false });
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ response: { data: [{ id: '1', name: IMG, note: `O'Brien ${SCRIPT}` }] } }),
      });
    });
  });

  it('renders hostile record, filter, title and header values as text', async () => {
    const { container } = render(
      <ReportDrawer
        open
        onClose={vi.fn()}
        windowName="w"
        columns={[{ key: 'name', label: `Name ${IMG}` }, { key: 'note', label: 'Note' }]}
        title={`Title ${SCRIPT}`}
        apiBaseUrl="http://localhost/etendo/neo"
        entity="e"
        token="t"
        sortColumn="creationDate"
        sortDirection="desc"
        activeFilters={[{ label: 'F', value: IMG }]}
      />,
    );
    const iframe = container.ownerDocument.querySelector('iframe[title="Report Preview"]');
    await waitFor(() => {
      expect(iframe.contentDocument.querySelector('table.report-table tbody tr')).not.toBeNull();
    });
    const doc = iframe.contentDocument;
    expect(doc.querySelector('img')).toBeNull();
    expect(doc.querySelector('.report-container script')).toBeNull();
    expect(doc.querySelector('td').textContent).toBe(IMG);
    expect(doc.querySelectorAll('td')[1].textContent).toBe(`O'Brien ${SCRIPT}`);
    expect(doc.querySelector('.report-title').textContent).toBe(`Title ${SCRIPT}`);
    expect(doc.querySelector('.report-filters').textContent).toContain(IMG);
    expect(window.__xss).toBeUndefined();
  });
});
