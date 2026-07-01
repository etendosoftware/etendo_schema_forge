/**
 * Render tests for DocumentPreview — the full-screen PDF preview modal.
 * Covers: open/close, title, PDF embed, placeholder, download link, Escape key.
 */
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('lucide-react', () => ({
  X: () => <span data-testid="icon-x" />,
  Download: () => <span data-testid="icon-download" />,
  FileText: () => <span data-testid="icon-filetext" />,
}));

import { DocumentPreview } from '../DocumentPreview.jsx';

describe('DocumentPreview', () => {
  afterEach(() => {
    // Restore body overflow in case a test leaves it locked
    document.body.style.overflow = '';
  });

  it('renders nothing when open is false', () => {
    const { container } = render(
      <DocumentPreview open={false} onClose={vi.fn()} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders the modal when open is true', () => {
    render(
      <DocumentPreview open={true} onClose={vi.fn()} title="Test PDF" />,
    );
    expect(screen.getByText('Test PDF')).toBeInTheDocument();
  });

  it('shows the default title when none is provided', () => {
    render(
      <DocumentPreview open={true} onClose={vi.fn()} />,
    );
    expect(screen.getByText('Document Preview')).toBeInTheDocument();
  });

  it('renders an <object> embed when pdfUrl is provided', () => {
    const { container } = render(
      <DocumentPreview open={true} onClose={vi.fn()} pdfUrl="https://example.com/doc.pdf" />,
    );
    const obj = container.querySelector('object[data="https://example.com/doc.pdf"]');
    expect(obj).toBeTruthy();
  });

  it('renders the placeholder when pdfUrl is null', () => {
    render(
      <DocumentPreview open={true} onClose={vi.fn()} pdfUrl={null} />,
    );
    expect(screen.getByText('Preview not available')).toBeInTheDocument();
  });

  it('renders a download link when pdfUrl is provided', () => {
    const { container } = render(
      <DocumentPreview open={true} onClose={vi.fn()} pdfUrl="https://example.com/doc.pdf" />,
    );
    const link = container.querySelector('a[download]');
    expect(link).toBeTruthy();
    expect(link.getAttribute('href')).toBe('https://example.com/doc.pdf');
  });

  it('does NOT render a download link when pdfUrl is null', () => {
    const { container } = render(
      <DocumentPreview open={true} onClose={vi.fn()} pdfUrl={null} />,
    );
    const link = container.querySelector('a[download]');
    expect(link).toBeNull();
  });

  it('calls onClose when close button is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <DocumentPreview open={true} onClose={onClose} />,
    );
    const closeBtn = screen.getByTitle('Close');
    await user.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when backdrop is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { container } = render(
      <DocumentPreview open={true} onClose={onClose} />,
    );
    // Backdrop is the first child (fixed overlay with bg-black/30)
    const backdrop = container.querySelector('.fixed.inset-0');
    await user.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when Escape key is pressed', () => {
    const onClose = vi.fn();
    render(
      <DocumentPreview open={true} onClose={onClose} />,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('locks body scroll when open and restores on close', () => {
    const { rerender } = render(
      <DocumentPreview open={true} onClose={vi.fn()} />,
    );
    expect(document.body.style.overflow).toBe('hidden');
    rerender(
      <DocumentPreview open={false} onClose={vi.fn()} />,
    );
    expect(document.body.style.overflow).toBe('');
  });

  it('contains an iframe fallback inside the object tag', () => {
    const { container } = render(
      <DocumentPreview open={true} onClose={vi.fn()} pdfUrl="https://example.com/doc.pdf" title="Fallback Test" />,
    );
    const iframe = container.querySelector('iframe[src="https://example.com/doc.pdf"]');
    expect(iframe).toBeTruthy();
    expect(iframe.getAttribute('title')).toBe('Fallback Test');
  });
});
