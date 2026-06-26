import React from 'react';
import { Sparkles } from 'lucide-react';
import AuthBrand from './AuthBrand.jsx';
import AuthFeaturePill from './AuthFeaturePill.jsx';
import AuthPreviewMockup from './AuthPreviewMockup.jsx';

export function AuthShell({ brandLabel, switchPrompt, switchAction, switchTestId, onSwitch, headerContent, marketingTitle, marketingDescription, featureLabels, children }) {
  return (
    <div className="min-h-screen bg-white">
      <div className="flex min-h-screen w-full bg-white lg:grid lg:grid-cols-[minmax(0,1.12fr)_minmax(420px,0.88fr)]">
        <section className="flex min-h-[720px] flex-col bg-white px-6 py-6 sm:px-8 lg:px-10 xl:px-12">
          <div className="flex flex-col gap-5 border-b border-slate-100 pb-6 sm:flex-row sm:items-start sm:justify-between lg:border-b-0 lg:pb-0">
            <AuthBrand label={brandLabel} data-testid="AuthBrand__79cf84" />
            <div className="flex flex-col items-end gap-4">
              {headerContent}
              <p className="text-xs text-slate-700 sm:text-sm">
                {switchPrompt}{' '}
                <button
                  type="button"
                  data-testid={switchTestId}
                  onClick={onSwitch}
                  className="font-medium text-slate-900 underline underline-offset-4 transition hover:text-slate-700"
                >
                  {switchAction}
                </button>
              </p>
            </div>
          </div>

          <div className="flex flex-1 items-center justify-center py-10 lg:py-16">
            <div className="w-full max-w-[34.75rem]">{children}</div>
          </div>
        </section>

        <aside className="relative hidden overflow-hidden bg-[#f4f6fa] px-10 py-12 lg:flex lg:flex-col xl:px-12">
          <div className="relative flex h-full flex-col">
            <div className="max-w-xl">
              <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm">
                <Sparkles className="h-6 w-6 text-slate-500" data-testid="Sparkles__79cf84" />
              </div>
              <h2 className="max-w-xl text-3xl font-semibold tracking-[-0.05em] text-slate-900 xl:text-[2.5rem] xl:leading-[1.08]">
                {marketingTitle}
              </h2>
              <p className="mt-4 max-w-2xl text-lg leading-7 text-slate-600">
                {marketingDescription}
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                {featureLabels.map((feature) => (
                  <AuthFeaturePill key={feature} data-testid="AuthFeaturePill__79cf84">{feature}</AuthFeaturePill>
                ))}
              </div>
            </div>

            <AuthPreviewMockup data-testid="AuthPreviewMockup__79cf84" />
          </div>
        </aside>
      </div>
    </div>
  );
}

export default AuthShell;
