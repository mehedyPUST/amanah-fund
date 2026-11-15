'use client';

import { useEffect } from 'react';

const modalStack: symbol[] = [];
let scrollLockCount = 0;
let savedBodyOverflow: string | null = null;

export function registerTopModal(token: symbol): () => void {
  if (!modalStack.includes(token)) {
    modalStack.push(token);
  }
  return () => {
    const idx = modalStack.lastIndexOf(token);
    if (idx !== -1) {
      modalStack.splice(idx, 1);
    }
  };
}

export function isTopModal(token: symbol): boolean {
  return modalStack.length > 0 && modalStack[modalStack.length - 1] === token;
}

export function acquireBodyScrollLock(): () => void {
  if (typeof document === 'undefined') return () => undefined;
  if (scrollLockCount === 0) {
    savedBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  scrollLockCount += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    scrollLockCount = Math.max(0, scrollLockCount - 1);
    if (scrollLockCount === 0) {
      document.body.style.overflow = savedBodyOverflow ?? '';
      savedBodyOverflow = null;
    }
  };
}

export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    return acquireBodyScrollLock();
  }, [active]);
}
