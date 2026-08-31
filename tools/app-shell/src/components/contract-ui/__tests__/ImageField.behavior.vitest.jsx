/**
 * Behavioural coverage for ImageField — the sibling ImageField.vitest.jsx only
 * smoke-renders each mode, so the upload pipeline (validation, POST, error
 * toasts), the drag & drop dropzone, the lightbox and the blob lifecycle were
 * never exercised. This file drives those flows.
 */
const toastMocks = vi.hoisted(() => ({ error: vi.fn() }));

// ETP-5022 — ImageField's requests come from `useApiFetch`, which reads the bearer token
// from the session rather than from the `token` prop.
vi.mock('@etendosoftware/app-shell-core/auth', async (importOriginal) => ({
  ...(await importOriginal()),
  useAuthOptional: () => ({ token: 'tk' }),
}));

vi.mock('sonner', () => ({ toast: toastMocks }));
vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));
vi.mock('@/components/ui/custom-icons', () => ({
  TrashIcon: (props) => <span data-testid="trash-icon" {...props} />,
}));

import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { setSessionCredentials, CREDENTIAL_MODES } from '@etendosoftware/app-shell-core/auth/sessionCredentials.js';
import userEvent from '@testing-library/user-event';
import { ImageField } from '../ImageField.jsx';

/** A File whose `type`/`size` drive validateImageFile. */
function makeFile({ name = 'photo.png', type = 'image/png', sizeMb = 1 } = {}) {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: Math.round(sizeMb * 1024 * 1024) });
  return file;
}

/** jsdom never fires load events for images, so decoding is stubbed. */
function stubImageDecoder({ width = 800, height = 600, fail = false } = {}) {
  class FakeImage {
    set src(_value) {
      setTimeout(() => (fail ? this.onerror?.() : this.onload?.()), 0);
    }

    get naturalWidth() { return width; }

    get naturalHeight() { return height; }
  }
  globalThis.Image = FakeImage;
}

function fileInput(container) {
  return container.querySelector('input[type="file"]');
}

const BLOB_URL = 'blob:mock-image';

describe('ImageField — behaviour', () => {
  // ETP-4576 — apiFetch takes the credential from the active scheme, not from an argument,
  // so a test that expects an Authorization header has to declare the scheme first.
  beforeEach(() => setSessionCredentials({ mode: CREDENTIAL_MODES.bearer, token: 'tk' }));

  let createObjectURL;
  let revokeObjectURL;

  beforeEach(() => {
    toastMocks.error.mockReset();
    createObjectURL = vi.fn(() => BLOB_URL);
    revokeObjectURL = vi.fn();
    globalThis.URL.createObjectURL = createObjectURL;
    globalThis.URL.revokeObjectURL = revokeObjectURL;
    stubImageDecoder();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['binary']),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('loading the current image', () => {
    it('fetches the binary from the /image endpoint derived from apiBaseUrl', async () => {
      render(<ImageField imageId="IMG-1" token="tk" apiBaseUrl="/etendo/sws/neo/product" onChange={vi.fn()} />);

      await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
      // `credentials: 'include'` comes from the shared helper now (ETP-5022).
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/etendo/sws/neo/image/IMG-1',
        { credentials: 'include', headers: { Authorization: 'Bearer tk', 'Accept-Language': 'es_ES' } },
      );
      const img = await screen.findByRole('img');
      expect(img).toHaveAttribute('src', BLOB_URL);
    });

    it('falls back to the default /sws/neo/image base when no apiBaseUrl is given', async () => {
      render(<ImageField imageId="IMG-1" token="tk" onChange={vi.fn()} />);
      await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith(
        '/sws/neo/image/IMG-1',
        { credentials: 'include', headers: { Authorization: 'Bearer tk', 'Accept-Language': 'es_ES' } },
      ));
    });

    // ETP-4576 — only the imageId half of this still holds. Without one there is nothing to
    // request; without a token there is, because under the cookie scheme no client ever holds
    // one and gating on it hid every image from every authenticated user.
    it('does not fetch without an imageId, but does fetch without a token', () => {
      const { unmount } = render(<ImageField token="tk" apiBaseUrl="/sws/neo" onChange={vi.fn()} />);
      expect(globalThis.fetch).not.toHaveBeenCalled();
      unmount();

      render(<ImageField imageId="IMG-1" apiBaseUrl="/sws/neo" onChange={vi.fn()} />);
      expect(globalThis.fetch).toHaveBeenCalled();
    });

    it('keeps the placeholder when the image request fails', async () => {
      globalThis.fetch.mockResolvedValue({ ok: false, blob: async () => null });
      render(<ImageField imageId="IMG-1" token="tk" apiBaseUrl="/sws/neo" onChange={vi.fn()} />);

      await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
      expect(screen.queryByRole('img')).not.toBeInTheDocument();
    });

    it('swallows a rejected image request', async () => {
      globalThis.fetch.mockRejectedValue(new Error('offline'));
      render(<ImageField imageId="IMG-1" token="tk" apiBaseUrl="/sws/neo" onChange={vi.fn()} />);

      await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
      expect(screen.queryByRole('img')).not.toBeInTheDocument();
    });

    it('revokes the previous blob URL when the imageId changes', async () => {
      const { rerender } = render(
        <ImageField imageId="IMG-1" token="tk" apiBaseUrl="/sws/neo" onChange={vi.fn()} />,
      );
      await screen.findByRole('img');
      expect(createObjectURL).toHaveBeenCalledTimes(1);

      rerender(<ImageField imageId="IMG-2" token="tk" apiBaseUrl="/sws/neo" onChange={vi.fn()} />);
      await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith(BLOB_URL));
      expect(createObjectURL).toHaveBeenCalledTimes(2);
    });
  });

  describe('upload validation', () => {
    it('rejects a file whose MIME type is not png/jpeg', async () => {
      const onChange = vi.fn();
      const { container } = render(<ImageField token="tk" apiBaseUrl="/sws/neo" onChange={onChange} />);

      fireEvent.change(fileInput(container), {
        target: { files: [makeFile({ name: 'doc.pdf', type: 'application/pdf' })] },
      });

      await waitFor(() => expect(toastMocks.error).toHaveBeenCalledWith('imageInvalidType'));
      // Rejected before any request is made.
      expect(globalThis.fetch).not.toHaveBeenCalled();
      expect(onChange).not.toHaveBeenCalled();
    });

    it('rejects a file above the 30 MB limit', async () => {
      const { container } = render(<ImageField token="tk" apiBaseUrl="/sws/neo" onChange={vi.fn()} />);

      fireEvent.change(fileInput(container), { target: { files: [makeFile({ sizeMb: 31 })] } });

      await waitFor(() => expect(toastMocks.error).toHaveBeenCalledWith('imageTooLarge'));
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('rejects an image beyond the maximum pixel dimensions', async () => {
      stubImageDecoder({ width: 7681, height: 100 });
      const { container } = render(<ImageField token="tk" apiBaseUrl="/sws/neo" onChange={vi.fn()} />);

      fireEvent.change(fileInput(container), { target: { files: [makeFile()] } });

      await waitFor(() => expect(toastMocks.error).toHaveBeenCalledWith('imageTooLargeDimensions'));
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('accepts a file whose dimensions cannot be decoded', async () => {
      stubImageDecoder({ fail: true });
      globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({ imageId: 'NEW-1' }) });
      const onChange = vi.fn();
      const { container } = render(<ImageField token="tk" apiBaseUrl="/sws/neo" onChange={onChange} />);

      fireEvent.change(fileInput(container), { target: { files: [makeFile()] } });

      await waitFor(() => expect(onChange).toHaveBeenCalledWith('NEW-1'));
      expect(toastMocks.error).not.toHaveBeenCalled();
    });

    it('ignores a change event with no selected file', async () => {
      const { container } = render(<ImageField token="tk" apiBaseUrl="/sws/neo" onChange={vi.fn()} />);

      fireEvent.change(fileInput(container), { target: { files: [] } });

      await waitFor(() => expect(toastMocks.error).not.toHaveBeenCalled());
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });
  });

  describe('upload request', () => {
    it('POSTs the base64 payload and reports the new imageId', async () => {
      globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({ imageId: 'NEW-9' }) });
      const onChange = vi.fn();
      const { container } = render(
        <ImageField token="tk" apiBaseUrl="/etendo/sws/neo/product" onChange={onChange} />,
      );

      fireEvent.change(fileInput(container), { target: { files: [makeFile({ name: 'front.png' })] } });

      await waitFor(() => expect(onChange).toHaveBeenCalledWith('NEW-9'));
      const [url, options] = globalThis.fetch.mock.calls.at(-1);
      expect(url).toBe('/etendo/sws/neo/image');
      expect(options.method).toBe('POST');
      expect(options.headers).toEqual({ Authorization: 'Bearer tk', 'Accept-Language': 'es_ES', 'Content-Type': 'application/json' });
      const body = JSON.parse(options.body);
      expect(body.name).toBe('front.png');
      expect(body.mimeType).toBe('image/png');
      // Only the payload survives — the data-URL prefix is stripped.
      expect(body.data).not.toContain('base64,');
      expect(body.data.length).toBeGreaterThan(0);
    });

    it('surfaces the server text when the upload is rejected', async () => {
      globalThis.fetch.mockResolvedValue({ ok: false, status: 413, text: async () => 'payload too large' });
      const onChange = vi.fn();
      const { container } = render(<ImageField token="tk" apiBaseUrl="/sws/neo" onChange={onChange} />);

      fireEvent.change(fileInput(container), { target: { files: [makeFile()] } });

      await waitFor(() => expect(toastMocks.error).toHaveBeenCalledWith('payload too large'));
      expect(onChange).not.toHaveBeenCalled();
    });

    it('falls back to the status code when the error body is empty', async () => {
      globalThis.fetch.mockResolvedValue({ ok: false, status: 500, text: async () => '' });
      const { container } = render(<ImageField token="tk" apiBaseUrl="/sws/neo" onChange={vi.fn()} />);

      fireEvent.change(fileInput(container), { target: { files: [makeFile()] } });

      await waitFor(() => expect(toastMocks.error).toHaveBeenCalledWith('Upload failed (500)'));
    });

    it('errors when the response carries no imageId', async () => {
      globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
      const onChange = vi.fn();
      const { container } = render(<ImageField token="tk" apiBaseUrl="/sws/neo" onChange={onChange} />);

      fireEvent.change(fileInput(container), { target: { files: [makeFile()] } });

      await waitFor(() => expect(toastMocks.error).toHaveBeenCalledWith('No imageId returned from server'));
      expect(onChange).not.toHaveBeenCalled();
    });

    it('shows the spinner while the upload is in flight and clears it afterwards', async () => {
      let release;
      globalThis.fetch.mockImplementation(() => new Promise((resolve) => {
        release = () => resolve({ ok: true, json: async () => ({ imageId: 'NEW-2' }) });
      }));
      const onChange = vi.fn();
      const { container } = render(
        <ImageField token="tk" apiBaseUrl="/sws/neo" onChange={onChange} stretch label="Photo" />,
      );

      fireEvent.change(fileInput(container), { target: { files: [makeFile()] } });

      // The dropzone swaps its icon for the spinner while uploading.
      await waitFor(() => expect(container.querySelector('.animate-spin')).toBeInTheDocument());
      await waitFor(() => expect(typeof release).toBe('function'));
      await act(async () => { release(); });
      await waitFor(() => expect(container.querySelector('.animate-spin')).not.toBeInTheDocument());
      expect(onChange).toHaveBeenCalledWith('NEW-2');
    });
  });

  describe('picker affordances', () => {
    it('opens the file picker when the empty preview is clicked', async () => {
      const user = userEvent.setup();
      const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
      render(<ImageField token="tk" apiBaseUrl="/sws/neo" onChange={vi.fn()} />);

      // The click handler sits on the preview box; clicking its content bubbles up.
      await user.click(screen.getByText('noImage'));
      expect(clickSpy).toHaveBeenCalled();
    });

    it('does not open the file picker in readOnly mode', async () => {
      const user = userEvent.setup();
      const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
      render(<ImageField token="tk" apiBaseUrl="/sws/neo" onChange={vi.fn()} readOnly />);

      await user.click(screen.getByText('noImage'));
      expect(clickSpy).not.toHaveBeenCalled();
    });

    it('opens the file picker from the stretch dropzone', async () => {
      const user = userEvent.setup();
      const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
      render(<ImageField token="tk" apiBaseUrl="/sws/neo" onChange={vi.fn()} stretch />);

      await user.click(screen.getByText('imageDropTitle'));
      expect(clickSpy).toHaveBeenCalled();
    });

    it('does not open the file picker from a readOnly stretch dropzone', async () => {
      const user = userEvent.setup();
      const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
      render(<ImageField token="tk" apiBaseUrl="/sws/neo" onChange={vi.fn()} stretch readOnly />);

      await user.click(screen.getByText('imageDropTitle'));
      expect(clickSpy).not.toHaveBeenCalled();
    });

    it('uses the fieldKey for its test id', () => {
      render(<ImageField token="tk" apiBaseUrl="/sws/neo" onChange={vi.fn()} fieldKey="logo" />);
      expect(screen.getByTestId('field-logo')).toBeInTheDocument();
    });
  });

  describe('remove action', () => {
    it('clears the value from the non-stretch preview', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<ImageField imageId="IMG-1" token="tk" apiBaseUrl="/sws/neo" onChange={onChange} />);

      await screen.findByRole('img');
      await user.click(screen.getByRole('button', { name: 'Remove image' }));
      expect(onChange).toHaveBeenCalledWith('');
    });

    it('clears the value from the stretch preview', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<ImageField imageId="IMG-1" token="tk" apiBaseUrl="/sws/neo" onChange={onChange} stretch label="Photo" />);

      await screen.findByRole('img');
      await user.click(screen.getByRole('button', { name: 'Remove image' }));
      expect(onChange).toHaveBeenCalledWith('');
    });

    it('hides the remove and upload affordances when readOnly', async () => {
      render(<ImageField imageId="IMG-1" token="tk" apiBaseUrl="/sws/neo" onChange={vi.fn()} readOnly stretch />);

      await screen.findByRole('img');
      expect(screen.queryByRole('button', { name: 'Remove image' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'uploadImage' })).not.toBeInTheDocument();
    });

    it('replaces an existing image from the non-stretch overlay without opening the lightbox', async () => {
      const user = userEvent.setup();
      const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
      render(<ImageField imageId="IMG-1" token="tk" apiBaseUrl="/sws/neo" onChange={vi.fn()} />);

      await screen.findByRole('img');
      await user.click(screen.getByRole('button', { name: /uploadImage/ }));

      expect(clickSpy).toHaveBeenCalled();
      // The overlay button stops propagation, so the zoom overlay stays closed.
      expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
    });

    it('offers the upload button next to an existing image in stretch mode', async () => {
      const user = userEvent.setup();
      const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
      render(<ImageField imageId="IMG-1" token="tk" apiBaseUrl="/sws/neo" onChange={vi.fn()} stretch />);

      await screen.findByRole('img');
      await user.click(screen.getByRole('button', { name: 'uploadImage' }));
      expect(clickSpy).toHaveBeenCalled();
    });
  });

  describe('lightbox', () => {
    it('opens on preview click and closes with Escape', async () => {
      const user = userEvent.setup();
      render(<ImageField imageId="IMG-1" token="tk" apiBaseUrl="/sws/neo" onChange={vi.fn()} />);

      await screen.findByRole('img');
      await user.click(screen.getByRole('img'));
      expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();

      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument());
    });

    it('closes when the close button is used', async () => {
      const user = userEvent.setup();
      render(<ImageField imageId="IMG-1" token="tk" apiBaseUrl="/sws/neo" onChange={vi.fn()} />);

      await screen.findByRole('img');
      await user.click(screen.getByRole('img'));
      await user.click(screen.getByRole('button', { name: 'Close' }));
      expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
    });

    it('stays open when the enlarged image itself is clicked', async () => {
      const user = userEvent.setup();
      render(<ImageField imageId="IMG-1" token="tk" apiBaseUrl="/sws/neo" onChange={vi.fn()} />);

      await screen.findByRole('img');
      await user.click(screen.getByRole('img'));
      const enlarged = screen.getAllByRole('img').at(-1);
      await user.click(enlarged);
      // The click does not bubble to the backdrop, so the overlay survives.
      expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    });

    it('opens from the stretch preview too', async () => {
      const user = userEvent.setup();
      render(<ImageField imageId="IMG-1" token="tk" apiBaseUrl="/sws/neo" onChange={vi.fn()} stretch />);

      await screen.findByRole('img');
      await user.click(screen.getByRole('img'));
      expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    });

    it('ignores non-Escape keys while open', async () => {
      const user = userEvent.setup();
      render(<ImageField imageId="IMG-1" token="tk" apiBaseUrl="/sws/neo" onChange={vi.fn()} />);

      await screen.findByRole('img');
      await user.click(screen.getByRole('img'));
      await user.keyboard('{Enter}');
      expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    });
  });

  describe('drag & drop (stretch empty state)', () => {
    it('uploads the dropped file', async () => {
      globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({ imageId: 'DROP-1' }) });
      const onChange = vi.fn();
      const { container } = render(
        <ImageField token="tk" apiBaseUrl="/sws/neo" onChange={onChange} stretch label="Photo" />,
      );
      const zone = screen.getByText('imageDropTitle').closest('div[class*="border-dashed"]')
        ?? container.querySelector('[class*="border-dashed"]');

      fireEvent.dragEnter(zone, { dataTransfer: { files: [makeFile()] } });
      fireEvent.dragOver(zone, { dataTransfer: { files: [makeFile()] } });
      fireEvent.drop(zone, { dataTransfer: { files: [makeFile({ name: 'dropped.png' })] } });

      await waitFor(() => expect(onChange).toHaveBeenCalledWith('DROP-1'));
      expect(JSON.parse(globalThis.fetch.mock.calls.at(-1)[1].body).name).toBe('dropped.png');
    });

    it('highlights on drag enter and clears on drag leave', () => {
      const { container } = render(
        <ImageField token="tk" apiBaseUrl="/sws/neo" onChange={vi.fn()} stretch />,
      );
      const zone = container.querySelector('[class*="border-dashed"]');

      fireEvent.dragEnter(zone);
      expect(zone.className).toContain('bg-[hsl(var(--muted))]');

      fireEvent.dragLeave(zone);
      expect(zone.className).not.toContain('bg-[hsl(var(--muted))]');
    });

    it('does not highlight or upload when readOnly', async () => {
      const { container } = render(
        <ImageField token="tk" apiBaseUrl="/sws/neo" onChange={vi.fn()} stretch readOnly />,
      );
      const zone = container.querySelector('[class*="border-dashed"]');

      fireEvent.dragEnter(zone);
      expect(zone.className).not.toContain('bg-[hsl(var(--muted))]');

      fireEvent.drop(zone, { dataTransfer: { files: [makeFile()] } });
      await waitFor(() => expect(globalThis.fetch).not.toHaveBeenCalled());
    });

    it('ignores a drop with no files', async () => {
      const { container } = render(
        <ImageField token="tk" apiBaseUrl="/sws/neo" onChange={vi.fn()} stretch />,
      );
      const zone = container.querySelector('[class*="border-dashed"]');

      fireEvent.drop(zone, { dataTransfer: { files: [] } });
      await waitFor(() => expect(globalThis.fetch).not.toHaveBeenCalled());
    });
  });

  describe('empty / loading placeholders', () => {
    it('shows the no-image label when there is nothing to load', () => {
      render(<ImageField token="tk" apiBaseUrl="/sws/neo" onChange={vi.fn()} />);
      expect(screen.getByText('noImage')).toBeInTheDocument();
      expect(screen.getByText('uploadImage')).toBeInTheDocument();
    });

    it('hides the upload hint when readOnly', () => {
      render(<ImageField token="tk" apiBaseUrl="/sws/neo" onChange={vi.fn()} readOnly />);
      expect(screen.getByText('noImage')).toBeInTheDocument();
      expect(screen.queryByText('uploadImage')).not.toBeInTheDocument();
    });

    it('renders the dropzone copy in stretch mode', () => {
      render(<ImageField token="tk" apiBaseUrl="/sws/neo" onChange={vi.fn()} stretch label="Photo" />);
      expect(screen.getByText('imageDropTitle')).toBeInTheDocument();
      expect(screen.getByText('imageDropSubtitle')).toBeInTheDocument();
      expect(screen.getByText('Photo')).toBeInTheDocument();
    });

    // BUG (reported, not fixed here): the unmount cleanup in ImageField.jsx
    //
    //   useEffect(() => () => { if (blobUrl) URL.revokeObjectURL(blobUrl); }, []);
    //
    // has an EMPTY dependency array, so its closure captures the first-render
    // `blobUrl` — which is always `null`. The object URL created once the binary
    // arrives is therefore never released when the field unmounts (it IS released
    // when `imageId` changes, see the test above). Un-skip once the deps are fixed.
    it.skip('releases the blob URL on unmount', async () => {
      const { unmount } = render(
        <ImageField imageId="IMG-1" token="tk" apiBaseUrl="/sws/neo" onChange={vi.fn()} />,
      );
      await screen.findByRole('img');
      revokeObjectURL.mockClear();

      unmount();
      expect(revokeObjectURL).toHaveBeenCalledWith(BLOB_URL);
    });
  });
});
