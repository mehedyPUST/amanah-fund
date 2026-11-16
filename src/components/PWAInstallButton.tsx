'use client';

import { useState } from 'react';
import { Download, Smartphone } from 'lucide-react';
import { usePWAInstall } from '../utils/usePWAInstall.ts';
import { ActionModal } from './ActionModal.tsx';

interface PWAInstallButtonProps {
  compact?: boolean;
  className?: string;
}

export function PWAInstallButton({ compact = false, className = '' }: PWAInstallButtonProps) {
  const { isInstalled, isIOS, hasNativePrompt, canInstall, promptInstall } = usePWAInstall();
  const [guideOpen, setGuideOpen] = useState(false);

  if (isInstalled || !canInstall) return null;

  async function handleClick() {
    const outcome = await promptInstall();
    if (outcome === 'ios' || outcome === 'manual') {
      setGuideOpen(true);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void handleClick()}
        title="Install Amanah App"
        aria-label="Install Amanah App"
        className={`inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800/70 bg-emerald-50/70 dark:bg-emerald-950/35 hover:bg-emerald-600 hover:text-white hover:border-emerald-600 dark:hover:bg-emerald-600 dark:hover:text-white text-emerald-700 dark:text-emerald-300 font-medium transition-all duration-200 cursor-pointer whitespace-nowrap ${
          compact ? 'px-2.5 py-2 text-xs' : 'px-3 py-2 text-xs'
        } ${className}`}
      >
        {hasNativePrompt ? (
          <Download className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        ) : (
          <Smartphone className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        )}
        <span className={compact ? 'hidden sm:inline' : ''}>Install App</span>
      </button>

      <ActionModal
        open={guideOpen}
        mode="notice"
        tone="teal"
        title="Install Amanah on Your Device"
        description={
          isIOS
            ? 'To install Amanah on iPhone or iPad, tap the Share button in Safari and select "Add to Home Screen".'
            : 'Open your browser menu (⋮ or address bar install icon) and select "Install app" or "Add to Home Screen" for instant standalone access.'
        }
        details={[
          { label: 'App Name', value: 'Amanah' },
          { label: 'Display Mode', value: 'Standalone PWA' },
        ]}
        onClose={() => setGuideOpen(false)}
      />
    </>
  );
}
