import React from 'react';
import AuthBrand from './AuthBrand.jsx';

export function SetupShell({ brandLabel, progressLabel, progressValue, headerContent, children }) {
  const baseUrl = import.meta.env?.BASE_URL || '/';
  return (
    <div className="min-h-screen bg-white">
      <div className="flex min-h-screen w-full bg-white lg:grid lg:grid-cols-[minmax(0,1.12fr)_minmax(420px,0.88fr)]">
        <section className="flex min-h-screen flex-col bg-white px-6 py-6 sm:px-8 lg:px-10 xl:px-12">
          <div className="flex items-start justify-between gap-6">
            <AuthBrand label={brandLabel} data-testid="AuthBrand__79cf84" />
            <div className="flex w-full max-w-[22rem] flex-col items-end gap-3 pt-1">
              {headerContent}
              <div className="w-full">
                <p className="text-right text-xs font-medium text-slate-500 sm:text-sm">
                  {progressLabel}
                </p>
                <div className="mt-3 h-2.5 rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-slate-900 transition-all duration-300"
                    style={{ width: `${progressValue}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-1 items-center justify-center py-10 lg:py-16">
            <div className="w-full max-w-[34.75rem]">{children}</div>
          </div>
        </section>

        <aside className="relative hidden overflow-hidden bg-[#f4f6fa] lg:flex lg:flex-col">
          <div className="flex h-full items-center justify-end overflow-hidden pl-12 pt-24">
            <img
              src={`${baseUrl}auth-dashboard-preview.png`}
              alt="Etendo app preview"
              className="h-auto w-[1300px] max-w-none translate-x-[14%] object-contain opacity-30 blur-[1.5px]"
            />
          </div>
        </aside>
      </div>
    </div>
  );
}

export default SetupShell;
