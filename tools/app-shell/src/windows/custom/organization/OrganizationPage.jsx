import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/auth/AuthContext.jsx';
import { useUI } from '@/i18n';
import { useSetPageMeta } from '@/components/layout/PageMetaContext';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import LocationModalField from '@/components/contract-ui/LocationModalField.jsx';
import PrefixedInput from '@/components/contract-ui/PrefixedInput.jsx';
import { getEmailFieldError, getWebsiteFieldError, getPhoneFieldError } from '@/components/contract-ui/recipientEdits.js';
import { neoBase } from '@/components/related-documents/helpers.js';
import { useOrganizationData } from './useOrganizationData.js';
import OrgLogoField from './OrgLogoField.jsx';
import BusinessTypeCards from './BusinessTypeCards.jsx';
import { getCountryFlag } from './countryFlag.js';
import ActividadesIaeSection from './ActividadesIaeSection.jsx';

// The AD_OrgInfo "Location / Address" identifier is a composed string
// (e.g. "Santa Fe - 446 - 5800 - Rio Cuarto - España") — the country is the
// last dash-separated segment. There is no dedicated read-only "country" NEO
// field for this window yet; if one is added later, prefer it over this
// heuristic (see engram topic etp4749/organization-settings-exploration).
function deriveCountryFromIdentifier(identifier) {
  if (!identifier) return '';
  const parts = identifier.split(' - ').map(s => s.trim()).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
}

const emptyForm = {
  name: '',
  socialName: '',
  etgoBusinessType: '',
  taxID: '',
  locationAddress: '',
  locationAddressLabel: '',
  yourCompanyDocumentImage: '',
  currencyLabel: '',
  countryLabel: '',
  email: '',
  phone: '',
  web: '',
};

// BUG-1 (QA rejection round): the backend rejects (500) when a required field is blank —
// there is no client-side validation guarding the save before this fix. Fields marked
// with the red asterisk in the design: org name, NIF, legal name (AD_Org.socialName —
// now labeled "Nombre comercial" via the reused orgTradeNameLabel key), fiscal address.
//
// The former "Nombre comercial" field (C_BPartner.name via the linked Business Partner)
// was removed entirely from this screen — with it went its special "only required when
// a Business Partner is actually linked" rule, since that field no longer exists here.
function getMissingRequiredFields(form) {
  const checks = [
    ['name', form.name],
    ['taxID', form.taxID],
    ['socialName', form.socialName],
    ['locationAddress', form.locationAddress],
  ];
  return checks.filter(([, v]) => !v || !String(v).trim()).map(([key]) => key);
}

// Optional-field format validation (email/phone/website) — calls the EXACT same
// validators Contacts uses via useEntity.js's generic handleSave (recipientEdits.js),
// not a parallel hand-rolled equivalent. This page has its own hand-built handleSave
// and never goes through that generic flow, so it calls getEmailFieldError/
// getWebsiteFieldError/getPhoneFieldError directly with minimal field descriptors —
// just enough for recipientEdits.js's own isEmailField/isWebsiteField/isPhoneField
// name-detection to recognize each one. Unlike BUG-1's required-field checks above,
// these three fields are all optional in this window — an empty value never blocks
// save; only a non-empty, malformed value does.
//
// "Sitio web" declares `inputPrefix: 'https://'` on its descriptor — the same
// mechanism generate-frontend.js emits for a decisions.json field (ETP-4749) — so
// getWebsiteFieldError reconstructs the full URL before checking, instead of this
// page hand-rolling that reconstruction itself. Checked in the same order
// useEntity.js checks them (email, website, phone), stopping at the first failure —
// one toast, not a stack of them, same UX as Contacts.
const EMAIL_FIELD_DESCRIPTOR = { key: 'email' };
const WEBSITE_FIELD_DESCRIPTOR = { key: 'web', inputPrefix: 'https://' };
const PHONE_FIELD_DESCRIPTOR = { key: 'phone' };

function getInvalidFormatErrorKey(form) {
  return getEmailFieldError(EMAIL_FIELD_DESCRIPTOR, form.email)
    || getWebsiteFieldError(WEBSITE_FIELD_DESCRIPTOR, form.web)
    || getPhoneFieldError(PHONE_FIELD_DESCRIPTOR, form.phone)
    || null;
}

function buildFormFromData(header, info) {
  return {
    name: header?.name ?? '',
    socialName: header?.socialName ?? '',
    etgoBusinessType: header?.etgoBusinessType ?? '',
    taxID: info?.taxID ?? '',
    locationAddress: info?.locationAddress ?? '',
    locationAddressLabel: info?.['locationAddress$_identifier'] ?? '',
    yourCompanyDocumentImage: info?.yourCompanyDocumentImage ?? '',
    currencyLabel: header?.['currency$_identifier'] ?? '',
    countryLabel: deriveCountryFromIdentifier(info?.['locationAddress$_identifier']),
    // Direct AD_OrgInfo columns (em_etgo_email/phone/web) — optional, unrelated to
    // any Business Partner. The former BP-sourced contact fields (and their
    // "no BP linked" / "BP failed to load" read-only states) were removed entirely.
    email: info?.etgoEmail ?? '',
    phone: info?.etgoPhone ?? '',
    web: info?.etgoWeb ?? '',
  };
}

/**
 * A section row from the reference design: a fixed-width left column
 * (sentence-case title + description) and a flexible right column (fields).
 * `divider` draws the border between sections — every section but the last one.
 */
function FieldError({ message, testId }) {
  if (!message) return null;
  return <p role="alert" className="text-xs text-destructive mt-0.5" data-testid={testId}>{message}</p>;
}

function SectionRow({ titleKey, descKey, divider = true, testId, children }) {
  const ui = useUI();
  return (
    <section
      className={
        'grid gap-2 py-4' + (divider ? ' border-b border-border' : '')
      }
      style={{ gridTemplateColumns: '200px minmax(0, 1fr)' }}
      data-testid={testId}>
      <div>
        <div className="text-sm font-semibold text-foreground mb-1.5">{ui(titleKey)}</div>
        <p className="text-xs leading-[18px] text-muted-foreground">{ui(descKey)}</p>
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

export default function OrganizationPage({ token, apiBaseUrl }) {
  const ui = useUI();
  const { selectedOrg } = useAuth();
  const orgId = selectedOrg?.id ?? null;

  const { loading, error, header, info, refetch, save } =
    useOrganizationData(orgId, apiBaseUrl);

  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formReady, setFormReady] = useState(false);

  useSetPageMeta({ title: ui('organizationPageTitle'), breadcrumb: `${ui('settings')} / ${ui('organizationPageTitle')}` });

  useEffect(() => {
    if (!loading && !error) {
      setForm(buildFormFromData(header, info));
      setFormReady(true);
    }
  }, [loading, error, header, info]);

  const baseline = useMemo(() => buildFormFromData(header, info), [header, info]);
  const isDirty = useMemo(
    () => formReady && JSON.stringify(form) !== JSON.stringify(baseline),
    [formReady, form, baseline],
  );

  const updateField = (field, value) => {
    setForm(f => ({ ...f, [field]: value }));
    if (fieldErrors[field]) {
      setFieldErrors(errs => {
        const next = { ...errs };
        delete next[field];
        return next;
      });
    }
  };

  const handleDiscard = () => {
    setForm(baseline);
    setFieldErrors({});
  };

  const handleSave = async () => {
    // BUG-1: validate required fields client-side before ever calling the backend — an
    // empty NIF (or any other required field) used to reach save() unchecked and the
    // backend's 500 surfaced as a raw, meaningless toast.
    const missing = getMissingRequiredFields(form);
    if (missing.length > 0) {
      const errs = {};
      missing.forEach(key => { errs[key] = ui('fieldRequired'); });
      setFieldErrors(errs);
      toast.error(ui('requiredFieldsMissing'));
      return;
    }
    // Format validation for the optional contact fields (email/phone/website) — same
    // rules and same i18n keys Contacts already uses (recipientEdits.js via
    // useEntity.js), reused directly rather than duplicated. Toast-only, no inline
    // FieldError, matching Contacts' UX exactly (unlike BUG-1's required-field errors,
    // which do get an inline message under the field).
    const formatErrorKey = getInvalidFormatErrorKey(form);
    if (formatErrorKey) {
      toast.error(ui(formatErrorKey));
      return;
    }
    setFieldErrors({});
    setSaving(true);
    try {
      await save({
        header: {
          name: form.name,
          socialName: form.socialName,
          etgoBusinessType: form.etgoBusinessType,
        },
        info: {
          taxID: form.taxID,
          locationAddress: form.locationAddress,
          yourCompanyDocumentImage: form.yourCompanyDocumentImage,
          etgoEmail: form.email,
          etgoPhone: form.phone,
          etgoWeb: form.web,
        },
      });
      await refetch();
      toast.success(ui('savedSuccessfully'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="px-6 py-8 space-y-4" data-testid="OrganizationPage__loading">
        <Skeleton className="h-8 w-1/3" data-testid="Skeleton__org" />
        <Skeleton className="h-32 w-full" data-testid="Skeleton__org" />
        <Skeleton className="h-32 w-full" data-testid="Skeleton__org" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-6 py-8" data-testid="OrganizationPage__error">
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
          <p className="text-sm text-destructive">{ui('organizationLoadError', { error })}</p>
          <Button variant="link" onClick={refetch} className="mt-2 h-auto p-0" data-testid="OrganizationPage__retry">
            {ui('retry')}
          </Button>
        </div>
      </div>
    );
  }

  const countryFlag = getCountryFlag(form.countryLabel);

  return (
    <div className="relative h-full flex flex-col overflow-hidden" data-testid="OrganizationPage__root">
      {/* pb-[77px] only while the unsaved-changes banner is visible (isDirty): the banner
          is `absolute bottom-0` over this same scroll container, so at native max-scroll
          the last ~61px of content (the banner's own measured height in the browser —
          h-9 button + py-3*2 + border-t = 36 + 24 + 1) sits behind it, clipping "Sitio web"
          (the last field). 77px = the normal p-4 bottom padding (16px) + that 61px, so the
          scrollable area gains exactly enough room to clear the banner. Conditional on
          isDirty on purpose — Ivan explicitly rejected a permanent bottom-padding fix
          earlier (leaves an empty gap when there's nothing to save). */}
      <div className={'flex-1 overflow-y-auto p-4' + (isDirty ? ' pb-[77px]' : '')}>
        {/* Reference design caps the whole form at 1020px (see decoded HTML template,
            ETP-4749 review round) — without this cap, the 2-col field grids below
            stretch edge-to-edge on wide screens and every input looks oversized. */}
        <div className="max-w-[1020px]">
        {/* Page title + intro */}
        {/* pb-6 matches the py-6 used by each SectionRow below, so the gap here
            equals the gap between sections. (Previously "pb-4.5" — not a real
            Tailwind class, Tailwind's default scale jumps 4 -> 5 with no 4.5
            step, so it silently applied zero padding and the divider sat right
            under the text.) */}
        <div className="pb-4 border-b border-border" data-testid="OrganizationPage__intro">
          <h1 className="text-lg font-semibold text-foreground mb-1">{ui('organizationPageTitle')}</h1>
          <p className="text-[13px] leading-[19px] text-muted-foreground max-w-2xl">
            {ui('organizationPageIntro')}
          </p>
        </div>

        {/* Identidad */}
        <SectionRow
          titleKey="orgSectionIdentity"
          descKey="orgSectionIdentityDesc"
          testId="OrganizationPage__section-identity"
          data-testid="SectionRow__a5f503">
          <OrgLogoField
            imageId={form.yourCompanyDocumentImage}
            orgName={form.name}
            token={token}
            apiBaseUrl={apiBaseUrl}
            onChange={(id) => updateField('yourCompanyDocumentImage', id)}
            data-testid="OrgLogoField__a5f503" />
          {/* grid-cols-2 with an empty second cell — matches the paired fields'
              column width (e.g. NIF/Nombre comercial below) instead of stretching
              to the full row width now that this field has no sibling in Identidad
              (its old sibling, "Nombre comercial" from C_BPartner, was removed). */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              {/* Every <Label> on this page explicitly carries "text-sm text-foreground
                  font-medium" to match the convention used at every field-label call site
                  in EntityForm.jsx (the generic renderer used by every other window, e.g.
                  Warehouse's "Nombre"/"Identificador"). The bare <Label> default (no
                  className override) renders "leading-none" — visibly shorter — which
                  caused a real vertical misalignment against LocationModalField's label
                  in the "Dirección fiscal | País" row (ETP-4749 review round). */}
              <Label htmlFor="org-name" className="text-sm text-foreground font-medium" data-testid="Label__org-name">
                {ui('orgNameLabel')} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="org-name"
                value={form.name}
                onChange={e => updateField('name', e.target.value)}
                aria-invalid={Boolean(fieldErrors.name)}
                className={'bg-card hover:bg-muted focus-visible:bg-card' + (fieldErrors.name ? ' border-destructive' : '')}
                data-testid="OrganizationPage__name" />
              <FieldError
                message={fieldErrors.name}
                testId="OrganizationPage__error-name"
                data-testid="FieldError__a5f503" />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label className="text-sm text-foreground font-medium" data-testid="Label__org-business-type">{ui('orgBusinessTypeLabel')}</Label>
            <BusinessTypeCards
              value={form.etgoBusinessType}
              onChange={(v) => updateField('etgoBusinessType', v)}
              data-testid="BusinessTypeCards__a5f503" />
          </div>
        </SectionRow>

        {/* Datos fiscales */}
        <SectionRow
          titleKey="orgSectionFiscal"
          descKey="orgSectionFiscalDesc"
          testId="OrganizationPage__section-fiscal"
          data-testid="SectionRow__a5f503">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="org-nif" className="text-sm text-foreground font-medium" data-testid="Label__org-nif">
                {ui('orgNifLabel')} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="org-nif"
                value={form.taxID}
                onChange={e => updateField('taxID', e.target.value)}
                aria-invalid={Boolean(fieldErrors.taxID)}
                className={'bg-card hover:bg-muted focus-visible:bg-card' + (fieldErrors.taxID ? ' border-destructive' : '')}
                data-testid="OrganizationPage__taxid" />
              <FieldError
                message={fieldErrors.taxID}
                testId="OrganizationPage__error-taxID"
                data-testid="FieldError__a5f503" />
            </div>
            <div className="flex flex-col gap-1.5">
              {/* Field/testid names stay "legal-name"/socialName on purpose — this is
                  AD_Org.socialName, NOT the removed C_BPartner.name "Nombre comercial"
                  field. Only the visible label changed (reusing orgTradeNameLabel's text,
                  now that the old field is gone) — do not confuse the two in code. */}
              <Label htmlFor="org-legal-name" className="text-sm text-foreground font-medium" data-testid="Label__org-legal-name">
                {ui('orgTradeNameLabel')} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="org-legal-name"
                value={form.socialName}
                onChange={e => updateField('socialName', e.target.value)}
                aria-invalid={Boolean(fieldErrors.socialName)}
                className={'bg-card hover:bg-muted focus-visible:bg-card' + (fieldErrors.socialName ? ' border-destructive' : '')}
                data-testid="OrganizationPage__legal-name" />
              <FieldError
                message={fieldErrors.socialName}
                testId="OrganizationPage__error-socialName"
                data-testid="FieldError__a5f503" />
            </div>
          </div>
          {/* Dirección fiscal | País — paired per Ivan's request (review round):
              País rides alongside the fiscal address instead of alongside Moneda. */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <LocationModalField
                field={{ id: 'org-fiscal-address', key: 'locationAddress' }}
                value={form.locationAddress}
                displayValue={form.locationAddressLabel}
                onChange={(id, label) => setForm(f => ({ ...f, locationAddress: id, locationAddressLabel: label }))}
                // Deliberately the WAREHOUSE spec's base, not organization's own. NEO Headless
                // has no "location" entity (tab-less C_Location CRUD + country/region
                // selectors) registered under `organization` — `organization` never got one.
                // `warehouse` does (WarehouseLocationHandler.java, built for ETP-4526's
                // Warehouse "Location / Address" field), and that handler is fully generic:
                // plain C_Location DAL CRUD via the request's own OBContext, with no
                // warehouse-specific data or business rules. Reusing that real, working
                // endpoint from Organization is an intentional, accepted design decision —
                // not a placeholder, not mock data. See docs/generated-custom-windows/
                // organization.md ("Fiscal address workaround") for the full rationale.
                apiBaseUrl={`${neoBase(apiBaseUrl)}/warehouse`}
                token={token}
                resolvedLabel={ui('orgFiscalAddressLabel')}
                required
                data-testid="LocationModalField__a5f503" />
              <FieldError
                message={fieldErrors.locationAddress}
                testId="OrganizationPage__error-locationAddress"
                data-testid="FieldError__a5f503" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm text-foreground font-medium" data-testid="Label__org-country">{ui('orgCountryLabel')}</Label>
              {/* País is the only always-read-only field alongside Moneda in this window —
                  bg-muted + cursor-not-allowed matches the system's read-only convention
                  (getReadOnlyBgClass in EntityForm.jsx), same gray look, but this is a plain
                  div (not a real <input>), so there's no native :disabled to hang the cursor
                  off of — set it explicitly instead. h-9 matches FIELD_HEIGHT (formDensity.js,
                  ETP-4321), the actual canonical height for every field in the app — including
                  every <Input> on this page. A previous round mistakenly bumped this to h-10 to
                  match LocationModalField's button, but that button was the one that deviated
                  from the shared density tokens; the real fix went into LocationModalField.jsx
                  itself (see its own comment) so this reverts back to h-9. */}
              <div
                className="flex h-9 items-center gap-1.5 rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground cursor-not-allowed"
                data-testid="OrganizationPage__country">
                {countryFlag && <span aria-hidden="true">{countryFlag}</span>}
                <span className="truncate">{form.countryLabel || '—'}</span>
              </div>
            </div>
          </div>
          {/* Moneda now stands alone in its own row — same empty-second-cell technique
              used for Nombre de la organización / Sitio web (review round). */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm text-foreground font-medium" data-testid="Label__org-currency">{ui('orgCurrencyLabel')}</Label>
              {/* Same always-read-only treatment as País above — bg-muted + cursor-not-allowed,
                  same h-9 (FIELD_HEIGHT) for consistency with every other field on this page. */}
              <div
                className="flex h-9 items-center rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground cursor-not-allowed"
                data-testid="OrganizationPage__currency">
                <span className="truncate">{form.currencyLabel || '—'}</span>
              </div>
            </div>
          </div>
        </SectionRow>

        {/* Datos de contacto */}
        <SectionRow
          titleKey="orgSectionContact"
          descKey="orgSectionContactDesc"
          testId="OrganizationPage__section-contact"
          data-testid="SectionRow__a5f503">
          {/* Email/Phone/Website now live directly on AD_OrgInfo (em_etgo_email/phone/web) —
              optional, standalone columns unrelated to any Business Partner. The former
              "no BP linked" / "BP linked but failed to load" read-only states (and their
              retry affordance) no longer apply and were removed along with the BP fetch. */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="org-email" className="text-sm text-foreground font-medium" data-testid="Label__org-email">{ui('orgEmailLabel')}</Label>
              <Input
                id="org-email"
                type="email"
                value={form.email}
                onChange={e => updateField('email', e.target.value)}
                className="bg-card hover:bg-muted focus-visible:bg-card"
                data-testid="OrganizationPage__email" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="org-phone" className="text-sm text-foreground font-medium" data-testid="Label__org-phone">{ui('orgPhoneLabel')}</Label>
              <Input
                id="org-phone"
                value={form.phone}
                onChange={e => updateField('phone', e.target.value)}
                className="bg-card hover:bg-muted focus-visible:bg-card"
                data-testid="OrganizationPage__phone" />
            </div>
          </div>
          {/* grid-cols-2 with an empty second cell, not a fixed max-width — matches
              the paired fields' column width (Email/Teléfono above) instead of an
              arbitrary px value (ETP-4749 review round). */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="org-web" className="text-sm text-foreground font-medium" data-testid="Label__org-web">{ui('orgWebsiteLabel')}</Label>
              {/* rounded-none focus-visible:ring-0 focus-visible:outline-none: the focus
                  ring is the wrapper's job now (PrefixedInput's focus-within:ring-2) —
                  QA review round fix for a floating second rounded ring on this input's
                  own (larger) radius, previously visible on focus. */}
              <PrefixedInput
                prefix="https://"
                testId="OrganizationPage__web-prefix-wrapper"
                data-testid="PrefixedInput__a5f503">
                <Input
                  id="org-web"
                  value={form.web}
                  onChange={e => updateField('web', e.target.value)}
                  className="border-0 bg-card hover:bg-muted focus-visible:bg-card rounded-none focus-visible:ring-0 focus-visible:outline-none"
                  data-testid="OrganizationPage__web" />
              </PrefixedInput>
            </div>
          </div>
        </SectionRow>

        {/* Actividades del IAE (ETP-4975) — repeatable grid, not a field pair, so it
            gets its own dedicated component instead of inline JSX like the sections
            above. Independent fetch/save lifecycle: each row persists immediately
            (create/update/delete), it is NOT part of `form`/the unsaved-changes
            banner. See ActividadesIaeSection.jsx and useActividadesIae.js. */}
        <SectionRow
          titleKey="orgSectionIae"
          descKey="orgSectionIaeDesc"
          divider={false}
          testId="OrganizationPage__section-iae"
          data-testid="SectionRow__a5f503">
          <ActividadesIaeSection
            token={token}
            apiBaseUrl={apiBaseUrl}
            orgId={orgId}
            data-testid="ActividadesIaeSection__a5f503" />
        </SectionRow>
        </div>
      </div>
      {isDirty && (
        <div
          className="absolute bottom-0 left-0 right-0 flex items-center justify-between gap-4 border-t border-border bg-card px-6 py-3 shadow-lg"
          data-testid="OrganizationPage__unsaved-banner">
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Yellow dot — same --eg-yellow token (schema_forge_core/packages/app-shell-core/
                src/styles.css) used for the selected business-type card (ETP-4749 review
                round; promoted from an inline hex literal to a real CSS custom property in
                the B1 QA review round, then moved to the core package's token file). */}
            <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--eg-yellow)]" aria-hidden="true" />
            <span className="text-sm font-medium text-foreground">{ui('orgUnsavedTitle')}</span>
            <span className="text-xs text-muted-foreground truncate">{ui('orgUnsavedDesc')}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" onClick={handleDiscard} disabled={saving} data-testid="OrganizationPage__discard">
              {ui('discard')}
            </Button>
            <Button onClick={handleSave} disabled={saving} data-testid="OrganizationPage__save">
              {saving ? ui('saving') : ui('saveChanges')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// api export kept for parity with the scaffold's `./OrganizationPage` import
// (see index.jsx) — no imperative API surface is needed by this page today.
export const api = {};
