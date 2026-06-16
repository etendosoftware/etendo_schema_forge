import * as React from 'react';

export function ValerIATile({ size = 32, radius = 8 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: radius,
      background: 'linear-gradient(180deg,#F8D414 0%,#FFE356 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.06)',
    }}>
      <svg viewBox="0 0 20.241 20" width={size * 0.5} height={size * 0.5} fill="#202452">
        <path d="M 18.006 15.543 L 13.443 10.003 L 18.198 4.229 L 18.191 4.232 L 19.946 2.102 C 20.636 1.263 20.04 0 18.953 0 L 0.771 0 C 0.345 0 0 0.345 0 0.771 L 0 19.229 C 0 19.655 0.345 20 0.771 20 L 18.952 20 C 20.038 20 20.634 18.737 19.944 17.898 L 18.003 15.541 L 18.006 15.541 L 18.006 15.543 Z M 1.856 18.144 L 1.856 1.856 L 17.74 1.856 L 12.237 8.538 L 10.155 6.734 C 9.911 6.438 9.548 6.266 9.163 6.266 L 5.663 6.266 L 5.663 8.122 L 8.893 8.122 L 11.035 9.997 L 11.038 10.001 L 9.086 11.645 L 5.665 11.645 L 5.665 13.502 L 7.557 13.502 L 9.257 13.502 L 9.355 13.502 C 9.739 13.502 10.104 13.331 10.348 13.033 L 12.24 11.461 L 17.742 18.141 L 1.856 18.141 L 1.856 18.144 Z" />
      </svg>
    </div>
  );
}
