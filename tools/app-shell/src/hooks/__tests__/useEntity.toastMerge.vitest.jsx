/**
 * ETP-5193 regression — proves the actual sonner merge mechanism behind the
 * "stale Configurar roles action leaks onto a later save toast" bug, and that
 * `showSaveSuccessToast` (useEntity.js) fixes it.
 *
 * Unlike every sibling test file in this directory, this one does NOT
 * `vi.mock('sonner', ...)`. It imports the REAL `sonner` module (v2.0.7, see
 * `node_modules/sonner/dist/index.mjs`) so it exercises sonner's actual
 * `Observer.create()`:
 *
 *   if (alreadyExists) {
 *     this.toasts = this.toasts.map((toast) => toast.id === id
 *       ? { ...toast, ...data, id, dismissible, title: message }
 *       : toast);
 *   }
 *
 * When a toast id already exists in sonner's internal registry (`this.toasts`,
 * never pruned by dismiss()/auto-expiry — only hidden from the rendered list),
 * `create()` does a SHALLOW MERGE of the new call's options onto the previously
 * stored toast. A key simply ABSENT from the new call is not cleared — it is
 * inherited. Concretely: the User window's `onAfterCreate` attaches an
 * `action` ("Configurar roles") to the shared `RECORD_SAVE_TOAST_ID` id; the
 * next plain `showSaveSuccessToast()` call for the SAME id (any later Guardar,
 * e.g. after assigning a role via `onAfterExistingSave`) would silently
 * inherit that action unless it is explicitly cleared.
 *
 * `toast.getHistory()` (asserted against below) is sonner's own PUBLIC API —
 * `Object.assign(basicToast, { success, error, ... }, { getHistory, getToasts })`
 * — not a private internal, so reading the merged toast's `action` through it
 * is a legitimate whitebox check of the real runtime state, not implementation
 * poking. Kept isolated in its own file (unmocked `sonner`) so it never leaks
 * into the mocked-sonner convention every other useEntity test file uses.
 */
import { toast } from 'sonner';
import { showSaveSuccessToast, RECORD_SAVE_TOAST_ID } from '../useEntity';

function findToast(id) {
  return toast.getHistory().find((t) => t.id === id);
}

describe('sonner Observer.create() — id-based merge mechanism (ETP-5193)', () => {
  it('inherits an unset key from a prior toast for the same id (the mechanism the bug exploited)', () => {
    const demoId = 'demo-toast-merge-mechanism';

    toast.success('first message', {
      id: demoId,
      action: { label: 'Do something', onClick: () => {} },
    });
    expect(findToast(demoId)?.action).toBeTruthy();

    // A second call for the SAME id that does not mention `action` at all —
    // exactly the shape a plain generic "saved successfully" toast would have
    // had BEFORE the ETP-5193 fix.
    toast.success('second message', { id: demoId });

    const merged = findToast(demoId);
    expect(merged?.title).toBe('second message');
    // This is the bug's root mechanism: an omitted key survives the merge.
    expect(merged?.action).toBeTruthy();
    expect(merged?.action?.label).toBe('Do something');
  });
});

describe('showSaveSuccessToast — real sonner merge, end to end (ETP-5193 fix)', () => {
  it('does not let a create-toast action leak onto the next generic save toast for the same record', () => {
    // 1. Simulate the User window's onAfterCreate (windows/custom/user/index.jsx,
    //    handleAfterCreate): a create-success toast with an action button,
    //    because the freshly-created user has no roles yet.
    toast.success('Usuario creado. Invitacion enviada por correo.', {
      id: RECORD_SAVE_TOAST_ID,
      action: { label: 'Configurar roles', onClick: () => {} },
    });
    expect(findToast(RECORD_SAVE_TOAST_ID)?.action?.label).toBe('Configurar roles');

    // 2. Simulate the very next Guardar after assigning a role via
    //    AssignTemplateRolesControl — an existing-record save, which fires the
    //    GENERIC showSaveSuccessToast(...), with no action of its own.
    showSaveSuccessToast(false, false, (k) => k);

    const afterSecondSave = findToast(RECORD_SAVE_TOAST_ID);
    expect(afterSecondSave?.title).toBe('recordSaved');
    // The fix: showSaveSuccessToast passes `action: undefined` explicitly, so
    // sonner's merge overwrites (clears) the inherited action instead of
    // keeping it — the stale "Configurar roles" button must be gone.
    expect(afterSecondSave?.action).toBeUndefined();
  });

  it('keeps clearing the action on every subsequent generic save (not just the first one after create)', () => {
    toast.success('Usuario creado. Invitacion enviada por correo.', {
      id: RECORD_SAVE_TOAST_ID,
      action: { label: 'Configurar roles', onClick: () => {} },
    });

    showSaveSuccessToast(false, false, (k) => k);
    expect(findToast(RECORD_SAVE_TOAST_ID)?.action).toBeUndefined();

    // A third, unrelated save (e.g. editing the user's name) must not somehow
    // resurrect the action either.
    showSaveSuccessToast(false, false, (k) => k);
    expect(findToast(RECORD_SAVE_TOAST_ID)?.action).toBeUndefined();
  });
});
