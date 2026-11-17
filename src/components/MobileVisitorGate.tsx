'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowRight, BookOpen, LogIn, Shield, UserPlus } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCoopSession } from './AppProviders.tsx';

export function MobileVisitorGate() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, authChecking } = useCoopSession();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 1023px)');
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const isAuthOrCharterPage =
    pathname === '/login' ||
    pathname === '/signup' ||
    pathname === '/rules' ||
    pathname.startsWith('/login/') ||
    pathname.startsWith('/signup/') ||
    pathname.startsWith('/rules/');

  // Authenticated mobile visitors go directly to the app main interface (/dashboard)
  useEffect(() => {
    if (!isMobile || authChecking || !user) return;
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('browse') === '1') return;
    if (pathname === '/') {
      router.replace('/dashboard');
    }
  }, [isMobile, authChecking, user, pathname, router]);

  const showWelcomeModal = isMobile && !authChecking && !user && !isAuthOrCharterPage;

  return (
    <AnimatePresence>
      {showWelcomeModal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="mobile-visitor-gate-title"
          className="lg:hidden fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-sm rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xl overflow-hidden"
          >
            {/* Brand Header */}
            <div className="bg-gradient-to-br from-emerald-700 via-teal-700 to-emerald-900 text-white px-5 py-5">
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-2xl bg-white/15 border border-white/25 flex items-center justify-center shrink-0">
                  <Shield className="w-5 h-5 text-white" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h2
                    id="mobile-visitor-gate-title"
                    className="font-display text-lg font-bold tracking-tight"
                  >
                    Amanah Co-op
                  </h2>
                  <p className="text-xs text-emerald-100/85">
                    Qard Hasan &amp; Halal Treasury
                  </p>
                </div>
              </div>
            </div>

            <div className="p-5 space-y-5">
              {/* Registered Member Section */}
              <div className="space-y-2.5">
                <div className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                  Registered Member?
                </div>
                <Link
                  href="/login"
                  className="w-full min-h-[48px] px-4 py-3 rounded-2xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-sm font-semibold shadow-sm flex items-center justify-between gap-3 active:scale-[0.99] transition-all"
                >
                  <span className="inline-flex items-center gap-2.5">
                    <LogIn className="w-4.5 h-4.5" aria-hidden="true" />
                    <span>Sign In</span>
                  </span>
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </Link>
              </div>

              <div className="h-px bg-slate-200/80 dark:bg-slate-800" aria-hidden="true" />

              {/* New to Amanah Section */}
              <div className="space-y-2.5">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                  New to Amanah?
                </div>

                <div className="space-y-2.5">
                  <Link
                    href="/rules"
                    className="w-full min-h-[46px] px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm font-medium flex items-center justify-between gap-3 active:scale-[0.99] transition-all"
                  >
                    <span className="inline-flex items-center gap-2.5">
                      <BookOpen
                        className="w-4.5 h-4.5 text-emerald-700 dark:text-emerald-400"
                        aria-hidden="true"
                      />
                      <span>Read the Charter</span>
                    </span>
                    <ArrowRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
                  </Link>

                  <Link
                    href="/signup"
                    className="w-full min-h-[46px] px-4 py-2.5 rounded-2xl border border-emerald-200 dark:border-emerald-800/80 bg-emerald-50/70 dark:bg-emerald-950/35 hover:bg-emerald-100/80 dark:hover:bg-emerald-950/55 text-emerald-800 dark:text-emerald-300 text-sm font-semibold flex items-center justify-between gap-3 active:scale-[0.99] transition-all"
                  >
                    <span className="inline-flex items-center gap-2.5">
                      <UserPlus className="w-4.5 h-4.5" aria-hidden="true" />
                      <span>Apply to Join</span>
                    </span>
                    <ArrowRight className="w-4 h-4" aria-hidden="true" />
                  </Link>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
