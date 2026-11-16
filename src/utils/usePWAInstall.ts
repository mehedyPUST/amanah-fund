'use client';

import { useCallback, useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [canShowGuide, setCanShowGuide] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const nav = window.navigator as Navigator & { standalone?: boolean };
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
    setIsInstalled(standalone);

    const ua = nav.userAgent || '';
    const iosDevice = /iPad|iPhone|iPod/.test(ua) && !('MSStream' in window);
    setIsIOS(iosDevice);
    setCanShowGuide(!standalone);

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      setCanShowGuide(false);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<
    'accepted' | 'dismissed' | 'ios' | 'manual'
  > => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setDeferredPrompt(null);
        return 'accepted';
      }
      return 'dismissed';
    }
    return isIOS ? 'ios' : 'manual';
  }, [deferredPrompt, isIOS]);

  return {
    isInstalled,
    isIOS,
    hasNativePrompt: Boolean(deferredPrompt),
    canInstall: !isInstalled && canShowGuide,
    promptInstall,
  };
}
