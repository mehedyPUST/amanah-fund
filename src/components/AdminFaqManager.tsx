'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  ChevronDown,
  Edit3,
  HelpCircle,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Skeleton from 'react-loading-skeleton';
import type { FaqCategory, FaqItem } from '../types/coop.ts';
import { api } from '../utils/api.ts';
import {
  FAQ_CATEGORIES,
  FAQ_CATEGORY_META,
  sortFaqItems,
  type FaqFilterCategory,
} from '../utils/faqDefaults.ts';
import { formatDateTime } from '../utils/format.ts';
import { ActionModal } from './ActionModal.tsx';

export function AdminFaqManager() {
  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeCategory, setActiveCategory] = useState<FaqFilterCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  // Always keep answers collapsed until the admin clicks to preview an answer.
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({});

  const [composerOpen, setComposerOpen] = useState(false);
  const [editingFaq, setEditingFaq] = useState<FaqItem | null>(null);
  const [categoryInput, setCategoryInput] = useState<FaqCategory>('membership');
  const [articleRefInput, setArticleRefInput] = useState('');
  const [questionInput, setQuestionInput] = useState('');
  const [answerInput, setAnswerInput] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [rewritingFaq, setRewritingFaq] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<FaqItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadFaqs = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const data = await api.getFaqs();
      setFaqs(sortFaqItems(Array.isArray(data.faqs) ? data.faqs : []));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load FAQs.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFaqs(false);
  }, [loadFaqs]);

  useEffect(() => {
    const handleSync = () => {
      void loadFaqs(true);
    };
    window.addEventListener('amanah:faq-updated', handleSync);
    return () => {
      window.removeEventListener('amanah:faq-updated', handleSync);
    };
  }, [loadFaqs]);

  const filteredFaqs = useMemo(() => {
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
    if (submitting) return;

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
    if (!deleteTarget || deleting) return;
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
      setError(err instanceof Error ? err.message : 'Failed to delete FAQ item.');
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="amanah-card-emerald border rounded-2xl p-4 sm:p-5 space-y-4 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/75 dark:border-slate-800">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            <HelpCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Public Knowledge Base · {faqs.length} FAQ Entry(s)</span>
          </div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">
            Manage Frequently Asked Questions
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Add, edit, or delete questions and answers displayed on the Home, About, How It Works, and Charter Rules pages.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={loading}
            onClick={() => void loadFaqs(false)}
            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-950/60 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            onClick={openCreateComposer}
            className="px-3.5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-medium inline-flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Add FAQ</span>
          </button>
        </div>
      </div>

      {/* Add / Edit Composer */}
      <AnimatePresence initial={false}>
        {composerOpen && (
          <motion.form
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            onSubmit={handleSaveFaq}
            className="rounded-xl border border-emerald-200/80 dark:border-emerald-900/60 bg-white/95 dark:bg-slate-950/80 p-4 space-y-3.5 shadow-xs"
          >
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                {editingFaq ? 'Edit FAQ Entry' : 'Create New FAQ Entry'}
              </h4>
              <button
                type="button"
                onClick={closeComposer}
                disabled={submitting}
                aria-label="Close FAQ composer"
                className="p-1 rounded-lg text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 cursor-pointer"
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
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Topic Category
                </label>
                <select
                  value={categoryInput}
                  onChange={(e) => setCategoryInput(e.target.value as FaqCategory)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  {FAQ_CATEGORIES.filter((c) => c.key !== 'all').map((cat) => (
                    <option key={cat.key} value={cat.key}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Charter / Policy Reference (Optional)
                </label>
                <input
                  type="text"
                  maxLength={80}
                  value={articleRefInput}
                  onChange={(e) => setArticleRefInput(e.target.value)}
                  placeholder="e.g. Article 10 or Charter Policy"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Question
              </label>
              <input
                type="text"
                required
                maxLength={300}
                value={questionInput}
                onChange={(e) => setQuestionInput(e.target.value)}
                placeholder="Enter the FAQ question..."
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Answer
              </label>
              <textarea
                rows={4}
                required
                maxLength={4000}
                value={answerInput}
                onChange={(e) => setAnswerInput(e.target.value)}
                placeholder="Write a clear, charter-backed answer..."
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 leading-relaxed"
              />
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                disabled={submitting || rewritingFaq}
                onClick={async () => {
                  if (!questionInput.trim() && !answerInput.trim()) {
                    setFormError('Enter a draft question or answer before using AI Polish.');
                    return;
                  }
                  setRewritingFaq(true);
                  setFormError(null);
                  try {
                    const res = await api.rewriteWithAi({
                      context: 'faq',
                      title: questionInput.trim() ? questionInput : undefined,
                      text: answerInput.trim() || questionInput.trim(),
                      tone: 'clear',
                    });
                    if (res.result.rewrittenTitle && questionInput.trim()) {
                      setQuestionInput(res.result.rewrittenTitle.slice(0, 300));
                    }
                    if (answerInput.trim() && res.result.rewrittenText) {
                      setAnswerInput(res.result.rewrittenText.slice(0, 4000));
                    }
                  } catch (err) {
                    setFormError(
                      err instanceof Error ? err.message : 'Unable to polish FAQ with Groq AI.'
                    );
                  } finally {
                    setRewritingFaq(false);
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-200 dark:border-indigo-800/70 bg-indigo-50/50 dark:bg-indigo-950/25 hover:bg-indigo-100/60 dark:hover:bg-indigo-900/40 text-xs font-medium text-indigo-700 dark:text-indigo-300 cursor-pointer disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{rewritingFaq ? 'Polishing...' : 'AI Polish'}</span>
              </button>
              <button
                type="button"
                onClick={closeComposer}
                disabled={submitting}
                className="px-3.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-medium cursor-pointer disabled:opacity-50"
              >
                {submitting ? 'Saving...' : editingFaq ? 'Save FAQ Update' : 'Publish FAQ'}
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-100/80 dark:bg-slate-950/70 self-start">
          {FAQ_CATEGORIES.map((cat) => {
            const active = cat.key === activeCategory;
            return (
              <button
                key={cat.key}
                type="button"
                onClick={() => setActiveCategory(cat.key)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  active
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>

        <div className="relative w-full md:w-64 shrink-0">
          <Search
            className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search FAQs..."
            className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 dark:border-rose-800/70 bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}

      {/* FAQ List */}
      {loading ? (
        <div className="space-y-2.5">
          {Array.from({ length: 4 }).map((_, idx) => (
            <Skeleton key={idx} height={64} borderRadius={12} />
          ))}
        </div>
      ) : filteredFaqs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-950/50 p-6 text-center space-y-2">
          <p className="text-xs text-slate-600 dark:text-slate-400">
            {faqs.length === 0
              ? 'No FAQ entries exist yet.'
              : 'No FAQ entries match the selected filter.'}
          </p>
          <button
            type="button"
            onClick={openCreateComposer}
            className="px-3.5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Add FAQ</span>
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredFaqs.map((item, idx) => {
            const isOpen = Boolean(openIds[item.id]);
            const meta = FAQ_CATEGORY_META[item.category] || FAQ_CATEGORY_META.membership;
            return (
              <div
                key={item.id}
                className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white/90 dark:bg-slate-950/70 overflow-hidden"
              >
                <div className="p-3.5 sm:p-4 flex items-start justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setOpenIds((prev) => ({ ...prev, [item.id]: !prev[item.id] }))}
                    aria-expanded={isOpen}
                    className="flex-1 min-w-0 text-left flex items-start justify-between gap-2.5 cursor-pointer"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                        <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                          {String(idx + 1).padStart(2, '0')}.
                        </span>
                        <span className="font-medium text-slate-700 dark:text-slate-300">
                          {meta.label}
                        </span>
                        {item.articleRef && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono">{item.articleRef}</span>
                          </>
                        )}
                        {item.updatedAt && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono">
                              Updated {formatDateTime(item.updatedAt)}
                            </span>
                          </>
                        )}
                      </div>
                      <div className="text-sm font-semibold text-slate-900 dark:text-white leading-snug">
                        {item.question}
                      </div>
                    </div>

                    <ChevronDown
                      className={`w-4 h-4 text-slate-400 shrink-0 mt-1 transition-transform duration-150 ${
                        isOpen ? 'rotate-180 text-emerald-600' : ''
                      }`}
                      aria-hidden="true"
                    />
                  </button>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEditComposer(item)}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-emerald-400 text-xs font-medium text-slate-700 dark:text-slate-200 inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                      <span className="hidden sm:inline">Edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(item)}
                      className="px-2.5 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900/70 bg-rose-50/80 dark:bg-rose-950/30 hover:bg-rose-600 hover:text-white text-xs font-medium text-rose-700 dark:text-rose-400 inline-flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      <span className="hidden sm:inline">Delete</span>
                    </button>
                  </div>
                </div>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.16 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 pt-2.5 border-t border-slate-200/70 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line">
                        {item.answer}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}

      <ActionModal
        open={Boolean(deleteTarget)}
        mode="confirm"
        tone="red"
        title="Delete FAQ Question & Answer"
        description="Removing this FAQ immediately hides it from all public and member information pages."
        details={
          deleteTarget
            ? [
                {
                  label: 'Category',
                  value: (FAQ_CATEGORY_META[deleteTarget.category] || FAQ_CATEGORY_META.membership).label,
                },
                { label: 'Question', value: deleteTarget.question },
              ]
            : undefined
        }
        confirmLabel="Delete FAQ"
        busy={deleting}
        onConfirm={confirmDeleteFaq}
        onClose={() => {
          if (!deleting) setDeleteTarget(null);
        }}
      />
    </section>
  );
}
