import { render, screen, fireEvent } from '@testing-library/react';
import SectionSaveButton from '../SectionSaveButton.jsx';

const ui = (key) => key;

describe('SectionSaveButton — visibility', () => {
  it('renders the save button when hideSave=false and locked=false', () => {
    render(<SectionSaveButton hideSave={false} save={vi.fn()} saving={false} ui={ui} />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('hides the button when hideSave=true', () => {
    render(<SectionSaveButton hideSave={true} save={vi.fn()} saving={false} ui={ui} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('hides the button when locked=true', () => {
    render(<SectionSaveButton hideSave={false} locked={true} save={vi.fn()} saving={false} ui={ui} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('SectionSaveButton — label', () => {
  it('shows fiscal.save when not saving', () => {
    render(<SectionSaveButton hideSave={false} save={vi.fn()} saving={false} ui={ui} />);
    expect(screen.getByText('fiscal.save')).toBeInTheDocument();
  });

  it('shows the savingKey when saving=true', () => {
    render(<SectionSaveButton hideSave={false} save={vi.fn()} saving={true} savingKey="fiscal.saving" ui={ui} />);
    expect(screen.getByText('fiscal.saving')).toBeInTheDocument();
  });

  it('disables the button while saving', () => {
    render(<SectionSaveButton hideSave={false} save={vi.fn()} saving={true} ui={ui} />);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});

describe('SectionSaveButton — error', () => {
  it('shows the error message when error is set', () => {
    render(<SectionSaveButton hideSave={false} save={vi.fn()} saving={false} ui={ui} error="Something failed" />);
    expect(screen.getByText('Something failed')).toBeInTheDocument();
  });

  it('does not render error element when error is null', () => {
    render(<SectionSaveButton hideSave={false} save={vi.fn()} saving={false} ui={ui} error={null} />);
    expect(screen.queryByText(/failed/i)).not.toBeInTheDocument();
  });
});

describe('SectionSaveButton — interaction', () => {
  it('calls save when the button is clicked', () => {
    const save = vi.fn();
    render(<SectionSaveButton hideSave={false} save={save} saving={false} ui={ui} />);
    fireEvent.click(screen.getByRole('button'));
    expect(save).toHaveBeenCalledOnce();
  });
});
