vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, ...rest }) => (
    <button onClick={onClick} {...rest}>{children}</button>
  ),
}));

vi.mock('@/lib/utils', () => ({
  cn: (...args) => args.filter(Boolean).join(' '),
}));

vi.mock('lucide-react', () => ({
  Upload: (props) => <svg data-testid="upload-icon" {...props} />,
  X: (props) => <svg data-testid="x-icon" {...props} />,
  File: (props) => <svg data-testid="file-icon" {...props} />,
  AlertCircle: (props) => <svg data-testid="alert-icon" {...props} />,
}));

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FileUpload } from '../FileUpload.jsx';

function createFile(name, size, type) {
  const buffer = new ArrayBuffer(size);
  return new File([buffer], name, { type });
}

describe('FileUpload', () => {
  const defaultProps = {
    onUpload: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the drop zone', () => {
    render(<FileUpload {...defaultProps} />);
    const zone = screen.getByRole('button', { name: /drop files here/i });
    expect(zone).toBeInTheDocument();
  });

  it('shows default label text', () => {
    render(<FileUpload {...defaultProps} />);
    expect(screen.getByText('Drop files here or click to upload')).toBeInTheDocument();
  });

  it('shows custom label', () => {
    render(<FileUpload {...defaultProps} label="Upload invoice PDF" />);
    expect(screen.getByText('Upload invoice PDF')).toBeInTheDocument();
  });

  it('shows accepted file types when accept prop is set', () => {
    render(<FileUpload {...defaultProps} accept=".pdf,image/*" />);
    expect(screen.getByText(/Accepted: \.pdf,image\/\*/)).toBeInTheDocument();
  });

  it('shows "All file types" when no accept prop', () => {
    render(<FileUpload {...defaultProps} />);
    expect(screen.getByText(/All file types/)).toBeInTheDocument();
  });

  it('shows max size info', () => {
    render(<FileUpload {...defaultProps} maxSize={5} />);
    expect(screen.getByText(/Max 5 MB/)).toBeInTheDocument();
  });

  it('renders custom children instead of default content', () => {
    render(
      <FileUpload {...defaultProps}>
        <div data-testid="custom-child">Custom drop zone</div>
      </FileUpload>
    );
    expect(screen.getByTestId('custom-child')).toBeInTheDocument();
  });

  it('has a hidden file input', () => {
    const { container } = render(<FileUpload {...defaultProps} />);
    const input = container.querySelector('input[type="file"]');
    expect(input).toBeTruthy();
    expect(input.getAttribute('aria-hidden')).toBe('true');
  });

  it('sets accept attribute on file input', () => {
    const { container } = render(<FileUpload {...defaultProps} accept=".pdf" />);
    const input = container.querySelector('input[type="file"]');
    expect(input.getAttribute('accept')).toBe('.pdf');
  });

  it('sets multiple attribute on file input by default', () => {
    const { container } = render(<FileUpload {...defaultProps} />);
    const input = container.querySelector('input[type="file"]');
    expect(input.multiple).toBe(true);
  });

  it('processes valid files from input change', async () => {
    const onUpload = vi.fn();
    const { container } = render(<FileUpload onUpload={onUpload} />);
    const input = container.querySelector('input[type="file"]');

    const file = createFile('test.txt', 1024, 'text/plain');
    fireEvent.change(input, { target: { files: [file] } });

    expect(onUpload).toHaveBeenCalledWith([file]);
  });

  it('shows file in list after upload', () => {
    const { container } = render(<FileUpload {...defaultProps} />);
    const input = container.querySelector('input[type="file"]');

    const file = createFile('report.pdf', 2048, 'application/pdf');
    fireEvent.change(input, { target: { files: [file] } });

    expect(screen.getByText('report.pdf')).toBeInTheDocument();
  });

  it('shows file size', () => {
    const { container } = render(<FileUpload {...defaultProps} />);
    const input = container.querySelector('input[type="file"]');

    const file = createFile('report.pdf', 2048, 'application/pdf');
    fireEvent.change(input, { target: { files: [file] } });

    expect(screen.getByText('2.0 KB')).toBeInTheDocument();
  });

  it('rejects files exceeding maxSize', () => {
    const onUpload = vi.fn();
    const { container } = render(<FileUpload onUpload={onUpload} maxSize={1} />);
    const input = container.querySelector('input[type="file"]');

    // 2 MB file, limit is 1 MB
    const file = createFile('big.pdf', 2 * 1024 * 1024, 'application/pdf');
    fireEvent.change(input, { target: { files: [file] } });

    expect(onUpload).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/exceeds the 1 MB limit/)).toBeInTheDocument();
  });

  it('rejects files not matching accept filter', () => {
    const onUpload = vi.fn();
    const { container } = render(<FileUpload onUpload={onUpload} accept=".pdf" />);
    const input = container.querySelector('input[type="file"]');

    const file = createFile('image.png', 1024, 'image/png');
    fireEvent.change(input, { target: { files: [file] } });

    expect(onUpload).not.toHaveBeenCalled();
    expect(screen.getByText(/not an accepted file type/)).toBeInTheDocument();
  });

  it('accepts files matching wildcard MIME type', () => {
    const onUpload = vi.fn();
    const { container } = render(<FileUpload onUpload={onUpload} accept="image/*" />);
    const input = container.querySelector('input[type="file"]');

    const file = createFile('photo.jpg', 1024, 'image/jpeg');
    fireEvent.change(input, { target: { files: [file] } });

    expect(onUpload).toHaveBeenCalledWith([file]);
  });

  it('removes a file when remove button is clicked', () => {
    const onUpload = vi.fn();
    const { container } = render(<FileUpload onUpload={onUpload} />);
    const input = container.querySelector('input[type="file"]');

    const file = createFile('doc.pdf', 1024, 'application/pdf');
    fireEvent.change(input, { target: { files: [file] } });

    expect(screen.getByText('doc.pdf')).toBeInTheDocument();

    const removeBtn = screen.getByRole('button', { name: /Remove doc\.pdf/i });
    fireEvent.click(removeBtn);

    expect(screen.queryByText('doc.pdf')).not.toBeInTheDocument();
    expect(onUpload).toHaveBeenLastCalledWith([]);
  });

  it('handles drop events', () => {
    const onUpload = vi.fn();
    render(<FileUpload onUpload={onUpload} />);
    const zone = screen.getByRole('button', { name: /drop files here/i });

    const file = createFile('dropped.pdf', 1024, 'application/pdf');
    fireEvent.drop(zone, {
      dataTransfer: { files: [file] },
    });

    expect(onUpload).toHaveBeenCalledWith([file]);
  });

  it('handles dragEnter and dragLeave events without crashing', () => {
    render(<FileUpload {...defaultProps} />);
    const zone = screen.getByRole('button', { name: /drop files here/i });

    fireEvent.dragEnter(zone);
    fireEvent.dragLeave(zone);
    // No crash
  });

  it('handles single file mode (multiple=false)', () => {
    const onUpload = vi.fn();
    const { container } = render(<FileUpload onUpload={onUpload} multiple={false} />);
    const input = container.querySelector('input[type="file"]');

    const file1 = createFile('a.pdf', 512, 'application/pdf');
    const file2 = createFile('b.pdf', 512, 'application/pdf');
    fireEvent.change(input, { target: { files: [file1, file2] } });

    // Only first file kept
    expect(onUpload).toHaveBeenCalledWith([file1]);
  });

  it('formats 0 bytes correctly', () => {
    const { container } = render(<FileUpload {...defaultProps} />);
    const input = container.querySelector('input[type="file"]');

    const file = createFile('empty.txt', 0, 'text/plain');
    fireEvent.change(input, { target: { files: [file] } });

    expect(screen.getByText('0 B')).toBeInTheDocument();
  });
});
