import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:emailConfiguration
const fields = [
  { key: 'active', column: 'Isactive', type: 'checkbox', label: 'Active', required: true, section: 'principal' },
  { key: 'smtpServer', column: 'Smtpserver', type: 'text', label: 'Smtp Server', required: true, section: 'server' },
  { key: 'sMTPAuthentification', column: 'IsSmtpAuthorization', type: 'checkbox', label: 'SMTP Authentification', required: true, section: 'server' },
  { key: 'smtpServerAccount', column: 'Smtpserveraccount', type: 'text', label: 'Smtp Server Account', section: 'auth' },
  { key: 'smtpServerPassword', column: 'Smtpserverpassword', type: 'text', label: 'Smtp Server Password', section: 'auth' },
  { key: 'smtpServerSenderAddress', column: 'Smtpserversenderaddress', type: 'text', label: 'Smtp Server Sender Address', section: 'sender' },
  { key: 'smtpConnectionSecurity', column: 'Smtpconnectionsecurity', type: 'select', label: 'SMTP Connection Security', required: true, section: 'server', options: [{ value: 'N', label: 'None' }, { value: 'STARTTLS', label: 'STARTTLS' }, { value: 'SSL', label: 'SSL' }] },
  { key: 'smtpPort', column: 'Smtpport', type: 'number', label: 'Smtp Port', required: true, section: 'server', defaultValue: '25' },
  { key: 'smtpConnectionTimeout', column: 'SmtpTimeout', type: 'number', label: 'Smtp Connection Timeout', section: 'server', defaultValue: '600' },
  { key: 'fromName', column: 'Smtpserverfromname', type: 'text', label: 'From Name', section: 'sender' },
  { key: 'replyToAddress', column: 'Smtpreplytoaddress', type: 'text', label: 'Reply-To Address', section: 'sender' },
  { key: 'testSuccessful', column: 'Istestsuccessful', type: 'checkbox', label: 'Test Successful', required: true, readOnly: true, section: 'other', defaultValue: 'N' },
  { key: 'lastTestDate', column: 'Lasttestdate', type: 'date', label: 'Last Test Date', readOnly: true, section: 'other' },
  { key: 'defaultConfiguration', column: 'Isdefaultconfig', type: 'checkbox', label: 'Default', required: true, section: 'principal', defaultValue: 'N' },
];
// @sf-generated-end fields:emailConfiguration

// @sf-generated-start component:EmailConfigurationForm
export default function EmailConfigurationForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:EmailConfigurationForm
