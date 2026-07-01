// Vitest render tests for ContactDetailModal

const stableApiFetch = vi.fn(() => Promise.resolve({
  ok: true,
  json: async () => ({ response: { data: [{ id: 'bp1', name: 'Test BP', taxID: 'B123', oBTIKTaxIDKey: '' }] } }),
}));

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));
vi.mock('@/auth/useApiFetch.js', () => ({ useApiFetch: () => stableApiFetch }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('lucide-react', () => ({
  X: () => <span data-testid="icon-x">X</span>,
  Loader2: ({ className }) => <span data-testid="loader" className={className} />,
  MapPin: () => <span data-testid="icon-map" />,
  ChevronDown: () => <span data-testid="icon-chevron" />,
  Check: () => <span data-testid="icon-check" />,
}));
vi.mock('@/windows/custom/shared/LocationEditorModal.jsx', () => ({
  default: () => <div data-testid="location-editor-modal" />,
}));

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ContactDetailModal from '../ContactDetailModal.jsx';

const baseProps = {
  open: true,
  onClose: vi.fn(),
  bpId: 'bp-1',
  contactsApiBase: '/sws/neo/contacts',
};

describe('ContactDetailModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stableApiFetch.mockImplementation((url) => {
      if (url.includes('/businessPartner/selectors')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ items: [{ id: 'key1', label: 'NIF' }] }),
        });
      }
      if (url.includes('/locationAddress')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ response: { data: [{ id: 'loc1', address: '123 St', city: 'Madrid', 'country$_identifier': 'Spain' }] } }),
        });
      }
      if (url.includes('/businessPartner/')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ response: { data: [{ id: 'bp1', name: 'Test BP', taxID: 'B12345678', oBTIKTaxIDKey: 'key1' }] } }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
  });

  it('returns null when open is false', () => {
    const { container } = render(<ContactDetailModal {...baseProps} open={false} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders modal title when open', async () => {
    render(<ContactDetailModal {...baseProps} />);
    await waitFor(() => {
      expect(screen.getByText('contactDetail.title')).toBeInTheDocument();
    });
  });

  it('shows close button', async () => {
    render(<ContactDetailModal {...baseProps} />);
    await waitFor(() => {
      expect(screen.getByLabelText('close')).toBeInTheDocument();
    });
  });

  it('calls onClose when close button is clicked', async () => {
    const onClose = vi.fn();
    render(<ContactDetailModal {...baseProps} onClose={onClose} />);
    await waitFor(() => {
      expect(screen.getByLabelText('close')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByLabelText('close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when backdrop is clicked', async () => {
    const onClose = vi.fn();
    render(<ContactDetailModal {...baseProps} onClose={onClose} />);
    await waitFor(() => {
      expect(screen.getByTestId('contact-detail-backdrop')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('contact-detail-backdrop'));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows field labels after loading', async () => {
    render(<ContactDetailModal {...baseProps} />);
    await waitFor(() => {
      expect(screen.getByText('contactDetail.name')).toBeInTheDocument();
      expect(screen.getByText('contactDetail.taxID')).toBeInTheDocument();
      expect(screen.getByText('contactDetail.location')).toBeInTheDocument();
    });
  });

  it('shows save and cancel buttons after loading', async () => {
    render(<ContactDetailModal {...baseProps} />);
    await waitFor(() => {
      expect(screen.getByText('save')).toBeInTheDocument();
      expect(screen.getByText('cancel')).toBeInTheDocument();
    });
  });

  it('displays name from fetched BP data', async () => {
    render(<ContactDetailModal {...baseProps} />);
    await waitFor(() => {
      expect(screen.getByText('Test BP')).toBeInTheDocument();
    });
  });

  it('shows edit location button', async () => {
    render(<ContactDetailModal {...baseProps} />);
    await waitFor(() => {
      expect(screen.getByText('contactDetail.editLocation')).toBeInTheDocument();
    });
  });

  it('does not fetch when bpId is missing', () => {
    render(<ContactDetailModal {...baseProps} bpId={null} />);
    expect(stableApiFetch).not.toHaveBeenCalled();
  });
});
