'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { MotionConfig } from 'motion/react';
import { SkeletonTheme } from 'react-loading-skeleton';
import type { PublicUser } from '../types/coop.ts';
import { api } from '../utils/api.ts';
import {
  connectGoogleWorkspace,
  disconnectGoogleWorkspace,
  getWorkspaceSessionInfo,
  subscribeWorkspaceAuth,
  type WorkspaceSessionInfo,
} from '../utils/googleWorkspace.ts';

interface CoopSessionContextValue {
  user: PublicUser | null;
  authChecking: boolean;
  setUser: (user: PublicUser | null) => void;
  refreshUser: () => Promise<PublicUser | null>;
  logout: () => Promise<void>;
  darkMode: boolean;
  toggleDarkMode: () => void;
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

  const [workspace, setWorkspace] = useState<WorkspaceSessionInfo>(() =>
    getWorkspaceSessionInfo()
  );
  const [connectingGoogle, setConnectingGoogle] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem('amanah_theme');
    if (saved === 'dark') {
      setDarkMode(true);
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
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
        </SkeletonTheme>
      </MotionConfig>
    </CoopSessionContext.Provider>
  );
}
