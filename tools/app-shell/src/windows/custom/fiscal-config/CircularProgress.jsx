// The circular progress of a long server check (extracted from CertModal — the fiscal certificate
// upload — so other modals show the same loading state: the 390 file validation, ETP-5716).
// The backend reports no real progress: `useSimulatedProgress` advances to 90 % and waits there.
import { useEffect, useState } from 'react';

/** 0 → 90 while `active`, back to 0 when it is not. */
export function useSimulatedProgress(active) {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    setProgress(0);
    if (!active) return undefined;
    const id = setInterval(() => {
      setProgress(p => {
        if (p >= 90) { clearInterval(id); return 90; }
        return p + 4;
      });
    }, 80);
    return () => clearInterval(id);
  }, [active]);
  return progress;
}

export function CircularProgress({ progress }) {
  const r = 54;
  const circ = 2 * Math.PI * r;
  const offset = circ - (progress / 100) * circ;
  return (
    <svg width="140" height="140" viewBox="0 0 140 140" className="mx-auto">
      <circle cx="70" cy="70" r={r} fill="none" stroke="hsl(var(--border-subtle))" strokeWidth="8" />
      <circle
        cx="70" cy="70" r={r}
        fill="none" stroke="hsl(var(--foreground))" strokeWidth="8"
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 70 70)"
        style={{ transition: 'stroke-dashoffset 0.2s ease' }}
      />
      <text x="70" y="76" textAnchor="middle" fontSize="22" fontWeight="600" fill="hsl(var(--foreground))">
        {progress}%
      </text>
    </svg>
  );
}
