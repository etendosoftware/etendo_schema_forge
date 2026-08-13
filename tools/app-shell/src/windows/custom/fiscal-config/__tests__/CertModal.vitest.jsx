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
