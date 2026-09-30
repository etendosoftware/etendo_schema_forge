vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLocale: () => ({ genericLabels: {}, statuses: {} }),
}));

import { render, screen } from '@testing-library/react';
import ProgressFieldBadge from '../ProgressFieldBadge.jsx';

const renderBadge = (props) =>
  render(<ProgressFieldBadge label="Delivered" testId="p-badge" documentStatus="CO" {...props} />);

describe('ProgressFieldBadge', () => {
  it('renders neutral at 0% when completed', () => {
    renderBadge({ value: 0 });
    const el = screen.getByTestId('p-badge');
    expect(el).toHaveTextContent('Delivered 0%');
    expect(el).toHaveAttribute('data-tone', 'neutral');
    expect(el).toHaveAttribute('data-show-icon', 'false');
  });

  it('renders warning at 67%', () => {
    renderBadge({ value: 67 });
    const el = screen.getByTestId('p-badge');
    expect(el).toHaveTextContent('Delivered 67%');
    expect(el).toHaveAttribute('data-tone', 'warning');
  });

  it('renders success at 100%', () => {
    renderBadge({ value: 100 });
    const el = screen.getByTestId('p-badge');
    expect(el).toHaveTextContent('Delivered 100%');
    expect(el).toHaveAttribute('data-tone', 'success');
  });

  it('rounds 99.8 up to 100% and renders success when completed', () => {
    renderBadge({ value: 99.8 });
    const el = screen.getByTestId('p-badge');
    expect(el).toHaveTextContent('Delivered 100%');
    expect(el).toHaveAttribute('data-tone', 'success');
  });

  it('rounds 0.4 down to 0% and renders neutral when completed', () => {
    renderBadge({ value: 0.4 });
    const el = screen.getByTestId('p-badge');
    expect(el).toHaveTextContent('Delivered 0%');
    expect(el).toHaveAttribute('data-tone', 'neutral');
  });

  it('accepts numeric strings', () => {
    renderBadge({ value: '50' });
    expect(screen.getByTestId('p-badge')).toHaveTextContent('Delivered 50%');
  });

  it('clamps values above 100', () => {
    renderBadge({ value: 150 });
    expect(screen.getByTestId('p-badge')).toHaveTextContent('Delivered 100%');
  });

  it('clamps negative values to 0', () => {
    renderBadge({ value: -5 });
    expect(screen.getByTestId('p-badge')).toHaveTextContent('Delivered 0%');
  });

  it('rounds fractional values', () => {
    renderBadge({ value: 66.6 });
    expect(screen.getByTestId('p-badge')).toHaveTextContent('Delivered 67%');
  });

  it.each([[null], [''], ['abc'], [undefined]])('renders nothing for value %j', (value) => {
    const { container } = renderBadge({ value });
    expect(container).toBeEmptyDOMElement();
  });

  it.each([['DR'], ['VO'], [undefined], [null]])('renders nothing when documentStatus is %j', (documentStatus) => {
    const { container } = renderBadge({ value: 100, documentStatus });
    expect(container).toBeEmptyDOMElement();
  });

  describe('showWhenPositive', () => {
    it('renders nothing for DR + 0', () => {
      const { container } = renderBadge({ value: 0, documentStatus: 'DR', showWhenPositive: true });
      expect(container).toBeEmptyDOMElement();
    });

    it('renders for DR + 1', () => {
      renderBadge({ value: 1, documentStatus: 'DR', showWhenPositive: true });
      expect(screen.getByTestId('p-badge')).toHaveTextContent('Delivered 1%');
    });

    it('renders success for DR + 100', () => {
      renderBadge({ value: 100, documentStatus: 'DR', showWhenPositive: true });
      const el = screen.getByTestId('p-badge');
      expect(el).toHaveTextContent('Delivered 100%');
      expect(el).toHaveAttribute('data-tone', 'success');
    });

    it('renders nothing for DR + 100 without the flag (default unchanged)', () => {
      const { container } = renderBadge({ value: 100, documentStatus: 'DR' });
      expect(container).toBeEmptyDOMElement();
    });

    it('renders neutral for CO + 0', () => {
      renderBadge({ value: 0, documentStatus: 'CO', showWhenPositive: true });
      const el = screen.getByTestId('p-badge');
      expect(el).toHaveTextContent('Delivered 0%');
      expect(el).toHaveAttribute('data-tone', 'neutral');
    });

    it('renders nothing for null value', () => {
      const { container } = renderBadge({ value: null, documentStatus: 'CO', showWhenPositive: true });
      expect(container).toBeEmptyDOMElement();
    });
  });
});
