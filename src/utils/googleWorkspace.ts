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

let cachedAccessToken: string | null = null;
let cachedFirebaseUser: User | null = null;
let authInstance: Auth | null = null;

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

export function getWorkspaceToken(): string | null {
  return cachedAccessToken;
}

export function subscribeWorkspaceAuth(
  onUpdate: (info: WorkspaceSessionInfo) => void
): () => void {
  const auth = ensureFirebaseAuth();
  return onAuthStateChanged(auth, (fbUser) => {
    cachedFirebaseUser = fbUser;
    if (!fbUser) {
      cachedAccessToken = null;
    }
    onUpdate(getWorkspaceSessionInfo());
  });
}

export async function connectGoogleWorkspace(): Promise<WorkspaceSessionInfo> {
  const auth = ensureFirebaseAuth();
  const provider = new GoogleAuthProvider();
  WORKSPACE_SCOPES.forEach((scope) => provider.addScope(scope));
  provider.setCustomParameters({ prompt: 'consent select_account' });

  const result = await signInWithPopup(auth, provider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  const token = credential?.accessToken || null;

  if (!token) {
    throw new Error(
      'Google did not return an OAuth access token for Sheets/Gmail. Please approve both permissions.'
    );
  }

  cachedFirebaseUser = result.user;
  cachedAccessToken = token;
  return getWorkspaceSessionInfo();
}

export async function disconnectGoogleWorkspace(): Promise<WorkspaceSessionInfo> {
  const auth = ensureFirebaseAuth();
  cachedAccessToken = null;
  cachedFirebaseUser = null;
  await signOut(auth);
  return getWorkspaceSessionInfo();
}
