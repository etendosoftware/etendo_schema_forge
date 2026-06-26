import React from 'react';

export function SetupProgressCard({ progress, title, description, leading, statusLabel, success = false }) {
  const ringColor = success ? '#54b56a' : '#171923';
  const trackColor = success ? '#d9f2df' : '#e6eaf2';
  const barColor = success ? '#54b56a' : '#171923';

  return (
    <div className="mx-auto w-full max-w-[980px] rounded-[1.75rem] border border-slate-200 bg-white px-8 py-10 shadow-[0_24px_70px_rgba(15,23,42,0.10)] sm:px-12 sm:py-14">
      <div className="flex min-h-[420px] flex-col items-center justify-center text-center">
        <div
          className="flex h-20 w-20 items-center justify-center rounded-full"
          style={{
            background: `conic-gradient(${ringColor} 0deg ${progress * 3.6}deg, ${trackColor} ${progress * 3.6}deg 360deg)`,
          }}
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-2xl">
            {leading}
          </div>
        </div>

        <h2 className="mt-6 text-3xl font-semibold tracking-[-0.04em] text-slate-900 sm:text-[2.2rem]">
          {title}
        </h2>
        <p className="mt-2 text-base text-slate-700 sm:text-lg">{description}</p>
      </div>

      <div className="mx-auto max-w-[460px]">
        <div className="mb-3 flex items-center justify-between text-sm text-slate-500">
          <span>{statusLabel}</span>
          <span>{progress}%</span>
        </div>
        <div className="h-2 rounded-full" style={{ backgroundColor: trackColor }}>
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${progress}%`, backgroundColor: barColor }}
          />
        </div>
      </div>
    </div>
  );
}

export default SetupProgressCard;
