'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Eye,
  FileText,
  Mail,
  Palette,
  RotateCcw,
  Save,
  Send,
  Sparkles,
} from 'lucide-react';
import type {
  EmailTemplateCollection,
  EmailTemplateFormat,
  EmailTemplateKey,
  FundConfig,
} from '../types/coop.ts';
import { api } from '../utils/api.ts';
import {
  buildSampleTemplateVars,
  darkenHexColor,
  DEFAULT_EMAIL_TEMPLATES,
  EMAIL_HEADER_COLOR_PRESETS,
  EMAIL_TEMPLATE_KEYS,
  EMAIL_TEMPLATE_META,
  interpolateEmailTemplate,
  resolveEmailTemplate,
  sanitizeEmailHeaderColor,
} from '../utils/emailTemplates.ts';
import { ActionModal, type ActionModalDetailItem } from './ActionModal.tsx';

interface AdminEmailTemplatesEditorProps {
  config: FundConfig | null;
  adminEmail: string;
  onRefresh: () => Promise<void>;
}

type EditableFieldKey = 'subject' | 'greeting' | 'introBody' | 'footerNote';

type TemplateModalState =
  | {
      mode: 'confirm';
      tone: 'emerald' | 'red';
      title: string;
      description: string;
      details?: ActionModalDetailItem[];
      confirmLabel: string;
      inputLabel?: string;
      inputPlaceholder?: string;
      inputRequired?: boolean;
      initialInputValue?: string;
      run: (inputValue: string) => Promise<void>;
    }
  | {
      mode: 'notice';
      tone: 'emerald' | 'amber' | 'red';
      title: string;
      description: string;
      details?: ActionModalDetailItem[];
    };

function buildDraftMapFromConfig(
  overrides?: EmailTemplateCollection
): Record<EmailTemplateKey, EmailTemplateFormat> {
  const map = {} as Record<EmailTemplateKey, EmailTemplateFormat>;
  for (const key of EMAIL_TEMPLATE_KEYS) {
    map[key] = resolveEmailTemplate(key, overrides);
  }
  return map;
}

function areFormatsEqual(a: EmailTemplateFormat, b: EmailTemplateFormat): boolean {
  return (
    a.subject.trim() === b.subject.trim() &&
    a.greeting.trim() === b.greeting.trim() &&
    a.introBody.trim() === b.introBody.trim() &&
    a.footerNote.trim() === b.footerNote.trim() &&
    sanitizeEmailHeaderColor(a.headerColor) === sanitizeEmailHeaderColor(b.headerColor)
  );
}

export function AdminEmailTemplatesEditor({
  config,
  adminEmail,
  onRefresh,
}: AdminEmailTemplatesEditorProps) {
  const [activeKey, setActiveKey] = useState<EmailTemplateKey>('transactionSummary');
  const [draftMap, setDraftMap] = useState<Record<EmailTemplateKey, EmailTemplateFormat>>(() =>
    buildDraftMapFromConfig(config?.emailTemplates)
  );
  const [activeField, setActiveField] = useState<EditableFieldKey>('introBody');
  const [previewMode, setPreviewMode] = useState<'visual' | 'text'>('visual');
  const [modal, setModal] = useState<TemplateModalState | null>(null);
  const [modalBusy, setModalBusy] = useState(false);

  const subjectRef = useRef<HTMLInputElement | null>(null);
  const greetingRef = useRef<HTMLInputElement | null>(null);
  const introRef = useRef<HTMLTextAreaElement | null>(null);
  const footerRef = useRef<HTMLTextAreaElement | null>(null);

  const savedConfigSignature = useMemo(
    () => JSON.stringify(config?.emailTemplates || {}),
    [config?.emailTemplates]
  );

  useEffect(() => {
    setDraftMap(buildDraftMapFromConfig(config?.emailTemplates));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedConfigSignature]);

  const savedMap = useMemo(
    () => buildDraftMapFromConfig(config?.emailTemplates),
    [config?.emailTemplates]
  );

  const activeDraft = draftMap[activeKey];
  const activeMeta = EMAIL_TEMPLATE_META[activeKey];
  const activeDefault = DEFAULT_EMAIL_TEMPLATES[activeKey];
  const activeIsCustomized = !areFormatsEqual(activeDraft, activeDefault);
  const activeHasUnsaved = !areFormatsEqual(activeDraft, savedMap[activeKey]);
  const anyUnsavedChanges = EMAIL_TEMPLATE_KEYS.some(
    (k) => !areFormatsEqual(draftMap[k], savedMap[k])
  );

  const fundName = config?.fundName || 'Amanah Cooperative Treasury';
  const currency = config?.currency || 'BDT';

  const previewSampleVars = useMemo(
    () => buildSampleTemplateVars(activeKey, fundName, currency),
    [activeKey, fundName, currency]
  );

  const previewRendered = useMemo(
    () => interpolateEmailTemplate(activeDraft, previewSampleVars),
    [activeDraft, previewSampleVars]
  );

  const headerTop = sanitizeEmailHeaderColor(previewRendered.headerColor, activeDefault.headerColor);
  const headerBottom = darkenHexColor(headerTop);

  const updateActiveField = (field: EditableFieldKey | 'headerColor', value: string) => {
    setDraftMap((prev) => ({
      ...prev,
      [activeKey]: {
        ...prev[activeKey],
        [field]: value,
      },
    }));
  };

  const insertToken = (token: string) => {
    const refMap: Record<
      EditableFieldKey,
      HTMLInputElement | HTMLTextAreaElement | null
    > = {
      subject: subjectRef.current,
      greeting: greetingRef.current,
      introBody: introRef.current,
      footerNote: footerRef.current,
    };
    const el = refMap[activeField];
    const currentValue = activeDraft[activeField] || '';

    if (el && typeof el.selectionStart === 'number' && typeof el.selectionEnd === 'number') {
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const nextValue =
        currentValue.slice(0, start) + token + currentValue.slice(end);
      updateActiveField(activeField, nextValue);
      requestAnimationFrame(() => {
        el.focus();
        const cursor = start + token.length;
        el.setSelectionRange(cursor, cursor);
      });
    } else {
      const sep = currentValue && !currentValue.endsWith(' ') ? ' ' : '';
      updateActiveField(activeField, `${currentValue}${sep}${token}`);
    }
  };

  const buildPayloadFromDraftMap = (
    targetMap: Record<EmailTemplateKey, EmailTemplateFormat>
  ): Record<EmailTemplateKey, Partial<EmailTemplateFormat> | null> => {
    const payload = {} as Record<EmailTemplateKey, Partial<EmailTemplateFormat> | null>;
    for (const key of EMAIL_TEMPLATE_KEYS) {
      const draft = targetMap[key];
      const def = DEFAULT_EMAIL_TEMPLATES[key];
      if (areFormatsEqual(draft, def)) {
        payload[key] = null;
      } else {
        payload[key] = {
          subject: draft.subject.trim(),
          greeting: draft.greeting.trim(),
          introBody: draft.introBody.trim(),
          footerNote: draft.footerNote.trim(),
          headerColor: sanitizeEmailHeaderColor(draft.headerColor, def.headerColor),
        };
      }
    }
    return payload;
  };

  const confirmSaveFormats = () => {
    const dirtyCount = EMAIL_TEMPLATE_KEYS.filter(
      (k) => !areFormatsEqual(draftMap[k], savedMap[k])
    ).length;

    setModal({
      mode: 'confirm',
      tone: 'emerald',
      title: 'Save Nodemailer Email Formats?',
      description:
        'Updated subject lines, greetings, body messages, footer notes, and banner colors will immediately apply to automated cooperative emails.',
      details: [
        { label: 'Active Format', value: activeMeta.label },
        {
          label: 'Modified Templates',
          value: `${dirtyCount || 1} template${dirtyCount === 1 ? '' : 's'}`,
        },
        { label: 'Header Accent', value: headerTop.toUpperCase() },
      ],
      confirmLabel: 'Save Email Formats',
      run: async () => {
        await api.updateConfig({
          emailTemplates: buildPayloadFromDraftMap(draftMap),
        });
        await onRefresh();
        setModal({
          mode: 'notice',
          tone: 'emerald',
          title: 'Email Formats Saved',
          description:
            'Your customized Nodemailer formats have been saved and activated for all future cooperative dispatches.',
          details: [
            { label: 'Template', value: activeMeta.label },
            { label: 'Subject Format', value: activeDraft.subject },
          ],
        });
      },
    });
  };

  const confirmResetActiveFormat = () => {
    setModal({
      mode: 'confirm',
      tone: 'red',
      title: `Reset "${activeMeta.shortLabel}" Format to Default?`,
      description:
        'This restores the default Nodemailer subject, greeting, body text, footer note, and accent color for this email type.',
      details: [
        { label: 'Template', value: activeMeta.label },
        { label: 'Default Color', value: activeDefault.headerColor.toUpperCase() },
      ],
      confirmLabel: 'Reset to Default',
      run: async () => {
        const nextMap: Record<EmailTemplateKey, EmailTemplateFormat> = {
          ...draftMap,
          [activeKey]: { ...activeDefault },
        };
        setDraftMap(nextMap);
        await api.updateConfig({
          emailTemplates: {
            [activeKey]: null,
          },
        });
        await onRefresh();
        setModal({
          mode: 'notice',
          tone: 'emerald',
          title: 'Format Restored to Default',
          description: `"${activeMeta.label}" has been reset to its default cooperative email format.`,
        });
      },
    });
  };

  const confirmSendTestEmail = () => {
    setModal({
      mode: 'confirm',
      tone: 'emerald',
      title: `Send Test "${activeMeta.shortLabel}" Email`,
      description:
        'Dispatches a [TEST] email using your current draft format (even before saving) with realistic sample cooperative values.',
      details: [
        { label: 'Template', value: activeMeta.label },
        { label: 'Default Recipient', value: adminEmail || 'Admin Email' },
      ],
      confirmLabel: 'Send Test Email',
      inputLabel: 'Recipient Email Address (leave blank to use your admin email)',
      inputPlaceholder: adminEmail || 'admin@cooperative.org',
      inputRequired: false,
      run: async (inputValue) => {
        const targetEmail = inputValue.trim() || adminEmail;
        const result = await api.sendTestTemplateEmail({
          templateKey: activeKey,
          template: activeDraft,
          recipientEmail: targetEmail,
        });

        if (result.sent) {
          setModal({
            mode: 'notice',
            tone: 'emerald',
            title: 'Test Email Dispatched',
            description: `Sample "${activeMeta.label}" email was sent via Nodemailer SMTP.`,
            details: [
              { label: 'Recipient', value: result.recipientEmail },
              { label: 'Subject', value: result.subject },
            ],
          });
        } else {
          setModal({
            mode: 'notice',
            tone: 'amber',
            title: 'Test Email Not Sent',
            description: result.smtpConfigured
              ? `SMTP attempted delivery to ${result.recipientEmail} but returned an error.`
              : 'SMTP environment variables (SMTP_HOST, SMTP_USER, SMTP_PASS) are not configured yet.',
            details: [
              { label: 'Recipient', value: result.recipientEmail },
              { label: 'Reason', value: result.reason || 'SMTP_NOT_CONFIGURED' },
            ],
          });
        }
      },
    });
  };

  const runConfirmedModal = async (inputValue: string) => {
    if (!modal || modal.mode !== 'confirm') return;
    setModalBusy(true);
    try {
      await modal.run(inputValue);
    } catch (err) {
      setModal({
        mode: 'notice',
        tone: 'red',
        title: 'Action Could Not Be Completed',
        description: err instanceof Error ? err.message : 'Unexpected email template error.',
      });
    } finally {
      setModalBusy(false);
    }
  };

  const previewHeading = useMemo(() => {
    switch (activeKey) {
      case 'transactionSummary':
        return previewSampleVars.eventTitle;
      case 'registrationApproved':
        return 'Membership Approved — Welcome';
      case 'registrationPendingAdmin':
        return 'New Registration Pending Approval';
      case 'tempPassword':
        return 'Temporary Password Issued';
      case 'passwordResetAdminAlert':
        return 'Password Reset Request Received';
      case 'monthlyPdfSummary':
        return `Monthly Fund Summary · ${previewSampleVars.monthKey}`;
    }
  }, [activeKey, previewSampleVars]);

  const plainTextPreview = useMemo(() => {
    return [
      `Subject: ${previewRendered.subject}`,
      '',
      previewRendered.greeting,
      '',
      previewRendered.introBody,
      '',
      ...(previewRendered.footerNote ? [previewRendered.footerNote, ''] : []),
      `Cooperative Fund: ${fundName}`,
    ].join('\n');
  }, [previewRendered, fundName]);

  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-5 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-teal-700 dark:text-teal-400">
            <Mail className="w-4 h-4" aria-hidden="true" />
            <span>Automated SMTP Communications · Admin Only</span>
          </div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-white mt-0.5">
            Nodemailer Email Format Editor
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
            Customize the subject line, greeting, body message, footer note, and header accent color
            for all six cooperative Nodemailer alerts and receipts.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {activeIsCustomized && (
            <button
              type="button"
              disabled={modalBusy}
              onClick={confirmResetActiveFormat}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 dark:hover:bg-rose-950/30 dark:hover:text-rose-300 text-xs font-medium text-slate-700 dark:text-slate-300 inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Reset Format</span>
            </button>
          )}
          <button
            type="button"
            disabled={modalBusy}
            onClick={confirmSendTestEmail}
            className="px-3 py-2 rounded-lg border border-teal-200 dark:border-teal-800 bg-teal-50/70 dark:bg-teal-950/30 hover:bg-teal-100 dark:hover:bg-teal-900/40 text-xs font-medium text-teal-800 dark:text-teal-300 inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Send Test Email</span>
          </button>
          <button
            type="button"
            disabled={modalBusy || !anyUnsavedChanges}
            onClick={confirmSaveFormats}
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-medium inline-flex items-center gap-1.5 shadow-xs hover:shadow-sm transition-all cursor-pointer disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{anyUnsavedChanges ? 'Save Email Formats' : 'Saved'}</span>
          </button>
        </div>
      </div>

      {/* Template selector buttons */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {EMAIL_TEMPLATE_KEYS.map((key) => {
          const meta = EMAIL_TEMPLATE_META[key];
          const isSelected = key === activeKey;
          const isDirty = !areFormatsEqual(draftMap[key], savedMap[key]);
          const isCustomized = !areFormatsEqual(draftMap[key], DEFAULT_EMAIL_TEMPLATES[key]);

          return (
            <button
              key={key}
              type="button"
              onClick={() => setActiveKey(key)}
              className={`text-left px-3 py-2.5 rounded-lg border transition-all cursor-pointer ${
                isSelected
                  ? 'border-emerald-500 bg-emerald-50/80 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200 shadow-xs'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-semibold truncate">{meta.shortLabel}</span>
                {isDirty ? (
                  <span
                    title="Unsaved draft edits"
                    className="w-2 h-2 rounded-full bg-amber-500 shrink-0"
                  />
                ) : isCustomized ? (
                  <CheckCircle2
                    className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0"
                    aria-hidden="true"
                  />
                ) : null}
              </div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                {meta.audience}
              </div>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 pt-1">
        {/* Left column: Editor form & placeholder tokens */}
        <div className="xl:col-span-6 space-y-4">
          <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold text-slate-900 dark:text-white">
                {activeMeta.label}
              </div>
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300 border border-teal-200/70 dark:border-teal-800/70">
                {activeHasUnsaved
                  ? 'Unsaved Changes'
                  : activeIsCustomized
                  ? 'Custom Format Active'
                  : 'Default Format'}
              </span>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-400">
              {activeMeta.description}
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <label
                htmlFor="email-tpl-subject"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                Subject Line
              </label>
              <input
                ref={subjectRef}
                id="email-tpl-subject"
                type="text"
                maxLength={220}
                value={activeDraft.subject}
                onFocus={() => setActiveField('subject')}
                onChange={(e) => updateActiveField('subject', e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              />
            </div>

            <div>
              <label
                htmlFor="email-tpl-greeting"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                Greeting Line
              </label>
              <input
                ref={greetingRef}
                id="email-tpl-greeting"
                type="text"
                maxLength={220}
                value={activeDraft.greeting}
                onFocus={() => setActiveField('greeting')}
                onChange={(e) => updateActiveField('greeting', e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              />
            </div>

            <div>
              <label
                htmlFor="email-tpl-intro"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                Main Message Body
              </label>
              <textarea
                ref={introRef}
                id="email-tpl-intro"
                rows={3}
                maxLength={2000}
                value={activeDraft.introBody}
                onFocus={() => setActiveField('introBody')}
                onChange={(e) => updateActiveField('introBody', e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              />
            </div>

            <div>
              <label
                htmlFor="email-tpl-footer"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                Footer Note
              </label>
              <textarea
                ref={footerRef}
                id="email-tpl-footer"
                rows={2}
                maxLength={1000}
                value={activeDraft.footerNote}
                onFocus={() => setActiveField('footerNote')}
                onChange={(e) => updateActiveField('footerNote', e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              />
            </div>

            {/* Banner Accent Color */}
            <div className="pt-1">
              <div className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                <Palette className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" aria-hidden="true" />
                <span>Email Header Accent Color</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {EMAIL_HEADER_COLOR_PRESETS.map((preset) => {
                  const selected =
                    sanitizeEmailHeaderColor(activeDraft.headerColor) === preset.hex;
                  return (
                    <button
                      key={preset.hex}
                      type="button"
                      onClick={() => updateActiveField('headerColor', preset.hex)}
                      title={`${preset.label} (${preset.hex})`}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition-all cursor-pointer ${
                        selected
                          ? 'border-slate-900 dark:border-white bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                      }`}
                    >
                      <span
                        className="w-3 h-3 rounded-sm border border-black/10"
                        style={{ backgroundColor: preset.hex }}
                      />
                      <span>{preset.label}</span>
                    </button>
                  );
                })}
                <label className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-[11px] font-mono text-slate-600 dark:text-slate-300 cursor-pointer">
                  <input
                    type="color"
                    aria-label="Custom header accent color"
                    value={sanitizeEmailHeaderColor(activeDraft.headerColor)}
                    onChange={(e) => updateActiveField('headerColor', e.target.value)}
                    className="w-5 h-5 border-0 bg-transparent p-0 cursor-pointer"
                  />
                  <span>{sanitizeEmailHeaderColor(activeDraft.headerColor).toUpperCase()}</span>
                </label>
              </div>
            </div>

            {/* Dynamic variable chips */}
            <div className="pt-1">
              <div className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                <span>Insert Dynamic Placeholder (targets active field)</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {activeMeta.variables.map((variable) => (
                  <button
                    key={variable.key}
                    type="button"
                    title={`${variable.description} (e.g. ${variable.sample})`}
                    onClick={() => insertToken(variable.token)}
                    className="px-2 py-1 rounded-md border border-emerald-200 dark:border-emerald-800/80 bg-emerald-50/70 dark:bg-emerald-950/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-[11px] font-mono text-emerald-800 dark:text-emerald-300 transition-colors cursor-pointer"
                  >
                    {variable.token}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right column: Live rendered email preview */}
        <div className="xl:col-span-6 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
              <Eye className="w-4 h-4 text-teal-600 dark:text-teal-400" aria-hidden="true" />
              <span>Live Sample Email Preview</span>
            </div>
            <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-100 dark:bg-slate-950">
              <button
                type="button"
                onClick={() => setPreviewMode('visual')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium cursor-pointer transition-colors ${
                  previewMode === 'visual'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                HTML View
              </button>
              <button
                type="button"
                onClick={() => setPreviewMode('text')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium inline-flex items-center gap-1 cursor-pointer transition-colors ${
                  previewMode === 'text'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <FileText className="w-3 h-3" aria-hidden="true" />
                <span>Plain Text</span>
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100/80 dark:bg-slate-950 p-3 sm:p-4">
            <div className="mb-3 px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs">
              <span className="font-semibold text-slate-500 dark:text-slate-400 mr-1.5">
                Subject:
              </span>
              <span className="font-medium text-slate-900 dark:text-white break-words">
                {previewRendered.subject}
              </span>
            </div>

            {previewMode === 'text' ? (
              <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 overflow-x-auto">
                {plainTextPreview}
              </pre>
            ) : (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs text-slate-800">
                <div
                  className="px-5 py-4 text-white"
                  style={{
                    background: `linear-gradient(135deg, ${headerTop}, ${headerBottom})`,
                  }}
                >
                  <div className="text-[10px] uppercase tracking-wider opacity-90">
                    {fundName}
                  </div>
                  <div className="text-base font-bold mt-1">{previewHeading}</div>
                </div>

                <div className="p-5 space-y-3 text-xs leading-relaxed">
                  <div className="font-semibold text-slate-900 whitespace-pre-line">
                    {previewRendered.greeting}
                  </div>
                  <p className="text-slate-700 whitespace-pre-line">{previewRendered.introBody}</p>

                  {activeKey === 'transactionSummary' && (
                    <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50 text-[11px]">
                      <div className="flex justify-between px-3 py-2 border-b border-slate-200">
                        <span className="text-slate-500">Transaction Type</span>
                        <span className="font-mono font-semibold text-slate-900">
                          {previewSampleVars.transactionType}
                        </span>
                      </div>
                      <div className="flex justify-between px-3 py-2 border-b border-slate-200">
                        <span className="text-slate-500">Reference ID</span>
                        <span className="font-mono font-semibold text-slate-900">
                          {previewSampleVars.referenceId}
                        </span>
                      </div>
                      <div className="flex justify-between px-3 py-2 border-b border-slate-200">
                        <span className="text-slate-500">Amount</span>
                        <span className="font-mono font-semibold text-slate-900">
                          {previewSampleVars.amount}
                        </span>
                      </div>
                      <div className="flex justify-between px-3 py-2">
                        <span className="text-slate-500">Status</span>
                        <span className="font-mono font-semibold text-slate-900">
                          {previewSampleVars.statusLabel}
                        </span>
                      </div>
                    </div>
                  )}

                  {activeKey === 'registrationApproved' && (
                    <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3">
                      <div className="text-[10px] uppercase tracking-wider text-emerald-800">
                        Assigned Member Code
                      </div>
                      <div className="text-base font-mono font-bold text-emerald-950 mt-0.5">
                        {previewSampleVars.memberCode}
                      </div>
                    </div>
                  )}

                  {activeKey === 'tempPassword' && (
                    <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3">
                      <div className="text-[10px] uppercase tracking-wider text-emerald-800">
                        Temporary Password
                      </div>
                      <div className="text-base font-mono font-bold text-emerald-950 mt-0.5">
                        {previewSampleVars.tempPassword}
                      </div>
                    </div>
                  )}

                  {activeKey === 'registrationPendingAdmin' && (
                    <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50 text-[11px]">
                      <div className="flex justify-between px-3 py-2 border-b border-slate-200">
                        <span className="text-slate-500">Email</span>
                        <span className="font-semibold text-slate-900">
                          {previewSampleVars.applicantEmail}
                        </span>
                      </div>
                      <div className="flex justify-between px-3 py-2 border-b border-slate-200">
                        <span className="text-slate-500">Mobile</span>
                        <span className="font-mono font-semibold text-slate-900">
                          {previewSampleVars.mobile}
                        </span>
                      </div>
                      <div className="flex justify-between px-3 py-2">
                        <span className="text-slate-500">Reference</span>
                        <span className="font-semibold text-slate-900">
                          {previewSampleVars.referenceMemberName}
                        </span>
                      </div>
                    </div>
                  )}

                  {activeKey === 'passwordResetAdminAlert' && (
                    <div
                      className="bg-slate-50 px-3 py-2 text-[11px] text-slate-700"
                      style={{ borderLeft: `3px solid ${headerTop}` }}
                    >
                      Note: {previewSampleVars.reason}
                    </div>
                  )}

                  {activeKey === 'monthlyPdfSummary' && (
                    <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50 text-[11px]">
                      <div className="flex justify-between px-3 py-2 border-b border-slate-200">
                        <span className="text-slate-500">Amanah Height</span>
                        <span className="font-mono font-bold text-slate-900">
                          {previewSampleVars.amanahHeight}
                        </span>
                      </div>
                      <div className="flex justify-between px-3 py-2 border-b border-slate-200">
                        <span className="text-slate-500">Current Available Balance</span>
                        <span className="font-mono font-bold text-slate-900">
                          {previewSampleVars.currentBalance}
                        </span>
                      </div>
                      <div className="flex justify-between px-3 py-2 border-b border-slate-200">
                        <span className="text-slate-500">Active Qard Hasan Total</span>
                        <span className="font-mono font-bold text-slate-900">
                          {previewSampleVars.activeLoanTotal}
                        </span>
                      </div>
                      <div className="flex justify-between px-3 py-2">
                        <span className="text-slate-500">
                          Month Collected ({previewSampleVars.monthKey})
                        </span>
                        <span className="font-mono font-bold text-slate-900">
                          {previewSampleVars.monthlyCollected}
                        </span>
                      </div>
                    </div>
                  )}

                  {previewRendered.footerNote && (
                    <p className="text-[11px] text-slate-500 pt-1 whitespace-pre-line">
                      {previewRendered.footerNote}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <ActionModal
        open={Boolean(modal)}
        mode={modal?.mode || 'notice'}
        tone={modal?.tone || 'emerald'}
        title={modal?.title || ''}
        description={modal?.description || ''}
        details={modal?.details}
        confirmLabel={modal?.mode === 'confirm' ? modal.confirmLabel : 'OK, Got It'}
        inputLabel={modal?.mode === 'confirm' ? modal.inputLabel : undefined}
        inputPlaceholder={modal?.mode === 'confirm' ? modal.inputPlaceholder : undefined}
        inputRequired={modal?.mode === 'confirm' ? modal.inputRequired : false}
        busy={modalBusy}
        onConfirm={modal?.mode === 'confirm' ? runConfirmedModal : undefined}
        onClose={() => {
          if (!modalBusy) setModal(null);
        }}
      />
    </section>
  );
}
