'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import {
  AlertTriangle,
  Edit3,
  Info,
  Megaphone,
  Pin,
  PinOff,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Skeleton from 'react-loading-skeleton';
import { translateRoleLabel } from '../i18n/messages.ts';
import { queryKeys } from '../lib/queryKeys.ts';
import type { CoopNotice, NoticePriority } from '../types/coop.ts';
import { api } from '../utils/api.ts';
import { ActionModal } from './ActionModal.tsx';
import { useCoopSession } from './AppProviders.tsx';
import { MotionCard, type CardHue } from './MotionCard.tsx';
import {
  NotificationBlinkMarker,
  isNotificationForUser,
} from './NotificationBlinkMarker.tsx';

type NoticeFilter = 'all' | 'pinned' | 'urgent' | 'important';

const PRIORITY_STYLE_META: Record<
  NoticePriority,
  {
    Icon: typeof Info;
    hue: CardHue;
    iconBox: string;
    labelClass: string;
    cardClass: string;
  }
> = {
  urgent: {
    Icon: AlertTriangle,
    hue: 'rose',
    iconBox:
      'bg-rose-100/85 dark:bg-rose-500/15 border-rose-200/80 dark:border-rose-500/25 text-rose-600 dark:text-rose-400',
    labelClass: 'text-rose-700 dark:text-rose-400',
    cardClass: 'backdrop-blur-md',
  },
  important: {
    Icon: Megaphone,
    hue: 'amber',
    iconBox:
      'bg-amber-100/85 dark:bg-amber-500/15 border-amber-200/80 dark:border-amber-500/25 text-amber-700 dark:text-amber-400',
    labelClass: 'text-amber-700 dark:text-amber-400',
    cardClass: 'backdrop-blur-md',
  },
  normal: {
    Icon: Info,
    hue: 'emerald',
    iconBox:
      'bg-emerald-100/85 dark:bg-emerald-500/15 border-emerald-200/80 dark:border-emerald-500/25 text-emerald-700 dark:text-emerald-400',
    labelClass: 'text-emerald-700 dark:text-emerald-400',
    cardClass: 'backdrop-blur-md',
  },
};

function formatNoticeDate(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(locale === 'bn' ? 'bn-BD' : 'en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function HomeNoticeBoardSection({ embedded = false }: { embedded?: boolean }) {
  const { user, authChecking, locale } = useCoopSession();
  const t = useTranslations('Public.notices');
  const tCommon = useTranslations('Common');
  const isActiveMember = !authChecking && Boolean(user && user.status === 'active');
  const canManage = isActiveMember && (user?.role === 'admin' || user?.role === 'manager');

  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [filter, setFilter] = useState<NoticeFilter>('all');

  const noticesQuery = useQuery({
    queryKey: queryKeys.public.notices(),
    queryFn: () => api.getNotices(),
    enabled: isActiveMember,
  });

  const notificationsQuery = useQuery({
    queryKey: queryKeys.dashboard.notifications(),
    queryFn: () => api.getNotifications(),
    enabled: isActiveMember,
    staleTime: 60_000,
  });

  const unreadNoticeIds = useMemo(() => {
    const ids = new Set<string>();
    if (!user || !isActiveMember) return ids;
    const list = notificationsQuery.data?.notifications;
    if (!Array.isArray(list)) return ids;
    for (const n of list) {
      if (
        !n.readByRecipient &&
        n.type === 'cooperative_notice' &&
        n.relatedId &&
        isNotificationForUser(n, user)
      ) {
        ids.add(n.relatedId);
      }
    }
    return ids;
  }, [notificationsQuery.data, user, isActiveMember]);

  const notices = useMemo(
    () => (isActiveMember && Array.isArray(noticesQuery.data?.notices) ? noticesQuery.data.notices : []),
    [isActiveMember, noticesQuery.data]
  );
  const loading = isActiveMember && (noticesQuery.isPending || noticesQuery.isFetching);
  const error =
    actionError ??
    (noticesQuery.isError
      ? noticesQuery.error instanceof Error
        ? noticesQuery.error.message
        : t('loadFailed')
      : null);

  const [composerOpen, setComposerOpen] = useState(false);
  const [editingNotice, setEditingNotice] = useState<CoopNotice | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState<NoticePriority>('normal');
  const [pinned, setPinned] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [rewritingNotice, setRewritingNotice] = useState(false);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CoopNotice | null>(null);

  const loadNotices = useCallback(
    async (_silent = false) => {
      if (!isActiveMember) return;
      setActionError(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.public.notices() });
    },
    [isActiveMember, queryClient]
  );

  useEffect(() => {
    if (!isActiveMember) return;
    const handleGlobalRefresh = () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.public.notices() });
    };
    window.addEventListener('amanah:refresh', handleGlobalRefresh);
    return () => {
      window.removeEventListener('amanah:refresh', handleGlobalRefresh);
    };
  }, [isActiveMember, queryClient]);

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
      setFormError(t('titleLengthError'));
      return;
    }
    if (cleanBody.length < 3 || cleanBody.length > 2000) {
      setFormError(t('bodyLengthError'));
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
        queryClient.setQueryData<{ notices: CoopNotice[] }>(queryKeys.public.notices(), (prev) => ({
          notices: (prev?.notices || [])
            .map((item) => (item.id === res.notice.id ? res.notice : item))
            .sort((a, b) => {
              const pinDiff = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
              return pinDiff !== 0 ? pinDiff : b.createdAt.localeCompare(a.createdAt);
            }),
        }));
      } else {
        const res = await api.createNotice({
          title: cleanTitle,
          body: cleanBody,
          priority,
          pinned,
        });
        queryClient.setQueryData<{ notices: CoopNotice[] }>(queryKeys.public.notices(), (prev) => ({
          notices: [res.notice, ...(prev?.notices || [])].sort((a, b) => {
            const pinDiff = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
            return pinDiff !== 0 ? pinDiff : b.createdAt.localeCompare(a.createdAt);
          }),
        }));
      }
      setActionError(null);
      setComposerOpen(false);
      setEditingNotice(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('saveFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleTogglePin(notice: CoopNotice) {
    if (!canManage || busyId) return;
    setBusyId(notice.id);
    setActionError(null);
    try {
      const res = await api.updateNotice(notice.id, { pinned: !notice.pinned });
      queryClient.setQueryData<{ notices: CoopNotice[] }>(queryKeys.public.notices(), (prev) => ({
        notices: (prev?.notices || [])
          .map((item) => (item.id === res.notice.id ? res.notice : item))
          .sort((a, b) => {
            const pinDiff = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
            return pinDiff !== 0 ? pinDiff : b.createdAt.localeCompare(a.createdAt);
          }),
      }));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('pinUpdateFailed'));
    } finally {
      setBusyId(null);
    }
  }

  async function handleConfirmDelete() {
    if (!canManage || !deleteTarget) return;
    const targetId = deleteTarget.id;
    setBusyId(targetId);
    setActionError(null);
    try {
      await api.deleteNotice(targetId);
      queryClient.setQueryData<{ notices: CoopNotice[] }>(queryKeys.public.notices(), (prev) => ({
        notices: (prev?.notices || []).filter((item) => item.id !== targetId),
      }));
      setDeleteTarget(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('deleteFailed'));
    } finally {
      setBusyId(null);
    }
  }

  if (!isActiveMember) {
    return null;
  }

  const getPriorityBadgeLabel = (p: NoticePriority) => {
    if (p === 'urgent') return t('priorityUrgent');
    if (p === 'important') return t('priorityImportant');
    return t('priorityNotice');
  };

  const getPriorityButtonLabel = (level: NoticePriority) => {
    if (level === 'urgent') return t('priorityUrgent');
    if (level === 'important') return t('priorityImportant');
    return t('priorityNormal');
  };

  return (
    <section
      id="notice-board"
      className={
        embedded
          ? 'scroll-mt-4 bg-white/88 dark:bg-slate-900/82 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800/80 ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-2xl p-6 sm:p-8 shadow-[0_6px_28px_-14px_rgba(15,23,42,0.09)] dark:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.45)] text-slate-900 dark:text-slate-100 space-y-5'
          : 'scroll-mt-4 border-t border-slate-200/70 dark:border-slate-800/80 text-slate-900 dark:text-slate-100'
      }
    >
      <div className={embedded ? 'space-y-5' : 'w-full py-10 sm:py-12 space-y-6'}>
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
          <div className="space-y-1">
            <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              {t('eyebrow')}
            </div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              {t('heading')}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div
              className="inline-flex items-center rounded-xl border border-slate-200/85 dark:border-slate-800 bg-slate-100/80 dark:bg-slate-950/75 p-1"
              role="tablist"
              aria-label={t('filterAria')}
            >
              {(
                [
                  { id: 'all', label: t('tabAll', { count: notices.length }) },
                  { id: 'pinned', label: t('tabPinned') },
                  { id: 'urgent', label: t('tabUrgent') },
                  { id: 'important', label: t('tabImportant') },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={filter === tab.id}
                  onClick={() => setFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
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
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-600 hover:from-emerald-500 hover:via-teal-500 hover:to-emerald-500 text-white text-xs font-semibold shadow-sm shadow-emerald-600/20 transition-all duration-200 active:scale-[0.98] whitespace-nowrap cursor-pointer"
              >
                {composerOpen ? (
                  <>
                    <X className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{t('closeEditor')}</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{t('postNotice')}</span>
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
              <span>{tCommon('retry')}</span>
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
                  {editingNotice ? t('editTitle') : t('publishTitle')}
                </h3>
                <button
                  type="button"
                  onClick={closeComposer}
                  disabled={submitting}
                  aria-label={t('closeFormAria')}
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
                    {t('labelTitle')}
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
                    placeholder={t('titlePlaceholder')}
                    className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-500"
                  />
                </div>

                <div className="md:col-span-5 space-y-1.5">
                  <span className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    {t('labelPriority')}
                  </span>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['normal', 'important', 'urgent'] as const).map((level) => (
                      <button
                        key={level}
                        type="button"
                        disabled={submitting}
                        onClick={() => setPriority(level)}
                        className={`py-2.5 px-2 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                          priority === level
                            ? level === 'urgent'
                              ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300'
                              : level === 'important'
                                ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300'
                                : 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        {getPriorityButtonLabel(level)}
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
                    {t('labelMessage')}
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
                  placeholder={t('messagePlaceholder')}
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
                  <span>{t('pinToTop')}</span>
                </label>

                <div className="flex flex-wrap items-center gap-2.5 self-end sm:self-auto">
                  <button
                    type="button"
                    disabled={submitting || rewritingNotice}
                    onClick={async () => {
                      if (!title.trim() && !body.trim()) {
                        setFormError(t('aiEmptyError'));
                        return;
                      }
                      setRewritingNotice(true);
                      setFormError(null);
                      try {
                        const res = await api.rewriteWithAi({
                          context: 'notice',
                          title: title.trim() ? title : undefined,
                          text: body.trim() || title.trim(),
                          tone: 'formal',
                        });
                        if (res.result.rewrittenTitle && title.trim()) {
                          setTitle(res.result.rewrittenTitle.slice(0, 160));
                        }
                        if (body.trim() && res.result.rewrittenText) {
                          setBody(res.result.rewrittenText.slice(0, 2000));
                        }
                      } catch (err) {
                        setFormError(err instanceof Error ? err.message : t('aiFailed'));
                      } finally {
                        setRewritingNotice(false);
                      }
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-indigo-200 dark:border-indigo-800/70 bg-indigo-50/50 dark:bg-indigo-950/25 hover:bg-indigo-100/60 dark:hover:bg-indigo-900/40 text-xs font-medium text-indigo-700 dark:text-indigo-300 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{rewritingNotice ? t('rewriting') : t('aiRewrite')}</span>
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={closeComposer}
                    className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {tCommon('cancel')}
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-700 via-emerald-600 to-emerald-500 hover:from-emerald-800 hover:via-emerald-700 hover:to-emerald-600 text-white text-xs font-medium shadow-xs hover:shadow-md transition-all duration-200 cursor-pointer disabled:opacity-50"
                  >
                    {submitting
                      ? tCommon('saving')
                      : editingNotice
                        ? tCommon('saveChanges')
                        : t('publishBtn')}
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
              {notices.length === 0 ? t('emptyAll') : t('emptyFiltered')}
            </p>
            {canManage && notices.length === 0 && !composerOpen && (
              <button
                type="button"
                onClick={openCreateComposer}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 text-xs font-medium hover:bg-emerald-100/70 dark:hover:bg-emerald-950/60 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{t('postFirst')}</span>
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {filteredNotices.map((notice, idx) => {
              const meta = PRIORITY_STYLE_META[notice.priority] || PRIORITY_STYLE_META.normal;
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
                  className={`border ring-1 ring-inset ring-white/70 dark:ring-white/5 rounded-2xl p-4 sm:p-5 transition-all duration-200 flex flex-col justify-between gap-3 ${meta.cardClass}`}
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div
                          className={`w-9 h-9 rounded-xl border shadow-2xs flex items-center justify-center shrink-0 ${meta.iconBox}`}
                        >
                          <PriorityIcon className="w-4 h-4" aria-hidden="true" />
                        </div>
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                            {notice.pinned && (
                              <>
                                <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400">
                                  <Pin className="w-3 h-3" aria-hidden="true" />
                                  {t('pinnedBadge')}
                                </span>
                                <span aria-hidden="true">·</span>
                              </>
                            )}
                            <span className={`font-semibold ${meta.labelClass}`}>
                              {getPriorityBadgeLabel(notice.priority)}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>
                              {notice.authorName} ({translateRoleLabel(notice.authorRole, locale)})
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{formatNoticeDate(notice.createdAt, locale)}</span>
                            {isEdited && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="italic">{t('editedBadge')}</span>
                              </>
                            )}
                          </div>
                          <h3 className="text-base font-semibold text-slate-900 dark:text-white leading-snug break-words flex items-center gap-2">
                            {unreadNoticeIds.has(notice.id) && (
                              <NotificationBlinkMarker
                                variant="red"
                                size="sm"
                                label="Unread notice board alert"
                              />
                            )}
                            <span>{notice.title}</span>
                          </h3>
                        </div>
                      </div>

                      {canManage && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            disabled={rowBusy}
                            onClick={() => void handleTogglePin(notice)}
                            title={notice.pinned ? t('unpinTitle') : t('pinTitle')}
                            aria-label={notice.pinned ? t('unpinTitle') : t('pinTitle')}
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
                            title={t('editBtnTitle')}
                            aria-label={t('editBtnTitle')}
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-200 transition-colors cursor-pointer disabled:opacity-50"
                          >
                            <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            disabled={rowBusy}
                            onClick={() => setDeleteTarget(notice)}
                            title={t('deleteBtnTitle')}
                            aria-label={t('deleteBtnTitle')}
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:border-rose-200 dark:hover:border-rose-800 hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer disabled:opacity-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      )}
                    </div>

                    <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line break-words">
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
        title={t('deleteModalTitle')}
        description={t('deleteModalDesc')}
        details={
          deleteTarget
            ? [
                { label: t('detailTitle'), value: deleteTarget.title },
                { label: t('detailPostedBy'), value: deleteTarget.authorName },
              ]
            : undefined
        }
        confirmLabel={t('deleteModalConfirm')}
        busy={Boolean(deleteTarget && busyId === deleteTarget.id)}
        onConfirm={handleConfirmDelete}
        onClose={() => {
          if (!busyId) setDeleteTarget(null);
        }}
      />
    </section>
  );
}
