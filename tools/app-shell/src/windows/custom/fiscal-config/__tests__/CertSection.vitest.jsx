// @covers tools/app-shell/src/windows/custom/fiscal-config/CertSection.jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// --- Mocks ----------------------------------------------------------------

// Interpolation params are appended so a test can see the formatted date inside a message.
const stableUi = (key, params) => (params ? `${key} ${Object.values(params).join(' ')}` : key);
// `localeState.value` is the UI locale; es_ES unless a test switches it.
const localeState = vi.hoisted(() => ({ value: 'es_ES' }));
vi.mock('@/i18n', () => ({
  useUI: () => stableUi,
  useLocaleSwitch: () => ({ locale: localeState.value }),
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, variant, size, ...rest }) => (
    <button onClick={onClick} {...rest}>{children}</button>
  ),
}));

vi.mock('@/components/related-documents/helpers.js', () => ({
  neoBase: (url) => url ?? '',
}));

const mockApiFetch = vi.fn();

vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: vi.fn(() => mockApiFetch),
}));

vi.mock('../CertModal.jsx', () => ({
  default: ({ onClose, onUpload }) => (
    <div data-testid="cert-modal">
      <button onClick={onClose}>close-modal</button>
      <button onClick={() => onUpload({ name: 'cert.pfx', validTo: '2026-01-01' })}>upload-modal</button>
    </div>
  ),
}));

vi.mock('lucide-react', () => ({
  FileText: () => <svg data-testid="icon-file-text" />,
  Upload: () => <svg data-testid="icon-upload" />,
}));

// --- Import under test ----------------------------------------------------

import CertSection from '../CertSection.jsx';
import { useApiFetch } from '@/auth/useApiFetch.js';

// --- Helpers --------------------------------------------------------------

const BASE_PROPS = {
  context: 'sii',
  orgId: 'org-1',
  apiBaseUrl: '/api',
};

function makeJsonResponse(data) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(data),
  });
}

// --- Tests ----------------------------------------------------------------

describe('CertSection — no cert loaded (exists: false)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiFetch.mockResolvedValue(makeJsonResponse({ exists: false }));
    vi.mocked(useApiFetch).mockReturnValue(mockApiFetch);
  });

  it('renders the upload dropzone when no cert exists', async () => {
    render(<CertSection {...BASE_PROPS} />);
    await waitFor(() => {
      expect(screen.getByText('fiscal.cert.dropzone.drag')).toBeInTheDocument();
    });
  });

  it('renders the formats hint text', async () => {
    render(<CertSection {...BASE_PROPS} />);
    await waitFor(() => {
      expect(screen.getByText('fiscal.cert.dropzone.formats')).toBeInTheDocument();
    });
  });

  it('renders the Upload icon in the dropzone', async () => {
    render(<CertSection {...BASE_PROPS} />);
    await waitFor(() => {
      expect(screen.getByTestId('icon-upload')).toBeInTheDocument();
    });
  });

  it('opens CertModal when the dropzone is clicked', async () => {
    render(<CertSection {...BASE_PROPS} />);
    await waitFor(() => {
      expect(screen.getByText('fiscal.cert.dropzone.drag')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('fiscal.cert.dropzone.drag'));
    expect(screen.getByTestId('cert-modal')).toBeInTheDocument();
  });

  it('sets drag state (border changes) on dragOver', async () => {
    render(<CertSection {...BASE_PROPS} />);
    await waitFor(() => {
      expect(screen.getByText('fiscal.cert.dropzone.drag')).toBeInTheDocument();
    });
    // dragOver triggers drag=true → border-foreground class
    const dropzone = screen.getByText('fiscal.cert.dropzone.drag').closest('div[class*="rounded-xl"]');
    fireEvent.dragOver(dropzone);
    expect(dropzone.className).toContain('border-foreground');
  });

  it('clears drag state on dragLeave', async () => {
    render(<CertSection {...BASE_PROPS} />);
    await waitFor(() => {
      expect(screen.getByText('fiscal.cert.dropzone.drag')).toBeInTheDocument();
    });
    const dropzone = screen.getByText('fiscal.cert.dropzone.drag').closest('div[class*="rounded-xl"]');
    fireEvent.dragOver(dropzone);
    fireEvent.dragLeave(dropzone);
    // bg-muted/40 is only added in drag state; hover:bg-muted/20 is different
    expect(dropzone.className).not.toContain('bg-muted/40');
  });

  it('opens CertModal on drop', async () => {
    render(<CertSection {...BASE_PROPS} />);
    await waitFor(() => {
      expect(screen.getByText('fiscal.cert.dropzone.drag')).toBeInTheDocument();
    });
    const dropzone = screen.getByText('fiscal.cert.dropzone.drag').closest('div[class*="rounded-xl"]');
    fireEvent.drop(dropzone);
    expect(screen.getByTestId('cert-modal')).toBeInTheDocument();
  });
});

describe('CertSection — cert loaded (exists: true)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiFetch.mockResolvedValue(makeJsonResponse({ exists: true, validTo: '2025-12-31' }));
    vi.mocked(useApiFetch).mockReturnValue(mockApiFetch);
  });

  it('renders cert info row when API returns { exists: true }', async () => {
    render(<CertSection {...BASE_PROPS} />);
    await waitFor(() => {
      expect(screen.getByText('fiscal.cert.loaded')).toBeInTheDocument();
    });
  });

  it('renders the valid-until date', async () => {
    render(<CertSection {...BASE_PROPS} />);
    await waitFor(() => {
      expect(screen.getByText('fiscal.cert.validUntil 31/12/2025')).toBeInTheDocument();
    });
  });

  it('renders the FileText icon when cert is loaded', async () => {
    render(<CertSection {...BASE_PROPS} />);
    await waitFor(() => {
      expect(screen.getByTestId('icon-file-text')).toBeInTheDocument();
    });
  });

  it('renders the Replace button', async () => {
    render(<CertSection {...BASE_PROPS} />);
    await waitFor(() => {
      expect(screen.getByText('fiscal.cert.replace')).toBeInTheDocument();
    });
  });

  it('opens CertModal when Replace button is clicked', async () => {
    render(<CertSection {...BASE_PROPS} />);
    await waitFor(() => {
      expect(screen.getByText('fiscal.cert.replace')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('fiscal.cert.replace'));
    expect(screen.getByTestId('cert-modal')).toBeInTheDocument();
  });

  it('closes the modal when onClose is called from CertModal', async () => {
    render(<CertSection {...BASE_PROPS} />);
    await waitFor(() => {
      expect(screen.getByText('fiscal.cert.replace')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('fiscal.cert.replace'));
    expect(screen.getByTestId('cert-modal')).toBeInTheDocument();
    fireEvent.click(screen.getByText('close-modal'));
    expect(screen.queryByTestId('cert-modal')).not.toBeInTheDocument();
  });
});

describe('CertSection — skips API call when orgId or apiBaseUrl is null', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiFetch.mockResolvedValue(makeJsonResponse({ exists: true, validTo: '2025-12-31' }));
    vi.mocked(useApiFetch).mockReturnValue(mockApiFetch);
  });

  it('does not call the API when orgId is null', () => {
    render(<CertSection {...BASE_PROPS} orgId={null} />);
    // The useEffect guard skips the call synchronously based on the null check
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('does not call the API when apiBaseUrl is null', () => {
    render(<CertSection {...BASE_PROPS} apiBaseUrl={null} />);
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('renders the dropzone (no cert) when orgId is null', () => {
    render(<CertSection {...BASE_PROPS} orgId={null} />);
    expect(screen.getByText('fiscal.cert.dropzone.drag')).toBeInTheDocument();
  });
});

describe('CertSection — modal upload flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiFetch.mockResolvedValue(makeJsonResponse({ exists: false }));
    vi.mocked(useApiFetch).mockReturnValue(mockApiFetch);
  });

  it('switches to cert info view after successful upload from CertModal', async () => {
    render(<CertSection {...BASE_PROPS} />);
    await waitFor(() => {
      expect(screen.getByText('fiscal.cert.dropzone.drag')).toBeInTheDocument();
    });
    // Click dropzone to open modal
    fireEvent.click(screen.getByText('fiscal.cert.dropzone.drag'));
    // Simulate upload from modal
    fireEvent.click(screen.getByText('upload-modal'));
    // Now cert info row should appear
    await waitFor(() => {
      expect(screen.getByText('fiscal.cert.replace')).toBeInTheDocument();
    });
  });
});

// ETP-5831 — one certificate per organization, shown in the SII, TicketBAI and VERI*FACTU
// sections: a replacement from one section is reported upwards and re-read by the others.
describe('CertSection — shared certificate (ETP-5831)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useApiFetch).mockReturnValue(mockApiFetch);
  });

  it('reports a replacement through onUploaded', async () => {
    mockApiFetch.mockResolvedValue(makeJsonResponse({ exists: true, validTo: '2027-07-01' }));
    const onUploaded = vi.fn();
    render(<CertSection {...BASE_PROPS} onUploaded={onUploaded} />);
    fireEvent.click(await screen.findByText('fiscal.cert.replace'));
    fireEvent.click(screen.getByText('upload-modal'));
    expect(onUploaded).toHaveBeenCalledWith({ name: 'cert.pfx', validTo: '2026-01-01' });
  });

  it('re-reads the certificate when refreshKey changes', async () => {
    mockApiFetch.mockResolvedValue(makeJsonResponse({ exists: false }));
    const { rerender } = render(<CertSection {...BASE_PROPS} refreshKey={0} />);
    await screen.findByText('fiscal.cert.dropzone.drag');
    expect(mockApiFetch).toHaveBeenCalledTimes(1);

    mockApiFetch.mockResolvedValue(makeJsonResponse({ exists: true, validTo: '2027-07-01' }));
    rerender(<CertSection {...BASE_PROPS} refreshKey={1} />);
    expect(await screen.findByText('fiscal.cert.replace')).toBeInTheDocument();
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
  });
});

// ETP-6053 — GET /certificate returns validTo as ISO yyyy-MM-dd; the row shows it in the UI
// locale, so 1 July 2027 reads 01/07/2027 (it used to come as dd/MM/yyyy and render 07/01).
describe('CertSection — validity date formatting (ETP-6053)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useApiFetch).mockReturnValue(mockApiFetch);
  });

  it('formats the loaded certificate validTo in the UI locale', async () => {
    mockApiFetch.mockResolvedValue(makeJsonResponse({ exists: true, validTo: '2027-07-01' }));
    render(<CertSection {...BASE_PROPS} />);
    expect(await screen.findByText('fiscal.cert.validUntil 01/07/2027')).toBeInTheDocument();
  });

  it('formats the validTo reported by a fresh upload the same way', async () => {
    mockApiFetch.mockResolvedValue(makeJsonResponse({ exists: true, validTo: '2027-07-01' }));
    render(<CertSection {...BASE_PROPS} />);
    fireEvent.click(await screen.findByText('fiscal.cert.replace'));
    fireEvent.click(screen.getByText('upload-modal'));
    expect(await screen.findByText('fiscal.cert.validUntil 01/01/2026')).toBeInTheDocument();
  });

  // The UI locale is passed through, not pinned to es_ES: en_US reads the same day month-first.
  it('formats validTo month-first for en_US', async () => {
    localeState.value = 'en_US';
    try {
      mockApiFetch.mockResolvedValue(makeJsonResponse({ exists: true, validTo: '2027-07-01' }));
      render(<CertSection {...BASE_PROPS} />);
      expect(await screen.findByText('fiscal.cert.validUntil 07/01/2027')).toBeInTheDocument();
    } finally {
      localeState.value = 'es_ES';
    }
  });

  // Accepted behavior: an existing certificate whose date the backend does not report still shows
  // the row, with the empty-date dash instead of a blank or "Invalid Date".
  it.each([
    ['no validTo', { exists: true }],
    ['an empty validTo', { exists: true, validTo: '' }],
  ])('renders "valid until —" for an existing certificate with %s', async (_label, payload) => {
    mockApiFetch.mockResolvedValue(makeJsonResponse(payload));
    render(<CertSection {...BASE_PROPS} />);
    expect(await screen.findByText('fiscal.cert.validUntil —')).toBeInTheDocument();
    expect(screen.getByText('fiscal.cert.loaded')).toBeInTheDocument();
  });
});
