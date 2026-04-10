import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:emailConfiguration
const columns = [
  { key: 'active', column: 'Isactive', type: 'boolean', label: 'Active' },
  { key: 'smtpServer', column: 'Smtpserver', type: 'string', label: 'Smtp Server' },
  { key: 'sMTPAuthentification', column: 'IsSmtpAuthorization', type: 'boolean', label: 'SMTP Authentification' },
  { key: 'smtpServerAccount', column: 'Smtpserveraccount', type: 'string', label: 'Smtp Server Account' },
  { key: 'smtpConnectionSecurity', column: 'Smtpconnectionsecurity', type: 'enum', label: 'SMTP Connection Security', enumLabels: { 'N': 'None', 'STARTTLS': 'STARTTLS', 'SSL': 'SSL' } },
  { key: 'smtpPort', column: 'Smtpport', type: 'number', label: 'Smtp Port' },
  { key: 'testSuccessful', column: 'Istestsuccessful', type: 'boolean', label: 'Test Successful' },
  { key: 'defaultConfiguration', column: 'Isdefaultconfig', type: 'boolean', label: 'Default' },
];
// @sf-generated-end columns:emailConfiguration

const filters = ['smtpServer'];

// @sf-generated-start component:EmailConfigurationTable
export default function EmailConfigurationTable(props) {
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:EmailConfigurationTable
