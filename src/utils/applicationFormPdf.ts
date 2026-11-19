import { jsPDF } from 'jspdf';
import type { AppLocale } from '../i18n/config.ts';
import type {
  NomineeInfo,
  StructuredBdAddress,
  UserRegistrationDetails,
  UserStatus,
} from '../types/coop.ts';
import { formatDateTime } from './format.ts';

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

function escapeHtml(text: string): string {
  return String(text || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
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

function formatStatusBangla(status?: UserStatus): string {
  switch (status) {
    case 'active':
      return 'সক্রিয় সদস্য';
    case 'pending_activation':
      return 'অনুমোদিত — অ্যাক্টিভেশন অপেক্ষমাণ';
    case 'suspended':
      return 'স্থগিত';
    case 'pending_approval':
    default:
      return 'অ্যাডমিন পর্যালোচনা অপেক্ষমাণ';
  }
}

function formatGenderEnglish(gender?: NomineeInfo['gender']): string {
  if (gender === 'male') return 'Male';
  if (gender === 'female') return 'Female';
  if (gender === 'other') return 'Other';
  return '—';
}

function formatGenderBangla(gender?: NomineeInfo['gender']): string {
  if (gender === 'male') return 'পুরুষ';
  if (gender === 'female') return 'মহিলা';
  if (gender === 'other') return 'অন্যান্য';
  return '—';
}

function formatMaritalStatusEnglish(status?: UserRegistrationDetails['maritalStatus']): string {
  switch (status) {
    case 'single':
      return 'Single';
    case 'married':
      return 'Married';
    case 'widowed':
      return 'Widowed';
    case 'divorced':
      return 'Divorced';
    default:
      return '—';
  }
}

function formatMaritalStatusBangla(status?: UserRegistrationDetails['maritalStatus']): string {
  switch (status) {
    case 'single':
      return 'অবিবাহিত';
    case 'married':
      return 'বিবাহিত';
    case 'widowed':
      return 'বিধবা / বিপত্নীক';
    case 'divorced':
      return 'তালাকপ্রাপ্ত';
    default:
      return '—';
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

function renderBanglaAddressHtml(
  title: string,
  details: StructuredBdAddress | undefined,
  fallbackText: string
): string {
  if (details && (details.careOf || details.villageRoadHouse || details.district)) {
    return `
      <div class="addr-card">
        <div class="addr-card-title">${escapeHtml(title)}</div>
        <table class="kv-table">
          <tr><td class="k">যত্নে (C/O)</td><td class="v">${escapeHtml(details.careOf || '—')}</td></tr>
          <tr><td class="k">গ্রাম / রোড / বাড়ি</td><td class="v">${escapeHtml(details.villageRoadHouse || '—')}</td></tr>
          <tr><td class="k">বিভাগ</td><td class="v">${escapeHtml(details.division || '—')}</td></tr>
          <tr><td class="k">জেলা</td><td class="v">${escapeHtml(details.district || '—')}</td></tr>
          <tr><td class="k">উপজেলা / থানা</td><td class="v">${escapeHtml(details.upazila || '—')}</td></tr>
          <tr><td class="k">ডাকঘর ও পোস্ট কোড</td><td class="v">${escapeHtml(details.postOffice || '—')}${details.postCode ? ` (${escapeHtml(details.postCode)})` : ''}</td></tr>
        </table>
      </div>
    `;
  }
  return `
    <div class="addr-card">
      <div class="addr-card-title">${escapeHtml(title)}</div>
      <p class="addr-fallback">${escapeHtml(fallbackText || '—')}</p>
    </div>
  `;
}

function printBanglaApplicationFormViaIframe(input: ApplicationFormPdfInput): void {
  const {
    applicantName,
    email,
    memberCode,
    status,
    submittedAt,
    fundName = 'আমানাহ সমবায় ব্যবস্থাপনা',
    registrationDetails: reg,
  } = input;

  const submittedLabel = formatDateTime(submittedAt || new Date().toISOString());
  const nominees = reg.nominees || [];
  const social = reg.socialMedia;
  const hasSocial = Boolean(social?.whatsapp || social?.facebook || social?.linkedin);

  const nomineesHtml =
    nominees.length === 0
      ? `<p class="muted">কোনো নমিনি তথ্য সংযুক্ত নেই।</p>`
      : nominees
          .map((n, idx) => {
            const label =
              nominees.length > 1 ? `নমিনি #${idx + 1}` : 'প্রধান নমিনি';
            const photoCell =
              n.gender === 'female'
                ? `<div class="nom-photo-exempt">মহিলা নমিনি<br/>ছবি প্রযোজ্য নয়</div>`
                : n.photoUrl
                  ? `<img src="${escapeHtml(n.photoUrl)}" alt="${escapeHtml(n.name)}" referrerpolicy="no-referrer" class="nom-photo-img" />`
                  : `<div class="nom-photo-exempt">ছবি সংযুক্ত নয়</div>`;
            return `
              <div class="nominee-card">
                <div class="nominee-head">
                  <strong>${escapeHtml(label)}</strong>
                  <span class="badge">${escapeHtml(`${n.sharePercentage}% অংশ`)}</span>
                </div>
                <div class="nominee-body">
                  <table class="kv-table">
                    <tr><td class="k">পূর্ণ নাম</td><td class="v"><strong>${escapeHtml(n.name)}</strong></td><td class="k">সম্পর্ক</td><td class="v">${escapeHtml(n.relation)}</td></tr>
                    <tr><td class="k">জন্ম তারিখ</td><td class="v mono">${escapeHtml(n.dateOfBirth)}</td><td class="k">লিঙ্গ</td><td class="v">${escapeHtml(formatGenderBangla(n.gender))}</td></tr>
                    <tr><td class="k">পেশা</td><td class="v">${escapeHtml(n.occupation)}</td><td class="k">এনআইডি / জন্ম নিবন্ধন</td><td class="v mono">${escapeHtml(n.nidOrBirthReg)}</td></tr>
                    <tr><td class="k">মোবাইল</td><td class="v mono">${escapeHtml(n.mobile || '—')}</td><td class="k">ঠিকানা</td><td class="v">${escapeHtml(n.address)}</td></tr>
                  </table>
                  <div class="nom-photo-wrap">${photoCell}</div>
                </div>
              </div>
            `;
          })
          .join('');

  const html = `<!doctype html>
<html lang="bn">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(fundName)} - সদস্যপদ আবেদন ফরম</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Anek+Bangla:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    @page { size: A4 portrait; margin: 13mm; }
    * { box-sizing: border-box; }
    body {
      font-family: "Anek Bangla", "Noto Sans Bengali", system-ui, sans-serif;
      color: #0f172a;
      margin: 0;
      font-size: 11px;
      line-height: 1.45;
      background: #ffffff;
    }
    .top-bar { height: 5px; background: #059669; border-radius: 3px; margin-bottom: 10px; }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      border-bottom: 1.5px solid #e2e8f0;
      padding-bottom: 10px;
      margin-bottom: 12px;
    }
    .fund-name { font-size: 17px; font-weight: 700; margin: 0; color: #0f172a; }
    .doc-subtitle { font-size: 11.5px; font-weight: 600; color: #047857; margin: 2px 0 0; }
    .charter { font-size: 9.5px; color: #475569; margin: 2px 0 0; }
    .ref-box {
      border: 1px solid #cbd5e1;
      background: #f8fafc;
      border-radius: 6px;
      padding: 6px 10px;
      font-size: 10px;
      min-width: 175px;
    }
    .ref-row { display: flex; justify-content: space-between; gap: 8px; }
    .ref-label { color: #64748b; }
    .ref-val { font-weight: 700; color: #0f172a; }
    .section-title {
      font-size: 11px;
      font-weight: 700;
      color: #065f46;
      background: #ecfdf5;
      border-left: 3.5px solid #059669;
      padding: 4px 8px;
      margin: 12px 0 8px;
      border-radius: 0 4px 4px 0;
    }
    .identity-grid {
      display: grid;
      grid-template-columns: 1fr 104px;
      gap: 12px;
      align-items: start;
    }
    .photo-box {
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 4px;
      background: #f8fafc;
      text-align: center;
    }
    .photo-box img {
      width: 94px;
      height: 112px;
      object-fit: cover;
      border-radius: 4px;
      display: block;
      margin: 0 auto;
    }
    .photo-placeholder {
      width: 94px;
      height: 112px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #94a3b8;
      font-size: 9.5px;
      border: 1px dashed #cbd5e1;
      border-radius: 4px;
    }
    .photo-caption { font-size: 9px; color: #64748b; margin-top: 4px; }
    table.kv-table { width: 100%; border-collapse: collapse; }
    table.kv-table td {
      padding: 4px 6px;
      border: 1px solid #e2e8f0;
      vertical-align: top;
      font-size: 10.5px;
    }
    table.kv-table td.k {
      background: #f8fafc;
      color: #475569;
      font-weight: 600;
      width: 22%;
      white-space: nowrap;
    }
    table.kv-table td.v { color: #0f172a; word-break: break-word; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px; }
    .addr-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .addr-card {
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      overflow: hidden;
    }
    .addr-card-title {
      background: #f1f5f9;
      padding: 5px 8px;
      font-weight: 700;
      font-size: 10.5px;
      color: #1e293b;
      border-bottom: 1px solid #e2e8f0;
    }
    .addr-fallback { margin: 0; padding: 8px; font-size: 10.5px; }
    .nominee-card {
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      overflow: hidden;
      margin-bottom: 8px;
      page-break-inside: avoid;
    }
    .nominee-head {
      background: #f8fafc;
      padding: 5px 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #e2e8f0;
      font-size: 10.5px;
    }
    .badge {
      background: #d1fae5;
      color: #065f46;
      padding: 1px 7px;
      border-radius: 4px;
      font-weight: 700;
      font-size: 9.5px;
    }
    .nominee-body {
      display: grid;
      grid-template-columns: 1fr 78px;
      gap: 8px;
      padding: 6px;
      align-items: start;
    }
    .nom-photo-img {
      width: 72px;
      height: 84px;
      object-fit: cover;
      border-radius: 4px;
      border: 1px solid #cbd5e1;
      display: block;
    }
    .nom-photo-exempt {
      width: 72px;
      height: 84px;
      border: 1px dashed #cbd5e1;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      font-size: 8.5px;
      color: #64748b;
      padding: 4px;
    }
    .declaration {
      border: 1px solid #e2e8f0;
      background: #f8fafc;
      border-radius: 6px;
      padding: 8px 10px;
      font-size: 10px;
      color: #334155;
      margin-top: 8px;
      page-break-inside: avoid;
    }
    .sig-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
      margin-top: 10px;
      page-break-inside: avoid;
    }
    .sig-box {
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 8px 10px;
      text-align: center;
    }
    .sig-frame {
      width: 210px;
      height: 56px;
      margin: 0 auto 6px;
      border: 1px solid #e2e8f0;
      background: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      overflow: hidden;
    }
    .sig-frame img { max-width: 100%; max-height: 100%; object-fit: contain; }
    .sig-line {
      border-top: 1px solid #94a3b8;
      margin-top: 6px;
      padding-top: 4px;
      font-size: 10px;
      font-weight: 600;
      color: #1e293b;
    }
    .sig-sub { font-size: 9px; color: #64748b; }
    .footer {
      margin-top: 12px;
      padding-top: 6px;
      border-top: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      font-size: 9px;
      color: #64748b;
    }
    .keep-together {
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .muted { color: #64748b; font-size: 10px; }
  </style>
</head>
<body>
  <div class="top-bar"></div>
  <div class="header">
    <div>
      <h1 class="fund-name">${escapeHtml(fundName)}</h1>
      <p class="doc-subtitle">আনুষ্ঠানিক সদস্যপদ আবেদন ফরম · ভিশন-৩৬ (২০২৭–২০৩৬)</p>
      <p class="charter">শরিয়াহ-সম্মত · সুদমুক্ত কর্জে হাসানা · AES-256-GCM এনক্রিপ্টেড কেওয়াইসি</p>
    </div>
    <div class="ref-box">
      <div class="ref-row"><span class="ref-label">আবেদন / সদস্য আইডি:</span><span class="ref-val mono">${escapeHtml(memberCode || 'অপেক্ষমাণ')}</span></div>
      <div class="ref-row"><span class="ref-label">অবস্থা:</span><span class="ref-val">${escapeHtml(formatStatusBangla(status))}</span></div>
      <div class="ref-row"><span class="ref-label">জমাদানের তারিখ:</span><span class="ref-val mono">${escapeHtml(submittedLabel)}</span></div>
    </div>
  </div>

  <div class="section-title">০১. ব্যক্তিগত ও পেশাগত তথ্য</div>
  <div class="identity-grid">
    <table class="kv-table">
      <tr>
        <td class="k">পূর্ণ নাম</td><td class="v"><strong>${escapeHtml(applicantName)}</strong></td>
        <td class="k">লিঙ্গ</td><td class="v">${escapeHtml(formatGenderBangla(reg.gender))}</td>
      </tr>
      <tr>
        <td class="k">পিতার নাম</td><td class="v">${escapeHtml(reg.fatherName || '—')}</td>
        <td class="k">মাতার নাম</td><td class="v">${escapeHtml(reg.motherName || '—')}</td>
      </tr>
      <tr>
        <td class="k">বৈবাহিক অবস্থা</td><td class="v">${escapeHtml(formatMaritalStatusBangla(reg.maritalStatus))}</td>
        <td class="k">স্বামী / স্ত্রীর নাম</td><td class="v">${escapeHtml(reg.spouseName || '—')}</td>
      </tr>
      <tr><td class="k">ইমেইল</td><td class="v mono">${escapeHtml(email)}</td><td class="k">মোবাইল নম্বর</td><td class="v mono">${escapeHtml(reg.mobile)}</td></tr>
      <tr><td class="k">জন্ম তারিখ</td><td class="v mono">${escapeHtml(reg.dateOfBirth)}</td><td class="k">জাতীয় পরিচয়পত্র (NID)</td><td class="v mono">${escapeHtml(reg.nid)}</td></tr>
      <tr><td class="k">পেশা</td><td class="v">${escapeHtml(reg.occupation)}</td><td class="k">প্রতিষ্ঠান / সংস্থা</td><td class="v">${escapeHtml(reg.companyOrganization)}</td></tr>
      <tr><td class="k">রেফারেন্স সদস্য</td><td class="v" colspan="3">${escapeHtml(reg.referenceMemberName)}</td></tr>
    </table>
    <div class="photo-box">
      ${
        reg.photoUrl
          ? `<img src="${escapeHtml(reg.photoUrl)}" alt="${escapeHtml(applicantName)}" referrerpolicy="no-referrer" />`
          : `<div class="photo-placeholder">সদস্যের ছবি</div>`
      }
      <div class="photo-caption">আবেদনকারীর ছবি</div>
    </div>
  </div>

  ${
    hasSocial
      ? `<div class="section-title">০২. সোশ্যাল মিডিয়া ও যোগাযোগ প্রোফাইল (ঐচ্ছিক)</div>
        <table class="kv-table">
          <tr>
            <td class="k">হোয়াটসঅ্যাপ</td><td class="v mono">${escapeHtml(social?.whatsapp || '—')}</td>
            <td class="k">ফেসবুক</td><td class="v">${escapeHtml(social?.facebook || '—')}</td>
            <td class="k">লিংকডইন</td><td class="v">${escapeHtml(social?.linkedin || '—')}</td>
          </tr>
        </table>`
      : ''
  }

  <div class="section-title">${hasSocial ? '০৩' : '০২'}. বসবাসের ঠিকানা</div>
  <div class="addr-grid">
    ${renderBanglaAddressHtml('বর্তমান ঠিকানা', reg.presentAddressDetails, reg.presentAddress)}
    ${renderBanglaAddressHtml('স্থায়ী ঠিকানা', reg.permanentAddressDetails, reg.permanentAddress)}
  </div>

  <div class="section-title">${hasSocial ? '০৪' : '০৩'}. নমিনি তথ্য (${nominees.length} জন · মোট ১০০% অংশ)</div>
  ${nomineesHtml}

  <div class="keep-together">
    <div class="section-title">${hasSocial ? '০৫' : '০৪'}. ঘোষণা, স্বাক্ষর ও সংযুক্ত নথিপত্র</div>
    <table class="kv-table">
      <tr>
        <td class="k">আবেদনকারীর ছবি</td><td class="v">${reg.photoUrl ? 'সংযুক্ত' : 'সংযুক্ত নয়'}</td>
        <td class="k">স্বাক্ষর (৩০০×৮০)</td><td class="v">${reg.signatureUrl ? 'সংযুক্ত' : 'সংযুক্ত নয়'}</td>
        <td class="k">চুক্তিপত্র (ঐচ্ছিক)</td><td class="v">${reg.agreementPhotoUrl ? 'সংযুক্ত' : 'ঐচ্ছিক (সংযুক্ত নয়)'}</td>
      </tr>
    </table>
    <div class="declaration">
      আমি এই মর্মে ঘোষণা করছি যে, এই সদস্যপদ আবেদন ফরমে প্রদত্ত সকল ব্যক্তিগত, ঠিকানা ও নমিনি তথ্য সম্পূর্ণ সত্য ও নির্ভুল। আমি ${escapeHtml(fundName)}-এর গঠনতন্ত্র (ধারা ৪–৬ · ভিশন-৩৬) এবং সমবায়ের সকল নীতিমালা মেনে চলতে সম্মত আছি।
    </div>
    <div class="sig-grid">
      <div class="sig-box">
        <div class="sig-frame">
          ${
            reg.signatureUrl
              ? `<img src="${escapeHtml(reg.signatureUrl)}" alt="Signature" referrerpolicy="no-referrer" />`
              : `<span class="muted">স্বাক্ষর (৩০০ × ৮০ পিক্সেল)</span>`
          }
        </div>
        <div class="sig-line">আবেদনকারীর স্বাক্ষর</div>
        <div class="sig-sub">${escapeHtml(applicantName)} · ${escapeHtml(submittedLabel)}</div>
      </div>
      <div class="sig-box">
        <div class="sig-frame"><span class="muted">অফিসিয়াল অনুমোদনের জন্য</span></div>
        <div class="sig-line">অ্যাডমিনিস্ট্রেটর স্বাক্ষর ও সিল</div>
        <div class="sig-sub">আনুষ্ঠানিক সদস্য আইডি ও তারিখ</div>
      </div>
    </div>
  </div>

  <div class="footer">
    <span>${escapeHtml(fundName)} · গোপনীয় সদস্যপদ আবেদন নথি</span>
    <span>ডাউনলোড: ${escapeHtml(formatDateTime(new Date().toISOString()))}</span>
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
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
  };

  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!iframeDoc || !iframe.contentWindow) {
    cleanup();
    return;
  }

  iframeDoc.open();
  iframeDoc.write(html);
  iframeDoc.close();

  const triggerPrint = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } finally {
      window.setTimeout(cleanup, 1500);
    }
  };

  const imgs = Array.from(iframeDoc.images);
  const imagesReady = Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((res) => {
          if (img.complete) {
            res();
            return;
          }
          const t = window.setTimeout(res, 2500);
          img.onload = () => {
            window.clearTimeout(t);
            res();
          };
          img.onerror = () => {
            window.clearTimeout(t);
            res();
          };
        })
    )
  );

  const fontsApi = (iframeDoc as Document & { fonts?: { ready?: Promise<unknown> } }).fonts;
  Promise.all([
    imagesReady,
    fontsApi?.ready ? fontsApi.ready.catch(() => undefined) : Promise.resolve(),
  ])
    .then(() => window.setTimeout(triggerPrint, 150))
    .catch(() => triggerPrint());
}

/**
 * Generates and downloads a well-organized, official A4 PDF of a submitted
 * Amanah Cooperative Membership Application Form (including applicant photo,
 * Teletalk-structured addresses, optional social media, nominees, and 300x80 signature).
 */
export async function downloadMembershipApplicationPdf(
  input: ApplicationFormPdfInput
): Promise<void> {
  const locale = input.locale || 'en';
  if (locale === 'bn' && typeof document !== 'undefined') {
    printBanglaApplicationFormViaIframe(input);
    return;
  }

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

  // Load applicant photo, 300x80 signature, and nominee photos in parallel
  const [memberPhoto, signatureImg, ...nomineePhotos] = await Promise.all([
    loadImageForPdf(reg.photoUrl, false),
    loadImageForPdf(reg.signatureUrl, true),
    ...nominees.map((n) =>
      n.gender === 'female' ? Promise.resolve(null) : loadImageForPdf(n.photoUrl, false)
    ),
  ]);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth(); // 595.28
  const pageHeight = doc.internal.pageSize.getHeight(); // 841.89
  const margin = 34;
  const contentWidth = pageWidth - margin * 2;
  const bottomLimit = pageHeight - 36;
  let y = 26;

  const ensureSpace = (needed: number) => {
    if (y + needed > bottomLimit) {
      doc.addPage();
      y = 32;
    }
  };

  const drawSectionBar = (sectionNum: string, title: string) => {
    ensureSpace(26);
    doc.setFillColor(236, 253, 245); // emerald-50
    doc.setDrawColor(167, 243, 208); // emerald-200
    doc.setLineWidth(0.6);
    doc.roundedRect(margin, y, contentWidth, 18.5, 3, 3, 'FD');

    doc.setFillColor(5, 150, 105); // emerald-600 left accent bar
    doc.rect(margin, y, 4, 18.5, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.8);
    doc.setTextColor(6, 95, 70); // emerald-800
    doc.text(`${sectionNum}. ${title}`, margin + 10, y + 12.2);
    y += 23;
  };

  // Top Emerald Institutional Strip
  doc.setFillColor(5, 150, 105);
  doc.rect(margin, y, contentWidth, 4, 'F');
  y += 10;

  // Header Left: Cooperative Identity (Dynamic vertical flow — zero overlap for multi-line names)
  const refBoxW = 192;
  const headerLeftW = contentWidth - refBoxW - 14;
  const headerTopY = y;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13.5);
  doc.setTextColor(15, 23, 42);
  const titleLines = doc.splitTextToSize(fundName, headerLeftW) as string[];
  const titleLineH = 15.5;
  doc.text(titleLines, margin, headerTopY + 11.5);

  const subtitleY = headerTopY + 11.5 + (titleLines.length - 1) * titleLineH + 12.5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(5, 150, 105);
  doc.text('OFFICIAL MEMBERSHIP APPLICATION FORM', margin, subtitleY);

  const charterY = subtitleY + 11;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.6);
  doc.setTextColor(71, 85, 105);
  const charterLines = doc.splitTextToSize(
    'Shariah-Compliant · Interest-Free Qard Hasan · Constitution Charter (§4–§6 · VISION-36)',
    headerLeftW
  ) as string[];
  doc.text(charterLines, margin, charterY);
  const leftBottomY = charterY + (charterLines.length - 1) * 9.5 + 5;

  // Header Right: Application Reference Box
  const refBoxX = pageWidth - margin - refBoxW;
  const refBoxY = headerTopY;
  const refBoxH = Math.max(48, leftBottomY - headerTopY);
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
  const refStep = 13;
  const refStartY = refBoxY + (refBoxH - (refLines.length - 1) * refStep) / 2 + 2.5;
  refLines.forEach((line, idx) => {
    const ry = refStartY + idx * refStep;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.4);
    doc.setTextColor(100, 116, 139);
    doc.text(line.k, refBoxX + 8, ry);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(line.v, refBoxX + refBoxW - 8, ry, { align: 'right' });
  });

  y = Math.max(leftBottomY, refBoxY + refBoxH) + 7;
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.75);
  doc.line(margin, y, pageWidth - margin, y);
  y += 9;

  // =========================================================================
  // SECTION 01: Personal, Account & Employment Details + Passport Photo Box
  // =========================================================================
  drawSectionBar('01', 'PERSONAL, ACCOUNT & EMPLOYMENT INFORMATION');

  const photoBoxW = 94;
  const detailsGridW = contentWidth - photoBoxW - 10;
  const photoBoxX = margin + detailsGridW + 10;
  const section1TopY = y;

  const drawKeyValueRow = (
    x: number,
    w: number,
    pairs: Array<{ label: string; value: string; mono?: boolean }>,
    rowY: number
  ): number => {
    const colCount = pairs.length;
    const colW = w / colCount;

    let maxTextH = 9.5;
    const wrappedPerCol = pairs.map((p) => {
      doc.setFont(p.mono ? 'courier' : 'helvetica', 'bold');
      doc.setFontSize(8.2);
      const lines = doc.splitTextToSize(p.value || '—', colW - 12) as string[];
      maxTextH = Math.max(maxTextH, lines.length * 9.5);
      return lines;
    });

    const rowH = Math.max(24.5, 11.5 + maxTextH + 4);

    pairs.forEach((p, idx) => {
      const cx = x + idx * colW;
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.55);
      doc.rect(cx, rowY, colW, rowH, 'FD');

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.6);
      doc.setTextColor(100, 116, 139);
      doc.text(p.label.toUpperCase(), cx + 6, rowY + 8.5);

      doc.setFont(p.mono ? 'courier' : 'helvetica', 'bold');
      doc.setFontSize(8.2);
      doc.setTextColor(15, 23, 42);
      doc.text(wrappedPerCol[idx], cx + 6, rowY + 18.5);
    });

    return rowY + rowH;
  };

  y = drawKeyValueRow(
    margin,
    detailsGridW,
    [
      { label: 'Full Legal Name', value: applicantName },
      { label: 'Gender', value: formatGenderEnglish(reg.gender) },
    ],
    y
  );
  y = drawKeyValueRow(
    margin,
    detailsGridW,
    [
      { label: "Father's Name", value: reg.fatherName || '—' },
      { label: "Mother's Name", value: reg.motherName || '—' },
    ],
    y
  );
  y = drawKeyValueRow(
    margin,
    detailsGridW,
    reg.spouseName
      ? [
          { label: 'Date of Birth', value: reg.dateOfBirth, mono: true },
          { label: 'Marital Status', value: formatMaritalStatusEnglish(reg.maritalStatus) },
          { label: 'Spouse Name', value: reg.spouseName },
        ]
      : [
          { label: 'Date of Birth', value: reg.dateOfBirth, mono: true },
          { label: 'Marital Status', value: formatMaritalStatusEnglish(reg.maritalStatus) },
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
  const photoFrameH = Math.max(126, Math.min(section1GridH, 148));
  const photoInnerH = photoFrameH - 18;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.75);
  doc.roundedRect(photoBoxX, section1TopY, photoBoxW, photoFrameH, 4, 4, 'FD');

  if (memberPhoto) {
    drawFittedImage(doc, memberPhoto, photoBoxX + 4, section1TopY + 4, photoBoxW - 8, photoInnerH - 4, 1);
  } else {
    doc.setDrawColor(203, 213, 225);
    doc.setLineDashPattern([3, 2], 0);
    doc.rect(photoBoxX + 6, section1TopY + 6, photoBoxW - 12, photoInnerH - 8);
    doc.setLineDashPattern([], 0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.4);
    doc.setTextColor(148, 163, 184);
    doc.text('Applicant', photoBoxX + photoBoxW / 2, section1TopY + photoInnerH / 2 - 4, {
      align: 'center',
    });
    doc.text('Photo', photoBoxX + photoBoxW / 2, section1TopY + photoInnerH / 2 + 7, {
      align: 'center',
    });
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(71, 85, 105);
  doc.text('APPLICANT PHOTO', photoBoxX + photoBoxW / 2, section1TopY + photoFrameH - 6, {
    align: 'center',
  });

  y = Math.max(y, section1TopY + photoFrameH) + 8;

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
    y += 8;
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
    let h = 18.5; // title bar
    for (const r of rows) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      const valLines = doc.splitTextToSize(r.value, addrColW - 92) as string[];
      h += Math.max(14.5, valLines.length * 9.5 + 5);
    }
    return h + 3;
  };

  const addrBoxH = Math.max(
    measureAddrCardHeight(presentRows),
    measureAddrCardHeight(permanentRows)
  );
  ensureSpace(addrBoxH + 8);

  const drawAddressCard = (
    cardX: number,
    cardY: number,
    cardTitle: string,
    rows: Array<{ label: string; value: string }>,
    fixedH: number
  ) => {
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.7);
    doc.roundedRect(cardX, cardY, addrColW, fixedH, 4, 4, 'FD');

    doc.setFillColor(241, 245, 249);
    doc.roundedRect(cardX, cardY, addrColW, 18, 4, 4, 'F');
    doc.rect(cardX, cardY + 12, addrColW, 6, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.line(cardX, cardY + 18, cardX + addrColW, cardY + 18);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.2);
    doc.setTextColor(30, 41, 59);
    doc.text(cardTitle, cardX + 8, cardY + 12);

    let ry = cardY + 19;
    rows.forEach((r, idx) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      const valLines = doc.splitTextToSize(r.value, addrColW - 92) as string[];
      const lineH = Math.max(14.5, valLines.length * 9.5 + 5);

      if (idx > 0) {
        doc.setDrawColor(241, 245, 249);
        doc.setLineWidth(0.5);
        doc.line(cardX + 6, ry, cardX + addrColW - 6, ry);
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.1);
      doc.setTextColor(100, 116, 139);
      doc.text(r.label, cardX + 8, ry + 10);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      doc.text(valLines, cardX + 86, ry + 10);

      ry += lineH;
    });
  };

  drawAddressCard(margin, y, 'Present Address', presentRows, addrBoxH);
  drawAddressCard(margin + addrColW + addrGap, y, 'Permanent Address', permanentRows, addrBoxH);
  y += addrBoxH + 8;

  // =========================================================================
  // NOMINEE INFORMATION
  // =========================================================================
  drawSectionBar(
    `0${nextSectionNumber}`,
    `NOMINEE INFORMATION (${nominees.length} ${nominees.length === 1 ? 'NOMINEE' : 'NOMINEES'} · 100% SHARE ALLOCATION)`
  );
  nextSectionNumber += 1;

  if (nominees.length === 0) {
    ensureSpace(22);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.2);
    doc.setTextColor(100, 116, 139);
    doc.text('No nominee details attached.', margin + 4, y + 10);
    y += 18;
  } else {
    nominees.forEach((nominee, idx) => {
      const nomPhoto = nomineePhotos[idx] || null;
      const nomPhotoW = 64;
      const nomInfoW = contentWidth - nomPhotoW - 16;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      const addrLines = doc.splitTextToSize(nominee.address || '—', nomInfoW - 64) as string[];
      const cardH = Math.max(88, 19 + 50 + Math.max(14, addrLines.length * 9.5 + 5) + 6);
      ensureSpace(cardH + 6);

      const cardY = y;
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.7);
      doc.roundedRect(margin, cardY, contentWidth, cardH, 4, 4, 'FD');

      // Nominee card header bar
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(margin, cardY, contentWidth, 18, 4, 4, 'F');
      doc.rect(margin, cardY + 12, contentWidth, 6, 'F');
      doc.setDrawColor(226, 232, 240);
      doc.line(margin, cardY + 18, margin + contentWidth, cardY + 18);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.2);
      doc.setTextColor(15, 23, 42);
      const nomTitle =
        nominees.length > 1 ? `Nominee #${idx + 1}` : 'Primary Nominee';
      doc.text(nomTitle, margin + 8, cardY + 12);

      // Share badge on right
      const shareText = `${nominee.sharePercentage}% Share`;
      doc.setFillColor(209, 250, 229);
      doc.roundedRect(margin + contentWidth - 66, cardY + 3, 58, 12, 3, 3, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.2);
      doc.setTextColor(6, 95, 70);
      doc.text(shareText, margin + contentWidth - 37, cardY + 11.2, { align: 'center' });

      // Nominee details grid
      const colA = margin + 8;
      const colB = margin + 8 + nomInfoW / 2;
      let ny = cardY + 29;

      const drawNomField = (fx: number, fy: number, lbl: string, val: string, mono = false) => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(100, 116, 139);
        doc.text(`${lbl}:`, fx, fy);
        doc.setFont(mono ? 'courier' : 'helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(15, 23, 42);
        doc.text(val || '—', fx + 58, fy, { maxWidth: nomInfoW / 2 - 62 });
      };

      drawNomField(colA, ny, 'Full Name', nominee.name);
      drawNomField(colB, ny, 'Relation', nominee.relation);
      ny += 12.5;
      drawNomField(colA, ny, 'Date of Birth', nominee.dateOfBirth, true);
      drawNomField(colB, ny, 'Gender', formatGenderEnglish(nominee.gender));
      ny += 12.5;
      drawNomField(colA, ny, 'Occupation', nominee.occupation);
      drawNomField(colB, ny, 'NID / Birth Reg', nominee.nidOrBirthReg, true);
      ny += 12.5;
      drawNomField(colA, ny, 'Mobile', nominee.mobile || '—', true);
      ny += 12.5;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text('Address:', colA, ny);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      doc.text(addrLines, colA + 58, ny);

      // Nominee photo box on the right
      const nPhotoX = margin + contentWidth - nomPhotoW - 6;
      const nPhotoY = cardY + 23;
      const nPhotoH = 60;
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(203, 213, 225);
      doc.roundedRect(nPhotoX, nPhotoY, nomPhotoW, nPhotoH, 3, 3, 'FD');

      if (nominee.gender === 'female') {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.6);
        doc.setTextColor(5, 150, 105);
        doc.text('Female', nPhotoX + nomPhotoW / 2, nPhotoY + 26, { align: 'center' });
        doc.text('Photo Exempt', nPhotoX + nomPhotoW / 2, nPhotoY + 36, { align: 'center' });
      } else if (nomPhoto) {
        drawFittedImage(doc, nomPhoto, nPhotoX + 2, nPhotoY + 2, nomPhotoW - 4, nPhotoH - 4, 1);
      } else {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.6);
        doc.setTextColor(148, 163, 184);
        doc.text('Nominee', nPhotoX + nomPhotoW / 2, nPhotoY + 26, { align: 'center' });
        doc.text('Photo', nPhotoX + nomPhotoW / 2, nPhotoY + 36, { align: 'center' });
      }

      y = cardY + cardH + 6;
    });
    y += 2;
  }

  // =========================================================================
  // DECLARATION, ATTACHMENTS CHECKLIST & 300x80 SIGNATURE BLOCK
  // Pre-measure full block so Section 04 NEVER orphans signatures on page 2
  // =========================================================================
  const declarationText =
    `I hereby declare that all personal, address, employment, and nominee information provided in this membership application is true, accurate, and complete. I agree to abide by the Constitution Charter (§4–§6 · VISION-36) and governance policies of ${fundName}, including monthly savings obligations and Shariah-compliant interest-free Qard Hasan principles.`;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.8);
  const declLines = doc.splitTextToSize(declarationText, contentWidth - 16) as string[];
  const declH = declLines.length * 9.8 + 12;
  const sigBoxH = 74;
  const totalSection4H = 23 + 25 + 6 + declH + 7 + sigBoxH;

  ensureSpace(totalSection4H);
  drawSectionBar(`0${nextSectionNumber}`, 'DECLARATION, ATTACHMENTS & SIGNATURES');

  // Attachments Checklist Strip
  y = drawKeyValueRow(
    margin,
    contentWidth,
    [
      { label: 'Member Portrait Photo', value: reg.photoUrl ? 'Attached' : 'Not Attached' },
      { label: 'Signature (300 × 80 px)', value: reg.signatureUrl ? 'Attached (Verified)' : 'Not Attached' },
      {
        label: 'Signed Agreement Paper',
        value: reg.agreementPhotoUrl ? 'Attached (Document/Image)' : 'Optional — Not Attached',
      },
    ],
    y
  );
  y += 6;

  // Declaration Box
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.6);
  doc.roundedRect(margin, y, contentWidth, declH, 4, 4, 'FD');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.8);
  doc.setTextColor(51, 65, 85);
  doc.text(declLines, margin + 8, y + 11);
  y += declH + 7;

  // Dual Signature Blocks (Applicant 300x80 Signature + Admin Office Use Only)
  const sigBoxGap = 12;
  const sigBoxW = (contentWidth - sigBoxGap) / 2;

  // Left: Applicant Signature
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.7);
  doc.roundedRect(margin, y, sigBoxW, sigBoxH, 4, 4, 'FD');

  const sigFrameW = 135;
  const sigFrameH = 36; // exact 300x80 (15:4) proportion
  const sigFrameX = margin + (sigBoxW - sigFrameW) / 2;
  const sigFrameY = y + 6;

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(sigFrameX, sigFrameY, sigFrameW, sigFrameH, 2, 2, 'FD');

  if (signatureImg) {
    drawFittedImage(doc, signatureImg, sigFrameX, sigFrameY, sigFrameW, sigFrameH, 2);
  } else {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(148, 163, 184);
    doc.text('Applicant Signature (300 × 80 px)', margin + sigBoxW / 2, sigFrameY + 20, {
      align: 'center',
    });
  }

  doc.setDrawColor(148, 163, 184);
  doc.line(margin + 22, y + 49, margin + sigBoxW - 22, y + 49);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(30, 41, 59);
  doc.text('Applicant Signature', margin + sigBoxW / 2, y + 59, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text(`${applicantName} · ${submittedLabel}`, margin + sigBoxW / 2, y + 68, {
    align: 'center',
    maxWidth: sigBoxW - 14,
  });

  // Right: Office Use Only (Admin Verification)
  const rightSigX = margin + sigBoxW + sigBoxGap;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(rightSigX, y, sigBoxW, sigBoxH, 4, 4, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text('FOR OFFICE USE ONLY', rightSigX + sigBoxW / 2, y + 13, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.3);
  doc.setTextColor(148, 163, 184);
  doc.text('Official Member ID: ______________________', rightSigX + 16, y + 28);
  doc.text('Approval Date:      ______________________', rightSigX + 16, y + 39);

  doc.setDrawColor(148, 163, 184);
  doc.line(rightSigX + 22, y + 49, rightSigX + sigBoxW - 22, y + 49);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(30, 41, 59);
  doc.text('Authorized Administrator Signature & Seal', rightSigX + sigBoxW / 2, y + 59, {
    align: 'center',
  });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text(`${fundName} Administration`, rightSigX + sigBoxW / 2, y + 68, {
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
    doc.setLineWidth(0.6);
    doc.line(margin, pageHeight - 26, pageWidth - margin, pageHeight - 26);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `${fundName} · Official Membership Application Form · Confidential KYC Dossier`,
      margin,
      pageHeight - 15
    );
    doc.text(`Page ${p} of ${totalPages}`, pageWidth - margin, pageHeight - 15, {
      align: 'right',
    });
  }

  const dateStamp = new Date().toISOString().slice(0, 10);
  const slug = sanitizeFileSegment(memberCode || applicantName) || 'applicant';
  doc.save(`amanah-application-${slug}-${dateStamp}.pdf`);
}
