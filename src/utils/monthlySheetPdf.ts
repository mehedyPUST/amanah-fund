import { jsPDF } from 'jspdf';
import type {
  FundConfig,
  MonthlySheetData,
  MonthlySheetMemberRow,
  PublicUser,
} from '../types/coop.ts';
import { formatDateTime } from './format.ts';

export interface MonthlySheetPdfOptions {
  sheet: MonthlySheetData;
  rows: MonthlySheetMemberRow[];
  isFiltered: boolean;
  filterLabel?: string;
  fundName: string;
  preparedBy: PublicUser | null;
}

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
  if (rounded === 0) return '-';
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

export function exportMonthlySheetPdf({
  sheet,
  rows,
  isFiltered,
  filterLabel,
  fundName,
  preparedBy,
}: MonthlySheetPdfOptions): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth(); // 841.89 pt
  const pageHeight = doc.internal.pageSize.getHeight(); // 595.28 pt
  const marginX = 32;
  const contentWidth = pageWidth - marginX * 2; // ~777.89 pt
  const footerReserve = 36;

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

  // Column widths summing strictly to contentWidth (~777.89 pt)
  const colDefs = [
    { key: 'sn', label: '#', width: 24, align: 'right' as const },
    { key: 'member', label: 'Member & ID', width: 132, align: 'left' as const },
    { key: 'status', label: 'Status', width: 46, align: 'left' as const },
    // Opening group (3 cols = 186 pt)
    { key: 'pContrib', label: 'Savings', width: 64, align: 'right' as const },
    { key: 'pQard', label: 'Qard', width: 61, align: 'right' as const },
    { key: 'pDue', label: 'Due', width: 61, align: 'right' as const },
    // Current month group (3 cols = 194 pt)
    { key: 'cContrib', label: 'Paid', width: 66, align: 'right' as const },
    { key: 'cQard', label: 'Qard', width: 62, align: 'right' as const },
    { key: 'cDelta', label: 'Due Delta', width: 66, align: 'right' as const },
    // Closing group (3 cols = 195.89 pt)
    { key: 'nContrib', label: 'Savings', width: 68, align: 'right' as const },
    { key: 'nQard', label: 'Qard', width: 64, align: 'right' as const },
    { key: 'nDue', label: 'Due', width: contentWidth - (24 + 132 + 46 + 64 + 61 + 61 + 66 + 62 + 66 + 68 + 64), align: 'right' as const },
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
    const pad = options?.pad ?? 5;
    doc.setFont('helvetica', options?.bold ? 'bold' : 'normal');
    doc.setFontSize(options?.fontSize ?? 7.8);
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

  let y = 28;

  // Institutional Top Header Band
  doc.setFillColor(15, 23, 42); // Slate-900 institutional masthead
  doc.roundedRect(marginX, y, contentWidth, 54, 4, 4, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13.5);
  doc.setTextColor(255, 255, 255);
  doc.text(truncateText(fundName, 76), marginX + 14, y + 21);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `Monthly Member Financial Ledger  |  Period: ${fullMonth} (${sheet.month})  |  Rolls to ${nextShort}`,
    marginX + 14,
    y + 38
  );

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(110, 231, 183); // Emerald-300 accent
  doc.text('SHARIAH-COMPLIANT COOPERATIVE LEDGER', pageWidth - marginX - 14, y + 21, {
    align: 'right',
  });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.8);
  doc.setTextColor(203, 213, 225);
  const preparerText = preparedBy
    ? `Prepared by: ${preparedBy.name} (${preparedBy.memberCode})  |  ${generatedAt}`
    : `Generated: ${generatedAt}`;
  doc.text(preparerText, pageWidth - marginX - 14, y + 38, { align: 'right' });

  y += 64;

  // 4-Column Executive KPI Strip
  const kpiHeight = 46;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.75);
  doc.roundedRect(marginX, y, contentWidth, kpiHeight, 3, 3, 'FD');

  const kpiItems = [
    {
      label: `Monthly Collection (${currShort})`,
      value: fmtAmount(sheet.thisMonthOnly.contributionAmount, ccy, false),
      sub: `${paidCount}/${totalMembers} paid (${collectionPct}% of ${fmtAmount(expectedCollection, ccy, false)})`,
      accent: [5, 150, 105] as [number, number, number],
    },
    {
      label: `Opening Carried Forward (${prevShort})`,
      value: fmtAmount(sheet.previousMonthSummary.contributionAmount, ccy, false),
      sub: `Opening Due: ${fmtAmount(sheet.previousMonthSummary.dueHasanaAmount, ccy, false)}`,
      accent: [15, 23, 42] as [number, number, number],
    },
    {
      label: `Closing Cumulative (${nextShort} Open)`,
      value: fmtAmount(sheet.thisMonthSummary.contributionAmount, ccy, false),
      sub: `Closing Due: ${fmtAmount(sheet.thisMonthSummary.dueHasanaAmount, ccy, false)}  |  Repaid: ${fmtAmount(sheet.thisMonthRepaidAmount, ccy, false)}`,
      accent: [15, 23, 42] as [number, number, number],
    },
    {
      label: 'All-Time Fund Position',
      value: fmtAmount(sheet.fundSummary.fundHeight, ccy, false),
      sub: `Liquid Balance: ${fmtAmount(netAvailableFund, ccy, false)}  |  Total Qard: ${fmtAmount(sheet.fundSummary.totalQardHasan, ccy, false)}`,
      accent: [5, 150, 105] as [number, number, number],
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
    doc.setFontSize(7.2);
    doc.setTextColor(100, 116, 139);
    doc.text(item.label, kx + 10, y + 13);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(item.accent[0], item.accent[1], item.accent[2]);
    doc.text(item.value, kx + 10, y + 27);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(71, 85, 105);
    doc.text(truncateText(item.sub, 44), kx + 10, y + 39);
  });

  y += kpiHeight + 10;

  if (isFiltered) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Note: Table displays ${rows.length} of ${sheet.rows.length} active members (${filterLabel || 'filtered view'}). Cooperative Totals below reflect all active members.`,
      marginX,
      y + 6
    );
    y += 14;
  }

  const drawTableHeader = (startY: number): number => {
    const groupH = 16;
    const subH = 17;

    // Group row fills
    const idGroupW = colDefs[0].width + colDefs[1].width + colDefs[2].width;
    const prevGroupW = colDefs[3].width + colDefs[4].width + colDefs[5].width;
    const currGroupW = colDefs[6].width + colDefs[7].width + colDefs[8].width;
    const closeGroupW = colDefs[9].width + colDefs[10].width + colDefs[11].width;

    // Identity group
    doc.setFillColor(241, 245, 249);
    doc.rect(colX[0], startY, idGroupW, groupH, 'F');
    // Opening group
    doc.setFillColor(241, 245, 249);
    doc.rect(colX[3], startY, prevGroupW, groupH, 'F');
    // Current month group
    doc.setFillColor(239, 246, 255);
    doc.rect(colX[6], startY, currGroupW, groupH, 'F');
    // Closing group
    doc.setFillColor(236, 253, 245);
    doc.rect(colX[9], startY, closeGroupW, groupH, 'F');

    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.6);
    doc.rect(marginX, startY, contentWidth, groupH + subH);

    // Group vertical dividers
    doc.line(colX[3], startY, colX[3], startY + groupH + subH);
    doc.line(colX[6], startY, colX[6], startY + groupH + subH);
    doc.line(colX[9], startY, colX[9], startY + groupH + subH);
    doc.line(marginX, startY + groupH, marginX + contentWidth, startY + groupH);

    // Group titles
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.4);
    doc.setTextColor(51, 65, 85);
    doc.text('Member Directory', colX[0] + 6, startY + 11);
    doc.text(`Opening Balance (${prevShort})`, colX[3] + prevGroupW / 2, startY + 11, {
      align: 'center',
    });
    doc.setTextColor(3, 105, 161);
    doc.text(`Period Activity (${currShort})`, colX[6] + currGroupW / 2, startY + 11, {
      align: 'center',
    });
    doc.setTextColor(4, 120, 87);
    doc.text(`Closing Balance (Rolls to ${nextShort})`, colX[9] + closeGroupW / 2, startY + 11, {
      align: 'center',
    });

    // Sub-header row background
    doc.setFillColor(248, 250, 252);
    doc.rect(marginX + 0.3, startY + groupH + 0.3, contentWidth - 0.6, subH - 0.6, 'F');

    // Re-draw section dividers across sub-header
    doc.setDrawColor(203, 213, 225);
    doc.line(colX[3], startY + groupH, colX[3], startY + groupH + subH);
    doc.line(colX[6], startY + groupH, colX[6], startY + groupH + subH);
    doc.line(colX[9], startY + groupH, colX[9], startY + groupH + subH);

    colDefs.forEach((col, i) => {
      drawCellText(col.label, i, startY + groupH + 11.5, {
        bold: true,
        fontSize: 7.2,
        color: [71, 85, 105],
      });
    });

    return startY + groupH + subH;
  };

  y = drawTableHeader(y);

  const ensureRowSpace = (neededHeight: number) => {
    if (y + neededHeight > pageHeight - footerReserve) {
      doc.addPage();
      y = 28;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42);
      doc.text(`${fundName} — Monthly Ledger (${fullMonth}) [Continued]`, marginX, y + 8);
      y += 16;
      y = drawTableHeader(y);
    }
  };

  const rowH = 22;

  if (rows.length === 0) {
    ensureRowSpace(28);
    doc.setDrawColor(226, 232, 240);
    doc.rect(marginX, y, contentWidth, 28);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text('No member records match the selected period/filter.', pageWidth / 2, y + 17, {
      align: 'center',
    });
    y += 28;
  } else {
    rows.forEach((row, idx) => {
      ensureRowSpace(rowH);

      if (idx % 2 === 1) {
        doc.setFillColor(249, 250, 251);
        doc.rect(marginX, y, contentWidth, rowH, 'F');
      }

      // Subtle closing group tint
      doc.setFillColor(240, 253, 249);
      doc.rect(colX[9], y, colDefs[9].width + colDefs[10].width + colDefs[11].width, rowH, 'F');

      // Row hairline borders
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.5);
      doc.line(marginX, y + rowH, marginX + contentWidth, y + rowH);
      doc.line(marginX, y, marginX, y + rowH);
      doc.line(marginX + contentWidth, y, marginX + contentWidth, y + rowH);
      doc.line(colX[3], y, colX[3], y + rowH);
      doc.line(colX[6], y, colX[6], y + rowH);
      doc.line(colX[9], y, colX[9], y + rowH);

      const baseLine = y + 10.5;
      const subLine = y + 18.5;

      drawCellText(String(row.serialNo), 0, baseLine, { color: [100, 116, 139], fontSize: 7.4 });
      drawCellText(truncateText(row.name, 26), 1, baseLine, {
        bold: true,
        color: [15, 23, 42],
        fontSize: 7.8,
      });
      drawCellText(truncateText(`${row.memberCode} · ${row.mobile}`, 31), 1, subLine, {
        color: [100, 116, 139],
        fontSize: 6.5,
      });

      const statusColor: [number, number, number] =
        row.contributionStatus === 'paid'
          ? [5, 150, 105]
          : row.contributionStatus === 'pending' || row.contributionStatus === 'partial'
            ? [180, 83, 9]
            : [190, 18, 60];
      drawCellText(fmtStatusLabel(row), 2, baseLine, {
        bold: true,
        color: statusColor,
        fontSize: 7.4,
      });

      // Opening
      drawCellText(fmtAmount(row.previousSummary.contributionAmount, ccy), 3, baseLine, {
        color: row.previousSummary.contributionAmount > 0 ? [30, 41, 59] : [148, 163, 184],
      });
      drawCellText(fmtAmount(row.previousSummary.qardHasanAmount, ccy), 4, baseLine, {
        color: row.previousSummary.qardHasanAmount > 0 ? [30, 41, 59] : [148, 163, 184],
      });
      drawCellText(fmtAmount(row.previousSummary.dueHasanaAmount, ccy), 5, baseLine, {
        color: row.previousSummary.dueHasanaAmount > 0 ? [180, 83, 9] : [148, 163, 184],
      });

      // Current month
      const thisContribText =
        row.thisMonth.contributionAmount > 0
          ? fmtAmount(row.thisMonth.contributionAmount, ccy)
          : row.contributionStatus === 'pending'
            ? fmtAmount(row.contributionPendingAmount, ccy)
            : '-';
      drawCellText(thisContribText, 6, baseLine, {
        bold: row.thisMonth.contributionAmount > 0,
        color: statusColor,
      });
      drawCellText(
        row.thisMonth.qardHasanAmount > 0
          ? `+${fmtAmount(row.thisMonth.qardHasanAmount, ccy, false)}`
          : '-',
        7,
        baseLine,
        {
          color: row.thisMonth.qardHasanAmount > 0 ? [15, 23, 42] : [148, 163, 184],
        }
      );

      const deltaColor: [number, number, number] =
        row.thisMonth.dueChangeAmount < 0
          ? [5, 150, 105]
          : row.thisMonth.dueChangeAmount > 0
            ? [180, 83, 9]
            : [148, 163, 184];
      drawCellText(fmtSigned(row.thisMonth.dueChangeAmount, ccy), 8, baseLine, {
        bold: row.thisMonth.dueChangeAmount !== 0,
        color: deltaColor,
      });
      if (row.thisMonth.repaidAmount > 0) {
        drawCellText(`Repaid ${fmtAmount(row.thisMonth.repaidAmount, ccy, false)}`, 8, subLine, {
          color: [100, 116, 139],
          fontSize: 6.2,
        });
      }

      // Closing
      drawCellText(fmtAmount(row.thisMonthSummary.contributionAmount, ccy, false), 9, baseLine, {
        bold: true,
        color: [6, 95, 70],
      });
      drawCellText(fmtAmount(row.thisMonthSummary.qardHasanAmount, ccy), 10, baseLine, {
        bold: row.thisMonthSummary.qardHasanAmount > 0,
        color: row.thisMonthSummary.qardHasanAmount > 0 ? [15, 23, 42] : [148, 163, 184],
      });
      drawCellText(fmtAmount(row.thisMonthSummary.dueHasanaAmount, ccy), 11, baseLine, {
        bold: row.thisMonthSummary.dueHasanaAmount > 0,
        color: row.thisMonthSummary.dueHasanaAmount > 0 ? [180, 83, 9] : [148, 163, 184],
      });

      y += rowH;
    });
  }

  // Cooperative Totals Row
  ensureRowSpace(26);
  const totH = 24;
  doc.setFillColor(241, 245, 249);
  doc.rect(marginX, y, contentWidth, totH, 'F');
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(1.1);
  doc.line(marginX, y, marginX + contentWidth, y);
  doc.setLineWidth(0.75);
  doc.line(marginX, y + totH, marginX + contentWidth, y + totH);
  doc.setDrawColor(203, 213, 225);
  doc.line(marginX, y, marginX, y + totH);
  doc.line(marginX + contentWidth, y, marginX + contentWidth, y + totH);
  doc.line(colX[3], y, colX[3], y + totH);
  doc.line(colX[6], y, colX[6], y + totH);
  doc.line(colX[9], y, colX[9], y + totH);

  const totY = y + 14.5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text(`Cooperative Period Totals (${sheet.rows.length} Active Members)`, marginX + 8, totY);

  drawCellText(fmtAmount(sheet.previousMonthSummary.contributionAmount, ccy, false), 3, totY, {
    bold: true,
    color: [15, 23, 42],
  });
  drawCellText(fmtAmount(sheet.previousMonthSummary.qardHasanAmount, ccy), 4, totY, {
    bold: true,
    color: [15, 23, 42],
  });
  drawCellText(fmtAmount(sheet.previousMonthSummary.dueHasanaAmount, ccy), 5, totY, {
    bold: true,
    color: [180, 83, 9],
  });

  drawCellText(
    `+${fmtAmount(sheet.thisMonthOnly.contributionAmount, ccy, false)}`,
    6,
    totY,
    { bold: true, color: [5, 150, 105] }
  );
  drawCellText(
    sheet.thisMonthOnly.qardHasanAmount > 0
      ? `+${fmtAmount(sheet.thisMonthOnly.qardHasanAmount, ccy, false)}`
      : '-',
    7,
    totY,
    { bold: true, color: [15, 23, 42] }
  );
  drawCellText(fmtSigned(sheet.thisMonthOnly.dueHasanaAmount, ccy), 8, totY, {
    bold: true,
    color: sheet.thisMonthOnly.dueHasanaAmount <= 0 ? [5, 150, 105] : [180, 83, 9],
  });

  drawCellText(fmtAmount(sheet.thisMonthSummary.contributionAmount, ccy, false), 9, totY, {
    bold: true,
    color: [6, 95, 70],
  });
  drawCellText(fmtAmount(sheet.thisMonthSummary.qardHasanAmount, ccy), 10, totY, {
    bold: true,
    color: [15, 23, 42],
  });
  drawCellText(fmtAmount(sheet.thisMonthSummary.dueHasanaAmount, ccy), 11, totY, {
    bold: true,
    color: [180, 83, 9],
  });

  y += totH + 16;

  // Official Sign-off Block
  ensureRowSpace(58);
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
    doc.line(sx, y + 26, sx + sigBoxW, y + 26);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.text(sig.title, sx, y + 38);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(100, 116, 139);
    doc.text(sig.sub, sx, y + 48);
  });

  // Page Footers across all pages
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p += 1) {
    doc.setPage(p);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.5);
    doc.line(marginX, pageHeight - 26, marginX + contentWidth, pageHeight - 26);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `${fundName}  ·  Official Monthly Financial Sheet (${fullMonth})  ·  Rollover balances verified`,
      marginX,
      pageHeight - 14
    );
    doc.text(`Page ${p} of ${totalPages}`, pageWidth - marginX, pageHeight - 14, {
      align: 'right',
    });
  }

  doc.save(`amanah-monthly-sheet-${sheet.month}.pdf`);
}
