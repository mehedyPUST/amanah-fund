import { useState } from 'react';
import { ArrowRight, Menu, Moon, Shield, Sun, X } from 'lucide-react';
import type { PublicUser } from '../types/coop.ts';

export type PublicPage = 'home' | 'about' | 'rules' | 'login';

interface PublicNavbarProps {
  activePage: PublicPage;
  user: PublicUser | null;
  darkMode: boolean;
  onToggleDark: () => void;
  onNavigate: (page: PublicPage) => void;
  onOpenDashboard: () => void;
}

const NAV_LINKS: Array<{ id: PublicPage; label: string }> = [
  { id: 'home', label: 'Home' },
  { id: 'about', label: 'About' },
  { id: 'rules', label: 'Cooperative Rules' },
];

export function PublicNavbar({
  activePage,
  user,
  darkMode,
  onToggleDark,
  onNavigate,
  onOpenDashboard,
}: PublicNavbarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 h-16 bg-white/95 dark:bg-slate-950/95 backdrop-blur-sm border-b border-slate-200 dark:border-slate-800">
      <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
        {/* Left: Brand */}
        <button
          type="button"
          onClick={() => onNavigate('home')}
          className="flex items-center gap-2.5 text-left cursor-pointer shrink-0"
        >
          <span className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
            <Shield className="w-4 h-4" aria-hidden="true" />
          </span>
          <span className="font-display font-bold text-base tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
            Amanah Co-op
          </span>
        </button>

        {/* Center: Primary Navigation */}
        <nav className="hidden md:flex items-center gap-1" aria-label="Public navigation">
          {NAV_LINKS.map((link) => {
            const active = activePage === link.id;
            return (
              <button
                key={link.id}
                type="button"
                onClick={() => onNavigate(link.id)}
                className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  active
                    ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/70 dark:hover:bg-slate-800/60'
                }`}
              >
                {link.label}
              </button>
            );
          })}
        </nav>

        {/* Right: Actions */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onToggleDark}
            title={darkMode ? 'Switch to light theme' : 'Switch to dark theme'}
            aria-label={darkMode ? 'Switch to light theme' : 'Switch to dark theme'}
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {user ? (
            <button
              type="button"
              onClick={onOpenDashboard}
              className="hidden sm:inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition-colors whitespace-nowrap cursor-pointer"
            >
              <span>Members Dashboard</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onNavigate('login')}
              className="hidden sm:inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition-colors whitespace-nowrap cursor-pointer"
            >
              <span>Member Sign In</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}

          <button
            type="button"
            onClick={() => setMobileOpen((o) => !o)}
            aria-label="Toggle public menu"
            className="md:hidden p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
          >
            {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Mobile Dropdown */}
      {mobileOpen && (
        <div className="md:hidden bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 px-4 py-4 space-y-2">
          {NAV_LINKS.map((link) => (
            <button
              key={link.id}
              type="button"
              onClick={() => {
                onNavigate(link.id);
                setMobileOpen(false);
              }}
              className={`block w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium ${
                activePage === link.id
                  ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400'
                  : 'text-slate-700 dark:text-slate-300'
              }`}
            >
              {link.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setMobileOpen(false);
              if (user) {
                onOpenDashboard();
              } else {
                onNavigate('login');
              }
            }}
            className="w-full py-2.5 px-4 rounded-lg bg-emerald-600 text-white text-sm font-medium"
          >
            {user ? 'Open Members Dashboard' : 'Member Sign In / Apply'}
          </button>
        </div>
      )}
    </header>
  );
}
