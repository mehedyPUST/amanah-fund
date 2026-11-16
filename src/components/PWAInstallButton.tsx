'use client';

import { useState } from 'react';
import { Check, Download, ExternalLink, Smartphone, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { usePWAInstall } from '../utils/usePWAInstall.ts';
import { ActionModal } from './ActionModal.tsx';

interface PWAInstallButtonProps {
  compact?: boolean;
  className?: string;
}

export function PWAInstallButton({ compact = false, className = '' }: PWAInstallButtonProps) {
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
        title="Install Amanah App"
        aria-label="Install Amanah App"
        className={`inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800/70 bg-emerald-50/70 dark:bg-emerald-950/35 hover:bg-emerald-600 hover:text-white hover:border-emerald-600 dark:hover:bg-emerald-600 dark:hover:text-white text-emerald-700 dark:text-emerald-300 font-medium transition-all duration-200 cursor-pointer whitespace-nowrap ${
          compact ? 'px-2.5 py-2 text-xs' : 'px-3 py-2 text-xs'
        } ${className}`}
      >
        {hasNativePrompt ? (
          <Download className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        ) : (
          <Smartphone className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        )}
        <span className={compact ? 'hidden sm:inline' : ''}>Install App</span>
      </button>

      <ActionModal
        open={installedNoticeOpen}
        mode="notice"
        tone="emerald"
        title="Amanah App Installed"
        description="Amanah has been installed to your device. You can now launch it directly from your home screen or desktop app launcher in standalone mode."
        details={[
          { label: 'App Name', value: 'Amanah' },
          { label: 'Mode', value: 'Standalone PWA' },
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
                  className="relative z-10 w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-5 sm:p-6 space-y-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
                        <Smartphone className="w-5 h-5" aria-hidden="true" />
                      </div>
                      <div>
                        <h3
                          id="pwa-install-guide-title"
                          className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white"
                        >
                          {guideMode === 'iframe' || (isInIframe && !hasNativePrompt)
                            ? 'Open in New Tab to Install App'
                            : isIOS || guideMode === 'ios'
                              ? 'Install Amanah on iPhone / iPad'
                              : 'Install Amanah on Your Device'}
                        </h3>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setGuideMode(null)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                      aria-label="Close install instructions"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {guideMode === 'iframe' || (isInIframe && !hasNativePrompt) ? (
                    <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      <p>
                        Browsers block direct app installation inside embedded preview frames. Open
                        Amanah in its own browser tab, then click <strong>Install App</strong> or
                        use your browser address bar install icon.
                      </p>
                      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 space-y-1.5 text-[11px]">
                        <div className="flex items-center gap-1.5 font-medium text-slate-800 dark:text-slate-200">
                          <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span>Manifest &amp; Service Worker verified active</span>
                        </div>
                        <div className="text-slate-500 dark:text-slate-400">
                          Standalone mode works immediately once opened in a top-level tab.
                        </div>
                      </div>
                    </div>
                  ) : isIOS || guideMode === 'ios' ? (
                    <ol className="space-y-2 text-xs text-slate-600 dark:text-slate-300 leading-relaxed list-decimal list-inside">
                      <li>
                        Tap the <strong>Share</strong> icon in Safari&apos;s toolbar.
                      </li>
                      <li>
                        Scroll down and tap <strong>Add to Home Screen</strong>.
                      </li>
                      <li>
                        Tap <strong>Add</strong> in the top-right corner to launch Amanah as a
                        standalone app.
                      </li>
                    </ol>
                  ) : (
                    <ol className="space-y-2 text-xs text-slate-600 dark:text-slate-300 leading-relaxed list-decimal list-inside">
                      <li>
                        In Chrome or Edge desktop, click the <strong>Install</strong> icon in the
                        address bar or open <strong>⋮ Menu → Cast, save, and share → Install page
                        as app</strong>.
                      </li>
                      <li>
                        On Android Chrome, tap <strong>⋮ Menu → Install app</strong> (or{' '}
                        <strong>Add to Home screen</strong>).
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
                        className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-medium inline-flex items-center gap-1.5 shadow-xs"
                      >
                        <span>Open in New Tab</span>
                        <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => setGuideMode(null)}
                      className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      Close
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
