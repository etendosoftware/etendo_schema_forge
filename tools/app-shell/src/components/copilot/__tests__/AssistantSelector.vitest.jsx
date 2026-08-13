import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ── Mocks ──
vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('@/components/ui/button.jsx', () => ({
  Button: ({ children, onClick, ...props }) => (
    <button onClick={onClick} {...props}>{children}</button>
  ),
}));

vi.mock('@/components/ui/input.jsx', () => ({
  Input: (props) => <input {...props} />,
}));

vi.mock('@/lib/utils', () => ({
  cn: (...args) => args.filter(Boolean).join(' '),
}));

import { AssistantSelector } from '../AssistantSelector.jsx';

const ASSISTANTS = [
  { app_id: 'a1', name: 'Alpha Agent', description: 'Does alpha things', featured: 'Y' },
  { app_id: 'a2', name: 'Beta Agent', description: 'Does beta things', featured: 'N' },
  { app_id: 'a3', name: 'Gamma Agent', description: 'Featured too', featured: 'Y' },
];

const BASE_PROPS = {
  assistants: ASSISTANTS,
  filter: '',
  onFilterChange: vi.fn(),
  onSelect: vi.fn(),
  isLoading: false,
  welcomeMessage: '',
  error: '',
};

describe('AssistantSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders welcome message from i18n when none provided', () => {
    render(<AssistantSelector {...BASE_PROPS} />);
    expect(screen.getByText('copilotWelcome')).toBeInTheDocument();
  });

  it('renders custom welcome message when provided', () => {
    render(<AssistantSelector {...BASE_PROPS} welcomeMessage="Hello!" />);
    expect(screen.getByText('Hello!')).toBeInTheDocument();
    expect(screen.queryByText('copilotWelcome')).not.toBeInTheDocument();
  });

  it('shows only featured assistants by default', () => {
    render(<AssistantSelector {...BASE_PROPS} />);
    expect(screen.getByText('Alpha Agent')).toBeInTheDocument();
    expect(screen.getByText('Gamma Agent')).toBeInTheDocument();
    expect(screen.queryByText('Beta Agent')).not.toBeInTheDocument();
  });

  it('shows all assistants after toggling featured filter off', () => {
    render(<AssistantSelector {...BASE_PROPS} />);
    const starBtn = screen.getByLabelText('copilotFeaturedOnly');
    fireEvent.click(starBtn);
    expect(screen.getByText('Alpha Agent')).toBeInTheDocument();
    expect(screen.getByText('Beta Agent')).toBeInTheDocument();
    expect(screen.getByText('Gamma Agent')).toBeInTheDocument();
  });

  it('toggles back to featured only on second click', () => {
    render(<AssistantSelector {...BASE_PROPS} />);
    const starBtn = screen.getByLabelText('copilotFeaturedOnly');
    fireEvent.click(starBtn); // show all
    fireEvent.click(starBtn); // back to featured
    expect(screen.queryByText('Beta Agent')).not.toBeInTheDocument();
  });

  it('filters assistants by name based on filter prop', () => {
    render(<AssistantSelector {...BASE_PROPS} filter="Alpha" />);
    expect(screen.getByText('Alpha Agent')).toBeInTheDocument();
    expect(screen.queryByText('Gamma Agent')).not.toBeInTheDocument();
  });

  it('filters assistants by description', () => {
    render(<AssistantSelector {...BASE_PROPS} filter="Featured too" />);
    expect(screen.getByText('Gamma Agent')).toBeInTheDocument();
    expect(screen.queryByText('Alpha Agent')).not.toBeInTheDocument();
  });

  it('filter is case-insensitive', () => {
    render(<AssistantSelector {...BASE_PROPS} filter="alpha" />);
    expect(screen.getByText('Alpha Agent')).toBeInTheDocument();
  });

  it('calls onFilterChange when typing in filter input', async () => {
    const user = userEvent.setup();
    render(<AssistantSelector {...BASE_PROPS} />);
    const input = screen.getByPlaceholderText('copilotFilterProfiles');
    await user.type(input, 'x');
    expect(BASE_PROPS.onFilterChange).toHaveBeenCalled();
  });

  it('calls onSelect when clicking an assistant', () => {
    render(<AssistantSelector {...BASE_PROPS} />);
    fireEvent.click(screen.getByText('Alpha Agent'));
    expect(BASE_PROPS.onSelect).toHaveBeenCalledWith(ASSISTANTS[0]);
  });

  it('shows loading state', () => {
    render(<AssistantSelector {...BASE_PROPS} isLoading={true} />);
    expect(screen.getByText('copilotLoadingAssistants')).toBeInTheDocument();
  });

  it('shows empty state when no assistants match', () => {
    render(<AssistantSelector {...BASE_PROPS} assistants={[]} />);
    expect(screen.getByText('copilotNoAssistants')).toBeInTheDocument();
  });

  it('shows error message instead of empty text when provided', () => {
    render(<AssistantSelector {...BASE_PROPS} assistants={[]} error="Something went wrong" />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.queryByText('copilotNoAssistants')).not.toBeInTheDocument();
  });

  it('renders assistant descriptions', () => {
    render(<AssistantSelector {...BASE_PROPS} />);
    expect(screen.getByText('Does alpha things')).toBeInTheDocument();
  });

  it('renders with empty assistants array by default', () => {
    render(<AssistantSelector onFilterChange={vi.fn()} onSelect={vi.fn()} />);
    expect(screen.getByText('copilotNoAssistants')).toBeInTheDocument();
  });

  it('does not show assistant grid during loading even with assistants', () => {
    render(<AssistantSelector {...BASE_PROPS} isLoading={true} />);
    expect(screen.queryByText('Alpha Agent')).not.toBeInTheDocument();
    expect(screen.getByText('copilotLoadingAssistants')).toBeInTheDocument();
  });
});
