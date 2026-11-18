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
import { usePathname, useRouter } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { ShieldCheck, X } from 'lucide-react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { SkeletonTheme } from 'react-loading-skeleton';
import {
  defaultLocale,
  LOCALE_COOKIE_NAME,
  LOCALE_STORAGE_KEY,
  normalizeLocale,
  type AppLocale,
} from '../i18n/config.ts';
import { getMessagesForLocale } from '../i18n/messages.ts';
import type { PublicUser } from '../types/coop.ts';
import { api, registerTotpChallengeHandler } from '../utils/api.ts';
import { isMobileViewport, setMobileBrowseMode } from '../utils/mobileSession.ts';
import {
  getMobileBackgroundHiddenAt,
  MOBILE_MINIMIZE_LOGOUT_MS,
  setMobileAutoLogoutNotice,
  setMobileBackgroundHiddenAt,
  syncLocalAccountsWithServerUser,
} from '../utils/mobileDeviceAuth.ts';
import {
  connectGoogleWorkspace,
  disconnectGoogleWorkspace,
  getWorkspaceSessionInfo,
  subscribeWorkspaceAuth,
  type WorkspaceSessionInfo,
} from '../utils/googleWorkspace.ts';
import { OfflineIndicator } from './OfflineIndicator.tsx';


const PWA_LAST_CHECK_KEY = 'amanah_pwa_last_update_check';
const PWA_DAILY_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

export interface PwaUpdateContextState {
  updateAvailable: boolean;
  checkingUpdate: boolean;
  applyingUpdate: boolean;
  lastCheckedAt: number | null;
  statusMessage: string | null;
  checkForUpdates: (manual?: boolean) => Promise<'update-available' | 'up-to-date' | 'unsupported'>;
  applyUpdate: () => Promise<void>;
  dismissStatusMessage: () => void;
}

interface CoopSessionContextValue {
  user: PublicUser | null;
  authChecking: boolean;
  setUser: (user: PublicUser | null) => void;
  refreshUser: () => Promise<PublicUser | null>;
  logout: () => Promise<void>;
  darkMode: boolean;
  toggleDarkMode: () => void;
  locale: AppLocale;
  setLocale: (next: AppLocale) => void;
  workspace: WorkspaceSessionInfo;
  connectingGoogle: boolean;
  handleConnectGoogle: () => Promise<void>;
  handleDisconnectGoogle: () => Promise<void>;
  pwaUpdate: PwaUpdateContextState;
}

const CoopSessionContext = createContext<CoopSessionContextValue | null>(null);

export function useCoopSession(): CoopSessionContextValue {
  const ctx = useContext(CoopSessionContext);
  if (!ctx) {
    throw new Error('useCoopSession must be used inside AppProviders');
  }
  return ctx;
}

export function AppProviders({
  children,
  initialLocale = defaultLocale,
}: {
  children: ReactNode;
  initialLocale?: AppLocale;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  const [user, setUserState] = useState<PublicUser | null>(null);
  const userRef = useRef<PublicUser | null>(null);
  userRef.current = user;
  const [authChecking, setAuthChecking] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const [locale, setLocaleState] = useState<AppLocale>(() => normalizeLocale(initialLocale));
  const localeRef = useRef<AppLocale>(locale);
  localeRef.current = locale;

  const [workspace, setWorkspace] = useState<WorkspaceSessionInfo>(() =>
    getWorkspaceSessionInfo()
  );
  const [connectingGoogle, setConnectingGoogle] = useState(false);

  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [applyingUpdate, setApplyingUpdate] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const swRegRef = useRef<ServiceWorkerRegistration | null>(null);
  const reloadingRef = useRef(false);
  const lastAuthCheckRef = useRef<number>(0);
  const minimizeLogoutInFlightRef = useRef(false);

  const setUser = useCallback((nextUser: PublicUser | null) => {
    setUserState(nextUser);
    if (nextUser) {
      syncLocalAccountsWithServerUser(nextUser);
      setMobileBackgroundHiddenAt(null);
      setMobileAutoLogoutNotice(null);
    }
  }, []);

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
  }, []);

  useEffect(() => {
    const savedLocale = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (savedLocale === 'en' || savedLocale === 'bn') {
      setLocaleState(savedLocale);
      document.documentElement.lang = savedLocale;
      document.cookie = `${LOCALE_COOKIE_NAME}=${savedLocale}; path=/; max-age=31536000; SameSite=Lax`;
    } else {
      document.documentElement.lang = localeRef.current;
    }
  }, []);

  const setLocale = useCallback((next: AppLocale) => {
    const normalized = normalizeLocale(next);
    setLocaleState(normalized);
    localeRef.current = normalized;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, normalized);
      document.documentElement.lang = normalized;
      document.cookie = `${LOCALE_COOKIE_NAME}=${normalized}; path=/; max-age=31536000; SameSite=Lax`;
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.__amanahInstallPrompt = window.__amanahInstallPrompt ?? null;
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      window.__amanahInstallPrompt = e as unknown as typeof window.__amanahInstallPrompt;
      window.dispatchEvent(new CustomEvent('amanah:pwa-prompt-updated'));
    };
    const handleAppInstalled = () => {
      window.__amanahInstallPrompt = null;
      window.__amanahAppInstalled = true;
      window.dispatchEvent(new CustomEvent('amanah:pwa-prompt-updated'));
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

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
    lastAuthCheckRef.current = Date.now();
    try {
      const res = await api.getMe();
      setUserState(res.user);
      syncLocalAccountsWithServerUser(res.user);
      return res.user;
    } catch {
      setUserState(null);
      return null;
    } finally {
      setAuthChecking(false);
    }
  }, []);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  const logout = useCallback(async () => {
    setMobileBackgroundHiddenAt(null);
    try {
      await api.logout();
    } finally {
      setMobileBrowseMode(false);
      setUserState(null);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let bgTimerId: number | null = null;

    const clearBgTimer = () => {
      if (bgTimerId !== null) {
        window.clearTimeout(bgTimerId);
        bgTimerId = null;
      }
    };

    const performMinimizeLogout = async () => {
      if (minimizeLogoutInFlightRef.current || !userRef.current) return;
      minimizeLogoutInFlightRef.current = true;
      clearBgTimer();
      setMobileBackgroundHiddenAt(null);
      setMobileAutoLogoutNotice('__AUTO_LOGOUT_1M__');
      try {
        await api.logout();
      } catch {
        // proceed with local logout even if offline
      } finally {
        setMobileBrowseMode(false);
        setUserState(null);
        setAuthChecking(false);
        minimizeLogoutInFlightRef.current = false;
        if (pathnameRef.current?.startsWith('/dashboard')) {
          router.replace('/');
        }
      }
    };

    const evaluateBackgroundElapsed = (): boolean => {
      if (!userRef.current || !isMobileViewport()) {
        setMobileBackgroundHiddenAt(null);
        return false;
      }
      const hiddenAt = getMobileBackgroundHiddenAt();
      if (!hiddenAt) return false;
      if (Date.now() - hiddenAt >= MOBILE_MINIMIZE_LOGOUT_MS) {
        void performMinimizeLogout();
        return true;
      }
      setMobileBackgroundHiddenAt(null);
      return false;
    };

    // Check immediately in case mobile app was killed/reopened after >= 1 min hidden
    if (user && isMobileViewport() && document.visibilityState === 'visible') {
      evaluateBackgroundElapsed();
    }

    const markHiddenAndStartTimer = () => {
      if (!userRef.current || !isMobileViewport()) return;
      const existing = getMobileBackgroundHiddenAt();
      const hiddenAt = existing ?? Date.now();
      if (!existing) {
        setMobileBackgroundHiddenAt(hiddenAt);
      }
      clearBgTimer();
      const remainingMs = Math.max(0, MOBILE_MINIMIZE_LOGOUT_MS - (Date.now() - hiddenAt));
      bgTimerId = window.setTimeout(() => {
        if (!userRef.current || !isMobileViewport()) return;
        const storedAt = getMobileBackgroundHiddenAt();
        if (storedAt && Date.now() - storedAt >= MOBILE_MINIMIZE_LOGOUT_MS - 250) {
          void performMinimizeLogout();
        }
      }, remainingMs + 50);
    };

    const handleUnauthorized = () => {
      clearBgTimer();
      setMobileBackgroundHiddenAt(null);
      setMobileBrowseMode(false);
      setUserState(null);
      setAuthChecking(false);
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        markHiddenAndStartTimer();
        return;
      }
      if (document.visibilityState === 'visible') {
        clearBgTimer();
        const loggedOut = evaluateBackgroundElapsed();
        if (!loggedOut && Date.now() - lastAuthCheckRef.current >= 45_000) {
          void refreshUser();
        }
      }
    };

    const handlePageHide = () => {
      markHiddenAndStartTimer();
    };

    const handlePageShowOrFocus = () => {
      if (document.visibilityState === 'visible') {
        clearBgTimer();
        evaluateBackgroundElapsed();
      }
    };

    window.addEventListener('amanah:unauthorized', handleUnauthorized);
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('pageshow', handlePageShowOrFocus);
    window.addEventListener('focus', handlePageShowOrFocus);

    return () => {
      clearBgTimer();
      window.removeEventListener('amanah:unauthorized', handleUnauthorized);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('pageshow', handlePageShowOrFocus);
      window.removeEventListener('focus', handlePageShowOrFocus);
    };
  }, [user, refreshUser, router]);

  const attachRegistrationListeners = useCallback((reg: ServiceWorkerRegistration) => {
    swRegRef.current = reg;
    if (reg.waiting) {
      setUpdateAvailable(true);
      setStatusMessage(getMessagesForLocale(localeRef.current).PWA.updateReadyMessage);
    }

    const handleInstallingWorker = (worker: ServiceWorker | null) => {
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          setUpdateAvailable(true);
          setStatusMessage(getMessagesForLocale(localeRef.current).PWA.updateReadyMessage);
        }
      });
    };

    if (reg.installing) {
      handleInstallingWorker(reg.installing);
    }

    reg.addEventListener('updatefound', () => {
      handleInstallingWorker(reg.installing);
    });
  }, []);

  const checkForUpdates = useCallback(
    async (manual = true): Promise<'update-available' | 'up-to-date' | 'unsupported'> => {
      const pwaCopy = getMessagesForLocale(localeRef.current).PWA;
      if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
        if (manual) {
          setStatusMessage(pwaCopy.swUnsupported);
        }
        return 'unsupported';
      }

      setCheckingUpdate(true);
      if (manual) {
        setStatusMessage(pwaCopy.checkingUpdates);
      }

      try {
        const reg =
          swRegRef.current ||
          (await navigator.serviceWorker.getRegistration('/')) ||
          (await navigator.serviceWorker.register('/sw.js', {
            scope: '/',
            updateViaCache: 'none',
          }));

        attachRegistrationListeners(reg);

        const now = Date.now();
        window.localStorage.setItem(PWA_LAST_CHECK_KEY, String(now));
        setLastCheckedAt(now);

        await reg.update();

        // Give an incoming installing worker a short window to reach waiting state
        if (reg.installing) {
          await new Promise<void>((resolve) => {
            const worker = reg.installing;
            if (!worker) {
              resolve();
              return;
            }
            const timer = window.setTimeout(resolve, 1400);
            worker.addEventListener('statechange', () => {
              if (worker.state === 'installed' || worker.state === 'redundant') {
                window.clearTimeout(timer);
                resolve();
              }
            });
          });
        }

        if (reg.waiting) {
          setUpdateAvailable(true);
          setStatusMessage(pwaCopy.updateReadyDesc);
          return 'update-available';
        }

        setUpdateAvailable(false);
        if (manual) {
          setStatusMessage(pwaCopy.upToDate);
        }
        return 'up-to-date';
      } catch {
        const now = Date.now();
        window.localStorage.setItem(PWA_LAST_CHECK_KEY, String(now));
        setLastCheckedAt(now);
        if (manual) {
          setStatusMessage(pwaCopy.checkFailed);
        }
        return 'up-to-date';
      } finally {
        setCheckingUpdate(false);
      }
    },
    [attachRegistrationListeners]
  );

  const applyUpdate = useCallback(async () => {
    if (typeof window === 'undefined') return;
    setApplyingUpdate(true);
    try {
      if ('serviceWorker' in navigator) {
        const reg = swRegRef.current || (await navigator.serviceWorker.getRegistration('/'));
        if (reg?.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          window.setTimeout(() => {
            if (!reloadingRef.current) {
              reloadingRef.current = true;
              window.location.reload();
            }
          }, 1200);
          return;
        }
        if (reg?.active) {
          reg.active.postMessage({ type: 'CLEAR_CACHES' });
        }
      }
      if ('caches' in window) {
        const keys = await window.caches.keys();
        await Promise.all(keys.map((k) => window.caches.delete(k)));
      }
      window.location.reload();
    } catch {
      window.location.reload();
    }
  }, []);

  const dismissStatusMessage = useCallback(() => {
    setStatusMessage(null);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    const rawLast = window.localStorage.getItem(PWA_LAST_CHECK_KEY);
    const parsedLast = rawLast ? Number(rawLast) : null;
    if (parsedLast && Number.isFinite(parsedLast)) {
      setLastCheckedAt(parsedLast);
    }

    const handleControllerChange = () => {
      if (!reloadingRef.current) {
        reloadingRef.current = true;
        window.location.reload();
      }
    };
    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

    const isDevPreviewHost =
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname.startsWith('ais-dev-');

    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((reg) => {
        attachRegistrationListeners(reg);
        if (isDevPreviewHost) {
          void reg.update().catch(() => undefined);
          return;
        }
        const now = Date.now();
        const isDailyDue =
          !parsedLast ||
          !Number.isFinite(parsedLast) ||
          now - parsedLast >= PWA_DAILY_CHECK_INTERVAL_MS;
        if (isDailyDue) {
          void checkForUpdates(false);
        }
      })
      .catch(() => {
        // Optional SW registration when browser restricts scope
      });

    // Periodic hourly check in case standalone PWA stays open across 24h boundary
    const intervalId = window.setInterval(() => {
      const stored = window.localStorage.getItem(PWA_LAST_CHECK_KEY);
      const last = stored ? Number(stored) : 0;
      if (!last || Date.now() - last >= PWA_DAILY_CHECK_INTERVAL_MS) {
        void checkForUpdates(false);
      }
    }, 60 * 60 * 1000);

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
      window.clearInterval(intervalId);
    };
  }, [attachRegistrationListeners, checkForUpdates]);

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

  const activeMessages = getMessagesForLocale(locale);

  return (
    <NextIntlClientProvider
      locale={locale}
      messages={activeMessages}
      timeZone="Asia/Dhaka"
      getMessageFallback={({ namespace, key }) => {
        const enMessages = getMessagesForLocale('en') as unknown as Record<string, unknown>;
        const path = namespace ? `${namespace}.${key}` : key;
        const resolved = path
          .split('.')
          .reduce<unknown>(
            (acc, part) => (acc && typeof acc === 'object' && part in (acc as Record<string, unknown>) ? (acc as Record<string, unknown>)[part] : undefined),
            enMessages
          );
        return typeof resolved === 'string' ? resolved : key;
      }}
    >
      <CoopSessionContext.Provider
        value={{
          user,
          authChecking,
          setUser,
          refreshUser,
          logout,
          darkMode,
          toggleDarkMode,
          locale,
          setLocale,
          workspace,
          connectingGoogle,
          handleConnectGoogle,
          handleDisconnectGoogle,
          pwaUpdate: {
            updateAvailable,
            checkingUpdate,
            applyingUpdate,
            lastCheckedAt,
            statusMessage,
            checkForUpdates,
            applyUpdate,
            dismissStatusMessage,
          },
        }}
      >
        <MotionConfig reducedMotion="user" transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}>
          <SkeletonTheme
            baseColor={darkMode ? '#1e293b' : '#e2e8f0'}
            highlightColor={darkMode ? '#334155' : '#f8fafc'}
            borderRadius={8}
          >
            {children}
            <OfflineIndicator />
            <AnimatePresence>
              {totpPrompt && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.16 }}
                  className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4"
                >
                  <motion.div
                    initial={{ opacity: 0, scale: 0.96, y: 8 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96, y: 8 }}
                    transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                    className="w-full max-w-sm rounded-xl border border-indigo-200/80 dark:border-indigo-900/60 bg-white/88 dark:bg-slate-900/88 backdrop-blur-md p-5 shadow-xl"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-400">
                        <ShieldCheck className="w-5 h-5 shrink-0" />
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {activeMessages.Auth.totp.title}
                        </h3>
                      </div>
                      <button
                        type="button"
                        onClick={cancelTotpPrompt}
                        className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                        aria-label={activeMessages.Auth.totp.cancelAria}
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
                          {activeMessages.Auth.totp.label}
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={6}
                          autoFocus
                          value={totpCodeInput}
                          onChange={(e) => setTotpCodeInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          placeholder="000000"
                          className="w-full rounded-lg border border-indigo-200 dark:border-indigo-800/80 bg-indigo-50/30 dark:bg-slate-800 px-3 py-2 text-center font-mono text-lg tracking-widest tabular-nums text-slate-900 dark:text-slate-100 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none"
                        />
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={cancelTotpPrompt}
                          className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
                        >
                          {activeMessages.Common.cancel}
                        </button>
                        <button
                          type="submit"
                          disabled={totpCodeInput.length !== 6}
                          className="rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 px-3.5 py-1.5 text-xs font-medium text-white disabled:opacity-50 cursor-pointer whitespace-nowrap shadow-2xs"
                        >
                          {activeMessages.Auth.totp.verifyContinue}
                        </button>
                      </div>
                    </form>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </SkeletonTheme>
        </MotionConfig>
      </CoopSessionContext.Provider>
    </NextIntlClientProvider>
  );
}
