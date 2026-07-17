import { render, screen, fireEvent } from '@testing-library/react';

// --- Mocks ----------------------------------------------------------------

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('@/components/ui/label', () => ({
  Label: ({ children, ...props }) => <label {...props}>{children}</label>,
}));

vi.mock('lucide-react', () => ({
  MapPin: (props) => <span data-testid="icon-mappin" {...props} />,
  ChevronRight: (props) => <span data-testid="icon-chevron-right" {...props} />,
  Pencil: (props) => <span data-testid="icon-pencil" {...props} />,
}));

// Stub the heavy editor modal: it renders its incoming props as data-attributes
// (so we can assert wiring) and exposes a button that fires onSaved(id, name)
// so we can verify LocationModalField forwards it to onChange and closes.
vi.mock('../../../windows/custom/shared/LocationEditorModal', () => ({
  default: ({ open, onSaved, onClose, rowId, saveMode, showAddressTypeCheckboxes, apiBase }) =>
    open ? (
      <div
        data-testid="editor-modal"
        data-rowid={String(rowId)}
        data-savemode={saveMode}
        data-show-checkboxes={String(showAddressTypeCheckboxes)}
        data-apibase={apiBase}>
        <button data-testid="editor-save" onClick={() => onSaved('saved-id-1', 'Saved Location')}>
          fire-onSaved
        </button>
        <button data-testid="editor-close" onClick={onClose}>
          fire-onClose
        </button>
      </div>
    ) : null,
}));

// --- Import under test ----------------------------------------------------

import LocationModalField from '../LocationModalField.jsx';

// --- Helpers --------------------------------------------------------------

function renderField(overrides = {}) {
  const defaults = {
    field: { id: 'fld-loc', key: 'cLocationId' },
    value: '',
    displayValue: '',
    onChange: vi.fn(),
    apiBaseUrl: '/sws/neo/warehouse',
    token: 'tok',
    resolvedLabel: 'Location',
    required: false,
  };
  const props = { ...defaults, ...overrides };
  return { ...render(<LocationModalField {...props} />), props };
}

// --- Tests ----------------------------------------------------------------

describe('LocationModalField', () => {
  it('renders the trigger button with a stable data-testid derived from field.id', () => {
    renderField();
    expect(screen.getByTestId('LocationModalField__fld-loc')).toBeInTheDocument();
  });

  describe('empty value (create mode)', () => {
    it('shows the placeholder text when there is no value', () => {
      renderField({ value: '', displayValue: '' });
      expect(screen.getByText('locationFieldPlaceholder')).toBeInTheDocument();
    });

    it('opens the modal in CREATE mode (rowId null) with location save settings', () => {
      renderField({ value: '' });
      // Modal is closed initially
      expect(screen.queryByTestId('editor-modal')).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId('LocationModalField__fld-loc'));

      const modal = screen.getByTestId('editor-modal');
      expect(modal).toBeInTheDocument();
      expect(modal).toHaveAttribute('data-rowid', 'null');
      expect(modal).toHaveAttribute('data-savemode', 'location');
      expect(modal).toHaveAttribute('data-show-checkboxes', 'false');
      expect(modal).toHaveAttribute('data-apibase', '/sws/neo/warehouse');
    });
  });

  describe('non-empty value (edit mode)', () => {
    it('shows the displayValue when a value is present', () => {
      renderField({ value: 'loc-99', displayValue: 'Santa Fe - Rio Cuarto - España' });
      expect(screen.getByText('Santa Fe - Rio Cuarto - España')).toBeInTheDocument();
      expect(screen.queryByText('locationFieldPlaceholder')).not.toBeInTheDocument();
    });

    it('opens the modal in EDIT mode (rowId = value)', () => {
      renderField({ value: 'loc-99', displayValue: 'Santa Fe' });
      fireEvent.click(screen.getByTestId('LocationModalField__fld-loc'));

      const modal = screen.getByTestId('editor-modal');
      expect(modal).toHaveAttribute('data-rowid', 'loc-99');
      expect(modal).toHaveAttribute('data-savemode', 'location');
      expect(modal).toHaveAttribute('data-show-checkboxes', 'false');
    });
  });

  describe('onSaved wiring', () => {
    it('forwards onSaved(id, name) to onChange(id, name) and closes the modal', () => {
      const onChange = vi.fn();
      renderField({ value: '', onChange });

      fireEvent.click(screen.getByTestId('LocationModalField__fld-loc'));
      expect(screen.getByTestId('editor-modal')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('editor-save'));

      expect(onChange).toHaveBeenCalledWith('saved-id-1', 'Saved Location');
      // Modal closes after save
      expect(screen.queryByTestId('editor-modal')).not.toBeInTheDocument();
    });
  });
});
