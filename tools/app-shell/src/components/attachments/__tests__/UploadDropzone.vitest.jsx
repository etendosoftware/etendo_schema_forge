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
});
