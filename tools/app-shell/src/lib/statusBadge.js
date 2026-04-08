/**
 * Map a document status string to Badge component props.
 * Shared between DataTable and DetailView.
 */
export function getStatusBadgeProps(status) {
  const s = String(status ?? '').toLowerCase();
  if (s === 'draft' || s === 'dr') {
    return { variant: 'secondary' };
  }
  if (s === 'completed' || s === 'complete' || s === 'booked' || s === 'co' || s === 'rppc' || s === 'ppm' || s === 'pwnc' || s === 'rdnc') {
    return { variant: 'default', className: 'bg-emerald-600 hover:bg-emerald-700 border-transparent text-white' };
  }
  if (s === 'closed' || s === 'cl' || s === 'paid' || s === 'pa') {
    return { variant: 'default', className: 'bg-blue-600 hover:bg-blue-700 border-transparent text-white' };
  }
  if (s === 'voided' || s === 'cancelled' || s === 'void' || s === 'vo' || s === 'ca' || s === 'rpvoid') {
    return { variant: 'destructive' };
  }
  if (s === 'in process' || s === 'ip' || s === 'rpae' || s === 'rpap' || s === 'rpr') {
    return { variant: 'outline', className: 'border-amber-300 bg-amber-50 text-amber-700' };
  }
  if (s === 'under evaluation' || s === 'ue') {
    return { variant: 'outline', className: 'border-purple-300 bg-purple-50 text-purple-700' };
  }
  return { variant: 'outline' };
}

export function getStatusDotColor(status) {
  const s = String(status ?? '').toLowerCase();
  if (s === 'draft' || s === 'dr') return 'bg-gray-400';
  if (s === 'completed' || s === 'complete' || s === 'booked' || s === 'co' || s === 'rppc' || s === 'ppm' || s === 'pwnc' || s === 'rdnc') return 'bg-emerald-500';
  if (s === 'closed' || s === 'cl' || s === 'paid' || s === 'pa') return 'bg-blue-500';
  if (s === 'voided' || s === 'cancelled' || s === 'void' || s === 'vo' || s === 'ca' || s === 'rpvoid') return 'bg-red-500';
  if (s === 'in process' || s === 'ip' || s === 'rpae' || s === 'rpap' || s === 'rpr') return 'bg-amber-400';
  if (s === 'under evaluation' || s === 'ue') return 'bg-purple-500';
  return 'bg-gray-400';
}

export function statusLabel(status) {
  const MAP = {
    // Document statuses
    DR: 'Draft', CO: 'Complete', VO: 'Void', IP: 'In Process',
    CL: 'Closed', PA: 'Paid', UE: 'Under Evaluation', CA: 'Cancelled',
    // Payment statuses
    RPR: 'Payment Received', RPAE: 'Awaiting Execution', RPAP: 'Awaiting Payment',
    RPPC: 'Payment Cleared', RPVOID: 'Void',
    PPM: 'Payment Made', PWNC: 'Withdrawn not Cleared', RDNC: 'Deposited not Cleared',
  };
  return MAP[status] || status;
}
