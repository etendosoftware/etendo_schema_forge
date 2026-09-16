/**
 * Resolves every `lucide-react` export to the same inert stub, taking the export list from
 * the real module.
 *
 * Test files used to mock the icons they knew about, one by one. That breaks silently as
 * the component's import graph grows: a newly reached icon is simply absent from the mock,
 * and vitest fails the WHOLE FILE to load — reported as zero failing tests plus a suite
 * that quietly is not there, which is easy to miss in a green-looking summary. ETP-5245
 * did exactly that to three unrelated files by adding `RotateCcw` and `Clock`.
 *
 * Usage — the factory stays lazy, so referencing `Stub` from module scope is fine:
 *
 *   const Stub = () => null;
 *   vi.mock('lucide-react', async (importOriginal) => allIconsAs(Stub, importOriginal));
 *
 * Pass overrides when specific icons need to be identifiable in assertions:
 *
 *   vi.mock('lucide-react', async (importOriginal) => allIconsAs(Stub, importOriginal, {
 *     Lock: (props) => <span data-testid="lock-icon" {...props} />,
 *   }));
 *
 * @param {Function} stub component every icon resolves to
 * @param {Function} importOriginal vitest's own loader for the real module
 * @param {object} [overrides] icons that need a distinguishable stub
 */
export async function allIconsAs(stub, importOriginal, overrides = {}) {
  const actual = await importOriginal();
  return {
    ...Object.fromEntries(Object.keys(actual).map(name => [name, stub])),
    ...overrides,
  };
}
