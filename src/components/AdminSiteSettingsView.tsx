'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import Skeleton from 'react-loading-skeleton';
import { queryKeys } from '../lib/queryKeys.ts';
import {
  Activity,
  AlertTriangle,
  BellRing,
  Briefcase,
  CheckCircle2,
  ClipboardCheck,
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
  Lock,
  Mail,
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
  DashboardOverview,
  DashboardSectionId,
  FundConfig,
  HalalProject,
  LoanRequest,
  MobileMemberOverviewIconsConfig,
  PublicUser,
} from '../types/coop.ts';
import { api } from '../utils/api.ts';
import { formatDateTime, formatShortDate } from '../utils/format.ts';
import type { WorkspaceSessionInfo } from '../utils/googleWorkspace.ts';
import {
  areMobileOverviewConfigsEqual,
  DEFAULT_MOBILE_MEMBER_OVERVIEW_ICONS,
  sanitizeMobileMemberOverviewIcons,
} from '../utils/mobileOverviewTiles.ts';
import {
  DEFAULT_PROJECT_START_DATE,
  isValidIsoDateYmd,
  resolveProjectStartDate,
} from '../utils/projectDates.ts';
import { ActionModal, type ActionModalDetailItem } from './ActionModal.tsx';
import { AdminEmailQueueView } from './AdminEmailQueueView.tsx';
import { AdminEmailTemplatesEditor } from './AdminEmailTemplatesEditor.tsx';
import { AdminFaqManager } from './AdminFaqManager.tsx';
import { GoogleSheetSyncCard } from './GoogleSheetSyncCard.tsx';
import { HalalProjectsView } from './HalalProjectsView.tsx';
import { MobileOverviewIconEditor } from './MobileOverviewIconCustomizer.tsx';
import { useToast } from './ToastProvider.tsx';

export type SettingsTabId = 'policy' | 'charter' | 'faqs' | 'email' | 'integrations' | 'ventures';

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
  requestedTab?: { tab: SettingsTabId; key: number } | null;
}

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

function formatUptime(
  seconds: number,
  t: (key: 'uptimeDays' | 'uptimeHours' | 'uptimeMins', values?: Record<string, number>) => string
): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return t('uptimeDays', { d, h, m });
  if (h > 0) return t('uptimeHours', { h, m });
  return t('uptimeMins', { m: Math.max(1, m) });
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
  requestedTab,
}: AdminSiteSettingsViewProps) {
  const t = useTranslations('Admin.siteSettings');
  const tCommon = useTranslations('Common');
  const toast = useToast();
  const isAdmin = user.role === 'admin';
  const ccy = config?.currency || 'BDT';

  const [activeTab, setActiveTab] = useState<SettingsTabId>('policy');

  useEffect(() => {
    if (requestedTab?.tab) {
      setActiveTab(requestedTab.tab);
    }
  }, [requestedTab]);

  // Policy form fields
  const [fundName, setFundName] = useState(
    config?.fundName || t('defaultFundName')
  );
  const [currency, setCurrency] = useState<FundConfig['currency']>(config?.currency || 'BDT');
  const [projectStartDate, setProjectStartDate] = useState(
    config?.projectStartDate || DEFAULT_PROJECT_START_DATE
  );
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
  const [mobileMemberOverviewIcons, setMobileMemberOverviewIcons] =
    useState<MobileMemberOverviewIconsConfig>(
      () =>
        sanitizeMobileMemberOverviewIcons(config?.mobileMemberOverviewIcons, {
          allowManagerTiles: false,
        }) ?? DEFAULT_MOBILE_MEMBER_OVERVIEW_ICONS
    );

  // Charter & Compliance state
  const [constitutionTitle, setConstitutionTitle] = useState(() => t('defaultConstitutionTitle'));
  const [constitutionBusy, setConstitutionBusy] = useState(false);
  const [showConstitutionPreview, setShowConstitutionPreview] = useState(false);
  const constitutionFileInputRef = useRef<HTMLInputElement>(null);
  const [rewritingThesis, setRewritingThesis] = useState(false);
  const [reportMonth, setReportMonth] = useState(() => new Date().toISOString().slice(0, 7));

  const queryClient = useQueryClient();

  // System Health Diagnostics (TanStack Query CSR)
  const systemStatusQuery = useQuery({
    queryKey: queryKeys.admin.systemStatus(),
    queryFn: () => api.getAdminSystemStatus(),
    enabled: isAdmin,
    staleTime: 30_000,
  });
  const systemStatus = systemStatusQuery.data ?? null;
  const loadingStatus = systemStatusQuery.isFetching;

  const [modal, setModal] = useState<SettingsModalState | null>(null);
  const [modalBusy, setModalBusy] = useState(false);

  const tRef = useRef(t);
  tRef.current = t;

  const syncFormFromConfig = useCallback((cfg: FundConfig) => {
    setFundName(cfg.fundName || tRef.current('defaultFundName'));
    setCurrency(cfg.currency);
    setProjectStartDate(resolveProjectStartDate(cfg));
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
    setMobileMemberOverviewIcons(
      sanitizeMobileMemberOverviewIcons(cfg.mobileMemberOverviewIcons, {
        allowManagerTiles: false,
      }) ?? DEFAULT_MOBILE_MEMBER_OVERVIEW_ICONS
    );
  }, []);

  useEffect(() => {
    if (config) {
      syncFormFromConfig(config);
    }
  }, [config, syncFormFromConfig]);

  const fetchSystemStatus = useCallback(async () => {
    if (!isAdmin) return;
    await systemStatusQuery.refetch();
  }, [isAdmin, systemStatusQuery]);

  const isDirty = useMemo(() => {
    if (!config) return false;
    return (
      fundName.trim() !== (config.fundName || '').trim() ||
      currency !== config.currency ||
      projectStartDate !== resolveProjectStartDate(config) ||
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
      halalThesis.trim() !== (config.halalInvestmentThesis || '').trim() ||
      !areMobileOverviewConfigsEqual(
        mobileMemberOverviewIcons,
        config.mobileMemberOverviewIcons ?? DEFAULT_MOBILE_MEMBER_OVERVIEW_ICONS
      )
    );
  }, [
    config,
    fundName,
    currency,
    projectStartDate,
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
    mobileMemberOverviewIcons,
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
        title: t('actionFailed'),
        description: err instanceof Error ? err.message : t('unexpectedError'),
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
        title: t('invalidCycleTitle'),
        description: t('invalidCycleDesc'),
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
        title: t('invalidQuorumTitle'),
        description: t('invalidQuorumDesc'),
      });
      return;
    }

    if (!isValidIsoDateYmd(projectStartDate) || !isValidIsoDateYmd(maturityDate) || projectStartDate > maturityDate) {
      setModal({
        mode: 'notice',
        tone: 'red',
        title: t('invalidProjectStartTitle'),
        description: t('invalidProjectStartDesc'),
      });
      return;
    }

    setModal({
      mode: 'confirm',
      tone: 'emerald',
      title: t('confirmPolicyTitle'),
      description: t('confirmPolicyDesc'),
      details: [
        { label: t('detailCoopName'), value: fundName.trim() },
        { label: t('detailCurrencyTarget'), value: `${monthlyContributionAmount} ${currency}` },
        {
          label: t('detailMaxLoanQuota'),
          value: t('perYearValue', {
            amount: maxLoanAmount,
            currency,
            count: maxLoansPerYear,
          }),
        },
        {
          label: t('detailQuorumRule'),
          value: t('quorumMembersValue', {
            num: quorumNum,
            den: quorumDen,
            req: previewRequiredVotes,
            total: Math.max(1, activeMembersCount),
          }),
        },
        { label: t('detailCycleInterval'), value: t('everyNMonths', { count: cycleMonthsNum }) },
        { label: t('detailProjectStartDate'), value: formatShortDate(projectStartDate) },
        {
          label: t('detailIntakeMaturity'),
          value: `${formatShortDate(membershipIntakeDeadline)} → ${formatShortDate(maturityDate)}`,
        },
        {
          label: t('detailMonthlyAutoEmail'),
          value: monthlyReportAutoEmail ? t('enabled') : t('disabled'),
        },
        {
          label: t('detailMobileIcons'),
          value: t('mobileIconsSummary', {
            services: mobileMemberOverviewIcons.services.length,
            more: mobileMemberOverviewIcons.more.length,
          }),
        },
      ],
      confirmLabel: t('confirmSavePolicyBtn'),
      run: async () => {
        await api.updateConfig({
          fundName,
          currency,
          projectStartDate,
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
          mobileMemberOverviewIcons,
        });
        setModal(null);
        await Promise.all([onRefresh(), fetchSystemStatus()]);
        toast.success(
          t('policySavedTitle'),
          t('policySavedDesc', {
            name: fundName.trim(),
            num: quorumNum,
            den: quorumDen,
            months: cycleMonthsNum,
          })
        );
      },
    });
  }

  function downloadCsvReport(type: 'contributions' | 'loans' | 'members' | 'audit') {
    window.location.assign(api.getCsvReportExportUrl(type));
  }

  function handleDownloadMonthlyPdf() {
    window.location.assign(api.getMonthlyPdfDownloadUrl(reportMonth));
  }

  function handleConfirmEmailMonthlyPdf() {
    setModal({
      mode: 'confirm',
      tone: 'emerald',
      title: t('confirmEmailPdfTitle', { month: reportMonth }),
      description: t('confirmEmailPdfDesc'),
      details: [
        { label: t('detailBillingMonth'), value: reportMonth },
        { label: t('detailActiveRecipients'), value: t('memberCount', { count: activeMembersCount }) },
        {
          label: t('detailSmtpStatus'),
          value: systemStatus?.smtp.configured
            ? t('smtpReady', { host: systemStatus.smtp.host || '' })
            : t('smtpNotConfigured'),
        },
      ],
      confirmLabel: t('confirmSendEmailPdfBtn'),
      run: async () => {
        const res = await api.emailMonthlyPdfSummary(reportMonth);
        await Promise.all([onRefresh(), fetchSystemStatus()]);
        setModal({
          mode: 'notice',
          tone: res.ok ? 'emerald' : res.skipped ? 'amber' : 'red',
          title: res.ok
            ? t('pdfDispatchedTitle')
            : res.skipped
              ? t('pdfSkippedTitle')
              : t('pdfPartialTitle'),
          description: res.ok
            ? t('pdfDispatchedDesc', {
                month: reportMonth,
                sent: res.sentCount,
                total: res.totalRecipients ?? res.totalMembers,
              })
            : res.reason ||
              t('pdfPartialDesc', {
                sent: res.sentCount,
                failed: res.failedCount,
              }),
        });
      },
    });
  }

  function handleConfirmSendReminders() {
    setModal({
      mode: 'confirm',
      tone: 'amber',
      title: t('confirmRemindersTitle', { month: reportMonth }),
      description: t('confirmRemindersDesc'),
      details: [
        { label: t('detailTargetMonth'), value: reportMonth },
        { label: t('detailDueDayRule'), value: t('dueDayRuleValue', { day: config?.monthlyDueDay ?? 10 }) },
      ],
      confirmLabel: t('confirmRemindersBtn'),
      run: async () => {
        const res = await api.sendReminders(reportMonth);
        setModal(null);
        await onRefresh();
        toast.success(
          t('remindersDoneTitle'),
          res.createdCount > 0
            ? t('remindersCreatedDesc', { count: res.createdCount, month: reportMonth })
            : t('remindersUpToDateDesc', { month: reportMonth })
        );
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
        title: t('invalidFileTypeTitle'),
        description: t('invalidFileTypeDesc'),
      });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setModal({
        mode: 'notice',
        tone: 'red',
        title: t('fileTooLargeTitle'),
        description: t('fileTooLargeDesc'),
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
        ? t('confirmReplaceConstitution')
        : t('confirmPublishConstitution'),
      description: t('confirmConstitutionDesc'),
      details: [
        { label: t('detailSelectedFile'), value: file.name },
        { label: t('detailFileSize'), value: sizeLabel },
        { label: t('detailSemanticTitle'), value: constitutionTitle.trim() || file.name },
      ],
      confirmLabel: t('confirmUploadPdfBtn'),
      run: async () => {
        setConstitutionBusy(true);
        try {
          const uploaded = await api.uploadConstitutionPdf(
            file,
            constitutionTitle.trim() || file.name
          );
          setModal(null);
          await Promise.all([
            onRefresh(),
            queryClient.invalidateQueries({ queryKey: queryKeys.public.constitution() }),
          ]);
          toast.success(
            t('constitutionPublishedTitle'),
            t('constitutionPublishedDesc', {
              name: uploaded.constitutionPdfName || '',
              provider: uploaded.provider,
            })
          );
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
      title: t('confirmRemoveConstitutionTitle'),
      description: t('confirmRemoveConstitutionDesc'),
      details: [
        { label: t('detailCurrentFile'), value: config.constitutionPdfName || 'cooperative-constitution.pdf' },
      ],
      confirmLabel: t('confirmRemoveConstitutionBtn'),
      run: async () => {
        setConstitutionBusy(true);
        try {
          await api.removeConstitutionPdf();
          setShowConstitutionPreview(false);
          setModal(null);
          await Promise.all([
            onRefresh(),
            queryClient.invalidateQueries({ queryKey: queryKeys.public.constitution() }),
          ]);
          toast.warning(
            t('constitutionRemovedTitle'),
            t('constitutionRemovedDesc')
          );
        } finally {
          setConstitutionBusy(false);
        }
      },
    });
  }

  const queueAttentionCount =
    (systemStatus?.smtp.queueStats.pending ?? 0) +
    (systemStatus?.smtp.queueStats.retrying ?? 0) +
    (systemStatus?.smtp.queueStats.failed ?? 0);

  const tabs: Array<{
    id: SettingsTabId;
    label: string;
    Icon: typeof Settings;
    badge?: string | number;
    isUnsaved?: boolean;
  }> = [
    {
      id: 'policy',
      label: t('tabs.policy'),
      Icon: Settings,
      badge: isDirty ? t('unsavedBadge') : undefined,
      isUnsaved: isDirty,
    },
    { id: 'charter', label: t('tabs.charter'), Icon: FileText },
    { id: 'faqs', label: t('tabs.faqs'), Icon: HelpCircle },
    {
      id: 'email',
      label: t('tabs.email'),
      Icon: Mail,
      badge: queueAttentionCount > 0 ? queueAttentionCount : undefined,
    },
    { id: 'integrations', label: t('tabs.integrations'), Icon: Server },
    {
      id: 'ventures',
      label: t('tabs.ventures'),
      Icon: Briefcase,
      badge: projects.length > 0 ? projects.length : undefined,
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-4"
    >
      {/* Header & Quick Cross-Navigation */}
      <section className="amanah-card-emerald backdrop-blur-xl border ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-2xl p-4 sm:p-6 shadow-[0_6px_28px_-14px_rgba(15,23,42,0.09)] dark:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.45)] space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-teal-700 dark:text-teal-400">
              <Settings className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{t('headerEyebrow')}</span>
              {config?.updatedAt && (
                <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                  {t('updatedMeta', { date: formatDateTime(config.updatedAt), by: config.updatedBy })}
                </span>
              )}
            </div>
            <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white truncate">
              {config?.fundName || t('headingFallback')}
            </h2>
          </div>

          {onNavigateSection && (
            <div className="flex flex-nowrap sm:flex-wrap items-center gap-2 overflow-x-auto no-scrollbar max-w-full pb-0.5 shrink-0">
              <button
                type="button"
                onClick={() => onNavigateSection('manager-desk')}
                className="min-h-[38px] sm:min-h-0 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-950/60 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap shrink-0"
              >
                <ClipboardCheck className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" aria-hidden="true" />
                <span>{t('navGovernanceDesk')}</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigateSection('site-activity')}
                className="min-h-[38px] sm:min-h-0 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-950/60 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap shrink-0"
              >
                <Activity className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" aria-hidden="true" />
                <span>{t('navSiteActivity')}</span>
              </button>
            </div>
          )}
        </div>

        {/* Tab Bar */}
        <div className="flex flex-nowrap sm:flex-wrap gap-1.5 p-1 rounded-xl bg-slate-100/90 dark:bg-slate-800/80 border border-slate-200/75 dark:border-slate-700/75 overflow-x-auto no-scrollbar max-w-full">
          {tabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`relative min-h-[40px] sm:min-h-0 px-3.5 py-2 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  active
                    ? 'text-emerald-800 dark:text-emerald-200'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="site-settings-tab-pill"
                    transition={{ type: 'spring', bounce: 0.18, duration: 0.35 }}
                    className="absolute inset-0 rounded-lg bg-white dark:bg-slate-900 ring-1 ring-emerald-500/20 shadow-xs"
                  />
                )}
                <tab.Icon className="w-3.5 h-3.5 relative z-10 shrink-0" aria-hidden="true" />
                <span className="relative z-10">{tab.label}</span>
                {tab.badge !== undefined && (
                  <span
                    className={`relative z-10 px-1.5 py-0.5 rounded text-[10px] font-mono ${
                      tab.isUnsaved
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

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -3 }}
          transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
        >
      {/* TAB 1: POLICY & LIMITS */}
      {isAdmin && activeTab === 'policy' && (
        <section className="bg-white/95 dark:bg-slate-900/92 border border-slate-200/85 dark:border-slate-800/85 backdrop-blur-xl ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-2xl p-4 sm:p-6 shadow-[0_6px_28px_-14px_rgba(15,23,42,0.09)] dark:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.45)]">
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
                    {t('group1Title')}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t('group1Desc')}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  <div className="sm:col-span-2 lg:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {t('labelFundName')}
                    </label>
                    <input
                      type="text"
                      required
                      value={fundName}
                      onChange={(e) => setFundName(e.target.value)}
                      className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {t('labelCurrency')}
                    </label>
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value as FundConfig['currency'])}
                      className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-indigo-500/25"
                    >
                      <option value="BDT">{t('currencyOptions.BDT')}</option>
                      <option value="USD">{t('currencyOptions.USD')}</option>
                      <option value="MYR">{t('currencyOptions.MYR')}</option>
                      <option value="GBP">{t('currencyOptions.GBP')}</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {t('labelProjectStartDate')}
                    </label>
                    <input
                      type="date"
                      required
                      value={projectStartDate}
                      onChange={(e) => setProjectStartDate(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                    />
                    <p className="mt-1 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                      {t('helperProjectStartDate')}
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {t('labelIntakeDeadline')}
                    </label>
                    <input
                      type="date"
                      required
                      value={membershipIntakeDeadline}
                      onChange={(e) => setMembershipIntakeDeadline(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-indigo-500/25"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {t('labelMaturityDate')}
                    </label>
                    <input
                      type="date"
                      required
                      value={maturityDate}
                      onChange={(e) => setMaturityDate(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-indigo-500/25"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {t('labelMaxMembers')}
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={500}
                      required
                      value={maxMembersCap}
                      onChange={(e) => setMaxMembersCap(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-indigo-500/25"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {t('labelJoinFee', { currency: ccy })}
                    </label>
                    <input
                      type="number"
                      min={0}
                      required
                      value={registrationFeeAmount}
                      onChange={(e) => setRegistrationFeeAmount(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-indigo-500/25"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      {t('labelInvestmentMandate')}
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
                            title: t('aiRewriteUnavailableTitle'),
                            description:
                              err instanceof Error ? err.message : t('aiRewriteUnavailableDesc'),
                          });
                        } finally {
                          setRewritingThesis(false);
                        }
                      }}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-teal-700 dark:text-teal-300 hover:underline cursor-pointer disabled:opacity-45"
                    >
                      <Sparkles className="w-3 h-3" aria-hidden="true" />
                      <span>{rewritingThesis ? t('polishing') : t('aiPolish')}</span>
                    </button>
                  </div>
                  <textarea
                    rows={2}
                    value={halalThesis}
                    onChange={(e) => setHalalThesis(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-indigo-500/25"
                  />
                </div>
              </div>

              {/* Group 2: Monthly Contributions & Reporting Schedule */}
              <div className="space-y-3">
                <div className="border-b border-slate-100 dark:border-slate-800 pb-2">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    {t('group2Title')}
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {t('labelMonthlyTarget', { currency: ccy })}
                    </label>
                    <input
                      type="number"
                      min={100}
                      required
                      value={monthlyContributionAmount}
                      onChange={(e) => setMonthlyContributionAmount(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-indigo-500/25"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {t('labelDueDay')}
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={28}
                      required
                      value={monthlyDueDay}
                      onChange={(e) => setMonthlyDueDay(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-indigo-500/25"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {t('labelLateFee', { currency: ccy })}
                    </label>
                    <input
                      type="number"
                      min={0}
                      required
                      value={lateFeeAmount}
                      onChange={(e) => setLateFeeAmount(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-indigo-500/25"
                    />
                  </div>
                </div>

                <div className="p-3 rounded-xl border border-slate-200/85 dark:border-slate-800/85 bg-white/55 dark:bg-slate-950/45 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <label className="inline-flex items-center gap-2 font-medium text-slate-800 dark:text-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={monthlyReportAutoEmail}
                      onChange={(e) => setMonthlyReportAutoEmail(e.target.checked)}
                      className="rounded border-slate-300 dark:border-slate-600 dark:bg-slate-900 text-emerald-600 focus:ring-emerald-600"
                    />
                    <span>{t('autoEmailCheckbox')}</span>
                  </label>
                  <span className="font-mono text-slate-500 dark:text-slate-400">
                    {t('lastEmailed', { month: config?.lastMonthlyPdfSentMonth || t('noneYet') })}
                  </span>
                </div>
              </div>

              {/* Group 3: Qard Hasan Lending & Governance Voting */}
              <div className="space-y-3">
                <div className="border-b border-slate-100 dark:border-slate-800 pb-2">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    {t('group3Title')}
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {t('labelMaxLoanCap', { currency: ccy })}
                    </label>
                    <input
                      type="number"
                      min={500}
                      required
                      value={maxLoanAmount}
                      onChange={(e) => setMaxLoanAmount(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-indigo-500/25"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        {t('labelLoansPerYear')}
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={12}
                        required
                        value={maxLoansPerYear}
                        onChange={(e) => setMaxLoansPerYear(e.target.value)}
                        className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-indigo-500/25"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        {t('labelMaxMonths')}
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={36}
                        required
                        value={maxInstallmentMonths}
                        onChange={(e) => setMaxInstallmentMonths(e.target.value)}
                        className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-indigo-500/25"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {t('labelLoanSavingsCapPct')}
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      required
                      value={loanSavingsCapPct}
                      onChange={(e) => setLoanSavingsCapPct(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-indigo-500/25"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {t('labelGuarantorThreshold', { currency: ccy })}
                    </label>
                    <input
                      type="number"
                      min={0}
                      required
                      value={guarantorThresholdAmount}
                      onChange={(e) => setGuarantorThresholdAmount(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-indigo-500/25"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {t('labelRequiredCoSigners')}
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={5}
                      required
                      value={requiredGuarantorsCount}
                      onChange={(e) => setRequiredGuarantorsCount(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-indigo-500/25"
                    />
                  </div>

                  {/* Voting Quorum Fraction */}
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                        {t('labelQuorumRatio')}
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
                        aria-label={t('quorumNumeratorAria')}
                        value={voteThresholdNumerator}
                        onChange={(e) => setVoteThresholdNumerator(e.target.value)}
                        className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-indigo-500/25"
                      />
                      <span className="text-slate-400 dark:text-slate-600 font-mono text-sm">/</span>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        required
                        aria-label={t('quorumDenominatorAria')}
                        value={voteThresholdDenominator}
                        onChange={(e) => setVoteThresholdDenominator(e.target.value)}
                        className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-indigo-500/25"
                      />
                    </div>
                  </div>
                </div>

                <div className="p-2.5 rounded-xl border border-emerald-200/70 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20 flex items-center gap-2 text-xs text-emerald-800 dark:text-emerald-300">
                  <Vote className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>
                    {t('quorumSummary', {
                      ratio: `${previewQuorumNum}/${previewQuorumDen}`,
                      active: activeMembersCount,
                      required: previewRequiredVotes,
                    })}
                  </span>
                </div>
              </div>

              {/* Group 4: Manager Rotation Cycle */}
              <div className="space-y-3">
                <div className="border-b border-slate-100 dark:border-slate-800 pb-2">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    {t('group4Title')}
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                        {t('labelCycleMonths')}
                      </label>
                      <div className="flex items-center gap-1">
                        {[3, 6, 12].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setManagerCycleMonths(String(preset))}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono border cursor-pointer transition-colors ${
                              Number(managerCycleMonths) === preset
                                ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                                : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-emerald-300 dark:hover:border-emerald-700'
                            }`}
                          >
                            {t('presetMonthsShort', { count: preset })}
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
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-indigo-500/25"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {t('labelCycleStartDate')}
                    </label>
                    <input
                      type="date"
                      required
                      value={managerCycleStartDate}
                      onChange={(e) => setManagerCycleStartDate(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-indigo-500/25"
                    />
                  </div>
                </div>
              </div>

              {/* Group 5: Default Member Mobile Overview Icons */}
              <div className="space-y-3">
                <div className="border-b border-slate-100 dark:border-slate-800 pb-2">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    {t('group5Title')}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t('group5Desc')}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200/85 dark:border-slate-800 bg-white/55 dark:bg-slate-950/40 p-3.5 sm:p-4">
                  <MobileOverviewIconEditor
                    value={mobileMemberOverviewIcons}
                    onChange={setMobileMemberOverviewIcons}
                    allowManagerTiles={false}
                    onReset={() =>
                      setMobileMemberOverviewIcons(DEFAULT_MOBILE_MEMBER_OVERVIEW_ICONS)
                    }
                    disableReset={areMobileOverviewConfigsEqual(
                      mobileMemberOverviewIcons,
                      DEFAULT_MOBILE_MEMBER_OVERVIEW_ICONS
                    )}
                  />
                </div>
              </div>

              {/* Save / Discard Footer */}
              <div className="pt-3 border-t border-slate-200/80 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="text-xs">
                  {isDirty ? (
                    <span className="inline-flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-300">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>{t('unsavedChangesNotice')}</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" aria-hidden="true" />
                      <span>{t('allMatchedNotice')}</span>
                    </span>
                  )}
                </div>

                <div className="flex flex-col-reverse sm:flex-row sm:flex-wrap items-stretch sm:items-center justify-end gap-2">
                  {isDirty && config && (
                    <button
                      type="button"
                      onClick={() => syncFormFromConfig(config)}
                      className="min-h-[44px] sm:min-h-0 justify-center px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{t('discardChanges')}</span>
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={modalBusy}
                    className="min-h-[44px] sm:min-h-0 px-5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-medium shadow-sm shadow-emerald-600/20 hover:shadow-md transition-all duration-150 active:scale-[0.98] cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
                  >
                    {t('savePolicyBtn')}
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
          <section className="amanah-card-emerald backdrop-blur-xl border ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-2xl p-4 sm:p-6 space-y-4 shadow-[0_6px_28px_-14px_rgba(15,23,42,0.09)] dark:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.45)]">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                <FileText className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{t('charterEyebrow')}</span>
              </div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                {t('charterHeading')}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t('charterDesc')}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
              <div>
                <label
                  htmlFor="constitution-semantic-title"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  {t('labelDocTitle')}
                </label>
                <input
                  id="constitution-semantic-title"
                  type="text"
                  value={constitutionTitle}
                  onChange={(e) => setConstitutionTitle(e.target.value)}
                  placeholder={t('placeholderDocTitle')}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
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
                  className="flex-1 sm:flex-none min-h-[44px] sm:min-h-0 justify-center px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-medium inline-flex items-center gap-1.5 shadow-sm shadow-emerald-600/20 hover:shadow-md transition-all duration-150 active:scale-[0.98] cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>
                    {config?.constitutionPdfUrl ? t('uploadReplacementPdf') : t('uploadConstitutionPdf')}
                  </span>
                </button>
                {config?.constitutionPdfUrl && (
                  <button
                    type="button"
                    disabled={constitutionBusy || modalBusy}
                    onClick={confirmRemoveConstitutionPdf}
                    className="min-h-[44px] sm:min-h-0 justify-center px-3.5 py-2 rounded-xl border border-rose-200 dark:border-rose-900/70 bg-rose-50/80 dark:bg-rose-950/30 text-xs font-medium text-rose-700 dark:text-rose-400 hover:bg-rose-600 hover:text-white inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{tCommon('remove')}</span>
                  </button>
                )}
              </div>
            </div>

            {config?.constitutionPdfUrl ? (
              <div className="rounded-xl border border-emerald-200/80 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/20 p-4 space-y-3">
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
                        ? t('publishedDate', { date: formatShortDate(config.constitutionUploadedAt) })
                        : t('publishedOnly')}
                      {config.constitutionUploadedBy
                        ? t('publishedBy', { name: config.constitutionUploadedBy })
                        : ''}
                    </p>
                  </div>

                  <div className="grid grid-cols-3 sm:flex sm:flex-wrap items-center gap-2 shrink-0 w-full md:w-auto">
                    <button
                      type="button"
                      onClick={() => setShowConstitutionPreview((v) => !v)}
                      className="min-h-[40px] sm:min-h-0 justify-center inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap transition-colors"
                    >
                      {showConstitutionPreview ? (
                        <>
                          <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>{t('hidePreview')}</span>
                        </>
                      ) : (
                        <>
                          <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>{t('preview')}</span>
                        </>
                      )}
                    </button>
                    <a
                      href={config.constitutionPdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-[40px] sm:min-h-0 justify-center inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-teal-300 dark:border-teal-800 bg-white dark:bg-slate-900 text-xs font-medium text-teal-800 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950/40 whitespace-nowrap transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{t('open')}</span>
                    </a>
                    <a
                      href={config.constitutionPdfUrl}
                      download={config.constitutionPdfName || 'cooperative-constitution.pdf'}
                      className="min-h-[40px] sm:min-h-0 justify-center inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-emerald-300 dark:border-emerald-800 bg-white dark:bg-slate-900 text-xs font-medium text-emerald-800 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 whitespace-nowrap transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{tCommon('download')}</span>
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
                      className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950"
                    >
                      <iframe
                        src={config.constitutionPdfUrl}
                        title={t('iframePreviewTitle')}
                        className="w-full h-72 sm:h-[460px]"
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <div className="p-3.5 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white/55 dark:bg-slate-950/35 text-xs text-slate-600 dark:text-slate-400">
                {t('noConstitutionPdf')}
              </div>
            )}
          </section>

          {/* Monthly Statements & Billing Reminders */}
          <section className="amanah-card-teal backdrop-blur-xl border ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-2xl p-4 sm:p-6 space-y-4 shadow-[0_6px_28px_-14px_rgba(15,23,42,0.09)] dark:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.45)]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  {t('monthlyStatementsTitle')}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t('monthlyStatementsDesc')}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <label htmlFor="report-month-picker" className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  {t('monthLabel')}
                </label>
                <input
                  id="report-month-picker"
                  type="month"
                  value={reportMonth}
                  onChange={(e) => setReportMonth(e.target.value)}
                  className="px-3 py-1.5 text-xs font-mono rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-teal-500/25"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
              <button
                type="button"
                onClick={handleDownloadMonthlyPdf}
                className="min-h-[44px] px-4 py-3 rounded-xl border border-slate-200/85 dark:border-slate-800/85 bg-white/60 dark:bg-slate-950/60 hover:border-teal-400 dark:hover:border-teal-700 hover:bg-teal-50/40 dark:hover:bg-teal-950/20 flex items-center justify-between gap-2 text-xs font-medium text-slate-800 dark:text-slate-200 cursor-pointer transition-colors"
              >
                <span>{t('downloadMonthlyPdf', { month: reportMonth })}</span>
                <Download className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" aria-hidden="true" />
              </button>

              <button
                type="button"
                disabled={modalBusy}
                onClick={handleConfirmEmailMonthlyPdf}
                className="min-h-[44px] px-4 py-3 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/20 hover:bg-emerald-100/70 dark:hover:bg-emerald-900/30 flex items-center justify-between gap-2 text-xs font-medium text-emerald-800 dark:text-emerald-300 cursor-pointer transition-colors disabled:opacity-50"
              >
                <span>{t('emailPdfMembers')}</span>
                <Send className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
              </button>

              <button
                type="button"
                disabled={modalBusy}
                onClick={handleConfirmSendReminders}
                className="min-h-[44px] px-4 py-3 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/50 dark:bg-amber-950/20 hover:bg-amber-100/70 dark:hover:bg-amber-900/30 flex items-center justify-between gap-2 text-xs font-medium text-amber-800 dark:text-amber-300 cursor-pointer transition-colors disabled:opacity-50"
              >
                <span>{t('dispatchBillingReminders')}</span>
                <BellRing className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" aria-hidden="true" />
              </button>
            </div>
          </section>

          {/* Regulatory CSV Exports & Full JSON Vault Backup */}
          <section className="bg-white/95 dark:bg-slate-900/92 border border-slate-200/85 dark:border-slate-800/85 backdrop-blur-xl ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-2xl p-4 sm:p-6 space-y-4 shadow-[0_6px_28px_-14px_rgba(15,23,42,0.09)] dark:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.45)]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  {t('csvBackupTitle')}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t('csvBackupDesc')}
                </p>
              </div>
              <FileSpreadsheet className="w-5 h-5 text-teal-600 dark:text-teal-400 shrink-0" aria-hidden="true" />
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5 sm:gap-3">
              {(
                [
                  { id: 'contributions', label: t('csvContributions') },
                  { id: 'loans', label: t('csvLoans') },
                  { id: 'members', label: t('csvMembers') },
                  { id: 'audit', label: t('csvAudit') },
                ] as const
              ).map((rep) => (
                <button
                  key={rep.id}
                  type="button"
                  onClick={() => downloadCsvReport(rep.id)}
                  className="min-h-[44px] px-3 sm:px-3.5 py-2.5 rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white/60 dark:bg-slate-950/60 hover:border-teal-400 dark:hover:border-teal-700 hover:bg-teal-50/50 dark:hover:bg-teal-950/20 transition-all duration-150 flex items-center justify-between gap-2 text-xs font-medium text-slate-800 dark:text-slate-200 cursor-pointer text-left"
                >
                  <span>{rep.label}</span>
                  <Download className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" aria-hidden="true" />
                </button>
              ))}

              <a
                href={api.getBackupJsonUrl()}
                download
                className="col-span-2 lg:col-span-1 min-h-[44px] px-3.5 py-2.5 rounded-xl border border-teal-200 dark:border-teal-800/70 bg-teal-50/70 dark:bg-teal-950/30 hover:bg-teal-100/80 dark:hover:bg-teal-900/40 transition-colors flex items-center justify-between text-xs font-medium text-teal-700 dark:text-teal-300"
              >
                <span>{t('fullJsonBackup')}</span>
                <FileArchive className="w-4 h-4 shrink-0" aria-hidden="true" />
              </a>
            </div>
          </section>
        </div>
      )}

      {/* TAB 3: EMAIL & TEMPLATES */}
      {isAdmin && activeTab === 'email' && (
        <div className="space-y-4">
          <section className="amanah-card-amber backdrop-blur-xl border ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-2xl p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-[0_6px_28px_-14px_rgba(15,23,42,0.09)] dark:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.45)]">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-white">
                <Mail className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
                <span>
                  {systemStatus?.smtp.configured
                    ? t('smtpDeliveryActive', {
                        host: systemStatus.smtp.host || '',
                        port: systemStatus.smtp.port || '',
                      })
                    : t('smtpDeliveryUnconfigured')}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {systemStatus
                  ? t('emailQueueStats', {
                      sent: systemStatus.smtp.queueStats.sent,
                      pending:
                        systemStatus.smtp.queueStats.pending + systemStatus.smtp.queueStats.retrying,
                      failed: systemStatus.smtp.queueStats.failed,
                    })
                  : t('emailTemplatesHint')}
              </p>
            </div>
          </section>

          <AdminEmailQueueView onRefreshWorkspace={onRefresh} />

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
          <section className="amanah-card-teal backdrop-blur-xl border ring-1 ring-inset ring-white/75 dark:ring-white/5 rounded-2xl p-4 sm:p-6 space-y-4 shadow-[0_6px_28px_-14px_rgba(15,23,42,0.09)] dark:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.45)]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  {t('integrationsTitle')}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t('integrationsDesc')}
                </p>
              </div>
              <button
                type="button"
                disabled={loadingStatus}
                onClick={() => void fetchSystemStatus()}
                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-950/60 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingStatus ? 'animate-spin' : ''}`} aria-hidden="true" />
                <span>{t('refreshStatus')}</span>
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
                <div className="p-4 rounded-2xl border border-slate-200/85 dark:border-slate-800/85 bg-white/60 dark:bg-slate-950/55 shadow-xs space-y-1">
                  <div className="flex items-center justify-between gap-2 text-xs font-medium text-slate-600 dark:text-slate-400">
                    <span className="inline-flex items-center gap-1.5">
                      <Database className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                      <span>{t('cardVaultTitle')}</span>
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                      {t('statusOnline')}
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">
                    {systemStatus.storageEngine === 'mongodb_atlas'
                      ? t('storageMongo')
                      : t('storageLocal')}
                  </div>
                  <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                    {t('storageTotals', {
                      savings: systemStatus.totals.contributionsCount,
                      loans: systemStatus.totals.loansCount,
                      audits: systemStatus.totals.auditLogsCount,
                    })}
                  </div>
                </div>

                {/* Encryption */}
                <div className="p-4 rounded-2xl border border-slate-200/85 dark:border-slate-800/85 bg-white/60 dark:bg-slate-950/55 shadow-xs space-y-1">
                  <div className="flex items-center justify-between gap-2 text-xs font-medium text-slate-600 dark:text-slate-400">
                    <span className="inline-flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" aria-hidden="true" />
                      <span>{t('cardEncryptionTitle')}</span>
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
                        ? t('encDedicated')
                        : systemStatus.encryption.mode === 'jwt_derived'
                          ? t('encJwt')
                          : t('encDev')}
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">
                    {systemStatus.encryption.configured
                      ? t('encProdConfigured')
                      : t('encSetKey')}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    {t('encDesc')}
                  </div>
                </div>

                {/* SMTP Email */}
                <div className="p-4 rounded-2xl border border-slate-200/85 dark:border-slate-800/85 bg-white/60 dark:bg-slate-950/55 shadow-xs space-y-1">
                  <div className="flex items-center justify-between gap-2 text-xs font-medium text-slate-600 dark:text-slate-400">
                    <span className="inline-flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-teal-600" aria-hidden="true" />
                      <span>{t('cardSmtpTitle')}</span>
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                        systemStatus.smtp.configured
                          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                          : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                      }`}
                    >
                      {systemStatus.smtp.configured ? t('statusConfigured') : t('statusUnconfigured')}
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                    {systemStatus.smtp.host
                      ? `${systemStatus.smtp.host}:${systemStatus.smtp.port}`
                      : t('noSmtpHost')}
                  </div>
                  <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                    {t('smtpQueueMeta', {
                      sent: systemStatus.smtp.queueStats.sent,
                      failed: systemStatus.smtp.queueStats.failed,
                    })}
                  </div>
                </div>

                {/* Media Storage */}
                <div className="p-4 rounded-2xl border border-slate-200/85 dark:border-slate-800/85 bg-white/60 dark:bg-slate-950/55 shadow-xs space-y-1">
                  <div className="flex items-center justify-between gap-2 text-xs font-medium text-slate-600 dark:text-slate-400">
                    <span className="inline-flex items-center gap-1.5">
                      <HardDrive className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" aria-hidden="true" />
                      <span>{t('cardMediaTitle')}</span>
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-teal-500/10 text-teal-700 dark:text-teal-300">
                      {systemStatus.mediaStorage.provider.toUpperCase()}
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">
                    {systemStatus.mediaStorage.provider === 'imagekit'
                      ? t('mediaImageKit')
                      : systemStatus.mediaStorage.provider === 'imgbb'
                        ? t('mediaImgbb')
                        : t('mediaLocal')}
                  </div>
                  <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                    {systemStatus.mediaStorage.folder
                      ? t('mediaFolder', { folder: systemStatus.mediaStorage.folder })
                      : t('mediaFolderUnset')}
                  </div>
                </div>

                {/* Gemini Receipt AI */}
                <div className="p-4 rounded-2xl border border-slate-200/85 dark:border-slate-800/85 bg-white/60 dark:bg-slate-950/55 shadow-xs space-y-1">
                  <div className="flex items-center justify-between gap-2 text-xs font-medium text-slate-600 dark:text-slate-400">
                    <span className="inline-flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                      <span>{t('cardGeminiTitle')}</span>
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                        systemStatus.geminiAi.configured
                          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                          : 'bg-slate-500/10 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {systemStatus.geminiAi.configured ? t('statusReady') : t('statusOff')}
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">
                    {systemStatus.geminiAi.configured
                      ? t('geminiActive')
                      : t('geminiNotSet')}
                  </div>
                  <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                    {t('modelLabel', { model: systemStatus.geminiAi.model })}
                  </div>
                </div>

                {/* Groq AI (Rewrite & Spam Shield) */}
                {systemStatus.groqAi && (
                  <div className="p-4 rounded-2xl border border-slate-200/85 dark:border-slate-800/85 bg-white/60 dark:bg-slate-950/55 shadow-xs space-y-1">
                    <div className="flex items-center justify-between gap-2 text-xs font-medium text-slate-600 dark:text-slate-400">
                      <span className="inline-flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" aria-hidden="true" />
                        <span>{t('cardGroqTitle')}</span>
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                          systemStatus.groqAi.configured
                            ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                            : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                        }`}
                      >
                        {systemStatus.groqAi.configured ? t('statusReady') : t('statusOff')}
                      </span>
                    </div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-white">
                      {systemStatus.groqAi.configured
                        ? t('groqActive')
                        : t('groqNotSet')}
                    </div>
                    <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                      {t('modelLabel', { model: systemStatus.groqAi.model })}
                    </div>
                  </div>
                )}

                {/* Server Runtime */}
                <div className="p-4 rounded-2xl border border-slate-200/85 dark:border-slate-800/85 bg-white/60 dark:bg-slate-950/55 shadow-xs space-y-1">
                  <div className="flex items-center justify-between gap-2 text-xs font-medium text-slate-600 dark:text-slate-400">
                    <span className="inline-flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-teal-600" aria-hidden="true" />
                      <span>{t('cardRuntimeTitle')}</span>
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-teal-500/10 text-teal-700 dark:text-teal-300">
                      {systemStatus.runtime.nodeVersion}
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">
                    {t('runtimeMembers', {
                      active: systemStatus.totals.activeMembers,
                      pending: systemStatus.totals.pendingMembers,
                    })}
                  </div>
                  <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                    {t('processUptime', { uptime: formatUptime(systemStatus.runtime.uptimeSeconds, t) })}
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
        </motion.div>
      </AnimatePresence>

      <ActionModal
        open={Boolean(modal)}
        mode={modal?.mode || 'notice'}
        tone={modal?.tone || 'emerald'}
        title={modal?.title || ''}
        description={modal?.description || ''}
        details={modal?.details}
        confirmLabel={modal?.mode === 'confirm' ? modal.confirmLabel : tCommon('okGotIt')}
        busy={modalBusy}
        onConfirm={modal?.mode === 'confirm' ? runConfirmedModal : undefined}
        onClose={() => {
          if (!modalBusy) setModal(null);
        }}
      />
    </motion.div>
  );
}
