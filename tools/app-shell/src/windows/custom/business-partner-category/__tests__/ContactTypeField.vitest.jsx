// @covers artifacts/business-partner-category/custom/ContactTypeField.jsx
/**
 * Contact category header — "Tipo de contacto". Two checkboxes (Customer, Vendor/Creditor),
 * each named by its AD label. Toggling one writes the flipped value of that field and commits;
 * read-only blocks both. The field draws its own legend (required asterisk + hint).
 *
 * Since the Figma alignment it is only the header fallback for a role without the accounting
 * capability, and the "saved with contacts" notice is hosted by the window wrapper's form
 * (guarded in index.vitest.jsx), not here.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ui: (key) => `ui:${key}`,
  label: (column) => `label:${column}`,
}));
vi.mock('@/i18n', () => ({ useUI: () => mocks.ui, useLabel: () => mocks.label }));

import ContactTypeField from '@generated/business-partner-category/custom/ContactTypeField.jsx';

const FIELDS = [
  ['etgoIscustomer', 'label:EM_Etgo_Iscustomer'],
  ['etgoIsvendor', 'label:EM_Etgo_Isvendor'],
];

function renderField(props) {
  const onFieldChange = vi.fn();
  const onCommit = vi.fn();
  render(<ContactTypeField record={{}} onFieldChange={onFieldChange} onCommit={onCommit} {...props} />);
  return { onFieldChange, onCommit };
}

describe('ContactTypeField', () => {
  describe.each(FIELDS)('%s', (field, label) => {
    it.each([
      ['N', true],
      ['Y', false],
    ])('stored %s -> writes %s, then commits', async (stored, next) => {
      const { onFieldChange, onCommit } = renderField({ record: { [field]: stored } });
      await userEvent.click(screen.getByRole('checkbox', { name: label }));
      expect(onFieldChange).toHaveBeenCalledTimes(1);
      expect(onFieldChange).toHaveBeenCalledWith(field, next);
      expect(onCommit).toHaveBeenCalledTimes(1);
      expect(onCommit.mock.invocationCallOrder[0]).toBeGreaterThan(onFieldChange.mock.invocationCallOrder[0]);
    });

    it('read-only: the box is disabled and a click changes nothing', async () => {
      const { onFieldChange, onCommit } = renderField({ readOnly: true, record: { [field]: 'Y' } });
      const box = screen.getByRole('checkbox', { name: label });
      expect(box).toBeDisabled();
      await userEvent.click(box);
      expect(onFieldChange).not.toHaveBeenCalled();
      expect(onCommit).not.toHaveBeenCalled();
    });
  });

  it('draws its own legend with the required asterisk and the hint', () => {
    renderField();
    const group = screen.getByRole('group');
    const legend = within(group).getByText('ui:bpCategoryContactType').closest('legend');
    expect(legend).toHaveTextContent('ui:bpCategoryContactType*ui:bpCategoryContactTypeHint');
    expect(ContactTypeField.ownsLabel).toBe(true);
  });
});
