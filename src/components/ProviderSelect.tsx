'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { AnimatePresence, motion } from 'motion/react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { isTopModal, registerTopModal } from '../utils/modalLock.ts';

interface ProviderSelectProps {
  id?: string;
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  compact?: boolean;
}

interface DropdownCoords {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
  maxListHeight: number;
}

export function ProviderSelect({
  id,
  options,
  value,
  onChange,
  disabled = false,
  placeholder,
  compact = false,
}: ProviderSelectProps) {
  const t = useTranslations('Common.providerSelect');
  const resolvedPlaceholder = placeholder || t('searchPlaceholder');
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [coords, setCoords] = useState<DropdownCoords | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const modalTokenRef = useRef<symbol | null>(null);
  if (!modalTokenRef.current) {
    modalTokenRef.current = Symbol('ProviderSelect');
  }

  useEffect(() => {
    setMounted(true);
  }, []);

  const updateCoords = useCallback(() => {
    if (!containerRef.current || typeof window === 'undefined') return;
    const rect = containerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const spaceAbove = rect.top - 12;
    const openUpward = spaceBelow < 240 && spaceAbove > spaceBelow;
    const availableSpace = openUpward ? spaceAbove : spaceBelow;
    const maxListHeight = Math.max(120, Math.min(224, availableSpace - 54));

    setCoords({
      left: Math.max(8, rect.left),
      width: Math.min(rect.width, window.innerWidth - 16),
      ...(openUpward
        ? { bottom: window.innerHeight - rect.top + 4 }
        : { top: rect.bottom + 4 }),
      maxListHeight,
    });
  }, []);

  useEffect(() => {
    if (!open || !modalTokenRef.current) return;
    const token = modalTokenRef.current;
    const unregister = registerTopModal(token);
    updateCoords();

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const inTrigger = containerRef.current?.contains(target);
      const inDropdown = dropdownRef.current?.contains(target);
      if (!inTrigger && !inDropdown) {
        setOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isTopModal(token)) {
        e.stopPropagation();
        setOpen(false);
      }
    };
    const handleReposition = () => updateCoords();

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleEsc);
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);
    window.setTimeout(() => searchRef.current?.focus(), 30);

    return () => {
      unregister();
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleEsc);
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [open, updateCoords]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((opt) => opt.toLowerCase().includes(q));
  }, [options, query]);

  const btnPadding = compact ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-2 text-sm';

  return (
    <div ref={containerRef} className="relative">
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          if (!disabled) {
            setOpen((prev) => !prev);
            setQuery('');
          }
        }}
        className={`w-full ${btnPadding} rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-left flex items-center justify-between gap-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-600/30 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed`}
      >
        <span className="truncate">{value || options[0] || t('selectFallback')}</span>
        <ChevronDown
          className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        />
      </button>

      {mounted &&
        createPortal(
          <AnimatePresence>
            {open && coords && (
              <motion.div
                ref={dropdownRef}
                initial={{ opacity: 0, y: coords.bottom !== undefined ? 4 : -4, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: coords.bottom !== undefined ? 4 : -4, scale: 0.98 }}
                transition={{ duration: 0.16 }}
                style={{
                  position: 'fixed',
                  left: coords.left,
                  width: coords.width,
                  ...(coords.top !== undefined ? { top: coords.top } : {}),
                  ...(coords.bottom !== undefined ? { bottom: coords.bottom } : {}),
                }}
                className="z-[65] rounded-xl border border-slate-200/80 dark:border-slate-700/80 bg-white/88 dark:bg-slate-950/88 backdrop-blur-md shadow-xl overflow-hidden"
              >
                <div className="p-2 border-b border-slate-100 dark:border-slate-800 relative">
                  <Search
                    className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 absolute left-4.5 top-1/2 -translate-y-1/2"
                    aria-hidden="true"
                  />
                  <input
                    ref={searchRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={resolvedPlaceholder}
                    className="w-full pl-8 pr-2.5 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                  />
                </div>
                <ul
                  role="listbox"
                  style={{ maxHeight: coords.maxListHeight }}
                  className="overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/70 text-xs"
                >
                  {filtered.length === 0 ? (
                    <li className="px-3 py-3 text-slate-500 dark:text-slate-400 text-center">
                      {t('noMatch', { query })}
                    </li>
                  ) : (
                    filtered.map((opt) => {
                      const selected = opt === value;
                      return (
                        <li key={opt}>
                          <button
                            type="button"
                            role="option"
                            aria-selected={selected}
                            onClick={() => {
                              onChange(opt);
                              setOpen(false);
                              setQuery('');
                            }}
                            className={`w-full px-3 py-2 text-left flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                              selected
                                ? 'bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 font-medium'
                                : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900'
                            }`}
                          >
                            <span className="truncate">{opt}</span>
                            {selected && (
                              <Check className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" aria-hidden="true" />
                            )}
                          </button>
                        </li>
                      );
                    })
                  )}
                </ul>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
}
