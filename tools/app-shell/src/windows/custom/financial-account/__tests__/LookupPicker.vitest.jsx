import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { LookupPicker } from '../LookupPicker.jsx';

const RESULTS = [{ id: '1', name: 'Acme S.L.' }, { id: '2', name: 'Beta Corp' }];
const useFakeLookup = () => ({ results: RESULTS, loading: false });
const useEmptyLookup = () => ({ results: [], loading: false });
const useLoadingLookup = () => ({ results: [], loading: true });

function renderPicker(overrides = {}) {
  const props = {
    value: null,
    onSelect: vi.fn(),
    onClear: vi.fn(),
    placeholder: 'Buscar…',
    useLookup: useFakeLookup,
    dataTestId: 'lp-input',
    ...overrides,
  };
  return { ...render(<LookupPicker {...props} />), props };
}

describe('LookupPicker', () => {
  it('opens the results dropdown on focus and reports the picked item', async () => {
    const user = userEvent.setup();
    const { props } = renderPicker();

    // Closed initially.
    expect(screen.queryByText('Acme S.L.')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('lp-input'));

    // The portalled dropdown shows both results.
    expect(await screen.findByText('Acme S.L.')).toBeInTheDocument();
    expect(screen.getByText('Beta Corp')).toBeInTheDocument();

    await user.click(screen.getByText('Acme S.L.'));
    expect(props.onSelect).toHaveBeenCalledWith({ id: '1', name: 'Acme S.L.' });
  });

  it('renders the search icon and pads the input when search is set', () => {
    renderPicker({ search: true });
    expect(screen.getByTestId('lp-input').className).toContain('pl-8');
  });

  it('initialises the input from value.name and clears the selection on edit', async () => {
    const user = userEvent.setup();
    const { props } = renderPicker({ value: { id: '9', name: 'Old' } });
    const input = screen.getByTestId('lp-input');
    expect(input).toHaveValue('Old');

    await user.type(input, 'x');
    expect(props.onClear).toHaveBeenCalled();
  });

  it('shows the loading hint while results are pending', async () => {
    const user = userEvent.setup();
    renderPicker({ useLookup: useLoadingLookup });
    await user.click(screen.getByTestId('lp-input'));
    expect(await screen.findByText('…')).toBeInTheDocument();
  });

  it('renders no dropdown when there are no results', async () => {
    const user = userEvent.setup();
    renderPicker({ useLookup: useEmptyLookup });
    await user.click(screen.getByTestId('lp-input'));
    await waitFor(() => expect(screen.queryByText('Acme S.L.')).not.toBeInTheDocument());
  });
});
