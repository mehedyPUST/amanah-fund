'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  ArrowRight,
  BookOpen,
  Eye,
  EyeOff,
  Lock,
  Shield,
  UserPlus,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { api } from '../utils/api.ts';
import { useCoopSession } from './AppProviders.tsx';

export function MobileVisitorGate() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, authChecking, setUser } = useCoopSession();
  const [isMobile, setIsMobile] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function handleModalSignIn(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.login(email.trim(), password);
      setUser(res.user);
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed. Please check your credentials.');
    } finally {
      setSubmitting(false);
    }
  }

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
            className="w-full max-w-sm max-h-[92dvh] overflow-y-auto rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xl"
          >
            {/* Brand Header */}
            <div className="bg-gradient-to-br from-emerald-700 via-teal-700 to-emerald-900 text-white px-5 py-4">
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

            <div className="p-5 space-y-4">
              {/* Registered Member Sign In Form */}
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                    Registered Member?
                  </span>
                  <Link
                    href="/login"
                    className="text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline"
                  >
                    Forgot Password?
                  </Link>
                </div>

                <AnimatePresence>
                  {error && (
                    <motion.div
                      role="alert"
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      className="p-3 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 text-xs text-rose-700 dark:text-rose-300 leading-relaxed"
                    >
                      {error}
                    </motion.div>
                  )}
                </AnimatePresence>

                <form onSubmit={handleModalSignIn} className="space-y-3">
                  <div>
                    <label
                      htmlFor="mobile-modal-email"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Email Address
                    </label>
                    <input
                      id="mobile-modal-email"
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@amanahcoop.org"
                      className="w-full min-h-[44px] px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600 transition-colors"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="mobile-modal-password"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Password
                    </label>
                    <div className="relative">
                      <input
                        id="mobile-modal-password"
                        type={showPassword ? 'text' : 'password'}
                        required
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter your password"
                        className="w-full min-h-[44px] pl-3.5 pr-11 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600 transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        className="absolute right-1 top-1/2 -translate-y-1/2 min-w-[40px] min-h-[40px] rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center justify-center cursor-pointer"
                      >
                        {showPassword ? (
                          <EyeOff className="w-4 h-4" aria-hidden="true" />
                        ) : (
                          <Eye className="w-4 h-4" aria-hidden="true" />
                        )}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full min-h-[48px] px-4 py-3 rounded-2xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-60 text-white text-sm font-semibold shadow-sm flex items-center justify-center gap-2 active:scale-[0.99] transition-all cursor-pointer"
                  >
                    <Lock className="w-4 h-4" aria-hidden="true" />
                    <span>{submitting ? 'Signing In…' : 'Sign In'}</span>
                  </button>
                </form>
              </div>

              <div className="h-px bg-slate-200/80 dark:bg-slate-800" aria-hidden="true" />

              {/* New to Amanah Section */}
              <div className="space-y-2.5">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                  New to Amanah?
                </div>

                <div className="space-y-2">
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
