'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, Download, ExternalLink, Eye, EyeOff, FileText } from 'lucide-react';
import { useCoopSession } from './AppProviders.tsx';

const CONSTITUTION_PDF_PATH =
  '/assets/aistudio/Savings__Investment_and_Interest-Free_Loan_Fund_Cooperative_Society_Update_1_98df82ac.pdf';

const RULE_STYLES = [
  {
    cardClass:
      'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-emerald-300 dark:hover:border-emerald-700/70',
    codeClass: 'text-emerald-700 dark:text-emerald-400',
    iconClass: 'text-emerald-600 dark:text-emerald-400',
  },
  {
    cardClass:
      'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-teal-300 dark:hover:border-teal-700/70',
    codeClass: 'text-teal-700 dark:text-teal-400',
    iconClass: 'text-teal-600 dark:text-teal-400',
  },
  {
    cardClass:
      'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-emerald-300 dark:hover:border-emerald-700/70',
    codeClass: 'text-emerald-700 dark:text-emerald-400',
    iconClass: 'text-emerald-600 dark:text-emerald-400',
  },
  {
    cardClass:
      'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-teal-300 dark:hover:border-teal-700/70',
    codeClass: 'text-teal-700 dark:text-teal-400',
    iconClass: 'text-teal-600 dark:text-teal-400',
  },
  {
    cardClass:
      'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-amber-300 dark:hover:border-amber-700/70',
    codeClass: 'text-amber-600 dark:text-amber-400',
    iconClass: 'text-amber-600 dark:text-amber-400',
  },
  {
    cardClass:
      'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-amber-300 dark:hover:border-amber-700/70',
    codeClass: 'text-amber-600 dark:text-amber-400',
    iconClass: 'text-amber-600 dark:text-amber-400',
  },
];

export function Rules({ embedded = false }: { embedded?: boolean }) {
  const { t } = useCoopSession();
  const HeadingTag = embedded ? 'h2' : 'h1';
  const [showPdfPreview, setShowPdfPreview] = useState(false);

  return (
    <div className="bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20 space-y-10">
        <div className="space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
            {t.rules.eyebrow}
          </div>
          <HeadingTag className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
            {t.rules.headline}
          </HeadingTag>
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 max-w-3xl leading-relaxed">
            {t.rules.description}
          </p>
        </div>

        {/* Official Constitution PDF Document Card */}
        <div className="rounded-xl border border-emerald-200/90 dark:border-emerald-900/60 bg-gradient-to-br from-emerald-50/80 via-white to-white dark:from-emerald-950/35 dark:via-slate-900 dark:to-slate-900 p-5 sm:p-6 space-y-4 shadow-xs">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-200 dark:ring-emerald-800/60 flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5" aria-hidden="true" />
              </div>
              <div className="space-y-1">
                <h2 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white">
                  {t.rules.pdfTitle}
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {t.rules.pdfDescription}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setShowPdfPreview((v) => !v)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200 transition-colors cursor-pointer"
              >
                {showPdfPreview ? (
                  <>
                    <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{t.rules.hidePdf}</span>
                  </>
                ) : (
                  <>
                    <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{t.rules.previewPdf}</span>
                  </>
                )}
              </button>
              <a
                href={CONSTITUTION_PDF_PATH}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-xs font-medium text-emerald-800 dark:text-emerald-300 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{t.rules.openPdf}</span>
              </a>
              <a
                href={CONSTITUTION_PDF_PATH}
                download="Savings-Investment-Interest-Free-Loan-Fund-Constitution-2027-2036.pdf"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white text-xs font-medium shadow-xs transition-all"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{t.rules.downloadPdf}</span>
              </a>
            </div>
          </div>

          {showPdfPreview && (
            <div className="rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
              <iframe
                src={CONSTITUTION_PDF_PATH}
                title="Savings, Investment and Interest-Free Loan Fund Cooperative Society Constitution PDF"
                className="w-full h-[560px]"
              />
            </div>
          )}
        </div>

        <div className="space-y-4">
          {t.rules.rules.map((rule, idx) => {
            const style = RULE_STYLES[idx];
            return (
              <article
                key={rule.code}
                className={`border rounded-xl p-6 space-y-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${style.cardClass}`}
              >
                <div className="flex flex-wrap items-baseline gap-3">
                  <span className={`font-mono text-xs sm:text-sm font-bold ${style.codeClass}`}>
                    {rule.code}
                  </span>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                    {rule.title}
                  </h2>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  {rule.summary}
                </p>
                <ul className="space-y-1.5 pt-1">
                  {rule.points.map((pt) => (
                    <li
                      key={pt}
                      className="flex items-start gap-2 text-xs sm:text-sm text-slate-700 dark:text-slate-300"
                    >
                      <CheckCircle2
                        className={`w-4 h-4 shrink-0 mt-0.5 ${style.iconClass}`}
                        aria-hidden="true"
                      />
                      <span>{pt}</span>
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 pt-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t.rules.bottomPrompt}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/login"
              className="px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all duration-200"
            >
              {t.rules.memberSignIn}
            </Link>
            <Link
              href="/signup"
              className="group px-5 py-2.5 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white text-xs font-medium inline-flex items-center gap-1.5 shadow-xs hover:shadow-md transition-all duration-200 active:scale-[0.98]"
            >
              <span>{t.rules.applyMembership}</span>
              <ArrowRight
                className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
