'use client';

import { useState } from 'react';
import { Check, Download, ExternalLink, Smartphone, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { usePWAInstall } from '../utils/usePWAInstall.ts';
import { ActionModal } from './ActionModal.tsx';
import { AmanahLogo } from './AmanahLogo.tsx';

interface PWAInstallButtonProps {
  compact?: boolean;
  className?: string;
}

export function PWAInstallButton({ compact = false, className = '' }: PWAInstallButtonProps) {
  const tPwa = useTranslations('PWA');
  const tCommon = useTranslations('Common');
  const { isInstalled, isIOS, isInIframe, hasNativePrompt, canInstall, promptInstall } =
    usePWAInstall();
  const [guideMode, setGuideMode] = useState<'ios' | 'iframe' | 'manual' | null>(null);
  const [installedNoticeOpen, setInstalledNoticeOpen] = useState(false);

  if (isInstalled || !canInstall) return null;

  async function handleClick() {
    const outcome = await promptInstall();
    if (outcome === 'accepted') {
      setInstalledNoticeOpen(true);
    } else if (outcome === 'ios' || outcome === 'iframe' || outcome === 'manual') {
      setGuideMode(outcome);
    }
  }

  const currentHref = typeof window !== 'undefined' ? window.location.href : '/';

  return (
    <>
      <button
        type="button"
        onClick={() => void handleClick()}
        title={tPwa('installTitle')}
        aria-label={tPwa('installTitle')}
        className={`inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 dark:border-emerald-800/70 bg-emerald-50/70 dark:bg-emerald-950/35 hover:bg-emerald-600 hover:text-white hover:border-emerald-600 dark:hover:bg-emerald-600 dark:hover:text-white text-emerald-700 dark:text-emerald-300 font-medium transition-all duration-200 cursor-pointer whitespace-nowrap ${
          compact ? 'px-2.5 py-2 text-xs' : 'px-3 py-2 text-xs'
        } ${className}`}
      >
        {hasNativePrompt ? (
          <Download className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        ) : (
          <Smartphone className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        )}
        <span className={compact ? 'hidden sm:inline' : ''}>{tPwa('installApp')}</span>
      </button>

      <ActionModal
        open={installedNoticeOpen}
        mode="notice"
        tone="emerald"
        title={tPwa('installedTitle')}
        description={tPwa('installedDesc')}
        details={[
          { label: tPwa('appName'), value: tCommon('brandName') },
          { label: tPwa('mode'), value: tPwa('standaloneMode') },
        ]}
        onClose={() => setInstalledNoticeOpen(false)}
      />

      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {guideMode !== null && (
              <div
                className="fixed inset-0 z-[75] flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
                role="dialog"
                aria-modal="true"
                aria-labelledby="pwa-install-guide-title"
              >
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setGuideMode(null)}
                  className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs"
                  aria-hidden="true"
                />
                <motion.div
                  initial={{ opacity: 0, scale: 0.96, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96, y: 8 }}
                  className="relative z-10 w-full max-w-md bg-white/96 dark:bg-slate-900/96 backdrop-blur-xl border border-slate-200/85 dark:border-slate-800/85 ring-1 ring-inset ring-white/80 dark:ring-white/10 rounded-2xl shadow-[0_24px_60px_-16px_rgba(15,23,42,0.3)] p-5 sm:p-6 space-y-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <AmanahLogo size="sm" className="w-9 h-9 rounded-xl" decorative />
                      <div>
                        <h3
                          id="pwa-install-guide-title"
                          className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white"
                        >
                          {guideMode === 'iframe' || (isInIframe && !hasNativePrompt)
                            ? tPwa('openNewTabInstall')
                            : isIOS || guideMode === 'ios'
                              ? tPwa('installIos')
                              : tPwa('installDevice')}
                        </h3>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setGuideMode(null)}
                      className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                      aria-label={tCommon('closeDialog')}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {guideMode === 'iframe' || (isInIframe && !hasNativePrompt) ? (
                    <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      <p>
                        {tPwa('iframeBlockedPrefix')}{' '}
                        <strong>{tPwa('installApp')}</strong> {tPwa('iframeBlockedSuffix')}
                      </p>
                      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/80 p-3 space-y-1.5 text-[11px]">
                        <div className="flex items-center gap-1.5 font-medium text-slate-800 dark:text-slate-200">
                          <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span>{tPwa('swVerifiedActive')}</span>
                        </div>
                        <div className="text-slate-500 dark:text-slate-400">
                          {tPwa('standaloneTopTabNote')}
                        </div>
                      </div>
                    </div>
                  ) : isIOS || guideMode === 'ios' ? (
                    <ol className="space-y-2 text-xs text-slate-600 dark:text-slate-300 leading-relaxed list-decimal list-inside">
                      <li>
                        {tPwa('iosStep1Prefix')}{' '}
                        <strong>{tPwa('iosStep1Highlight')}</strong> {tPwa('iosStep1Suffix')}
                      </li>
                      <li>
                        {tPwa('iosStep2Prefix')}{' '}
                        <strong>{tPwa('iosStep2Highlight')}</strong>.
                      </li>
                      <li>
                        {tPwa('iosStep3Prefix')}{' '}
                        <strong>{tPwa('iosStep3Highlight')}</strong> {tPwa('iosStep3Suffix')}
                      </li>
                    </ol>
                  ) : (
                    <ol className="space-y-2 text-xs text-slate-600 dark:text-slate-300 leading-relaxed list-decimal list-inside">
                      <li>
                        {tPwa('desktopStepPrefix')}{' '}
                        <strong>{tPwa('desktopStepHighlight1')}</strong> {tPwa('desktopStepMid')}{' '}
                        <strong>{tPwa('desktopStepHighlight2')}</strong>.
                      </li>
                      <li>
                        {tPwa('androidStepPrefix')}{' '}
                        <strong>{tPwa('androidStepHighlight1')}</strong> ({tPwa('androidStepOr')}{' '}
                        <strong>{tPwa('androidStepHighlight2')}</strong>).
                      </li>
                    </ol>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    {(guideMode === 'iframe' || (isInIframe && !hasNativePrompt)) && (
                      <a
                        href={currentHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setGuideMode(null)}
                        className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-sm shadow-emerald-600/20 active:scale-[0.98] transition-all"
                      >
                        <span>{tPwa('openNewTab')}</span>
                        <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => setGuideMode(null)}
                      className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                    >
                      {tCommon('close')}
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </>
  );
}
