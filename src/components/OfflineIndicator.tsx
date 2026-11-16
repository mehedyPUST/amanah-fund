'use client';

import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

export function OfflineIndicator() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncStatus = () => setIsOffline(!window.navigator.onLine);
    syncStatus();
    window.addEventListener('online', syncStatus);
    window.addEventListener('offline', syncStatus);
    return () => {
      window.removeEventListener('online', syncStatus);
      window.removeEventListener('offline', syncStatus);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[80] px-4 py-2 rounded-full border border-amber-300 dark:border-amber-800 bg-amber-50/95 dark:bg-slate-900/95 backdrop-blur-sm shadow-lg flex items-center gap-2 text-xs font-medium text-amber-900 dark:text-amber-300"
    >
      <WifiOff className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>You are offline. Cached pages remain visible; treasury updates require connection.</span>
    </div>
  );
}
