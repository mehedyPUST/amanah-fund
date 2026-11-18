import { jsPDF } from 'jspdf';
import type {
  FundConfig,
  MonthlySheetData,
  MonthlySheetMemberRow,
  PublicUser,
} from '../types/coop.ts';
import { formatDateTime } from './format.ts';

export interface BalanceSheetPdfOptions {
  sheet: MonthlySheetData;
  rows: MonthlySheetMemberRow[];
  isFiltered: boolean;
  filterLabel?: string;
  fundName: string;
  preparedBy: PublicUser | null;
}

export type MonthlySheetPdfOptions = BalanceSheetPdfOptions;

function formatFullMonthLabel(ym: string): string {
  const match = ym.match(/^(\d{4})-(\d{2})$/);
  if (!match) return ym;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function formatShortMonthLabel(ym: string): string {
  const match = ym.match(/^(\d{4})-(\d{2})$/);
  if (!match) return ym;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function fmtAmount(amount: number, currency: FundConfig['currency'], showZeroAsDash = true): string {
  const rounded = Math.round((amount || 0) * 100) / 100;
  if (showZeroAsDash && rounded === 0) return '-';
  const formatted = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
  }).format(Math.abs(Math.round(rounded)));
  const sign = rounded < 0 ? '-' : '';
  return `${sign}${currency} ${formatted}`;
}

function fmtSigned(amount: number, currency: FundConfig['currency']): string {
  const rounded = Math.round(amount || 0);
  if (rounded === 0) return `${currency} 0`;
  const formatted = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
  }).format(Math.abs(rounded));
  return `${rounded > 0 ? '+' : '-'}${currency} ${formatted}`;
}

function fmtStatusLabel(row: MonthlySheetMemberRow): string {
  switch (row.contributionStatus) {
    case 'paid':
      return 'Paid';
    case 'partial':
      return 'Partial';
    case 'pending':
      return 'Pending';
    default:
      return 'Due';
  }
}

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1))}…`;
}

export function exportBalanceSheetPdf({
  sheet,
  rows,
  isFiltered,
  filterLabel,
  fundName,
  preparedBy,
}: BalanceSheetPdfOptions): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth(); // 841.89 pt
  const pageHeight = doc.internal.pageSize.getHeight(); // 595.28 pt
  const marginX = 28;
  const contentWidth = pageWidth - marginX * 2; // ~785.89 pt
  const footerReserve = 34;

  const ccy = sheet.currency || 'BDT';
  const fullMonth = formatFullMonthLabel(sheet.month);
  const prevShort = formatShortMonthLabel(sheet.previousMonth);
  const currShort = formatShortMonthLabel(sheet.month);
  const nextShort = formatShortMonthLabel(sheet.nextMonth);
  const generatedAt = formatDateTime(new Date().toISOString());

  const totalMembers = sheet.rows.length;
  const paidCount = sheet.rows.filter((r) => r.contributionStatus === 'paid').length;
  const expectedCollection = totalMembers * (sheet.monthlyTarget || 0);
  const collectionPct =
    expectedCollection > 0
      ? Math.min(100, Math.round((sheet.thisMonthOnly.contributionAmount / expectedCollection) * 100))
      : 0;
  const netAvailableFund = Math.max(
    0,
    Math.round((sheet.fundSummary.fundHeight - sheet.fundSummary.totalDueHasana) * 100) / 100
  );
  const netCashFlow =
    Math.round(
      (sheet.thisMonthOnly.contributionAmount +
        sheet.thisMonthRepaidAmount -
        sheet.thisMonthOnly.qardHasanAmount) *
        100
    ) / 100;
  const closingNetEquity =
    Math.round(
      (sheet.thisMonthSummary.contributionAmount - sheet.thisMonthSummary.dueHasanaAmount) * 100
    ) / 100;

  // Column widths summing strictly to contentWidth (~785.89 pt)
  const fixedCols = [
    { key: 'sn', label: '#', width: 20, align: 'right' as const },
    { key: 'name', label: 'Name', width: 102, align: 'left' as const },
    { key: 'id', label: 'ID', width: 52, align: 'left' as const },
    { key: 'phone', label: 'Phone', width: 72, align: 'left' as const },
    // Prev cumulative (2 cols = 122 pt)
    { key: 'pContrib', label: 'Contribution', width: 62, align: 'right' as const },
    { key: 'pQard', label: 'Qard Hasan', width: 60, align: 'right' as const },
    // Current month activity & refund (3 cols = 186 pt)
    { key: 'cContrib', label: 'Contribution', width: 62, align: 'right' as const },
    { key: 'cQard', label: 'Qard Drawn', width: 60, align: 'right' as const },
    { key: 'cRefund', label: 'Refund Qard', width: 64, align: 'right' as const },
    // Closing summary (4 cols = 231.89 pt)
    { key: 'nContrib', label: 'Contribution', width: 64, align: 'right' as const },
    { key: 'nDue', label: 'Qard Due', width: 60, align: 'right' as const },
    { key: 'equity', label: 'Net Equity', width: 64, align: 'right' as const },
  ];
  const usedWidth = fixedCols.reduce((sum, c) => sum + c.width, 0);
  const colDefs = [
    ...fixedCols,
    { key: 'status', label: 'Status', width: contentWidth - usedWidth, align: 'left' as const },
  ];

  const colX: number[] = [];
  let cursorX = marginX;
  for (const col of colDefs) {
    colX.push(cursorX);
    cursorX += col.width;
  }

  const drawCellText = (
    text: string,
    colIndex: number,
    yBaseline: number,
    options?: { bold?: boolean; color?: [number, number, number]; fontSize?: number; pad?: number }
  ) => {
    const col = colDefs[colIndex];
    const x = colX[colIndex];
    const pad = options?.pad ?? 4;
    doc.setFont('helvetica', options?.bold ? 'bold' : 'normal');
    doc.setFontSize(options?.fontSize ?? 7.3);
    if (options?.color) {
      doc.setTextColor(options.color[0], options.color[1], options.color[2]);
    } else {
      doc.setTextColor(30, 41, 59);
    }
    if (col.align === 'right') {
      doc.text(text, x + col.width - pad, yBaseline, { align: 'right' });
    } else {
      doc.text(text, x + pad, yBaseline);
    }
  };

  let y = 24;

  // Institutional Balance Sheet Masthead
  doc.setFillColor(15, 23, 42);
  doc.roundedRect(marginX, y, contentWidth, 50, 4, 4, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.text(`${truncateText(fundName, 58)} — Balance Sheet`, marginX + 12, y + 20);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.2);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `Period: ${fullMonth} (${sheet.month})  |  Opening from ${prevShort}  |  Closing rolls to ${nextShort}`,
    marginX + 12,
    y + 36
  );

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.2);
  doc.setTextColor(110, 231, 183);
  doc.text('COOPERATIVE BALANCE SHEET LEDGER', pageWidth - marginX - 12, y + 20, {
    align: 'right',
  });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(203, 213, 225);
  const preparerText = preparedBy
    ? `Prepared by: ${preparedBy.name} (${preparedBy.memberCode})  |  ${generatedAt}`
    : `Generated: ${generatedAt}`;
  doc.text(preparerText, pageWidth - marginX - 12, y + 36, { align: 'right' });

  y += 58;

  // Current Month All Variables Summary Strip (4 Columns)
  const kpiHeight = 46;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.65);
  doc.roundedRect(marginX, y, contentWidth, kpiHeight, 3, 3, 'FD');

  const kpiItems = [
    {
      label: `Prev. Cumul. Contrib (${prevShort})`,
      value: fmtAmount(sheet.previousMonthSummary.contributionAmount, ccy, false),
      sub: `Prev Qard: ${fmtAmount(sheet.previousMonthSummary.qardHasanAmount, ccy, false)} | Due: ${fmtAmount(sheet.previousMonthSummary.dueHasanaAmount, ccy, false)}`,
      accent: [15, 23, 42] as [number, number, number],
    },
    {
      label: `Current Month Contribution (${currShort})`,
      value: `+${fmtAmount(sheet.thisMonthOnly.contributionAmount, ccy, false)}`,
      sub: `${paidCount}/${totalMembers} paid (${collectionPct}% of ${fmtAmount(expectedCollection, ccy, false)})`,
      accent: [5, 150, 105] as [number, number, number],
    },
    {
      label: `Current Month Refund Qard Hasan`,
      value: fmtAmount(sheet.thisMonthRepaidAmount, ccy, false),
      sub: `Drawn: ${fmtAmount(sheet.thisMonthOnly.qardHasanAmount, ccy, false)} | Close Due: ${fmtAmount(sheet.thisMonthSummary.dueHasanaAmount, ccy, false)}`,
      accent: [5, 150, 105] as [number, number, number],
    },
    {
      label: `Closing Summary & Treasury`,
      value: fmtAmount(sheet.thisMonthSummary.contributionAmount, ccy, false),
      sub: `Net Flow: ${fmtSigned(netCashFlow, ccy)} | Liquid: ${fmtAmount(netAvailableFund, ccy, false)}`,
      accent: [15, 23, 42] as [number, number, number],
    },
  ];

  const kpiWidth = contentWidth / 4;
  kpiItems.forEach((item, idx) => {
    const kx = marginX + idx * kpiWidth;
    if (idx > 0) {
      doc.setDrawColor(226, 232, 240);
      doc.line(kx, y + 6, kx, y + kpiHeight - 6);
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(item.label, kx + 9, y + 13);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(item.accent[0], item.accent[1], item.accent[2]);
    doc.text(item.value, kx + 9, y + 26.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(71, 85, 105);
    doc.text(truncateText(item.sub, 46), kx + 9, y + 38.5);
  });

  y += kpiHeight + 9;

  if (isFiltered) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.2);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Note: Displaying ${rows.length} of ${sheet.rows.length} active members (${filterLabel || 'filtered view'}). Cooperative Totals reflect all active members.`,
      marginX,
      y + 6
    );
    y += 13;
  }

  const drawTableHeader = (startY: number): number => {
    const groupH = 15;
    const subH = 16;

    const idGroupW = colDefs[0].width + colDefs[1].width + colDefs[2].width + colDefs[3].width;
    const prevGroupW = colDefs[4].width + colDefs[5].width;
    const currGroupW = colDefs[6].width + colDefs[7].width + colDefs[8].width;
    const closeGroupW = colDefs[9].width + colDefs[10].width + colDefs[11].width + colDefs[12].width;

    doc.setFillColor(241, 245, 249);
    doc.rect(colX[0], startY, idGroupW, groupH, 'F');
    doc.setFillColor(241, 245, 249);
    doc.rect(colX[4], startY, prevGroupW, groupH, 'F');
    doc.setFillColor(236, 253, 245);
    doc.rect(colX[6], startY, currGroupW, groupH, 'F');
    doc.setFillColor(241, 245, 249);
    doc.rect(colX[9], startY, closeGroupW, groupH, 'F');

    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.6);
    doc.rect(marginX, startY, contentWidth, groupH + subH);

    doc.line(colX[4], startY, colX[4], startY + groupH + subH);
    doc.line(colX[6], startY, colX[6], startY + groupH + subH);
    doc.line(colX[9], startY, colX[9], startY + groupH + subH);
    doc.line(marginX, startY + groupH, marginX + contentWidth, startY + groupH);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.1);
    doc.setTextColor(51, 65, 85);
    doc.text('Member Details', colX[0] + 6, startY + 10.5);
    doc.text(`Prev. Cumulative (${prevShort})`, colX[4] + prevGroupW / 2, startY + 10.5, {
      align: 'center',
    });
    doc.setTextColor(4, 120, 87);
    doc.text(`Current Month & Refund (${currShort})`, colX[6] + currGroupW / 2, startY + 10.5, {
      align: 'center',
    });
    doc.setTextColor(15, 23, 42);
    doc.text(`Closing Summary (Rolls to ${nextShort})`, colX[9] + closeGroupW / 2, startY + 10.5, {
      align: 'center',
    });

    doc.setFillColor(248, 250, 252);
    doc.rect(marginX + 0.3, startY + groupH + 0.3, contentWidth - 0.6, subH - 0.6, 'F');

    doc.setDrawColor(203, 213, 225);
    for (let i = 1; i < colDefs.length; i += 1) {
      doc.line(colX[i], startY + groupH, colX[i], startY + groupH + subH);
    }

    colDefs.forEach((col, i) => {
      drawCellText(col.label, i, startY + groupH + 11, {
        bold: true,
        fontSize: 6.9,
        color: i === 8 ? [4, 120, 87] : [71, 85, 105],
      });
    });

    return startY + groupH + subH;
  };

  y = drawTableHeader(y);

  const ensureRowSpace = (neededHeight: number) => {
    if (y + neededHeight > pageHeight - footerReserve) {
      doc.addPage();
      y = 24;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.8);
      doc.setTextColor(15, 23, 42);
      doc.text(`${fundName} — Balance Sheet (${fullMonth}) [Continued]`, marginX, y + 8);
      y += 15;
      y = drawTableHeader(y);
    }
  };

  const rowH = 18;

  if (rows.length === 0) {
    ensureRowSpace(26);
    doc.setDrawColor(226, 232, 240);
    doc.rect(marginX, y, contentWidth, 26);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.2);
    doc.setTextColor(100, 116, 139);
    doc.text('No member records match the selected period/filter.', pageWidth / 2, y + 16, {
      align: 'center',
    });
    y += 26;
  } else {
    rows.forEach((row, idx) => {
      ensureRowSpace(rowH);

      if (idx % 2 === 1) {
        doc.setFillColor(249, 250, 251);
        doc.rect(marginX, y, contentWidth, rowH, 'F');
      }

      // Subtle tint on Refund Qard column
      doc.setFillColor(240, 253, 244);
      doc.rect(colX[8], y, colDefs[8].width, rowH, 'F');

      // Spreadsheet gridlines
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.45);
      doc.line(marginX, y + rowH, marginX + contentWidth, y + rowH);
      doc.line(marginX, y, marginX, y + rowH);
      doc.line(marginX + contentWidth, y, marginX + contentWidth, y + rowH);
      for (let i = 1; i < colDefs.length; i += 1) {
        doc.line(colX[i], y, colX[i], y + rowH);
      }

      const baseLine = y + 11.8;
      const netEquity =
        Math.round(
          (row.thisMonthSummary.contributionAmount - row.thisMonthSummary.dueHasanaAmount) * 100
        ) / 100;

      drawCellText(String(row.serialNo), 0, baseLine, { color: [100, 116, 139], fontSize: 7 });
      drawCellText(truncateText(row.name, 22), 1, baseLine, {
        bold: true,
        color: [15, 23, 42],
        fontSize: 7.3,
      });
      drawCellText(row.memberCode, 2, baseLine, { color: [71, 85, 105], fontSize: 7 });
      drawCellText(truncateText(row.mobile, 15), 3, baseLine, { color: [71, 85, 105], fontSize: 7 });

      // Prev cumulative
      drawCellText(fmtAmount(row.previousSummary.contributionAmount, ccy), 4, baseLine, {
        color: row.previousSummary.contributionAmount > 0 ? [30, 41, 59] : [148, 163, 184],
      });
      drawCellText(fmtAmount(row.previousSummary.qardHasanAmount, ccy), 5, baseLine, {
        color: row.previousSummary.qardHasanAmount > 0 ? [30, 41, 59] : [148, 163, 184],
      });

      // Current month activity & refund
      const statusColor: [number, number, number] =
        row.contributionStatus === 'paid'
          ? [5, 150, 105]
          : row.contributionStatus === 'pending' || row.contributionStatus === 'partial'
            ? [180, 83, 9]
            : [190, 18, 60];

      drawCellText(
        row.thisMonth.contributionAmount > 0
          ? fmtAmount(row.thisMonth.contributionAmount, ccy)
          : row.contributionPendingAmount > 0
            ? fmtAmount(row.contributionPendingAmount, ccy)
            : '-',
        6,
        baseLine,
        {
          bold: row.thisMonth.contributionAmount > 0,
          color: statusColor,
        }
      );

      drawCellText(
        row.thisMonth.qardHasanAmount > 0
          ? `+${fmtAmount(row.thisMonth.qardHasanAmount, ccy, false)}`
          : '-',
        7,
        baseLine,
        {
          color: row.thisMonth.qardHasanAmount > 0 ? [180, 83, 9] : [148, 163, 184],
        }
      );

      drawCellText(fmtAmount(row.thisMonth.repaidAmount, ccy), 8, baseLine, {
        bold: row.thisMonth.repaidAmount > 0,
        color: row.thisMonth.repaidAmount > 0 ? [5, 150, 105] : [148, 163, 184],
      });

      // Closing summary
      drawCellText(fmtAmount(row.thisMonthSummary.contributionAmount, ccy, false), 9, baseLine, {
        bold: true,
        color: [15, 23, 42],
      });
      drawCellText(fmtAmount(row.thisMonthSummary.dueHasanaAmount, ccy), 10, baseLine, {
        bold: row.thisMonthSummary.dueHasanaAmount > 0,
        color: row.thisMonthSummary.dueHasanaAmount > 0 ? [180, 83, 9] : [148, 163, 184],
      });
      drawCellText(fmtAmount(netEquity, ccy, false), 11, baseLine, {
        bold: true,
        color: netEquity >= 0 ? [6, 95, 70] : [190, 18, 60],
      });
      drawCellText(fmtStatusLabel(row), 12, baseLine, {
        bold: true,
        color: statusColor,
        fontSize: 7,
      });

      y += rowH;
    });
  }

  // Cooperative Totals Row
  ensureRowSpace(24);
  const totH = 22;
  doc.setFillColor(238, 243, 248);
  doc.rect(marginX, y, contentWidth, totH, 'F');
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(1);
  doc.line(marginX, y, marginX + contentWidth, y);
  doc.setLineWidth(0.7);
  doc.line(marginX, y + totH, marginX + contentWidth, y + totH);
  doc.setDrawColor(203, 213, 225);
  doc.line(marginX, y, marginX, y + totH);
  doc.line(marginX + contentWidth, y, marginX + contentWidth, y + totH);
  for (let i = 4; i < colDefs.length; i += 1) {
    doc.line(colX[i], y, colX[i], y + totH);
  }

  const totY = y + 14;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.6);
  doc.setTextColor(15, 23, 42);
  doc.text(`Cooperative Totals (${sheet.rows.length} Active Members)`, marginX + 6, totY);

  drawCellText(fmtAmount(sheet.previousMonthSummary.contributionAmount, ccy, false), 4, totY, {
    bold: true,
    color: [15, 23, 42],
  });
  drawCellText(fmtAmount(sheet.previousMonthSummary.qardHasanAmount, ccy), 5, totY, {
    bold: true,
    color: [15, 23, 42],
  });
  drawCellText(`+${fmtAmount(sheet.thisMonthOnly.contributionAmount, ccy, false)}`, 6, totY, {
    bold: true,
    color: [5, 150, 105],
  });
  drawCellText(
    sheet.thisMonthOnly.qardHasanAmount > 0
      ? `+${fmtAmount(sheet.thisMonthOnly.qardHasanAmount, ccy, false)}`
      : '-',
    7,
    totY,
    { bold: true, color: [180, 83, 9] }
  );
  drawCellText(fmtAmount(sheet.thisMonthRepaidAmount, ccy, false), 8, totY, {
    bold: true,
    color: [5, 150, 105],
  });
  drawCellText(fmtAmount(sheet.thisMonthSummary.contributionAmount, ccy, false), 9, totY, {
    bold: true,
    color: [15, 23, 42],
  });
  drawCellText(fmtAmount(sheet.thisMonthSummary.dueHasanaAmount, ccy), 10, totY, {
    bold: true,
    color: [180, 83, 9],
  });
  drawCellText(fmtAmount(closingNetEquity, ccy, false), 11, totY, {
    bold: true,
    color: [6, 95, 70],
  });
  drawCellText(`${collectionPct}%`, 12, totY, {
    bold: true,
    color: [5, 150, 105],
    fontSize: 7.2,
  });

  y += totH + 14;

  // Official Sign-off Block
  ensureRowSpace(54);
  const sigBoxW = (contentWidth - 36) / 3;
  const signatories = [
    {
      title: 'Prepared By',
      sub: preparedBy ? `${preparedBy.name} (${preparedBy.memberCode})` : 'Cooperative Secretary',
    },
    {
      title: 'Verified By',
      sub: 'Rotating Fund Manager / Treasurer',
    },
    {
      title: 'Approved By',
      sub: 'Cooperative Administrator / President',
    },
  ];

  signatories.forEach((sig, idx) => {
    const sx = marginX + idx * (sigBoxW + 18);
    doc.setDrawColor(148, 163, 184);
    doc.setLineWidth(0.6);
    doc.line(sx, y + 24, sx + sigBoxW, y + 24);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.8);
    doc.setTextColor(15, 23, 42);
    doc.text(sig.title, sx, y + 36);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(sig.sub, sx, y + 46);
  });

  // Page Footers across all pages
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p += 1) {
    doc.setPage(p);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.5);
    doc.line(marginX, pageHeight - 24, marginX + contentWidth, pageHeight - 24);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.1);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `${fundName}  ·  Official Balance Sheet (${fullMonth})  ·  Rollover balances verified`,
      marginX,
      pageHeight - 13
    );
    doc.text(`Page ${p} of ${totalPages}`, pageWidth - marginX, pageHeight - 13, {
      align: 'right',
    });
  }

  doc.save(`amanah-balance-sheet-${sheet.month}.pdf`);
}

export const exportMonthlySheetPdf = exportBalanceSheetPdf;
