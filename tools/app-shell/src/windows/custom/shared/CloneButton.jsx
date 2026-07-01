import { useState } from 'react';

function CopyIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

const btnStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '7px',
  borderRadius: 6,
  border: '1px solid #D1D4DB',
  background: '#FFFFFF',
  color: '#64748B',
  cursor: 'pointer',
  boxShadow: '0px 1px 2px 0px #1212170D',
};

export default function CloneButton({ onClick, title }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ ...btnStyle, background: hovered ? '#F1F5F9' : '#FFFFFF' }}
      title={title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <CopyIcon data-testid="CopyIcon__b4cd7a" />
    </button>
  );
}
