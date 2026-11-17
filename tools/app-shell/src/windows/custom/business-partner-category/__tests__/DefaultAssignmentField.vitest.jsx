// @covers artifacts/business-partner-category/custom/DefaultAssignmentField.jsx
/**
 * Contact category header (flag on) — the `default` checkbox under the "Asignación
 * predeterminada" caption. Same field and same write path as the generic EntityForm checkbox:
 * the checkbox keeps the `field-default` test id and the AD label of IsDefault, a click writes the
 * flipped value through `onChange` and then commits (`onCommit`), and read-only blocks it. The
 * component draws its own caption (`ownsLabel`).
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ui: (key) => `ui:${key}`,
  label: (column) => `label:${column}`,
}));
vi.mock('@/i18n', () => ({ useUI: () => mocks.ui, useLabel: () => mocks.label }));

import DefaultAssignmentField from '@generated/business-partner-category/custom/DefaultAssignmentField.jsx';

function renderField(props) {
  const onChange = vi.fn();
  const onCommit = vi.fn();
  render(<DefaultAssignmentField onChange={onChange} onCommit={onCommit} {...props} />);
  return { onChange, onCommit, box: screen.getByTestId('field-default') };
}

describe('DefaultAssignmentField', () => {
  it('draws the caption as the name of its group, above the IsDefault checkbox', () => {
    const { box } = renderField({ value: false });
    const group = screen.getByRole('group', { name: 'ui:bpCategoryDefaultAssignment' });
    expect(group).toContainElement(box);
    expect(screen.getByRole('checkbox', { name: 'label:IsDefault' })).toBe(box);
    expect(DefaultAssignmentField.ownsLabel).toBe(true);
  });

  it.each([
    ['Y', true, false],
    ['N', false, true],
  ])('stored %s: shown checked=%s, a click writes %s, then commits', async (stored, shown, next) => {
    const { onChange, onCommit, box } = renderField({ value: stored });
    expect(box.checked).toBe(shown);
    await userEvent.click(box);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(next);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit.mock.invocationCallOrder[0]).toBeGreaterThan(onChange.mock.invocationCallOrder[0]);
  });

  it('read-only: the box is disabled and a click changes nothing', async () => {
    const { onChange, onCommit, box } = renderField({ value: 'Y', readOnly: true });
    expect(box).toBeDisabled();
    await userEvent.click(box);
    expect(onChange).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
  });
});
