import { render, screen, fireEvent } from '@testing-library/react';
import FiscalOrgDropdown from '../FiscalOrgDropdown.jsx';

const ORG_A = { id: 'org-1', name: 'Acme Corp' };
const ORG_B = { id: 'org-2', name: 'Beta Ltd' };

describe('FiscalOrgDropdown — rendering', () => {
  it('renders the selected org name', () => {
    render(<FiscalOrgDropdown selectedOrg={ORG_A} orgList={[ORG_A]} onSelect={vi.fn()} />);
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
  });

  it('renders the org initial as avatar', () => {
    render(<FiscalOrgDropdown selectedOrg={ORG_A} orgList={[ORG_A]} onSelect={vi.fn()} />);
    expect(screen.getByText('A')).toBeInTheDocument();
  });

  it('returns null when selectedOrg is not provided', () => {
    const { container } = render(
      <FiscalOrgDropdown selectedOrg={null} orgList={[]} onSelect={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });
});

describe('FiscalOrgDropdown — single org (no switch)', () => {
  it('does not show the chevron when only one org', () => {
    const { container } = render(
      <FiscalOrgDropdown selectedOrg={ORG_A} orgList={[ORG_A]} onSelect={vi.fn()} />
    );
    expect(container.querySelector('svg')).toBeNull();
  });

  it('does not open a dropdown when clicked with single org', () => {
    render(<FiscalOrgDropdown selectedOrg={ORG_A} orgList={[ORG_A]} onSelect={vi.fn()} />);
    fireEvent.click(screen.getByText('Acme Corp'));
    expect(screen.queryByText('Beta Ltd')).not.toBeInTheDocument();
  });
});

describe('FiscalOrgDropdown — multiple orgs (switch)', () => {
  it('opens the dropdown when the trigger is clicked', () => {
    render(
      <FiscalOrgDropdown selectedOrg={ORG_A} orgList={[ORG_A, ORG_B]} onSelect={vi.fn()} />
    );
    fireEvent.click(screen.getByText('Acme Corp'));
    expect(screen.getByText('Beta Ltd')).toBeInTheDocument();
  });

  it('calls onSelect with the chosen org', () => {
    const onSelect = vi.fn();
    render(
      <FiscalOrgDropdown selectedOrg={ORG_A} orgList={[ORG_A, ORG_B]} onSelect={onSelect} />
    );
    fireEvent.click(screen.getByText('Acme Corp'));
    fireEvent.click(screen.getByText('Beta Ltd'));
    expect(onSelect).toHaveBeenCalledWith(ORG_B);
  });

  it('closes the dropdown after selecting an org', () => {
    render(
      <FiscalOrgDropdown selectedOrg={ORG_A} orgList={[ORG_A, ORG_B]} onSelect={vi.fn()} />
    );
    fireEvent.click(screen.getByText('Acme Corp'));
    fireEvent.click(screen.getByText('Beta Ltd'));
    expect(screen.queryByText('Beta Ltd')).not.toBeInTheDocument();
  });

  it('filters out the wildcard org (*)', () => {
    const wildcard = { id: 'all', name: '*' };
    render(
      <FiscalOrgDropdown selectedOrg={ORG_A} orgList={[ORG_A, ORG_B, wildcard]} onSelect={vi.fn()} />
    );
    fireEvent.click(screen.getByText('Acme Corp'));
    expect(screen.queryByText('*')).not.toBeInTheDocument();
  });
});
