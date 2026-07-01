import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('@/lib/dashboardNumberFormat', () => ({
  niceScale: (max) => ({
    niceMax: max || 100,
    ticks: max ? [0, max / 2, max] : [0, 50, 100],
  }),
  formatDashboardAxisTick: (val) => String(val),
  toBezierPath: (pts) => pts.map((p) => `${p.x},${p.y}`).join(' '),
  toBezierFillPath: (pts, baseY) => pts.map((p) => `${p.x},${p.y}`).join(' ') + ` ${baseY}`,
}));

vi.mock('@/lib/formatCurrency', () => ({
  formatCurrency: (currency, val) => `${currency} ${val}`,
}));

import { render, screen, fireEvent } from '@testing-library/react';
import { BPChartSVGContent } from '../BPChartSVGContent.jsx';

describe('BPChartSVGContent', () => {
  const baseProps = {
    labels: ['Jan', 'Feb', 'Mar'],
    revenue: [100, 200, 300],
    expenses: [50, 100, 150],
    CW: 400,
    CH: 200,
    PX: 40,
    PY: 20,
    PB: 20,
    fontSize: 9,
    chartId: 'test-chart',
    orgCurrency: 'USD',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders an SVG with correct viewBox', () => {
    render(<BPChartSVGContent {...baseProps} />);
    const svg = screen.getByRole('img');
    expect(svg).toHaveAttribute('viewBox', '0 0 400 200');
  });

  it('renders aria-label from ui key', () => {
    render(<BPChartSVGContent {...baseProps} />);
    const svg = screen.getByRole('img');
    expect(svg).toHaveAttribute('aria-label', 'bpSalesPurchasesChartAria');
  });

  it('renders x-axis labels', () => {
    render(<BPChartSVGContent {...baseProps} />);
    expect(screen.getByText('Jan')).toBeInTheDocument();
    expect(screen.getByText('Feb')).toBeInTheDocument();
    expect(screen.getByText('Mar')).toBeInTheDocument();
  });

  it('renders y-axis tick labels', () => {
    render(<BPChartSVGContent {...baseProps} />);
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('150')).toBeInTheDocument();
    expect(screen.getByText('300')).toBeInTheDocument();
  });

  it('shows no-data message when all values are zero', () => {
    render(
      <BPChartSVGContent
        {...baseProps}
        revenue={[0, 0, 0]}
        expenses={[0, 0, 0]}
      />,
    );
    expect(screen.getByText('bpNoInvoiceData')).toBeInTheDocument();
  });

  it('does not show no-data message when there is data', () => {
    render(<BPChartSVGContent {...baseProps} />);
    expect(screen.queryByText('bpNoInvoiceData')).not.toBeInTheDocument();
  });

  it('renders without crashing with empty arrays', () => {
    render(
      <BPChartSVGContent
        {...baseProps}
        labels={[]}
        revenue={[]}
        expenses={[]}
      />,
    );
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('renders without crashing with single data point', () => {
    render(
      <BPChartSVGContent
        {...baseProps}
        labels={['Jan']}
        revenue={[100]}
        expenses={[50]}
      />,
    );
    expect(screen.getByText('Jan')).toBeInTheDocument();
  });

  it('shows tooltip on mouse move', () => {
    const { container } = render(<BPChartSVGContent {...baseProps} />);
    const svg = container.querySelector('svg');

    // Simulate getBoundingClientRect
    svg.getBoundingClientRect = () => ({
      left: 0, top: 0, width: 400, height: 200,
      right: 400, bottom: 200, x: 0, y: 0, toJSON: () => {},
    });

    fireEvent.mouseMove(svg, { clientX: 200, clientY: 100 });

    // After hover, tooltip should show formatted currency values
    const usdTexts = screen.getAllByText(/USD/);
    expect(usdTexts.length).toBeGreaterThanOrEqual(1);
  });

  it('hides tooltip on mouse leave', () => {
    const { container } = render(<BPChartSVGContent {...baseProps} />);
    const svg = container.querySelector('svg');

    svg.getBoundingClientRect = () => ({
      left: 0, top: 0, width: 400, height: 200,
      right: 400, bottom: 200, x: 0, y: 0, toJSON: () => {},
    });

    fireEvent.mouseMove(svg, { clientX: 200, clientY: 100 });
    fireEvent.mouseLeave(svg);

    // Tooltip label should be gone
    const tooltipLabels = screen.queryAllByText(/USD/);
    expect(tooltipLabels).toHaveLength(0);
  });

  it('uses default props when optional ones are omitted', () => {
    render(
      <BPChartSVGContent
        CW={400}
        CH={200}
        PX={40}
        PY={20}
        PB={20}
      />,
    );
    const svg = screen.getByRole('img');
    expect(svg).toBeInTheDocument();
  });

  it('renders gradient definitions with chartId', () => {
    const { container } = render(<BPChartSVGContent {...baseProps} />);
    const revGrad = container.querySelector('#test-chart-rev-grad');
    const expGrad = container.querySelector('#test-chart-exp-grad');
    expect(revGrad).toBeInTheDocument();
    expect(expGrad).toBeInTheDocument();
  });

  it('renders hover dots when hovered over data', () => {
    const { container } = render(<BPChartSVGContent {...baseProps} />);
    const svg = container.querySelector('svg');

    svg.getBoundingClientRect = () => ({
      left: 0, top: 0, width: 400, height: 200,
      right: 400, bottom: 200, x: 0, y: 0, toJSON: () => {},
    });

    // No circles initially (hover dots)
    const circlesBefore = container.querySelectorAll('circle');
    const initialCount = circlesBefore.length;

    fireEvent.mouseMove(svg, { clientX: 200, clientY: 100 });

    const circlesAfter = container.querySelectorAll('circle');
    // Should have more circles (hover dots + tooltip dots)
    expect(circlesAfter.length).toBeGreaterThan(initialCount);
  });

  it('handles mouse move with zero-length revenue', () => {
    const { container } = render(
      <BPChartSVGContent
        {...baseProps}
        revenue={[]}
        expenses={[]}
        labels={[]}
      />,
    );
    const svg = container.querySelector('svg');

    svg.getBoundingClientRect = () => ({
      left: 0, top: 0, width: 400, height: 200,
      right: 400, bottom: 200, x: 0, y: 0, toJSON: () => {},
    });

    // Should not crash
    fireEvent.mouseMove(svg, { clientX: 200, clientY: 100 });
    expect(svg).toBeInTheDocument();
  });

  it('shows tooltip with label for hovered index', () => {
    const { container } = render(<BPChartSVGContent {...baseProps} />);
    const svg = container.querySelector('svg');

    svg.getBoundingClientRect = () => ({
      left: 0, top: 0, width: 400, height: 200,
      right: 400, bottom: 200, x: 0, y: 0, toJSON: () => {},
    });

    // Hover near the first data point (left side)
    fireEvent.mouseMove(svg, { clientX: 40, clientY: 100 });
    // The first label should appear in the tooltip
    const allJan = screen.getAllByText('Jan');
    expect(allJan.length).toBeGreaterThanOrEqual(1);
  });
});
