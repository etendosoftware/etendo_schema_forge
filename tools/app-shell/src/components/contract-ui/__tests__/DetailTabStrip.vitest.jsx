// @covers tools/app-shell/src/components/contract-ui/DetailTabStrip.jsx
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

import DetailTabStrip from '../DetailTabStrip.jsx';

const tMenu = (k) => k;
const makeTabs = (n, extra = {}) =>
  Array.from({ length: n }, (_, i) => ({ key: `t${i}`, label: `Label${i}`, count: null, ...(extra[i] ?? {}) }));

function renderStrip({ tabs, activeIndex = 0, onSelect = vi.fn() }) {
  const utils = render(<DetailTabStrip tabs={tabs} activeIndex={activeIndex} onSelect={onSelect} tMenu={tMenu} />);
  return { ...utils, onSelect, rerenderWith: (idx) => utils.rerender(
    <DetailTabStrip tabs={tabs} activeIndex={idx} onSelect={onSelect} tMenu={tMenu} />) };
}

describe('DetailTabStrip', () => {
  it('shows no More button with 4 or fewer tabs', () => {
    renderStrip({ tabs: makeTabs(4) });
    expect(screen.getAllByTestId(/^tab-t/)).toHaveLength(4);
    expect(screen.queryByTestId('detail-tab-more')).not.toBeInTheDocument();
  });

  it('with 6 tabs shows 4 buttons plus More with the hidden count', () => {
    renderStrip({ tabs: makeTabs(6) });
    expect(screen.getAllByTestId(/^tab-t/)).toHaveLength(4);
    expect(screen.queryByTestId('tab-t4')).not.toBeInTheDocument();
    const more = screen.getByTestId('detail-tab-more');
    expect(more).toHaveTextContent('more');
    expect(more).toHaveTextContent('2');
  });

  it('lists hidden tabs with counters and selects with the ORIGINAL index', async () => {
    const user = userEvent.setup();
    const { onSelect, rerenderWith } = renderStrip({ tabs: makeTabs(6, { 5: { count: 7 } }) });
    await user.click(screen.getByTestId('detail-tab-more'));
    const menu = await screen.findByTestId('detail-tab-more-menu');
    expect(within(menu).getByTestId('detail-tab-more-item-t4')).toBeInTheDocument();
    const item = within(menu).getByTestId('detail-tab-more-item-t5');
    expect(item).toHaveTextContent('Label5');
    expect(item).toHaveTextContent('7');
    await user.click(item);
    expect(onSelect).toHaveBeenCalledWith(5);

    rerenderWith(5);
    expect(screen.getByTestId('tab-t5')).toBeInTheDocument();
    expect(screen.queryByTestId('tab-t3')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('detail-tab-more'));
    expect(await screen.findByTestId('detail-tab-more-item-t3')).toBeInTheDocument();
  });

  it('disables menu items with a title when saveFirstHint is set and does not select them', async () => {
    const user = userEvent.setup();
    const { onSelect } = renderStrip({ tabs: makeTabs(6, { 4: { saveFirstHint: 'save first' } }) });
    await user.click(screen.getByTestId('detail-tab-more'));
    const item = await screen.findByTestId('detail-tab-more-item-t4');
    expect(item).toHaveAttribute('title', 'save first');
    expect(item).toHaveAttribute('aria-disabled', 'true');
    await user.click(item);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('width probe adds no text nodes and no duplicate testids', () => {
    const { container } = renderStrip({ tabs: makeTabs(6, { 0: { count: 3 } }) });
    expect(screen.getAllByText('Label0')).toHaveLength(1);
    expect(screen.getAllByText('Label3')).toHaveLength(1);
    expect(screen.getAllByText('more')).toHaveLength(1);
    const ids = Array.from(container.querySelectorAll('[data-testid]'), (e) => e.getAttribute('data-testid'));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps button semantics, no tab role', () => {
    renderStrip({ tabs: makeTabs(6) });
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    expect(screen.getByRole('button', { name: /Label1/ })).toBe(screen.getByTestId('tab-t1'));
  });
});
