import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/i18n', () => ({
  useUI: () => (key, params) => params ? `${key}:${Object.values(params).join('|')}` : key,
}));

vi.mock('@/components/related-documents/helpers.js', () => ({
  neoBase: (apiBaseUrl) => apiBaseUrl.replace(/\/[^/]+$/, ''),
}));

vi.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({ checked, onChange }) => (
    <input type="checkbox" checked={checked} onChange={onChange} readOnly={!onChange} />
  ),
}));

import {
  CompareDrawer,
  ConfigDrawer,
  DrillDownPanel,
  FileGenModal,
  FileGenModal303,
  IncidentTray,
  NewDeclModal,
  PresentModal,
} from '../FmOverlays.jsx';

describe('FmOverlays interactive coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        organization: {
          taxId: 'A12345678',
          name: 'Etendo Org',
          address1: 'Main Street',
          cityLine: '28001 - Madrid (Madrid)',
        },
      }),
    }));
  });

  it('confirms each presentation path and requires a receipt for the ack path', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    const { rerender } = render(<PresentModal decl={{ id: 'd1' }} onConfirm={onConfirm} onClose={onClose} />);

    const confirm = screen.getByText('fm.action.confirm_presentation');
    expect(confirm).toBeDisabled();

    await user.click(screen.getByText('fm.present.path.acuse'));
    expect(confirm).toBeDisabled();
    const file = new File(['receipt'], 'acuse.pdf', { type: 'application/pdf' });
    fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [file] } });
    expect(confirm).not.toBeDisabled();
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith({ status: 'submitted_ack', acuseFile: file });
    expect(onClose).toHaveBeenCalled();

    onConfirm.mockClear();
    onClose.mockClear();
    rerender(<PresentModal decl={{ id: 'd1' }} onConfirm={onConfirm} onClose={onClose} />);
    await user.click(screen.getByText('fm.present.path.sin_acuse'));
    await user.click(screen.getByText('fm.action.confirm_presentation'));
    expect(onConfirm).toHaveBeenCalledWith({ status: 'submitted', acuseFile: null });

    onConfirm.mockClear();
    rerender(<PresentModal decl={{ id: 'd1' }} onConfirm={onConfirm} onClose={onClose} />);
    await user.click(screen.getByText('fm.present.path.otra'));
    await user.click(screen.getByText('fm.action.confirm_presentation'));
    expect(onConfirm).toHaveBeenCalledWith({ status: 'submitted_ext', acuseFile: null });
  });

  it('edits and confirms file generation contact data', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(<FileGenModal decl={{ model: '303', year: 2026, period: 'T2', phone: '111', contact: 'Ana' }} onConfirm={onConfirm} onClose={onClose} />);

    const inputs = screen.getAllByRole('textbox');
    await user.clear(inputs[0]);
    await user.type(inputs[0], 'Bea');
    await user.clear(inputs[1]);
    await user.type(inputs[1], '222');
    await user.click(screen.getByText('fm.filegen.generate'));

    expect(onConfirm).toHaveBeenCalledWith({ phone: '222', contact: 'Bea' });
    expect(onClose).toHaveBeenCalled();
  });

  it('creates a new declaration with edited model, year, and period', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(<NewDeclModal onConfirm={onConfirm} onClose={onClose} />);

    await user.selectOptions(screen.getByLabelText(/fm\.new_decl\.model/), '349');
    await user.selectOptions(screen.getByLabelText(/fm\.new_decl\.year/), '2025');
    await user.selectOptions(screen.getByLabelText(/fm\.new_decl\.period/), '01');
    await user.click(screen.getByText('fm.action.create'));

    expect(onConfirm).toHaveBeenCalledWith({ model: '349', year: 2025, period: '01', status: 'draft' });
    expect(onClose).toHaveBeenCalled();
  });

  it('renders incidents and closes the tray', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { rerender } = render(<IncidentTray incidents={[]} onClose={onClose} />);
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();

    rerender(<IncidentTray incidents={[{ message: 'Blocking issue', blocking: true }, { message: 'Warning issue', blocking: false }]} onClose={onClose} />);
    expect(screen.getByText(/Blocking issue/)).toBeInTheDocument();
    expect(screen.getByText(/Warning issue/)).toBeInTheDocument();
    await user.click(screen.getByLabelText('fm.action.close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('hydrates config drawer from session, edits declarant and model tabs, then saves', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ConfigDrawer model="349" token="tkn" apiBaseUrl="/sws/neo/fiscal-models" onClose={onClose} />);

    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/sws/neo/session', expect.objectContaining({
      headers: { Authorization: 'Bearer tkn' },
    })));
    expect(await screen.findByDisplayValue('Etendo Org')).toBeInTheDocument();
    expect(screen.getByDisplayValue('28001')).toBeInTheDocument();
    expect(screen.getAllByDisplayValue('Madrid')).toHaveLength(2);

    const orgNameInput = screen.getByDisplayValue('Etendo Org');
    await user.clear(orgNameInput);
    await user.type(orgNameInput, 'Updated Org');
    await user.click(screen.getByText('fm.config.m349.title'));
    expect(screen.getByText('fm.config.m349.keys')).toBeInTheDocument();
    await user.click(screen.getByText('fm.action.save'));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders comparison rows with explicit previous declaration and fallback previous data', () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <CompareDrawer
        decl={{ period: 'T2', year: 2026, boxes: { 1: 100, 27: 200, 45: 50, 46: 150, 59: 10, 60: 20 }, summary: {} }}
        prevDecl={{ period: 'T1', year: 2026, boxes: { 1: 80, 27: 100, 45: 60, 46: 40 } }}
        onClose={onClose}
      />,
    );
    expect(screen.getByText('T1 2026 → T2 2026')).toBeInTheDocument();
    expect(screen.getByText(/fm.compare.insight.dev_improved/)).toBeInTheDocument();

    rerender(
      <CompareDrawer
        decl={{ period: 'T3', year: 2026, boxes: { 27: 1, 46: -1 }, summary: { deductible: 2 } }}
        onClose={onClose}
      />,
    );
    expect(screen.getByText('T1 2026 → T3 2026')).toBeInTheDocument();
    fireEvent.click(screen.getByText('fm.action.close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('FileGenModal303: renders with default filename, edits it, and confirms', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    const decl = { model: '303', year: 2026, period: 'T2' };
    render(<FileGenModal303 decl={decl} onConfirm={onConfirm} onClose={onClose} />);

    expect(screen.getByText('fm.filegen303.title')).toBeInTheDocument();
    const input = screen.getByRole('textbox');
    expect(input.value).toBe('303_T2_2026.txt');

    await user.clear(input);
    await user.type(input, 'custom.303');
    await user.click(screen.getByText('fm.filegen.generate'));

    expect(onConfirm).toHaveBeenCalledWith({ filename: 'custom.303' });
    expect(onClose).toHaveBeenCalled();
  });

  it('FileGenModal303: passes undefined filename when input is blank, cancel closes without confirm', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(<FileGenModal303 decl={{ model: '303', year: 2026, period: 'T1' }} onConfirm={onConfirm} onClose={onClose} />);

    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.click(screen.getByText('fm.filegen.generate'));
    expect(onConfirm).toHaveBeenCalledWith({ filename: undefined });

    onConfirm.mockClear();
    onClose.mockClear();
    await user.click(screen.getByText('fm.action.cancel'));
    expect(onClose).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('renders drilldown content and closes', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<DrillDownPanel title="Details" onClose={onClose}><span>Panel content</span></DrillDownPanel>);

    expect(screen.getByText('Details')).toBeInTheDocument();
    expect(screen.getByText('Panel content')).toBeInTheDocument();
    await user.click(screen.getByLabelText('fm.action.close'));
    expect(onClose).toHaveBeenCalled();
  });
});
