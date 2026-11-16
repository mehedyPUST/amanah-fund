'use client';

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import Skeleton from 'react-loading-skeleton';
import {
  CheckCircle2,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileSpreadsheet,
  FileText,
  HandCoins,
  Settings,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react';
import type {
  DashboardOverview,
  FundConfig,
  HalalProject,
  LoanRequest,
  PublicUser,
} from '../types/coop.ts';
import { api } from '../utils/api.ts';
import { formatMoney, formatShortDate } from '../utils/format.ts';
import type { WorkspaceSessionInfo } from '../utils/googleWorkspace.ts';
import { ActionModal, type ActionModalDetailItem } from './ActionModal.tsx';
import { GoogleSheetSyncCard } from './GoogleSheetSyncCard.tsx';
import { HalalProjectsView } from './HalalProjectsView.tsx';

interface AdminSiteSettingsViewProps {
  overview: DashboardOverview | null;
  config: FundConfig | null;
  user: PublicUser;
  loans: LoanRequest[];
  projects: HalalProject[];
  loading: boolean;
  workspace: WorkspaceSessionInfo;
  connectingGoogle: boolean;
  onConnectGoogle: () => Promise<void>;
  onDisconnectGoogle: () => Promise<void>;
  onRefresh: () => Promise<void>;
}

type SettingsModalState =
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
      inputMultiline?: boolean;
      run: (inputValue: string) => Promise<void>;
    }
  | {
      mode: 'notice';
      tone: 'emerald' | 'amber' | 'red';
      title: string;
      description: string;
      details?: ActionModalDetailItem[];
    };

export function AdminSiteSettingsView({
  overview,
  config,
  user,
  loans,
  projects,
  loading,
  workspace,
  connectingGoogle,
  onConnectGoogle,
  onDisconnectGoogle,
  onRefresh,
}: AdminSiteSettingsViewProps) {
  const isAdmin = user.role === 'admin';
  const ccy = config?.currency || 'BDT';

  const [fundName, setFundName] = useState(
    config?.fundName || 'Amanah — Savings, Investment & Interest-Free Loan Fund'
  );
  const [maxLoansPerYear, setMaxLoansPerYear] = useState(String(config?.maxLoansPerYear ?? 3));
  const [maturityDate, setMaturityDate] = useState(config?.maturityDate || '2036-12-31');
  const [monthlyContributionAmount, setMonthlyContributionAmount] = useState(
    String(config?.monthlyContributionAmount ?? 5000)
  );
  const [maxLoanAmount, setMaxLoanAmount] = useState(String(config?.maxLoanAmount ?? 50000));
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
  const [managerCycleMonths, setManagerCycleMonths] = useState(
    String(config?.managerCycleMonths ?? 3)
  );
  const [managerCycleStartDate, setManagerCycleStartDate] = useState(
    config?.managerCycleStartDate || '2027-01-01'
  );
  const [currency, setCurrency] = useState<FundConfig['currency']>(config?.currency || 'BDT');
  const [halalThesis, setHalalThesis] = useState(config?.halalInvestmentThesis || '');

  const [modal, setModal] = useState<SettingsModalState | null>(null);
  const [modalBusy, setModalBusy] = useState(false);
  const [constitutionTitle, setConstitutionTitle] = useState('Cooperative Charter 2027-2036');
  const [constitutionBusy, setConstitutionBusy] = useState(false);
  const [showConstitutionPreview, setShowConstitutionPreview] = useState(false);
  const constitutionFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (config) {
      setFundName(config.fundName || 'Amanah — Savings, Investment & Interest-Free Loan Fund');
      setMaxLoansPerYear(String(config.maxLoansPerYear));
      setMaturityDate(config.maturityDate);
      setMonthlyContributionAmount(String(config.monthlyContributionAmount));
      setMaxLoanAmount(String(config.maxLoanAmount));
      setMaxInstallmentMonths(String(config.maxInstallmentMonths));
      setLoanSavingsCapPct(String(config.loanSavingsCapPct ?? 75));
      setMaxMembersCap(String(config.maxMembersCap ?? 20));
      setMonthlyDueDay(String(config.monthlyDueDay ?? 10));
      setLateFeeAmount(String(config.lateFeeAmount ?? 50));
      setRegistrationFeeAmount(String(config.registrationFeeAmount ?? 200));
      setGuarantorThresholdAmount(String(config.guarantorThresholdAmount ?? 40000));
      setRequiredGuarantorsCount(String(config.requiredGuarantorsCount ?? 1));
      setManagerCycleMonths(String(config.managerCycleMonths ?? 3));
      setManagerCycleStartDate(config.managerCycleStartDate || '2027-01-01');
      setCurrency(config.currency);
      setHalalThesis(config.halalInvestmentThesis);
    }
  }, [config]);

  async function runConfirmedModal(inputValue: string) {
    if (!modal || modal.mode !== 'confirm') return;
    setModalBusy(true);
    try {
      await modal.run(inputValue);
    } catch (err) {
      setModal({
        mode: 'notice',
        tone: 'red',
        title: 'Save Failed',
        description: err instanceof Error ? err.message : 'An unexpected error occurred.',
      });
    } finally {
      setModalBusy(false);
    }
  }

  function handleSavePolicy(e: FormEvent) {
    e.preventDefault();
    const cycleMonthsNum = Math.floor(Number(managerCycleMonths));
    if (!Number.isFinite(cycleMonthsNum) || cycleMonthsNum < 1 || cycleMonthsNum > 36) {
      setModal({
        mode: 'notice',
        tone: 'red',
        title: 'Invalid Manager Cycle Duration',
        description: 'Manager rotation interval must be between 1 and 36 months.',
      });
      return;
    }

    setModal({
      mode: 'confirm',
      tone: 'emerald',
      title: 'Confirm Cooperative Site Settings Update',
      description:
        'Saving immediately updates cooperative treasury limits, Manager cycle rotation, and member loan eligibility rules.',
      details: [
        { label: 'Cooperative Name', value: fundName.trim() },
        { label: 'Currency & Monthly Target', value: `${monthlyContributionAmount} ${currency}` },
        { label: 'Max Loan & Annual Quota', value: `${maxLoanAmount} ${currency} · ${maxLoansPerYear}/yr` },
        { label: 'Manager Cycle Interval', value: `Every ${cycleMonthsNum} Month(s)` },
        { label: 'Cycle Anchor Date', value: formatShortDate(managerCycleStartDate) },
        { label: 'Maturity Date', value: formatShortDate(maturityDate) },
      ],
      confirmLabel: 'Save Site Settings',
      run: async () => {
        await api.updateConfig({
          fundName,
          maxLoansPerYear: Number(maxLoansPerYear),
          maturityDate,
          monthlyContributionAmount: Number(monthlyContributionAmount),
          maxLoanAmount: Number(maxLoanAmount),
          maxInstallmentMonths: Number(maxInstallmentMonths),
          loanSavingsCapPct: Number(loanSavingsCapPct),
          maxMembersCap: Number(maxMembersCap),
          monthlyDueDay: Number(monthlyDueDay),
          lateFeeAmount: Number(lateFeeAmount),
          registrationFeeAmount: Number(registrationFeeAmount),
          guarantorThresholdAmount: Number(guarantorThresholdAmount),
          requiredGuarantorsCount: Number(requiredGuarantorsCount),
          managerCycleMonths: cycleMonthsNum,
          managerCycleStartDate,
          currency,
          halalInvestmentThesis: halalThesis,
        });
        await onRefresh();
        setModal({
          mode: 'notice',
          tone: 'emerald',
          title: 'Site Settings Saved',
          description: `Policy updated (${fundName}, ${cycleMonthsNum}-month manager cycle, max ${maxLoansPerYear} loans/yr, guarantor threshold ${guarantorThresholdAmount} ${currency}).`,
        });
      },
    });
  }

  function confirmAdminLoanReview(loan: LoanRequest, decision: 'approve' | 'reject') {
    if (decision === 'approve') {
      setModal({
        mode: 'confirm',
        tone: 'emerald',
        title: `Approve Qard Hasan Loan (${loan.id})`,
        description:
          'Approving moves this application to the approved disbursement stage on the Manager Desk.',
        details: [
          { label: 'Borrower', value: `${loan.borrowerName} (${loan.borrowerCode})` },
          { label: 'Amount', value: formatMoney(loan.amount, ccy) },
          { label: 'Purpose', value: loan.purpose },
        ],
        confirmLabel: 'Approve for Disbursement',
        run: async () => {
          await api.adminReviewLoan(loan.id, 'approve');
          await onRefresh();
          setModal({
            mode: 'notice',
            tone: 'emerald',
            title: 'Qard Hasan Approved',
            description: `Qard Hasan loan ${loan.id} approved for treasury disbursement.`,
          });
        },
      });
    } else {
      setModal({
        mode: 'confirm',
        tone: 'red',
        title: `Decline Qard Hasan Loan (${loan.id})`,
        description: 'Enter a note explaining why this loan request is declined.',
        details: [
          { label: 'Borrower', value: `${loan.borrowerName} (${loan.borrowerCode})` },
          { label: 'Amount', value: formatMoney(loan.amount, ccy) },
        ],
        inputLabel: 'Administrative Note',
        inputPlaceholder: 'Reason for declining loan request…',
        inputRequired: false,
        inputMultiline: true,
        confirmLabel: 'Decline Request',
        run: async (note) => {
          await api.adminReviewLoan(loan.id, 'reject', note || undefined);
          await onRefresh();
          setModal({
            mode: 'notice',
            tone: 'amber',
            title: 'Qard Hasan Declined',
            description: `Qard Hasan loan ${loan.id} declined during administrative review.`,
          });
        },
      });
    }
  }

  function downloadCsvReport(type: 'contributions' | 'loans' | 'members' | 'audit') {
    window.location.assign(`/api/reports/export?type=${type}`);
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
        'The PDF will be automatically renamed semantically, stored in ImageKit.io media storage, and published immediately on the Rules Charter & Membership Application pages.',
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

  const pendingReviewLoans = loans.filter(
    (l) => l.status === 'pending_manager_review' || l.status === 'pending_vote'
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-6"
    >
      <section className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-medium text-indigo-700 dark:text-indigo-400">
              <Settings className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Admin Governance · Project Configuration</span>
            </div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Site Settings &amp; Cooperative Project Parameters
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Configure cooperative treasury thresholds, Manager rotation cycle duration, maturity timeline, Google Sheets sync, regulatory CSV exports, and Halal project proposals.
            </p>
          </div>
        </div>
      </section>

      {isAdmin && (
        <section className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 sm:p-6 shadow-xs">
          <div className="mb-4">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              Project Policy, Manager Cycle, Contribution Target &amp; Loan Caps
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Changes persist across the cooperative ledger and immediately update member loan eligibility, contribution targets, and Manager rotation terms.
            </p>
          </div>

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
          <form onSubmit={handleSavePolicy} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
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
                  Currency
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

              <div className="grid grid-cols-2 gap-3">
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
                            : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:border-indigo-300'
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
                  Manager Cycle Start Date
                </label>
                <input
                  type="date"
                  required
                  value={managerCycleStartDate}
                  onChange={(e) => setManagerCycleStartDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
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

              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Due Day
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={28}
                    required
                    value={monthlyDueDay}
                    onChange={(e) => setMonthlyDueDay(e.target.value)}
                    className="w-full px-2.5 py-2 text-sm font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Late Fee
                  </label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={lateFeeAmount}
                    onChange={(e) => setLateFeeAmount(e.target.value)}
                    className="w-full px-2.5 py-2 text-sm font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Join Fee
                  </label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={registrationFeeAmount}
                    onChange={(e) => setRegistrationFeeAmount(e.target.value)}
                    className="w-full px-2.5 py-2 text-sm font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Post-Maturity Halal Investment Mandate
              </label>
              <textarea
                rows={2}
                value={halalThesis}
                onChange={(e) => setHalalThesis(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={modalBusy}
                className="px-5 py-2 rounded-lg bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-medium shadow-xs hover:shadow-sm transition-all duration-200 active:scale-[0.98] cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                Review &amp; Save Site Settings
              </button>
            </div>
          </form>
          )}
        </section>
      )}

      {isAdmin && (
        <section className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-4 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-medium text-indigo-700 dark:text-indigo-400">
                <FileText className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>Charter Document · ImageKit.io Governance Storage</span>
              </div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                Official Cooperative Constitution PDF
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Upload or replace the cooperative constitution PDF from the admin dashboard. Files are automatically renamed semantically (e.g. cooperative-constitution-...) and published dynamically to the Charter Rules and Membership Sign-Up pages.
              </p>
            </div>
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
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-600 via-teal-600 to-emerald-600 hover:from-indigo-700 hover:to-emerald-700 text-white text-xs font-medium inline-flex items-center gap-1.5 shadow-xs transition-all cursor-pointer disabled:opacity-50 whitespace-nowrap"
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
              No Constitution PDF is currently uploaded. Select a PDF file above to publish it to the Charter Rules and Membership Application pages.
            </div>
          )}
        </section>
      )}

      <section className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-teal-700 dark:text-teal-400">
              <HandCoins className="w-4 h-4" aria-hidden="true" />
              <span>Administrative Qard Hasan Review</span>
            </div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white mt-0.5">
              Pending Loan Requests ({pendingReviewLoans.length})
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Review requested principal, purpose, repayment schedule, and encrypted payout account.
            </p>
          </div>
        </div>

        {pendingReviewLoans.length === 0 ? (
          <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs text-slate-500 dark:text-slate-400">
            No pending Qard Hasan loan requests awaiting administrative review.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
            {pendingReviewLoans.map((loan) => {
              const approvals = loan.votes.filter((v) => v.decision === 'approve').length;
              return (
                <div
                  key={loan.id}
                  className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-mono font-semibold text-slate-900 dark:text-white">
                        {loan.id}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {loan.borrowerName} ({loan.borrowerCode})
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono">
                        Votes {approvals}/{loan.requiredApprovals}
                      </span>
                    </div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-white font-mono tabular-nums">
                      {formatMoney(loan.amount, ccy)} · {loan.installmentMonths} monthly
                      installments ({formatMoney(loan.monthlyInstallment, ccy)}/mo)
                    </div>
                    <p className="text-xs text-slate-700 dark:text-slate-300">{loan.purpose}</p>
                    {loan.decryptedSensitiveNotes && (
                      <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                        Payout: {loan.decryptedSensitiveNotes.channel.toUpperCase()} ·{' '}
                        {loan.decryptedSensitiveNotes.provider} ·{' '}
                        {loan.decryptedSensitiveNotes.disbursementAccount}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={modalBusy}
                      onClick={() => confirmAdminLoanReview(loan, 'reject')}
                      className="px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900/70 bg-rose-50/80 dark:bg-rose-950/30 text-xs font-medium text-rose-700 dark:text-rose-400 hover:bg-rose-600 hover:text-white hover:border-rose-600 dark:hover:bg-rose-600 dark:hover:text-white inline-flex items-center gap-1 cursor-pointer disabled:opacity-50 transition-all duration-200 active:scale-[0.98]"
                    >
                      <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Decline</span>
                    </button>
                    <button
                      type="button"
                      disabled={modalBusy}
                      onClick={() => confirmAdminLoanReview(loan, 'approve')}
                      className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-medium shadow-xs hover:shadow-sm inline-flex items-center gap-1 cursor-pointer disabled:opacity-50 transition-all duration-200 active:scale-[0.98]"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Approve for Disbursement</span>
                    </button>
                  </div>
                </div>
              );
            })}
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

      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              Automated Regulatory &amp; Compliance Exports
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Download cryptographically hashed CSV ledgers for Shariah review and annual member assemblies.
            </p>
          </div>
          <FileSpreadsheet className="w-5 h-5 text-teal-600 dark:text-teal-400 shrink-0" aria-hidden="true" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {(
            [
              { id: 'contributions', label: 'Contributions Ledger CSV' },
              { id: 'loans', label: 'Qard Hasan Portfolio CSV' },
              { id: 'members', label: 'Member Standing CSV' },
              { id: 'audit', label: 'Encrypted Audit Trail CSV' },
            ] as const
          ).map((rep) => (
            <button
              key={rep.id}
              type="button"
              onClick={() => downloadCsvReport(rep.id)}
              className="px-4 py-3 rounded-lg border border-slate-200/90 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 hover:border-teal-400 dark:hover:border-teal-700 hover:bg-teal-50/50 dark:hover:bg-teal-950/20 hover:-translate-y-0.5 hover:shadow-sm transition-all duration-200 flex items-center justify-between text-xs font-medium text-slate-800 dark:text-slate-200 cursor-pointer"
            >
              <span>{rep.label}</span>
              <Download className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" aria-hidden="true" />
            </button>
          ))}
        </div>
      </section>

      <HalalProjectsView
        projects={projects}
        overview={overview}
        user={user}
        loading={loading}
        onRefresh={onRefresh}
      />

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
        inputMultiline={modal?.mode === 'confirm' ? modal.inputMultiline : false}
        busy={modalBusy}
        onConfirm={modal?.mode === 'confirm' ? runConfirmedModal : undefined}
        onClose={() => {
          if (!modalBusy) setModal(null);
        }}
      />
    </motion.div>
  );
}
