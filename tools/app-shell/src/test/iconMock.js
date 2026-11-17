/**
 * Resolves every `@phosphor-icons/react` icon export to the same inert stub, taking the export
 * list from the real module.
 *
 * Test files used to mock the icons they knew about, one by one. That breaks silently as
 * the component's import graph grows: a newly reached icon is simply absent from the mock,
 * and vitest fails the WHOLE FILE to load — reported as zero failing tests plus a suite
 * that quietly is not there, which is easy to miss in a green-looking summary. ETP-5245
 * did exactly that to three unrelated files by adding `RotateCcw` and `Clock`.
 *
 * The library's non-icon exports (`IconContext`, `IconBase`, `SSR`) are kept real, so a
 * provider or a custom icon built on `IconBase` still works under the mock.
 *
 * Usage — the factory stays lazy, so referencing `Stub` from module scope is fine:
 *
 *   const Stub = () => null;
 *   vi.mock('@phosphor-icons/react', async (importOriginal) => allIconsAs(Stub, importOriginal));
 *
 * Pass overrides when specific icons need to be identifiable in assertions:
 *
 *   vi.mock('@phosphor-icons/react', async (importOriginal) => allIconsAs(Stub, importOriginal, {
 *     LockIcon: (props) => <span data-testid="lock-icon" {...props} />,
 *   }));
 *
 * @param {Function} stub component every icon resolves to
 * @param {Function} importOriginal vitest's own loader for the real module
 * @param {object} [overrides] icons that need a distinguishable stub
 */
const NON_ICON_EXPORTS = new Set(['IconContext', 'IconBase', 'SSR']);

export async function allIconsAs(stub, importOriginal, overrides = {}) {
  const actual = await importOriginal();
  return {
    ...Object.fromEntries(Object.keys(actual).map(name => [name, NON_ICON_EXPORTS.has(name) ? actual[name] : stub])),
    ...overrides,
  };
}
