vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('react-router-dom', () => {
  const navigateFn = vi.fn();
  return {
    useParams: () => ({}),
    useNavigate: () => navigateFn,
    __navigateFn: navigateFn,
  };
});

vi.mock('lucide-react', () => ({
  FileJson: (props) => <svg data-testid="file-json-icon" {...props} />,
  Search: (props) => <svg data-testid="search-icon" {...props} />,
  History: (props) => <svg data-testid="history-icon" {...props} />,
  Loader2: (props) => <svg data-testid="loader-icon" {...props} />,
  FolderOpen: (props) => <svg data-testid="folder-icon" {...props} />,
}));

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ArtifactViewerPage from '../ArtifactViewerPage.jsx';

describe('ArtifactViewerPage', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockWindowList(windows = []) {
    globalThis.fetch.mockImplementation((url) => {
      if (url === '/api/artifacts') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ windows }),
        });
      }
      if (url.includes('/history')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ commits: [] }),
        });
      }
      // Default JSON file response
      return Promise.resolve({
        ok: true,
        text: async () => JSON.stringify({ test: 'data' }),
      });
    });
  }

  it('renders without crashing', () => {
    mockWindowList();
    const { container } = render(<ArtifactViewerPage />);
    expect(container).toBeTruthy();
  });

  it('shows the artifacts title', () => {
    mockWindowList();
    render(<ArtifactViewerPage />);
    expect(screen.getByText('artifactsTitle')).toBeInTheDocument();
  });

  it('shows the "select window" placeholder when no window is selected', () => {
    mockWindowList();
    render(<ArtifactViewerPage />);
    expect(screen.getByText('selectWindowFromList')).toBeInTheDocument();
  });

  it('renders search input', () => {
    mockWindowList();
    render(<ArtifactViewerPage />);
    expect(screen.getByPlaceholderText('searchWindows')).toBeInTheDocument();
  });

  it('fetches and displays window list', async () => {
    mockWindowList(['sales-order', 'purchase-invoice']);
    render(<ArtifactViewerPage />);
    await waitFor(() => {
      expect(screen.getByText('sales-order')).toBeInTheDocument();
      expect(screen.getByText('purchase-invoice')).toBeInTheDocument();
    });
  });

  it('shows noWindowsFound when fetch returns empty windows', async () => {
    mockWindowList([]);
    render(<ArtifactViewerPage />);
    await waitFor(() => {
      expect(screen.getByText('noWindowsFound')).toBeInTheDocument();
    });
  });

  it('handles fetch failure gracefully', async () => {
    globalThis.fetch.mockRejectedValue(new Error('network'));
    render(<ArtifactViewerPage />);
    await waitFor(() => {
      expect(screen.getByText('artifactsTitle')).toBeInTheDocument();
    });
  });

  it('shows window count badge', async () => {
    mockWindowList(['sales-order', 'purchase-invoice']);
    render(<ArtifactViewerPage />);
    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument();
    });
  });

  it('filters windows by search input', async () => {
    mockWindowList(['sales-order', 'purchase-invoice', 'purchase-order']);
    render(<ArtifactViewerPage />);
    await waitFor(() => {
      expect(screen.getByText('sales-order')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('searchWindows');
    await userEvent.setup().type(searchInput, 'purchase');

    expect(screen.queryByText('sales-order')).not.toBeInTheDocument();
    expect(screen.getByText('purchase-invoice')).toBeInTheDocument();
    expect(screen.getByText('purchase-order')).toBeInTheDocument();
  });

  it('selects a window and loads its content', async () => {
    globalThis.fetch.mockImplementation((url) => {
      if (url === '/api/artifacts') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ windows: ['sales-order'] }),
        });
      }
      if (url.includes('/history')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ commits: [{ hash: 'abc123', date: '2025-01-15', subject: 'Initial commit' }] }),
        });
      }
      if (url.includes('/sales-order/schema-curated.json')) {
        return Promise.resolve({
          ok: true,
          text: async () => JSON.stringify({ name: 'sales-order', entities: [] }),
        });
      }
      return Promise.resolve({ ok: true, text: async () => '{}' });
    });

    render(<ArtifactViewerPage />);

    await waitFor(() => {
      expect(screen.getByText('sales-order')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('sales-order'));

    // Should show file tabs and JSON content
    await waitFor(() => {
      expect(screen.getByText('artifactSchemaCurated')).toBeInTheDocument();
    });

    // Window name appears in both sidebar and badge
    const allMatches = screen.getAllByText('sales-order');
    expect(allMatches.length).toBeGreaterThanOrEqual(2);
  });

  it('shows file tabs after selecting a window', async () => {
    globalThis.fetch.mockImplementation((url) => {
      if (url === '/api/artifacts') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ windows: ['test-window'] }),
        });
      }
      if (url.includes('/history')) {
        return Promise.resolve({ ok: true, json: async () => ({ commits: [] }) });
      }
      return Promise.resolve({ ok: true, text: async () => '{}' });
    });

    render(<ArtifactViewerPage />);

    await waitFor(() => expect(screen.getByText('test-window')).toBeInTheDocument());
    fireEvent.click(screen.getByText('test-window'));

    await waitFor(() => {
      expect(screen.getByText('artifactSchemaRaw')).toBeInTheDocument();
      expect(screen.getByText('artifactSchemaCurated')).toBeInTheDocument();
      expect(screen.getByText('artifactContract')).toBeInTheDocument();
    });
  });

  it('shows error when file fetch returns 404', async () => {
    globalThis.fetch.mockImplementation((url) => {
      if (url === '/api/artifacts') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ windows: ['win1'] }),
        });
      }
      if (url.includes('/history')) {
        return Promise.resolve({ ok: true, json: async () => ({ commits: [] }) });
      }
      // File fetch returns 404
      return Promise.resolve({ ok: false, status: 404 });
    });

    render(<ArtifactViewerPage />);

    await waitFor(() => expect(screen.getByText('win1')).toBeInTheDocument());
    fireEvent.click(screen.getByText('win1'));

    await waitFor(() => {
      expect(screen.getByText('File not found at this version')).toBeInTheDocument();
    });
  });

  it('shows generic error when file fetch fails with non-404 status', async () => {
    globalThis.fetch.mockImplementation((url) => {
      if (url === '/api/artifacts') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ windows: ['win1'] }),
        });
      }
      if (url.includes('/history')) {
        return Promise.resolve({ ok: true, json: async () => ({ commits: [] }) });
      }
      return Promise.resolve({ ok: false, status: 500 });
    });

    render(<ArtifactViewerPage />);

    await waitFor(() => expect(screen.getByText('win1')).toBeInTheDocument());
    fireEvent.click(screen.getByText('win1'));

    await waitFor(() => {
      expect(screen.getByText('Failed to load')).toBeInTheDocument();
    });
  });

  it('shows loading indicator while fetching file', async () => {
    let resolveFile;
    globalThis.fetch.mockImplementation((url) => {
      if (url === '/api/artifacts') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ windows: ['win1'] }),
        });
      }
      if (url.includes('/history')) {
        return Promise.resolve({ ok: true, json: async () => ({ commits: [] }) });
      }
      return new Promise((resolve) => { resolveFile = resolve; });
    });

    render(<ArtifactViewerPage />);

    await waitFor(() => expect(screen.getByText('win1')).toBeInTheDocument());
    fireEvent.click(screen.getByText('win1'));

    await waitFor(() => {
      expect(screen.getByText('loading')).toBeInTheDocument();
    });

    // Resolve the pending fetch
    resolveFile({ ok: true, text: async () => '{"key":"value"}' });

    await waitFor(() => {
      expect(screen.queryByText('loading')).not.toBeInTheDocument();
    });
  });

  it('handles non-JSON text response gracefully', async () => {
    globalThis.fetch.mockImplementation((url) => {
      if (url === '/api/artifacts') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ windows: ['win1'] }),
        });
      }
      if (url.includes('/history')) {
        return Promise.resolve({ ok: true, json: async () => ({ commits: [] }) });
      }
      return Promise.resolve({ ok: true, text: async () => 'not valid json {{{' });
    });

    render(<ArtifactViewerPage />);

    await waitFor(() => expect(screen.getByText('win1')).toBeInTheDocument());
    fireEvent.click(screen.getByText('win1'));

    // Should display the raw text without crashing
    await waitFor(() => {
      expect(screen.queryByText('loading')).not.toBeInTheDocument();
    });
  });

  it('shows version selector with commits', async () => {
    globalThis.fetch.mockImplementation((url) => {
      if (url === '/api/artifacts') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ windows: ['win1'] }),
        });
      }
      if (url.includes('/history')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            commits: [
              { hash: 'abc123', date: '2025-01-15T10:00:00', subject: 'Initial commit for win1' },
            ],
          }),
        });
      }
      return Promise.resolve({ ok: true, text: async () => '{}' });
    });

    render(<ArtifactViewerPage />);

    await waitFor(() => expect(screen.getByText('win1')).toBeInTheDocument());
    fireEvent.click(screen.getByText('win1'));

    await waitFor(() => {
      const select = screen.getByRole('combobox');
      expect(select).toBeInTheDocument();
      // Check that the commit option exists
      const options = select.querySelectorAll('option');
      expect(options.length).toBe(2); // "current" + 1 commit
    });
  });

  it('switches file tab when clicked', async () => {
    globalThis.fetch.mockImplementation((url) => {
      if (url === '/api/artifacts') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ windows: ['win1'] }),
        });
      }
      if (url.includes('/history')) {
        return Promise.resolve({ ok: true, json: async () => ({ commits: [] }) });
      }
      return Promise.resolve({ ok: true, text: async () => '{}' });
    });

    render(<ArtifactViewerPage />);

    await waitFor(() => expect(screen.getByText('win1')).toBeInTheDocument());
    fireEvent.click(screen.getByText('win1'));

    await waitFor(() => {
      expect(screen.getByText('artifactSchemaRaw')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('artifactSchemaRaw'));

    // Fetch should be called again with the new file
    await waitFor(() => {
      const calls = globalThis.fetch.mock.calls.map(c => c[0]);
      expect(calls.some(u => u.includes('schema-raw.json'))).toBe(true);
    });
  });

  it('handles file fetch network error', async () => {
    globalThis.fetch.mockImplementation((url) => {
      if (url === '/api/artifacts') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ windows: ['win1'] }),
        });
      }
      if (url.includes('/history')) {
        return Promise.resolve({ ok: true, json: async () => ({ commits: [] }) });
      }
      return Promise.reject(new Error('Connection refused'));
    });

    render(<ArtifactViewerPage />);

    await waitFor(() => expect(screen.getByText('win1')).toBeInTheDocument());
    fireEvent.click(screen.getByText('win1'));

    await waitFor(() => {
      expect(screen.getByText('Connection refused')).toBeInTheDocument();
    });
  });
});
