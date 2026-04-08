import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:bpLocation
const fields = [
  { key: 'name', column: 'Name', type: 'text', required: true, section: 'principal' },
  { key: 'phone', column: 'Phone', type: 'text', section: 'other' },
];
// @sf-generated-end fields:bpLocation

// @sf-generated-start component:BpLocationForm
export default function BpLocationForm(props) {
  // @sf-custom-slot hooks:BpLocationForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:BpLocationForm

// @sf-custom-slot section:BpLocationForm-custom
