'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Globe, Loader2, Lock, ShieldCheck } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Skeleton from 'react-loading-skeleton';
import { api } from '../utils/api.ts';
import {
  GOOGLE_ONBOARDING_STORAGE_KEY,
  signInWithGoogleIdentity,
} from '../utils/googleAuth.ts';
import { useCoopSession } from './AppProviders.tsx';

export function SignInForm() {
  const router = useRouter();
  const { user, authChecking, setUser } = useCoopSession();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authChecking && user) {
      router.replace('/dashboard');
    }
  }, [authChecking, user, router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.login(email, password);
      setUser(res.user);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    setError(null);
    setGoogleLoading(true);
    try {
      const { idToken } = await signInWithGoogleIdentity();
      const res = await api.googleAuth(idToken);

      if (res.status === 'authenticated') {
        setUser(res.user);
        router.push('/dashboard');
        return;
      }

      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(
          GOOGLE_ONBOARDING_STORAGE_KEY,
          JSON.stringify({
            registrationToken: res.registrationToken,
            googleProfile: res.googleProfile,
          })
        );
      }
      router.push('/signup?mode=google');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google Sign-In failed.');
    } finally {
      setGoogleLoading(false);
    }
  }

  const isBusy = loading || googleLoading;

  if (authChecking) {
    return (
      <div className="bg-slate-50 dark:bg-slate-950 px-4 sm:px-6 lg:px-8 py-12 sm:py-20">
        <div className="max-w-md w-full mx-auto bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-sm space-y-6">
          <div className="space-y-2">
            <Skeleton width={210} height={14} />
            <Skeleton width="70%" height={28} />
            <Skeleton width="100%" height={14} count={2} />
          </div>
          <Skeleton height={42} borderRadius={8} />
          <div className="space-y-4">
            <Skeleton height={42} borderRadius={8} />
            <Skeleton height={42} borderRadius={8} />
            <Skeleton height={42} borderRadius={8} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 px-4 sm:px-6 lg:px-8 py-12 sm:py-20">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
        className="max-w-md w-full mx-auto bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-sm hover:shadow-md transition-shadow duration-200 space-y-6"
      >
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-indigo-700 dark:text-indigo-400">
            <ShieldCheck className="w-4 h-4" aria-hidden="true" />
            <span>Encrypted Member Portal · HttpOnly JWT</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Sign In to Treasury
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            Only administrator-approved members can sign in and access cooperative funds or 2/3 voting.
          </p>
        </div>

        <AnimatePresence>
          {error && (
            <motion.div
              role="alert"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="p-3.5 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 text-xs text-rose-700 dark:text-rose-300 leading-relaxed"
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="space-y-4">
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isBusy}
            className="w-full py-2.5 px-4 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 hover:bg-teal-50/60 dark:hover:bg-teal-950/30 hover:border-teal-300 dark:hover:border-teal-800 disabled:opacity-60 text-slate-800 dark:text-slate-100 text-sm font-medium shadow-2xs transition-all duration-200 active:scale-[0.99] flex items-center justify-center gap-2.5 cursor-pointer"
          >
            {googleLoading ? (
              <Loader2 className="w-4 h-4 animate-spin text-teal-600" aria-hidden="true" />
            ) : (
              <Globe className="w-4 h-4 text-teal-600 dark:text-teal-400" aria-hidden="true" />
            )}
            <span>{googleLoading ? 'Verifying with Google…' : 'Continue with Google'}</span>
          </button>

          <div className="relative flex items-center py-1">
            <div className="grow border-t border-slate-200 dark:border-slate-800" />
            <span className="shrink-0 mx-3 text-[11px] font-medium text-slate-400 dark:text-slate-500">
              or sign in with email
            </span>
            <div className="grow border-t border-slate-200 dark:border-slate-800" />
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="signin-email"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Email Address
            </label>
            <input
              id="signin-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@amanahcoop.org"
              className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600 transition-colors"
            />
          </div>

          <div>
            <label
              htmlFor="signin-password"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Password
            </label>
            <input
              id="signin-password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600 transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={isBusy}
            className="w-full py-2.5 px-4 rounded-lg bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:via-teal-700 hover:to-emerald-800 disabled:opacity-60 text-white text-sm font-medium shadow-xs hover:shadow-md transition-all duration-200 active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer"
          >
            <Lock className="w-4 h-4" aria-hidden="true" />
            <span>{loading ? 'Signing In…' : 'Sign In to Portal'}</span>
          </button>
        </form>

        <div className="pt-5 border-t border-slate-100 dark:border-slate-800 space-y-3 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center justify-between gap-2">
            <span>Applying as a new member?</span>
            <Link
              href="/signup"
              className="font-medium text-emerald-700 dark:text-emerald-400 hover:underline inline-flex items-center gap-1"
            >
              <span>Create Application</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </Link>
          </div>
          <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
            First registration on an empty cooperative becomes the administrator. Later members require admin approval.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
