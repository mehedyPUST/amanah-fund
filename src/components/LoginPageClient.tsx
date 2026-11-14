'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useCoopSession } from './AppProviders.tsx';
import { AuthScreen } from './AuthScreen.tsx';

export function LoginPageClient() {
  const router = useRouter();
  const { user, authChecking, setUser } = useCoopSession();

  useEffect(() => {
    if (!authChecking && user) {
      router.replace('/dashboard');
    }
  }, [authChecking, user, router]);

  return (
    <AuthScreen
      onAuthenticated={(authed) => {
        setUser(authed);
        router.push('/dashboard');
      }}
    />
  );
}
