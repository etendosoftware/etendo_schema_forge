import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:sequence
const fields = [
  { key: 'name', column: 'Name', type: 'text', label: 'Name', required: true, section: 'principal' },
  { key: 'description', column: 'Description', type: 'textarea', label: 'Description', section: 'principal' },
  { key: 'autoNumbering', column: 'IsAutoSequence', type: 'checkbox', label: 'Auto Numbering', required: true, section: 'principal' },
  { key: 'incrementBy', column: 'IncrementNo', type: 'number', label: 'Increment By', required: true, section: 'principal', defaultValue: '1', integer: true },
  { key: 'nextAssignedNumber', column: 'CurrentNext', type: 'number', label: 'Next Assigned Number', required: true, section: 'other', defaultValue: '1000000', integer: true },
  { key: 'startingNo', column: 'StartNo', type: 'number', label: 'Starting No.', required: true, section: 'other', defaultValue: '1000000', integer: true },
  { key: 'prefix', column: 'Prefix', type: 'text', label: 'Prefix', section: 'other' },
  { key: 'suffix', column: 'Suffix', type: 'text', label: 'Suffix', section: 'other' },
  { key: 'restartSequenceEveryYear', column: 'StartNewYear', type: 'checkbox', label: 'Restart sequence every Year', section: 'other' },
  { key: 'valueFormat', column: 'VFormat', type: 'text', label: 'Value Format', section: 'other' },
  { key: 'mask', column: 'Mask', type: 'text', label: 'Mask', section: 'other', defaultValue: '#######' },
];
// @sf-generated-end fields:sequence

// @sf-generated-start component:SequenceForm
export default function SequenceForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
SequenceForm.fields = fields;

// @sf-generated-end component:SequenceForm
