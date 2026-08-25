import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:actividadesDelIae
const fields = [
  { key: 'epgrafeIAE', column: 'Epiae_Epigraph_ID', type: 'selector', label: 'Epígrafe IAE', section: 'principal', reference: 'EPIAE_Epigraph', inputMode: 'selector' },
  { key: 'default', column: 'Isdefault', type: 'checkbox', label: 'Valor por defecto', required: true, section: 'principal' },
  { key: 'epiaeType', column: 'Epiae_Type_ID', type: 'selector', label: 'Clave', section: 'principal', reference: 'epiae_type', inputMode: 'selector' },
  { key: 'epiaeCode', column: 'Epiae_Code_ID', type: 'selector', label: 'Código', section: 'principal', reference: 'EPIAE_Code', inputMode: 'selector' },
];
// @sf-generated-end fields:actividadesDelIae

// @sf-generated-start component:ActividadesDelIaeForm
export default function ActividadesDelIaeForm(props) {
  return <EntityForm fields={fields} {...props} />;
}

// @sf-generated-end component:ActividadesDelIaeForm
