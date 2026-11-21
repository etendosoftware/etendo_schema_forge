import { Field } from '@/components/forms/fields';
import { CreditorIdField, CreditorIdLabel } from '@/components/financial-accounts/CreditorIdControls.jsx';

/**
 * ETP-6247 — «Remesas» section of the Edit-account modal: the SEPA creditor identifier stored on the
 * account, as one more field of the form. It is empty when the account has none: the modal shows no
 * origin caption and no proposal computed from the organization (those live in the remittance
 * window). It has no button of its own; the modal's «Guardar cambios» saves it with the other fields
 * (see useAccountCreditorId). Rendered only when the hook says it is `visible` (a Bank account the
 * user can run remittances on).
 *
 * @param {{ ui: Function, creditorId: ReturnType<import('./useAccountCreditorId.js').useAccountCreditorId>, disabled?: boolean }} props
 */
export default function SepaCreditorIdSection({ ui, creditorId, disabled = false }) {
  if (!creditorId?.visible) return null;
  return (
    <div className="mt-6 border-b border-[hsl(var(--border-subtle))] pb-4" data-testid="sepa-remittances-section">
      <p className="mb-3 text-sm font-medium text-[hsl(var(--foreground))]">{ui('financeAccountsSepaRemittancesSection')}</p>
      <Field
        label={<CreditorIdLabel ui={ui} htmlFor="edit-account-sepa-creditor-input" testId="edit-account-sepa-creditor" data-testid="CreditorIdLabel__account" />}
        data-testid="Field__sepa-creditor-id">
        <CreditorIdField
          ui={ui}
          value={creditorId.value}
          onChange={creditorId.setValue}
          errorKey={creditorId.errorKey}
          disabled={disabled}
          testId="edit-account-sepa-creditor"
          data-testid="CreditorIdField__account" />
      </Field>
    </div>
  );
}
