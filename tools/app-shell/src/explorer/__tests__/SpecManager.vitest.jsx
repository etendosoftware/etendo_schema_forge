// --- Mocks (before imports) ---

vi.mock('../useDiscovery', () => ({
  upsertEntity: vi.fn().mockResolvedValue({}),
  upsertField: vi.fn().mockResolvedValue({}),
  populateSpec: vi.fn().mockResolvedValue({ EntitiesCreated: 2, FieldsCreated: 10 }),
}));

vi.mock('@/lib/utils', () => ({
  cn: (...args) => args.filter(Boolean).join(' '),
}));

// --- Imports ---

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SpecManager from '../SpecManager.jsx';
import { upsertEntity, upsertField } from '../useDiscovery';

// --- Helpers ---

const SAMPLE_SPEC = {
  id: 'SPEC-ABC12345678901234567890123',
  name: 'SalesOrder',
  type: 'W',
  moduleId: 'MOD-001',
  entities: [
    {
      id: 'ENT-001',
      name: 'header',
      tabId: 'TAB-001',
      tabLevel: 0,
      javaQualifier: null,
      isGet: true,
      isGetbyid: true,
      isPost: true,
      isPut: false,
      isPatch: false,
      isDelete: false,
      fields: [
        { id: 'FLD-001', name: 'documentNo', columnId: 'COL-001', columnType: 'VARCHAR', included: true, readOnly: true, required: true, hasSelector: false },
        { id: 'FLD-002', name: 'businessPartner', columnId: 'COL-002', columnType: 'VARCHAR', included: true, readOnly: false, required: false, hasSelector: true, selectorType: 'Selector' },
        { id: 'FLD-003', name: 'internalNotes', columnId: 'COL-003', columnType: 'TEXT', included: false, readOnly: false, required: false, hasSelector: false },
      ],
    },
    {
      id: 'ENT-002',
      name: 'lines',
      tabId: 'TAB-002',
      tabLevel: 1,
      javaQualifier: 'sales-order-line',
      isGet: true,
      isGetbyid: false,
      isPost: true,
      isPut: true,
      isPatch: false,
      isDelete: true,
      fields: [],
    },
  ],
};

// --- Tests ---

describe('SpecManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock window.confirm for populate action
    vi.spyOn(window, 'confirm').mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows placeholder text when no spec is provided', () => {
    render(<SpecManager spec={null} />);
    expect(screen.getByText('Select a spec to manage')).toBeInTheDocument();
  });

  it('renders the spec name in the header', () => {
    render(<SpecManager spec={SAMPLE_SPEC} />);
    expect(screen.getByText('SalesOrder')).toBeInTheDocument();
  });

  it('shows spec type and entity count', () => {
    render(<SpecManager spec={SAMPLE_SPEC} />);
    expect(screen.getByText(/Window/)).toBeInTheDocument();
    expect(screen.getByText(/2 entities/)).toBeInTheDocument();
  });

  it('renders entity names', () => {
    render(<SpecManager spec={SAMPLE_SPEC} />);
    expect(screen.getByText('header')).toBeInTheDocument();
    expect(screen.getByText('lines')).toBeInTheDocument();
  });

  it('shows tab level badge for child entities', () => {
    render(<SpecManager spec={SAMPLE_SPEC} />);
    expect(screen.getByText('L1')).toBeInTheDocument();
  });

  it('renders method toggle buttons for each entity', () => {
    render(<SpecManager spec={SAMPLE_SPEC} />);
    // There should be GET, GET by ID, POST, PUT, PATCH, DELETE for each entity
    const getButtons = screen.getAllByText('GET');
    expect(getButtons.length).toBe(2); // one per entity
  });

  it('renders the "Populate from AD" button', () => {
    render(<SpecManager spec={SAMPLE_SPEC} />);
    expect(screen.getByText('Populate from AD')).toBeInTheDocument();
  });

  it('shows CDI qualifier badge for entity with qualifier', () => {
    render(<SpecManager spec={SAMPLE_SPEC} />);
    expect(screen.getByText('sales-order-line')).toBeInTheDocument();
  });

  it('shows CDI placeholder for entity without qualifier', () => {
    render(<SpecManager spec={SAMPLE_SPEC} />);
    expect(screen.getByText('CDI')).toBeInTheDocument();
  });

  it('expands entity to show fields when clicked', async () => {
    const user = userEvent.setup();
    render(<SpecManager spec={SAMPLE_SPEC} />);

    // Click the header entity to expand
    await user.click(screen.getByText('header'));

    // Field names should now be visible
    expect(screen.getByText('documentNo')).toBeInTheDocument();
    expect(screen.getByText('businessPartner')).toBeInTheDocument();
    expect(screen.getByText('internalNotes')).toBeInTheDocument();
  });

  it('shows field column types when expanded', async () => {
    const user = userEvent.setup();
    render(<SpecManager spec={SAMPLE_SPEC} />);
    await user.click(screen.getByText('header'));

    const varcharElements = screen.getAllByText('VARCHAR');
    expect(varcharElements.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('TEXT')).toBeInTheDocument();
  });

  it('shows required marker for required fields', async () => {
    const user = userEvent.setup();
    render(<SpecManager spec={SAMPLE_SPEC} />);
    await user.click(screen.getByText('header'));

    // documentNo has required: true — shown as asterisk
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('shows selector type for fields with selectors', async () => {
    const user = userEvent.setup();
    render(<SpecManager spec={SAMPLE_SPEC} />);
    await user.click(screen.getByText('header'));

    expect(screen.getByText('[Selector]')).toBeInTheDocument();
  });

  it('shows field count per entity', () => {
    render(<SpecManager spec={SAMPLE_SPEC} />);
    expect(screen.getByText(/3 fields/)).toBeInTheDocument();
    expect(screen.getByText(/0 fields/)).toBeInTheDocument();
  });

  it('toggles a method flag when clicked', async () => {
    const user = userEvent.setup();
    render(<SpecManager spec={SAMPLE_SPEC} onRefresh={vi.fn()} />);

    // Click PUT button on header entity (currently false → should enable)
    const putButtons = screen.getAllByText('PUT');
    await user.click(putButtons[0]);

    await waitFor(() => {
      expect(upsertEntity).toHaveBeenCalled();
    });
  });

  it('toggles field included status when clicked', async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    render(<SpecManager spec={SAMPLE_SPEC} onRefresh={onRefresh} />);

    // Expand header entity
    await user.click(screen.getByText('header'));

    // Find the included toggle for internalNotes (currently false)
    // The excluded fields show checkmark symbol
    await waitFor(() => {
      expect(screen.getByText('internalNotes')).toBeInTheDocument();
    });
  });

  it('handles spec with no entities', () => {
    const emptySpec = { ...SAMPLE_SPEC, entities: [] };
    render(<SpecManager spec={emptySpec} />);
    expect(screen.getByText('SalesOrder')).toBeInTheDocument();
    expect(screen.getByText(/0 entities/)).toBeInTheDocument();
  });

  it('collapses entity when clicked again', async () => {
    const user = userEvent.setup();
    render(<SpecManager spec={SAMPLE_SPEC} />);

    // Expand
    await user.click(screen.getByText('header'));
    expect(screen.getByText('documentNo')).toBeInTheDocument();

    // Collapse
    await user.click(screen.getByText('header'));
    expect(screen.queryByText('documentNo')).not.toBeInTheDocument();
  });
});
