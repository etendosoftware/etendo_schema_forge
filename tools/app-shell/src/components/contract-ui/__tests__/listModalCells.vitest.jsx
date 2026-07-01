// Unit tests for the generic list-modal cell-renderer registry
// (listModalCells.jsx). Each cellType is exercised in isolation; the deep UI
// deps (Switch) and resolveIdentifier are mocked so the renderers can run in
// jsdom without their real implementations.

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

// Switch → a checkbox-like button that forwards onCheckedChange(!checked).
vi.mock('@/components/ui/switch', () => ({
  Switch: ({ checked, disabled, onCheckedChange, 'data-testid': testid, 'aria-label': ariaLabel }) => (
    <button
      type="button"
      role="switch"
      aria-checked={!!checked}
      aria-label={ariaLabel}
      disabled={!!disabled}
      data-testid={testid}
      onClick={() => onCheckedChange?.(!checked)}
    >
      switch
    </button>
  ),
}));

// resolveIdentifier (real-ish): $_identifier wins, else the raw value.
vi.mock('@/lib/resolveIdentifier.js', () => ({
  resolveIdentifier: (row, key) => row?.[`${key}$_identifier`] ?? row?.[key],
}));

import { ListModalCell, cellAlignClass } from '../listModalCells.jsx';

// tMenu echoes its key (so derived labels assert against the key name).
const tMenu = (key) => key;
const EM_DASH = '—';

describe('ListModalCell — priorityPill', () => {
  const col = { key: 'priority', cellType: 'priorityPill' };

  it('renders the numeric value', () => {
    render(<ListModalCell row={{ priority: 30 }} col={col} tMenu={tMenu} />);
    expect(screen.getByText('30')).toBeInTheDocument();
  });

  it('renders an em-dash when the value is empty', () => {
    const { container } = render(<ListModalCell row={{}} col={col} tMenu={tMenu} />);
    expect(container.textContent).toContain(EM_DASH);
  });
});

describe('ListModalCell — nameWithSubline', () => {
  it('renders the name plus the prefixed subline from subField', () => {
    const col = { key: 'name', cellType: 'nameWithSubline', subField: 'partner' };
    render(
      <ListModalCell
        row={{ name: 'Alpha rule', partner$_identifier: 'Acme Corp' }}
        col={col}
        tMenu={tMenu}
      />,
    );
    expect(screen.getByText('Alpha rule')).toBeInTheDocument();
    expect(screen.getByText('→ Acme Corp')).toBeInTheDocument();
  });

  it('honors a custom subPrefix', () => {
    const col = { key: 'name', cellType: 'nameWithSubline', subField: 'partner', subPrefix: '· ' };
    render(
      <ListModalCell row={{ name: 'Alpha', partner: 'Acme' }} col={col} tMenu={tMenu} />,
    );
    expect(screen.getByText('· Acme')).toBeInTheDocument();
  });

  it('renders only the name when no subField value resolves', () => {
    const col = { key: 'name', cellType: 'nameWithSubline', subField: 'partner' };
    render(<ListModalCell row={{ name: 'Solo' }} col={col} tMenu={tMenu} />);
    expect(screen.getByText('Solo')).toBeInTheDocument();
    expect(screen.queryByText(/→/)).not.toBeInTheDocument();
  });
});

describe('ListModalCell — conditionChip', () => {
  it('renders <kindLabel>: "<pattern>"', () => {
    const col = {
      key: 'condition',
      cellType: 'conditionChip',
      kindField: 'kind',
      patternField: 'pattern',
      kindLabels: { C: 'matchKindContains', S: 'matchKindStarts' },
    };
    render(
      <ListModalCell row={{ kind: 'C', pattern: 'INV-2024' }} col={col} tMenu={tMenu} />,
    );
    expect(screen.getByText('matchKindContains: "INV-2024"')).toBeInTheDocument();
  });

  it('renders an em-dash when neither kind nor pattern resolve', () => {
    const col = {
      key: 'condition',
      cellType: 'conditionChip',
      kindField: 'kind',
      patternField: 'pattern',
      kindLabels: { C: 'matchKindContains' },
    };
    const { container } = render(<ListModalCell row={{}} col={col} tMenu={tMenu} />);
    expect(container.textContent).toContain(EM_DASH);
  });
});

describe('ListModalCell — typePill', () => {
  const col = {
    key: 'type',
    cellType: 'typePill',
    enumLabels: { A: 'typeAuto', M: 'typeManual' },
    tones: { A: 'green', M: 'amber' },
  };

  it('renders the enum label resolved via enumLabels + tMenu', () => {
    render(<ListModalCell row={{ type: 'A' }} col={col} tMenu={tMenu} />);
    expect(screen.getByText('typeAuto')).toBeInTheDocument();
  });

  it('applies the tone class declared for the value', () => {
    render(<ListModalCell row={{ type: 'A' }} col={col} tMenu={tMenu} />);
    // green tone → border-[#ABEFC6] in TONE_CLASSES.
    expect(screen.getByText('typeAuto').className).toContain('#ABEFC6');
  });

  it('renders an em-dash when the value is empty', () => {
    const { container } = render(<ListModalCell row={{}} col={col} tMenu={tMenu} />);
    expect(container.textContent).toContain(EM_DASH);
  });
});

describe('ListModalCell — percent', () => {
  const col = { key: 'rate', cellType: 'percent' };

  it('renders N%', () => {
    render(<ListModalCell row={{ rate: 75 }} col={col} tMenu={tMenu} />);
    expect(screen.getByText('75%')).toBeInTheDocument();
  });

  it('renders 0% when the value is empty', () => {
    render(<ListModalCell row={{}} col={col} tMenu={tMenu} />);
    expect(screen.getByText('0%')).toBeInTheDocument();
  });
});

describe('ListModalCell — boldText', () => {
  const col = { key: 'code', cellType: 'boldText' };

  it('renders the value with font-semibold', () => {
    render(<ListModalCell row={{ code: 'MR-001' }} col={col} tMenu={tMenu} />);
    const node = screen.getByText('MR-001');
    expect(node).toBeInTheDocument();
    expect(node.className).toContain('font-semibold');
  });

  it('renders an em-dash when the value is empty', () => {
    const { container } = render(<ListModalCell row={{}} col={col} tMenu={tMenu} />);
    expect(container.textContent).toContain(EM_DASH);
  });
});

describe('ListModalCell — toggle', () => {
  it('renders a Switch and calls onToggle(row, col, next) when clicked', () => {
    const onToggle = vi.fn();
    const col = { key: 'active', cellType: 'toggle' };
    const row = { id: '7', active: false };
    render(<ListModalCell row={row} col={col} tMenu={tMenu} onToggle={onToggle} />);

    const sw = screen.getByRole('switch');
    expect(sw).toBeInTheDocument();
    fireEvent.click(sw);
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith(row, col, true);
  });

  it('renders a Switch for the legacy `toggle: true` flag (no cellType)', () => {
    const onToggle = vi.fn();
    const col = { key: 'active', toggle: true };
    render(<ListModalCell row={{ id: '8', active: true }} col={col} tMenu={tMenu} onToggle={onToggle} />);
    const sw = screen.getByRole('switch');
    fireEvent.click(sw);
    // checked=true → next is false.
    expect(onToggle).toHaveBeenCalledWith({ id: '8', active: true }, col, false);
  });

  it('stops pointer-down propagation on the wrapper div', () => {
    const col = { key: 'active', cellType: 'toggle' };
    const row = { id: '9', active: false };
    const { container } = render(<ListModalCell row={row} col={col} tMenu={tMenu} />);
    const wrapper = container.querySelector('[role="presentation"]');
    expect(wrapper).toBeInTheDocument();
    const event = new PointerEvent('pointerdown', { bubbles: true, cancelable: true });
    const stopSpy = vi.spyOn(event, 'stopPropagation');
    wrapper.dispatchEvent(event);
    expect(stopSpy).toHaveBeenCalled();
  });
});

describe('ListModalCell — default cell', () => {
  it('resolves an enum label for enum columns', () => {
    const col = { key: 'state', type: 'enum', enumLabels: { OK: 'stateOk' } };
    render(<ListModalCell row={{ state: 'OK' }} col={col} tMenu={tMenu} />);
    expect(screen.getByText('stateOk')).toBeInTheDocument();
  });

  it('resolves identifier for selector columns', () => {
    const col = { key: 'partner', type: 'selector' };
    render(<ListModalCell row={{ partner: 'raw-id', 'partner$_identifier': 'Acme Corp' }} col={col} tMenu={tMenu} />);
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
  });

  it('resolves identifier for foreignKey columns', () => {
    const col = { key: 'product', type: 'foreignKey' };
    render(<ListModalCell row={{ product: 'P-001', 'product$_identifier': 'Widget' }} col={col} tMenu={tMenu} />);
    expect(screen.getByText('Widget')).toBeInTheDocument();
  });

  it('renders an em-dash for an empty raw value', () => {
    const col = { key: 'note', type: 'string' };
    const { container } = render(<ListModalCell row={{}} col={col} tMenu={tMenu} />);
    expect(container.textContent).toContain(EM_DASH);
  });
});

describe('cellAlignClass', () => {
  it('centers toggle cells', () => {
    expect(cellAlignClass({ cellType: 'toggle' })).toBe('text-center');
    expect(cellAlignClass({ toggle: true })).toBe('text-center');
  });

  it('left-aligns everything else', () => {
    expect(cellAlignClass({ cellType: 'percent' })).toBe('text-left');
    expect(cellAlignClass({ cellType: 'priorityPill' })).toBe('text-left');
    expect(cellAlignClass({})).toBe('text-left');
  });
});
