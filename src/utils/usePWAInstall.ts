'use client';

import { useCallback, useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

declare global {
  interface Window {
    __amanahInstallPrompt?: BeforeInstallPromptEvent | null;
    __amanahAppInstalled?: boolean;
  }
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isInIframe, setIsInIframe] = useState(false);
  const [canShowGuide, setCanShowGuide] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const nav = window.navigator as Navigator & { standalone?: boolean };
    const standalone =
      Boolean(window.__amanahAppInstalled) ||
      window.matchMedia('(display-mode: standalone)').matches ||
      nav.standalone === true;
    setIsInstalled(standalone);

    const ua = nav.userAgent || '';
    const iosDevice = /iPad|iPhone|iPod/.test(ua) && !('MSStream' in window);
    setIsIOS(iosDevice);

    let framed = false;
    try {
      framed = window.self !== window.top;
    } catch {
      framed = true;
    }
    setIsInIframe(framed);
    setCanShowGuide(!standalone);

    if (window.__amanahInstallPrompt) {
      setDeferredPrompt(window.__amanahInstallPrompt);
    }

    const syncFromGlobal = () => {
      if (window.__amanahAppInstalled) {
        setIsInstalled(true);
        setDeferredPrompt(null);
        setCanShowGuide(false);
        return;
      }
      setDeferredPrompt(window.__amanahInstallPrompt ?? null);
    };

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      const promptEvent = event as BeforeInstallPromptEvent;
      window.__amanahInstallPrompt = promptEvent;
      setDeferredPrompt(promptEvent);
    };

    const handleAppInstalled = () => {
      window.__amanahAppInstalled = true;
      window.__amanahInstallPrompt = null;
      setIsInstalled(true);
      setDeferredPrompt(null);
      setCanShowGuide(false);
    };

    const displayMedia = window.matchMedia('(display-mode: standalone)');
    const handleDisplayModeChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        handleAppInstalled();
      }
    };

    window.addEventListener('amanah:pwa-prompt-updated', syncFromGlobal);
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    displayMedia.addEventListener?.('change', handleDisplayModeChange);

    return () => {
      window.removeEventListener('amanah:pwa-prompt-updated', syncFromGlobal);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      displayMedia.removeEventListener?.('change', handleDisplayModeChange);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<
    'accepted' | 'dismissed' | 'ios' | 'iframe' | 'manual'
  > => {
    const activePrompt = deferredPrompt || (typeof window !== 'undefined' ? window.__amanahInstallPrompt : null);
    if (activePrompt) {
      try {
        await activePrompt.prompt();
        const choice = await activePrompt.userChoice;
        if (typeof window !== 'undefined') {
          window.__amanahInstallPrompt = null;
        }
        setDeferredPrompt(null);
        if (choice.outcome === 'accepted') {
          if (typeof window !== 'undefined') {
            window.__amanahAppInstalled = true;
          }
          setIsInstalled(true);
          return 'accepted';
        }
        return 'dismissed';
      } catch {
        if (typeof window !== 'undefined') {
          window.__amanahInstallPrompt = null;
        }
        setDeferredPrompt(null);
        return isInIframe ? 'iframe' : isIOS ? 'ios' : 'manual';
      }
    }
    if (isInIframe) return 'iframe';
    return isIOS ? 'ios' : 'manual';
  }, [deferredPrompt, isIOS, isInIframe]);

  return {
    isInstalled,
    isIOS,
    isInIframe,
    hasNativePrompt: Boolean(deferredPrompt),
    canInstall: !isInstalled && canShowGuide,
    promptInstall,
  };
}
