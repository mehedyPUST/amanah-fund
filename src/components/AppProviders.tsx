'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import { ShieldCheck, X } from 'lucide-react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { SkeletonTheme } from 'react-loading-skeleton';
import { getQueryClient } from '../lib/queryClient.ts';
import { queryKeys } from '../lib/queryKeys.ts';
import {
  defaultLocale,
  LOCALE_COOKIE_NAME,
  LOCALE_STORAGE_KEY,
  normalizeLocale,
  type AppLocale,
} from '../i18n/config.ts';
import { getMessagesForLocale } from '../i18n/messages.ts';
import type { PublicUser } from '../types/coop.ts';
import {
  api,
  AUTH_BROADCAST_CHANNEL,
  clearClientSessionToken,
  getClientSessionToken,
  LOGOUT_MARKER_STORAGE_KEY,
  registerTotpChallengeHandler,
  SESSION_TOKEN_STORAGE_KEY,
  syncClientSessionTokenFromStorage,
} from '../utils/api.ts';
import { setMobileBrowseMode } from '../utils/mobileSession.ts';
import {
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
import { resetRealtimeClient } from '../utils/realtimeClient.ts';
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
  hasVisitedBefore: boolean;
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
  initialUser = null,
  initialVisited = false,
}: {
  children: ReactNode;
  initialLocale?: AppLocale;
  initialUser?: PublicUser | null;
  initialVisited?: boolean;
}) {
  const queryClient = getQueryClient();
  const [user, setUserState] = useState<PublicUser | null>(initialUser);
  const userRef = useRef<PublicUser | null>(initialUser);
  userRef.current = user;
  const [authChecking, setAuthChecking] = useState<boolean>(() => !initialUser);
  const [hasVisitedBefore, setHasVisitedBefore] = useState<boolean>(initialVisited);
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
  const manualUpdateRequestedRef = useRef(false);
  const lastAuthCheckRef = useRef<number>(initialUser ? Date.now() : 0);
  const sessionVersionRef = useRef(0);
  const loggedOutClientSideRef = useRef(false);

  const clearCachedHtmlPages = useCallback(async () => {
    if (typeof window === 'undefined') return;
    try {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.controller?.postMessage({ type: 'CLEAR_HTML_CACHES' });
        swRegRef.current?.active?.postMessage({ type: 'CLEAR_HTML_CACHES' });
      }
    } catch {
      // ignore SW messaging errors
    }
    try {
      if (!('caches' in window)) return;
      const cacheNames = await window.caches.keys();
      await Promise.all(
        cacheNames.map(async (cacheName) => {
          const cache = await window.caches.open(cacheName);
          const requests = await cache.keys();
          await Promise.all(
            requests.map(async (req) => {
              try {
                const url = new URL(req.url);
                const isHtmlRoute =
                  url.pathname === '/' ||
                  url.pathname.startsWith('/dashboard') ||
                  url.pathname.startsWith('/community') ||
                  url.pathname.startsWith('/login') ||
                  url.pathname.startsWith('/signup');
                if (isHtmlRoute) {
                  await cache.delete(req);
                  return;
                }
                const match = await cache.match(req);
                const ct = (match?.headers.get('content-type') || '').toLowerCase();
                if (ct.includes('text/html')) {
                  await cache.delete(req);
                }
              } catch {
                // ignore individual cache entry errors
              }
            })
          );
        })
      );
    } catch {
      // ignore Cache Storage errors
    }
  }, []);

  const clearPrivateQueryCaches = useCallback(() => {
    void queryClient.cancelQueries();
    queryClient.setQueryData(queryKeys.auth.me(), null);
    queryClient.removeQueries({ queryKey: queryKeys.auth.all });
    queryClient.removeQueries({ queryKey: queryKeys.dashboard.all });
    queryClient.removeQueries({ queryKey: queryKeys.members.all });
    queryClient.removeQueries({ queryKey: queryKeys.community.all });
    queryClient.removeQueries({ queryKey: queryKeys.public.notices() });
    queryClient.removeQueries({ queryKey: queryKeys.admin.all });
  }, [queryClient]);

  const broadcastAuthEvent = useCallback((type: 'logout' | 'login') => {
    if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return;
    try {
      const channel = new BroadcastChannel(AUTH_BROADCAST_CHANNEL);
      channel.postMessage({ type, at: Date.now() });
      channel.close();
    } catch {
      // BroadcastChannel may be unavailable in restricted contexts
    }
  }, []);

  const setUser = useCallback(
    (nextUser: PublicUser | null) => {
      sessionVersionRef.current += 1;
      setUserState(nextUser);
      setAuthChecking(false);
      if (nextUser) {
        loggedOutClientSideRef.current = false;
        queryClient.setQueryData(queryKeys.auth.me(), { user: nextUser });
        syncLocalAccountsWithServerUser(nextUser);
        setMobileBackgroundHiddenAt(null);
        setMobileAutoLogoutNotice(null);
        broadcastAuthEvent('login');
      } else {
        loggedOutClientSideRef.current = true;
        resetRealtimeClient();
        clearPrivateQueryCaches();
      }
    },
    [queryClient, clearPrivateQueryCaches, broadcastAuthEvent]
  );

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
    try {
      window.localStorage.setItem('amanah_visited', '1');
    } catch {
      // ignore storage errors
    }
    document.cookie = 'amanah_visited=1; path=/; max-age=31536000; SameSite=Lax';
    setHasVisitedBefore(true);
  }, []);

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
    if (normalized === localeRef.current) return;
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
    const requestSeq = ++sessionVersionRef.current;
    lastAuthCheckRef.current = Date.now();
    try {
      const res = await queryClient.fetchQuery({
        queryKey: queryKeys.auth.me(),
        queryFn: () => api.getMe(),
        staleTime: 0,
      });
      if (requestSeq !== sessionVersionRef.current) {
        return userRef.current;
      }
      loggedOutClientSideRef.current = false;
      setUserState(res.user);
      syncLocalAccountsWithServerUser(res.user);
      setMobileBackgroundHiddenAt(null);
      return res.user;
    } catch (err) {
      if (requestSeq !== sessionVersionRef.current) {
        return userRef.current;
      }
      const status = (err as { status?: number } | null)?.status;
      if (status === 401 || !userRef.current) {
        setUserState(null);
        clearPrivateQueryCaches();
      }
      return status === 401 ? null : userRef.current;
    } finally {
      if (requestSeq === sessionVersionRef.current) {
        setAuthChecking(false);
      }
    }
  }, [queryClient, clearPrivateQueryCaches]);

  useEffect(() => {
    if (loggedOutClientSideRef.current) return;
    if (initialUser) {
      queryClient.setQueryData(queryKeys.auth.me(), { user: initialUser });
      syncLocalAccountsWithServerUser(initialUser);
      return;
    }
    void refreshUser();
  }, [initialUser, queryClient, refreshUser]);

  const clearLocalSessionState = useCallback(() => {
    loggedOutClientSideRef.current = true;
    sessionVersionRef.current += 1;
    resetRealtimeClient();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('amanah:logout'));
    }
    setMobileBackgroundHiddenAt(null);
    setMobileAutoLogoutNotice(null);
    setMobileBrowseMode(false);
    setUserState(null);
    setAuthChecking(false);
    clearPrivateQueryCaches();
  }, [clearPrivateQueryCaches]);

  const logout = useCallback(async () => {
    const tokenSnapshot = getClientSessionToken();
    clearLocalSessionState();
    try {
      await queryClient.cancelQueries();
    } catch {
      // ignore cancellation errors
    }

    try {
      await api.logout(tokenSnapshot);
    } catch {
      // Even if offline, proceed with local teardown below
    } finally {
      clearClientSessionToken();
      broadcastAuthEvent('logout');

      // Best-effort cleanup of Firebase/Google Workspace auth and cached HTML pages
      // with a tight timeout so sign-out stays responsive even on poor networks.
      await Promise.race([
        Promise.allSettled([
          disconnectGoogleWorkspace()
            .then((info) => setWorkspace(info))
            .catch(() => undefined),
          clearCachedHtmlPages(),
        ]),
        new Promise<void>((resolve) => {
          window.setTimeout(resolve, 1200);
        }),
      ]);

      clearPrivateQueryCaches();
    }
  }, [
    clearLocalSessionState,
    queryClient,
    broadcastAuthEvent,
    clearCachedHtmlPages,
    clearPrivateQueryCaches,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Clear any legacy background-logout timestamps so sessions remain active across tab/app switches.
    setMobileBackgroundHiddenAt(null);
    setMobileAutoLogoutNotice(null);

    const handleRemoteSignOut = () => {
      syncClientSessionTokenFromStorage(null);
      clearLocalSessionState();
      void clearCachedHtmlPages();
      if (window.location.pathname.startsWith('/dashboard')) {
        window.location.replace('/');
      }
    };

    const handleUnauthorized = () => {
      clearClientSessionToken();
      clearLocalSessionState();
      void clearCachedHtmlPages();
    };

    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      // If another tab signed out while this tab was hidden/frozen, tear down immediately
      try {
        if (
          userRef.current &&
          window.localStorage.getItem(LOGOUT_MARKER_STORAGE_KEY) &&
          !window.localStorage.getItem(SESSION_TOKEN_STORAGE_KEY)
        ) {
          handleRemoteSignOut();
          return;
        }
      } catch {
        // ignore storage errors
      }
      if (userRef.current && Date.now() - lastAuthCheckRef.current >= 5 * 60 * 1000) {
        void refreshUser();
      }
    };

    const handlePageShow = (event: PageTransitionEvent) => {
      // Browser Back/Forward cache (bfcache) restore: always verify live session state
      if (event.persisted) {
        try {
          if (
            window.localStorage.getItem(LOGOUT_MARKER_STORAGE_KEY) &&
            !window.localStorage.getItem(SESSION_TOKEN_STORAGE_KEY)
          ) {
            handleRemoteSignOut();
            return;
          }
        } catch {
          // ignore storage errors
        }
        void refreshUser();
      }
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === LOGOUT_MARKER_STORAGE_KEY && event.newValue) {
        handleRemoteSignOut();
        return;
      }
      if (event.key !== SESSION_TOKEN_STORAGE_KEY) return;
      const nextToken = event.newValue && event.newValue.trim() ? event.newValue.trim() : null;
      if (!nextToken) {
        if (event.oldValue) {
          handleRemoteSignOut();
        }
        return;
      }
      if (nextToken !== event.oldValue) {
        loggedOutClientSideRef.current = false;
        syncClientSessionTokenFromStorage(nextToken);
        void refreshUser();
      }
    };

    let authChannel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        authChannel = new BroadcastChannel(AUTH_BROADCAST_CHANNEL);
        authChannel.onmessage = (event: MessageEvent<{ type?: string }>) => {
          const msgType = event.data?.type;
          if (msgType === 'logout') {
            handleRemoteSignOut();
          } else if (msgType === 'login') {
            loggedOutClientSideRef.current = false;
            const latestToken = getClientSessionToken();
            syncClientSessionTokenFromStorage(latestToken);
            void refreshUser();
          }
        };
      } catch {
        authChannel = null;
      }
    }

    window.addEventListener('amanah:unauthorized', handleUnauthorized);
    window.addEventListener('storage', handleStorage);
    window.addEventListener('pageshow', handlePageShow);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('amanah:unauthorized', handleUnauthorized);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('pageshow', handlePageShow);
      document.removeEventListener('visibilitychange', handleVisibility);
      if (authChannel) {
        try {
          authChannel.close();
        } catch {
          // ignore close errors
        }
      }
    };
  }, [refreshUser, clearLocalSessionState, clearCachedHtmlPages]);

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
    manualUpdateRequestedRef.current = true;
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
      if (manualUpdateRequestedRef.current && !reloadingRef.current) {
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

  const activeMessages = useMemo(() => getMessagesForLocale(locale), [locale]);

  const getMessageFallback = useCallback(
    ({ namespace, key }: { namespace?: string; key: string }) => {
      const enMessages = getMessagesForLocale('en') as unknown as Record<string, unknown>;
      const path = namespace ? `${namespace}.${key}` : key;
      const resolved = path
        .split('.')
        .reduce<unknown>(
          (acc, part) =>
            acc && typeof acc === 'object' && part in (acc as Record<string, unknown>)
              ? (acc as Record<string, unknown>)[part]
              : undefined,
          enMessages
        );
      return typeof resolved === 'string' ? resolved : key;
    },
    []
  );

  const sessionContextValue = useMemo<CoopSessionContextValue>(
    () => ({
      user,
      authChecking,
      hasVisitedBefore,
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
    }),
    [
      user,
      authChecking,
      hasVisitedBefore,
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
      updateAvailable,
      checkingUpdate,
      applyingUpdate,
      lastCheckedAt,
      statusMessage,
      checkForUpdates,
      applyUpdate,
      dismissStatusMessage,
    ]
  );

  return (
    <NextIntlClientProvider
      locale={locale}
      messages={activeMessages}
      timeZone="Asia/Dhaka"
      getMessageFallback={getMessageFallback}
    >
      <QueryClientProvider client={queryClient}>
        <CoopSessionContext.Provider value={sessionContextValue}>
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
      </QueryClientProvider>
    </NextIntlClientProvider>
  );
}
