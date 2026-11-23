// @covers artifacts/remittance/custom/RemittanceStatusSelector.jsx
// @covers artifacts/remittance/custom/RemittanceStatusChange.jsx
//
// ETP-6247 — the header status chip as a selector: on PR and SB it opens a popover with the three flow
// chips (current dimmed and marked, the one valid transition clickable) and opens the step dialog.
// Real Popover and chips; the two step dialogs are stubbed (they have their own suites).
const mockUi = (key) => key;
vi.mock('@/i18n', () => ({ useUI: () => mockUi, useLocale: () => ({}) }));
vi.mock('@generated/remittance/custom/RemittanceSentDialog.jsx', () => ({
  default: (props) => (
    <div data-testid="selector-sent-dialog" data-record={props.record?.id} data-api={props.apiBaseUrl}>
      <button type="button" data-testid="selector-dialog-refresh" onClick={() => props.onRefresh()}>refresh</button>
      <button type="button" data-testid="selector-dialog-close" onClick={() => props.onClose()}>close</button>
    </div>
  ),
}));
vi.mock('@generated/remittance/custom/RemittanceConfirmDialog.jsx', () => ({
  default: (props) => (
    <div data-testid="host-confirm-dialog" data-record={props.record?.id} data-process={props.process?.name} data-grouping={props.process?.params?.[0]?.key}>
      <button type="button" data-testid="host-confirm-close" onClick={() => props.onClose()}>close</button>
    </div>
  ),
}));
vi.mock('@generated/remittance/custom/RemittanceCollectDialog.jsx', () => ({
  default: (props) => <div data-testid="selector-collect-dialog" data-record={props.record?.id} />,
}));

import { act, fireEvent, render, screen } from '@testing-library/react';
import RemittanceStatusSelector, { SELECTABLE_STATUSES } from '@generated/remittance/custom/RemittanceStatusSelector.jsx';

const renderSelector = (status, extra = {}) => {
  const onRefresh = vi.fn();
  const utils = render(<RemittanceStatusSelector data={{ id: 'rem-1', remittanceStatus: status }} apiBaseUrl="/sws/neo/remittance" onRefresh={onRefresh} {...extra} />);
  return { ...utils, onRefresh };
};
const open = () => fireEvent.click(screen.getByTestId('remittance-status-selector'));
const option = (status) => screen.getByTestId(`remittance-status-option-${status}`);

describe('RemittanceStatusSelector', () => {
  it.each([['PE'], ['CT'], ['PT'], ['CP'], ['PP'], ['AN'], [undefined]])('renders nothing on %s (the plain pill stays)', (status) => {
    const { container } = renderSelector(status);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing without a record id', () => {
    const { container } = render(<RemittanceStatusSelector data={{ remittanceStatus: 'PR' }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('is offered exactly on PR and SB', () => {
    expect([...SELECTABLE_STATUSES].sort()).toEqual(['PR', 'SB']);
  });

  it('on PR the trigger is the current chip with a chevron, and the menu is closed until clicked', () => {
    renderSelector('PR');
    const trigger = screen.getByTestId('remittance-status-selector');
    expect(trigger).toHaveTextContent('remittanceStatusPr');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('remittance-status-menu')).toBeNull();
  });

  it('on PR the menu lists the three chips: PR current and dimmed, only «Enviada al banco» clickable', () => {
    renderSelector('PR');
    open();
    expect(['PR', 'SB', 'CT'].map((s) => option(s).disabled)).toEqual([true, false, true]);
    expect(option('PR')).toHaveAttribute('data-current', 'true');
    expect(option('SB')).not.toHaveAttribute('data-current');
    expect(option('SB')).toHaveTextContent('remittanceStatusSb');
    expect(option('CT')).toHaveTextContent('remittanceStatusCt');
  });

  it('on SB only «Cobrada» is clickable (no way back, no PR -> Cobrada)', () => {
    renderSelector('SB');
    open();
    expect(['PR', 'SB', 'CT'].map((s) => option(s).disabled)).toEqual([true, true, false]);
    expect(option('SB')).toHaveAttribute('data-current', 'true');
  });

  it('choosing «Enviada al banco» closes the menu and opens the sent dialog on the record, with the api base', () => {
    renderSelector('PR');
    open();
    fireEvent.click(option('SB'));
    expect(screen.queryByTestId('remittance-status-menu')).toBeNull();
    expect(screen.getByTestId('selector-sent-dialog')).toHaveAttribute('data-record', 'rem-1');
    expect(screen.getByTestId('selector-sent-dialog')).toHaveAttribute('data-api', '/sws/neo/remittance');
  });

  it('choosing «Cobrada» from SB opens the collect dialog', () => {
    renderSelector('SB');
    open();
    fireEvent.click(option('CT'));
    expect(screen.getByTestId('selector-collect-dialog')).toHaveAttribute('data-record', 'rem-1');
  });

  it('a disabled option opens nothing', () => {
    renderSelector('PR');
    open();
    fireEvent.click(option('CT'));
    fireEvent.click(option('PR'));
    expect(screen.queryByTestId('selector-sent-dialog')).toBeNull();
    expect(screen.queryByTestId('selector-collect-dialog')).toBeNull();
  });

  it('the dialog refreshes the record through onRefresh and closing removes it', () => {
    const { onRefresh } = renderSelector('PR');
    open();
    fireEvent.click(option('SB'));
    fireEvent.click(screen.getByTestId('selector-dialog-refresh'));
    expect(onRefresh).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('selector-dialog-close'));
    expect(screen.queryByTestId('selector-sent-dialog')).toBeNull();
  });
});

describe('RemittanceStatusSelector — «Confirmar» dialog host', () => {
  const fire = () => act(() => { window.dispatchEvent(new CustomEvent('remittance:open-confirm-modal')); });

  it('opens the confirm dialog (with the declared grouping param) on the header «Confirmar» event, for a saved pending remittance', () => {
    renderSelector('PE', { data: { id: 'rem-1', remittanceStatus: 'PE', processed: false } });
    expect(screen.queryByTestId('host-confirm-dialog')).toBeNull();
    fire();
    expect(screen.getByTestId('host-confirm-dialog')).toHaveAttribute('data-record', 'rem-1');
    expect(screen.getByTestId('host-confirm-dialog')).toHaveAttribute('data-process', 'confirm');
    expect(screen.getByTestId('host-confirm-dialog')).toHaveAttribute('data-grouping', 'grouping');
    fireEvent.click(screen.getByTestId('host-confirm-close'));
    expect(screen.queryByTestId('host-confirm-dialog')).toBeNull();
  });

  it('ignores the event on an unsaved or already processed remittance', () => {
    const { unmount } = renderSelector('PE', { data: { remittanceStatus: 'PE', processed: false } });
    fire();
    expect(screen.queryByTestId('host-confirm-dialog')).toBeNull();
    unmount();
    renderSelector('PR', { data: { id: 'rem-1', remittanceStatus: 'PR', processed: 'Y' } });
    fire();
    expect(screen.queryByTestId('host-confirm-dialog')).toBeNull();
  });

  it('stops listening once unmounted', () => {
    const { unmount } = renderSelector('PE', { data: { id: 'rem-1', remittanceStatus: 'PE', processed: false } });
    unmount();
    fire();
    expect(screen.queryByTestId('host-confirm-dialog')).toBeNull();
  });
});
