// @covers tools/app-shell/src/windows/custom/fiscal-models/models/390/FileGenModal390.jsx
// @covers tools/app-shell/src/windows/custom/fiscal-models/models/303/AeatResultBanner.jsx
//
// Modelo 390 — the "Generar fichero 390" popup: while the page generates and the AEAT validates
// the file it stays open on the loading ring and nothing in it can be clicked again; afterwards
// it shows the validator's answer (rejected / accepted with warnings / could not be validated)
// or closes (a clean file, or a generation the page already explained).
import { vi, describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import FileGenModal390 from '../FileGenModal390.jsx';

/** A `t` that echoes the key and its params, so the tests see what was asked. */
const t = (key, params) => (params && Object.keys(params).length ? `${key}|${JSON.stringify(params)}` : key);
const line = (code, message) => `fm.m390.file_validation.error_line|${JSON.stringify({ code, message })}`;

const DECL = { id: 'D1', year: 2026, period: '0A' };

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function renderModal(overrides = {}) {
  const props = {
    decl: DECL,
    summary: { result: 360 },
    typeLabel: 'type-label',
    resultLabel: 'result-label',
    onConfirm: vi.fn().mockResolvedValue(null),
    onViewIncidents: vi.fn(),
    onClose: vi.fn(),
    t,
    ...overrides,
  };
  render(<FileGenModal390 {...props} />);
  return props;
}

/** Clicks Generar and waits for the handler to settle. */
async function generate() {
  await act(async () => { fireEvent.click(screen.getByTestId('FileGenModal390__confirm')); });
}

/** The banner (AeatResultBanner root) that holds the given title. */
const bannerOf = (titleKey) => screen.getByText(titleKey).parentElement.parentElement;
const itemsOf = (testId) => [...screen.getByTestId(testId).querySelectorAll('li')].map(li => li.textContent);

describe('FileGenModal390 — file name step', () => {
  it('offers the default file name and the summary, with Generar and Cancelar', () => {
    renderModal();
    expect(screen.getByTestId('FileGenModal390__fileName').value).toBe('390_0A_2026.txt');
    expect(screen.getByTestId('FileGenModal390__summary').textContent).toContain('type-label');
    expect(screen.getByTestId('FileGenModal390__summary').textContent).toContain('result-label');
    expect(screen.getByTestId('FileGenModal390__confirm').textContent).toBe('fm.filegen.generate');
    expect(screen.getByTestId('FileGenModal390__close').textContent).toBe('fm.action.cancel');
    expect(screen.queryByTestId('FileGenModal390__validating')).toBeNull();
    expect(screen.queryByTestId('FileGenModal390__result')).toBeNull();
  });

  it('hands the trimmed file name to the handler', async () => {
    const first = renderModal();
    fireEvent.change(screen.getByTestId('FileGenModal390__fileName'), { target: { value: '  mine.txt ' } });
    await generate();
    expect(first.onConfirm).toHaveBeenCalledWith({ fileName: 'mine.txt' });
  });

  it('hands undefined when the file name is blank', async () => {
    const { onConfirm } = renderModal();
    fireEvent.change(screen.getByTestId('FileGenModal390__fileName'), { target: { value: '   ' } });
    await generate();
    expect(onConfirm).toHaveBeenCalledWith({ fileName: undefined });
  });

  it('Cancelar, the close button and the overlay close it before generating', () => {
    const { onClose, onConfirm } = renderModal();
    fireEvent.click(screen.getByTestId('FileGenModal390__close'));
    fireEvent.click(screen.getByLabelText('fm.action.close'));
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalledTimes(3);
    // a click inside the modal is not an overlay click
    fireEvent.click(screen.getByTestId('FileGenModal390'));
    expect(onClose).toHaveBeenCalledTimes(3);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe('FileGenModal390 — while the file is generated and validated', () => {
  // userEvent (not fireEvent): it honours `disabled`, which is what makes the buttons inert.
  it('shows the loading ring with the validating text and nothing can be clicked again', async () => {
    const user = userEvent.setup();
    const pending = deferred();
    const { onConfirm, onClose } = renderModal({ onConfirm: vi.fn(() => pending.promise) });

    await user.click(screen.getByTestId('FileGenModal390__confirm'));

    const loading = screen.getByTestId('FileGenModal390__validating');
    expect(loading).toHaveAttribute('role', 'status');
    expect(loading.textContent).toContain('fm.m390.file_validation.validating');
    expect(loading.querySelector('svg text').textContent).toMatch(/^\d+%$/);
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-busy', 'true');
    // the file name step is gone while it works
    expect(screen.queryByTestId('FileGenModal390__fileName')).toBeNull();

    const confirm = screen.getByTestId('FileGenModal390__confirm');
    const cancel = screen.getByTestId('FileGenModal390__close');
    const closeX = screen.getByLabelText('fm.action.close');
    expect(confirm).toBeDisabled();
    expect(cancel).toBeDisabled();
    expect(closeX).toBeDisabled();

    await user.click(confirm);
    await user.click(cancel);
    await user.click(closeX);
    // the overlay is not a button: its own guard keeps it inert
    fireEvent.click(screen.getByRole('dialog'));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => { pending.resolve(null); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a second raw click on Generar while it works does not call the handler again', async () => {
    const pending = deferred();
    const { onConfirm } = renderModal({ onConfirm: vi.fn(() => pending.promise) });
    await generate();
    await generate();
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await act(async () => { pending.resolve(null); });
  });

  it('the ring advances while it waits', async () => {
    vi.useFakeTimers();
    try {
      const pending = deferred();
      renderModal({ onConfirm: vi.fn(() => pending.promise) });
      await generate();
      const percent = () => screen.getByTestId('FileGenModal390__validating').querySelector('svg text').textContent;
      expect(percent()).toBe('0%');
      await act(async () => { vi.advanceTimersByTime(80 * 5); });
      expect(percent()).toBe('20%');
      await act(async () => { pending.resolve(null); });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('FileGenModal390 — result step', () => {
  it('rejected: the red banner lists each AEAT error as "code — message", with "Ver incidencias" and "Cerrar"', async () => {
    const validation = {
      outcome: 'rejected',
      errors: [{ code: '390E01', message: 'Casilla 33 incorrecta' }, { code: '', message: 'Sin codigo' }],
      warnings: [],
    };
    const { onClose } = renderModal({ onConfirm: vi.fn().mockResolvedValue(validation) });
    await generate();

    expect(screen.getByTestId('FileGenModal390__result')).toBeInTheDocument();
    expect(bannerOf('fm.m390.file_validation.rejected.title').style.color).toBe('var(--fm-danger-fg)');
    // an entry without a code shows its message alone
    expect(itemsOf('FileGenModal390__errors')).toEqual([line('390E01', 'Casilla 33 incorrecta'), 'Sin codigo']);
    expect(screen.getByText('fm.m390.file_validation.rejected.body')).toBeInTheDocument();
    expect(screen.queryByTestId('FileGenModal390__warnings')).toBeNull();

    expect(screen.getByTestId('FileGenModal390__viewIncidents').textContent).toBe('fm.m390.file_validation.view_incidents');
    expect(screen.getByTestId('FileGenModal390__close').textContent).toBe('fm.action.close');
    expect(screen.queryByTestId('FileGenModal390__confirm')).toBeNull();
    expect(screen.queryByTestId('FileGenModal390__validating')).toBeNull();
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-busy', 'false');
    // the popup stays open on the result
    expect(onClose).not.toHaveBeenCalled();
  });

  it('rejected with AEAT warnings: they are listed under the errors', async () => {
    const validation = {
      outcome: 'rejected',
      errors: [{ code: '390E01', message: 'err' }],
      warnings: [{ code: '390A01', message: 'warn' }],
    };
    renderModal({ onConfirm: vi.fn().mockResolvedValue(validation) });
    await generate();
    expect(itemsOf('FileGenModal390__errors')).toEqual([line('390E01', 'err')]);
    expect(screen.getByText('fm.aeat.warnings.title')).toBeInTheDocument();
    expect(itemsOf('FileGenModal390__warnings')).toEqual([line('390A01', 'warn')]);
  });

  it('accepted with warnings: the amber banner lists them, with "Ver incidencias"', async () => {
    const validation = {
      outcome: 'accepted', errors: [],
      warnings: [{ code: '390A01', message: 'Aviso uno' }, { code: '390A02', message: 'Aviso dos' }],
    };
    const { onClose } = renderModal({ onConfirm: vi.fn().mockResolvedValue(validation) });
    await generate();

    expect(bannerOf('fm.m390.file_validation.warnings.title').style.color).toBe('var(--fm-warning-fg)');
    expect(itemsOf('FileGenModal390__warnings')).toEqual([line('390A01', 'Aviso uno'), line('390A02', 'Aviso dos')]);
    expect(screen.getByText('fm.m390.file_validation.warnings.body')).toBeInTheDocument();
    expect(screen.queryByTestId('FileGenModal390__errors')).toBeNull();
    expect(screen.getByTestId('FileGenModal390__viewIncidents')).toBeInTheDocument();
    expect(screen.getByTestId('FileGenModal390__close').textContent).toBe('fm.action.close');
    expect(screen.queryByTestId('FileGenModal390__confirm')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it.each(['connection_failure', 'not_validated'])(
    '%s: the amber "could not be validated" banner, with "Cerrar" only',
    async (outcome) => {
      const { onClose } = renderModal({ onConfirm: vi.fn().mockResolvedValue({ outcome, errors: [], warnings: [] }) });
      await generate();

      expect(bannerOf('fm.m390.file_validation.unavailable.title').style.color).toBe('var(--fm-warning-fg)');
      expect(screen.getByText('fm.m390.file_validation.unavailable.body')).toBeInTheDocument();
      expect(screen.queryByTestId('FileGenModal390__errors')).toBeNull();
      expect(screen.queryByTestId('FileGenModal390__warnings')).toBeNull();
      expect(screen.queryByTestId('FileGenModal390__viewIncidents')).toBeNull();
      expect(screen.queryByTestId('FileGenModal390__confirm')).toBeNull();
      expect(screen.getByTestId('FileGenModal390__close').textContent).toBe('fm.action.close');
      expect(onClose).not.toHaveBeenCalled();

      fireEvent.click(screen.getByTestId('FileGenModal390__close'));
      expect(onClose).toHaveBeenCalledTimes(1);
    },
  );

  it('accepted without warnings: the popup closes and shows no result step', async () => {
    const { onClose } = renderModal({ onConfirm: vi.fn().mockResolvedValue({ outcome: 'accepted', errors: [], warnings: [] }) });
    await generate();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('FileGenModal390__result')).toBeNull();
    expect(screen.queryByTestId('FileGenModal390__validating')).toBeNull();
  });

  it('nothing to show (the page already explained the failure): the popup closes', async () => {
    const { onClose } = renderModal({ onConfirm: vi.fn().mockResolvedValue(null) });
    await generate();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('FileGenModal390__result')).toBeNull();
  });

  it('a handler that rejects closes the popup', async () => {
    const { onClose } = renderModal({ onConfirm: vi.fn().mockRejectedValue(new Error('boom')) });
    await generate();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('FileGenModal390__result')).toBeNull();
    expect(screen.queryByTestId('FileGenModal390__validating')).toBeNull();
  });

  it('"Ver incidencias" calls its handler and closes the popup', async () => {
    const validation = { outcome: 'rejected', errors: [{ code: 'E', message: 'm' }], warnings: [] };
    const { onViewIncidents, onClose } = renderModal({ onConfirm: vi.fn().mockResolvedValue(validation) });
    await generate();
    fireEvent.click(screen.getByTestId('FileGenModal390__viewIncidents'));
    expect(onViewIncidents).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('offers no "Ver incidencias" without its handler', async () => {
    const validation = { outcome: 'rejected', errors: [{ code: 'E', message: 'm' }], warnings: [] };
    renderModal({ onConfirm: vi.fn().mockResolvedValue(validation), onViewIncidents: undefined });
    await generate();
    expect(screen.getByTestId('FileGenModal390__errors')).toBeInTheDocument();
    expect(screen.queryByTestId('FileGenModal390__viewIncidents')).toBeNull();
  });
});
