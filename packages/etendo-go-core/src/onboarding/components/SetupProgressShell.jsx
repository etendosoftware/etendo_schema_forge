import React from 'react';

export function SetupProgressShell({ children }) {
  const baseUrl = import.meta.env?.BASE_URL || '/';
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f5f7fb]">
      <div className="absolute inset-y-0 left-0 w-[150px] overflow-hidden border-r border-white/30 bg-white/10 md:w-[170px]">
        <img
          src={`${baseUrl}auth-dashboard-preview.png`}
          alt="Etendo dashboard background"
          className="absolute left-0 top-1/2 h-[120vh] max-w-none -translate-y-1/2 object-contain opacity-45 blur-[1.5px]"
        />
      </div>
      <div className="absolute inset-0 bg-[#f5f7fb]/88" />
      <div className="absolute inset-y-0 left-0 z-[1] w-[150px] bg-transparent md:w-[170px]" />

      <div className="relative z-10 flex min-h-screen items-center justify-center px-6 py-10">
        {children}
      </div>
    </div>
  );
}

export default SetupProgressShell;
