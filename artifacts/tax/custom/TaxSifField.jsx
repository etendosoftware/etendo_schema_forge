// Local re-export shim so the tax window's `headerExtra.customForm: "TaxSifField"`
// resolves to a per-window custom form (satisfies the quality-gate invariant),
// while the implementation stays shared/reusable in windows/custom/shared.
export { default, selectSifFields } from '@/windows/custom/shared/TaxSifField.jsx';
