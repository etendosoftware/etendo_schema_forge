// @covers tools/app-shell/src/lib/iconDefaults.js
import { render } from '@testing-library/react';
import { IconContext, TrashIcon } from '@phosphor-icons/react';
import { ICON_DEFAULTS } from '../iconDefaults.js';

describe('ICON_DEFAULTS (ETP-6155)', () => {
  it('gives an icon with no props the 24px footprint', () => {
    const { container } = render(
      <IconContext.Provider value={ICON_DEFAULTS}><TrashIcon /></IconContext.Provider>,
    );
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '24');
    expect(svg).toHaveAttribute('height', '24');
  });

  it('lets an explicit size override the context', () => {
    const { container } = render(
      <IconContext.Provider value={ICON_DEFAULTS}><TrashIcon size={16} /></IconContext.Provider>,
    );
    expect(container.querySelector('svg')).toHaveAttribute('width', '16');
  });

  it('defaults to the regular weight, which fill overrides', () => {
    expect(ICON_DEFAULTS.weight).toBe('regular');
    const { container } = render(
      <IconContext.Provider value={ICON_DEFAULTS}><TrashIcon /><TrashIcon weight="fill" /></IconContext.Provider>,
    );
    const [regular, fill] = container.querySelectorAll('svg');
    expect(regular.innerHTML).not.toBe(fill.innerHTML);
  });
});
