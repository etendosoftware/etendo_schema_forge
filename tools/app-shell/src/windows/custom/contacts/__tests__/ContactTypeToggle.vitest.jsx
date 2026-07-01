import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock i18n
vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

const mockSetPersonType = vi.fn();

// Mock ContactsContext
vi.mock('../ContactsContext', () => ({
  useContactsType: () => ({
    personType: 'company',
    setPersonType: mockSetPersonType,
  }),
}));

import ContactTypeToggle from '../ContactTypeToggle.jsx';

describe('ContactTypeToggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing when data is null', () => {
    const { container } = render(<ContactTypeToggle data={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when data is undefined', () => {
    const { container } = render(<ContactTypeToggle />);
    expect(container.firstChild).toBeNull();
  });

  it('renders two toggle buttons when data is provided', () => {
    render(<ContactTypeToggle data={{ id: '1' }} />);
    expect(screen.getByText('Person')).toBeInTheDocument();
    expect(screen.getByText('company')).toBeInTheDocument();
  });

  it('calls setPersonType when person button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <ContactTypeToggle
        data={{ id: '1' }}
        recordId="rec-1"
        token="test-token"
        apiBaseUrl="/api"
      />
    );
    await user.click(screen.getByText('Person'));
    expect(mockSetPersonType).toHaveBeenCalledWith('person');
  });

  it('calls setPersonType when company button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <ContactTypeToggle
        data={{ id: '1' }}
        recordId="rec-1"
        token="test-token"
        apiBaseUrl="/api"
      />
    );
    await user.click(screen.getByText('company'));
    expect(mockSetPersonType).toHaveBeenCalledWith('company');
  });

  it('sends PATCH request when clicking a toggle with full credentials', async () => {
    const user = userEvent.setup();
    render(
      <ContactTypeToggle
        data={{ id: '1' }}
        recordId="rec-1"
        token="test-token"
        apiBaseUrl="/api"
      />
    );
    await user.click(screen.getByText('Person'));
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/businessPartner/rec-1',
      expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({ etgoIsperson: true }),
      }),
    );
  });

  it('sends etgoIsperson=false when selecting company', async () => {
    const user = userEvent.setup();
    render(
      <ContactTypeToggle
        data={{ id: '1' }}
        recordId="rec-1"
        token="test-token"
        apiBaseUrl="/api"
      />
    );
    await user.click(screen.getByText('company'));
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/businessPartner/rec-1',
      expect.objectContaining({
        body: JSON.stringify({ etgoIsperson: false }),
      }),
    );
  });

  it('does not send PATCH when recordId is missing', async () => {
    const user = userEvent.setup();
    render(
      <ContactTypeToggle
        data={{ id: '1' }}
        token="test-token"
        apiBaseUrl="/api"
      />
    );
    await user.click(screen.getByText('Person'));
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('does not send PATCH when token is missing', async () => {
    const user = userEvent.setup();
    render(
      <ContactTypeToggle
        data={{ id: '1' }}
        recordId="rec-1"
        apiBaseUrl="/api"
      />
    );
    await user.click(screen.getByText('Person'));
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('does not send PATCH when apiBaseUrl is missing', async () => {
    const user = userEvent.setup();
    render(
      <ContactTypeToggle
        data={{ id: '1' }}
        recordId="rec-1"
        token="test-token"
      />
    );
    await user.click(screen.getByText('Person'));
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('sets personType to person when data.etgoIsperson is true on mount', () => {
    render(<ContactTypeToggle data={{ id: '1', etgoIsperson: true }} />);
    expect(mockSetPersonType).toHaveBeenCalledWith('person');
  });

  it('sets personType to person when data.etgoIsperson is Y on mount', () => {
    render(<ContactTypeToggle data={{ id: '1', etgoIsperson: 'Y' }} />);
    expect(mockSetPersonType).toHaveBeenCalledWith('person');
  });

  it('sets personType to company when data.etgoIsperson is false on mount', () => {
    render(<ContactTypeToggle data={{ id: '1', etgoIsperson: false }} />);
    expect(mockSetPersonType).toHaveBeenCalledWith('company');
  });

  it('handles fetch failure gracefully (does not throw)', async () => {
    globalThis.fetch.mockRejectedValue(new Error('Network error'));
    const user = userEvent.setup();
    render(
      <ContactTypeToggle
        data={{ id: '1' }}
        recordId="rec-1"
        token="test-token"
        apiBaseUrl="/api"
      />
    );
    // Should not throw
    await user.click(screen.getByText('Person'));
    expect(globalThis.fetch).toHaveBeenCalled();
  });

  it('applies active style to the selected button', () => {
    // personType is 'company' from the mock, so the company radio should show
    // the filled inner circle (a <div> with background #121217).
    // The person radio is unselected — no filled inner circle.
    const { container } = render(<ContactTypeToggle data={{ id: '1' }} />);

    // Each label wraps: outer-div > inner-circle-div > (optional) filled-dot-div
    const labels = container.querySelectorAll('label');
    // labels[0] = Person, labels[1] = company (render order from the source array)
    const personLabel = labels[0];
    const companyLabel = labels[1];

    // The filled dot is the only element with background: rgb(18, 18, 23)
    const personDot = personLabel.querySelector('[style*="background: rgb(18, 18, 23)"]')
      ?? personLabel.querySelector('[style*="background: #121217"]');
    const companyDot = companyLabel.querySelector('[style*="background: rgb(18, 18, 23)"]')
      ?? companyLabel.querySelector('[style*="background: #121217"]');

    expect(companyDot).not.toBeNull(); // selected — inner dot present
    expect(personDot).toBeNull();       // unselected — no inner dot
  });
});
