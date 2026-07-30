import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock i18n hooks
vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useLocale: () => ({}),
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

// Mock useAnimatedOpen to just pass through
vi.mock('@/lib/useAnimatedOpen.js', () => ({
  useAnimatedOpen: (open) => ({
    shouldRender: open,
    isClosing: false,
  }),
}));

// Mock resolveIdentifier and statusBadge
vi.mock('@/lib/resolveIdentifier.js', () => ({
  resolveIdentifier: (row, key) => row?.[key] ?? '',
}));

vi.mock('@/lib/statusBadge.js', () => ({
  statusLabel: (raw) => raw,
}));

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

import ReportDrawer from '../ReportDrawer.jsx';

const BASE_PROPS = {
  open: true,
  onClose: vi.fn(),
  windowName: 'sales-order',
  columns: [
    { key: 'documentNo', label: 'Document No', type: 'string' },
    { key: 'grandTotal', label: 'Total', type: 'amount' },
  ],
  title: 'Sales Orders Report',
  apiBaseUrl: 'http://localhost:8080/etendo/neo',
  entity: 'sales-order',
  token: 'test-token',
  sortColumn: 'creationDate',
  sortDirection: 'desc',
  activeFilters: [],
};

describe('ReportDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: jsreport not available, API returns empty data
    mockFetch.mockImplementation((url) => {
      if (url.includes('/jsreport/api/ping')) {
        return Promise.resolve({ ok: false });
      }
      // Data fetch
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          response: {
            data: [
              { id: '1', documentNo: 'SO-001', grandTotal: 100 },
            ],
          },
        }),
      });
    });
  });

  it('returns null when open is false', () => {
    const { container } = render(
      <ReportDrawer {...BASE_PROPS} open={false} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders the report title when open', async () => {
    render(<ReportDrawer {...BASE_PROPS} />);
    await waitFor(() => {
      expect(screen.getByText('Sales Orders Report')).toBeInTheDocument();
    });
  });

  it('renders format buttons (preview, pdf, excel, csv)', async () => {
    render(<ReportDrawer {...BASE_PROPS} />);
    await waitFor(() => {
      expect(screen.getByText('preview')).toBeInTheDocument();
      expect(screen.getByText('pdf')).toBeInTheDocument();
      expect(screen.getByText('excel')).toBeInTheDocument();
      expect(screen.getByText('csv')).toBeInTheDocument();
    });
  });

  it('renders the print button', async () => {
    render(<ReportDrawer {...BASE_PROPS} />);
    await waitFor(() => {
      expect(screen.getByText('print')).toBeInTheDocument();
    });
  });

  it('calls onClose when close button is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ReportDrawer {...BASE_PROPS} onClose={onClose} />);
    // Find the close button (X icon button, last button in the toolbar)
    const buttons = document.querySelectorAll('button');
    const closeBtn = Array.from(buttons).pop();
    if (closeBtn) {
      await user.click(closeBtn);
      expect(onClose).toHaveBeenCalled();
    }
  });

  it('shows jsreport unavailable banner when jsreport is down', async () => {
    render(<ReportDrawer {...BASE_PROPS} />);
    await waitFor(() => {
      expect(screen.getByText('jsreportNotAvailableBanner')).toBeInTheDocument();
    });
  });

  it('renders the iframe for preview', () => {
    render(<ReportDrawer {...BASE_PROPS} />);
    const iframe = screen.getByTitle('Report Preview');
    expect(iframe).toBeInTheDocument();
  });

  it('shows record count after data loads', async () => {
    render(<ReportDrawer {...BASE_PROPS} />);
    await waitFor(() => {
      const recordsText = screen.queryByText(/1.*records/);
      // The records text might show as "1 records" from our mock
      expect(recordsText).toBeTruthy();
    });
  });

  it('renders backdrop that calls onClose on click', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ReportDrawer {...BASE_PROPS} onClose={onClose} />);
    // Backdrop is the first fixed div with bg-black/30
    const backdrop = document.querySelector('.fixed.bg-black\\/30, [class*="bg-black"]');
    if (backdrop) {
      await user.click(backdrop);
      expect(onClose).toHaveBeenCalled();
    }
  });
});

describe('ReportDrawer — embedded jsreport HELPERS_CODE formatCurrency', () => {
  // HELPERS_CODE is a self-contained Handlebars-helpers string sent directly to
  // jsreport (same cross-process constraint as templates/reports/helpers — see
  // buildJsreportHelpersString()'s doc comment). It used to hand-roll its own
  // en-US formatCurrency; it now builds from the SAME centralized function
  // every Category D report and document PDF uses — no more per-file copy to
  // drift out of sync. Source-text assertion (not exported for direct import),
  // matching this repo's convention for such cases.
  it('builds helpers from the canonical buildJsreportHelpersString() — no hand-rolled formatCurrency duplicate', async () => {
    const { readFileSync } = await import('node:fs');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(__dirname, '..', 'ReportDrawer.jsx'), 'utf8');
    expect(src).toMatch(/import\s*\{\s*buildJsreportHelpersString\s*\}\s*from\s*['"][^'"]*report-html-helpers\.js['"]/);
    expect(src).toMatch(/import\s*\{\s*getCurrencyFormatConfig\s*\}\s*from\s*['"][^'"]*currencyFormatConfig\.js['"]/);
    expect(src).toMatch(/function buildHelpersCode\(\)\s*\{/);
    expect(src).toMatch(/buildJsreportHelpersString\(undefined,\s*undefined,\s*getCurrencyFormatConfig\(\)\)/);
    expect(src).toMatch(/helpers:\s*buildHelpersCode\(\)/);
    expect(src).not.toMatch(/function formatCurrency\(/);
  });

  it('the resulting HELPERS_CODE actually groups thousands correctly (real function, not a stub)', async () => {
    const { buildJsreportHelpersString } = await import('../../../../../../templates/reports/helpers/report-html-helpers.js');
    const built = buildJsreportHelpersString();
    const startIdx = built.indexOf('function formatCurrency(');
    const braceStart = built.indexOf('{', startIdx);
    let depth = 0, i = braceStart;
    for (; i < built.length; i++) {
      if (built[i] === '{') depth++;
      else if (built[i] === '}') { depth--; if (depth === 0) break; }
    }
    const groupStart = built.indexOf('function __groupEsEs(');
    const groupBraceStart = built.indexOf('{', groupStart);
    let gDepth = 0, gi = groupBraceStart;
    for (; gi < built.length; gi++) {
      if (built[gi] === '{') gDepth++;
      else if (built[gi] === '}') { gDepth--; if (gDepth === 0) break; }
    }
    const fn = new Function(`${built.slice(groupStart, gi + 1)}\n${built.slice(startIdx, i + 1)}; return formatCurrency;`)();
    expect(fn(1355.2)).toBe('1.355,20');
  });
});
