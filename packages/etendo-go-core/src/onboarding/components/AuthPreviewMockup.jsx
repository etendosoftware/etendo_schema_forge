import React from 'react';

export function AuthPreviewMockup() {
  const baseUrl = import.meta.env?.BASE_URL || '/';
  return (
    <div className="relative mt-12 flex w-full flex-1 items-end justify-end pb-2 pl-8">
      <div className="absolute inset-x-16 bottom-6 h-12 rounded-full bg-white/70 blur-3xl" />
      <img
        src={`${baseUrl}auth-dashboard-preview.png`}
        alt="Etendo dashboard preview"
        className="relative z-10 block h-auto w-full max-w-[1000px] select-none pointer-events-none object-contain drop-shadow-[0_28px_56px_rgba(15,23,42,0.16)]"
      />
    </div>
  );
}

export default AuthPreviewMockup;
