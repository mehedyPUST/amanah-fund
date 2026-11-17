import { jsPDF } from 'jspdf';
import type { PublicUser } from '../types/coop.ts';
import { buildDashboardOverview, buildManagerCycleSchedule } from './coopService.ts';
import type { VaultState } from './db.ts';

export interface MonthlyFundSummaryData {
  monthKey: string;
  fundName: string;
  currency: string;
  generatedAt: string;
  amanahHeight: number;
  currentBalance: number;
  activeQardHasanTotal: number;
  monthContributionsTarget: number;
  monthContributionsCollected: number;
  monthDueRemaining: number;
  clearedMembersCount: number;
  contributingMembersCount: number;
  activeMembersCount: number;
  activeLoans: Array<{
    id: string;
    borrowerName: string;
    borrowerCode: string;
    principal: number;
    remainingBalance: number;
    totalRepaid: number;
  }>;
  monthContributions: Array<{
    memberCode: string;
    memberName: string;
    amount: number;
    channel: string;
    status: string;
    submittedAt: string;
  }>;
  currentManagerName: string;
  currentCycleWindow: string;
}

function fmtMoney(amount: number, currency: string): string {
  const num = Number(amount || 0).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return `${currency} ${num}`;
}

export const MONTHLY_REPORT_SEND_DAY = 15;

export function isMonthlyPdfScheduleDue(now = new Date()): boolean {
  return now.getUTCDate() >= MONTHLY_REPORT_SEND_DAY;
}

export function getPreviousMonthKey(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return d.toISOString().slice(0, 7);
}

export function buildMonthlyFundSummaryData(
  state: VaultState,
  monthKey?: string
): MonthlyFundSummaryData {
  const targetMonth =
    monthKey && /^\d{4}-\d{2}$/.test(monthKey) ? monthKey : new Date().toISOString().slice(0, 7);

  const syntheticViewer: PublicUser = {
    id: 'system-report',
    name: 'System Report',
    email: 'system@amanah.local',
    role: 'admin',
    memberCode: 'SYS',
    status: 'active',
    joinedAt: new Date().toISOString(),
  };

  const overview = buildDashboardOverview(state, syntheticViewer);
  const contributingMembers = state.users.filter(
    (u) => u.status === 'active' && u.role !== 'admin'
  );
  const monthContribs = state.contributions.filter((c) => c.billingMonth === targetMonth);
  const approvedForMonth = monthContribs.filter((c) => c.status === 'approved');

  const clearedSet = new Set(approvedForMonth.map((c) => c.userId));
  const collected = approvedForMonth.reduce((sum, c) => sum + c.amount, 0);
  const target = contributingMembers.length * state.fundConfig.monthlyContributionAmount;

  const activeLoans = (overview.treasury.activeBorrowers || []).map((item) => ({
    id: item.loanId,
    borrowerName: item.borrowerName,
    borrowerCode: item.borrowerCode,
    principal: item.mainAmount,
    remainingBalance: item.dueAmount,
    totalRepaid: item.totalRepaid,
  }));

  const cycle = buildManagerCycleSchedule(state);

  return {
    monthKey: targetMonth,
    fundName: state.fundConfig.fundName,
    currency: state.fundConfig.currency,
    generatedAt: new Date().toISOString(),
    amanahHeight: overview.treasury.amanahHeight,
    currentBalance: overview.treasury.currentBalance,
    activeQardHasanTotal: overview.treasury.activeLoansOutstanding,
    monthContributionsTarget: target,
    monthContributionsCollected: collected,
    monthDueRemaining: Math.max(0, target - collected),
    clearedMembersCount: clearedSet.size,
    contributingMembersCount: contributingMembers.length,
    activeMembersCount: state.users.filter((u) => u.status === 'active').length,
    activeLoans,
    monthContributions: monthContribs.map((c) => ({
      memberCode: c.memberCode,
      memberName: c.memberName,
      amount: c.amount,
      channel: c.channel.toUpperCase(),
      status: c.status,
      submittedAt: c.submittedAt.slice(0, 10),
    })),
    currentManagerName: cycle.currentSlot
      ? `${cycle.currentSlot.memberName} (${cycle.currentSlot.memberCode})`
      : 'Unassigned',
    currentCycleWindow: cycle.currentSlot
      ? `${cycle.currentSlot.startDate} to ${cycle.currentSlot.endDate}`
      : 'N/A',
  };
}

export function generateMonthlyFundSummaryPdfBuffer(
  state: VaultState,
  monthKey?: string
): { buffer: Buffer; filename: string; summary: MonthlyFundSummaryData } {
  const summary = buildMonthlyFundSummaryData(state, monthKey);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  let y = 16;

  function ensurePageSpace(neededMm: number) {
    if (y + neededMm > pageHeight - 16) {
      doc.addPage();
      y = 18;
    }
  }

  // Header Banner
  doc.setFillColor(5, 150, 105);
  doc.rect(0, 0, pageWidth, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('AMANAH COOPERATIVE TREASURY', margin, 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(`Monthly Fund Audit & Activity Summary — Period: ${summary.monthKey}`, margin, 18.5);
  doc.setFontSize(8);
  doc.text(`Generated UTC: ${summary.generatedAt.slice(0, 19).replace('T', ' ')}`, margin, 24);

  y = 36;
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(summary.fundName, margin, y);
  y += 6;

  // Executive KPI Grid (2 columns x 3 rows)
  const kpis: Array<[string, string]> = [
    ['Amanah Height (Total Raised)', fmtMoney(summary.amanahHeight, summary.currency)],
    ['Current Available Balance', fmtMoney(summary.currentBalance, summary.currency)],
    ['Active Qard Hasan Principal', fmtMoney(summary.activeQardHasanTotal, summary.currency)],
    [
      `Month Contributions (${summary.monthKey})`,
      `${fmtMoney(summary.monthContributionsCollected, summary.currency)} / ${fmtMoney(summary.monthContributionsTarget, summary.currency)}`,
    ],
    [
      'Member Clearance Standing',
      `${summary.clearedMembersCount} / ${summary.contributingMembersCount} members cleared`,
    ],
    ['Rotating Duty Manager', `${summary.currentManagerName} (${summary.currentCycleWindow})`],
  ];

  const colW = (pageWidth - margin * 2 - 4) / 2;
  kpis.forEach(([label, val], idx) => {
    const col = idx % 2;
    const row = Math.floor(idx / 2);
    const boxX = margin + col * (colW + 4);
    const boxY = y + row * 15;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(boxX, boxY, colW, 13, 2, 2, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(label, boxX + 3, boxY + 5);
    doc.setFont('courier', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text(doc.splitTextToSize(val, colW - 6)[0] || val, boxX + 3, boxY + 10.5);
  });

  y += Math.ceil(kpis.length / 2) * 15 + 6;

  // Active Qard Hasan Section
  ensurePageSpace(20);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(15, 118, 110);
  doc.text(`Active Qard Hasan Portfolio (${summary.activeLoans.length})`, margin, y);
  y += 4;

  if (summary.activeLoans.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text('No active Qard Hasan loans currently outstanding.', margin, y + 3);
    y += 10;
  } else {
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, y, pageWidth - margin * 2, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    doc.text('Loan ID', margin + 2, y + 4.8);
    doc.text('Borrower', margin + 34, y + 4.8);
    doc.text('Principal', margin + 96, y + 4.8);
    doc.text('Remaining Due', margin + 136, y + 4.8);
    y += 8;

    summary.activeLoans.forEach((loan) => {
      ensurePageSpace(7);
      doc.setFont('courier', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      doc.text(loan.id, margin + 2, y + 4);
      doc.setFont('helvetica', 'normal');
      doc.text(`${loan.borrowerName} (${loan.borrowerCode})`.slice(0, 32), margin + 34, y + 4);
      doc.setFont('courier', 'normal');
      doc.text(fmtMoney(loan.principal, summary.currency), margin + 96, y + 4);
      doc.text(fmtMoney(loan.remainingBalance, summary.currency), margin + 136, y + 4);
      doc.setDrawColor(241, 245, 249);
      doc.line(margin, y + 6, pageWidth - margin, y + 6);
      y += 6.5;
    });
    y += 5;
  }

  // Month Contributions Table
  ensurePageSpace(20);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(5, 150, 105);
  doc.text(`Monthly Contribution Entries — ${summary.monthKey} (${summary.monthContributions.length})`, margin, y);
  y += 4;

  if (summary.monthContributions.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`No contribution submissions recorded for ${summary.monthKey}.`, margin, y + 3);
    y += 10;
  } else {
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, y, pageWidth - margin * 2, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    doc.text('Code', margin + 2, y + 4.8);
    doc.text('Member', margin + 26, y + 4.8);
    doc.text('Amount', margin + 88, y + 4.8);
    doc.text('Channel', margin + 122, y + 4.8);
    doc.text('Status', margin + 150, y + 4.8);
    y += 8;

    summary.monthContributions.forEach((entry) => {
      ensurePageSpace(7);
      doc.setFont('courier', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      doc.text(entry.memberCode, margin + 2, y + 4);
      doc.setFont('helvetica', 'normal');
      doc.text(entry.memberName.slice(0, 30), margin + 26, y + 4);
      doc.setFont('courier', 'normal');
      doc.text(fmtMoney(entry.amount, summary.currency), margin + 88, y + 4);
      doc.text(entry.channel, margin + 122, y + 4);
      doc.text(entry.status.toUpperCase(), margin + 150, y + 4);
      doc.setDrawColor(241, 245, 249);
      doc.line(margin, y + 6, pageWidth - margin, y + 6);
      y += 6.5;
    });
  }

  const arrayBuffer = doc.output('arraybuffer');
  const buffer = Buffer.from(arrayBuffer);
  return {
    buffer,
    filename: `amanah-monthly-summary-${summary.monthKey}.pdf`,
    summary,
  };
}
