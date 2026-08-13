import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// --- Mocks ----------------------------------------------------------------

const stableUi = (key) => key;
vi.mock('@/i18n', () => ({
  useUI: () => stableUi,
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
      expect(screen.getByText('fiscal.cert.validUntil')).toBeInTheDocument();
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
