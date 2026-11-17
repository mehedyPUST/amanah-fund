'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  Edit3,
  Info,
  Megaphone,
  Pin,
  PinOff,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Skeleton from 'react-loading-skeleton';
import type { CoopNotice, NoticePriority } from '../types/coop.ts';
import { api } from '../utils/api.ts';
import { ActionModal } from './ActionModal.tsx';
import { useCoopSession } from './AppProviders.tsx';
import { MotionCard, type CardHue } from './MotionCard.tsx';

type NoticeFilter = 'all' | 'pinned' | 'urgent' | 'important';

const PRIORITY_META: Record<
  NoticePriority,
  {
    label: string;
    Icon: typeof Info;
    hue: CardHue;
    iconBox: string;
    labelClass: string;
    cardClass: string;
  }
> = {
  urgent: {
    label: 'Urgent',
    Icon: AlertTriangle,
    hue: 'rose',
    iconBox:
      'bg-rose-100/85 dark:bg-rose-500/15 border-rose-200/80 dark:border-rose-500/25 text-rose-600 dark:text-rose-400',
    labelClass: 'text-rose-700 dark:text-rose-400',
    cardClass: 'backdrop-blur-md',
  },
  important: {
    label: 'Important',
    Icon: Megaphone,
    hue: 'amber',
    iconBox:
      'bg-amber-100/85 dark:bg-amber-500/15 border-amber-200/80 dark:border-amber-500/25 text-amber-700 dark:text-amber-400',
    labelClass: 'text-amber-700 dark:text-amber-400',
    cardClass: 'backdrop-blur-md',
  },
  normal: {
    label: 'Notice',
    Icon: Info,
    hue: 'emerald',
    iconBox:
      'bg-emerald-100/85 dark:bg-emerald-500/15 border-emerald-200/80 dark:border-emerald-500/25 text-emerald-700 dark:text-emerald-400',
    labelClass: 'text-emerald-700 dark:text-emerald-400',
    cardClass: 'backdrop-blur-md',
  },
};

function formatNoticeDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatRoleLabel(role: CoopNotice['authorRole']): string {
  if (role === 'admin') return 'Admin';
  if (role === 'manager') return 'Manager';
  return 'Member';
}

export function HomeNoticeBoardSection({ embedded = false }: { embedded?: boolean }) {
  const { user, authChecking } = useCoopSession();
  const isActiveMember = !authChecking && Boolean(user && user.status === 'active');
  const canManage = isActiveMember && (user?.role === 'admin' || user?.role === 'manager');

  const [notices, setNotices] = useState<CoopNotice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<NoticeFilter>('all');

  const [composerOpen, setComposerOpen] = useState(false);
  const [editingNotice, setEditingNotice] = useState<CoopNotice | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState<NoticePriority>('normal');
  const [pinned, setPinned] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CoopNotice | null>(null);

  const loadNotices = useCallback(async (silent = false) => {
    if (!isActiveMember) return;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const data = await api.getNotices();
      setNotices(Array.isArray(data.notices) ? data.notices : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load cooperative notices.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [isActiveMember]);

  useEffect(() => {
    if (!isActiveMember) {
      setNotices([]);
      return;
    }
    void loadNotices(false);
  }, [isActiveMember, loadNotices]);

  useEffect(() => {
    if (!isActiveMember) return;
    const source = new EventSource('/api/events');
    const handleNoticeUpdate = () => {
      void loadNotices(true);
    };
    source.addEventListener('notice:updated', handleNoticeUpdate);
    return () => {
      source.removeEventListener('notice:updated', handleNoticeUpdate);
      source.close();
    };
  }, [isActiveMember, loadNotices]);

  const filteredNotices = useMemo(() => {
    if (filter === 'pinned') return notices.filter((n) => n.pinned);
    if (filter === 'urgent') return notices.filter((n) => n.priority === 'urgent');
    if (filter === 'important') return notices.filter((n) => n.priority === 'important');
    return notices;
  }, [notices, filter]);

  function openCreateComposer() {
    setEditingNotice(null);
    setTitle('');
    setBody('');
    setPriority('normal');
    setPinned(false);
    setFormError(null);
    setComposerOpen(true);
  }

  function openEditComposer(notice: CoopNotice) {
    setEditingNotice(notice);
    setTitle(notice.title);
    setBody(notice.body);
    setPriority(notice.priority);
    setPinned(Boolean(notice.pinned));
    setFormError(null);
    setComposerOpen(true);
  }

  function closeComposer() {
    if (submitting) return;
    setComposerOpen(false);
    setEditingNotice(null);
    setFormError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canManage || submitting) return;

    const cleanTitle = title.trim();
    const cleanBody = body.trim();
    if (cleanTitle.length < 3 || cleanTitle.length > 160) {
      setFormError('Notice title must be between 3 and 160 characters.');
      return;
    }
    if (cleanBody.length < 3 || cleanBody.length > 2000) {
      setFormError('Notice message must be between 3 and 2000 characters.');
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      if (editingNotice) {
        const res = await api.updateNotice(editingNotice.id, {
          title: cleanTitle,
          body: cleanBody,
          priority,
          pinned,
        });
        setNotices((prev) =>
          prev
            .map((item) => (item.id === res.notice.id ? res.notice : item))
            .sort((a, b) => {
              const pinDiff = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
              return pinDiff !== 0 ? pinDiff : b.createdAt.localeCompare(a.createdAt);
            })
        );
      } else {
        const res = await api.createNotice({
          title: cleanTitle,
          body: cleanBody,
          priority,
          pinned,
        });
        setNotices((prev) =>
          [res.notice, ...prev].sort((a, b) => {
            const pinDiff = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
            return pinDiff !== 0 ? pinDiff : b.createdAt.localeCompare(a.createdAt);
          })
        );
      }
      setComposerOpen(false);
      setEditingNotice(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to save notice.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleTogglePin(notice: CoopNotice) {
    if (!canManage || busyId) return;
    setBusyId(notice.id);
    setError(null);
    try {
      const res = await api.updateNotice(notice.id, { pinned: !notice.pinned });
      setNotices((prev) =>
        prev
          .map((item) => (item.id === res.notice.id ? res.notice : item))
          .sort((a, b) => {
            const pinDiff = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
            return pinDiff !== 0 ? pinDiff : b.createdAt.localeCompare(a.createdAt);
          })
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update notice pin status.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleConfirmDelete() {
    if (!canManage || !deleteTarget) return;
    const targetId = deleteTarget.id;
    setBusyId(targetId);
    setError(null);
    try {
      await api.deleteNotice(targetId);
      setNotices((prev) => prev.filter((item) => item.id !== targetId));
      setDeleteTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete notice.');
    } finally {
      setBusyId(null);
    }
  }

  // Strictly hidden for unauthenticated visitors and pending/inactive accounts
  if (!isActiveMember) {
    return null;
  }

  return (
    <section
      id="notice-board"
      className={
        embedded
          ? 'scroll-mt-4 bg-white/95 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-6 sm:p-8 shadow-xs text-slate-900 dark:text-slate-100 space-y-5'
          : 'scroll-mt-4 border-t border-slate-200/70 dark:border-slate-800/80 bg-white/95 dark:bg-slate-900/90 backdrop-blur-sm text-slate-900 dark:text-slate-100'
      }
    >
      <div className={embedded ? 'space-y-5' : 'w-full py-10 sm:py-12 space-y-6'}>
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
          <div className="space-y-1">
            <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              Members Only · Official Announcements
            </div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Cooperative Notice Board
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div
              className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1"
              role="tablist"
              aria-label="Filter notices"
            >
              {(
                [
                  { id: 'all', label: `All (${notices.length})` },
                  { id: 'pinned', label: 'Pinned' },
                  { id: 'urgent', label: 'Urgent' },
                  { id: 'important', label: 'Important' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={filter === tab.id}
                  onClick={() => setFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    filter === tab.id
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {canManage && (
              <button
                type="button"
                onClick={() => (composerOpen ? closeComposer() : openCreateComposer())}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-700 via-emerald-600 to-emerald-500 hover:from-emerald-800 hover:via-emerald-700 hover:to-emerald-600 text-white text-xs font-medium shadow-xs hover:shadow-md transition-all duration-200 active:scale-[0.98] whitespace-nowrap cursor-pointer"
              >
                {composerOpen ? (
                  <>
                    <X className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Close Editor</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Post Notice</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="p-4 rounded-xl border border-rose-200 dark:border-rose-900/70 bg-rose-50/80 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 text-xs flex items-center justify-between gap-3"
          >
            <span>{error}</span>
            <button
              type="button"
              onClick={() => void loadNotices(false)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-800 bg-white dark:bg-slate-900 text-rose-700 dark:text-rose-300 font-medium hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors shrink-0 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Retry</span>
            </button>
          </div>
        )}

        <AnimatePresence>
          {canManage && composerOpen && (
            <motion.form
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              onSubmit={handleSubmit}
              className="bg-white/90 dark:bg-slate-900/85 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-5 sm:p-6 shadow-sm space-y-4"
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white">
                  {editingNotice ? 'Edit Cooperative Notice' : 'Publish Official Notice'}
                </h3>
                <button
                  type="button"
                  onClick={closeComposer}
                  disabled={submitting}
                  aria-label="Close notice form"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {formError && (
                <div
                  role="alert"
                  className="p-3 rounded-lg border border-rose-200 dark:border-rose-900/70 bg-rose-50 dark:bg-rose-950/40 text-xs text-rose-700 dark:text-rose-300"
                >
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                <div className="md:col-span-7 space-y-1.5">
                  <label
                    htmlFor="notice-title"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    Notice Title
                  </label>
                  <input
                    id="notice-title"
                    type="text"
                    required
                    minLength={3}
                    maxLength={160}
                    disabled={submitting}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g., Monthly Contribution Cutoff & Shariah Review"
                    className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-500"
                  />
                </div>

                <div className="md:col-span-5 space-y-1.5">
                  <span className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Priority Level
                  </span>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['normal', 'important', 'urgent'] as const).map((level) => (
                      <button
                        key={level}
                        type="button"
                        disabled={submitting}
                        onClick={() => setPriority(level)}
                        className={`py-2.5 px-2 rounded-lg border text-xs font-medium capitalize transition-colors cursor-pointer ${
                          priority === level
                            ? level === 'urgent'
                              ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300'
                              : level === 'important'
                                ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300'
                                : 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        {level}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <label
                    htmlFor="notice-body"
                    className="font-medium text-slate-700 dark:text-slate-300"
                  >
                    Message
                  </label>
                  <span className="font-mono text-slate-500 dark:text-slate-400">{body.length}/2000</span>
                </div>
                <textarea
                  id="notice-body"
                  rows={4}
                  required
                  minLength={3}
                  maxLength={2000}
                  disabled={submitting}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Write the official cooperative announcement for verified members..."
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-500"
                />
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={pinned}
                    disabled={submitting}
                    onChange={(e) => setPinned(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 dark:bg-slate-900 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>Pin notice to top of board</span>
                </label>

                <div className="flex items-center gap-2.5 self-end sm:self-auto">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={closeComposer}
                    className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-700 via-emerald-600 to-emerald-500 hover:from-emerald-800 hover:via-emerald-700 hover:to-emerald-600 text-white text-xs font-medium shadow-xs hover:shadow-md transition-all duration-200 cursor-pointer disabled:opacity-50"
                  >
                    {submitting
                      ? 'Saving…'
                      : editingNotice
                        ? 'Save Changes'
                        : 'Publish Notice'}
                  </button>
                </div>
              </div>
            </motion.form>
          )}
        </AnimatePresence>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 space-y-2.5"
              >
                <div className="flex items-center gap-3">
                  <Skeleton width={36} height={36} borderRadius={10} />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton width="45%" height={12} />
                    <Skeleton width="75%" height={16} />
                  </div>
                </div>
                <Skeleton width="100%" height={13} count={2} />
              </div>
            ))}
          </div>
        ) : filteredNotices.length === 0 ? (
          <div className="bg-slate-50/70 dark:bg-slate-950/60 border border-slate-200/90 dark:border-slate-800 rounded-xl p-6 text-center space-y-2">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {notices.length === 0
                ? 'No official notices posted yet.'
                : 'No notices match this filter.'}
            </p>
            {canManage && notices.length === 0 && !composerOpen && (
              <button
                type="button"
                onClick={openCreateComposer}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 text-xs font-medium hover:bg-emerald-100/70 dark:hover:bg-emerald-950/60 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Post First Notice</span>
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {filteredNotices.map((notice, idx) => {
              const meta = PRIORITY_META[notice.priority] || PRIORITY_META.normal;
              const PriorityIcon = meta.Icon;
              const isEdited = Boolean(
                notice.updatedAt &&
                  new Date(notice.updatedAt).getTime() - new Date(notice.createdAt).getTime() > 5000
              );
              const rowBusy = busyId === notice.id;

              return (
                <MotionCard
                  as="article"
                  key={notice.id}
                  hue={meta.hue}
                  delay={Math.min(idx * 0.04, 0.2)}
                  className={`border rounded-xl p-4 shadow-xs hover:shadow-md transition-all duration-200 flex flex-col justify-between gap-3 ${meta.cardClass}`}
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div
                          className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${meta.iconBox}`}
                        >
                          <PriorityIcon className="w-4 h-4" aria-hidden="true" />
                        </div>
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                            {notice.pinned && (
                              <>
                                <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400">
                                  <Pin className="w-3 h-3" aria-hidden="true" />
                                  Pinned
                                </span>
                                <span aria-hidden="true">·</span>
                              </>
                            )}
                            <span className={`font-semibold ${meta.labelClass}`}>{meta.label}</span>
                            <span aria-hidden="true">·</span>
                            <span>
                              {notice.authorName} ({formatRoleLabel(notice.authorRole)})
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{formatNoticeDate(notice.createdAt)}</span>
                            {isEdited && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="italic">Edited</span>
                              </>
                            )}
                          </div>
                          <h3 className="text-base font-semibold text-slate-900 dark:text-white leading-snug break-words">
                            {notice.title}
                          </h3>
                        </div>
                      </div>

                      {canManage && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            disabled={rowBusy}
                            onClick={() => void handleTogglePin(notice)}
                            title={notice.pinned ? 'Unpin notice' : 'Pin notice to top'}
                            aria-label={notice.pinned ? 'Unpin notice' : 'Pin notice to top'}
                            className={`p-1.5 rounded-lg border transition-colors cursor-pointer disabled:opacity-50 ${
                              notice.pinned
                                ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400'
                                : 'border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-200'
                            }`}
                          >
                            {notice.pinned ? (
                              <PinOff className="w-3.5 h-3.5" aria-hidden="true" />
                            ) : (
                              <Pin className="w-3.5 h-3.5" aria-hidden="true" />
                            )}
                          </button>
                          <button
                            type="button"
                            disabled={rowBusy}
                            onClick={() => openEditComposer(notice)}
                            title="Edit notice"
                            aria-label="Edit notice"
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-200 transition-colors cursor-pointer disabled:opacity-50"
                          >
                            <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            disabled={rowBusy}
                            onClick={() => setDeleteTarget(notice)}
                            title="Delete notice"
                            aria-label="Delete notice"
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:border-rose-200 dark:hover:border-rose-800 hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer disabled:opacity-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      )}
                    </div>

                    <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line break-words text-justify">
                      {notice.body}
                    </p>
                  </div>
                </MotionCard>
              );
            })}
          </div>
        )}
      </div>

      <ActionModal
        open={Boolean(deleteTarget)}
        mode="confirm"
        tone="red"
        title="Delete Cooperative Notice"
        description="This will permanently remove the announcement from the member notice board."
        details={
          deleteTarget
            ? [
                { label: 'Title', value: deleteTarget.title },
                { label: 'Posted By', value: deleteTarget.authorName },
              ]
            : undefined
        }
        confirmLabel="Delete Notice"
        busy={Boolean(deleteTarget && busyId === deleteTarget.id)}
        onConfirm={handleConfirmDelete}
        onClose={() => {
          if (!busyId) setDeleteTarget(null);
        }}
      />
    </section>
  );
}
