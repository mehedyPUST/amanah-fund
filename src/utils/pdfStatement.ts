import { jsPDF } from 'jspdf';
import type { AppLocale } from '../i18n/config.ts';
import { getMessagesForLocale, translateStatusLabel } from '../i18n/messages.ts';
import type {
  Contribution,
  FundConfig,
  LoanRequest,
  PublicUser,
} from '../types/coop.ts';
import { formatBillingMonth, formatDateTime, formatShortDate } from './format.ts';

export interface PdfStatementInput {
  user: PublicUser;
  config: FundConfig | null;
  contributions: Contribution[];
  loans: LoanRequest[];
  scope: 'mine' | 'all';
  locale?: AppLocale;
}

function pdfMoney(amount: number, currency: FundConfig['currency']): string {
  const formatted = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
  }).format(Math.round(amount || 0));
  return `${currency} ${formatted}`;
}

function fillTemplate(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce(
    (acc, [key, value]) => acc.replaceAll(`{${key}}`, String(value)),
    template
  );
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function printBanglaStatementViaIframe({
  user,
  fundName,
  currency,
  scope,
  scopedContribs,
  scopedLoans,
  approvedContribTotal,
  pendingContribTotal,
  totalLoanPrincipal,
  totalLoanRepaid,
  activeLoanBalance,
}: {
  user: PublicUser;
  fundName: string;
  currency: FundConfig['currency'];
  scope: 'mine' | 'all';
  scopedContribs: Contribution[];
  scopedLoans: LoanRequest[];
  approvedContribTotal: number;
  pendingContribTotal: number;
  totalLoanPrincipal: number;
  totalLoanRepaid: number;
  activeLoanBalance: number;
}): void {
  const messages = getMessagesForLocale('bn');
  const pdf = messages.PDF;
  const common = messages.Common;

  const statementTitle =
    scope === 'mine' ? pdf.memberStatementTitle : pdf.coopStatementTitle;
  const generatedAt = formatDateTime(new Date().toISOString());

  const repaymentRows = scopedLoans.flatMap((loan) =>
    loan.installments.map((inst) => ({ loan, inst }))
  );

  const loansSectionHtml =
    scopedLoans.length === 0
      ? `<p class="empty">${escapeHtml(pdf.noLoans)}</p>`
      : `<table>
          <thead>
            <tr>
              <th>${escapeHtml(pdf.colLoanId)}</th>
              <th>${escapeHtml(pdf.colRequested)}</th>
              <th>${escapeHtml(pdf.colStatus)}</th>
              <th>${escapeHtml(pdf.colPlan)}</th>
              <th class="num">${escapeHtml(pdf.colPrincipal)}</th>
              <th class="num">${escapeHtml(pdf.colRepaid)}</th>
              <th class="num">${escapeHtml(pdf.colBalance)}</th>
            </tr>
          </thead>
          <tbody>
            ${scopedLoans
              .map((loan) => {
                const txSuffix = loan.disbursementSignature?.transactionNumber
                  ? ` | Tx #: ${loan.disbursementSignature.transactionNumber}`
                  : '';
                return `<tr>
                  <td class="mono">${escapeHtml(loan.id)}</td>
                  <td>${escapeHtml(formatShortDate(loan.requestedAt))}</td>
                  <td>${escapeHtml(translateStatusLabel(loan.status, 'bn'))}</td>
                  <td>${escapeHtml(`${loan.installmentMonths} ${common.monthsShort}`)}</td>
                  <td class="num mono">${escapeHtml(pdfMoney(loan.amount, currency))}</td>
                  <td class="num mono">${escapeHtml(pdfMoney(loan.totalRepaid, currency))}</td>
                  <td class="num mono">${escapeHtml(pdfMoney(loan.remainingBalance, currency))}</td>
                </tr>
                <tr class="sub-row">
                  <td colspan="7">${escapeHtml(`${pdf.purposePrefix}: ${loan.purpose}${txSuffix}`)}</td>
                </tr>`;
              })
              .join('')}
          </tbody>
        </table>`;

  const contribsSectionHtml =
    scopedContribs.length === 0
      ? `<p class="empty">${escapeHtml(pdf.noContributions)}</p>`
      : `<table>
          <thead>
            <tr>
              <th>${escapeHtml(pdf.colMonth)}</th>
              <th>${escapeHtml(pdf.colSubmitted)}</th>
              <th>${escapeHtml(pdf.colChannelProvider)}</th>
              <th>${escapeHtml(pdf.colReference)}</th>
              <th>${escapeHtml(pdf.colStatus)}</th>
              <th class="num">${escapeHtml(pdf.colAmount)}</th>
            </tr>
          </thead>
          <tbody>
            ${scopedContribs
              .map(
                (c) => `<tr>
                  <td>${escapeHtml(formatBillingMonth(c.billingMonth))}</td>
                  <td>${escapeHtml(formatShortDate(c.submittedAt))}</td>
                  <td>${escapeHtml(`${c.channel.toUpperCase()} / ${c.providerName}`)}</td>
                  <td class="mono">${escapeHtml(c.decryptedDetails?.referenceId || c.maskedReference)}</td>
                  <td>${escapeHtml(translateStatusLabel(c.status, 'bn'))}</td>
                  <td class="num mono">${escapeHtml(pdfMoney(c.amount, currency))}</td>
                </tr>`
              )
              .join('')}
          </tbody>
        </table>`;

  const repaymentsSectionHtml =
    repaymentRows.length === 0
      ? ''
      : `<h2>${escapeHtml(fillTemplate(pdf.section3Title, { count: repaymentRows.length }))}</h2>
        <table>
          <thead>
            <tr>
              <th>${escapeHtml(pdf.colLoanId)}</th>
              <th>${escapeHtml(pdf.colInstallment)}</th>
              <th>${escapeHtml(pdf.colDueDate)}</th>
              <th>${escapeHtml(pdf.colStatus)}</th>
              <th>${escapeHtml(pdf.colReference)}</th>
              <th class="num">${escapeHtml(pdf.colAmount)}</th>
            </tr>
          </thead>
          <tbody>
            ${repaymentRows
              .map(
                ({ loan, inst }) => `<tr>
                  <td class="mono">${escapeHtml(loan.id)}</td>
                  <td>#${inst.installmentNumber} / ${loan.installmentMonths}</td>
                  <td>${escapeHtml(formatShortDate(inst.dueDate))}</td>
                  <td>${escapeHtml(translateStatusLabel(inst.status, 'bn'))}</td>
                  <td class="mono">${escapeHtml(inst.decryptedReceipt?.referenceId || inst.maskedReference || '-')}</td>
                  <td class="num mono">${escapeHtml(pdfMoney(inst.status === 'paid' ? inst.paidAmount : inst.amount, currency))}</td>
                </tr>`
              )
              .join('')}
          </tbody>
        </table>`;

  const html = `<!doctype html>
<html lang="bn">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(fundName)} - ${escapeHtml(statementTitle)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Anek+Bangla:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    @page { size: A4 portrait; margin: 16mm; }
    * { box-sizing: border-box; }
    body {
      font-family: "Anek Bangla", "Noto Sans Bengali", system-ui, sans-serif;
      color: #0f172a;
      margin: 0;
      padding: 0;
      font-size: 11.5px;
      line-height: 1.5;
      background: #ffffff;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      border-bottom: 1.5px solid #e2e8f0;
      padding-bottom: 10px;
      margin-bottom: 12px;
      gap: 12px;
    }
    .fund-name { font-size: 18px; font-weight: 700; color: #0f172a; margin: 0; }
    .shariah-tag { font-size: 10px; font-weight: 600; color: #059669; text-align: right; }
    .doc-title { font-size: 14px; font-weight: 700; color: #334155; margin: 0 0 12px 0; }
    .meta {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4px 16px;
      font-size: 11px;
      color: #475569;
      margin-bottom: 14px;
    }
    .meta .right { text-align: right; }
    .summary {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 10px 12px;
      margin-bottom: 18px;
    }
    .card-label { font-size: 10px; color: #64748b; }
    .card-value { font-size: 13px; font-weight: 700; color: #0f172a; margin: 2px 0; }
    .card-sub { font-size: 9.5px; color: #64748b; }
    h2 {
      font-size: 13px;
      font-weight: 700;
      color: #0f172a;
      margin: 16px 0 8px 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 14px;
      font-size: 10.5px;
    }
    th {
      background: #f1f5f9;
      color: #334155;
      font-weight: 600;
      text-align: left;
      padding: 6px 7px;
      border-bottom: 1px solid #cbd5e1;
    }
    td {
      padding: 6px 7px;
      border-bottom: 1px solid #e2e8f0;
      vertical-align: top;
    }
    tr.sub-row td {
      padding-top: 2px;
      padding-bottom: 6px;
      font-size: 9.5px;
      color: #64748b;
    }
    .num { text-align: right; white-space: nowrap; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .empty { color: #64748b; font-size: 11px; margin: 4px 0 14px 0; }
    .footer {
      margin-top: 20px;
      padding-top: 8px;
      border-top: 1px solid #e2e8f0;
      font-size: 10px;
      color: #64748b;
      display: flex;
      justify-content: space-between;
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <p class="fund-name">${escapeHtml(fundName)}</p>
    </div>
    <div class="shariah-tag">${escapeHtml(pdf.shariahHeader)}</div>
  </div>
  <p class="doc-title">${escapeHtml(statementTitle)}</p>
  <div class="meta">
    <div>${escapeHtml(`${pdf.member}: ${user.name} (${user.memberCode})`)}</div>
    <div class="right">${escapeHtml(`${pdf.generated}: ${generatedAt}`)}</div>
    <div>${escapeHtml(`${pdf.email}: ${user.email}`)}</div>
    <div class="right">${escapeHtml(`${pdf.currency}: ${currency}`)}</div>
  </div>
  <div class="summary">
    <div>
      <div class="card-label">${escapeHtml(pdf.approvedContributions)}</div>
      <div class="card-value mono">${escapeHtml(pdfMoney(approvedContribTotal, currency))}</div>
      <div class="card-sub">${escapeHtml(fillTemplate(pdf.verifiedCount, { count: scopedContribs.filter((c) => c.status === 'approved').length }))}</div>
    </div>
    <div>
      <div class="card-label">${escapeHtml(pdf.pendingContributions)}</div>
      <div class="card-value mono">${escapeHtml(pdfMoney(pendingContribTotal, currency))}</div>
      <div class="card-sub">${escapeHtml(fillTemplate(pdf.awaitingCheckCount, { count: scopedContribs.filter((c) => c.status === 'pending').length }))}</div>
    </div>
    <div>
      <div class="card-label">${escapeHtml(pdf.totalLoanPrincipal)}</div>
      <div class="card-value mono">${escapeHtml(pdfMoney(totalLoanPrincipal, currency))}</div>
      <div class="card-sub">${escapeHtml(fillTemplate(pdf.totalRequestsCount, { count: scopedLoans.length }))}</div>
    </div>
    <div>
      <div class="card-label">${escapeHtml(pdf.activeBalanceDue)}</div>
      <div class="card-value mono">${escapeHtml(pdfMoney(activeLoanBalance, currency))}</div>
      <div class="card-sub">${escapeHtml(fillTemplate(pdf.repaidPrefix, { amount: pdfMoney(totalLoanRepaid, currency) }))}</div>
    </div>
  </div>
  <h2>${escapeHtml(fillTemplate(pdf.section1Title, { count: scopedLoans.length }))}</h2>
  ${loansSectionHtml}
  <h2>${escapeHtml(fillTemplate(pdf.section2Title, { count: scopedContribs.length }))}</h2>
  ${contribsSectionHtml}
  ${repaymentsSectionHtml}
  <div class="footer">
    <span>${escapeHtml(fillTemplate(pdf.footerLeft, { fundName }))}</span>
    <span>${escapeHtml(generatedAt)}</span>
  </div>
</body>
</html>`;

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.opacity = '0';
  document.body.appendChild(iframe);

  const cleanup = () => {
    if (iframe.parentNode) {
      iframe.parentNode.removeChild(iframe);
    }
  };

  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc || !iframe.contentWindow) {
    cleanup();
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  const triggerPrint = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } finally {
      window.setTimeout(cleanup, 1500);
    }
  };

  const fontsApi = (doc as Document & { fonts?: { ready?: Promise<unknown> } }).fonts;
  if (fontsApi?.ready) {
    fontsApi.ready.then(() => window.setTimeout(triggerPrint, 120)).catch(() => triggerPrint());
  } else {
    window.setTimeout(triggerPrint, 350);
  }
}

export function downloadContributionAndLoanPdfStatement({
  user,
  config,
  contributions,
  loans,
  scope,
  locale = 'en',
}: PdfStatementInput): void {
  const currency: FundConfig['currency'] = config?.currency || 'BDT';
  const fundName = config?.fundName || 'Amanah';

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

  if (locale === 'bn' && typeof document !== 'undefined') {
    printBanglaStatementViaIframe({
      user,
      fundName,
      currency,
      scope,
      scopedContribs,
      scopedLoans,
      approvedContribTotal,
      pendingContribTotal,
      totalLoanPrincipal,
      totalLoanRepaid,
      activeLoanBalance,
    });
    return;
  }

  const messages = getMessagesForLocale('en');
  const pdf = messages.PDF;
  const common = messages.Common;

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
  doc.text(pdf.shariahHeader, pageWidth - margin, y, {
    align: 'right',
  });

  y += 18;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(51, 65, 85);
  doc.text(
    scope === 'mine' ? pdf.memberStatementTitle : pdf.coopStatementTitle,
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
  doc.text(`${pdf.member}: ${user.name} (${user.memberCode})`, margin, y);
  doc.text(`${pdf.generated}: ${formatDateTime(new Date().toISOString())}`, pageWidth - margin, y, {
    align: 'right',
  });
  y += 14;
  doc.text(`${pdf.email}: ${user.email}`, margin, y);
  doc.text(`${pdf.currency}: ${currency}`, pageWidth - margin, y, { align: 'right' });

  y += 18;

  // Summary Box
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, y, contentWidth, 68, 4, 4, 'FD');

  const colW = contentWidth / 4;
  const summaryCards = [
    {
      label: pdf.approvedContributions,
      value: pdfMoney(approvedContribTotal, currency),
      sub: fillTemplate(pdf.verifiedCount, {
        count: scopedContribs.filter((c) => c.status === 'approved').length,
      }),
    },
    {
      label: pdf.pendingContributions,
      value: pdfMoney(pendingContribTotal, currency),
      sub: fillTemplate(pdf.awaitingCheckCount, {
        count: scopedContribs.filter((c) => c.status === 'pending').length,
      }),
    },
    {
      label: pdf.totalLoanPrincipal,
      value: pdfMoney(totalLoanPrincipal, currency),
      sub: fillTemplate(pdf.totalRequestsCount, { count: scopedLoans.length }),
    },
    {
      label: pdf.activeBalanceDue,
      value: pdfMoney(activeLoanBalance, currency),
      sub: fillTemplate(pdf.repaidPrefix, {
        amount: pdfMoney(totalLoanRepaid, currency),
      }),
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
  doc.text(fillTemplate(pdf.section1Title, { count: scopedLoans.length }), margin, y);
  y += 12;

  if (scopedLoans.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(pdf.noLoans, margin, y + 6);
    y += 24;
  } else {
    // Table Header
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, y, contentWidth, 20, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    doc.text(pdf.colLoanId, margin + 6, y + 13);
    doc.text(pdf.colRequested, margin + 88, y + 13);
    doc.text(pdf.colStatus, margin + 158, y + 13);
    doc.text(pdf.colPlan, margin + 258, y + 13);
    doc.text(pdf.colPrincipal, margin + 356, y + 13, { align: 'right' });
    doc.text(pdf.colRepaid, margin + 432, y + 13, { align: 'right' });
    doc.text(pdf.colBalance, pageWidth - margin - 6, y + 13, { align: 'right' });
    y += 22;

    scopedLoans.forEach((loan) => {
      ensureSpace(34);
      doc.setFont('courier', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      doc.text(loan.id, margin + 6, y + 11);

      doc.setFont('helvetica', 'normal');
      doc.text(formatShortDate(loan.requestedAt), margin + 88, y + 11);
      doc.text(translateStatusLabel(loan.status, 'en'), margin + 158, y + 11);
      doc.text(`${loan.installmentMonths} ${common.monthsShort}`, margin + 258, y + 11);
      doc.text(pdfMoney(loan.amount, currency), margin + 356, y + 11, { align: 'right' });
      doc.text(pdfMoney(loan.totalRepaid, currency), margin + 432, y + 11, { align: 'right' });
      doc.text(pdfMoney(loan.remainingBalance, currency), pageWidth - margin - 6, y + 11, {
        align: 'right',
      });

      y += 15;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      const txSuffix = loan.disbursementSignature?.transactionNumber
        ? ` | Tx #: ${loan.disbursementSignature.transactionNumber}`
        : '';
      const purposeLine = doc.splitTextToSize(
        `${pdf.purposePrefix}: ${loan.purpose}${txSuffix}`,
        contentWidth - 16
      );
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
  doc.text(fillTemplate(pdf.section2Title, { count: scopedContribs.length }), margin, y);
  y += 12;

  if (scopedContribs.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(pdf.noContributions, margin, y + 6);
    y += 24;
  } else {
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, y, contentWidth, 20, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    doc.text(pdf.colMonth, margin + 6, y + 13);
    doc.text(pdf.colSubmitted, margin + 88, y + 13);
    doc.text(pdf.colChannelProvider, margin + 178, y + 13);
    doc.text(pdf.colReference, margin + 306, y + 13);
    doc.text(pdf.colStatus, margin + 402, y + 13);
    doc.text(pdf.colAmount, pageWidth - margin - 6, y + 13, { align: 'right' });
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
      doc.text(translateStatusLabel(c.status, 'en'), margin + 402, y + 11);
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
    doc.text(fillTemplate(pdf.section3Title, { count: repaymentRows.length }), margin, y);
    y += 12;

    doc.setFillColor(241, 245, 249);
    doc.rect(margin, y, contentWidth, 20, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    doc.text(pdf.colLoanId, margin + 6, y + 13);
    doc.text(pdf.colInstallment, margin + 100, y + 13);
    doc.text(pdf.colDueDate, margin + 178, y + 13);
    doc.text(pdf.colStatus, margin + 266, y + 13);
    doc.text(pdf.colReference, margin + 366, y + 13);
    doc.text(pdf.colAmount, pageWidth - margin - 6, y + 13, { align: 'right' });
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
      doc.text(translateStatusLabel(inst.status, 'en'), margin + 266, y + 11);
      doc.setFont('courier', 'normal');
      doc.text(
        inst.decryptedReceipt?.referenceId || inst.maskedReference || '-',
        margin + 366,
        y + 11
      );
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
    doc.text(fillTemplate(pdf.footerLeft, { fundName }), margin, pageHeight - 24);
    doc.text(fillTemplate(pdf.pageOf, { page: p, total: totalPages }), pageWidth - margin, pageHeight - 24, {
      align: 'right',
    });
  }

  const dateStamp = new Date().toISOString().slice(0, 10);
  const fileScope = scope === 'mine' ? user.memberCode.toLowerCase() : 'coop-all';
  doc.save(`amanah-statement-${fileScope}-${dateStamp}.pdf`);
}
