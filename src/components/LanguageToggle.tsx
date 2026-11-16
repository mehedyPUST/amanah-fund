'use client';

import { Languages } from 'lucide-react';
import { useCoopSession } from './AppProviders.tsx';

interface LanguageToggleProps {
  compact?: boolean;
  fullWidth?: boolean;
}

export function LanguageToggle({ compact = false, fullWidth = false }: LanguageToggleProps) {
  const { language, setLanguage, t } = useCoopSession();
  const isBangla = language === 'bn';

  if (fullWidth) {
    return (
      <div className="w-full py-2 px-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-sm font-medium flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2">
          <Languages className="w-4 h-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          <span>{t.common.language}</span>
        </span>
        <div
          role="group"
          aria-label={t.common.language}
          className="inline-flex items-center rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 p-0.5 text-xs"
        >
          <button
            type="button"
            onClick={() => setLanguage('en')}
            aria-pressed={!isBangla}
            className={`px-2 py-1 rounded font-medium transition-colors cursor-pointer ${
              !isBangla
                ? 'bg-emerald-600 text-white'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            EN
          </button>
          <button
            type="button"
            onClick={() => setLanguage('bn')}
            aria-pressed={isBangla}
            className={`px-2 py-1 rounded font-medium transition-colors cursor-pointer ${
              isBangla
                ? 'bg-emerald-600 text-white'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            বাংলা
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      role="group"
      aria-label={t.common.language}
      title={isBangla ? t.common.switchToEnglish : t.common.switchToBangla}
      className={`inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-0.5 text-xs font-medium ${
        compact ? 'gap-0.5' : 'gap-0.5'
      }`}
    >
      <span className="pl-1.5 pr-1 text-emerald-700 dark:text-emerald-400 hidden sm:inline-flex items-center">
        <Languages className="w-3.5 h-3.5" aria-hidden="true" />
      </span>
      <button
        type="button"
        onClick={() => setLanguage('en')}
        aria-pressed={!isBangla}
        aria-label={t.common.switchToEnglish}
        className={`px-2 py-1 rounded-md transition-colors cursor-pointer whitespace-nowrap ${
          !isBangla
            ? 'bg-emerald-600 text-white shadow-2xs'
            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
        }`}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => setLanguage('bn')}
        aria-pressed={isBangla}
        aria-label={t.common.switchToBangla}
        className={`px-2 py-1 rounded-md transition-colors cursor-pointer whitespace-nowrap ${
          isBangla
            ? 'bg-emerald-600 text-white shadow-2xs'
            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
        }`}
      >
        বাংলা
      </button>
    </div>
  );
}
