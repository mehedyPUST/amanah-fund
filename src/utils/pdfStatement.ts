import { jsPDF } from 'jspdf';
import type { Contribution, FundConfig, LoanRequest, PublicUser } from '../types/coop.ts';
import { formatBillingMonth, formatDateTime, formatShortDate } from './format.ts';

export interface PdfStatementInput {
  user: PublicUser;
  config: FundConfig | null;
  contributions: Contribution[];
  loans: LoanRequest[];
  scope: 'mine' | 'all';
}

function pdfMoney(amount: number, currency: FundConfig['currency']): string {
  const formatted = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
  }).format(Math.round(amount || 0));
  return `${currency} ${formatted}`;
}

export function downloadContributionAndLoanPdfStatement({
  user,
  config,
  contributions,
  loans,
  scope,
}: PdfStatementInput): void {
  const currency: FundConfig['currency'] = config?.currency || 'BDT';
  const fundName = config?.fundName || 'Amanah Co-op Treasury';

  const scopedContribs = (
    scope === 'mine' ? contributions.filter((c) => c.userId === user.id) : contributions
  )
    .slice()
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));

  const scopedLoans = (
    scope === 'mine' ? loans.filter((l) => l.borrowerId === user.id) : loans
  )
    .slice()
    .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));

  const approvedContribTotal = scopedContribs
    .filter((c) => c.status === 'approved')
    .reduce((sum, c) => sum + c.amount, 0);
  const pendingContribTotal = scopedContribs
    .filter((c) => c.status === 'pending')
    .reduce((sum, c) => sum + c.amount, 0);

  const totalLoanPrincipal = scopedLoans
    .filter((l) => l.status !== 'rejected')
    .reduce((sum, l) => sum + l.amount, 0);
  const totalLoanRepaid = scopedLoans.reduce((sum, l) => sum + l.totalRepaid, 0);
  const activeLoanBalance = scopedLoans
    .filter((l) => l.status === 'active')
    .reduce((sum, l) => sum + l.remainingBalance, 0);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  const contentWidth = pageWidth - margin * 2;
  let y = 46;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - 48) {
      doc.addPage();
      y = 46;
    }
  };

  const drawHorizontalRule = (yPos: number) => {
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.75);
    doc.line(margin, yPos, pageWidth - margin, yPos);
  };

  // Document Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.text(fundName, margin, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(5, 150, 105);
  doc.text('SHARIAH-COMPLIANT QARD HASAN STATEMENT (0% INTEREST)', pageWidth - margin, y, {
    align: 'right',
  });

  y += 18;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(51, 65, 85);
  doc.text(
    scope === 'mine'
      ? 'Member Contribution & Qard Hasan Loan Summary Statement'
      : 'Cooperative Contribution & Qard Hasan Portfolio Statement',
    margin,
    y
  );

  y += 14;
  drawHorizontalRule(y);
  y += 16;

  // Member & Statement Metadata
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`Member: ${user.name} (${user.memberCode})`, margin, y);
  doc.text(`Generated: ${formatDateTime(new Date().toISOString())}`, pageWidth - margin, y, {
    align: 'right',
  });
  y += 14;
  doc.text(`Email: ${user.email}`, margin, y);
  doc.text(`Statement Currency: ${currency}`, pageWidth - margin, y, { align: 'right' });

  y += 18;

  // Summary Box
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, y, contentWidth, 68, 4, 4, 'FD');

  const colW = contentWidth / 4;
  const summaryCards = [
    {
      label: 'Approved Contributions',
      value: pdfMoney(approvedContribTotal, currency),
      sub: `${scopedContribs.filter((c) => c.status === 'approved').length} verified`,
    },
    {
      label: 'Pending Contributions',
      value: pdfMoney(pendingContribTotal, currency),
      sub: `${scopedContribs.filter((c) => c.status === 'pending').length} awaiting check`,
    },
    {
      label: 'Total Loan Principal',
      value: pdfMoney(totalLoanPrincipal, currency),
      sub: `${scopedLoans.length} total request(s)`,
    },
    {
      label: 'Active Balance Due',
      value: pdfMoney(activeLoanBalance, currency),
      sub: `Repaid: ${pdfMoney(totalLoanRepaid, currency)}`,
    },
  ];

  summaryCards.forEach((card, idx) => {
    const cx = margin + 12 + idx * colW;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(card.label, cx, y + 18);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(card.value, cx, y + 36);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(card.sub, cx, y + 52);
  });

  y += 90;

  // Section 1: Qard Hasan Loan Summary
  ensureSpace(64);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(`1. Qard Hasan Loan Summary (${scopedLoans.length})`, margin, y);
  y += 12;

  if (scopedLoans.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text('No Qard Hasan loan requests recorded in this statement scope.', margin, y + 6);
    y += 24;
  } else {
    // Table Header
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, y, contentWidth, 20, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    doc.text('Loan ID', margin + 6, y + 13);
    doc.text('Requested', margin + 88, y + 13);
    doc.text('Status', margin + 158, y + 13);
    doc.text('Plan', margin + 258, y + 13);
    doc.text('Principal', margin + 356, y + 13, { align: 'right' });
    doc.text('Repaid', margin + 432, y + 13, { align: 'right' });
    doc.text('Balance', pageWidth - margin - 6, y + 13, { align: 'right' });
    y += 22;

    scopedLoans.forEach((loan) => {
      ensureSpace(34);
      doc.setFont('courier', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      doc.text(loan.id, margin + 6, y + 11);

      doc.setFont('helvetica', 'normal');
      doc.text(formatShortDate(loan.requestedAt), margin + 88, y + 11);
      doc.text(loan.status.replace(/_/g, ' '), margin + 158, y + 11);
      doc.text(`${loan.installmentMonths} mo`, margin + 258, y + 11);
      doc.text(pdfMoney(loan.amount, currency), margin + 356, y + 11, { align: 'right' });
      doc.text(pdfMoney(loan.totalRepaid, currency), margin + 432, y + 11, { align: 'right' });
      doc.text(pdfMoney(loan.remainingBalance, currency), pageWidth - margin - 6, y + 11, {
        align: 'right',
      });

      y += 15;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      const purposeLine = doc.splitTextToSize(`Purpose: ${loan.purpose}`, contentWidth - 16);
      doc.text(purposeLine[0] || '', margin + 6, y + 6);
      y += 12;
      drawHorizontalRule(y);
      y += 4;
    });
    y += 12;
  }

  // Section 2: Monthly Contributions Summary
  ensureSpace(64);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(`2. Monthly Contributions Summary (${scopedContribs.length})`, margin, y);
  y += 12;

  if (scopedContribs.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text('No monthly contribution entries recorded in this statement scope.', margin, y + 6);
    y += 24;
  } else {
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, y, contentWidth, 20, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    doc.text('Month', margin + 6, y + 13);
    doc.text('Submitted', margin + 88, y + 13);
    doc.text('Channel & Provider', margin + 178, y + 13);
    doc.text('Reference', margin + 306, y + 13);
    doc.text('Status', margin + 402, y + 13);
    doc.text('Amount', pageWidth - margin - 6, y + 13, { align: 'right' });
    y += 22;

    scopedContribs.forEach((c) => {
      ensureSpace(22);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      doc.text(formatBillingMonth(c.billingMonth), margin + 6, y + 11);
      doc.text(formatShortDate(c.submittedAt), margin + 88, y + 11);
      doc.text(`${c.channel.toUpperCase()} / ${c.providerName}`, margin + 178, y + 11);
      doc.setFont('courier', 'normal');
      doc.text(c.decryptedDetails?.referenceId || c.maskedReference, margin + 306, y + 11);
      doc.setFont('helvetica', 'normal');
      doc.text(c.status, margin + 402, y + 11);
      doc.text(pdfMoney(c.amount, currency), pageWidth - margin - 6, y + 11, {
        align: 'right',
      });
      y += 18;
      drawHorizontalRule(y);
      y += 2;
    });
    y += 14;
  }

  // Section 3: Active Loan Installment Repayments (if any)
  const repaymentRows = scopedLoans.flatMap((loan) =>
    loan.installments.map((inst) => ({ loan, inst }))
  );
  if (repaymentRows.length > 0) {
    ensureSpace(64);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(`3. Loan Installment Schedule & Repayments (${repaymentRows.length})`, margin, y);
    y += 12;

    doc.setFillColor(241, 245, 249);
    doc.rect(margin, y, contentWidth, 20, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    doc.text('Loan ID', margin + 6, y + 13);
    doc.text('Installment', margin + 100, y + 13);
    doc.text('Due Date', margin + 178, y + 13);
    doc.text('Status', margin + 266, y + 13);
    doc.text('Reference', margin + 366, y + 13);
    doc.text('Amount', pageWidth - margin - 6, y + 13, { align: 'right' });
    y += 22;

    repaymentRows.forEach(({ loan, inst }) => {
      ensureSpace(22);
      doc.setFont('courier', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      doc.text(loan.id, margin + 6, y + 11);

      doc.setFont('helvetica', 'normal');
      doc.text(`#${inst.installmentNumber} / ${loan.installmentMonths}`, margin + 100, y + 11);
      doc.text(formatShortDate(inst.dueDate), margin + 178, y + 11);
      doc.text(inst.status.replace(/_/g, ' '), margin + 266, y + 11);
      doc.setFont('courier', 'normal');
      doc.text(inst.decryptedReceipt?.referenceId || inst.maskedReference || '-', margin + 366, y + 11);
      doc.setFont('helvetica', 'normal');
      doc.text(
        pdfMoney(inst.status === 'paid' ? inst.paidAmount : inst.amount, currency),
        pageWidth - margin - 6,
        y + 11,
        { align: 'right' }
      );
      y += 18;
      drawHorizontalRule(y);
      y += 2;
    });
  }

  // Page Footer on all pages
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p += 1) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `${fundName} · 0% Interest Qard Hasan & Cooperative Ledger`,
      margin,
      pageHeight - 24
    );
    doc.text(`Page ${p} of ${totalPages}`, pageWidth - margin, pageHeight - 24, {
      align: 'right',
    });
  }

  const dateStamp = new Date().toISOString().slice(0, 10);
  const fileScope = scope === 'mine' ? user.memberCode.toLowerCase() : 'coop-all';
  doc.save(`amanah-statement-${fileScope}-${dateStamp}.pdf`);
}
