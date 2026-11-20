// @covers tools/app-shell/src/components/financial-accounts/CreditorIdControls.jsx
//
// The creditor-id controls: the label and plain field shared by the remittance block and the account modal.
const ui = (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key);

import { fireEvent, render, screen } from '@testing-library/react';
import { CreditorIdField, CreditorIdLabel } from '../CreditorIdControls.jsx';

const VALID = 'ES82000B87654323';
const input = () => screen.getByTestId('cid-input');

describe('CreditorIdLabel', () => {
  it('names the field and carries the short help tooltip', () => {
    render(<CreditorIdLabel ui={ui} testId="cid" />);
    expect(screen.getByTestId('cid-label')).toHaveTextContent('sepaCreditorId');
    expect(screen.getByTestId('cid-info')).toHaveAttribute('aria-label', 'sepaCreditorIdInfo');
  });
});

describe('CreditorIdField', () => {
  it('is a plain input with a neutral placeholder: no buttons, no origin caption, no proposal', () => {
    render(<CreditorIdField ui={ui} value="" onChange={vi.fn()} testId="cid" />);
    expect(input()).toHaveValue('');
    expect(input()).toHaveAttribute('placeholder', 'sepaCreditorIdPlaceholder');
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByTestId('cid-source')).toBeNull();
    expect(screen.queryByTestId('cid-error')).toBeNull();
  });

  it('reports what is typed and shows the translated error it is given', () => {
    const onChange = vi.fn();
    const { rerender } = render(<CreditorIdField ui={ui} value="" onChange={onChange} testId="cid" />);
    fireEvent.change(input(), { target: { value: 'xx' } });
    expect(onChange).toHaveBeenCalledWith('xx');
    rerender(<CreditorIdField ui={ui} value="xx" onChange={onChange} errorKey="sepaCreditorIdInvalidFormat" testId="cid" />);
    expect(screen.getByTestId('cid-error')).toHaveTextContent('sepaCreditorIdInvalidFormat');
    expect(input()).toHaveAttribute('aria-invalid', 'true');
    expect(input()).toHaveAttribute('aria-describedby', 'cid-error');
  });

  it('uses the same white fill as the other fields of the account modal', () => {
    render(<CreditorIdField ui={ui} value="" onChange={vi.fn()} testId="cid" />);
    expect(input()).toHaveClass('bg-card');
    expect(input()).not.toBeDisabled();
  });

  it('can be disabled while the form saves', () => {
    render(<CreditorIdField ui={ui} value={VALID} onChange={vi.fn()} disabled testId="cid" />);
    expect(input()).toBeDisabled();
  });
});
