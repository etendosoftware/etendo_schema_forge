// Vitest render tests for CertModal (replaces source-reading tests)

const stableApiFetch = vi.fn(() => Promise.resolve({ ok: true, json: async () => ({}) }));

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));
vi.mock('@/auth/useApiFetch.js', () => ({ useApiFetch: () => stableApiFetch }));
vi.mock('@/components/related-documents/helpers.js', () => ({ neoBase: (u) => u }));
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, ...rest }) => (
    <button onClick={onClick} disabled={disabled} {...rest}>{children}</button>
  ),
}));
vi.mock('lucide-react', () => ({
  FileText: () => null,
  Upload: () => null,
  Eye: () => null,
  EyeOff: () => null,
  Lock: () => null,
  TriangleAlert: () => null,
  Check: () => null,
  Info: () => null,
}));
vi.mock('../FiscalStepItem.jsx', () => ({
  default: ({ n, label }) => <span data-testid={`step-${n}`}>{label}</span>,
}));

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CertModal from '../CertModal.jsx';

const baseProps = {
  context: 'sii',
  orgId: 'org-1',
  apiBaseUrl: '/sws/neo/fiscal-config',
  onClose: vi.fn(),
  onUpload: vi.fn(),
};

describe('CertModal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders modal title and subtitle', () => {
    render(<CertModal {...baseProps} />);
    expect(screen.getByText('fiscal.cert.modal.title')).toBeInTheDocument();
    expect(screen.getByText('fiscal.cert.subtitle.sii')).toBeInTheDocument();
  });

  it('renders close button with aria-label', () => {
    render(<CertModal {...baseProps} />);
    expect(screen.getByLabelText('fiscal.cert.close')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(<CertModal {...baseProps} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('fiscal.cert.close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(<CertModal {...baseProps} onClose={onClose} />);
    // The outermost div is the backdrop
    const backdrop = container.firstChild;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it('renders stepper with 3 steps', () => {
    render(<CertModal {...baseProps} />);
    expect(screen.getByTestId('step-1')).toBeInTheDocument();
    expect(screen.getByTestId('step-2')).toBeInTheDocument();
    expect(screen.getByTestId('step-3')).toBeInTheDocument();
  });

  it('shows dropzone text in pick step', () => {
    render(<CertModal {...baseProps} />);
    expect(screen.getByText('fiscal.cert.dropzone.drag')).toBeInTheDocument();
    expect(screen.getByText('fiscal.cert.dropzone.formats')).toBeInTheDocument();
  });

  it('shows password label and hint', () => {
    render(<CertModal {...baseProps} />);
    expect(screen.getByText('fiscal.cert.pwd.label')).toBeInTheDocument();
    expect(screen.getByText('fiscal.cert.pwd.hint')).toBeInTheDocument();
  });

  it('verify button is disabled when no file or password', () => {
    render(<CertModal {...baseProps} />);
    const verifyBtn = screen.getByText('fiscal.cert.btn.verify').closest('button');
    expect(verifyBtn).toBeDisabled();
  });

  it('shows password toggle button', () => {
    render(<CertModal {...baseProps} />);
    const toggleBtn = screen.getByLabelText('fiscal.cert.pwd.show');
    expect(toggleBtn).toBeInTheDocument();
  });

  it('renders done step when debugInitialState has step=done', () => {
    render(
      <CertModal
        {...baseProps}
        debugInitialState={{
          step: 'done',
          file: { name: 'cert.p12', size: 1024 },
          certDetails: { subject: 'CN=Test', issuer: 'CN=CA', validFrom: '2025-01-01', validTo: '2026-01-01', algorithm: 'SHA256' },
        }}
      />
    );
    expect(screen.getByText('fiscal.cert.success.title')).toBeInTheDocument();
    expect(screen.getByText('fiscal.cert.btn.use')).toBeInTheDocument();
  });

  it('renders confirmNif step when debugInitialState has step=confirmNif', () => {
    render(
      <CertModal
        {...baseProps}
        debugInitialState={{
          step: 'confirmNif',
          file: { name: 'cert.p12', size: 1024 },
          pendingNif: 'B12345678',
        }}
      />
    );
    expect(screen.getByText('fiscal.cert.nif.warning.title')).toBeInTheDocument();
    expect(screen.getByText('B12345678')).toBeInTheDocument();
  });

  it('renders verify step with progress', () => {
    render(
      <CertModal
        {...baseProps}
        debugInitialState={{ step: 'verify', file: { name: 'cert.p12', size: 1024 } }}
      />
    );
    expect(screen.getByText('fiscal.cert.verifying.title')).toBeInTheDocument();
  });

  it('shows info warning box in pick step', () => {
    render(<CertModal {...baseProps} />);
    expect(screen.getByText('fiscal.cert.info.title')).toBeInTheDocument();
  });
});

// ETP-5338 point 6: the passphrase field was being autofilled by the browser's
// password-manager heuristic, which paired it with the visible "authorizationno"
// field from SiiSection as if it were a username. Fixed with explicit
// id/name/autoComplete on the passphrase input plus a hidden dummy "username"
// input inside its own <form autoComplete="off">.
describe('CertModal — anti-autofill hardening (ETP-5338)', () => {
  it('passphrase input has the expected id, name and autoComplete', () => {
    render(<CertModal {...baseProps} />);
    const passInput = document.getElementById('cert-passphrase');
    expect(passInput).toBeInTheDocument();
    expect(passInput).toHaveAttribute('name', 'cert-passphrase');
    expect(passInput).toHaveAttribute('autoComplete', 'new-password');
  });

  it('renders a hidden dummy username input paired with the passphrase form', () => {
    render(<CertModal {...baseProps} />);
    const dummy = document.querySelector('input[name="username"]');
    expect(dummy).toBeInTheDocument();
    expect(dummy).toHaveAttribute('type', 'text');
    expect(dummy).toHaveAttribute('autoComplete', 'username');
    expect(dummy).toHaveAttribute('readonly');
    expect(dummy.value).toBe('');
    expect(dummy).toHaveStyle({ display: 'none' });
  });

  it('typing into the passphrase field never changes the dummy username value', () => {
    render(<CertModal {...baseProps} />);
    const passInput = document.getElementById('cert-passphrase');
    const dummy = document.querySelector('input[name="username"]');
    fireEvent.change(passInput, { target: { value: 'my-secret-password' } });
    expect(passInput.value).toBe('my-secret-password');
    expect(dummy.value).toBe('');
  });

  it('the passphrase input lives inside its own form with autoComplete off', () => {
    render(<CertModal {...baseProps} />);
    const passInput = document.getElementById('cert-passphrase');
    const form = passInput.closest('form');
    expect(form).toBeInTheDocument();
    expect(form).toHaveAttribute('autoComplete', 'off');
  });

  it('never includes a "username" key in the upload FormData payload', async () => {
    vi.useFakeTimers();
    try {
      stableApiFetch.mockClear();
      stableApiFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ cert: null }) });

      render(<CertModal {...baseProps} />);

      const file = new File(['dummy'], 'cert.p12', { type: 'application/x-pkcs12' });
      const fileInput = screen.getByTestId('cert-file-input');
      fireEvent.change(fileInput, { target: { files: [file] } });

      const passInput = document.getElementById('cert-passphrase');
      fireEvent.change(passInput, { target: { value: 'secret-pass' } });

      const verifyBtn = screen.getByText('fiscal.cert.btn.verify').closest('button');
      fireEvent.click(verifyBtn);

      await vi.advanceTimersByTimeAsync(2000);

      expect(stableApiFetch).toHaveBeenCalledTimes(1);
      const [, options] = stableApiFetch.mock.calls[0];
      const formData = options.body;
      expect(formData instanceof FormData).toBe(true);
      expect(formData.has('username')).toBe(false);
      expect(formData.get('password')).toBe('secret-pass');
    } finally {
      vi.useRealTimers();
    }
  });
});
