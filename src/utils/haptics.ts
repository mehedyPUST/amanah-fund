'use client';

export type HapticPattern =
  | 'tap'
  | 'selection'
  | 'nav'
  | 'drawer'
  | 'sheet'
  | 'pullReady'
  | 'success'
  | 'warning'
  | 'error';

const HAPTIC_PATTERNS: Record<HapticPattern, number | number[]> = {
  tap: 10,
  selection: 8,
  nav: 12,
  drawer: 14,
  sheet: 14,
  pullReady: 14,
  success: [12, 36, 18],
  warning: [16, 40, 16],
  error: [22, 34, 22, 34, 26],
};

const COOLDOWN_MS = 55;
const DELEGATED_SKIP_MS = 75;

let lastHapticAt = 0;

function isReducedMotionPreferred(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function isMobileHapticsEligible(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false;
  }
  if (typeof navigator.vibrate !== 'function') {
    return false;
  }
  if (isReducedMotionPreferred()) {
    return false;
  }
  const isNarrowViewport = window.innerWidth < 1024;
  const isCoarsePointer =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches;
  return isNarrowViewport || isCoarsePointer;
}

/**
 * Triggers a concise, mobile-only tactile vibration using the Vibration API.
 * Gracefully no-ops on desktop viewports, reduced-motion preferences, or
 * browsers without navigator.vibrate support.
 */
export function triggerHaptic(
  kind: HapticPattern = 'tap',
  options?: { force?: boolean }
): boolean {
  if (!isMobileHapticsEligible()) return false;

  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const isPriorityOutcome =
    kind === 'success' || kind === 'error' || kind === 'warning';

  if (!options?.force && !isPriorityOutcome && now - lastHapticAt < COOLDOWN_MS) {
    return false;
  }

  lastHapticAt = now;
  try {
    return navigator.vibrate(HAPTIC_PATTERNS[kind]);
  } catch {
    return false;
  }
}

/**
 * Installs a lightweight delegated mobile click listener so every interactive
 * button, tab, switch, or navigation link receives responsive tactile feedback
 * without duplicating handlers across every sub-view. Explicit semantic haptics
 * called inside component click handlers take precedence within the skip window.
 */
export function installGlobalMobileHaptics(): () => void {
  if (typeof document === 'undefined') {
    return () => {};
  }

  const INTERACTIVE_SELECTOR = [
    'button',
    'a[href]',
    '[role="button"]',
    '[role="tab"]',
    '[role="menuitem"]',
    '[role="switch"]',
    'summary',
  ].join(',');

  const handleClick = (event: MouseEvent) => {
    if (!event.isTrusted) return;
    if (!isMobileHapticsEligible()) return;

    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - lastHapticAt < DELEGATED_SKIP_MS) return;

    const target = event.target instanceof Element ? event.target : null;
    const interactive = target?.closest(INTERACTIVE_SELECTOR);
    if (!(interactive instanceof HTMLElement)) return;

    if (
      interactive.hasAttribute('disabled') ||
      interactive.getAttribute('aria-disabled') === 'true' ||
      interactive.dataset.noHaptic === 'true'
    ) {
      return;
    }

    const kind: HapticPattern = interactive.matches(
      '[role="tab"], [role="switch"], [aria-pressed]'
    )
      ? 'selection'
      : 'tap';

    triggerHaptic(kind);
  };

  document.addEventListener('click', handleClick, { passive: true });
  return () => {
    document.removeEventListener('click', handleClick);
  };
}
