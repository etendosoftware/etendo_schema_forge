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
    render(<ContactTypeToggle data={{ id: '1' }} />);
    await user.click(screen.getByText('Person'));
    expect(mockSetPersonType).toHaveBeenCalledWith('person');
  });

  it('calls setPersonType when company button is clicked', async () => {
    const user = userEvent.setup();
    render(<ContactTypeToggle data={{ id: '1' }} />);
    await user.click(screen.getByText('company'));
    expect(mockSetPersonType).toHaveBeenCalledWith('company');
  });

  it('writes etgoIsperson=true to editing state when selecting Person, without a fetch', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ContactTypeToggle data={{ id: '1' }} onChange={onChange} />);
    await user.click(screen.getByText('Person'));
    expect(onChange).toHaveBeenCalledWith('etgoIsperson', true);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('writes etgoIsperson=false to editing state when selecting Company, without a fetch', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ContactTypeToggle data={{ id: '1' }} onChange={onChange} />);
    await user.click(screen.getByText('company'));
    expect(onChange).toHaveBeenCalledWith('etgoIsperson', false);
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

  describe('name pre-fill on Person→Company switch', () => {
    // Helper: returns the args of the onChange call that wrote the `name` field,
    // or undefined if no such call happened. This distinguishes a `name` write
    // from any other onChange calls.
    const nameCall = (onChange) =>
      onChange.mock.calls.find((args) => args[0] === 'name');

    it('pre-fills name from firstName + lastName when name is blank', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <ContactTypeToggle
          data={{ id: '1', etgoFirstname: 'First', etgoLastname: 'Last', name: '' }}
          onChange={onChange}
        />
      );
      await user.click(screen.getByText('company'));
      const call = nameCall(onChange);
      expect(call).toEqual(['name', 'First Last']);
      // Every `name` write must carry the same pre-filled value (jsdom fires the
      // label+radio click more than once — never with a different name value).
      const nameWrites = onChange.mock.calls.filter((a) => a[0] === 'name');
      expect(nameWrites.every((a) => a[1] === 'First Last')).toBe(true);
    });

    it('does NOT overwrite name when it already has a value', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <ContactTypeToggle
          data={{ id: '1', etgoFirstname: 'First', etgoLastname: 'Last', name: 'Existing Co' }}
          onChange={onChange}
        />
      );
      await user.click(screen.getByText('company'));
      expect(nameCall(onChange)).toBeUndefined();
    });

    it('pre-fills with only firstName when lastName is empty (no trailing space)', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <ContactTypeToggle
          data={{ id: '1', etgoFirstname: 'First', etgoLastname: '', name: '' }}
          onChange={onChange}
        />
      );
      await user.click(screen.getByText('company'));
      expect(nameCall(onChange)).toEqual(['name', 'First']);
    });

    it('pre-fills with only lastName when firstName is empty', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <ContactTypeToggle
          data={{ id: '1', etgoFirstname: '', etgoLastname: 'Last', name: '' }}
          onChange={onChange}
        />
      );
      await user.click(screen.getByText('company'));
      expect(nameCall(onChange)).toEqual(['name', 'Last']);
    });

    it('does NOT pre-fill name when both name parts are blank', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <ContactTypeToggle
          data={{ id: '1', etgoFirstname: '', etgoLastname: '', name: '' }}
          onChange={onChange}
        />
      );
      await user.click(screen.getByText('company'));
      expect(nameCall(onChange)).toBeUndefined();
    });

    it('does not crash when onChange prop is undefined', async () => {
      const user = userEvent.setup();
      render(
        <ContactTypeToggle
          data={{ id: '1', etgoFirstname: 'First', etgoLastname: 'Last', name: '' }}
        />
      );
      // Should not throw
      await user.click(screen.getByText('company'));
      expect(screen.getByText('company')).toBeInTheDocument();
    });

    it('does NOT pre-fill name when switching to Person', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <ContactTypeToggle
          data={{ id: '1', etgoFirstname: 'First', etgoLastname: 'Last', name: '' }}
          onChange={onChange}
        />
      );
      await user.click(screen.getByText('Person'));
      expect(nameCall(onChange)).toBeUndefined();
    });

    it('collapses internal whitespace to a single space', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <ContactTypeToggle
          data={{ id: '1', etgoFirstname: 'Ana', etgoLastname: '  Gil', name: '' }}
          onChange={onChange}
        />
      );
      await user.click(screen.getByText('company'));
      expect(nameCall(onChange)).toEqual(['name', 'Ana Gil']);
    });

    // Returns every value written to `name`, in order.
    const nameWrites = (onChange) =>
      onChange.mock.calls.filter((a) => a[0] === 'name').map((a) => a[1]);

    it('re-syncs name on a second switch while still auto-owned', async () => {
      // Blank name → first switch auto-fills "Ada Lovelace" (component now owns it,
      // tracked in lastAutoFilledNameRef). Simulate the editing state reflecting
      // that write by feeding it back via the `data.name` prop on rerender, then
      // change the last name and switch again — the value is still owned by auto
      // (currentName === lastAutoFilledNameRef) so it MUST re-sync to "Ada Byron".
      const user = userEvent.setup();
      const onChange = vi.fn();
      const { rerender } = render(
        <ContactTypeToggle
          data={{ id: '1', etgoFirstname: 'Ada', etgoLastname: 'Lovelace', name: '' }}
          onChange={onChange}
        />
      );
      await user.click(screen.getByText('company'));
      expect(nameCall(onChange)).toEqual(['name', 'Ada Lovelace']);

      // The detail editing state now holds the auto-written value; same record id
      // (so the ref lifecycle does not reset) and a corrected last name.
      onChange.mockClear();
      rerender(
        <ContactTypeToggle
          data={{ id: '1', etgoFirstname: 'Ada', etgoLastname: 'Byron', name: 'Ada Lovelace' }}
          onChange={onChange}
        />
      );
      await user.click(screen.getByText('company'));

      // Re-synced: the only name write carries the new full name.
      expect(nameCall(onChange)).toEqual(['name', 'Ada Byron']);
      expect(nameWrites(onChange).every((v) => v === 'Ada Byron')).toBe(true);
    });

    it('respects a manual edit and never overwrites it on a later switch', async () => {
      // Blank → first switch auto-fills "Ada Lovelace". The user then hand-edits
      // the Razón Social to "ACME SL" (different from the auto value we recorded),
      // so it becomes user-owned. A later switch — even after the last name
      // changes — must NOT touch `name`.
      const user = userEvent.setup();
      const onChange = vi.fn();
      const { rerender } = render(
        <ContactTypeToggle
          data={{ id: '1', etgoFirstname: 'Ada', etgoLastname: 'Lovelace', name: '' }}
          onChange={onChange}
        />
      );
      await user.click(screen.getByText('company'));
      expect(nameCall(onChange)).toEqual(['name', 'Ada Lovelace']);

      onChange.mockClear();
      rerender(
        <ContactTypeToggle
          data={{ id: '1', etgoFirstname: 'Ada', etgoLastname: 'Byron', name: 'ACME SL' }}
          onChange={onChange}
        />
      );
      await user.click(screen.getByText('company'));

      // User-owned → no write.
      expect(nameCall(onChange)).toBeUndefined();
    });

    it('never touches an existing persisted name on first interaction (ref null)', async () => {
      // First-ever interaction with a record that already carries a persisted
      // Razón Social. lastAutoFilledNameRef starts null, so the value is NOT
      // owned by auto and must be left untouched even though first/last are set.
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <ContactTypeToggle
          data={{ id: '1', etgoFirstname: 'Foo', etgoLastname: 'Bar', name: 'Foo SA' }}
          onChange={onChange}
        />
      );
      await user.click(screen.getByText('company'));
      expect(nameCall(onChange)).toBeUndefined();
    });

    it('is a no-op when the computed full name already equals the current name', async () => {
      // Blank → first switch auto-fills "First Last" (ref = "First Last"). Feed
      // that back as the current name with unchanged first/last, then switch
      // again: owned-by-auto is true but fullName === currentName, so the
      // `fullName !== currentName` guard blocks any redundant write.
      const user = userEvent.setup();
      const onChange = vi.fn();
      const { rerender } = render(
        <ContactTypeToggle
          data={{ id: '1', etgoFirstname: 'First', etgoLastname: 'Last', name: '' }}
          onChange={onChange}
        />
      );
      await user.click(screen.getByText('company'));
      expect(nameCall(onChange)).toEqual(['name', 'First Last']);

      onChange.mockClear();
      rerender(
        <ContactTypeToggle
          data={{ id: '1', etgoFirstname: 'First', etgoLastname: 'Last', name: 'First Last' }}
          onChange={onChange}
        />
      );
      await user.click(screen.getByText('company'));

      // No redundant write.
      expect(nameCall(onChange)).toBeUndefined();
    });
  });

  describe('field clearing on type switch', () => {
    // Returns the args of the onChange call that wrote a given field, or
    // undefined. jsdom may fire the label+radio click more than once, so assert
    // on the VALUES passed to onChange rather than exact call counts.
    const fieldCall = (onChange, field) =>
      onChange.mock.calls.find((args) => args[0] === field);

    it('Person→Company: pre-fills name AND clears first/last name fields', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <ContactTypeToggle
          data={{ id: '1', etgoFirstname: 'Juan', etgoLastname: 'Perez', name: '' }}
          onChange={onChange}
        />
      );
      await user.click(screen.getByText('company'));
      expect(fieldCall(onChange, 'name')).toEqual(['name', 'Juan Perez']);
      expect(fieldCall(onChange, 'etgoFirstname')).toEqual(['etgoFirstname', '']);
      expect(fieldCall(onChange, 'etgoLastname')).toEqual(['etgoLastname', '']);
    });

    it('Person→Company: keeps user-owned name but STILL clears first/last name fields', async () => {
      // name is a persisted/user value never generated by us (ref starts null),
      // so it is user-owned and must not be overwritten — but the person fields
      // are always cleared when going to company mode.
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <ContactTypeToggle
          data={{ id: '1', etgoFirstname: 'Juan', etgoLastname: 'Perez', name: 'ACME SL' }}
          onChange={onChange}
        />
      );
      await user.click(screen.getByText('company'));
      expect(fieldCall(onChange, 'name')).toBeUndefined();
      expect(fieldCall(onChange, 'etgoFirstname')).toEqual(['etgoFirstname', '']);
      expect(fieldCall(onChange, 'etgoLastname')).toEqual(['etgoLastname', '']);
    });

    it('Company→Person: clears the legal name (Razón Social)', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <ContactTypeToggle
          data={{ id: '1', name: 'ACME SL' }}
          onChange={onChange}
        />
      );
      await user.click(screen.getByText('Person'));
      const call = fieldCall(onChange, 'name');
      expect(call).toEqual(['name', '']);
      // Every name write clears it — never with a non-empty value.
      const nameWrites = onChange.mock.calls.filter((a) => a[0] === 'name');
      expect(nameWrites.every((a) => a[1] === '')).toBe(true);
    });

    it('Company→Person: does NOT write name when it is already blank', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <ContactTypeToggle
          data={{ id: '1', name: '' }}
          onChange={onChange}
        />
      );
      await user.click(screen.getByText('Person'));
      expect(fieldCall(onChange, 'name')).toBeUndefined();
    });

    it('Person→Company: does NOT clear first/last name fields when they are blank', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <ContactTypeToggle
          data={{ id: '1', etgoFirstname: '', etgoLastname: '', name: '' }}
          onChange={onChange}
        />
      );
      await user.click(screen.getByText('company'));
      expect(fieldCall(onChange, 'etgoFirstname')).toBeUndefined();
      expect(fieldCall(onChange, 'etgoLastname')).toBeUndefined();
    });
  });

  it('applies active style to the selected button', () => {
    // personType is 'company' from the mock, so the company radio should show
    // the filled inner circle (a <div> with the semantic foreground role).
    // The person radio is unselected — no filled inner circle.
    const { container } = render(<ContactTypeToggle data={{ id: '1' }} />);

    // Each label wraps: outer-div > inner-circle-div > (optional) filled-dot-div
    const labels = container.querySelectorAll('label');
    // labels[0] = Person, labels[1] = company (render order from the source array)
    const personLabel = labels[0];
    const companyLabel = labels[1];

    const personDot = personLabel.querySelector('[style*="background: hsl(var(--foreground))"]');
    const companyDot = companyLabel.querySelector('[style*="background: hsl(var(--foreground))"]');

    expect(companyDot).not.toBeNull(); // selected — inner dot present
    expect(personDot).toBeNull();       // unselected — no inner dot
  });
});
