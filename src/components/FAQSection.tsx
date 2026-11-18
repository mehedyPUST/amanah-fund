'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  ChevronDown,
  Edit3,
  HelpCircle,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import Skeleton from 'react-loading-skeleton';
import type { FaqCategory, FaqItem } from '../types/coop.ts';
import { api } from '../utils/api.ts';
import {
  createDefaultFaqs,
  FAQ_CARD_HUE_CYCLE,
  FAQ_CATEGORIES,
  FAQ_CATEGORY_META,
  sortFaqItems,
  type FaqFilterCategory,
} from '../utils/faqDefaults.ts';
import { ActionModal } from './ActionModal.tsx';
import { useCoopSession } from './AppProviders.tsx';
import { MotionCard } from './MotionCard.tsx';

export function FAQSection({ embedded = true }: { embedded?: boolean }) {
  const { user, authChecking } = useCoopSession();
  const tFaq = useTranslations('Public.faq');
  const tCommon = useTranslations('Common');
  const tNav = useTranslations('Navigation');
  const isActiveMember = !authChecking && Boolean(user && user.status === 'active');
  const isAdmin = isActiveMember && user?.role === 'admin';

  const getCategoryLabel = useCallback(
    (key: string) => {
      const msgKey = `categories.${key}`;
      if (tFaq.has(msgKey)) {
        return tFaq(msgKey);
      }
      if (key in FAQ_CATEGORY_META) {
        return FAQ_CATEGORY_META[key as FaqCategory].label;
      }
      return key;
    },
    [tFaq]
  );

  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeCategory, setActiveCategory] = useState<FaqFilterCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  // Always start with zero opened answers; questions open only on explicit user action.
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({});

  // Admin add/edit/delete state
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingFaq, setEditingFaq] = useState<FaqItem | null>(null);
  const [categoryInput, setCategoryInput] = useState<FaqCategory>('membership');
  const [articleRefInput, setArticleRefInput] = useState('');
  const [questionInput, setQuestionInput] = useState('');
  const [answerInput, setAnswerInput] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<FaqItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadFaqs = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setLoadError(null);
    try {
      const data = await api.getFaqs();
      setFaqs(sortFaqItems(Array.isArray(data.faqs) ? data.faqs : []));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load FAQs.');
      setFaqs((prev) => (prev.length > 0 ? prev : createDefaultFaqs()));
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFaqs(false);
  }, [loadFaqs]);

  useEffect(() => {
    const handleLocalRefresh = () => {
      void loadFaqs(true);
    };
    window.addEventListener('amanah:faq-updated', handleLocalRefresh);
    window.addEventListener('amanah:refresh', handleLocalRefresh);

    let source: EventSource | null = null;
    if (isActiveMember) {
      source = new EventSource('/api/events', { withCredentials: true });
      source.addEventListener('faq:updated', handleLocalRefresh);
    }

    return () => {
      window.removeEventListener('amanah:faq-updated', handleLocalRefresh);
      window.removeEventListener('amanah:refresh', handleLocalRefresh);
      if (source) {
        source.removeEventListener('faq:updated', handleLocalRefresh);
        source.close();
      }
    };
  }, [isActiveMember, loadFaqs]);

  const faqNumberMap = useMemo(() => {
    const map = new Map<string, string>();
    faqs.forEach((item, index) => {
      map.set(item.id, `${String(index + 1).padStart(2, '0')}.`);
    });
    return map;
  }, [faqs]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return faqs.filter((item) => {
      const meta = FAQ_CATEGORY_META[item.category] || FAQ_CATEGORY_META.membership;
      const matchesCat = activeCategory === 'all' || item.category === activeCategory;
      if (!matchesCat) return false;
      if (!q) return true;
      return (
        item.question.toLowerCase().includes(q) ||
        item.answer.toLowerCase().includes(q) ||
        meta.label.toLowerCase().includes(q) ||
        (item.articleRef || '').toLowerCase().includes(q)
      );
    });
  }, [faqs, activeCategory, searchQuery]);

  const allVisibleExpanded =
    filteredItems.length > 0 && filteredItems.every((item) => Boolean(openIds[item.id]));

  function toggleItem(id: string) {
    setOpenIds((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function toggleExpandAll() {
    if (allVisibleExpanded) {
      setOpenIds((prev) => {
        const next = { ...prev };
        for (const item of filteredItems) next[item.id] = false;
        return next;
      });
    } else {
      setOpenIds((prev) => {
        const next = { ...prev };
        for (const item of filteredItems) next[item.id] = true;
        return next;
      });
    }
  }

  function openCreateComposer() {
    setEditingFaq(null);
    setCategoryInput(activeCategory === 'all' ? 'membership' : activeCategory);
    setArticleRefInput('');
    setQuestionInput('');
    setAnswerInput('');
    setFormError(null);
    setComposerOpen(true);
  }

  function openEditComposer(item: FaqItem) {
    setEditingFaq(item);
    setCategoryInput(item.category);
    setArticleRefInput(item.articleRef || '');
    setQuestionInput(item.question);
    setAnswerInput(item.answer);
    setFormError(null);
    setComposerOpen(true);
  }

  function closeComposer() {
    if (submitting) return;
    setComposerOpen(false);
    setEditingFaq(null);
    setFormError(null);
  }

  async function handleSaveFaq(e: FormEvent) {
    e.preventDefault();
    if (!isAdmin || submitting) return;

    const cleanQuestion = questionInput.trim();
    const cleanAnswer = answerInput.trim();
    const cleanArticleRef = articleRefInput.trim();

    if (cleanQuestion.length < 5 || cleanQuestion.length > 300) {
      setFormError('Question must be between 5 and 300 characters.');
      return;
    }
    if (cleanAnswer.length < 5 || cleanAnswer.length > 4000) {
      setFormError('Answer must be between 5 and 4000 characters.');
      return;
    }
    if (cleanArticleRef.length > 80) {
      setFormError('Charter / policy reference must be 80 characters or fewer.');
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      if (editingFaq) {
        const res = await api.updateFaq(editingFaq.id, {
          category: categoryInput,
          articleRef: cleanArticleRef || 'Charter Policy',
          question: cleanQuestion,
          answer: cleanAnswer,
        });
        setFaqs(sortFaqItems(res.faqs));
      } else {
        const res = await api.createFaq({
          category: categoryInput,
          articleRef: cleanArticleRef || 'Charter Policy',
          question: cleanQuestion,
          answer: cleanAnswer,
        });
        setFaqs(sortFaqItems(res.faqs));
      }
      setComposerOpen(false);
      setEditingFaq(null);
      window.dispatchEvent(new CustomEvent('amanah:faq-updated'));
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to save FAQ entry.');
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmDeleteFaq() {
    if (!isAdmin || !deleteTarget || deleting) return;
    setDeleting(true);
    try {
      const targetId = deleteTarget.id;
      const res = await api.deleteFaq(targetId);
      setFaqs(sortFaqItems(res.faqs));
      setOpenIds((prev) => {
        if (!(targetId in prev)) return prev;
        const next = { ...prev };
        delete next[targetId];
        return next;
      });
      if (editingFaq?.id === targetId) {
        setComposerOpen(false);
        setEditingFaq(null);
      }
      setDeleteTarget(null);
      window.dispatchEvent(new CustomEvent('amanah:faq-updated'));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to delete FAQ item.');
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  const HeadingTag = embedded ? 'h2' : 'h1';

  return (
    <section
      id="faq"
      aria-labelledby="faq-section-heading"
      className={`scroll-mt-4 w-full space-y-6 sm:space-y-7 text-slate-900 dark:text-slate-100 ${
        embedded
          ? 'bg-white/95 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-2xl shadow-xs p-6 sm:p-8'
          : ''
      }`}
    >
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-5 border-b border-slate-200/75 dark:border-slate-800">
        <div className="max-w-2xl space-y-1.5">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
            <HelpCircle className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{tFaq('eyebrow')}</span>
          </div>
          <HeadingTag
            id="faq-section-heading"
            className={
              embedded
                ? 'text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white text-balance'
                : 'text-2xl sm:text-3xl lg:text-4xl font-bold tracking-[-0.02em] text-slate-900 dark:text-white text-balance'
            }
          >
            {tFaq('heading')}
          </HeadingTag>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            {tFaq('subheading')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {isAdmin && (
            <button
              type="button"
              onClick={openCreateComposer}
              className="px-3.5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-medium inline-flex items-center gap-1.5 shadow-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{tFaq('addFaq')}</span>
            </button>
          )}
          <button
            type="button"
            onClick={toggleExpandAll}
            disabled={loading || filteredItems.length === 0}
            className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-950/60 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
          >
            {allVisibleExpanded ? tFaq('collapseAll') : tFaq('expandAll')}
          </button>
        </div>
      </div>

      {/* Admin Add / Edit FAQ Composer */}
      <AnimatePresence initial={false}>
        {isAdmin && composerOpen && (
          <motion.form
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            onSubmit={handleSaveFaq}
            className="amanah-card-emerald border rounded-xl p-4 sm:p-5 space-y-4 shadow-xs"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  {editingFaq ? tFaq('editTitle') : tFaq('addTitle')}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {tFaq('editorDesc')}
                </p>
              </div>
              <button
                type="button"
                onClick={closeComposer}
                disabled={submitting}
                aria-label={tCommon('closeDialog')}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-white/70 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {formError && (
              <div className="rounded-lg border border-rose-200 dark:border-rose-800/70 bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
                {formError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="faq-editor-category"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  {tFaq('topicCategory')}
                </label>
                <select
                  id="faq-editor-category"
                  value={categoryInput}
                  onChange={(e) => setCategoryInput(e.target.value as FaqCategory)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  {FAQ_CATEGORIES.filter((c) => c.key !== 'all').map((cat) => (
                    <option key={cat.key} value={cat.key}>
                      {getCategoryLabel(cat.key)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="faq-editor-ref"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  {tFaq('policyRef')}
                </label>
                <input
                  id="faq-editor-ref"
                  type="text"
                  maxLength={80}
                  value={articleRefInput}
                  onChange={(e) => setArticleRefInput(e.target.value)}
                  placeholder={tFaq('policyRefPlaceholder')}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="faq-editor-question"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                {tFaq('question')}
              </label>
              <input
                id="faq-editor-question"
                type="text"
                required
                maxLength={300}
                value={questionInput}
                onChange={(e) => setQuestionInput(e.target.value)}
                placeholder={tFaq('questionPlaceholder')}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>

            <div>
              <label
                htmlFor="faq-editor-answer"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                {tFaq('answer')}
              </label>
              <textarea
                id="faq-editor-answer"
                rows={4}
                required
                maxLength={4000}
                value={answerInput}
                onChange={(e) => setAnswerInput(e.target.value)}
                placeholder={tFaq('answerPlaceholder')}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 leading-relaxed"
              />
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeComposer}
                disabled={submitting}
                className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                {tCommon('cancel')}
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-medium shadow-xs cursor-pointer disabled:opacity-50"
              >
                {submitting ? tCommon('saving') : editingFaq ? tCommon('saveChanges') : tFaq('publishFaq')}
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Category Filter Tabs & Search */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label={tFaq('topicCategory')}
          className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-100/80 dark:bg-slate-950/70 self-start"
        >
          {FAQ_CATEGORIES.map((cat) => {
            const selected = cat.key === activeCategory;
            return (
              <button
                key={cat.key}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActiveCategory(cat.key)}
                className={`relative px-3 py-1.5 rounded-lg text-xs font-medium transition-colors duration-150 cursor-pointer whitespace-nowrap shrink-0 ${
                  selected
                    ? 'text-slate-900 dark:text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {selected && (
                  <motion.span
                    layoutId="faq-category-tab"
                    transition={{ type: 'spring', stiffness: 450, damping: 34 }}
                    className="absolute inset-0 rounded-lg bg-white dark:bg-slate-800 shadow-xs border border-slate-200/70 dark:border-slate-700/70"
                    aria-hidden="true"
                  />
                )}
                <span className="relative z-10">{getCategoryLabel(cat.key)}</span>
              </button>
            );
          })}
        </div>

        <div className="relative w-full lg:w-72 shrink-0">
          <Search
            className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={tFaq('searchPlaceholder')}
            aria-label={tFaq('searchAria')}
            className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-500"
          />
        </div>
      </div>

      {loadError && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-800/70 bg-amber-50/80 dark:bg-amber-950/30 px-3.5 py-2 text-xs text-amber-800 dark:text-amber-200 flex items-center justify-between gap-2">
          <span>{loadError}</span>
          <button
            type="button"
            onClick={() => void loadFaqs(false)}
            className="underline font-medium cursor-pointer shrink-0"
          >
            {tCommon('retry')}
          </button>
        </div>
      )}

      {/* Accordion Cards Grid */}
      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div
              key={idx}
              className="rounded-xl border border-slate-200/80 dark:border-slate-800 p-5 space-y-2.5"
            >
              <Skeleton width={160} height={12} />
              <Skeleton width="90%" height={18} />
            </div>
          ))}
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="amanah-card-violet border rounded-xl p-8 text-center space-y-3">
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
            {faqs.length === 0 ? tFaq('emptyNone') : tFaq('emptyFiltered')}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {(activeCategory !== 'all' || searchQuery.trim() !== '') && (
              <button
                type="button"
                onClick={() => {
                  setActiveCategory('all');
                  setSearchQuery('');
                }}
                className="px-3.5 py-1.5 rounded-lg border border-violet-300 dark:border-violet-700 bg-white dark:bg-slate-900 text-xs font-medium text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-950/50 transition-colors cursor-pointer whitespace-nowrap"
              >
                {tCommon('resetFilters')}
              </button>
            )}
            {isAdmin && (
              <button
                type="button"
                onClick={openCreateComposer}
                className="px-3.5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{tFaq('addFirstFaq')}</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 items-start">
          {filteredItems.map((item, idx) => {
            const isOpen = Boolean(openIds[item.id]);
            const panelId = `${item.id}-panel`;
            const meta = FAQ_CATEGORY_META[item.category] || FAQ_CATEGORY_META.membership;
            const hue = FAQ_CARD_HUE_CYCLE[idx % FAQ_CARD_HUE_CYCLE.length];
            const itemNumber = faqNumberMap.get(item.id) || `${String(idx + 1).padStart(2, '0')}.`;

            return (
              <MotionCard
                as="article"
                key={item.id}
                hue={hue}
                delay={Math.min(idx * 0.025, 0.16)}
                inView
                className="backdrop-blur-md border rounded-xl shadow-xs hover:shadow-md transition-all duration-200"
              >
                <div className="p-5 flex items-start justify-between gap-2.5">
                  <button
                    type="button"
                    onClick={() => toggleItem(item.id)}
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    className="flex-1 min-w-0 text-left flex items-start justify-between gap-3 cursor-pointer"
                  >
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        <span className="font-mono font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                          {itemNumber}
                        </span>
                        <span className="font-medium text-slate-700 dark:text-slate-300">
                          {getCategoryLabel(item.category)}
                        </span>
                        {item.articleRef && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono">{item.articleRef}</span>
                          </>
                        )}
                      </div>
                      <h3 className="text-sm sm:text-[15px] font-semibold text-slate-900 dark:text-white leading-snug">
                        {item.question}
                      </h3>
                    </div>

                    <span
                      className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                        isOpen
                          ? 'border-emerald-300/80 dark:border-emerald-700/70 bg-emerald-100/75 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                          : 'border-slate-200/80 dark:border-slate-700/80 bg-white/80 dark:bg-slate-900/70 text-slate-500 dark:text-slate-400'
                      }`}
                      aria-hidden="true"
                    >
                      <ChevronDown
                        className={`w-4 h-4 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`}
                      />
                    </span>
                  </button>

                  {isAdmin && (
                    <div className="flex items-center gap-1 shrink-0 mt-0.5">
                      <button
                        type="button"
                        onClick={() => openEditComposer(item)}
                        title="Edit FAQ"
                        aria-label={`Edit FAQ: ${item.question}`}
                        className="w-7 h-7 rounded-lg border border-slate-200/80 dark:border-slate-700/80 bg-white/85 dark:bg-slate-900/80 hover:border-emerald-400 dark:hover:border-emerald-600 text-slate-600 dark:text-slate-300 hover:text-emerald-700 dark:hover:text-emerald-400 flex items-center justify-center transition-colors cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(item)}
                        title="Delete FAQ"
                        aria-label={`Delete FAQ: ${item.question}`}
                        className="w-7 h-7 rounded-lg border border-rose-200/80 dark:border-rose-900/70 bg-rose-50/80 dark:bg-rose-950/40 hover:bg-rose-600 hover:border-rose-600 text-rose-600 dark:text-rose-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  )}
                </div>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      id={panelId}
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.18 }}
                      className="overflow-hidden"
                    >
                      <div className="px-5 pb-5 pt-3 border-t border-slate-200/70 dark:border-slate-800/80">
                        <p className="text-xs sm:text-[13px] text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line text-justify">
                          {item.answer}
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </MotionCard>
            );
          })}
        </div>
      )}

      {/* Footer CTA Row */}
      <div className="pt-4 border-t border-slate-200/75 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-xs text-slate-600 dark:text-slate-400">
          {tFaq('footerNote')}
        </p>
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <Link
            href="/rules"
            className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-950/60 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            {tFaq('readFullCharter')}
          </Link>
          <Link
            href={user ? '/dashboard' : '/signup'}
            className="group px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-medium inline-flex items-center gap-1.5 shadow-xs transition-colors whitespace-nowrap shrink-0"
          >
            <span>{user ? tNav('dashboard') : tNav('joinAmanah')}</span>
            <ArrowRight
              className="w-3.5 h-3.5 transition-transform duration-150 group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </Link>
        </div>
      </div>

      <ActionModal
        open={Boolean(deleteTarget)}
        mode="confirm"
        tone="red"
        title={tFaq('deleteTitle')}
        description={tFaq('deleteDesc')}
        details={
          deleteTarget
            ? [
                {
                  label: tFaq('topicCategory'),
                  value: getCategoryLabel(deleteTarget.category),
                },
                { label: tFaq('question'), value: deleteTarget.question },
              ]
            : undefined
        }
        confirmLabel={tFaq('deleteConfirm')}
        busy={deleting}
        onConfirm={confirmDeleteFaq}
        onClose={() => {
          if (!deleting) setDeleteTarget(null);
        }}
      />
    </section>
  );
}
