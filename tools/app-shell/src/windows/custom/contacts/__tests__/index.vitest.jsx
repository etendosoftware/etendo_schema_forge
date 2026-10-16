// @covers tools/app-shell/src/windows/custom/contacts/index.jsx
/**
 * `contacts/index.jsx` (ContactsWindow) — the props this window hands to the
 * generated `BusinessPartnerPage`.
 *
 * ETP-5758 — Contacts used to render its own bulk delete (a trash button via
 * `selectionBarRightActions` plus its own confirm dialog), opting out of
 * ListView's generic "Delete selected" action with
 * `listViewOptions.hideBulkDelete: true`. That dialog closed BEFORE the
 * deletes ran and left the trash button enabled, so a user could launch
 * several delete batches over the same rows. The window now uses the generic
 * bulk delete (`useBulkRowDelete`), whose dialog stays open and read-only
 * until the batch settles — that behavior is covered by
 * `useBulkRowDelete.vitest.jsx` and `ListView.bulkDelete.vitest.jsx`, not
 * here. This file guards only that the window does not opt out of it again.
 */
import { render } from '@testing-library/react';

vi.mock('../contacts.css', () => ({}));
vi.mock('../contactsFkResolvers.js', () => ({}));
vi.mock('../contactsImportDescriptor.js', () => ({}));
vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));
vi.mock('../ContactsBusinessPartnerForm', () => ({ default: () => null }));
vi.mock('../ContactsSummaryWidget', () => ({ default: () => null }));

// Captures the exact props ContactsWindow hands to the generated BusinessPartnerPage.
let capturedProps = null;
vi.mock('@generated/contacts/generated/web/contacts/BusinessPartnerPage', () => ({
  default: (props) => {
    capturedProps = props;
    return null;
  },
}));

import ContactsWindow from '../index.jsx';

function renderWindow(props = {}) {
  return render(
    <ContactsWindow token="test-token" apiBaseUrl="/api/contacts" windowName="contacts" {...props} />,
  );
}

beforeEach(() => {
  capturedProps = null;
});

describe('ContactsWindow — uses ListView generic bulk delete (ETP-5758)', () => {
  it('passes listViewOptions that keep the generated hide* flags and do NOT opt out of the generic bulk delete', () => {
    renderWindow();

    // The object REPLACES the generated page's own listViewOptions (JSX
    // last-prop-wins), so it must repeat hidePrint/hideCounter/hideLink —
    // and must not carry hideBulkDelete, which would hide the generic button.
    expect(capturedProps.listViewOptions).toEqual({
      hidePrint: true,
      hideCounter: true,
      hideLink: true,
    });
  });

  it('does not render a bespoke selection-bar delete of its own', () => {
    renderWindow();

    expect(capturedProps).not.toHaveProperty('selectionBarRightActions');
  });

  it('keeps single-row delete on secondary tabs enabled', () => {
    renderWindow();

    expect(capturedProps.enableSecondaryRowDelete).toBe(true);
  });
});
