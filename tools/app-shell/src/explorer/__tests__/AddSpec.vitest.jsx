// --- Mocks (before imports) ---

vi.mock('../useDiscovery', () => ({
  upsertSpec: vi.fn().mockResolvedValue({ SpecID: 'SPEC-001' }),
  populateSpec: vi.fn().mockResolvedValue({ EntitiesCreated: 3, FieldsCreated: 15 }),
  fetchMenuTree: vi.fn().mockResolvedValue({
    tree: [
      {
        id: 'folder-1',
        name: 'Sales',
        type: 'folder',
        children: [
          { id: 'win-1', name: 'Sales Order', type: 'window', windowId: 'W-001' },
          { id: 'proc-1', name: 'Post Invoices', type: 'process', processId: 'P-001' },
        ],
      },
      { id: 'win-2', name: 'Product', type: 'window', windowId: 'W-002' },
    ],
  }),
}));

vi.mock('@/lib/utils', () => ({
  cn: (...args) => args.filter(Boolean).join(' '),
}));

vi.mock('lucide-react', () => ({
  Folder: (props) => <span data-testid="icon-folder" {...props} />,
  AppWindow: (props) => <span data-testid="icon-window" {...props} />,
  Cog: (props) => <span data-testid="icon-cog" {...props} />,
  ChevronRight: (props) => <span data-testid="icon-chevron" {...props} />,
  Search: (props) => <span data-testid="icon-search" {...props} />,
  Loader2: (props) => <span data-testid="icon-loader" {...props} />,
  X: (props) => <span data-testid="icon-x" {...props} />,
}));

// --- Imports ---

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AddSpec from '../AddSpec.jsx';
import { upsertSpec, populateSpec } from '../useDiscovery';

// --- Tests ---

describe('AddSpec', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the "+ Add Spec" button initially', () => {
    render(<AddSpec />);
    expect(screen.getByText('+ Add Spec')).toBeInTheDocument();
  });

  it('does not show the form until the button is clicked', () => {
    render(<AddSpec />);
    expect(screen.queryByText('New Spec')).not.toBeInTheDocument();
  });

  it('shows the form after clicking "+ Add Spec"', async () => {
    const user = userEvent.setup();
    render(<AddSpec />);
    await user.click(screen.getByText('+ Add Spec'));
    expect(screen.getByText('New Spec')).toBeInTheDocument();
  });

  it('shows the spec name input and module ID input', async () => {
    const user = userEvent.setup();
    render(<AddSpec />);
    await user.click(screen.getByText('+ Add Spec'));
    expect(screen.getByPlaceholderText('Spec name (URL slug)')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Module ID')).toBeInTheDocument();
  });

  it('shows the "Select a window or process..." placeholder', async () => {
    const user = userEvent.setup();
    render(<AddSpec />);
    await user.click(screen.getByText('+ Add Spec'));
    expect(screen.getByText('Select a window or process...')).toBeInTheDocument();
  });

  it('shows the auto-populate checkbox checked by default', async () => {
    const user = userEvent.setup();
    render(<AddSpec />);
    await user.click(screen.getByText('+ Add Spec'));
    const checkbox = screen.getByLabelText('Auto-populate from AD');
    expect(checkbox).toBeChecked();
  });

  it('shows the "Enable all methods" checkbox when auto-populate is checked', async () => {
    const user = userEvent.setup();
    render(<AddSpec />);
    await user.click(screen.getByText('+ Add Spec'));
    expect(screen.getByLabelText('Enable all methods')).toBeInTheDocument();
  });

  it('has a disabled "Create Spec" button when name is empty', async () => {
    const user = userEvent.setup();
    render(<AddSpec />);
    await user.click(screen.getByText('+ Add Spec'));
    const submitBtn = screen.getByText('Create Spec');
    expect(submitBtn).toBeDisabled();
  });

  it('opens the menu picker when the selector button is clicked', async () => {
    const user = userEvent.setup();
    render(<AddSpec />);
    await user.click(screen.getByText('+ Add Spec'));
    await user.click(screen.getByText('Select a window or process...'));
    // Menu tree loads and shows items
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search menu items...')).toBeInTheDocument();
    });
  });

  it('shows menu tree items after picker opens', async () => {
    const user = userEvent.setup();
    render(<AddSpec />);
    await user.click(screen.getByText('+ Add Spec'));
    await user.click(screen.getByText('Select a window or process...'));
    await waitFor(() => {
      expect(screen.getByText('Sales')).toBeInTheDocument();
      expect(screen.getByText('Product')).toBeInTheDocument();
    });
  });

  it('selects a window from the menu and fills in the name', async () => {
    const user = userEvent.setup();
    render(<AddSpec />);
    await user.click(screen.getByText('+ Add Spec'));
    await user.click(screen.getByText('Select a window or process...'));
    await waitFor(() => {
      expect(screen.getByText('Product')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Product'));
    // Name should be auto-generated from "Product"
    const nameInput = screen.getByPlaceholderText('Spec name (URL slug)');
    expect(nameInput.value).toBe('Product');
  });

  it('closes the form when "Close" is clicked', async () => {
    const user = userEvent.setup();
    render(<AddSpec />);
    await user.click(screen.getByText('+ Add Spec'));
    expect(screen.getByText('New Spec')).toBeInTheDocument();
    await user.click(screen.getByText('Close'));
    expect(screen.queryByText('New Spec')).not.toBeInTheDocument();
  });

  it('submits the form and calls upsertSpec + populateSpec', async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    render(<AddSpec onCreated={onCreated} />);

    await user.click(screen.getByText('+ Add Spec'));

    // Select a window from the menu
    await user.click(screen.getByText('Select a window or process...'));
    await waitFor(() => {
      expect(screen.getByText('Product')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Product'));

    // Submit form
    const submitBtn = screen.getByText('Create Spec');
    expect(submitBtn).not.toBeDisabled();
    await user.click(submitBtn);

    await waitFor(() => {
      expect(upsertSpec).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(populateSpec).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(onCreated).toHaveBeenCalled();
    });
  });

  it('shows success message after creation', async () => {
    const user = userEvent.setup();
    render(<AddSpec />);
    await user.click(screen.getByText('+ Add Spec'));

    // Type a name manually
    const nameInput = screen.getByPlaceholderText('Spec name (URL slug)');
    await user.type(nameInput, 'TestSpec');

    await user.click(screen.getByText('Create Spec'));
    await waitFor(() => {
      expect(screen.getByText(/Spec created/)).toBeInTheDocument();
    });
  });

  it('shows error message on submission failure', async () => {
    upsertSpec.mockRejectedValueOnce(new Error('Server error'));
    const user = userEvent.setup();
    render(<AddSpec />);
    await user.click(screen.getByText('+ Add Spec'));

    const nameInput = screen.getByPlaceholderText('Spec name (URL slug)');
    await user.type(nameInput, 'FailSpec');

    await user.click(screen.getByText('Create Spec'));
    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeInTheDocument();
    });
  });

  it('shows optional description field', async () => {
    const user = userEvent.setup();
    render(<AddSpec />);
    await user.click(screen.getByText('+ Add Spec'));
    expect(screen.getByPlaceholderText('Description (optional)')).toBeInTheDocument();
  });
});
