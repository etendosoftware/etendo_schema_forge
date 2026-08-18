// Vitest render + behavior tests for ChangeSifDialog (ETP-4785 "Change SIF").
// Verifies the deactivation contract: PUT { active: false } (NOT delete),
// per-profile sequential PUTs (sii+tbai → two), noRecordId error, and the
// partial-failure surface (fiscal.changeSif.err.partial) with no rollback.

// --- Mocks (before imports) -----------------------------------------------

// i18n: return the key, but support the interpolation call shape used for the
// partial-failure message so we can assert the deactivated systems are listed.
vi.mock('@/i18n', () => ({
  useUI: () => (key, vars) =>
    vars ? `${key}|${JSON.stringify(vars)}` : key,
}));

const apiFetchSpy = vi.fn();
vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: () => apiFetchSpy,
}));

vi.mock('@/components/related-documents/helpers.js', () => ({
  neoBase: (u) => u ?? '',
}));

// Render the shadcn Dialog primitives inline (no portal / a11y machinery).
vi.mock('@/components/ui/dialog.jsx', () => ({
  Dialog: ({ children, open }) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children, ...rest }) => <div {...rest}>{children}</div>,
  DialogDescription: ({ children, ...rest }) => <p {...rest}>{children}</p>,
  DialogFooter: ({ children }) => <div>{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children, ...rest }) => <h2 {...rest}>{children}</h2>,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, ...rest }) => (
    <button onClick={onClick} disabled={disabled} {...rest}>{children}</button>
  ),
}));

vi.mock('lucide-react', () => ({
  AlertTriangle: (props) => <svg {...props} />,
  Loader2: (props) => <svg {...props} />,
}));

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ChangeSifDialog from '../ChangeSifDialog.jsx';

// --- Helpers --------------------------------------------------------------

function okResponse() {
  return Promise.resolve({ ok: true, text: () => Promise.resolve('') });
}
function failResponse(status = 500, statusText = 'Server Error') {
  return Promise.resolve({
    ok: false,
    status,
    statusText,
    text: () => Promise.resolve(statusText),
  });
}

const BASE_PROPS = {
  open: true,
  onOpenChange: vi.fn(),
  apiBaseUrl: '/sws/neo',
  onChanged: vi.fn(),
};

function renderDialog(props = {}) {
  return render(<ChangeSifDialog {...BASE_PROPS} {...props} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  apiFetchSpy.mockImplementation(() => okResponse());
});

// --- Tests ----------------------------------------------------------------

describe('ChangeSifDialog — rendering', () => {
  it('renders title, description and confirm/cancel actions when open', () => {
    renderDialog({ profile: 'sii', records: { sii: { id: 'sii-1' } } });
    expect(screen.getByTestId('ChangeSifDialog__title')).toBeInTheDocument();
    expect(screen.getByTestId('ChangeSifDialog__description')).toBeInTheDocument();
    expect(screen.getByTestId('ChangeSifDialog__confirm')).toBeInTheDocument();
    expect(screen.getByTestId('ChangeSifDialog__cancel')).toBeInTheDocument();
  });

  it('renders nothing when open is false', () => {
    renderDialog({ open: false, profile: 'sii', records: { sii: { id: 'sii-1' } } });
    expect(screen.queryByTestId('ChangeSifDialog__title')).not.toBeInTheDocument();
  });

  it('shows the per-SIF permanence notice for a profile that has one', () => {
    renderDialog({ profile: 'verifactu', records: { verifactu: { id: 'vf-1' } } });
    const notice = screen.getByTestId('ChangeSifDialog__notice');
    expect(notice).toBeInTheDocument();
    expect(screen.getByText('fiscal.changeSif.notice.verifactu')).toBeInTheDocument();
  });
});

describe('ChangeSifDialog — confirm deactivates via PUT { active: false }', () => {
  it('PUTs { active: false } to the SII endpoint (not a DELETE)', async () => {
    renderDialog({ profile: 'sii', records: { sii: { id: 'sii-1' } } });

    fireEvent.click(screen.getByTestId('ChangeSifDialog__confirm'));

    await waitFor(() => expect(apiFetchSpy).toHaveBeenCalledTimes(1));
    const [path, opts] = apiFetchSpy.mock.calls[0];
    expect(path).toBe('/sii-config/siiConfiguration/sii-1');
    expect(opts.method).toBe('PUT');
    expect(opts.method).not.toBe('DELETE');
    expect(JSON.parse(opts.body)).toEqual({ active: false });
  });

  it('PUTs to the TBAI endpoint for a tbai profile', async () => {
    renderDialog({ profile: 'tbai', records: { tbai: { id: 'tbai-1' } } });
    fireEvent.click(screen.getByTestId('ChangeSifDialog__confirm'));
    await waitFor(() => expect(apiFetchSpy).toHaveBeenCalledTimes(1));
    const [path, opts] = apiFetchSpy.mock.calls[0];
    expect(path).toBe('/tbai-config/header/tbai-1');
    expect(opts.method).toBe('PUT');
  });

  it('PUTs to the Verifactu endpoint (URL-encoded entity) for a verifactu profile', async () => {
    renderDialog({ profile: 'verifactu', records: { verifactu: { id: 'vf-1' } } });
    fireEvent.click(screen.getByTestId('ChangeSifDialog__confirm'));
    await waitFor(() => expect(apiFetchSpy).toHaveBeenCalledTimes(1));
    const [path, opts] = apiFetchSpy.mock.calls[0];
    // entity is encodeURIComponent('cabeceraDeConfiguraciónVerifactu')
    expect(path).toBe(`/verifactu-config/${encodeURIComponent('cabeceraDeConfiguraciónVerifactu')}/vf-1`);
    expect(opts.method).toBe('PUT');
  });

  it('calls onChanged and closes the dialog after a successful deactivation', async () => {
    const onChanged = vi.fn();
    const onOpenChange = vi.fn();
    renderDialog({
      profile: 'sii',
      records: { sii: { id: 'sii-1' } },
      onChanged,
      onOpenChange,
    });
    fireEvent.click(screen.getByTestId('ChangeSifDialog__confirm'));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('never issues a DELETE for any confirm path', async () => {
    renderDialog({ profile: 'sii+tbai', records: { sii: { id: 'sii-1' }, tbai: { id: 'tbai-1' } } });
    fireEvent.click(screen.getByTestId('ChangeSifDialog__confirm'));
    await waitFor(() => expect(apiFetchSpy).toHaveBeenCalledTimes(2));
    for (const [, opts] of apiFetchSpy.mock.calls) {
      expect(opts.method).toBe('PUT');
    }
  });
});

describe('ChangeSifDialog — sii+tbai issues TWO sequential PUTs', () => {
  it('deactivates sii then tbai (both PUT { active: false })', async () => {
    renderDialog({
      profile: 'sii+tbai',
      records: { sii: { id: 'sii-1' }, tbai: { id: 'tbai-1' } },
    });
    fireEvent.click(screen.getByTestId('ChangeSifDialog__confirm'));

    await waitFor(() => expect(apiFetchSpy).toHaveBeenCalledTimes(2));

    const [firstPath, firstOpts] = apiFetchSpy.mock.calls[0];
    const [secondPath, secondOpts] = apiFetchSpy.mock.calls[1];
    expect(firstPath).toBe('/sii-config/siiConfiguration/sii-1');
    expect(secondPath).toBe('/tbai-config/header/tbai-1');
    expect(JSON.parse(firstOpts.body)).toEqual({ active: false });
    expect(JSON.parse(secondOpts.body)).toEqual({ active: false });
  });
});

describe('ChangeSifDialog — noRecordId error path', () => {
  it('surfaces the noRecordId error and does NOT call the API when the record has no id', async () => {
    renderDialog({ profile: 'sii', records: { sii: {} } });
    fireEvent.click(screen.getByTestId('ChangeSifDialog__confirm'));

    await waitFor(() =>
      expect(screen.getByTestId('ChangeSifDialog__error')).toBeInTheDocument(),
    );
    expect(screen.getByText('fiscal.changeSif.err.noRecordId')).toBeInTheDocument();
    expect(apiFetchSpy).not.toHaveBeenCalled();
  });

  it('surfaces the noRecordId error when the system record is missing entirely', async () => {
    renderDialog({ profile: 'tbai', records: {} });
    fireEvent.click(screen.getByTestId('ChangeSifDialog__confirm'));
    await waitFor(() =>
      expect(screen.getByText('fiscal.changeSif.err.noRecordId')).toBeInTheDocument(),
    );
    expect(apiFetchSpy).not.toHaveBeenCalled();
  });
});

describe('ChangeSifDialog — partial failure (sii+tbai, no rollback by design)', () => {
  it('surfaces fiscal.changeSif.err.partial listing SII when the second (tbai) PUT fails', async () => {
    apiFetchSpy
      .mockImplementationOnce(() => okResponse())      // sii → ok
      .mockImplementationOnce(() => failResponse(500)); // tbai → fails

    const onChanged = vi.fn();
    renderDialog({
      profile: 'sii+tbai',
      records: { sii: { id: 'sii-1' }, tbai: { id: 'tbai-1' } },
      onChanged,
    });
    fireEvent.click(screen.getByTestId('ChangeSifDialog__confirm'));

    await waitFor(() =>
      expect(screen.getByTestId('ChangeSifDialog__error')).toBeInTheDocument(),
    );
    const errorText = screen.getByTestId('ChangeSifDialog__error').textContent;
    // Uses the partial-failure key and lists the already-deactivated system.
    expect(errorText).toContain('fiscal.changeSif.err.partial');
    expect(errorText).toContain('SII');
    // No rollback: the first (sii) PUT already ran and is NOT re-issued.
    expect(apiFetchSpy).toHaveBeenCalledTimes(2);
    // onChanged must NOT fire on a failed change.
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('shows the raw error (not the partial key) when the FIRST PUT fails', async () => {
    apiFetchSpy.mockImplementationOnce(() => failResponse(500, 'boom'));
    renderDialog({
      profile: 'sii+tbai',
      records: { sii: { id: 'sii-1' }, tbai: { id: 'tbai-1' } },
    });
    fireEvent.click(screen.getByTestId('ChangeSifDialog__confirm'));

    await waitFor(() =>
      expect(screen.getByTestId('ChangeSifDialog__error')).toBeInTheDocument(),
    );
    const errorText = screen.getByTestId('ChangeSifDialog__error').textContent;
    expect(errorText).not.toContain('fiscal.changeSif.err.partial');
    expect(errorText).toContain('boom');
    // Only the first PUT was attempted; the loop stopped before tbai.
    expect(apiFetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe('ChangeSifDialog — cancel', () => {
  it('closes without calling the API when cancel is clicked', () => {
    const onOpenChange = vi.fn();
    renderDialog({ profile: 'sii', records: { sii: { id: 'sii-1' } }, onOpenChange });
    fireEvent.click(screen.getByTestId('ChangeSifDialog__cancel'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(apiFetchSpy).not.toHaveBeenCalled();
  });
});
