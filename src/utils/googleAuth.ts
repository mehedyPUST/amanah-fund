import { getApps, initializeApp } from 'firebase/app';
import {
  type Auth,
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

export const GOOGLE_ONBOARDING_STORAGE_KEY = 'amanah_google_onboarding';

export interface GoogleIdentityProfile {
  name: string;
  email: string;
  photoUrl: string;
}

export interface StoredGoogleOnboarding {
  registrationToken: string;
  googleProfile: GoogleIdentityProfile;
}

let identityAuth: Auth | null = null;

function ensureFirebaseAuth(): Auth {
  if (identityAuth) return identityAuth;
  const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
  identityAuth = getAuth(app);
  return identityAuth;
}

export async function signInWithGoogleIdentity(): Promise<{
  idToken: string;
  profile: GoogleIdentityProfile;
}> {
  const auth = ensureFirebaseAuth();
  const provider = new GoogleAuthProvider();
  provider.addScope('email');
  provider.addScope('profile');
  provider.setCustomParameters({ prompt: 'select_account' });

  try {
    const result = await signInWithPopup(auth, provider);
    const idToken = await result.user.getIdToken();
    return {
      idToken,
      profile: {
        name: result.user.displayName || '',
        email: (result.user.email || '').toLowerCase(),
        photoUrl: result.user.photoURL || '',
      },
    };
  } catch (err: unknown) {
    const code =
      typeof err === 'object' && err !== null && 'code' in err
        ? String((err as { code?: unknown }).code || '')
        : '';

    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      throw new Error('Google Sign-In was cancelled before completion.');
    }
    if (code === 'auth/popup-blocked') {
      throw new Error(
        'Pop-up was blocked by your browser. Please allow pop-ups for this site and try again.'
      );
    }
    if (code === 'auth/unauthorized-domain') {
      const currentHost =
        typeof window !== 'undefined' ? window.location.hostname : 'current domain';
      throw new Error(
        `Domain "${currentHost}" is not yet authorized in Firebase Authentication settings (Project: ${firebaseConfig.projectId}).`
      );
    }
    throw err instanceof Error ? err : new Error('Google Sign-In failed.');
  }
}

export async function signOutGoogleIdentity(): Promise<void> {
  try {
    const auth = ensureFirebaseAuth();
    await signOut(auth);
  } catch {
    // ignore cleanup errors
  }
}
