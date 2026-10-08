// @covers tools/app-shell/src/components/attachments/AttachmentsTab.jsx
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock i18n hooks.
// The translator returns the key itself, so no hardcoded English leaks into an
// assertion. `count` is the one interpolation that is appended, so the selection
// bar's counter can be asserted for real instead of only for its key; every other
// param (e.g. `{max}` on attachmentsFileTooLarge) is ignored, leaving the existing
// exact-key assertions untouched.
vi.mock('@/i18n', () => ({
  useUI: () => (key, params) => (
    params && params.count !== undefined ? `${key}:${params.count}` : key
  ),
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
  count: null,
  loading: false,
  error: null,
  uploadingFiles: new Map(),
  list: vi.fn(),
  upload: vi.fn(),
  download: vi.fn(),
  downloadAll: vi.fn(),
  downloadSelection: vi.fn(),
  remove: vi.fn(),
  removeAll: vi.fn(),
  removeMany: vi.fn(),
  updateDescription: vi.fn(),
  formatBytes: (n) => `${n} B`,
};

// Options each render passed to the hook, so tests can assert what the tab asks for.
const hookCalls = [];
vi.mock('../useAttachments', () => ({
  useAttachments: (opts) => {
    hookCalls.push(opts);
    return hookState;
  },
}));

// ETP-5038: the accepted types now come from GET /sws/neo/attachments/config. Pin them
// here so these tests exercise the tab, not the network — the policy module has its own
// suite for the fetch/fallback behavior.
vi.mock('../useAttachmentPolicy', () => ({
  useAttachmentPolicy: () => ({
    maxSizeMB: 10,
    allowedMimeTypes: ['application/pdf', 'image/png'],
    allowedExtensions: ['pdf', 'png'],
    typeGroups: ['pdf', 'image'],
    degraded: false,
  }),
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
  hookState.count = null;
  hookState.loading = false;
  hookCalls.length = 0;
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

  // ETP-5526 — the two header-wide controls were removed from this tab: the
  // selection bar replaces both, and the Figma header has only the five data
  // columns. (`onDownloadAll` itself survives on AttachmentsTable for
  // SifAttachmentsSection — covered in AttachmentsTable.vitest.jsx.)
  it('renders neither header-wide bulk control, with or without items', () => {
    const { rerender } = render(<AttachmentsTab {...baseProps} />);
    expect(screen.queryByTestId('attachments-download-all')).not.toBeInTheDocument();
    expect(screen.queryByTestId('attachments-delete-all')).not.toBeInTheDocument();

    hookState.items = [{ id: '1', name: 'a.pdf' }];
    rerender(<AttachmentsTab {...baseProps} />);
    expect(screen.queryByTestId('attachments-download-all')).not.toBeInTheDocument();
    expect(screen.queryByTestId('attachments-delete-all')).not.toBeInTheDocument();
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

    const small = new File(['hi'], 'small.pdf', { type: 'application/pdf' });
    Object.defineProperty(small, 'size', { value: 10 });

    const dropzone = screen.getByText('attachmentsDropHere').parentElement.parentElement;
    fireEvent.drop(dropzone, { dataTransfer: { files: [small] } });

    expect(hookState.upload).toHaveBeenCalledTimes(1);
    expect(hookState.upload).toHaveBeenCalledWith(small);
  });

  // ETP-5038 TC-02: the dropzone advertised "PDF, Word, Excel, PowerPoint, images" while
  // text/plain sat in the allowlist, so a .txt uploaded without a word of complaint.
  it('rejects a .txt file with a visible error and never calls upload()', () => {
    render(<AttachmentsTab {...baseProps} />);

    const text = new File(['hi'], 'notes.txt', { type: 'text/plain' });
    Object.defineProperty(text, 'size', { value: 10 });

    const dropzone = screen.getByText('attachmentsDropHere').parentElement.parentElement;
    fireEvent.drop(dropzone, { dataTransfer: { files: [text] } });

    expect(hookState.upload).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('attachmentsInvalidType');
  });

  // ETP-4315 QA follow-up: a brand-new record has no persisted id yet
  // (recordId is the literal string "new"), so a plain upload() 404s and
  // the file is silently lost. saveBeforeAttach forces the header to save
  // first, then uploads against the id it returns.
  describe('saveBeforeAttach (ETP-4315 QA follow-up)', () => {
    const small = () => {
      const file = new File(['hi'], 'small.pdf', { type: 'application/pdf' });
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

    // ETP-5309: without saveBeforeAttach the dropzone used to stay active on a new
    // record and POST against the literal id "new" — the backend answered a raw 500.
    it('shows a save-first hint instead of the dropzone when saveBeforeAttach is not set', () => {
      const onSaveHeader = vi.fn();

      render(
        <AttachmentsTab
          {...baseProps}
          recordId="new"
          isNew
          onSaveHeader={onSaveHeader}
        />
      );

      expect(screen.getByTestId('attachments-save-first-hint')).toHaveTextContent('attachmentsSaveFirstHint');
      expect(screen.queryByText('attachmentsDropHere')).not.toBeInTheDocument();
      expect(onSaveHeader).not.toHaveBeenCalled();
      expect(hookState.upload).not.toHaveBeenCalled();
    });

    it('keeps the dropzone (no hint) on a new record when saveBeforeAttach is set', () => {
      render(
        <AttachmentsTab
          {...baseProps}
          recordId="new"
          isNew
          config={{ ...baseProps.config, saveBeforeAttach: true }}
          onSaveHeader={vi.fn()}
        />
      );

      expect(screen.getByText('attachmentsDropHere')).toBeInTheDocument();
      expect(screen.queryByTestId('attachments-save-first-hint')).not.toBeInTheDocument();
    });
  });

  // ETP-5309: DetailView reads this static to disable the tab button on a new record.
  describe('requiresSavedRecord (ETP-5309)', () => {
    it('requires a saved record unless the tab config sets saveBeforeAttach', () => {
      expect(AttachmentsTab.requiresSavedRecord({ config: {} })).toBe(true);
      expect(AttachmentsTab.requiresSavedRecord({})).toBe(true);
      expect(AttachmentsTab.requiresSavedRecord({ config: { saveBeforeAttach: true } })).toBe(false);
      expect(AttachmentsTab.savedRecordHintKey).toBe('attachmentsSaveFirstHint');
    });
  });
});

// ETP-5526: the tab badge showed "0" before the lazy list was ever read. The
// tab reports the hook's `count` as-is (null = unknown, never a fake 0), only
// when not loading, and asks the hook for the count prefetch only when there
// is a badge to feed.
describe('AttachmentsTab — onCountChange reports the hook count (ETP-5526)', () => {
  it.each([
    ['unknown count → null (even with items on screen)', { count: null, items: [{ id: '1', name: 'a.pdf' }] }, null],
    ['known count → that number', { count: 2, items: [] }, 2],
    ['known zero → 0', { count: 0, items: [] }, 0],
  ])('%s', (_label, state, expected) => {
    Object.assign(hookState, state);
    const onCountChange = vi.fn();
    render(<AttachmentsTab {...baseProps} onCountChange={onCountChange} />);
    expect(onCountChange).toHaveBeenLastCalledWith(expected);
  });

  it('does not report any count while the list is loading', () => {
    Object.assign(hookState, { count: 1, loading: true, items: [{ id: '1', name: 'a.pdf' }] });
    const onCountChange = vi.fn();
    render(<AttachmentsTab {...baseProps} onCountChange={onCountChange} />);
    expect(onCountChange).not.toHaveBeenCalled();
  });

  it('asks the hook to prefetch the count only when onCountChange is passed', () => {
    const { unmount } = render(<AttachmentsTab {...baseProps} onCountChange={vi.fn()} />);
    expect(hookCalls.at(-1).prefetchCount).toBe(true);
    unmount();

    render(<AttachmentsTab {...baseProps} />);
    expect(hookCalls.at(-1).prefetchCount).toBe(false);
  });
});

// ETP-5526 — the one intentional behaviour change of this ticket: a processed /
// completed document no longer blocks attachment work. `isDocumentReadOnly` (the
// generic lock DetailView wires from the document's own state) used to suppress
// delete AND disable the dropzone; it now does neither. These cases are the
// product decision, not an accident — if they start failing because delete or
// upload is blocked again, someone re-wired that flag and reverted it.
describe('AttachmentsTab — a processed document allows attachment work (ETP-5526)', () => {
  beforeEach(() => {
    hookState.items = [{ id: '1', name: 'first.pdf', size: 100 }];
  });

  it('leaves the upload dropzone enabled when isDocumentReadOnly is true', () => {
    render(<AttachmentsTab {...baseProps} isDocumentReadOnly />);
    expect(screen.getByTestId('attachments-dropzone').querySelector('[disabled]')).toBeFalsy();
  });

  it('keeps the per-row delete when isDocumentReadOnly is true', () => {
    render(<AttachmentsTab {...baseProps} isDocumentReadOnly />);
    expect(screen.getByTestId('attachment-delete-1')).toBeInTheDocument();
  });

  it('keeps the selection bar delete when isDocumentReadOnly is true', () => {
    render(<AttachmentsTab {...baseProps} isDocumentReadOnly />);

    fireEvent.click(within(screen.getByTestId('attachment-row-1')).getByRole('checkbox'));

    expect(screen.getByTestId('attachments-delete-selected')).toBeInTheDocument();
  });

  it('still disables the dropzone while the header is being force-saved or has no id', () => {
    // The two mechanical blockers that survive: they are not read-only rules.
    render(<AttachmentsTab {...baseProps} recordId={null} />);
    expect(screen.getByTestId('attachments-dropzone').querySelector('[disabled]')).toBeTruthy();
  });
});

// ETP-5432 — the bespoke `readOnly` prop, passed by FmModel303Page/FmModel349Page as
// `readOnly={status !== 'draft'}`, is UNCHANGED by ETP-5526 and must stay so. It hides
// every delete affordance and deliberately does not touch upload. This regression
// already shipped once (a develop merge dropped the prop and both fiscal pages silently
// stopped blocking anything), which is why it is pinned from both directions.
describe('AttachmentsTab — the fiscal readOnly prop still blocks delete (ETP-5432)', () => {
  beforeEach(() => {
    hookState.items = [{ id: '1', name: 'first.pdf', size: 100 }];
  });

  it('hides the per-row delete when readOnly=true', () => {
    render(<AttachmentsTab {...baseProps} readOnly />);
    expect(screen.queryByTestId('attachment-delete-1')).not.toBeInTheDocument();
  });

  it('hides the selection bar delete when readOnly=true, but keeps its download', () => {
    render(<AttachmentsTab {...baseProps} readOnly />);

    fireEvent.click(within(screen.getByTestId('attachment-row-1')).getByRole('checkbox'));

    expect(screen.getByTestId('attachments-selection-bar')).toBeInTheDocument();
    expect(screen.queryByTestId('attachments-delete-selected')).not.toBeInTheDocument();
    expect(screen.getByTestId('attachments-download-selected')).toBeInTheDocument();
  });

  it('keeps blocking delete when readOnly=true even though isDocumentReadOnly is false', () => {
    render(<AttachmentsTab {...baseProps} readOnly isDocumentReadOnly={false} />);
    expect(screen.queryByTestId('attachment-delete-1')).not.toBeInTheDocument();
  });

  it('does NOT disable the upload dropzone when readOnly=true (delete-only by contract)', () => {
    render(<AttachmentsTab {...baseProps} readOnly />);
    expect(screen.getByTestId('attachments-dropzone').querySelector('[disabled]')).toBeFalsy();
  });

  it('regression: shows the per-row delete when readOnly is false/absent', () => {
    render(<AttachmentsTab {...baseProps} readOnly={false} />);
    expect(screen.getByTestId('attachment-delete-1')).toBeInTheDocument();
  });
});

// ETP-5526 — the selection bar is the whole point of the ticket: the checkboxes
// used to be inert (they tinted the row and nothing consumed the state).
describe('AttachmentsTab — selection bar (ETP-5526)', () => {
  beforeEach(() => {
    hookState.items = [
      { id: '1', name: 'first.pdf', size: 100 },
      { id: '2', name: 'second.pdf', size: 200 },
    ];
  });

  const tickRow = (id) =>
    fireEvent.click(within(screen.getByTestId(`attachment-row-${id}`)).getByRole('checkbox'));

  it('stays hidden until something is selected, and reports the count', () => {
    render(<AttachmentsTab {...baseProps} />);
    expect(screen.queryByTestId('attachments-selection-bar')).not.toBeInTheDocument();

    tickRow('1');

    expect(screen.getByTestId('attachments-selection-bar')).toBeInTheDocument();
    // Reuses the app-wide `selected` key ("{count} Seleccionados"), not a new one.
    expect(screen.getByTestId('attachments-selection-count')).toHaveTextContent('selected:1');

    tickRow('2');
    expect(screen.getByTestId('attachments-selection-count')).toHaveTextContent('selected:2');
  });

  it('zips only the ticked rows', () => {
    render(<AttachmentsTab {...baseProps} />);

    tickRow('2');
    fireEvent.click(screen.getByTestId('attachments-download-selected'));

    expect(hookState.downloadSelection).toHaveBeenCalledWith(['2']);
  });

  it('confirms before deleting, then removes exactly the selection', async () => {
    const user = userEvent.setup();
    render(<AttachmentsTab {...baseProps} />);

    tickRow('1');
    tickRow('2');
    await user.click(screen.getByTestId('attachments-delete-selected'));

    // The bar never deletes directly — the confirmation the old "Eliminar todo"
    // control had is still in the way.
    expect(hookState.removeMany).not.toHaveBeenCalled();

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByTestId('confirm-delete-confirm'));

    expect(hookState.removeMany).toHaveBeenCalledWith(['1', '2']);
  });

  it('dismisses itself when the selection is cleared from the bar', () => {
    render(<AttachmentsTab {...baseProps} />);

    tickRow('1');
    fireEvent.click(screen.getByTestId('SelectionToolbar__close'));

    expect(screen.queryByTestId('attachments-selection-bar')).not.toBeInTheDocument();
  });

  it('drops the selection when the tab moves to another record', () => {
    const { rerender } = render(<AttachmentsTab {...baseProps} />);

    tickRow('1');
    expect(screen.getByTestId('attachments-selection-bar')).toBeInTheDocument();

    rerender(<AttachmentsTab {...baseProps} recordId="REC-2" />);

    expect(screen.queryByTestId('attachments-selection-bar')).not.toBeInTheDocument();
  });
});
