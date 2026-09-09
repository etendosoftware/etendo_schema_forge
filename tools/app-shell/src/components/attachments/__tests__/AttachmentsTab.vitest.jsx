import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock i18n hooks.
vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

// Mock sonner toasts (used by UploadDropzone on validation errors).
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

// Replace the hook with a controllable mock so we can drive component state
// without touching the network.
const hookState = {
  items: [],
  loading: false,
  error: null,
  uploadingFiles: new Map(),
  list: vi.fn(),
  upload: vi.fn(),
  download: vi.fn(),
  downloadAll: vi.fn(),
  remove: vi.fn(),
  removeAll: vi.fn(),
  updateDescription: vi.fn(),
  formatBytes: (n) => `${n} B`,
};

vi.mock('../useAttachments', () => ({
  useAttachments: () => hookState,
}));

import AttachmentsTab from '../AttachmentsTab';
import { toast } from 'sonner';

const baseProps = {
  recordId: 'REC-1',
  data: {},
  token: 'tok',
  apiBaseUrl: 'http://api.test',
  tableName: 'C_Order',
  config: { maxSizeMB: 1 },
  isActive: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  hookState.items = [];
  hookState.loading = false;
  hookState.uploadingFiles = new Map();
});

describe('AttachmentsTab', () => {
  it('renders the empty state when items is empty', () => {
    render(<AttachmentsTab {...baseProps} />);
    expect(screen.getByText('attachmentsNoFiles')).toBeInTheDocument();
  });

  it('renders one row per attachment with the file name', () => {
    hookState.items = [
      { id: '1', name: 'first.pdf', size: 100 },
      { id: '2', name: 'second.png', size: 200 },
      { id: '3', name: 'third.docx', size: 300 },
    ];

    render(<AttachmentsTab {...baseProps} />);
    expect(screen.getByText('first.pdf')).toBeInTheDocument();
    expect(screen.getByText('second.png')).toBeInTheDocument();
    expect(screen.getByText('third.docx')).toBeInTheDocument();
  });

  it('opens the ConfirmDeleteDialog on delete click and calls remove on confirm', async () => {
    const user = userEvent.setup();
    hookState.items = [{ id: '1', name: 'first.pdf', size: 10 }];

    render(<AttachmentsTab {...baseProps} />);

    // The delete icon button uses the i18n key "delete" as its aria-label.
    const deleteBtn = screen.getByRole('button', { name: 'delete' });
    await user.click(deleteBtn);

    // The dialog opens, exposing a Delete confirmation button. Multiple
    // elements may share the "delete" label (icon row + dialog button),
    // so we pick the one that lives inside a dialog.
    const dialog = await screen.findByRole('dialog');
    const confirmBtn = within(dialog).getByRole('button', { name: 'delete' });
    await user.click(confirmBtn);

    expect(hookState.remove).toHaveBeenCalledWith('1');
  });

  it('shows the Download all button only when there is at least one item', () => {
    // Empty list — no button.
    const { rerender } = render(<AttachmentsTab {...baseProps} />);
    expect(screen.queryByText('attachmentsDownloadAll')).not.toBeInTheDocument();

    // With items — button is visible.
    hookState.items = [{ id: '1', name: 'a.pdf' }];
    rerender(<AttachmentsTab {...baseProps} />);
    expect(screen.getByText('attachmentsDownloadAll')).toBeInTheDocument();
  });

  it('rejects a dropped file larger than maxSizeMB with a toast.error', () => {
    render(<AttachmentsTab {...baseProps} />);

    // Build a fake oversized file (2 MB while maxSizeMB is 1).
    const big = new File([new ArrayBuffer(2 * 1024 * 1024)], 'big.bin', { type: 'application/octet-stream' });
    const dropzone = screen.getByText('attachmentsDropHere').parentElement.parentElement;
    fireEvent.drop(dropzone, { dataTransfer: { files: [big] } });

    expect(toast.error).toHaveBeenCalledWith('attachmentsFileTooLarge');
    expect(hookState.upload).not.toHaveBeenCalled();
  });

  it('forwards an accepted dropped file to the upload() callback', () => {
    render(<AttachmentsTab {...baseProps} />);

    const small = new File(['hi'], 'small.txt', { type: 'text/plain' });
    Object.defineProperty(small, 'size', { value: 10 });

    const dropzone = screen.getByText('attachmentsDropHere').parentElement.parentElement;
    fireEvent.drop(dropzone, { dataTransfer: { files: [small] } });

    expect(hookState.upload).toHaveBeenCalledTimes(1);
    expect(hookState.upload).toHaveBeenCalledWith(small);
  });

  // ETP-4315 QA follow-up: a brand-new record has no persisted id yet
  // (recordId is the literal string "new"), so a plain upload() 404s and
  // the file is silently lost. saveBeforeAttach forces the header to save
  // first, then uploads against the id it returns.
  describe('saveBeforeAttach (ETP-4315 QA follow-up)', () => {
    const small = () => {
      const file = new File(['hi'], 'small.txt', { type: 'text/plain' });
      Object.defineProperty(file, 'size', { value: 10 });
      return file;
    };

    const drop = (file) => {
      const dropzone = screen.getByText('attachmentsDropHere').parentElement.parentElement;
      fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });
    };

    it('force-saves the header, then uploads against the saved id, then navigates', async () => {
      const saved = { id: 'REC-NEW-1' };
      const onSaveHeader = vi.fn().mockResolvedValue(saved);
      const onGoToSavedRecord = vi.fn();

      render(
        <AttachmentsTab
          {...baseProps}
          recordId="new"
          isNew
          config={{ ...baseProps.config, saveBeforeAttach: true }}
          onSaveHeader={onSaveHeader}
          onGoToSavedRecord={onGoToSavedRecord}
        />
      );

      const file = small();
      drop(file);

      await vi.waitFor(() => expect(hookState.upload).toHaveBeenCalled());

      expect(onSaveHeader).toHaveBeenCalledWith({ navigateAfter: false });
      expect(hookState.upload).toHaveBeenCalledWith(file, { recordId: 'REC-NEW-1' });
      expect(onGoToSavedRecord).toHaveBeenCalledWith(saved);
    });

    it('does not upload when the forced save fails validation', async () => {
      const onSaveHeader = vi.fn().mockResolvedValue(null);
      const onGoToSavedRecord = vi.fn();

      render(
        <AttachmentsTab
          {...baseProps}
          recordId="new"
          isNew
          config={{ ...baseProps.config, saveBeforeAttach: true }}
          onSaveHeader={onSaveHeader}
          onGoToSavedRecord={onGoToSavedRecord}
        />
      );

      drop(small());

      await vi.waitFor(() => expect(onSaveHeader).toHaveBeenCalled());

      expect(hookState.upload).not.toHaveBeenCalled();
      expect(onGoToSavedRecord).not.toHaveBeenCalled();
    });

    it('uploads directly, without forcing a save, when saveBeforeAttach is not set', () => {
      const onSaveHeader = vi.fn();

      render(
        <AttachmentsTab
          {...baseProps}
          recordId="new"
          isNew
          onSaveHeader={onSaveHeader}
        />
      );

      const file = small();
      drop(file);

      expect(onSaveHeader).not.toHaveBeenCalled();
      expect(hookState.upload).toHaveBeenCalledWith(file);
    });
  });
});

