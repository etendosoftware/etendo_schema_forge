// @covers tools/app-shell/src/components/attachments/UploadDropzone.jsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

import UploadDropzone from '../UploadDropzone.jsx';
import { toast } from 'sonner';

const config = {
  maxSizeMB: 1,
  allowedMimeTypes: ['application/pdf', 'image/png'],
  allowedExtensions: ['pdf', 'png'],
  typesLabel: 'PDF, PNG',
};

function makeFile({ type = '', name = 'file', sizeBytes } = {}) {
  const content = sizeBytes ? new Array(sizeBytes).fill('a').join('') : 'content';
  return new File([content], name, { type });
}

describe('UploadDropzone', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows an invalid-type toast and does not call onFiles for a .txt file', () => {
    const onFiles = vi.fn();
    render(<UploadDropzone onFiles={onFiles} config={config} />);
    const input = screen.getByTestId('attachments-file-input');
    const file = makeFile({ type: 'text/plain', name: 'notes.txt' });

    fireEvent.change(input, { target: { files: [file] } });

    expect(toast.error).toHaveBeenCalledWith('attachmentsInvalidType');
    expect(onFiles).not.toHaveBeenCalled();
  });

  it('calls onFiles for a .pdf file', () => {
    const onFiles = vi.fn();
    render(<UploadDropzone onFiles={onFiles} config={config} />);
    const input = screen.getByTestId('attachments-file-input');
    const file = makeFile({ type: 'application/pdf', name: 'doc.pdf' });

    fireEvent.change(input, { target: { files: [file] } });

    expect(onFiles).toHaveBeenCalledWith(file);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('shows a file-too-large toast for an oversized file and does not call onFiles', () => {
    const onFiles = vi.fn();
    render(<UploadDropzone onFiles={onFiles} config={config} />);
    const input = screen.getByTestId('attachments-file-input');
    // maxSizeMB: 1 -> 1024*1024 bytes; go over it.
    const file = makeFile({ type: 'application/pdf', name: 'big.pdf', sizeBytes: 1024 * 1024 + 10 });

    fireEvent.change(input, { target: { files: [file] } });

    // The mocked ui() (in i18n) returns only the key, dropping the interpolation params.
    expect(toast.error).toHaveBeenCalledWith('attachmentsFileTooLarge');
    expect(onFiles).not.toHaveBeenCalled();
  });

  it('sets the accept attribute to include both MIME types and dotted extensions', () => {
    render(<UploadDropzone onFiles={vi.fn()} config={config} />);
    const input = screen.getByTestId('attachments-file-input');
    const accept = input.getAttribute('accept');

    expect(accept).toContain('application/pdf');
    expect(accept).toContain('.pdf');
  });

  /*
   * ETP-5526 — the Figma "Drag" component. Two regressions the behaviour cases above cannot see:
   * the zone shipped with no hover state at all, and its disabled state was a blanket
   * `opacity-50` on the container, which is why the helper text turned unreadable on completed
   * documents. Both are asserted through the state difference (enabled vs disabled), not through
   * the literal class list.
   */
  describe('visual states', () => {
    const zone = () => screen.getByTestId('attachments-dropzone');

    it('arms the hover state only while the zone is enabled', () => {
      const { rerender } = render(<UploadDropzone onFiles={vi.fn()} config={config} />);
      expect(zone().className).toContain('hover:border-[#828FA3]');
      expect(zone().className).toContain('hover:bg-[rgba(18,18,23,0.05)]');

      rerender(<UploadDropzone onFiles={vi.fn()} config={config} disabled />);
      expect(zone().className).not.toContain('hover:');
    });

    it('renders the disabled state as a fill and border change, not a blanket opacity', () => {
      render(<UploadDropzone onFiles={vi.fn()} config={config} disabled />);

      expect(zone().className).not.toContain('opacity-50');
      expect(zone().className).toContain('bg-[hsl(var(--field-hover))]');
      expect(zone().className).toContain('border-[hsl(var(--field-disabled-border))]');
      // The helper text is what the blanket opacity made unreadable; it now carries gray/400.
      expect(zone().querySelector('p').className).toContain('text-[#828FA3]');
    });

    /*
     * Deliberate divergence from Figma (the design shows the whole helper sentence flat grey) —
     * see the BROWSE_LINK comment in UploadDropzone.jsx and docs/ui-design-guidelines.md.
     */
    it('gives the browse control the link treatment while the zone is enabled', () => {
      render(<UploadDropzone onFiles={vi.fn()} config={config} />);
      const browse = screen.getByRole('button', { name: 'attachmentsBrowse' });

      expect(browse).toHaveClass('text-primary');
      expect(browse).toHaveClass('underline');
    });

    it('strips the link treatment from the browse control when the zone is disabled', () => {
      render(<UploadDropzone onFiles={vi.fn()} config={config} disabled />);
      const browse = screen.getByRole('button', { name: 'attachmentsBrowse' });

      expect(browse).not.toHaveClass('text-primary');
      expect(browse).not.toHaveClass('underline');
      // The sentence is already uniformly dimmed; no 50% veil on this one word.
      expect(browse.className).not.toContain('opacity-50');
    });
  });
});
