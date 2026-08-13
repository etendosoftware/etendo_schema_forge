// Vitest render tests for FmDebugPanel

vi.mock('../fiscalModelsUtils.js', () => ({
  STATUSES: ['draft', 'ready', 'pending', 'submitted', 'submitted_ack'],
  STATUS_COLOR: { draft: 'gray', ready: 'green', pending: 'amber', submitted: 'blue', submitted_ack: 'teal' },
}));
vi.mock('../../fiscal-monitor/useDraggable.js', () => ({
  useDraggable: () => ({
    panelRef: { current: null },
    posStyle: {},
    handleMouseDown: vi.fn(),
  }),
}));

import { render, screen, fireEvent } from '@testing-library/react';
import FmDebugPanel from '../FmDebugPanel.jsx';

const mockView = {
  type: '303',
  decl: {
    id: 'debug-303-2026-T1',
    model: '303',
    year: 2026,
    period: 'T1',
    status: 'draft',
    incidents: { blocking: 0, warning: 0, items: [] },
    result: { kind: 'C', amount: 100 },
    type: 'ord',
    sources: [],
    history: [],
    boxes: {},
    summary: null,
    file: null,
  },
};

describe('FmDebugPanel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders panel header', () => {
    render(<FmDebugPanel view={mockView} setView={vi.fn()} />);
    expect(screen.getByText(/Debug/)).toBeInTheDocument();
  });

  it('shows declaration ID when decl exists', () => {
    render(<FmDebugPanel view={mockView} setView={vi.fn()} />);
    expect(screen.getByText('debug-303-2026-T1')).toBeInTheDocument();
  });

  it('shows "no decl" when view has no decl', () => {
    render(<FmDebugPanel view={{ type: 'list' }} setView={vi.fn()} />);
    expect(screen.getByText('no decl')).toBeInTheDocument();
  });

  it('renders tab buttons', () => {
    render(<FmDebugPanel view={mockView} setView={vi.fn()} />);
    expect(screen.getByText('status')).toBeInTheDocument();
    expect(screen.getByText('incidents')).toBeInTheDocument();
    expect(screen.getByText('data')).toBeInTheDocument();
    expect(screen.getByText('nav')).toBeInTheDocument();
    expect(screen.getByText('json')).toBeInTheDocument();
  });

  it('shows status buttons in status tab by default', () => {
    render(<FmDebugPanel view={mockView} setView={vi.fn()} />);
    expect(screen.getByText(/draft/)).toBeInTheDocument();
    expect(screen.getByText(/ready/)).toBeInTheDocument();
  });

  it('switches to incidents tab and shows blocking/warning controls', () => {
    render(<FmDebugPanel view={mockView} setView={vi.fn()} />);
    fireEvent.click(screen.getByText('incidents'));
    expect(screen.getByText('Blocking')).toBeInTheDocument();
    expect(screen.getByText('Warning')).toBeInTheDocument();
    expect(screen.getByText('Presets')).toBeInTheDocument();
  });

  it('switches to nav tab and shows navigation buttons', () => {
    render(<FmDebugPanel view={mockView} setView={vi.fn()} />);
    fireEvent.click(screen.getByText('nav'));
    expect(screen.getByText(/List page/)).toBeInTheDocument();
    expect(screen.getByText('Modelo 303')).toBeInTheDocument();
    expect(screen.getByText('Modelo 349')).toBeInTheDocument();
  });

  it('switches to json tab and shows current view JSON', () => {
    render(<FmDebugPanel view={mockView} setView={vi.fn()} />);
    fireEvent.click(screen.getByText('json'));
    expect(screen.getByText('Current view')).toBeInTheDocument();
  });

  it('collapses and expands panel', () => {
    render(<FmDebugPanel view={mockView} setView={vi.fn()} />);
    expect(screen.getByText('debug-303-2026-T1')).toBeInTheDocument();
    fireEvent.click(screen.getByText('▴'));
    expect(screen.queryByText('debug-303-2026-T1')).toBeNull();
    fireEvent.click(screen.getByText('▾'));
    expect(screen.getByText('debug-303-2026-T1')).toBeInTheDocument();
  });

  it('calls setView when status button is clicked', () => {
    const setView = vi.fn();
    render(<FmDebugPanel view={mockView} setView={setView} />);
    fireEvent.click(screen.getByText(/ready/));
    expect(setView).toHaveBeenCalled();
  });

  it('calls setView when nav list button is clicked', () => {
    const setView = vi.fn();
    render(<FmDebugPanel view={mockView} setView={setView} />);
    fireEvent.click(screen.getByText('nav'));
    fireEvent.click(screen.getByText(/List page/));
    expect(setView).toHaveBeenCalledWith({ type: 'list' });
  });

  it('shows view type badge', () => {
    render(<FmDebugPanel view={mockView} setView={vi.fn()} />);
    expect(screen.getByText('303')).toBeInTheDocument();
  });
});
