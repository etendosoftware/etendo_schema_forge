import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:representanteLegal
const fields = [
  { key: 'taxID', column: 'Taxid', type: 'text', label: 'CIF/NIF', required: true, section: 'principal', maxLength: 20 },
  { key: 'firstName', column: 'Firstname', type: 'text', label: 'Nombre', required: true, section: 'principal', maxLength: 60 },
  { key: 'lastname1', column: 'Lastname1', type: 'text', label: 'Primer Apellido', required: true, section: 'principal', maxLength: 60 },
  { key: 'lastname2', column: 'Lastname2', type: 'text', label: 'Segundo Apellido', section: 'principal', maxLength: 60 },
  { key: 'powerDate', column: 'Power_Date', type: 'date', label: 'Fecha Poder', required: true, section: 'other' },
  { key: 'notaryName', column: 'Notary_Name', type: 'text', label: 'Notaría', required: true, section: 'other', maxLength: 60 },
];
// @sf-generated-end fields:representanteLegal

// @sf-generated-start component:RepresentanteLegalForm
export default function RepresentanteLegalForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
RepresentanteLegalForm.fields = fields;

// @sf-generated-end component:RepresentanteLegalForm
