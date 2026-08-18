import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:emailConfiguration
const columns = [
  { key: 'active', column: 'Isactive', type: 'boolean', label: 'Active', required: true },
  { key: 'smtpServer', column: 'Smtpserver', type: 'string', label: 'Smtp Server', required: true },
  { key: 'sMTPAuthentification', column: 'IsSmtpAuthorization', type: 'boolean', label: 'SMTP Authentification', required: true },
  { key: 'smtpServerAccount', column: 'Smtpserveraccount', type: 'string', label: 'Smtp Server Account' },
  { key: 'smtpConnectionSecurity', column: 'Smtpconnectionsecurity', type: 'enum', label: 'SMTP Connection Security', enumLabels: { 'N': 'smtpconnectionsecurityN', 'STARTTLS': 'smtpconnectionsecurityStarttls', 'SSL': 'smtpconnectionsecuritySsl' }, required: true },
  { key: 'smtpPort', column: 'Smtpport', type: 'number', label: 'Smtp Port', required: true },
  { key: 'testSuccessful', column: 'Istestsuccessful', type: 'boolean', label: 'Test Successful', required: true },
  { key: 'defaultConfiguration', column: 'Isdefaultconfig', type: 'boolean', label: 'Default', required: true },
];
// @sf-generated-end columns:emailConfiguration

const filters = ['smtpServer'];

// @sf-generated-start component:EmailConfigurationTable
const EmailConfigurationTable = forwardRef(function EmailConfigurationTable(props, ref) {
  // Inline-editable layout always uses InlineLinesPanel for existing rows so column
  // widths (flex layout) never shift when the add-row form opens. When addRow is
  // active we render a header-hidden, data-hidden DataTable below for just the
  // add-row form — it owns callouts, selectors, validation and the imperative flush
  // ref. The ref is forwarded to InlineLinesPanel so DetailView can flush pending
  // inline edits on global save.
  if (props.linesLayout === 'inlineEditable') {
    if (props.addRow?.active) {
      return (
        <>
          <InlineLinesPanel ref={ref} columns={columns} {...props} addRow={undefined} />
          <DataTable columns={columns} filters={filters} {...props} hideHeader hideDataRows />
        </>
      );
    }
    return <InlineLinesPanel ref={ref} columns={columns} {...props} />;
  }
  return <DataTable columns={columns} filters={filters} {...props} />;
});

export default EmailConfigurationTable;
// @sf-generated-end component:EmailConfigurationTable
