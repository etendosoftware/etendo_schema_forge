import { render, screen } from '@testing-library/react';
import { useSetPageMeta } from '@/components/layout/PageMetaContext';
import FirstStepsPage from '../FirstStepsPage.jsx';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('@/components/layout/PageMetaContext', () => ({
  useSetPageMeta: vi.fn(),
}));

describe('FirstStepsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets page metadata via useSetPageMeta instead of rendering a nested TopBar', () => {
    const { container } = render(<FirstStepsPage />);

    expect(useSetPageMeta).toHaveBeenCalledWith({
      title: 'firstStepsPageTitle',
    });

    // Proves there is no nested <header> rendered by FirstStepsPage itself
    expect(container.querySelector('header')).toBeNull();
    expect(container.querySelector('[data-testid="topbar-back"]')).toBeNull();
    expect(container.querySelector('[data-testid="global-search-trigger"]')).toBeNull();
  });

  it('renders step items and progress header', () => {
    render(<FirstStepsPage />);

    expect(screen.getByText('firstStepsPrepareAccount')).toBeInTheDocument();
    expect(screen.getByText('firstStepsCreateAccount')).toBeInTheDocument();
    expect(screen.getByText('firstStepsCompanyData')).toBeInTheDocument();
    expect(screen.getByTestId('FirstStepsPage')).toBeInTheDocument();
  });
});
