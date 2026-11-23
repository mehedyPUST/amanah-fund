import { jsPDF } from 'jspdf';
import type { AppLocale } from '../i18n/config.ts';
import type {
  StructuredBdAddress,
  UserRegistrationDetails,
  UserStatus,
} from '../types/coop.ts';
import {
  buildDigitalAgreementQrPayload,
  generateAgreementQrDataUrl,
} from './agreementQr.ts';
import { formatDateTime } from './format.ts';
import {
  normalizeGenderToEnglish,
  normalizeMaritalStatusToEnglish,
  normalizeRelationToEnglish,
} from './inputLanguage.ts';

export interface ApplicationFormPdfInput {
  applicantName: string;
  email: string;
  memberCode?: string;
  status?: UserStatus;
  submittedAt?: string;
  fundName?: string;
  registrationDetails: UserRegistrationDetails;
  locale?: AppLocale;
}

interface LoadedPdfImage {
  dataUrl: string;
  format: 'PNG' | 'JPEG';
  width: number;
  height: number;
}

function formatStatusEnglish(status?: UserStatus): string {
  switch (status) {
    case 'active':
      return 'Active Member';
    case 'pending_activation':
      return 'Approved — Awaiting Activation';
    case 'suspended':
      return 'Suspended';
    case 'pending_approval':
    default:
      return 'Pending Admin Review';
  }
}

function sanitizeFileSegment(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

/**
 * Loads an image URL (same-origin, ImageKit CORS, or data URL) and converts it
 * via canvas to a jsPDF-safe PNG/JPEG data URL with natural dimensions.
 * Returns null gracefully on error or timeout so PDF export never blocks.
 */
async function loadImageForPdf(
  url?: string,
  preferPng = false
): Promise<LoadedPdfImage | null> {
  if (!url || typeof window === 'undefined' || typeof document === 'undefined') {
    return null;
  }

  return new Promise<LoadedPdfImage | null>((resolve) => {
    let settled = false;
    const finish = (val: LoadedPdfImage | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(val);
    };

    const timer = window.setTimeout(() => finish(null), 5000);

    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.referrerPolicy = 'no-referrer';
    img.onload = () => {
      try {
        const w = img.naturalWidth || 300;
        const h = img.naturalHeight || 300;
        const maxDim = preferPng ? 600 : 520;
        const scale = Math.min(1, maxDim / Math.max(w, h));
        const cw = Math.max(1, Math.round(w * scale));
        const ch = Math.max(1, Math.round(h * scale));

        const canvas = document.createElement('canvas');
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          finish(null);
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, cw, ch);
        ctx.drawImage(img, 0, 0, cw, ch);

        const format: 'PNG' | 'JPEG' = preferPng ? 'PNG' : 'JPEG';
        const dataUrl = preferPng
          ? canvas.toDataURL('image/png')
          : canvas.toDataURL('image/jpeg', 0.9);
        finish({ dataUrl, format, width: cw, height: ch });
      } catch {
        finish(null);
      }
    };
    img.onerror = () => finish(null);
    img.src = url;
  });
}

/**
 * Renders a Bangla name string onto a high-DPI offscreen canvas as a crisp PNG
 * so jsPDF displays authentic Bengali Unicode glyphs alongside English names
 * without font corruption.
 */
async function renderBanglaNameImage(text?: string): Promise<LoadedPdfImage | null> {
  const trimmed = String(text || '').trim();
  if (!trimmed || typeof window === 'undefined' || typeof document === 'undefined') {
    return null;
  }

  try {
    const fontsApi = (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts;
    if (fontsApi?.ready) {
      await Promise.race([
        fontsApi.ready.catch(() => undefined),
        new Promise<void>((resolve) => window.setTimeout(resolve, 400)),
      ]);
    }

    const fontSpec = '600 28px "Anek Bangla", "Noto Sans Bengali", "Hind Siliguri", system-ui, sans-serif';
    const measureCanvas = document.createElement('canvas');
    const measureCtx = measureCanvas.getContext('2d');
    if (!measureCtx) return null;
    measureCtx.font = fontSpec;
    const measuredWidth = Math.ceil(measureCtx.measureText(trimmed).width);
    if (measuredWidth <= 0) return null;

    const padX = 4;
    const width = measuredWidth + padX * 2;
    const height = 40;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.font = fontSpec;
    ctx.fillStyle = '#334155';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(trimmed, padX, 29);

    return {
      dataUrl: canvas.toDataURL('image/png'),
      format: 'PNG',
      width,
      height,
    };
  } catch {
    return null;
  }
}

function drawFittedImage(
  doc: jsPDF,
  img: LoadedPdfImage,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
  padding = 2
) {
  const availW = Math.max(1, boxW - padding * 2);
  const availH = Math.max(1, boxH - padding * 2);
  const scale = Math.min(availW / img.width, availH / img.height);
  const drawW = img.width * scale;
  const drawH = img.height * scale;
  const dx = boxX + (boxW - drawW) / 2;
  const dy = boxY + (boxH - drawH) / 2;
  doc.addImage(img.dataUrl, img.format, dx, dy, drawW, drawH, undefined, 'FAST');
}

function drawLeftAlignedTextImage(
  doc: jsPDF,
  img: LoadedPdfImage,
  x: number,
  y: number,
  maxW: number,
  targetH = 10.5
): number {
  let drawH = targetH;
  let drawW = (img.width / img.height) * drawH;
  if (drawW > maxW) {
    const scale = maxW / drawW;
    drawW = maxW;
    drawH *= scale;
  }
  doc.addImage(img.dataUrl, img.format, x, y, drawW, drawH, undefined, 'FAST');
  return drawH;
}

/**
 * Generates and downloads a well-organized, official A4 PDF of a
 * submitted Amanah Cooperative Membership Application Form, laid out compactly so
 * maximum content fits cleanly onto a single page.
 *
 * All labels and dropdown values (gender, marital status, relation, addresses)
 * are always rendered in English — even if selected while the UI was toggled
 * to Bangla — while dual English + Bangla person names (Applicant, Father,
 * Mother, Spouse, Nominee) render crisply together when provided.
 */
export async function downloadMembershipApplicationPdf(
  input: ApplicationFormPdfInput
): Promise<void> {
  const {
    applicantName,
    email,
    memberCode,
    status,
    submittedAt,
    fundName = 'Amanah Cooperative',
    registrationDetails: reg,
  } = input;

  const nominees = reg.nominees || [];
  const qrPayload = buildDigitalAgreementQrPayload({
    applicantName,
    memberCode,
    status,
    submittedAt,
    fundName,
    registrationDetails: reg,
  });

  // Load logo, photos, QR seal, and render optional Bangla names to high-DPI PNGs in parallel
  const [
    projectLogoImg,
    qrDataUrl,
    memberPhoto,
    signatureImg,
    nameBnImg,
    fatherNameBnImg,
    motherNameBnImg,
    spouseNameBnImg,
    nomineePhotos,
    nomineeNameBnImgs,
  ] = await Promise.all([
    loadImageForPdf('/brand-logo.png', true),
    generateAgreementQrDataUrl(qrPayload, 240),
    reg.gender === 'female' ? Promise.resolve(null) : loadImageForPdf(reg.photoUrl, false),
    loadImageForPdf(reg.signatureUrl, true),
    renderBanglaNameImage(reg.nameBn),
    renderBanglaNameImage(reg.fatherNameBn),
    renderBanglaNameImage(reg.motherNameBn),
    renderBanglaNameImage(reg.spouseNameBn),
    Promise.all(
      nominees.map((n) =>
        n.gender === 'female' ? Promise.resolve(null) : loadImageForPdf(n.photoUrl, false)
      )
    ),
    Promise.all(nominees.map((n) => renderBanglaNameImage(n.nameBn))),
  ]);

  // Standard A4 (595.28 × 841.89 pt) kept compact for clean single-page dossier fit
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth(); // 595.28
  const pageHeight = doc.internal.pageSize.getHeight(); // 841.89
  const margin = 24;
  const contentWidth = pageWidth - margin * 2; // 547.28
  const bottomLimit = pageHeight - 25; // 816.89
  let y = 16;

  const ensureSpace = (needed: number) => {
    if (y + needed > bottomLimit) {
      doc.addPage();
      y = 24;
    }
  };

  const drawSectionBar = (sectionNum: string, title: string) => {
    ensureSpace(22);
    doc.setFillColor(236, 253, 245); // emerald-50
    doc.setDrawColor(167, 243, 208); // emerald-200
    doc.setLineWidth(0.6);
    doc.roundedRect(margin, y, contentWidth, 16.5, 3, 3, 'FD');

    doc.setFillColor(5, 150, 105); // emerald-600 left accent bar
    doc.rect(margin, y, 4, 16.5, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.4);
    doc.setTextColor(6, 95, 70); // emerald-800
    doc.text(`${sectionNum}. ${title}`, margin + 9, y + 11);
    y += 19.5;
  };

  // Top Emerald Institutional Strip
  doc.setFillColor(5, 150, 105);
  doc.rect(margin, y, contentWidth, 3.5, 'F');
  y += 8;

  // Header Left: Project Logo + Cooperative Identity (Dynamic vertical flow — zero overlap)
  const refBoxW = 192;
  const headerTopY = y;
  const logoSize = projectLogoImg ? 34 : 0;
  const headerTextX = margin + (projectLogoImg ? logoSize + 8 : 0);
  const headerLeftW = contentWidth - refBoxW - 12 - (projectLogoImg ? logoSize + 8 : 0);

  if (projectLogoImg) {
    doc.setFillColor(4, 120, 87); // #047857 institutional emerald tile matching AmanahLogo
    doc.setDrawColor(16, 185, 129);
    doc.setLineWidth(0.5);
    doc.roundedRect(margin, headerTopY + 2, logoSize, logoSize, 6, 6, 'FD');
    drawFittedImage(doc, projectLogoImg, margin + 1, headerTopY + 3, logoSize - 2, logoSize - 2, 1);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12.6);
  doc.setTextColor(15, 23, 42);
  const titleLines = doc.splitTextToSize(fundName, headerLeftW) as string[];
  const titleLineH = 13.5;
  doc.text(titleLines, headerTextX, headerTopY + 10.5);

  const subtitleY = headerTopY + 10.5 + (titleLines.length - 1) * titleLineH + 11;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.2);
  doc.setTextColor(5, 150, 105);
  doc.text('OFFICIAL MEMBERSHIP APPLICATION & DIGITAL AGREEMENT', headerTextX, subtitleY);

  const charterY = subtitleY + 9.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(71, 85, 105);
  const charterLines = doc.splitTextToSize(
    'Shariah-Compliant · Interest-Free Qard Hasan · Constitution Charter (§4–§6 · VISION-36)',
    headerLeftW
  ) as string[];
  doc.text(charterLines, headerTextX, charterY);
  const leftBottomY = Math.max(
    headerTopY + 2 + logoSize + 3,
    charterY + (charterLines.length - 1) * 8.8 + 4
  );

  // Header Right: Application Reference Box
  const refBoxX = pageWidth - margin - refBoxW;
  const refBoxY = headerTopY;
  const refBoxH = Math.max(44, leftBottomY - headerTopY);
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.75);
  doc.roundedRect(refBoxX, refBoxY, refBoxW, refBoxH, 4, 4, 'FD');

  const submittedLabel = formatDateTime(submittedAt || new Date().toISOString());
  const refLines = [
    { k: 'Ref / Member ID:', v: memberCode || 'Pending' },
    { k: 'Status:', v: formatStatusEnglish(status) },
    { k: 'Submitted:', v: submittedLabel },
  ];
  const refStep = 12;
  const refStartY = refBoxY + (refBoxH - (refLines.length - 1) * refStep) / 2 + 2.5;
  refLines.forEach((line, idx) => {
    const ry = refStartY + idx * refStep;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(100, 116, 139);
    doc.text(line.k, refBoxX + 8, ry);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(line.v, refBoxX + refBoxW - 8, ry, { align: 'right' });
  });

  y = Math.max(leftBottomY, refBoxY + refBoxH) + 5.5;
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.7);
  doc.line(margin, y, pageWidth - margin, y);
  y += 7;

  // =========================================================================
  // SECTION 01: Personal, Account & Employment Details + Passport Photo Box
  // =========================================================================
  drawSectionBar('01', 'PERSONAL, ACCOUNT & EMPLOYMENT INFORMATION');

  const photoBoxW = 90;
  const detailsGridW = contentWidth - photoBoxW - 10;
  const photoBoxX = margin + detailsGridW + 10;
  const section1TopY = y;

  const drawKeyValueRow = (
    x: number,
    w: number,
    pairs: Array<{
      label: string;
      value: string;
      mono?: boolean;
      banglaImg?: LoadedPdfImage | null;
    }>,
    rowY: number
  ): number => {
    const colCount = pairs.length;
    const colW = w / colCount;

    let maxContentH = 9;
    const wrappedPerCol = pairs.map((p) => {
      doc.setFont(p.mono ? 'courier' : 'helvetica', 'bold');
      doc.setFontSize(7.9);
      const lines = doc.splitTextToSize(p.value || '—', colW - 10) as string[];
      const textH = lines.length * 8.8;
      const bnH = p.banglaImg ? 11.5 : 0;
      maxContentH = Math.max(maxContentH, textH + bnH);
      return lines;
    });

    const rowH = Math.max(21.5, 10 + maxContentH + 3.2);

    pairs.forEach((p, idx) => {
      const cx = x + idx * colW;
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.5);
      doc.rect(cx, rowY, colW, rowH, 'FD');

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.3);
      doc.setTextColor(100, 116, 139);
      doc.text(p.label.toUpperCase(), cx + 5.5, rowY + 7.8);

      doc.setFont(p.mono ? 'courier' : 'helvetica', 'bold');
      doc.setFontSize(7.9);
      doc.setTextColor(15, 23, 42);
      doc.text(wrappedPerCol[idx], cx + 5.5, rowY + 16.8);

      if (p.banglaImg) {
        const bnY = rowY + 16.8 + (wrappedPerCol[idx].length - 1) * 8.8 + 2;
        drawLeftAlignedTextImage(doc, p.banglaImg, cx + 5.5, bnY, colW - 10, 9.5);
      }
    });

    return rowY + rowH;
  };

  y = drawKeyValueRow(
    margin,
    detailsGridW,
    [
      { label: 'Full Legal Name', value: applicantName, banglaImg: nameBnImg },
      { label: 'Gender', value: normalizeGenderToEnglish(reg.gender) },
    ],
    y
  );
  y = drawKeyValueRow(
    margin,
    detailsGridW,
    [
      { label: "Father's Name", value: reg.fatherName || '—', banglaImg: fatherNameBnImg },
      { label: "Mother's Name", value: reg.motherName || '—', banglaImg: motherNameBnImg },
    ],
    y
  );
  y = drawKeyValueRow(
    margin,
    detailsGridW,
    reg.spouseName || reg.spouseNameBn
      ? [
          { label: 'Date of Birth', value: reg.dateOfBirth, mono: true },
          {
            label: 'Marital Status',
            value: normalizeMaritalStatusToEnglish(reg.maritalStatus),
          },
          {
            label: 'Spouse Name',
            value: reg.spouseName || '—',
            banglaImg: spouseNameBnImg,
          },
        ]
      : [
          { label: 'Date of Birth', value: reg.dateOfBirth, mono: true },
          {
            label: 'Marital Status',
            value: normalizeMaritalStatusToEnglish(reg.maritalStatus),
          },
        ],
    y
  );
  y = drawKeyValueRow(
    margin,
    detailsGridW,
    [
      { label: 'Email Address', value: email, mono: true },
      { label: 'Mobile Number', value: reg.mobile, mono: true },
    ],
    y
  );
  y = drawKeyValueRow(
    margin,
    detailsGridW,
    [
      { label: 'National ID (NID)', value: reg.nid, mono: true },
      { label: 'Reference (Existing Member)', value: reg.referenceMemberName },
    ],
    y
  );
  y = drawKeyValueRow(
    margin,
    detailsGridW,
    [
      { label: 'Occupation', value: reg.occupation },
      { label: 'Company / Organization', value: reg.companyOrganization },
    ],
    y
  );

  // Draw Passport Photo Frame on the right, aligned cleanly with Section 01
  const section1GridH = y - section1TopY;
  const photoFrameH = Math.max(114, Math.min(section1GridH, 148));
  const photoInnerH = photoFrameH - 16;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.7);
  doc.roundedRect(photoBoxX, section1TopY, photoBoxW, photoFrameH, 4, 4, 'FD');

  if (memberPhoto) {
    drawFittedImage(doc, memberPhoto, photoBoxX + 4, section1TopY + 4, photoBoxW - 8, photoInnerH - 4, 1);
  } else if (reg.gender === 'female') {
    doc.setDrawColor(167, 243, 208);
    doc.setLineDashPattern([3, 2], 0);
    doc.rect(photoBoxX + 6, section1TopY + 6, photoBoxW - 12, photoInnerH - 8);
    doc.setLineDashPattern([], 0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(5, 150, 105);
    doc.text('Female', photoBoxX + photoBoxW / 2, section1TopY + photoInnerH / 2 - 4, {
      align: 'center',
    });
    doc.text('Photo Exempt', photoBoxX + photoBoxW / 2, section1TopY + photoInnerH / 2 + 6, {
      align: 'center',
    });
  } else {
    doc.setDrawColor(203, 213, 225);
    doc.setLineDashPattern([3, 2], 0);
    doc.rect(photoBoxX + 6, section1TopY + 6, photoBoxW - 12, photoInnerH - 8);
    doc.setLineDashPattern([], 0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(148, 163, 184);
    doc.text('Applicant', photoBoxX + photoBoxW / 2, section1TopY + photoInnerH / 2 - 4, {
      align: 'center',
    });
    doc.text('Photo', photoBoxX + photoBoxW / 2, section1TopY + photoInnerH / 2 + 6, {
      align: 'center',
    });
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(71, 85, 105);
  doc.text('APPLICANT PHOTO', photoBoxX + photoBoxW / 2, section1TopY + photoFrameH - 5.5, {
    align: 'center',
  });

  y = Math.max(y, section1TopY + photoFrameH) + 6;

  // =========================================================================
  // OPTIONAL SECTION: Social Media Profiles (if provided)
  // =========================================================================
  let nextSectionNumber = 2;
  const social = reg.socialMedia;
  const hasSocial = Boolean(social?.whatsapp || social?.facebook || social?.linkedin);
  if (hasSocial) {
    drawSectionBar(`0${nextSectionNumber}`, 'SOCIAL MEDIA PROFILES (OPTIONAL)');
    nextSectionNumber += 1;

    y = drawKeyValueRow(
      margin,
      contentWidth,
      [
        { label: 'WhatsApp', value: social?.whatsapp || '—', mono: Boolean(social?.whatsapp) },
        { label: 'Facebook Profile', value: social?.facebook || '—' },
        { label: 'LinkedIn Profile', value: social?.linkedin || '—' },
      ],
      y
    );
    y += 6;
  }

  // =========================================================================
  // RESIDENTIAL ADDRESSES
  // =========================================================================
  drawSectionBar(`0${nextSectionNumber}`, 'RESIDENTIAL ADDRESSES');
  nextSectionNumber += 1;

  const addrGap = 10;
  const addrColW = (contentWidth - addrGap) / 2;

  const buildAddressRows = (
    details: StructuredBdAddress | undefined,
    fallback: string
  ): Array<{ label: string; value: string }> => {
    if (details && (details.careOf || details.villageRoadHouse || details.district)) {
      return [
        { label: 'Care Of (C/O)', value: details.careOf || '—' },
        { label: 'Village / Road / House', value: details.villageRoadHouse || '—' },
        {
          label: 'Division / District',
          value: [details.division, details.district].filter(Boolean).join(' · ') || '—',
        },
        { label: 'Upazila / P.S.', value: details.upazila || '—' },
        {
          label: 'Post Office & Code',
          value: details.postOffice
            ? `${details.postOffice}${details.postCode ? ` (${details.postCode})` : ''}`
            : details.postCode || '—',
        },
      ];
    }
    return [{ label: 'Full Address', value: fallback || '—' }];
  };

  const presentRows = buildAddressRows(reg.presentAddressDetails, reg.presentAddress);
  const permanentRows = buildAddressRows(reg.permanentAddressDetails, reg.permanentAddress);

  const measureAddrCardHeight = (rows: Array<{ label: string; value: string }>) => {
    let h = 16; // title bar
    for (const r of rows) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.7);
      const valLines = doc.splitTextToSize(r.value, addrColW - 92) as string[];
      h += Math.max(13, valLines.length * 8.6 + 4);
    }
    return h + 2.5;
  };

  const addrBoxH = Math.max(
    measureAddrCardHeight(presentRows),
    measureAddrCardHeight(permanentRows)
  );
  ensureSpace(addrBoxH + 6);

  const drawAddressCard = (
    cardX: number,
    cardY: number,
    cardTitle: string,
    rows: Array<{ label: string; value: string }>,
    fixedH: number
  ) => {
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.65);
    doc.roundedRect(cardX, cardY, addrColW, fixedH, 4, 4, 'FD');

    doc.setFillColor(241, 245, 249);
    doc.roundedRect(cardX, cardY, addrColW, 15.5, 4, 4, 'F');
    doc.rect(cardX, cardY + 10, addrColW, 5.5, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.line(cardX, cardY + 15.5, cardX + addrColW, cardY + 15.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.8);
    doc.setTextColor(30, 41, 59);
    doc.text(cardTitle, cardX + 8, cardY + 10.5);

    let ry = cardY + 16.5;
    rows.forEach((r, idx) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.7);
      const valLines = doc.splitTextToSize(r.value, addrColW - 92) as string[];
      const lineH = Math.max(13, valLines.length * 8.6 + 4);

      if (idx > 0) {
        doc.setDrawColor(241, 245, 249);
        doc.setLineWidth(0.45);
        doc.line(cardX + 6, ry, cardX + addrColW - 6, ry);
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.9);
      doc.setTextColor(100, 116, 139);
      doc.text(r.label, cardX + 8, ry + 9.2);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.7);
      doc.setTextColor(15, 23, 42);
      doc.text(valLines, cardX + 86, ry + 9.2);

      ry += lineH;
    });
  };

  drawAddressCard(margin, y, 'Present Address', presentRows, addrBoxH);
  drawAddressCard(margin + addrColW + addrGap, y, 'Permanent Address', permanentRows, addrBoxH);
  y += addrBoxH + 6;

  // =========================================================================
  // NOMINEE INFORMATION
  // =========================================================================
  drawSectionBar(
    `0${nextSectionNumber}`,
    `NOMINEE INFORMATION (${nominees.length} ${nominees.length === 1 ? 'NOMINEE' : 'NOMINEES'} · 100% SHARE ALLOCATION)`
  );
  nextSectionNumber += 1;

  if (nominees.length === 0) {
    ensureSpace(18);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.9);
    doc.setTextColor(100, 116, 139);
    doc.text('No nominee details attached.', margin + 4, y + 9);
    y += 16;
  } else {
    nominees.forEach((nominee, idx) => {
      const nomPhoto = nomineePhotos[idx] || null;
      const nomNameBnImg = nomineeNameBnImgs[idx] || null;
      const nomPhotoW = 58;
      const nomInfoW = contentWidth - nomPhotoW - 14;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.7);
      const addrLines = doc.splitTextToSize(nominee.address || '—', nomInfoW - 62) as string[];
      const extraBnH = nomNameBnImg ? 10.5 : 0;
      const cardH = Math.max(
        78 + extraBnH,
        16 + 44 + extraBnH + Math.max(12.5, addrLines.length * 8.6 + 4) + 5
      );
      ensureSpace(cardH + 5);

      const cardY = y;
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.65);
      doc.roundedRect(margin, cardY, contentWidth, cardH, 4, 4, 'FD');

      // Nominee card header bar
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(margin, cardY, contentWidth, 15.5, 4, 4, 'F');
      doc.rect(margin, cardY + 10, contentWidth, 5.5, 'F');
      doc.setDrawColor(226, 232, 240);
      doc.line(margin, cardY + 15.5, margin + contentWidth, cardY + 15.5);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.8);
      doc.setTextColor(15, 23, 42);
      const nomTitle =
        nominees.length > 1 ? `Nominee #${idx + 1}` : 'Primary Nominee';
      doc.text(nomTitle, margin + 8, cardY + 10.5);

      // Share badge on right
      const shareText = `${nominee.sharePercentage}% Share`;
      doc.setFillColor(209, 250, 229);
      doc.roundedRect(margin + contentWidth - 64, cardY + 2.5, 56, 10.5, 3, 3, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.9);
      doc.setTextColor(6, 95, 70);
      doc.text(shareText, margin + contentWidth - 36, cardY + 9.8, { align: 'center' });

      // Nominee details grid
      const colA = margin + 8;
      const colB = margin + 8 + nomInfoW / 2;
      let ny = cardY + 25;

      const drawNomField = (fx: number, fy: number, lbl: string, val: string, mono = false) => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.8);
        doc.setTextColor(100, 116, 139);
        doc.text(`${lbl}:`, fx, fy);
        doc.setFont(mono ? 'courier' : 'helvetica', 'normal');
        doc.setFontSize(7.7);
        doc.setTextColor(15, 23, 42);
        doc.text(val || '—', fx + 56, fy, { maxWidth: nomInfoW / 2 - 60 });
      };

      drawNomField(colA, ny, 'Full Name', nominee.name);
      drawNomField(colB, ny, 'Relation', normalizeRelationToEnglish(nominee.relation));
      if (nomNameBnImg) {
        drawLeftAlignedTextImage(doc, nomNameBnImg, colA + 56, ny + 1.5, nomInfoW / 2 - 60, 9);
        ny += 10.5;
      }
      ny += 11.2;
      drawNomField(colA, ny, 'Date of Birth', nominee.dateOfBirth, true);
      drawNomField(colB, ny, 'Gender', normalizeGenderToEnglish(nominee.gender));
      ny += 11.2;
      drawNomField(colA, ny, 'Occupation', nominee.occupation);
      drawNomField(colB, ny, 'NID / Birth Reg', nominee.nidOrBirthReg, true);
      ny += 11.2;
      drawNomField(colA, ny, 'Mobile', nominee.mobile || '—', true);
      ny += 11.2;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.8);
      doc.setTextColor(100, 116, 139);
      doc.text('Address:', colA, ny);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.7);
      doc.setTextColor(15, 23, 42);
      doc.text(addrLines, colA + 56, ny);

      // Nominee photo box on the right
      const nPhotoX = margin + contentWidth - nomPhotoW - 6;
      const nPhotoY = cardY + 20;
      const nPhotoH = 54;
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(203, 213, 225);
      doc.roundedRect(nPhotoX, nPhotoY, nomPhotoW, nPhotoH, 3, 3, 'FD');

      if (nominee.gender === 'female') {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.4);
        doc.setTextColor(5, 150, 105);
        doc.text('Female', nPhotoX + nomPhotoW / 2, nPhotoY + 23, { align: 'center' });
        doc.text('Photo Exempt', nPhotoX + nomPhotoW / 2, nPhotoY + 32, { align: 'center' });
      } else if (nomPhoto) {
        drawFittedImage(doc, nomPhoto, nPhotoX + 2, nPhotoY + 2, nomPhotoW - 4, nPhotoH - 4, 1);
      } else {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.4);
        doc.setTextColor(148, 163, 184);
        doc.text('Nominee', nPhotoX + nomPhotoW / 2, nPhotoY + 23, { align: 'center' });
        doc.text('Photo', nPhotoX + nomPhotoW / 2, nPhotoY + 32, { align: 'center' });
      }

      y = cardY + cardH + 5;
    });
    y += 1;
  }

  // =========================================================================
  // DIGITAL AGREEMENT DECLARATION, ATTACHMENTS CHECKLIST & 300x80 SIGNATURE BLOCK
  // Pre-measure full block so Section 04 stays intact with signatures
  // =========================================================================
  const agreement = reg.digitalAgreement;
  const declarationText =
    agreement?.declarationText ||
    `I hereby declare that all personal, address, employment, and nominee information provided in this membership application is true, accurate, and complete. By signing and submitting this application, I execute my official Digital Membership Agreement with ${fundName} and agree to abide by the Constitution Charter (§4–§6 · VISION-36) and governance policies, including monthly savings obligations and Shariah-compliant interest-free Qard Hasan principles.`;
  const agreementMetaLine = agreement
    ? `Agreement ID: ${agreement.agreementId}  ·  Signed: ${formatDateTime(agreement.signedAt)}${
        agreement.activatedAt ? `  ·  Activated: ${formatDateTime(agreement.activatedAt)}` : ''
      }  ·  SHA-256: ${agreement.sha256Hash.slice(0, 16).toUpperCase()}…`
    : null;

  const hasQr = Boolean(qrDataUrl);
  const qrColW = hasQr ? 68 : 0;
  const declTextW = contentWidth - 16 - (hasQr ? qrColW + 6 : 0);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.4);
  const declLines = doc.splitTextToSize(declarationText, declTextW) as string[];
  const declTextH = declLines.length * 9 + (agreementMetaLine ? 19 : 9);
  const declH = Math.max(declTextH, hasQr ? 66 : 0);
  const sigBoxH = 66;
  const totalSection4H = 19.5 + 22 + 5 + declH + 6 + sigBoxH;

  ensureSpace(totalSection4H);
  drawSectionBar(`0${nextSectionNumber}`, 'DIGITAL AGREEMENT DECLARATION, VERIFICATION & SIGNATURES');

  // Attachments & Digital Agreement Verification Strip
  y = drawKeyValueRow(
    margin,
    contentWidth,
    [
      {
        label: 'Member Portrait Photo',
        value: reg.photoUrl
          ? 'Attached'
          : reg.gender === 'female'
            ? 'Exempt (Female)'
            : 'Not Attached',
      },
      { label: 'Signature (300 × 80 px)', value: reg.signatureUrl ? 'Attached (Verified)' : 'Not Attached' },
      {
        label: 'Digital Membership Agreement',
        value: agreement
          ? `Saved · ${agreement.agreementId}`
          : reg.agreementPhotoUrl
            ? 'Attached (Legacy Upload)'
            : 'Saved (Encrypted Record)',
        mono: Boolean(agreement),
      },
    ],
    y
  );
  y += 5;

  // Declaration Box + Embedded QR Verification Seal
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.55);
  doc.roundedRect(margin, y, contentWidth, declH, 4, 4, 'FD');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.4);
  doc.setTextColor(51, 65, 85);
  doc.text(declLines, margin + 8, y + 10);
  if (agreementMetaLine) {
    const metaY = y + 10 + declLines.length * 9 + 3;
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.4);
    doc.line(margin + 8, metaY - 5, margin + 8 + declTextW, metaY - 5);
    doc.setFont('courier', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(5, 150, 105);
    doc.text(agreementMetaLine, margin + 8, metaY + 1.5, { maxWidth: declTextW });
  }

  if (qrDataUrl) {
    const qrDividerX = margin + contentWidth - qrColW - 4;
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.45);
    doc.line(qrDividerX, y + 5, qrDividerX, y + declH - 5);

    const qrBoxSize = 48;
    const qrX = qrDividerX + (qrColW + 4 - qrBoxSize) / 2;
    const qrY = y + 4.5;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.5);
    doc.roundedRect(qrX, qrY, qrBoxSize, qrBoxSize, 2.5, 2.5, 'FD');
    doc.addImage(qrDataUrl, 'PNG', qrX + 1.5, qrY + 1.5, qrBoxSize - 3, qrBoxSize - 3, undefined, 'FAST');
    if (/^https?:\/\//i.test(qrPayload)) {
      doc.link(qrX, qrY, qrBoxSize, qrBoxSize, { url: qrPayload });
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.5);
    doc.setTextColor(51, 65, 85);
    doc.text('SCAN TO VERIFY', qrDividerX + (qrColW + 4) / 2, qrY + qrBoxSize + 7.5, {
      align: 'center',
    });
  }
  y += declH + 6;

  // Dual Signature Blocks (Applicant 300x80 Signature + Admin Office Use Only)
  const sigBoxGap = 12;
  const sigBoxW = (contentWidth - sigBoxGap) / 2;

  // Left: Applicant Signature
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.65);
  doc.roundedRect(margin, y, sigBoxW, sigBoxH, 4, 4, 'FD');

  const sigFrameW = 120;
  const sigFrameH = 32; // exact 300x80 (15:4) proportion
  const sigFrameX = margin + (sigBoxW - sigFrameW) / 2;
  const sigFrameY = y + 5;

  if (signatureImg) {
    drawFittedImage(doc, signatureImg, sigFrameX, sigFrameY, sigFrameW, sigFrameH, 2);
  } else {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text('Applicant Signature (300 × 80 px)', margin + sigBoxW / 2, sigFrameY + 18, {
      align: 'center',
    });
  }

  doc.setDrawColor(148, 163, 184);
  doc.line(margin + 22, y + 43, margin + sigBoxW - 22, y + 43);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.6);
  doc.setTextColor(30, 41, 59);
  doc.text('Applicant Signature', margin + sigBoxW / 2, y + 52.5, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(100, 116, 139);
  doc.text(`${applicantName} · ${submittedLabel}`, margin + sigBoxW / 2, y + 61, {
    align: 'center',
    maxWidth: sigBoxW - 14,
  });

  // Right: Office Use Only (Admin Verification)
  const rightSigX = margin + sigBoxW + sigBoxGap;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(rightSigX, y, sigBoxW, sigBoxH, 4, 4, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(100, 116, 139);
  doc.text('FOR OFFICE USE ONLY', rightSigX + sigBoxW / 2, y + 11.5, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text('Official Member ID: ______________________', rightSigX + 16, y + 24);
  doc.text('Approval Date:      ______________________', rightSigX + 16, y + 34.5);

  doc.setDrawColor(148, 163, 184);
  doc.line(rightSigX + 22, y + 43, rightSigX + sigBoxW - 22, y + 43);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.6);
  doc.setTextColor(30, 41, 59);
  doc.text('Authorized Administrator Signature & Seal', rightSigX + sigBoxW / 2, y + 52.5, {
    align: 'center',
  });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(100, 116, 139);
  doc.text(`${fundName} Administration`, rightSigX + sigBoxW / 2, y + 61, {
    align: 'center',
    maxWidth: sigBoxW - 14,
  });

  // =========================================================================
  // FOOTER ON EVERY PAGE
  // =========================================================================
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p += 1) {
    doc.setPage(p);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.55);
    doc.line(margin, pageHeight - 21, pageWidth - margin, pageHeight - 21);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `${fundName} · Official Digital Membership Agreement · A4`,
      margin,
      pageHeight - 11
    );
    doc.text(`Page ${p} of ${totalPages}`, pageWidth - margin, pageHeight - 11, {
      align: 'right',
    });
  }

  const dateStamp = new Date().toISOString().slice(0, 10);
  const slug = sanitizeFileSegment(memberCode || applicantName) || 'applicant';
  doc.save(`amanah-digital-agreement-${slug}-${dateStamp}.pdf`);
}
