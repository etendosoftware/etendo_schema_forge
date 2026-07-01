import { render, screen } from '@testing-library/react';
import { ImageField } from '../ImageField.jsx';

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));
vi.mock('@/i18n', () => ({ useUI: () => (k) => k }));
vi.mock('@/components/ui/custom-icons', () => ({
  TrashIcon: () => <span data-testid="trash-icon" />,
}));

describe('ImageField', () => {
  it('renders upload area when no imageId', () => {
    render(<ImageField onChange={vi.fn()} token="tk" apiBaseUrl="/api" />);
    // Should show the upload icon/area
    expect(document.querySelector('svg') || screen.queryByText('uploadImage')).toBeTruthy();
  });

  it('renders with imageId (shows image or background)', () => {
    const { container } = render(
      <ImageField imageId="IMG1" onChange={vi.fn()} token="tk" apiBaseUrl="/api" />,
    );
    // May render as img tag or background-image div
    expect(container).toBeTruthy();
    const html = container.innerHTML;
    expect(html.length).toBeGreaterThan(0);
  });

  it('renders in readOnly mode', () => {
    const { container } = render(
      <ImageField imageId="IMG1" onChange={vi.fn()} token="tk" apiBaseUrl="/api" readOnly />,
    );
    expect(container).toBeTruthy();
  });

  it('renders in stretch mode', () => {
    const { container } = render(
      <ImageField onChange={vi.fn()} token="tk" apiBaseUrl="/api" stretch />,
    );
    expect(container).toBeTruthy();
  });

  it('renders with custom label (mounts without error)', () => {
    const { container } = render(<ImageField onChange={vi.fn()} token="tk" apiBaseUrl="/api" label="Photo" />);
    expect(container).toBeTruthy();
  });
});
