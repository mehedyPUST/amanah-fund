'use client';

const MOBILE_BROWSE_KEY = 'amanah_mobile_browse';

export function isMobileViewport(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(max-width: 1023px)').matches;
}

export function isMobileBrowseMode(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('browse') === '1') {
      window.sessionStorage.setItem(MOBILE_BROWSE_KEY, '1');
      return true;
    }
    return window.sessionStorage.getItem(MOBILE_BROWSE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setMobileBrowseMode(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (enabled) {
      window.sessionStorage.setItem(MOBILE_BROWSE_KEY, '1');
    } else {
      window.sessionStorage.removeItem(MOBILE_BROWSE_KEY);
    }
  } catch {
    // ignore storage restrictions
  }
}
