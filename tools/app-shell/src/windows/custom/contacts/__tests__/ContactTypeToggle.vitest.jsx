import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

const mockSetPersonType = vi.fn();

vi.mock('../ContactsContext', () => ({
  useContactsType: () => ({
    personType: 'company',
    setPersonType: mockSetPersonType,
  }),
}));

import ContactTypeToggle from '../ContactTypeToggle.jsx';

const fieldWrites = (onChange, field) => onChange.mock.calls
  .filter(([key]) => key === field)
  .map(([, value]) => value);

describe('ContactTypeToggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing without data', () => {
    const { container } = render(<ContactTypeToggle data={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('updates only local editing state when a type is selected', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ContactTypeToggle data={{ id: '1', name: 'ACME SL' }} onChange={onChange} />);

    await user.click(screen.getByText('Person'));

    expect(mockSetPersonType).toHaveBeenCalledWith('person');
    expect(onChange).toHaveBeenCalledWith('etgoIsperson', true);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('restores an existing company legal name after Company → Person → Company before save', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <ContactTypeToggle data={{ id: 'company-1', etgoIsperson: false, name: 'ACME SL' }} onChange={onChange} />,
    );

    await user.click(screen.getByText('Person'));
    expect(fieldWrites(onChange, 'name')).toContain('');

    // Mirrors DetailView feeding its updated local editing state back into the toggle.
    rerender(
      <ContactTypeToggle data={{ id: 'company-1', etgoIsperson: true, name: '' }} onChange={onChange} />,
    );
    await user.click(screen.getByText('company'));

    expect(fieldWrites(onChange, 'name')).toContain('ACME SL');
  });

  it('restores an existing person first and last name after Person → Company → Person before save', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <ContactTypeToggle
        data={{ id: 'person-1', etgoIsperson: true, name: 'Ada Lovelace', etgoFirstname: 'Ada', etgoLastname: 'Lovelace' }}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByText('company'));
    expect(fieldWrites(onChange, 'etgoFirstname')).toContain('');
    expect(fieldWrites(onChange, 'etgoLastname')).toContain('');

    rerender(
      <ContactTypeToggle data={{ id: 'person-1', etgoIsperson: false, name: 'Ada Lovelace', etgoFirstname: '', etgoLastname: '' }} onChange={onChange} />,
    );
    await user.click(screen.getByText('Person'));

    expect(fieldWrites(onChange, 'etgoFirstname')).toContain('Ada');
    expect(fieldWrites(onChange, 'etgoLastname')).toContain('Lovelace');
  });

  it('uses a new person draft to prefill a company legal name', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ContactTypeToggle
        data={{ id: 'person-2', etgoIsperson: true, name: '', etgoFirstname: 'Ana', etgoLastname: 'Gil' }}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByText('company'));

    expect(fieldWrites(onChange, 'name')).toContain('Ana Gil');
    expect(fieldWrites(onChange, 'etgoFirstname')).toContain('');
    expect(fieldWrites(onChange, 'etgoLastname')).toContain('');
  });

  it('refreshes an auto-derived company draft after the person name is corrected', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <ContactTypeToggle
        data={{ id: 'person-3', etgoIsperson: true, name: '', etgoFirstname: 'Ada', etgoLastname: 'Lovelace' }}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByText('company'));

    rerender(
      <ContactTypeToggle data={{ id: 'person-3', etgoIsperson: false, name: 'Ada Lovelace', etgoFirstname: '', etgoLastname: '' }} onChange={onChange} />,
    );
    await user.click(screen.getByText('Person'));
    rerender(
      <ContactTypeToggle data={{ id: 'person-3', etgoIsperson: true, name: '', etgoFirstname: 'Ada', etgoLastname: 'Byron' }} onChange={onChange} />,
    );
    await user.click(screen.getByText('company'));

    expect(fieldWrites(onChange, 'name')).toContain('Ada Byron');
  });

  it('starts drafts over when the user selects another existing record', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ContactTypeToggle data={{ id: 'company-1', etgoIsperson: false, name: 'ACME SL' }} onChange={onChange} />,
    );
    rerender(
      <ContactTypeToggle data={{ id: 'company-2', etgoIsperson: false, name: 'Globex SA' }} onChange={onChange} />,
    );
    expect(mockSetPersonType).toHaveBeenLastCalledWith('company');
  });
});
