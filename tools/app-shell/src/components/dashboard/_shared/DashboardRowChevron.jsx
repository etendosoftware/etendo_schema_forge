import { ChevronRight } from 'lucide-react';

const WRAPPER_STYLE = {
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'flex-start',
  padding: '0px 4px 0px 0px',
  width: '28px',
  height: '24px',
  flexShrink: 0,
};

const ICON_STYLE = {
  width: '16px',
  height: '16px',
  color: '#828FA3',
};

export function DashboardRowChevron() {
  return (
    <div style={WRAPPER_STYLE}>
      <ChevronRight style={ICON_STYLE} data-testid="ChevronRight__e40207" />
    </div>
  );
}
