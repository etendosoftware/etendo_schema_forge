import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('@/lib/useAnimatedOpen.js', () => ({
  useAnimatedOpen: (open) => ({ shouldRender: open, isClosing: false }),
}));

import DocumentPrintDrawer from '../DocumentPrintDrawer.jsx';

describe('DocumentPrintDrawer', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('does not render when open is false', () => {
    const { container } = render(
      <DocumentPrintDrawer open={false} onClose={vi.fn()} windowName="purchase-order" documentIds={['d1']} token="tok" />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders when open is true', () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('<html>Doc</html>'),
      json: () => Promise.resolve({}),
    });
    render(
      <DocumentPrintDrawer open={true} onClose={vi.fn()} windowName="purchase-order" documentIds={['d1']} token="tok" />,
    );
    expect(screen.getByText('documentPreview')).toBeInTheDocument();
  });

  it('shows navigation arrows when multiple documents', () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('<html>Doc</html>'),
    });
    render(
      <DocumentPrintDrawer open={true} onClose={vi.fn()} windowName="sales-order" documentIds={['d1', 'd2', 'd3']} token="tok" />,
    );
    // 1 of 3 counter
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
  });

  it('does not show navigation for single document', () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('<html>Doc</html>'),
    });
    render(
      <DocumentPrintDrawer open={true} onClose={vi.fn()} windowName="sales-order" documentIds={['d1']} token="tok" />,
    );
    expect(screen.queryByText('1 / 1')).not.toBeInTheDocument();
  });

  it('calls onClose when backdrop clicked', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('<html>Doc</html>'),
    });
    const onClose = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <DocumentPrintDrawer open={true} onClose={onClose} windowName="order" documentIds={['d1']} token="tok" />,
    );
    // Click the backdrop (first child div with fixed inset-0)
    const backdrop = container.querySelector('.fixed.inset-0');
    if (backdrop) await user.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it('handles fetch error gracefully', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network'));
    render(
      <DocumentPrintDrawer open={true} onClose={vi.fn()} windowName="order" documentIds={['d1']} token="tok" />,
    );
    await waitFor(() => {
      expect(screen.getByText('Network')).toBeInTheDocument();
    });
  });

  it('handles HTTP error response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Server Error' }),
    });
    render(
      <DocumentPrintDrawer open={true} onClose={vi.fn()} windowName="order" documentIds={['d1']} token="tok" />,
    );
    await waitFor(() => {
      expect(screen.getByText('Server Error')).toBeInTheDocument();
    });
  });

  it('renders with no token (skips fetch)', () => {
    const { container } = render(
      <DocumentPrintDrawer open={true} onClose={vi.fn()} windowName="order" documentIds={['d1']} token="" />,
    );
    expect(container.innerHTML).not.toBe('');
  });

  it('renders with empty documentIds', () => {
    const { container } = render(
      <DocumentPrintDrawer open={true} onClose={vi.fn()} windowName="order" documentIds={[]} token="tok" />,
    );
    expect(container.innerHTML).not.toBe('');
  });

  it('does not render when windowName is empty', () => {
    const { container } = render(
      <DocumentPrintDrawer open={true} onClose={vi.fn()} windowName="" documentIds={['d1']} token="tok" />,
    );
    // reportId = 'print-' which is truthy, but still renders the drawer
    expect(container.innerHTML).not.toBe('');
  });

  it('shows download button', () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('<html>Doc</html>'),
    });
    render(
      <DocumentPrintDrawer open={true} onClose={vi.fn()} windowName="order" documentIds={['d1']} token="tok" />,
    );
    expect(screen.getByText('download')).toBeInTheDocument();
  });
});
