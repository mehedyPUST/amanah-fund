'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowRight, LogOut, Menu, Shield, X } from 'lucide-react';
import { useCoopSession } from './AppProviders.tsx';

const PUBLIC_NAV_LINKS = [
  { href: '/', label: 'Overview' },
  { href: '/about', label: 'Architecture' },
  { href: '/rules', label: 'Governance Charter' },
];

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, authChecking, logout } = useCoopSession();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const isAuthenticated = !authChecking && Boolean(user);

  const navLinks = isAuthenticated
    ? [...PUBLIC_NAV_LINKS, { href: '/dashboard', label: 'Member Portal' }]
    : PUBLIC_NAV_LINKS;

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await logout();
      setMobileOpen(false);
      router.push('/');
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <header className="sticky top-0 z-40 h-16 bg-white/90 dark:bg-slate-950/90 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800/80">
      <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-8">
        {/* Zone 1: Brand Wordmark */}
        <Link href="/" className="flex items-center gap-2.5 shrink-0 group">
          <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-600 via-emerald-700 to-amber-600 text-white flex items-center justify-center shrink-0 shadow-xs transition-all duration-200 group-hover:scale-105 group-hover:shadow-md">
            <Shield className="w-4 h-4" aria-hidden="true" />
          </span>
          <span className="font-display font-bold text-base tracking-tight text-slate-900 dark:text-white whitespace-nowrap transition-colors group-hover:text-emerald-700 dark:group-hover:text-emerald-400">
            Amanah Co-op
          </span>
        </Link>

        {/* Zone 2: Navigation Links */}
        <nav className="hidden md:flex items-center gap-2" aria-label="Primary navigation">
          {navLinks.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`relative px-3.5 py-2 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap ${
                  active
                    ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-50/80 dark:bg-emerald-950/40'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/80 dark:hover:bg-slate-800/60'
                }`}
              >
                <span>{link.label}</span>
                {active && (
                  <span
                    className="absolute inset-x-3 -bottom-[1px] h-0.5 bg-gradient-to-r from-emerald-600 via-emerald-500 to-amber-500 rounded-full"
                    aria-hidden="true"
                  />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Zone 3: Auth-Aware Primary Action */}
        <div className="flex items-center gap-2.5 shrink-0">
          {isAuthenticated ? (
            <button
              type="button"
              onClick={() => void handleSignOut()}
              disabled={signingOut}
              className="hidden sm:inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-red-200 dark:border-red-900/70 bg-red-50/70 dark:bg-red-950/30 text-red-700 dark:text-red-400 hover:bg-red-600 hover:text-white hover:border-red-600 dark:hover:bg-red-600 dark:hover:text-white text-xs font-medium transition-all duration-200 hover:shadow-sm active:scale-[0.98] whitespace-nowrap cursor-pointer disabled:opacity-60"
            >
              <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{signingOut ? 'Signing Out…' : 'Sign Out'}</span>
            </button>
          ) : (
            <>
              <Link
                href="/login"
                className="hidden sm:inline-flex items-center px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600 text-slate-700 dark:text-slate-200 text-xs font-medium transition-all duration-200 hover:shadow-xs whitespace-nowrap"
              >
                Member Sign In
              </Link>
              <Link
                href="/signup"
                title="Apply for Cooperative Membership"
                className="group hidden sm:inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white text-xs font-medium shadow-xs hover:shadow-md transition-all duration-200 active:scale-[0.98] whitespace-nowrap"
              >
                <span>Apply Now</span>
                <ArrowRight
                  className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </Link>
            </>
          )}

          <button
            type="button"
            onClick={() => setMobileOpen((o) => !o)}
            aria-label="Toggle navigation menu"
            className="md:hidden p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu Drawer */}
      {mobileOpen && (
        <div className="md:hidden bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 px-4 py-4 space-y-2 shadow-lg">
          {navLinks.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className={`block w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900'
                }`}
              >
                {link.label}
              </Link>
            );
          })}

          {isAuthenticated ? (
            <button
              type="button"
              onClick={() => void handleSignOut()}
              disabled={signingOut}
              className="w-full py-2.5 px-4 rounded-lg border border-red-200 dark:border-red-900/70 bg-red-50/70 dark:bg-red-950/30 hover:bg-red-600 hover:text-white text-red-700 dark:text-red-400 text-sm font-medium flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer disabled:opacity-60"
            >
              <LogOut className="w-4 h-4" aria-hidden="true" />
              <span>{signingOut ? 'Signing Out…' : 'Sign Out'}</span>
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Link
                href="/login"
                onClick={() => setMobileOpen(false)}
                className="block w-full text-center py-2.5 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-900"
              >
                Sign In
              </Link>
              <Link
                href="/signup"
                onClick={() => setMobileOpen(false)}
                className="block w-full text-center py-2.5 px-3 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 text-white text-sm font-medium"
              >
                Apply Now
              </Link>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
