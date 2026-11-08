// @covers tools/app-shell/src/components/contract-ui/ListModalCompactDialog.jsx
//
// The list-modal compact popup (templateConfig.modalVariant: "compact"). Purely
// presentational: EntityForm is stubbed to record what each run receives, so the
// tests assert the grouping into runs, the props forwarded to each run, the title /
// subtitle / error, and the footer buttons.

import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const entityFormCalls = [];
vi.mock('../EntityForm.jsx', () => ({
  EntityForm: (props) => {
    entityFormCalls.push(props);
    return (
      <div
        data-testid="entity-form-run"
        data-gap={String(props.gap)}
        data-cols={String(props.cols)}
        data-variant={props.variant}>
        {props.fields.map((f) => <span key={f.key} data-testid={`run-field-${f.key}`} />)}
      </div>
    );
  },
}));

import { ListModalCompactDialog, splitCompactRuns } from '../ListModalCompactDialog.jsx';

const ui = (key) => key;

const FIELDS = [
  { key: 'name', type: 'text', span: 2 },
  { key: 'days', type: 'number', stepper: true, span: 2 },
  { key: 'isDefault', type: 'checkbox' },
  { key: 'nbd', type: 'checkbox' },
];

function renderDialog(props = {}) {
  const onClose = vi.fn();
  const onSubmit = vi.fn();
  const onFieldChange = vi.fn();
  const utils = render(
    <ListModalCompactDialog
      open
      onClose={onClose}
      title="ptEdit"
      fields={FIELDS}
      entity="header"
      formData={{ name: 'A' }}
      onFieldChange={onFieldChange}
      api={{ labelOverrides: { NetDays: 'Días' } }}
      token="tok"
      apiBaseUrl="http://x"
      onSubmit={onSubmit}
      submitDisabled={false}
      submitting={false}
      submitLabel="save"
      ui={ui}
      {...props}
    />,
  );
  return { ...utils, onClose, onSubmit, onFieldChange };
}

beforeEach(() => {
  entityFormCalls.length = 0;
});

describe('splitCompactRuns', () => {
  it('groups consecutive checkboxes into one run and keeps the field order', () => {
    const runs = splitCompactRuns(FIELDS);
    expect(runs.map((r) => r.checkbox)).toEqual([false, true]);
    expect(runs[0].fields.map((f) => f.key)).toEqual(['name', 'days']);
    expect(runs[1].fields.map((f) => f.key)).toEqual(['isDefault', 'nbd']);
  });

  it('keys each run by its first field', () => {
    expect(splitCompactRuns(FIELDS).map((r) => r.key)).toEqual(['name', 'isDefault']);
  });

  it('starts a new run each time the kind changes (no reordering)', () => {
    const runs = splitCompactRuns([
      { key: 'a', type: 'checkbox' },
      { key: 'b', type: 'text' },
      { key: 'c', type: 'checkbox' },
      { key: 'd', type: 'checkbox' },
      { key: 'e', type: 'number' },
    ]);
    expect(runs.map((r) => r.fields.map((f) => f.key))).toEqual([['a'], ['b'], ['c', 'd'], ['e']]);
    expect(runs.map((r) => r.checkbox)).toEqual([true, false, true, false]);
  });

  it('does not treat a toggle checkbox as part of a checkbox group', () => {
    const runs = splitCompactRuns([
      { key: 'a', type: 'checkbox' },
      { key: 'b', type: 'checkbox', toggle: true },
    ]);
    expect(runs.map((r) => r.checkbox)).toEqual([true, false]);
  });

  it('drops span (one column) without mutating the input fields', () => {
    const input = [{ key: 'name', type: 'text', span: 2 }];
    const [run] = splitCompactRuns(input);
    expect(run.fields[0].span).toBeUndefined();
    expect(input[0].span).toBe(2);
  });

  it('returns no runs for no fields', () => {
    expect(splitCompactRuns([])).toEqual([]);
  });
});

describe('ListModalCompactDialog — body', () => {
  it('renders one single-column compact EntityForm per run with the run gap', () => {
    renderDialog();
    const runs = screen.getAllByTestId('entity-form-run');
    expect(runs).toHaveLength(2);
    expect(runs.map((r) => r.dataset.gap)).toEqual(['20', '16']);
    expect(runs.every((r) => r.dataset.cols === '1' && r.dataset.variant === 'compact')).toBe(true);
    expect(within(runs[0]).getByTestId('run-field-days')).toBeInTheDocument();
    expect(within(runs[1]).getByTestId('run-field-nbd')).toBeInTheDocument();
  });

  it('forwards the form state, the change handler and the label overrides to every run', () => {
    const { onFieldChange } = renderDialog();
    const last = entityFormCalls.at(-1);
    expect(last.entity).toBe('header');
    expect(last.data).toEqual({ name: 'A' });
    expect(last.onChange).toBe(onFieldChange);
    expect(last.labelOverrides).toEqual({ NetDays: 'Días' });
    expect(last.token).toBe('tok');
    expect(last.apiBaseUrl).toBe('http://x');
  });

  it('renders nothing while closed', () => {
    renderDialog({ open: false });
    expect(screen.queryByTestId('list-modal-compact-dialog')).toBeNull();
  });
});

describe('ListModalCompactDialog — header', () => {
  it('shows the title it is given', () => {
    renderDialog({ title: 'createRecord' });
    expect(screen.getByRole('dialog')).toHaveTextContent('createRecord');
  });

  it('shows the subtitle only when one is given', () => {
    const { rerender } = renderDialog();
    expect(screen.queryByTestId('list-modal-subtitle')).toBeNull();
    rerender(
      <ListModalCompactDialog
        open onClose={vi.fn()} title="t" subtitle="sub" fields={FIELDS} entity="header"
        formData={{}} onFieldChange={vi.fn()} onSubmit={vi.fn()} submitLabel="save" ui={ui} />,
    );
    expect(screen.getByTestId('list-modal-subtitle')).toHaveTextContent('sub');
  });

  it('shows the form error as an alert', () => {
    renderDialog({ formError: 'Duplicated name' });
    expect(screen.getByRole('alert')).toHaveTextContent('Duplicated name');
  });
});

describe('ListModalCompactDialog — footer and close', () => {
  it('Cancel closes', () => {
    const { onClose, onSubmit } = renderDialog();
    fireEvent.click(screen.getByTestId('list-modal-cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByTestId('list-modal-cancel')).toHaveTextContent('cancel');
  });

  it('the X button closes and carries the translated close label', () => {
    const { onClose } = renderDialog();
    const x = screen.getByTestId('list-modal-close');
    expect(x).toHaveAttribute('aria-label', 'close');
    fireEvent.click(x);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Escape closes through onOpenChange', () => {
    const { onClose } = renderDialog();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('the primary pill shows the submit label and submits', () => {
    const { onSubmit } = renderDialog({ submitLabel: 'save' });
    const submit = screen.getByTestId('list-modal-submit');
    expect(submit).toHaveTextContent('save');
    fireEvent.click(submit);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('disables the submit pill when submitDisabled', () => {
    const { onSubmit } = renderDialog({ submitDisabled: true });
    fireEvent.click(screen.getByTestId('list-modal-submit'));
    expect(screen.getByTestId('list-modal-submit')).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('while submitting: the pill reads "saving" and Cancel is disabled', () => {
    renderDialog({ submitting: true, submitDisabled: true });
    expect(screen.getByTestId('list-modal-submit')).toHaveTextContent('saving');
    expect(screen.getByTestId('list-modal-cancel')).toBeDisabled();
  });
});

// QA BUG-1: the round X was never visible. DialogContent hides the base dialog's own close with
// `[&>button]:hidden` (every DIRECT child button), and the custom X was a direct child too, so it
// got display:none. jsdom applies no Tailwind, so a click test passes regardless — this guards
// the structural contract the CSS relies on instead.
describe('ListModalCompactDialog — custom close survives the built-in-close hiding', () => {
  it('never places the custom X where the direct-child button rule hides it', () => {
    renderDialog();
    const dialog = screen.getByRole('dialog');
    const x = screen.getByTestId('list-modal-close');
    const hidesDirectButtons = dialog.className.includes('[&>button]:hidden');
    expect(hidesDirectButtons && x.parentElement === dialog).toBe(false);
  });

  it('still hides the base dialog close (a direct child button) so only one X shows', () => {
    renderDialog();
    const dialog = screen.getByRole('dialog');
    const directButtons = [...dialog.children].filter((el) => el.tagName === 'BUTTON');
    expect(directButtons.every((b) => b.getAttribute('data-testid') !== 'list-modal-close')).toBe(true);
    expect(dialog.className).toContain('[&>button]:hidden');
  });
});
