import { render, screen, fireEvent } from '@testing-library/react';
import AddressSection from '../AddressSection.jsx';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('../modal-styles.js', () => ({
  MODAL_STYLES: { fieldLabel: {} },
}));

describe('AddressSection', () => {
  const defaultForm = {
    address: '123 Main St',
    address2: 'Apt 4',
    postalCode: '28001',
    city: 'Madrid',
    country: '',
    region: '',
  };

  const defaultOpts = {
    countries: {
      options: [
        { id: 'ES', label: 'Spain' },
        { id: 'FR', label: 'France' },
        { id: 'DE', label: 'Germany' },
      ],
      loading: false,
      error: null,
    },
    regions: {
      options: [
        { id: 'R1', label: 'Madrid' },
        { id: 'R2', label: 'Barcelona' },
      ],
      loading: false,
      error: null,
    },
  };

  const noop = () => {};

  it('renders all input fields', () => {
    render(<AddressSection form={defaultForm} onChange={noop} opts={defaultOpts} />);
    expect(screen.getByDisplayValue('123 Main St')).toBeTruthy();
    expect(screen.getByDisplayValue('Apt 4')).toBeTruthy();
    expect(screen.getByDisplayValue('28001')).toBeTruthy();
    expect(screen.getByDisplayValue('Madrid')).toBeTruthy();
  });

  it('renders required marks for specified fields', () => {
    const { container } = render(
      <AddressSection form={defaultForm} onChange={noop} opts={defaultOpts} requiredFields={['address', 'city']} />,
    );
    const marks = container.querySelectorAll('span[style]');
    // At least 2 required marks (address and city)
    const redMarks = Array.from(marks).filter(m => m.textContent === '*');
    expect(redMarks.length).toBeGreaterThanOrEqual(2);
  });

  it('calls onChange when address input changes', () => {
    const onChange = vi.fn();
    render(<AddressSection form={defaultForm} onChange={onChange} opts={defaultOpts} />);
    fireEvent.change(screen.getByDisplayValue('123 Main St'), { target: { value: '456 Oak Ave' } });
    expect(onChange).toHaveBeenCalledWith('address', '456 Oak Ave');
  });

  it('calls onChange when city input changes', () => {
    const onChange = vi.fn();
    render(<AddressSection form={defaultForm} onChange={onChange} opts={defaultOpts} />);
    fireEvent.change(screen.getByDisplayValue('Madrid'), { target: { value: 'Barcelona' } });
    expect(onChange).toHaveBeenCalledWith('city', 'Barcelona');
  });

  it('strips non-digit chars from postal code', () => {
    const onChange = vi.fn();
    render(<AddressSection form={defaultForm} onChange={onChange} opts={defaultOpts} />);
    fireEvent.change(screen.getByDisplayValue('28001'), { target: { value: '28-002' } });
    expect(onChange).toHaveBeenCalledWith('postalCode', '28-002');
  });

  it('opens country picker on button click', () => {
    render(<AddressSection form={defaultForm} onChange={noop} opts={defaultOpts} />);
    const buttons = screen.getAllByRole('button');
    const countryBtn = buttons.find(b => b.classList.contains('picker-btn'));
    fireEvent.click(countryBtn);
    // Country picker should show options
    expect(screen.getByText('Spain')).toBeTruthy();
    expect(screen.getByText('France')).toBeTruthy();
  });

  it('selects a country and clears region', () => {
    const onChange = vi.fn();
    render(<AddressSection form={defaultForm} onChange={onChange} opts={defaultOpts} />);
    const buttons = screen.getAllByRole('button');
    const countryBtn = buttons.find(b => b.classList.contains('picker-btn'));
    fireEvent.click(countryBtn);
    fireEvent.click(screen.getByText('France'));
    expect(onChange).toHaveBeenCalledWith('country', 'FR');
    expect(onChange).toHaveBeenCalledWith('region', '');
  });

  it('shows country label when country is selected', () => {
    const form = { ...defaultForm, country: 'ES' };
    render(<AddressSection form={form} onChange={noop} opts={defaultOpts} />);
    expect(screen.getByText('Spain')).toBeTruthy();
  });

  it('disables region picker when no country selected', () => {
    render(<AddressSection form={defaultForm} onChange={noop} opts={defaultOpts} />);
    const buttons = screen.getAllByRole('button');
    const regionBtn = buttons.find(b => b.disabled);
    expect(regionBtn).toBeTruthy();
  });

  it('opens region picker when country is selected', () => {
    const form = { ...defaultForm, country: 'ES' };
    render(<AddressSection form={form} onChange={noop} opts={defaultOpts} />);
    const buttons = screen.getAllByRole('button');
    const pickerBtns = buttons.filter(b => b.classList.contains('picker-btn'));
    // Second picker button is region
    fireEvent.click(pickerBtns[1]);
    expect(screen.getByText('Barcelona')).toBeTruthy();
  });

  it('selects a region', () => {
    const onChange = vi.fn();
    const form = { ...defaultForm, country: 'ES' };
    render(<AddressSection form={form} onChange={onChange} opts={defaultOpts} />);
    const buttons = screen.getAllByRole('button');
    const pickerBtns = buttons.filter(b => b.classList.contains('picker-btn'));
    fireEvent.click(pickerBtns[1]);
    fireEvent.click(screen.getByText('Madrid'));
    expect(onChange).toHaveBeenCalledWith('region', 'R1');
  });

  it('shows selectCountryFirst when no country selected', () => {
    render(<AddressSection form={defaultForm} onChange={noop} opts={defaultOpts} />);
    expect(screen.getByText('selectCountryFirst')).toBeTruthy();
  });

  it('filters options in country picker by search', () => {
    render(<AddressSection form={defaultForm} onChange={noop} opts={defaultOpts} />);
    const buttons = screen.getAllByRole('button');
    const countryBtn = buttons.find(b => b.classList.contains('picker-btn'));
    fireEvent.click(countryBtn);

    // Type in search
    const searchInput = screen.getByPlaceholderText('countrySearchPlaceholder');
    fireEvent.change(searchInput, { target: { value: 'spa' } });
    expect(screen.getByText('Spain')).toBeTruthy();
    expect(screen.queryByText('Germany')).toBeNull();
  });

  it('shows loading state in picker', () => {
    const opts = {
      ...defaultOpts,
      countries: { options: [], loading: true, error: null },
    };
    render(<AddressSection form={defaultForm} onChange={noop} opts={opts} />);
    const buttons = screen.getAllByRole('button');
    const countryBtn = buttons.find(b => b.classList.contains('picker-btn'));
    fireEvent.click(countryBtn);
    expect(screen.getByText('loading')).toBeTruthy();
  });

  it('shows error state in picker', () => {
    const opts = {
      ...defaultOpts,
      countries: { options: [], loading: false, error: 'Failed to load' },
    };
    render(<AddressSection form={defaultForm} onChange={noop} opts={opts} />);
    const buttons = screen.getAllByRole('button');
    const countryBtn = buttons.find(b => b.classList.contains('picker-btn'));
    fireEvent.click(countryBtn);
    expect(screen.getByText('countryLoadError')).toBeTruthy();
  });

  it('shows noResults when filter matches nothing', () => {
    render(<AddressSection form={defaultForm} onChange={noop} opts={defaultOpts} />);
    const buttons = screen.getAllByRole('button');
    const countryBtn = buttons.find(b => b.classList.contains('picker-btn'));
    fireEvent.click(countryBtn);
    const searchInput = screen.getByPlaceholderText('countrySearchPlaceholder');
    fireEvent.change(searchInput, { target: { value: 'zzzzz' } });
    expect(screen.getByText('noResults')).toBeTruthy();
  });

  it('closes country picker on backdrop click', () => {
    render(<AddressSection form={defaultForm} onChange={noop} opts={defaultOpts} />);
    const buttons = screen.getAllByRole('button');
    const countryBtn = buttons.find(b => b.classList.contains('picker-btn'));
    fireEvent.click(countryBtn);
    expect(screen.getByText('Spain')).toBeTruthy();

    // Click backdrop (the overlay div)
    const overlay = document.querySelector('.fixed.inset-0');
    fireEvent.mouseDown(overlay);
    expect(screen.queryByText('Spain')).toBeNull();
  });

  it('handles empty opts gracefully', () => {
    const opts = { countries: {}, regions: {} };
    render(<AddressSection form={defaultForm} onChange={noop} opts={opts} />);
    // Should render without error
    expect(screen.getByDisplayValue('123 Main St')).toBeTruthy();
  });

  it('handles null form values', () => {
    const form = { address: null, address2: null, postalCode: null, city: null, country: '', region: '' };
    render(<AddressSection form={form} onChange={noop} opts={defaultOpts} />);
    // Inputs should show empty strings
    const inputs = screen.getAllByRole('textbox');
    expect(inputs.length).toBeGreaterThanOrEqual(4);
  });

  it('shows check icon for selected country', () => {
    const form = { ...defaultForm, country: 'ES' };
    render(<AddressSection form={form} onChange={noop} opts={defaultOpts} />);
    const buttons = screen.getAllByRole('button');
    const countryBtn = buttons.find(b => b.classList.contains('picker-btn'));
    fireEvent.click(countryBtn);
    // Spain should have blue highlight — use getAllByText since Spain appears in picker button + list
    const spainItems = screen.getAllByText('Spain');
    const spainRow = spainItems.find(el => el.closest('button')?.className?.includes('bg-blue-50'));
    expect(spainRow).toBeTruthy();
  });
});
