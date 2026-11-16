'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { ShieldCheck, X } from 'lucide-react';
import { MotionConfig } from 'motion/react';
import { SkeletonTheme } from 'react-loading-skeleton';
import type { PublicUser } from '../types/coop.ts';
import { api, registerTotpChallengeHandler } from '../utils/api.ts';
import { signOutGoogleIdentity } from '../utils/googleAuth.ts';
import {
  connectGoogleWorkspace,
  disconnectGoogleWorkspace,
  getWorkspaceSessionInfo,
  subscribeWorkspaceAuth,
  type WorkspaceSessionInfo,
} from '../utils/googleWorkspace.ts';

import {
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  getTranslations,
  isAppLanguage,
  type AppLanguage,
} from '../utils/i18n.ts';

type Translations = ReturnType<typeof getTranslations>;

interface CoopSessionContextValue {
  user: PublicUser | null;
  authChecking: boolean;
  setUser: (user: PublicUser | null) => void;
  refreshUser: () => Promise<PublicUser | null>;
  logout: () => Promise<void>;
  darkMode: boolean;
  toggleDarkMode: () => void;
  language: AppLanguage;
  setLanguage: (lang: AppLanguage) => void;
  toggleLanguage: () => void;
  t: Translations;
  workspace: WorkspaceSessionInfo;
  connectingGoogle: boolean;
  handleConnectGoogle: () => Promise<void>;
  handleDisconnectGoogle: () => Promise<void>;
}

const CoopSessionContext = createContext<CoopSessionContextValue | null>(null);

export function useCoopSession(): CoopSessionContextValue {
  const ctx = useContext(CoopSessionContext);
  if (!ctx) {
    throw new Error('useCoopSession must be used inside AppProviders');
  }
  return ctx;
}

export function AppProviders({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const [language, setLanguageState] = useState<AppLanguage>(DEFAULT_LANGUAGE);

  const [workspace, setWorkspace] = useState<WorkspaceSessionInfo>(() =>
    getWorkspaceSessionInfo()
  );
  const [connectingGoogle, setConnectingGoogle] = useState(false);

  const [totpPrompt, setTotpPrompt] = useState<{ message: string } | null>(null);
  const [totpCodeInput, setTotpCodeInput] = useState('');
  const totpResolverRef = useRef<((code: string | null) => void) | null>(null);

  useEffect(() => {
    registerTotpChallengeHandler((message: string) => {
      return new Promise<string | null>((resolve) => {
        totpResolverRef.current = resolve;
        setTotpCodeInput('');
        setTotpPrompt({ message });
      });
    });
    return () => {
      registerTotpChallengeHandler(null);
    };
  }, []);

  const submitTotpPrompt = (e: FormEvent) => {
    e.preventDefault();
    const clean = totpCodeInput.replace(/\s+/g, '').trim();
    if (!/^\d{6}$/.test(clean)) return;
    const resolve = totpResolverRef.current;
    totpResolverRef.current = null;
    setTotpPrompt(null);
    resolve?.(clean);
  };

  const cancelTotpPrompt = () => {
    const resolve = totpResolverRef.current;
    totpResolverRef.current = null;
    setTotpPrompt(null);
    resolve?.(null);
  };

  useEffect(() => {
    const saved = window.localStorage.getItem('amanah_theme');
    const prefersDark =
      saved === 'dark' ||
      (!saved && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
    setDarkMode(prefersDark);
    document.documentElement.classList.toggle('dark', prefersDark);

    const savedLang = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    const initialLang: AppLanguage = isAppLanguage(savedLang) ? savedLang : DEFAULT_LANGUAGE;
    setLanguageState(initialLang);
    document.documentElement.lang = initialLang;
  }, []);

  const setLanguage = useCallback((nextLang: AppLanguage) => {
    setLanguageState(nextLang);
    document.documentElement.lang = nextLang;
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLang);
  }, []);

  const toggleLanguage = useCallback(() => {
    setLanguageState((prev) => {
      const next: AppLanguage = prev === 'en' ? 'bn' : 'en';
      document.documentElement.lang = next;
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
      return next;
    });
  }, []);

  const t = getTranslations(language);

  const toggleDarkMode = useCallback(() => {
    setDarkMode((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle('dark', next);
      window.localStorage.setItem('amanah_theme', next ? 'dark' : 'light');
      return next;
    });
  }, []);

  useEffect(() => {
    const unsub = subscribeWorkspaceAuth((info) => {
      setWorkspace(info);
    });
    return unsub;
  }, []);

  useEffect(() => {
    const handleWheel = (event: WheelEvent) => {
      const target = event.target;
      const active = document.activeElement;
      if (
        active instanceof HTMLInputElement &&
        active.type === 'number' &&
        (target === active || (target instanceof Node && active.contains(target)))
      ) {
        active.blur();
      } else if (
        target instanceof HTMLInputElement &&
        target.type === 'number' &&
        document.activeElement === target
      ) {
        target.blur();
      }
    };

    document.addEventListener('wheel', handleWheel, { capture: true, passive: true });
    return () => {
      document.removeEventListener('wheel', handleWheel, { capture: true });
    };
  }, []);

  const refreshUser = useCallback(async (): Promise<PublicUser | null> => {
    try {
      const res = await api.getMe();
      setUser(res.user);
      return res.user;
    } catch {
      setUser(null);
      return null;
    } finally {
      setAuthChecking(false);
    }
  }, []);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      await signOutGoogleIdentity();
      setUser(null);
    }
  }, []);

  const handleConnectGoogle = useCallback(async () => {
    setConnectingGoogle(true);
    try {
      const info = await connectGoogleWorkspace();
      setWorkspace(info);
    } finally {
      setConnectingGoogle(false);
    }
  }, []);

  const handleDisconnectGoogle = useCallback(async () => {
    const info = await disconnectGoogleWorkspace();
    setWorkspace(info);
  }, []);

  return (
    <CoopSessionContext.Provider
      value={{
        user,
        authChecking,
        setUser,
        refreshUser,
        logout,
        darkMode,
        toggleDarkMode,
        language,
        setLanguage,
        toggleLanguage,
        t,
        workspace,
        connectingGoogle,
        handleConnectGoogle,
        handleDisconnectGoogle,
      }}
    >
      <MotionConfig reducedMotion="user">
        <SkeletonTheme
          baseColor={darkMode ? '#1e293b' : '#e2e8f0'}
          highlightColor={darkMode ? '#334155' : '#f8fafc'}
        >
          {children}
          {totpPrompt && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
              <div className="w-full max-w-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-lg">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                    <ShieldCheck className="w-5 h-5 shrink-0" />
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {t.totp.title}
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={cancelTotpPrompt}
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    aria-label={t.totp.cancelAria}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {totpPrompt.message}
                </p>
                <form onSubmit={submitTotpPrompt} className="mt-4 space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {t.totp.codeLabel}
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      autoFocus
                      value={totpCodeInput}
                      onChange={(e) => setTotpCodeInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="000000"
                      className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-center font-mono text-lg tracking-widest text-slate-900 dark:text-slate-100 focus:border-emerald-600 focus:outline-none"
                    />
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={cancelTotpPrompt}
                      className="rounded-md border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      {t.common.cancel}
                    </button>
                    <button
                      type="submit"
                      disabled={totpCodeInput.length !== 6}
                      className="rounded-md bg-emerald-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {t.totp.verifyContinue}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </SkeletonTheme>
      </MotionConfig>
    </CoopSessionContext.Provider>
  );
}
