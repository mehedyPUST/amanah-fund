import { getApps, initializeApp } from 'firebase/app';
import {
  type Auth,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/gmail.send',
];

// Strictly in-memory OAuth token storage — never persist Google access tokens in localStorage/sessionStorage.
let cachedAccessToken: string | null = null;
let cachedFirebaseUser: User | null = null;
let authInstance: Auth | null = null;
let isSigningIn = false;
const listeners = new Set<(info: WorkspaceSessionInfo) => void>();

function ensureFirebaseAuth(): Auth {
  if (authInstance) return authInstance;
  const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
  authInstance = getAuth(app);
  return authInstance;
}

export interface WorkspaceSessionInfo {
  connected: boolean;
  email: string | null;
  displayName: string | null;
  hasToken: boolean;
}

export function getWorkspaceSessionInfo(): WorkspaceSessionInfo {
  return {
    connected: Boolean(cachedFirebaseUser && cachedAccessToken),
    email: cachedFirebaseUser?.email || null,
    displayName: cachedFirebaseUser?.displayName || null,
    hasToken: Boolean(cachedAccessToken),
  };
}

function notifyListeners() {
  const snapshot = getWorkspaceSessionInfo();
  listeners.forEach((cb) => {
    try {
      cb(snapshot);
    } catch {
      // ignore subscriber callback error
    }
  });
}

export function getWorkspaceToken(): string | null {
  return cachedAccessToken;
}

export function clearWorkspaceToken(): void {
  cachedAccessToken = null;
  notifyListeners();
}

export function subscribeWorkspaceAuth(
  onUpdate: (info: WorkspaceSessionInfo) => void
): () => void {
  const auth = ensureFirebaseAuth();
  listeners.add(onUpdate);
  const unsubAuth = onAuthStateChanged(auth, (fbUser) => {
    // Guard against auth state race while interactive popup flow is in progress
    if (isSigningIn) return;
    cachedFirebaseUser = fbUser;
    if (!fbUser) {
      cachedAccessToken = null;
    }
    notifyListeners();
  });

  return () => {
    listeners.delete(onUpdate);
    unsubAuth();
  };
}

function formatGoogleAuthError(err: unknown): Error {
  const code = (err as { code?: string } | null)?.code || '';
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return new Error('Google sign-in popup was closed before completing authorization.');
  }
  if (code === 'auth/popup-blocked') {
    return new Error(
      'Your browser blocked the Google sign-in popup. Please allow popups for this site and try again.'
    );
  }
  if (code === 'auth/unauthorized-domain') {
    return new Error(
      'This domain is not yet authorized for Google sign-in in the connected Firebase project.'
    );
  }
  if (code === 'auth/network-request-failed') {
    return new Error('Network error while connecting to Google. Please check your connection and try again.');
  }
  if (err instanceof Error && err.message) {
    return err;
  }
  return new Error('Failed to sign in with Google. Please try again.');
}

export async function connectGoogleWorkspace(): Promise<WorkspaceSessionInfo> {
  const auth = ensureFirebaseAuth();
  const provider = new GoogleAuthProvider();
  WORKSPACE_SCOPES.forEach((scope) => provider.addScope(scope));
  provider.setCustomParameters({ prompt: 'consent select_account' });

  isSigningIn = true;
  try {
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const token = credential?.accessToken || null;

    if (!token) {
      throw new Error(
        'Google did not return an OAuth access token for Google Sheets & Gmail. Please approve the requested permissions.'
      );
    }

    cachedFirebaseUser = result.user;
    cachedAccessToken = token;
    notifyListeners();
    return getWorkspaceSessionInfo();
  } catch (err) {
    throw formatGoogleAuthError(err);
  } finally {
    isSigningIn = false;
  }
}

export async function disconnectGoogleWorkspace(): Promise<WorkspaceSessionInfo> {
  const auth = ensureFirebaseAuth();
  cachedAccessToken = null;
  cachedFirebaseUser = null;
  try {
    await signOut(auth);
  } finally {
    notifyListeners();
  }
  return getWorkspaceSessionInfo();
}
