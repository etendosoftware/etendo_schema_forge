import EntityField from './EntityField.jsx';
import EntityCell from './EntityCell.jsx';

/* eslint-disable react/prop-types */

export default function KindRenderer({ mode = 'field', kind, ...props }) {
  const className = props.className || 'w-full rounded-md border border-border-subtle bg-card px-2 py-1.5 text-sm text-foreground focus:border-foreground focus:outline-none';

  if (kind === 'entity') {
    return mode === 'cell'
      ? <EntityCell {...props} data-testid="EntityCell__c86eb6" />
      : <EntityField {...props} data-testid="EntityField__c86eb6" />;
  }
  if (kind === 'date') {
    return <input type="date" value={props.value ?? ''} onChange={(e) => props.onChange(e.target.value)} className={className} />;
  }
  if (kind === 'number') {
    return <input type="number" step="any" value={props.value ?? ''} onChange={(e) => props.onChange(e.target.value)} className={className} />;
  }
  return <input type="text" value={props.value ?? ''} onChange={(e) => props.onChange(e.target.value)} className={className} />;
}
