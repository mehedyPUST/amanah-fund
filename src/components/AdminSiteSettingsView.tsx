'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import Skeleton from 'react-loading-skeleton';
import {
  Activity,
  AlertTriangle,
  BellRing,
  Briefcase,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  Database,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileArchive,
  FileSpreadsheet,
  FileText,
  HardDrive,
  HelpCircle,
  Languages,
  Lock,
  Mail,
  MailCheck,
  RefreshCw,
  RotateCcw,
  Send,
  Server,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  Vote,
} from 'lucide-react';
import type {
  AdminSystemStatus,
  CharterPdfExtractTranslateResult,
  CharterTargetLanguage,
  DashboardOverview,
  DashboardSectionId,
  FundConfig,
  HalalProject,
  LoanRequest,
  PublicUser,
} from '../types/coop.ts';
import { api } from '../utils/api.ts';
import { formatDateTime, formatShortDate } from '../utils/format.ts';
import type { WorkspaceSessionInfo } from '../utils/googleWorkspace.ts';
import { ActionModal, type ActionModalDetailItem } from './ActionModal.tsx';
import { AdminEmailTemplatesEditor } from './AdminEmailTemplatesEditor.tsx';
import { AdminFaqManager } from './AdminFaqManager.tsx';
import { GoogleSheetSyncCard } from './GoogleSheetSyncCard.tsx';
import { HalalProjectsView } from './HalalProjectsView.tsx';

interface AdminSiteSettingsViewProps {
  overview: DashboardOverview | null;
  config: FundConfig | null;
  user: PublicUser;
  loans?: LoanRequest[];
  projects: HalalProject[];
  loading: boolean;
  workspace: WorkspaceSessionInfo;
  connectingGoogle: boolean;
  onConnectGoogle: () => Promise<void>;
  onDisconnectGoogle: () => Promise<void>;
  onRefresh: () => Promise<void>;
  onNavigateSection?: (section: DashboardSectionId) => void;
}

type SettingsTabId = 'policy' | 'charter' | 'faqs' | 'email' | 'integrations' | 'ventures';

type SettingsModalState =
  | {
      mode: 'confirm';
      tone: 'emerald' | 'amber' | 'red';
      title: string;
      description: string;
      details?: ActionModalDetailItem[];
      confirmLabel: string;
      run: () => Promise<void>;
    }
  | {
      mode: 'notice';
      tone: 'emerald' | 'amber' | 'red';
      title: string;
      description: string;
      details?: ActionModalDetailItem[];
    };

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${Math.max(1, m)}m`;
}

export function AdminSiteSettingsView({
  overview,
  config,
  user,
  projects,
  loading,
  workspace,
  connectingGoogle,
  onConnectGoogle,
  onDisconnectGoogle,
  onRefresh,
  onNavigateSection,
}: AdminSiteSettingsViewProps) {
  const isAdmin = user.role === 'admin';
  const ccy = config?.currency || 'BDT';

  const [activeTab, setActiveTab] = useState<SettingsTabId>('policy');

  // Policy form fields
  const [fundName, setFundName] = useState(
    config?.fundName || 'Amanah — Savings, Investment & Interest-Free Loan Fund'
  );
  const [currency, setCurrency] = useState<FundConfig['currency']>(config?.currency || 'BDT');
  const [maturityDate, setMaturityDate] = useState(config?.maturityDate || '2036-12-31');
  const [membershipIntakeDeadline, setMembershipIntakeDeadline] = useState(
    config?.membershipIntakeDeadline || '2027-07-31'
  );
  const [monthlyContributionAmount, setMonthlyContributionAmount] = useState(
    String(config?.monthlyContributionAmount ?? 5000)
  );
  const [maxLoanAmount, setMaxLoanAmount] = useState(String(config?.maxLoanAmount ?? 50000));
  const [maxLoansPerYear, setMaxLoansPerYear] = useState(String(config?.maxLoansPerYear ?? 3));
  const [maxInstallmentMonths, setMaxInstallmentMonths] = useState(
    String(config?.maxInstallmentMonths ?? 10)
  );
  const [loanSavingsCapPct, setLoanSavingsCapPct] = useState(
    String(config?.loanSavingsCapPct ?? 75)
  );
  const [maxMembersCap, setMaxMembersCap] = useState(String(config?.maxMembersCap ?? 20));
  const [monthlyDueDay, setMonthlyDueDay] = useState(String(config?.monthlyDueDay ?? 10));
  const [lateFeeAmount, setLateFeeAmount] = useState(String(config?.lateFeeAmount ?? 50));
  const [registrationFeeAmount, setRegistrationFeeAmount] = useState(
    String(config?.registrationFeeAmount ?? 200)
  );
  const [guarantorThresholdAmount, setGuarantorThresholdAmount] = useState(
    String(config?.guarantorThresholdAmount ?? 40000)
  );
  const [requiredGuarantorsCount, setRequiredGuarantorsCount] = useState(
    String(config?.requiredGuarantorsCount ?? 1)
  );
  const [voteThresholdNumerator, setVoteThresholdNumerator] = useState(
    String(config?.voteThresholdNumerator ?? 2)
  );
  const [voteThresholdDenominator, setVoteThresholdDenominator] = useState(
    String(config?.voteThresholdDenominator ?? 3)
  );
  const [managerCycleMonths, setManagerCycleMonths] = useState(
    String(config?.managerCycleMonths ?? 3)
  );
  const [managerCycleStartDate, setManagerCycleStartDate] = useState(
    config?.managerCycleStartDate || '2027-01-01'
  );
  const [monthlyReportAutoEmail, setMonthlyReportAutoEmail] = useState<boolean>(
    config?.monthlyReportAutoEmail ?? true
  );
  const [halalThesis, setHalalThesis] = useState(config?.halalInvestmentThesis || '');

  // Charter & Compliance state
  const [constitutionTitle, setConstitutionTitle] = useState('Cooperative Charter 2027-2036');
  const [constitutionBusy, setConstitutionBusy] = useState(false);
  const [showConstitutionPreview, setShowConstitutionPreview] = useState(false);
  const constitutionFileInputRef = useRef<HTMLInputElement>(null);
  const charterExtractInputRef = useRef<HTMLInputElement>(null);
  const [charterTargetLang, setCharterTargetLang] = useState<CharterTargetLanguage>('en');
  const [charterExtractLoading, setCharterExtractLoading] = useState(false);
  const [charterExtractError, setCharterExtractError] = useState<string | null>(null);
  const [charterExtractResult, setCharterExtractResult] =
    useState<CharterPdfExtractTranslateResult | null>(null);
  const [charterExtractView, setCharterExtractView] = useState<'translated' | 'raw'>('translated');
  const [copiedCharterText, setCopiedCharterText] = useState(false);
  const [rewritingThesis, setRewritingThesis] = useState(false);
  const [reportMonth, setReportMonth] = useState(() => new Date().toISOString().slice(0, 7));

  // System Health Diagnostics state
  const [systemStatus, setSystemStatus] = useState<AdminSystemStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);

  const [modal, setModal] = useState<SettingsModalState | null>(null);
  const [modalBusy, setModalBusy] = useState(false);

  const syncFormFromConfig = useCallback((cfg: FundConfig) => {
    setFundName(cfg.fundName || 'Amanah — Savings, Investment & Interest-Free Loan Fund');
    setCurrency(cfg.currency);
    setMaturityDate(cfg.maturityDate);
    setMembershipIntakeDeadline(cfg.membershipIntakeDeadline || '2027-07-31');
    setMonthlyContributionAmount(String(cfg.monthlyContributionAmount));
    setMaxLoanAmount(String(cfg.maxLoanAmount));
    setMaxLoansPerYear(String(cfg.maxLoansPerYear));
    setMaxInstallmentMonths(String(cfg.maxInstallmentMonths));
    setLoanSavingsCapPct(String(cfg.loanSavingsCapPct ?? 75));
    setMaxMembersCap(String(cfg.maxMembersCap ?? 20));
    setMonthlyDueDay(String(cfg.monthlyDueDay ?? 10));
    setLateFeeAmount(String(cfg.lateFeeAmount ?? 50));
    setRegistrationFeeAmount(String(cfg.registrationFeeAmount ?? 200));
    setGuarantorThresholdAmount(String(cfg.guarantorThresholdAmount ?? 40000));
    setRequiredGuarantorsCount(String(cfg.requiredGuarantorsCount ?? 1));
    setVoteThresholdNumerator(String(cfg.voteThresholdNumerator ?? 2));
    setVoteThresholdDenominator(String(cfg.voteThresholdDenominator ?? 3));
    setManagerCycleMonths(String(cfg.managerCycleMonths ?? 3));
    setManagerCycleStartDate(cfg.managerCycleStartDate || '2027-01-01');
    setMonthlyReportAutoEmail(cfg.monthlyReportAutoEmail ?? true);
    setHalalThesis(cfg.halalInvestmentThesis);
  }, []);

  useEffect(() => {
    if (config) {
      syncFormFromConfig(config);
    }
  }, [config, syncFormFromConfig]);

  const fetchSystemStatus = useCallback(async () => {
    if (!isAdmin) return;
    setLoadingStatus(true);
    try {
      const status = await api.getAdminSystemStatus();
      setSystemStatus(status);
    } catch {
      // Keep previous diagnostics snapshot if transient failure occurs
    } finally {
      setLoadingStatus(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    void fetchSystemStatus();
  }, [fetchSystemStatus]);

  const isDirty = useMemo(() => {
    if (!config) return false;
    return (
      fundName.trim() !== (config.fundName || '').trim() ||
      currency !== config.currency ||
      maturityDate !== config.maturityDate ||
      membershipIntakeDeadline !== (config.membershipIntakeDeadline || '2027-07-31') ||
      Number(monthlyContributionAmount) !== config.monthlyContributionAmount ||
      Number(maxLoanAmount) !== config.maxLoanAmount ||
      Number(maxLoansPerYear) !== config.maxLoansPerYear ||
      Number(maxInstallmentMonths) !== config.maxInstallmentMonths ||
      Number(loanSavingsCapPct) !== (config.loanSavingsCapPct ?? 75) ||
      Number(maxMembersCap) !== (config.maxMembersCap ?? 20) ||
      Number(monthlyDueDay) !== (config.monthlyDueDay ?? 10) ||
      Number(lateFeeAmount) !== (config.lateFeeAmount ?? 50) ||
      Number(registrationFeeAmount) !== (config.registrationFeeAmount ?? 200) ||
      Number(guarantorThresholdAmount) !== (config.guarantorThresholdAmount ?? 40000) ||
      Number(requiredGuarantorsCount) !== (config.requiredGuarantorsCount ?? 1) ||
      Number(voteThresholdNumerator) !== (config.voteThresholdNumerator ?? 2) ||
      Number(voteThresholdDenominator) !== (config.voteThresholdDenominator ?? 3) ||
      Number(managerCycleMonths) !== (config.managerCycleMonths ?? 3) ||
      managerCycleStartDate !== (config.managerCycleStartDate || '2027-01-01') ||
      monthlyReportAutoEmail !== (config.monthlyReportAutoEmail ?? true) ||
      halalThesis.trim() !== (config.halalInvestmentThesis || '').trim()
    );
  }, [
    config,
    fundName,
    currency,
    maturityDate,
    membershipIntakeDeadline,
    monthlyContributionAmount,
    maxLoanAmount,
    maxLoansPerYear,
    maxInstallmentMonths,
    loanSavingsCapPct,
    maxMembersCap,
    monthlyDueDay,
    lateFeeAmount,
    registrationFeeAmount,
    guarantorThresholdAmount,
    requiredGuarantorsCount,
    voteThresholdNumerator,
    voteThresholdDenominator,
    managerCycleMonths,
    managerCycleStartDate,
    monthlyReportAutoEmail,
    halalThesis,
  ]);

  const activeMembersCount =
    overview?.treasury.activeMembersCount ?? systemStatus?.totals.activeMembers ?? 0;
  const previewQuorumNum = Math.max(1, Math.min(10, Math.floor(Number(voteThresholdNumerator) || 2)));
  const previewQuorumDen = Math.max(
    previewQuorumNum,
    Math.min(10, Math.floor(Number(voteThresholdDenominator) || 3))
  );
  const previewRequiredVotes =
    activeMembersCount > 0
      ? Math.max(1, Math.ceil((activeMembersCount * previewQuorumNum) / previewQuorumDen))
      : 1;

  async function runConfirmedModal() {
    if (!modal || modal.mode !== 'confirm') return;
    setModalBusy(true);
    try {
      await modal.run();
    } catch (err) {
      setModal({
        mode: 'notice',
        tone: 'red',
        title: 'Action Failed',
        description: err instanceof Error ? err.message : 'An unexpected error occurred.',
      });
    } finally {
      setModalBusy(false);
    }
  }

  function handleSavePolicy(e: FormEvent) {
    e.preventDefault();
    const cycleMonthsNum = Math.floor(Number(managerCycleMonths));
    const quorumNum = Math.floor(Number(voteThresholdNumerator));
    const quorumDen = Math.floor(Number(voteThresholdDenominator));

    if (!Number.isFinite(cycleMonthsNum) || cycleMonthsNum < 1 || cycleMonthsNum > 36) {
      setModal({
        mode: 'notice',
        tone: 'red',
        title: 'Invalid Manager Cycle Duration',
        description: 'Manager rotation interval must be between 1 and 36 months.',
      });
      return;
    }

    if (
      !Number.isInteger(quorumNum) ||
      !Number.isInteger(quorumDen) ||
      quorumNum < 1 ||
      quorumDen < 1 ||
      quorumNum > quorumDen ||
      quorumDen > 10
    ) {
      setModal({
        mode: 'notice',
        tone: 'red',
        title: 'Invalid Quorum Ratio',
        description:
          'Voting quorum numerator and denominator must be integers between 1 and 10, with numerator ≤ denominator.',
      });
      return;
    }

    setModal({
      mode: 'confirm',
      tone: 'emerald',
      title: 'Confirm Cooperative Site Settings Update',
      description:
        'Saving immediately updates cooperative treasury limits, Manager cycle rotation, quorum threshold, and member loan eligibility rules.',
      details: [
        { label: 'Cooperative Name', value: fundName.trim() },
        { label: 'Currency & Monthly Target', value: `${monthlyContributionAmount} ${currency}` },
        {
          label: 'Max Loan & Annual Quota',
          value: `${maxLoanAmount} ${currency} · ${maxLoansPerYear}/yr`,
        },
        {
          label: 'Voting Quorum Rule',
          value: `${quorumNum}/${quorumDen} (${previewRequiredVotes} of ${Math.max(1, activeMembersCount)} active members)`,
        },
        { label: 'Manager Cycle Interval', value: `Every ${cycleMonthsNum} Month(s)` },
        { label: 'Intake & Maturity Dates', value: `${formatShortDate(membershipIntakeDeadline)} → ${formatShortDate(maturityDate)}` },
        {
          label: 'Monthly PDF Auto-Email',
          value: monthlyReportAutoEmail ? 'Enabled' : 'Disabled',
        },
      ],
      confirmLabel: 'Save Site Settings',
      run: async () => {
        await api.updateConfig({
          fundName,
          currency,
          maturityDate,
          membershipIntakeDeadline,
          monthlyContributionAmount: Number(monthlyContributionAmount),
          maxLoanAmount: Number(maxLoanAmount),
          maxLoansPerYear: Number(maxLoansPerYear),
          maxInstallmentMonths: Number(maxInstallmentMonths),
          loanSavingsCapPct: Number(loanSavingsCapPct),
          maxMembersCap: Number(maxMembersCap),
          monthlyDueDay: Number(monthlyDueDay),
          lateFeeAmount: Number(lateFeeAmount),
          registrationFeeAmount: Number(registrationFeeAmount),
          guarantorThresholdAmount: Number(guarantorThresholdAmount),
          requiredGuarantorsCount: Number(requiredGuarantorsCount),
          voteThresholdNumerator: quorumNum,
          voteThresholdDenominator: quorumDen,
          managerCycleMonths: cycleMonthsNum,
          managerCycleStartDate,
          monthlyReportAutoEmail,
          halalInvestmentThesis: halalThesis,
        });
        await Promise.all([onRefresh(), fetchSystemStatus()]);
        setModal({
          mode: 'notice',
          tone: 'emerald',
          title: 'Site Settings Saved',
          description: `Policy updated (${fundName.trim()}, ${quorumNum}/${quorumDen} quorum, ${cycleMonthsNum}-month manager cycle).`,
        });
      },
    });
  }

  function downloadCsvReport(type: 'contributions' | 'loans' | 'members' | 'audit') {
    window.location.assign(`/api/reports/export?type=${type}`);
  }

  function handleDownloadMonthlyPdf() {
    window.location.assign(api.getMonthlyPdfDownloadUrl(reportMonth));
  }

  function handleConfirmEmailMonthlyPdf() {
    setModal({
      mode: 'confirm',
      tone: 'emerald',
      title: `Email Monthly PDF Summary (${reportMonth})`,
      description:
        'Generates the official monthly treasury & Amanah PDF statement and emails it to all active cooperative members via configured SMTP.',
      details: [
        { label: 'Billing Month', value: reportMonth },
        { label: 'Active Recipients', value: `${activeMembersCount} member(s)` },
        {
          label: 'SMTP Status',
          value: systemStatus?.smtp.configured
            ? `Ready (${systemStatus.smtp.host})`
            : 'SMTP not configured (will check server config)',
        },
      ],
      confirmLabel: 'Send Monthly PDF Email',
      run: async () => {
        const res = await api.emailMonthlyPdfSummary(reportMonth);
        await Promise.all([onRefresh(), fetchSystemStatus()]);
        setModal({
          mode: res.ok ? 'notice' : 'notice',
          tone: res.ok ? 'emerald' : res.skipped ? 'amber' : 'red',
          title: res.ok
            ? 'Monthly PDF Dispatched'
            : res.skipped
              ? 'SMTP Delivery Skipped'
              : 'PDF Email Completed with Issues',
          description: res.ok
            ? `Sent ${reportMonth} monthly PDF statement to ${res.sentCount} of ${res.totalRecipients ?? res.totalMembers} active member(s).`
            : res.reason ||
              `Sent ${res.sentCount}, failed ${res.failedCount}. Verify SMTP settings in Integrations & Health.`,
        });
      },
    });
  }

  function handleConfirmSendReminders() {
    setModal({
      mode: 'confirm',
      tone: 'amber',
      title: `Dispatch Payment Reminders (${reportMonth})`,
      description:
        'Queues in-app notifications and reminder records for members with unpaid contributions or due loan installments for the selected month.',
      details: [
        { label: 'Target Month', value: reportMonth },
        { label: 'Due Day Rule', value: `Day ${config?.monthlyDueDay ?? 10} of month` },
      ],
      confirmLabel: 'Dispatch Reminders',
      run: async () => {
        const res = await api.sendReminders(reportMonth);
        await onRefresh();
        setModal({
          mode: 'notice',
          tone: 'emerald',
          title: 'Billing Reminders Processed',
          description:
            res.createdCount > 0
              ? `Created ${res.createdCount} reminder notification(s) for ${reportMonth}.`
              : `All active members are already reminded or up to date for ${reportMonth}.`,
        });
      },
    });
  }

  function handleConstitutionFileSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const isPdf =
      file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      setModal({
        mode: 'notice',
        tone: 'red',
        title: 'Invalid File Type',
        description: 'Official Cooperative Constitution must be uploaded as a genuine PDF (.pdf) document.',
      });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setModal({
        mode: 'notice',
        tone: 'red',
        title: 'File Too Large',
        description: 'Constitution PDF must be smaller than 10 MB.',
      });
      return;
    }

    const sizeLabel =
      file.size >= 1024 * 1024
        ? `${(file.size / (1024 * 1024)).toFixed(2)} MB`
        : `${Math.max(1, Math.round(file.size / 1024))} KB`;

    setModal({
      mode: 'confirm',
      tone: 'emerald',
      title: config?.constitutionPdfUrl
        ? 'Replace Cooperative Constitution PDF'
        : 'Publish Cooperative Constitution PDF',
      description:
        'The PDF will be automatically renamed semantically, uploaded to governance media storage, and published immediately on the Charter Rules & Membership Application pages.',
      details: [
        { label: 'Selected File', value: file.name },
        { label: 'File Size', value: sizeLabel },
        { label: 'Semantic Title', value: constitutionTitle.trim() || file.name },
      ],
      confirmLabel: 'Upload & Publish PDF',
      run: async () => {
        setConstitutionBusy(true);
        try {
          const uploaded = await api.uploadConstitutionPdf(
            file,
            constitutionTitle.trim() || file.name
          );
          await onRefresh();
          setModal({
            mode: 'notice',
            tone: 'emerald',
            title: 'Constitution PDF Published',
            description: `Saved as ${uploaded.constitutionPdfName} (${uploaded.provider}) and published to the Rules Charter & Sign-Up pages.`,
          });
        } finally {
          setConstitutionBusy(false);
        }
      },
    });
  }

  function confirmRemoveConstitutionPdf() {
    if (!config?.constitutionPdfUrl) return;
    setModal({
      mode: 'confirm',
      tone: 'red',
      title: 'Remove Published Constitution PDF',
      description:
        'Removing this document unlinks the Constitution PDF from the public Charter Rules and Membership Application pages until a new PDF is uploaded.',
      details: [
        { label: 'Current File', value: config.constitutionPdfName || 'cooperative-constitution.pdf' },
      ],
      confirmLabel: 'Remove Constitution PDF',
      run: async () => {
        setConstitutionBusy(true);
        try {
          await api.removeConstitutionPdf();
          setShowConstitutionPreview(false);
          await onRefresh();
          setModal({
            mode: 'notice',
            tone: 'amber',
            title: 'Constitution PDF Removed',
            description: 'The cooperative Constitution PDF link has been cleared from Site Settings.',
          });
        } finally {
          setConstitutionBusy(false);
        }
      },
    });
  }

  async function runCharterExtractTranslate(file?: File, targetLanguage = charterTargetLang) {
    setCharterExtractLoading(true);
    setCharterExtractError(null);
    try {
      const res = await api.extractAndTranslateCharterPdf({
        file,
        targetLanguage,
        translate: true,
      });
      setCharterExtractResult(res.result);
      setCharterExtractView(res.result.translatedText ? 'translated' : 'raw');
    } catch (err) {
      setCharterExtractError(
        err instanceof Error ? err.message : 'Unable to extract and translate PDF.'
      );
    } finally {
      setCharterExtractLoading(false);
    }
  }

  function handleSelectPdfForExtraction(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setCharterExtractError('Please choose a valid .pdf document.');
      return;
    }
    void runCharterExtractTranslate(file, charterTargetLang);
  }

  const tabs: Array<{ id: SettingsTabId; label: string; Icon: typeof Settings; badge?: string | number }> = [
    { id: 'policy', label: 'Policy & Limits', Icon: Settings, badge: isDirty ? 'Unsaved' : undefined },
    { id: 'charter', label: 'Charter & Reports', Icon: FileText },
    { id: 'faqs', label: 'FAQ Manager', Icon: HelpCircle },
    { id: 'email', label: 'Email & Templates', Icon: Mail },
    { id: 'integrations', label: 'Integrations & Health', Icon: Server },
    {
      id: 'ventures',
      label: 'Halal Ventures',
      Icon: Briefcase,
      badge: projects.length > 0 ? projects.length : undefined,
    },
  ];

  const queueAttentionCount =
    (systemStatus?.smtp.queueStats.pending ?? 0) +
    (systemStatus?.smtp.queueStats.retrying ?? 0) +
    (systemStatus?.smtp.queueStats.failed ?? 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-4"
    >
      {/* Header & Quick Cross-Navigation */}
      <section className="amanah-card-emerald border rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-indigo-700 dark:text-indigo-400">
              <Settings className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Admin Governance · Cooperative Configuration</span>
              {config?.updatedAt && (
                <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                  · Updated {formatDateTime(config.updatedAt)} by {config.updatedBy}
                </span>
              )}
            </div>
            <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white truncate">
              {config?.fundName || 'Site Settings & Cooperative Project Parameters'}
            </h2>
          </div>

          {onNavigateSection && (
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onNavigateSection('manager-desk')}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-950/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 inline-flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <ClipboardCheck className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" aria-hidden="true" />
                <span>Governance Desk</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigateSection('email-queue')}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-950/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 inline-flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <MailCheck className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                <span>Email Queue</span>
                {queueAttentionCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 font-mono text-[10px]">
                    {queueAttentionCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => onNavigateSection('site-activity')}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-950/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 inline-flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <Activity className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
                <span>Site Activity</span>
              </button>
            </div>
          )}
        </div>

        {/* Tab Bar */}
        <div className="flex flex-wrap gap-1.5 p-1 rounded-xl bg-slate-100/90 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800">
          {tabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`relative px-3.5 py-2 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                  active
                    ? 'text-slate-900 dark:text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="site-settings-tab-pill"
                    transition={{ type: 'spring', bounce: 0.18, duration: 0.35 }}
                    className="absolute inset-0 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-700 shadow-xs"
                  />
                )}
                <tab.Icon className="w-3.5 h-3.5 relative z-10 shrink-0" aria-hidden="true" />
                <span className="relative z-10">{tab.label}</span>
                {tab.badge !== undefined && (
                  <span
                    className={`relative z-10 px-1.5 py-0.5 rounded text-[10px] font-mono ${
                      tab.badge === 'Unsaved'
                        ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                        : 'bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* TAB 1: POLICY & LIMITS */}
      {isAdmin && activeTab === 'policy' && (
        <section className="amanah-card-violet border rounded-2xl p-4 sm:p-5 shadow-xs">
          {loading && !config ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 9 }).map((_, idx) => (
                <div key={idx} className="space-y-1.5">
                  <Skeleton width={120} height={12} />
                  <Skeleton height={38} borderRadius={8} />
                </div>
              ))}
            </div>
          ) : (
            <form onSubmit={handleSavePolicy} className="space-y-5">
              {/* Group 1: Identity, Timeline & Capacity */}
              <div className="space-y-3">
                <div className="border-b border-slate-100 dark:border-slate-800 pb-2">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    1. Cooperative Identity, Timeline &amp; Capacity
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Core branding, currency unit, intake cutoff, and maturity horizon.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  <div className="sm:col-span-2 lg:col-span-1">
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Cooperative / Fund Name
                    </label>
                    <input
                      type="text"
                      required
                      value={fundName}
                      onChange={(e) => setFundName(e.target.value)}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Treasury Currency
                    </label>
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value as FundConfig['currency'])}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                    >
                      <option value="BDT">BDT (৳)</option>
                      <option value="USD">USD ($)</option>
                      <option value="MYR">MYR (RM)</option>
                      <option value="GBP">GBP (£)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Membership Intake Deadline
                    </label>
                    <input
                      type="date"
                      required
                      value={membershipIntakeDeadline}
                      onChange={(e) => setMembershipIntakeDeadline(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Halal Maturity Date
                    </label>
                    <input
                      type="date"
                      required
                      value={maturityDate}
                      onChange={(e) => setMaturityDate(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Max Members / Shares Cap
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={500}
                      required
                      value={maxMembersCap}
                      onChange={(e) => setMaxMembersCap(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Registration / Join Fee ({ccy})
                    </label>
                    <input
                      type="number"
                      min={0}
                      required
                      value={registrationFeeAmount}
                      onChange={(e) => setRegistrationFeeAmount(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Post-Maturity Halal Investment Mandate
                    </label>
                    <button
                      type="button"
                      disabled={rewritingThesis || !halalThesis.trim()}
                      onClick={async () => {
                        setRewritingThesis(true);
                        try {
                          const res = await api.rewriteWithAi({
                            context: 'investment_thesis',
                            text: halalThesis,
                            tone: 'formal',
                          });
                          if (res.result.rewrittenText) {
                            setHalalThesis(res.result.rewrittenText);
                          }
                        } catch (err) {
                          setModal({
                            mode: 'notice',
                            tone: 'red',
                            title: 'AI Rewrite Unavailable',
                            description:
                              err instanceof Error ? err.message : 'Unable to polish investment mandate.',
                          });
                        } finally {
                          setRewritingThesis(false);
                        }
                      }}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-700 dark:text-indigo-300 hover:underline cursor-pointer disabled:opacity-45"
                    >
                      <Sparkles className="w-3 h-3" aria-hidden="true" />
                      <span>{rewritingThesis ? 'Polishing…' : 'AI Polish'}</span>
                    </button>
                  </div>
                  <textarea
                    rows={2}
                    value={halalThesis}
                    onChange={(e) => setHalalThesis(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
              </div>

              {/* Group 2: Monthly Contributions & Reporting Schedule */}
              <div className="space-y-3">
                <div className="border-b border-slate-100 dark:border-slate-800 pb-2">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    2. Monthly Contributions, Due Date &amp; Auto-Statements
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Monthly Target ({ccy})
                    </label>
                    <input
                      type="number"
                      min={100}
                      required
                      value={monthlyContributionAmount}
                      onChange={(e) => setMonthlyContributionAmount(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Monthly Due Day (1–28)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={28}
                      required
                      value={monthlyDueDay}
                      onChange={(e) => setMonthlyDueDay(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Late Payment Fee ({ccy})
                    </label>
                    <input
                      type="number"
                      min={0}
                      required
                      value={lateFeeAmount}
                      onChange={(e) => setLateFeeAmount(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  </div>
                </div>

                <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <label className="inline-flex items-center gap-2 font-medium text-slate-800 dark:text-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={monthlyReportAutoEmail}
                      onChange={(e) => setMonthlyReportAutoEmail(e.target.checked)}
                      className="rounded border-slate-300 dark:border-slate-600 dark:bg-slate-900 text-emerald-600 focus:ring-emerald-600"
                    />
                    <span>Automatically email monthly PDF fund summary at month rollover</span>
                  </label>
                  <span className="font-mono text-slate-500 dark:text-slate-400">
                    Last emailed: {config?.lastMonthlyPdfSentMonth || 'None yet'}
                  </span>
                </div>
              </div>

              {/* Group 3: Qard Hasan Lending & Governance Voting */}
              <div className="space-y-3">
                <div className="border-b border-slate-100 dark:border-slate-800 pb-2">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    3. Qard Hasan Lending Limits &amp; Ballot Quorum
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Max Loan Cap ({ccy})
                    </label>
                    <input
                      type="number"
                      min={500}
                      required
                      value={maxLoanAmount}
                      onChange={(e) => setMaxLoanAmount(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Loans / Year
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={12}
                        required
                        value={maxLoansPerYear}
                        onChange={(e) => setMaxLoansPerYear(e.target.value)}
                        className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Max Months
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={36}
                        required
                        value={maxInstallmentMonths}
                        onChange={(e) => setMaxInstallmentMonths(e.target.value)}
                        className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Loan Savings Cap (% of Savings)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      required
                      value={loanSavingsCapPct}
                      onChange={(e) => setLoanSavingsCapPct(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Guarantor Threshold ({ccy})
                    </label>
                    <input
                      type="number"
                      min={0}
                      required
                      value={guarantorThresholdAmount}
                      onChange={(e) => setGuarantorThresholdAmount(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Required Co-Signers (Above Threshold)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={5}
                      required
                      value={requiredGuarantorsCount}
                      onChange={(e) => setRequiredGuarantorsCount(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  </div>

                  {/* Voting Quorum Fraction */}
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                        Approval Quorum Ratio
                      </label>
                      <div className="flex items-center gap-1">
                        {(
                          [
                            [1, 2],
                            [2, 3],
                            [3, 4],
                          ] as const
                        ).map(([num, den]) => (
                          <button
                            key={`${num}/${den}`}
                            type="button"
                            onClick={() => {
                              setVoteThresholdNumerator(String(num));
                              setVoteThresholdDenominator(String(den));
                            }}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono border cursor-pointer transition-colors ${
                              Number(voteThresholdNumerator) === num &&
                              Number(voteThresholdDenominator) === den
                                ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                                : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-emerald-300 dark:hover:border-emerald-700'
                            }`}
                          >
                            {num}/{den}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={10}
                        required
                        aria-label="Quorum numerator"
                        value={voteThresholdNumerator}
                        onChange={(e) => setVoteThresholdNumerator(e.target.value)}
                        className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                      />
                      <span className="text-slate-400 dark:text-slate-600 font-mono text-sm">/</span>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        required
                        aria-label="Quorum denominator"
                        value={voteThresholdDenominator}
                        onChange={(e) => setVoteThresholdDenominator(e.target.value)}
                        className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                      />
                    </div>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg border border-emerald-200/70 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20 flex items-center gap-2 text-xs text-emerald-800 dark:text-emerald-300">
                  <Vote className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>
                    With <strong className="font-mono">{previewQuorumNum}/{previewQuorumDen}</strong>{' '}
                    quorum across <strong className="font-mono">{activeMembersCount}</strong> active
                    member(s), ballots require{' '}
                    <strong className="font-mono">{previewRequiredVotes}</strong> approval vote(s).
                  </span>
                </div>
              </div>

              {/* Group 4: Manager Rotation Cycle */}
              <div className="space-y-3">
                <div className="border-b border-slate-100 dark:border-slate-800 pb-2">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    4. Manager Rotation Schedule
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                        Manager Rotation Cycle (Months)
                      </label>
                      <div className="flex items-center gap-1">
                        {[3, 6, 12].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setManagerCycleMonths(String(preset))}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono border cursor-pointer transition-colors ${
                              Number(managerCycleMonths) === preset
                                ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300'
                                : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-indigo-300 dark:hover:border-indigo-700'
                            }`}
                          >
                            {preset}m
                          </button>
                        ))}
                      </div>
                    </div>
                    <input
                      type="number"
                      min={1}
                      max={36}
                      required
                      value={managerCycleMonths}
                      onChange={(e) => setManagerCycleMonths(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Manager Cycle Anchor Start Date
                    </label>
                    <input
                      type="date"
                      required
                      value={managerCycleStartDate}
                      onChange={(e) => setManagerCycleStartDate(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  </div>
                </div>
              </div>

              {/* Save / Discard Footer */}
              <div className="pt-3 border-t border-slate-200/80 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="text-xs">
                  {isDirty ? (
                    <span className="inline-flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-300">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>You have unsaved configuration changes</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" aria-hidden="true" />
                      <span>All settings match the active cooperative policy</span>
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                  {isDirty && config && (
                    <button
                      type="button"
                      onClick={() => syncFormFromConfig(config)}
                      className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Discard Changes</span>
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={modalBusy}
                    className="px-5 py-2 rounded-lg bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-medium shadow-xs hover:shadow-sm transition-all duration-200 active:scale-[0.98] cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
                  >
                    Review &amp; Save Site Settings
                  </button>
                </div>
              </div>
            </form>
          )}
        </section>
      )}

      {/* TAB 2: CHARTER, STATEMENTS & EXPORTS */}
      {isAdmin && activeTab === 'charter' && (
        <div className="space-y-4">
          {/* Constitution PDF Section */}
          <section className="amanah-card-emerald border rounded-2xl p-4 sm:p-5 space-y-4 shadow-xs">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-medium text-indigo-700 dark:text-indigo-400">
                <FileText className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>Charter Document · Cooperative Governance Storage</span>
              </div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                Official Cooperative Constitution PDF
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Automatically renamed semantically and published to the Charter Rules &amp; Sign-Up pages.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
              <div>
                <label
                  htmlFor="constitution-semantic-title"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Document Title (Used for Semantic Filename)
                </label>
                <input
                  id="constitution-semantic-title"
                  type="text"
                  value={constitutionTitle}
                  onChange={(e) => setConstitutionTitle(e.target.value)}
                  placeholder="e.g. Cooperative Charter 2027-2036"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={constitutionFileInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={handleConstitutionFileSelected}
                  className="hidden"
                />
                <button
                  type="button"
                  disabled={constitutionBusy || modalBusy}
                  onClick={() => constitutionFileInputRef.current?.click()}
                  className="px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-medium inline-flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>
                    {config?.constitutionPdfUrl ? 'Upload Replacement PDF' : 'Upload Constitution PDF'}
                  </span>
                </button>
                {config?.constitutionPdfUrl && (
                  <button
                    type="button"
                    disabled={constitutionBusy || modalBusy}
                    onClick={confirmRemoveConstitutionPdf}
                    className="px-3.5 py-2 rounded-lg border border-rose-200 dark:border-rose-900/70 bg-rose-50/80 dark:bg-rose-950/30 text-xs font-medium text-rose-700 dark:text-rose-400 hover:bg-rose-600 hover:text-white inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Remove</span>
                  </button>
                )}
              </div>
            </div>

            {config?.constitutionPdfUrl ? (
              <div className="rounded-lg border border-emerald-200/80 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/20 p-4 space-y-3">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-2 text-xs font-semibold text-emerald-900 dark:text-emerald-200">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
                      <span className="truncate font-mono">
                        {config.constitutionPdfName || 'cooperative-constitution.pdf'}
                      </span>
                    </div>
                    <p className="text-[11px] text-emerald-800/85 dark:text-emerald-300/85">
                      {config.constitutionUploadedAt
                        ? `Published ${formatShortDate(config.constitutionUploadedAt)}`
                        : 'Published'}
                      {config.constitutionUploadedBy ? ` by ${config.constitutionUploadedBy}` : ''}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setShowConstitutionPreview((v) => !v)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
                    >
                      {showConstitutionPreview ? (
                        <>
                          <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Hide Preview</span>
                        </>
                      ) : (
                        <>
                          <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Preview</span>
                        </>
                      )}
                    </button>
                    <a
                      href={config.constitutionPdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-teal-300 dark:border-teal-800 bg-white dark:bg-slate-900 text-xs font-medium text-teal-800 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950/40 whitespace-nowrap"
                    >
                      <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Open</span>
                    </a>
                    <a
                      href={config.constitutionPdfUrl}
                      download={config.constitutionPdfName || 'cooperative-constitution.pdf'}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-800 bg-white dark:bg-slate-900 text-xs font-medium text-emerald-800 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Download</span>
                    </a>
                  </div>
                </div>

                <AnimatePresence>
                  {showConstitutionPreview && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950"
                    >
                      <iframe
                        src={config.constitutionPdfUrl}
                        title="Uploaded Cooperative Constitution PDF Preview"
                        className="w-full h-[460px]"
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <div className="p-3.5 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-950/50 text-xs text-slate-600 dark:text-slate-400">
                No Constitution PDF uploaded.
              </div>
            )}

            {/* Charter PDF Text Extraction & Translation (Groq AI) */}
            <div className="rounded-xl border border-indigo-200/80 dark:border-indigo-900/60 bg-white/90 dark:bg-slate-950/75 p-4 space-y-3">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                    <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Charter PDF-to-Text Extraction &amp; Translation (Groq AI)</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Extract text from the published Charter or upload a new Charter PDF directly to inspect &amp; translate clauses.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <input
                    ref={charterExtractInputRef}
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={handleSelectPdfForExtraction}
                    className="hidden"
                  />
                  <select
                    value={charterTargetLang}
                    onChange={(e) => setCharterTargetLang(e.target.value as CharterTargetLanguage)}
                    aria-label="Charter translation target language"
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium"
                  >
                    <option value="en">English</option>
                    <option value="bn">বাংলা (Bengali)</option>
                    <option value="ar">العربية (Arabic)</option>
                  </select>
                  <button
                    type="button"
                    disabled={charterExtractLoading}
                    onClick={() => void runCharterExtractTranslate(undefined, charterTargetLang)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium cursor-pointer disabled:opacity-50 whitespace-nowrap"
                  >
                    <Languages className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{charterExtractLoading ? 'Processing…' : 'Extract Active PDF'}</span>
                  </button>
                  <button
                    type="button"
                    disabled={charterExtractLoading}
                    onClick={() => charterExtractInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-200 dark:border-indigo-800/70 bg-indigo-50/60 dark:bg-indigo-950/30 hover:bg-indigo-100/70 dark:hover:bg-indigo-900/40 text-xs font-medium text-indigo-700 dark:text-indigo-300 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                  >
                    <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Extract New PDF</span>
                  </button>
                </div>
              </div>

              {charterExtractError && (
                <div className="p-2.5 rounded-lg border border-rose-200 dark:border-rose-900/70 bg-rose-50 dark:bg-rose-950/40 text-xs text-rose-700 dark:text-rose-300">
                  {charterExtractError}
                </div>
              )}

              {charterExtractResult && (
                <div className="space-y-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="font-mono">
                      {charterExtractResult.sourceName} · {charterExtractResult.totalPages} page(s)
                      {charterExtractResult.model ? ` · ${charterExtractResult.model}` : ''}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {charterExtractResult.translatedText && (
                        <button
                          type="button"
                          onClick={() => setCharterExtractView('translated')}
                          className={`px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer ${
                            charterExtractView === 'translated'
                              ? 'bg-indigo-600 text-white'
                              : 'border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          Translated ({charterExtractResult.targetLanguage.toUpperCase()})
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setCharterExtractView('raw')}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer ${
                          charterExtractView === 'raw' || !charterExtractResult.translatedText
                            ? 'bg-slate-900 dark:bg-slate-700 text-white'
                            : 'border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        Raw Extracted Text
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const content =
                            charterExtractView === 'translated' && charterExtractResult.translatedText
                              ? charterExtractResult.translatedText
                              : charterExtractResult.extractedText;
                          void navigator.clipboard?.writeText(content);
                          setCopiedCharterText(true);
                          setTimeout(() => setCopiedCharterText(false), 1800);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 cursor-pointer"
                      >
                        {copiedCharterText ? (
                          <Check className="w-3 h-3 text-emerald-600" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        <span>{copiedCharterText ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  </div>

                  {charterExtractResult.summaryBullets.length > 0 && (
                    <div className="rounded-lg border border-emerald-200/70 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/20 p-3 space-y-1">
                      <div className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300">
                        Extracted Charter Summary
                      </div>
                      <ul className="space-y-1 text-xs text-slate-700 dark:text-slate-300 list-disc pl-4">
                        {charterExtractResult.summaryBullets.map((b, i) => (
                          <li key={i}>{b}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/70 p-3 text-xs text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
                    {charterExtractView === 'translated' && charterExtractResult.translatedText
                      ? charterExtractResult.translatedText
                      : charterExtractResult.extractedText}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Monthly Statements & Billing Reminders */}
          <section className="amanah-card-teal border rounded-2xl p-4 sm:p-5 space-y-4 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  Monthly Summary Statements &amp; Billing Reminders
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Generate the monthly treasury PDF statement, email it to members, or dispatch contribution &amp; installment reminders.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <label htmlFor="report-month-picker" className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  Month:
                </label>
                <input
                  id="report-month-picker"
                  type="month"
                  value={reportMonth}
                  onChange={(e) => setReportMonth(e.target.value)}
                  className="px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={handleDownloadMonthlyPdf}
                className="px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 hover:border-teal-400 dark:hover:border-teal-700 hover:bg-teal-50/40 dark:hover:bg-teal-950/20 flex items-center justify-between gap-2 text-xs font-medium text-slate-800 dark:text-slate-200 cursor-pointer transition-colors"
              >
                <span>Download Monthly PDF ({reportMonth})</span>
                <Download className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" aria-hidden="true" />
              </button>

              <button
                type="button"
                disabled={modalBusy}
                onClick={handleConfirmEmailMonthlyPdf}
                className="px-4 py-3 rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/20 hover:bg-emerald-100/70 dark:hover:bg-emerald-900/30 flex items-center justify-between gap-2 text-xs font-medium text-emerald-800 dark:text-emerald-300 cursor-pointer transition-colors disabled:opacity-50"
              >
                <span>Email PDF to Active Members</span>
                <Send className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
              </button>

              <button
                type="button"
                disabled={modalBusy}
                onClick={handleConfirmSendReminders}
                className="px-4 py-3 rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50/50 dark:bg-amber-950/20 hover:bg-amber-100/70 dark:hover:bg-amber-900/30 flex items-center justify-between gap-2 text-xs font-medium text-amber-800 dark:text-amber-300 cursor-pointer transition-colors disabled:opacity-50"
              >
                <span>Dispatch Billing Reminders</span>
                <BellRing className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" aria-hidden="true" />
              </button>
            </div>
          </section>

          {/* Regulatory CSV Exports & Full JSON Vault Backup */}
          <section className="amanah-card-violet border rounded-2xl p-4 sm:p-5 space-y-4 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  Regulatory CSV Ledgers &amp; Treasury Vault Backup
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Export structured ledger spreadsheets or download a complete cooperative JSON backup.
                </p>
              </div>
              <FileSpreadsheet className="w-5 h-5 text-teal-600 dark:text-teal-400 shrink-0" aria-hidden="true" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {(
                [
                  { id: 'contributions', label: 'Contributions CSV' },
                  { id: 'loans', label: 'Qard Hasan CSV' },
                  { id: 'members', label: 'Member Standing CSV' },
                  { id: 'audit', label: 'Audit Trail CSV' },
                ] as const
              ).map((rep) => (
                <button
                  key={rep.id}
                  type="button"
                  onClick={() => downloadCsvReport(rep.id)}
                  className="px-3.5 py-2.5 rounded-lg border border-slate-200/90 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 hover:border-teal-400 dark:hover:border-teal-700 hover:bg-teal-50/50 dark:hover:bg-teal-950/20 transition-all duration-200 flex items-center justify-between text-xs font-medium text-slate-800 dark:text-slate-200 cursor-pointer"
                >
                  <span>{rep.label}</span>
                  <Download className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" aria-hidden="true" />
                </button>
              ))}

              <a
                href={api.getBackupJsonUrl()}
                download
                className="px-3.5 py-2.5 rounded-lg border border-indigo-200 dark:border-indigo-800/70 bg-indigo-50/70 dark:bg-indigo-950/30 hover:bg-indigo-100/80 dark:hover:bg-indigo-900/40 transition-colors flex items-center justify-between text-xs font-medium text-indigo-700 dark:text-indigo-300"
              >
                <span>Full JSON Backup</span>
                <FileArchive className="w-4 h-4 shrink-0" aria-hidden="true" />
              </a>
            </div>
          </section>
        </div>
      )}

      {/* TAB 3: EMAIL & TEMPLATES */}
      {isAdmin && activeTab === 'email' && (
        <div className="space-y-4">
          <section className="amanah-card-amber border rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-white">
                <Mail className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
                <span>
                  SMTP Delivery:{' '}
                  {systemStatus?.smtp.configured
                    ? `Active (${systemStatus.smtp.host}:${systemStatus.smtp.port})`
                    : 'Not configured on server'}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {systemStatus
                  ? `Email queue: ${systemStatus.smtp.queueStats.sent} sent · ${systemStatus.smtp.queueStats.pending + systemStatus.smtp.queueStats.retrying} pending/retrying · ${systemStatus.smtp.queueStats.failed} failed`
                  : 'Customize cooperative HTML email subjects, greetings, accent colors, and dispatch test emails.'}
              </p>
            </div>
            {onNavigateSection && (
              <button
                type="button"
                onClick={() => onNavigateSection('email-queue')}
                className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200 inline-flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <MailCheck className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                <span>Manage Email Queue</span>
              </button>
            )}
          </section>

          <AdminEmailTemplatesEditor
            config={config}
            adminEmail={user.email}
            onRefresh={onRefresh}
          />
        </div>
      )}

      {/* TAB 4: INTEGRATIONS & SYSTEM HEALTH */}
      {isAdmin && activeTab === 'integrations' && (
        <div className="space-y-4">
          <section className="amanah-card-teal border rounded-2xl p-4 sm:p-5 space-y-4 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  Runtime Integrations &amp; Security Health
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Live server readiness for database storage, AES-256-GCM encryption, SMTP mailer, media vault, and AI verification.
                </p>
              </div>
              <button
                type="button"
                disabled={loadingStatus}
                onClick={() => void fetchSystemStatus()}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingStatus ? 'animate-spin' : ''}`} aria-hidden="true" />
                <span>Refresh Status</span>
              </button>
            </div>

            {!systemStatus ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} height={78} borderRadius={10} />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {/* Storage Engine */}
                <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 space-y-1">
                  <div className="flex items-center justify-between gap-2 text-xs font-medium text-slate-600 dark:text-slate-400">
                    <span className="inline-flex items-center gap-1.5">
                      <Database className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                      <span>Primary Vault Storage</span>
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                      ONLINE
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">
                    {systemStatus.storageEngine === 'mongodb_atlas'
                      ? 'MongoDB Atlas Cluster'
                      : 'Encrypted Local JSON Vault'}
                  </div>
                  <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                    {systemStatus.totals.contributionsCount} savings · {systemStatus.totals.loansCount} loans · {systemStatus.totals.auditLogsCount} audit logs
                  </div>
                </div>

                {/* Encryption */}
                <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 space-y-1">
                  <div className="flex items-center justify-between gap-2 text-xs font-medium text-slate-600 dark:text-slate-400">
                    <span className="inline-flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-indigo-600" aria-hidden="true" />
                      <span>AES-256-GCM Encryption</span>
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                        systemStatus.encryption.mode === 'custom_aes256'
                          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                          : systemStatus.encryption.mode === 'jwt_derived'
                            ? 'bg-teal-500/10 text-teal-700 dark:text-teal-300'
                            : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                      }`}
                    >
                      {systemStatus.encryption.mode === 'custom_aes256'
                        ? 'DEDICATED KEY'
                        : systemStatus.encryption.mode === 'jwt_derived'
                          ? 'JWT DERIVED'
                          : 'DEV FALLBACK'}
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">
                    {systemStatus.encryption.configured
                      ? 'Production Key Configured'
                      : 'Set ENCRYPTION_KEY (64 hex)'}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Encrypts NID, nominee details, TOTP secrets &amp; DMs.
                  </div>
                </div>

                {/* SMTP Email */}
                <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 space-y-1">
                  <div className="flex items-center justify-between gap-2 text-xs font-medium text-slate-600 dark:text-slate-400">
                    <span className="inline-flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-teal-600" aria-hidden="true" />
                      <span>SMTP Mailer</span>
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                        systemStatus.smtp.configured
                          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                          : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                      }`}
                    >
                      {systemStatus.smtp.configured ? 'CONFIGURED' : 'UNCONFIGURED'}
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                    {systemStatus.smtp.host
                      ? `${systemStatus.smtp.host}:${systemStatus.smtp.port}`
                      : 'No SMTP host configured'}
                  </div>
                  <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                    Queue: {systemStatus.smtp.queueStats.sent} sent · {systemStatus.smtp.queueStats.failed} failed
                  </div>
                </div>

                {/* Media Storage */}
                <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 space-y-1">
                  <div className="flex items-center justify-between gap-2 text-xs font-medium text-slate-600 dark:text-slate-400">
                    <span className="inline-flex items-center gap-1.5">
                      <HardDrive className="w-3.5 h-3.5 text-indigo-600" aria-hidden="true" />
                      <span>KYC &amp; Charter Media</span>
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-indigo-500/10 text-indigo-700 dark:text-indigo-300">
                      {systemStatus.mediaStorage.provider.toUpperCase()}
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">
                    {systemStatus.mediaStorage.provider === 'imagekit'
                      ? 'ImageKit.io CDN'
                      : systemStatus.mediaStorage.provider === 'imgbb'
                        ? 'ImgBB Image Host'
                        : 'Local Fallback Storage'}
                  </div>
                  <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                    {systemStatus.mediaStorage.folder
                      ? `Folder: ${systemStatus.mediaStorage.folder}`
                      : 'External CDN folder not set'}
                  </div>
                </div>

                {/* Gemini Receipt AI */}
                <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 space-y-1">
                  <div className="flex items-center justify-between gap-2 text-xs font-medium text-slate-600 dark:text-slate-400">
                    <span className="inline-flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                      <span>Receipt OCR &amp; AI Check</span>
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                        systemStatus.geminiAi.configured
                          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                          : 'bg-slate-500/10 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {systemStatus.geminiAi.configured ? 'READY' : 'OFF'}
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">
                    {systemStatus.geminiAi.configured
                      ? 'Receipt Extraction Active'
                      : 'GEMINI_API_KEY Not Set'}
                  </div>
                  <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                    Model: {systemStatus.geminiAi.model}
                  </div>
                </div>

                {/* Groq AI (Rewrite, Spam Shield & Charter Translate) */}
                {systemStatus.groqAi && (
                  <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 space-y-1">
                    <div className="flex items-center justify-between gap-2 text-xs font-medium text-slate-600 dark:text-slate-400">
                      <span className="inline-flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-indigo-600" aria-hidden="true" />
                        <span>Groq AI (Rewrite, Spam &amp; PDF)</span>
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                          systemStatus.groqAi.configured
                            ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                            : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                        }`}
                      >
                        {systemStatus.groqAi.configured ? 'READY' : 'OFF'}
                      </span>
                    </div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-white">
                      {systemStatus.groqAi.configured
                        ? 'Groq AI Copilots Active'
                        : 'GROQ_API_KEY Not Set'}
                    </div>
                    <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                      Model: {systemStatus.groqAi.model}
                    </div>
                  </div>
                )}

                {/* Server Runtime */}
                <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 space-y-1">
                  <div className="flex items-center justify-between gap-2 text-xs font-medium text-slate-600 dark:text-slate-400">
                    <span className="inline-flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-teal-600" aria-hidden="true" />
                      <span>Runtime &amp; Members</span>
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-teal-500/10 text-teal-700 dark:text-teal-300">
                      {systemStatus.runtime.nodeVersion}
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">
                    {systemStatus.totals.activeMembers} Active · {systemStatus.totals.pendingMembers} Pending
                  </div>
                  <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                    Process uptime: {formatUptime(systemStatus.runtime.uptimeSeconds)}
                  </div>
                </div>
              </div>
            )}
          </section>

          <GoogleSheetSyncCard
            config={config}
            workspace={workspace}
            connectingGoogle={connectingGoogle}
            onConnectGoogle={onConnectGoogle}
            onDisconnectGoogle={onDisconnectGoogle}
            onSynced={onRefresh}
          />
        </div>
      )}

      {/* TAB 2B: FAQ MANAGER */}
      {isAdmin && activeTab === 'faqs' && <AdminFaqManager />}

      {/* TAB 5: HALAL VENTURES */}
      {isAdmin && activeTab === 'ventures' && (
        <HalalProjectsView
          projects={projects}
          overview={overview}
          user={user}
          loading={loading}
          onRefresh={onRefresh}
        />
      )}

      <ActionModal
        open={Boolean(modal)}
        mode={modal?.mode || 'notice'}
        tone={modal?.tone || 'emerald'}
        title={modal?.title || ''}
        description={modal?.description || ''}
        details={modal?.details}
        confirmLabel={modal?.mode === 'confirm' ? modal.confirmLabel : 'OK, Got It'}
        busy={modalBusy}
        onConfirm={modal?.mode === 'confirm' ? runConfirmedModal : undefined}
        onClose={() => {
          if (!modalBusy) setModal(null);
        }}
      />
    </motion.div>
  );
}
