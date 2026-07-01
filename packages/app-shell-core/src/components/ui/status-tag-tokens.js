/** Figma token map: status tone → { background, color } (ETP-3835) */
export const TONE_STYLES = {
  success:     { background: '#EEFBF4', color: '#17663A' },
  warning:     { background: '#FFF9EB', color: '#8A6100' },
  destructive: { background: '#FEF0F4', color: '#D50B3E' },
  neutral:     { background: '#F5F7F9', color: '#3F3F50' },
  info:        { background: '#F0FAFF', color: '#0075AD' },
};

export const BASE_STYLE = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '4px 8px',
  borderRadius: '9999px',
  fontSize: '12px',
  lineHeight: '16px',
  fontWeight: 400,
  whiteSpace: 'nowrap',
};
