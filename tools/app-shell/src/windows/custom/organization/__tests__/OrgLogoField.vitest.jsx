import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const toastError = vi.fn();
vi.mock('sonner', () => ({ toast: { error: (...args) => toastError(...args) } }));
vi.mock('@/i18n', () => ({
  useUI: () => (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key),
}));

import OrgLogoField from '../OrgLogoField.jsx';

function makeFile(name, size, type) {
  return new File([new ArrayBuffer(size)], name, { type });
}

function getFileInput(container) {
  return container.querySelector('input[type="file"]');
}

describe('OrgLogoField', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn();
  });

  it('shows the organization initials when there is no logo', () => {
    render(<OrgLogoField imageId="" orgName="Acme Corp" token="tk" apiBaseUrl="/sws/neo/organization" onChange={vi.fn()} />);
    expect(screen.getByTestId('OrgLogoField__initials')).toHaveTextContent('AC');
  });

  it('falls back to "?" when there is no logo and no organization name yet', () => {
    render(<OrgLogoField imageId="" orgName="" token="tk" apiBaseUrl="/sws/neo/organization" onChange={vi.fn()} />);
    expect(screen.getByTestId('OrgLogoField__initials')).toHaveTextContent('?');
  });

  it('rejects a file larger than 2MB — no upload request is made', async () => {
    const onChange = vi.fn();
    const { container } = render(
      <OrgLogoField imageId="" orgName="Acme" token="tk" apiBaseUrl="/sws/neo/organization" onChange={onChange} />
    );
    const bigFile = makeFile('logo.png', 3 * 1024 * 1024, 'image/png');
    fireEvent.change(getFileInput(container), { target: { files: [bigFile] } });

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(toastError.mock.calls[0][0]).toContain('imageTooLarge');
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('rejects an unsupported extension (.gif) — no upload request is made', async () => {
    const onChange = vi.fn();
    const { container } = render(
      <OrgLogoField imageId="" orgName="Acme" token="tk" apiBaseUrl="/sws/neo/organization" onChange={onChange} />
    );
    const gifFile = makeFile('logo.gif', 1024, 'image/gif');
    fireEvent.change(getFileInput(container), { target: { files: [gifFile] } });

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('imageInvalidType'));
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('accepts PNG/JPG/SVG within the 2MB limit and calls onChange with the returned imageId', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ imageId: 'IMG_NEW' }),
    });
    const onChange = vi.fn();
    const { container } = render(
      <OrgLogoField imageId="" orgName="Acme" token="tk" apiBaseUrl="/sws/neo/organization" onChange={onChange} />
    );
    const svgFile = makeFile('logo.svg', 1024, 'image/svg+xml');
    fireEvent.change(getFileInput(container), { target: { files: [svgFile] } });

    await waitFor(() => expect(onChange).toHaveBeenCalledWith('IMG_NEW'));
    expect(toastError).not.toHaveBeenCalled();
  });

  it('truncates a filename longer than 60 chars in the real upload request body, preserving the extension', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ imageId: 'IMG_NEW' }),
    });
    const onChange = vi.fn();
    const { container } = render(
      <OrgLogoField imageId="" orgName="Acme" token="tk" apiBaseUrl="/sws/neo/organization" onChange={onChange} />
    );
    // Same shape as the real AD_Image 500 bug report (ETP-4749 QA round): 72 chars.
    const longName = 'Captura_de_pantalla_2026-07-28_a_las_10.02.31_a._m._2_optimized_2000.png';
    const file = makeFile(longName, 1024, 'image/png');
    fireEvent.change(getFileInput(container), { target: { files: [file] } });

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    const [, options] = globalThis.fetch.mock.calls[0];
    const sentBody = JSON.parse(options.body);
    expect(sentBody.name.length).toBeLessThanOrEqual(60);
    expect(sentBody.name.endsWith('.png')).toBe(true);
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('IMG_NEW'));
  });

  it('shows an error toast and does not call onChange when the upload request fails', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    const onChange = vi.fn();
    const { container } = render(
      <OrgLogoField imageId="" orgName="Acme" token="tk" apiBaseUrl="/sws/neo/organization" onChange={onChange} />
    );
    fireEvent.change(getFileInput(container), { target: { files: [makeFile('logo.png', 1024, 'image/png')] } });

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(onChange).not.toHaveBeenCalled();
  });
});
