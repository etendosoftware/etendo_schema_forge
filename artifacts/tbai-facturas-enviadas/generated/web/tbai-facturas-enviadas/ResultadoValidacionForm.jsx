import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:resultadoValidación
const fields = [
  { key: 'active', column: 'Isactive', type: 'checkbox', label: 'Activo', required: true, section: 'principal', defaultValue: 'Y' },
  { key: 'codigo', column: 'Codigo', type: 'text', label: 'Código', readOnly: true, section: 'other' },
  { key: 'descripcion', column: 'Descripcion', type: 'text', label: 'Descripción', readOnly: true, section: 'other' },
];
// @sf-generated-end fields:resultadoValidación

// @sf-generated-start component:ResultadoValidacionForm
export default function ResultadoValidacionForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
ResultadoValidacionForm.fields = fields;

// @sf-generated-end component:ResultadoValidacionForm
