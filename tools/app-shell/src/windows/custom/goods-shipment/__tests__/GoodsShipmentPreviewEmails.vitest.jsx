// ETP-5069 — email-history wiring for the goods-shipment preview.
//
// This lives in its own file (mirroring OrderPreviewEmailLink.vitest.jsx) because
// GoodsShipmentPreview.vitest.jsx deliberately renders the REAL EmailsCard: its ETP-4372
// cases assert the "previewCardSendEmail" link the real card exposes. Inspecting the props
// the panel hands the card needs the opposite — a mocked, prop-capturing EmailsCard — so
// the two mock strategies cannot share a module registry.

// Mocks must come before imports (Vitest hoisting)

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'en_US' }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('@/lib/dateOnly', () => ({
  formatCalendarDate: (date) => date || '—',
}));

vi.mock('../useShipmentPdf.js', () => ({
  useShipmentPdf: vi.fn(() => ({ pdfUrl: null, pdfBlob: null, loading: false, error: null })),
}));

vi.mock('../../shared/preview-cards/EmailsCard.jsx', () => ({
  // vi.fn (not a plain arrow) so the test can inspect the documentId / apiBaseUrl /
  // refreshSignal props GoodsShipmentPreview passes in, matching the prop-inspection
  // convention used by the sibling preview suites.
  default: vi.fn(() => <div data-testid="emails-card" />),
}));

vi.mock('../../shared/preview-cards/RelatedDocumentsCard.jsx', () => ({
  default: ({ documentId }) => <div data-testid="related-docs-card" data-doc-id={documentId} />,
}));

vi.mock('../../shared/GenericPreviewModal.jsx', () => ({
  default: vi.fn(({ title, tabs, actionButtons, onClose }) => (
    <div data-testid="generic-preview-modal">
      <span data-testid="modal-title">{title}</span>
      <div data-testid="modal-tabs">
        {tabs?.map((t) => (
          <div key={t.key} data-testid={`tab-${t.key}`}>
            {t.content}
          </div>
        ))}
      </div>
      <div data-testid="modal-actions">{actionButtons}</div>
      {onClose && (
        <button data-testid="close-btn" onClick={onClose}>
          Close
        </button>
      )}
    </div>
  )),
}));

vi.mock('../../shared/PreviewActionButtons.jsx', () => ({
  PreviewPdfPanel: ({ pdfUrl }) => <div data-testid="pdf-panel" data-url={pdfUrl} />,
}));

vi.mock('@/components/contract-ui/SendDocumentModal.jsx', () => ({
  default: ({ onClose, onSent }) => (
    <div data-testid="send-modal">
      <button data-testid="send-modal-close" onClick={onClose}>
        Close
      </button>
      {/* Simulates the modal reporting a SUCCESSFUL send (its new `onSent` callback,
          which a cancel never reaches). */}
      {onSent && (
        <button data-testid="send-modal-sent" onClick={() => onSent({ status: 'SENT' })}>
          Simulate Sent
        </button>
      )}
    </div>
  ),
}));

vi.mock('@/components/ui/button.jsx', () => ({
  Button: ({ children, onClick, disabled, ...rest }) => (
    <button onClick={onClick} disabled={disabled} {...rest}>
      {children}
    </button>
  ),
}));

vi.mock('lucide-react', () => ({
  Download: () => <span data-testid="icon-download" />,
  Edit2: () => <span data-testid="icon-edit2" />,
  Mail: () => <span data-testid="icon-mail" />,
}));

vi.mock('../../shared/preview-cards/SummaryCard.jsx', () => ({
  InfoRow: ({ label, value, children }) => (
    <div data-testid="info-row">
      {label}: {value ?? children}
    </div>
  ),
  CardShell: ({ children }) => <div data-testid="card-shell">{children}</div>,
  PercentBar: ({ value }) => <div data-testid="percent-bar">{value}</div>,
}));

vi.mock('@/components/related-documents/constants.jsx', () => ({
  STATUS_BADGE: {},
  STATUS_KEYS: {},
}));

import { render, screen, fireEvent } from '@testing-library/react';
import GoodsShipmentPreview from '../GoodsShipmentPreview.jsx';
import EmailsCard from '../../shared/preview-cards/EmailsCard.jsx';
import { useShipmentPdf } from '../useShipmentPdf.js';

const defaultShipment = {
  id: 'ship-1',
  documentNo: 'ALB-001',
  documentStatus: 'CO',
  movementDate: '2024-01-10',
  'businessPartner$_identifier': 'Client B',
  businessPartner: 'bp-3',
  'warehouse$_identifier': 'Main Warehouse',
  salesOrder: 'so-1',
  'salesOrder$_identifier': 'SO-001 (01/01/2024)',
  invoiceStatus: 0,
};

function renderGSPreview(overrides = {}) {
  const defaults = {
    shipment: defaultShipment,
    token: 'tok',
    apiBaseUrl: '/api/goods-shipment',
    windowName: 'goods-shipment',
    onClose: vi.fn(),
    onEdit: vi.fn(),
  };
  return render(<GoodsShipmentPreview {...defaults} {...overrides} />);
}

function lastEmailsCardProps() {
  return vi.mocked(EmailsCard).mock.calls.at(-1)?.[0];
}

describe('GoodsShipmentPreview — email history wiring (ETP-5069)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useShipmentPdf.mockReturnValue({ pdfUrl: null, pdfBlob: null, loading: false, error: null });
  });

  it('passes the shipment id and the API base down to EmailsCard', () => {
    renderGSPreview();
    const props = lastEmailsCardProps();
    expect(props.documentId).toBe('ship-1');
    expect(props.apiBaseUrl).toBe('/api/goods-shipment');
  });

  it('starts EmailsCard with a defined refreshSignal', () => {
    renderGSPreview();
    expect(lastEmailsCardProps().refreshSignal).toBeDefined();
  });

  it('bumps refreshSignal on EmailsCard when the send modal reports a successful send', () => {
    renderGSPreview();
    const before = lastEmailsCardProps().refreshSignal;

    fireEvent.click(screen.getByTestId('icon-mail').closest('button'));
    fireEvent.click(screen.getByTestId('send-modal-sent'));

    expect(lastEmailsCardProps().refreshSignal).not.toBe(before);
  });

  it('leaves refreshSignal untouched when the send modal is merely closed', () => {
    renderGSPreview();
    const before = lastEmailsCardProps().refreshSignal;

    fireEvent.click(screen.getByTestId('icon-mail').closest('button'));
    fireEvent.click(screen.getByTestId('send-modal-close'));

    expect(lastEmailsCardProps().refreshSignal).toBe(before);
  });

  it('keeps the ETP-4717 fail-closed gate: a draft shipment gets no onSend', () => {
    renderGSPreview({ shipment: { ...defaultShipment, documentStatus: 'DR' } });
    expect(lastEmailsCardProps().onSend).toBeUndefined();
    expect(lastEmailsCardProps().documentId).toBe('ship-1');
  });
});
