export const contactModalConfig = {
  headerFields: [
    { id: 'name', labelKey: 'contactName', type: 'text', required: true },
    {
      id: 'taxIdType',
      labelKey: 'taxIdTypeField',
      type: 'dynamicSelect',
      optionsKey: 'taxIdTypes',
    },
    { id: 'taxID', labelKey: 'taxIDField', type: 'text', placeholder: 'B-12345678', required: true },
  ],
  sections: [
    {
      id: 'general',
      labelKey: 'direccionTab',
      component: 'AddressSection',
    },
    {
      id: 'financial',
      labelKey: 'financieroTab',
      component: 'FinancialSection',
    },
    {
      id: 'contacts',
      labelKey: 'contactPersonTab',
      repeatable: true,
      initialRows: 1,
      noHeaders: true,
      emptyTextKey: 'noContactsYet',
      addLabelKey: 'addContactPerson',
      fields: [
        { id: 'firstName', labelKey: 'contactFirstName', type: 'text' },
        { id: 'lastName', labelKey: 'contactLastName', type: 'text' },
        { id: 'email', labelKey: 'contactEmail', type: 'email' },
        { id: 'phone', labelKey: 'contactPhone', type: 'tel' },
      ],
    },
    {
      id: 'bankAccount',
      labelKey: 'bankTab',
      repeatable: true,
      initialRows: 1,
      noHeaders: true,
      emptyTextKey: 'noBankAccountsYet',
      addLabelKey: 'addBankAccount',
      fields: [
        { id: 'bankName', labelKey: 'bankNameField', type: 'text' },
        { id: 'bankAccountFormat', labelKey: 'bankAccountFormatField', type: 'select', options: [
          { id: 'GENERIC', label: 'Generic account no.' },
          { id: 'IBAN', label: 'IBAN' },
          { id: 'SWIFT', label: 'SWIFT + Generic account no.' },
          { id: 'SPANISH', label: 'Spanish' },
        ]},
        { id: 'genericAccountNo', labelKey: 'genericAccountNoField', type: 'text' },
        { id: 'iban', labelKey: 'ibanField', type: 'text' },
      ],
    },
    {
      id: 'more',
      labelKey: 'masTab',
      plain: true,
      // Order mirrors the Contacts window's own field order EXACTLY (Web, Email, Phone —
      // artifacts/contacts/decisions.json: etgoWeb order 9, etgoEmail order 10, etgoPhone
      // order 11), confirmed against the live window, not assumed from the config alone.
      fields: [
        // `inputPrefix: 'https://'` mirrors the Contacts window's own "Página web"
        // field (ETP-4749) — the stored value is only the part after the scheme, and
        // getWebsiteFieldError (via withInputPrefix) reconstructs the full URL from it
        // before checking the domain shape.
        { id: 'etgoWeb', labelKey: 'websiteField', type: 'text', inputPrefix: 'https://' },
        { id: 'etgoEmail', labelKey: 'contactEmail', type: 'email' },
        // ETP-5031 follow-up — same 15-char (E.164) cap as the Contacts window's own
        // etgoPhone field (artifacts/contacts/decisions.json), so this quick-create
        // popup can't type past what BusinessPartnerHandler will accept server-side.
        { id: 'etgoPhone', labelKey: 'contactPhone', type: 'tel', maxLength: 15 },
      ],
    },
  ],
  requiredFields: ['name', 'taxID', 'country'],
  progressFields: ['name', 'taxID', 'address', 'country', 'city'],
};
