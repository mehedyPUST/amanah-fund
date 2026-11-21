'use client';

import type { ReactNode } from 'react';
import type {
  StructuredBdAddress,
  UserRegistrationDetails,
  UserStatus,
} from '../types/coop.ts';
import { formatDateTime } from '../utils/format.ts';
import {
  normalizeGenderToEnglish,
  normalizeMaritalStatusToEnglish,
  normalizeRelationToEnglish,
} from '../utils/inputLanguage.ts';

export interface MemberAgreementPaperPreviewProps {
  applicantName: string;
  email: string;
  memberCode?: string;
  status?: UserStatus;
  submittedAt?: string;
  fundName?: string;
  registrationDetails: UserRegistrationDetails;
  changedFields?: Set<string>;
  statusNote?: string;
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

function buildAddressRows(
  details: StructuredBdAddress | undefined,
  fallback: string
): Array<{ label: string; value: string }> {
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
}

function SectionBar({ num, title }: { num: string; title: string }) {
  return (
    <div className="flex items-center gap-2 rounded bg-emerald-50 border border-emerald-200 border-l-4 border-l-emerald-600 px-2.5 py-1.5">
      <span className="text-[11px] font-bold tracking-wide text-emerald-900 uppercase">
        {num}. {title}
      </span>
    </div>
  );
}

function PaperCell({
  label,
  value,
  subValue,
  mono = false,
  changed = false,
  className = '',
}: {
  label: string;
  value: string;
  subValue?: string;
  mono?: boolean;
  changed?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`border border-slate-200 px-2.5 py-2 transition-colors ${
        changed ? 'bg-amber-50/85 ring-1 ring-inset ring-amber-300' : 'bg-white'
      } ${className}`}
    >
      <div className="flex items-center justify-between gap-1.5">
        <span className="text-[9.5px] font-medium uppercase tracking-wider text-slate-500">
          {label}
        </span>
        {changed && (
          <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[8.5px] font-bold uppercase tracking-wider">
            Updated
          </span>
        )}
      </div>
      <div
        className={`mt-0.5 text-xs font-semibold text-slate-900 break-words ${
          mono ? 'font-mono' : ''
        }`}
      >
        {value || '—'}
      </div>
      {subValue ? (
        <div className="mt-0.5 text-[11px] font-medium text-slate-700 break-words">
          {subValue}
        </div>
      ) : null}
    </div>
  );
}

function PaperCardContainer({
  children,
  changed = false,
  className = '',
}: {
  children: ReactNode;
  changed?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`rounded-lg border overflow-hidden ${
        changed
          ? 'border-amber-300 ring-1 ring-amber-200 bg-amber-50/20'
          : 'border-slate-300 bg-white'
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function MemberAgreementPaperPreview({
  applicantName,
  email,
  memberCode,
  status,
  submittedAt,
  fundName = 'Amanah Cooperative',
  registrationDetails: reg,
  changedFields,
  statusNote,
}: MemberAgreementPaperPreviewProps) {
  const isChanged = (key: string) => Boolean(changedFields?.has(key));

  const nominees = reg.nominees || [];
  const social = reg.socialMedia;
  const hasSocial = Boolean(social?.whatsapp || social?.facebook || social?.linkedin);
  const showSpouse = Boolean(
    reg.maritalStatus !== 'single' && (reg.spouseName || reg.spouseNameBn)
  );

  const presentRows = buildAddressRows(reg.presentAddressDetails, reg.presentAddress);
  const permanentRows = buildAddressRows(reg.permanentAddressDetails, reg.permanentAddress);

  const submittedLabel = submittedAt ? formatDateTime(submittedAt) : 'Pending';
  const agreement = reg.digitalAgreement;
  const declarationText =
    agreement?.declarationText ||
    `I hereby declare that all personal, address, employment, and nominee information provided in this membership application is true, accurate, and complete. By signing and submitting this application, I execute my official Digital Membership Agreement with ${fundName} and agree to abide by the Constitution Charter (§4–§6 · VISION-36) and governance policies, including monthly savings obligations and Shariah-compliant interest-free Qard Hasan principles.`;

  let sectionNum = 2;
  const socialSecNum = hasSocial ? `0${sectionNum++}` : null;
  const addressSecNum = `0${sectionNum++}`;
  const nomineeSecNum = `0${sectionNum++}`;
  const agreementSecNum = `0${sectionNum}`;

  return (
    <div className="rounded-xl border border-slate-300 bg-white text-slate-900 shadow-sm overflow-hidden text-left">
      {/* Top Emerald Institutional Strip */}
      <div className="h-1.5 w-full bg-emerald-600" aria-hidden="true" />

      <div className="p-3.5 sm:p-5 space-y-4">
        {/* Institutional Header & Reference Box */}
        <div className="flex flex-col md:flex-row md:items-stretch justify-between gap-3 pb-3 border-b border-slate-200">
          <div className="space-y-1 min-w-0">
            <div className="text-sm sm:text-base font-bold text-slate-900 leading-tight">
              {fundName}
            </div>
            <div className="text-[11px] font-bold tracking-wide text-emerald-700 uppercase">
              OFFICIAL MEMBERSHIP APPLICATION &amp; DIGITAL AGREEMENT
            </div>
            <div className="text-[11px] text-slate-600">
              Shariah-Compliant · Interest-Free Qard Hasan · Constitution Charter (§4–§6 · VISION-36)
            </div>
          </div>

          <div className="shrink-0 w-full md:w-64 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-[11px] space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500">Ref / Member ID:</span>
              <span className="font-mono font-bold text-slate-900">
                {memberCode || 'Pending'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500">Status:</span>
              <span className="font-bold text-slate-900 text-right">
                {statusNote || formatStatusEnglish(status)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500">Prepared:</span>
              <span className="font-mono font-semibold text-slate-900 text-right">
                {submittedLabel}
              </span>
            </div>
          </div>
        </div>

        {/* SECTION 01: Personal, Account & Employment Information + Passport Photo */}
        <div className="space-y-2.5">
          <SectionBar num="01" title="PERSONAL, ACCOUNT & EMPLOYMENT INFORMATION" />

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch">
            <div className="lg:col-span-9 rounded-lg overflow-hidden border border-slate-200">
              <div className="grid grid-cols-1 sm:grid-cols-2">
                <PaperCell
                  label="Full Legal Name"
                  value={applicantName}
                  subValue={reg.nameBn}
                  changed={isChanged('name') || isChanged('nameBn')}
                />
                <PaperCell
                  label="Gender"
                  value={normalizeGenderToEnglish(reg.gender)}
                  changed={isChanged('gender')}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2">
                <PaperCell
                  label="Father's Name"
                  value={reg.fatherName || '—'}
                  subValue={reg.fatherNameBn}
                  changed={isChanged('fatherName') || isChanged('fatherNameBn')}
                />
                <PaperCell
                  label="Mother's Name"
                  value={reg.motherName || '—'}
                  subValue={reg.motherNameBn}
                  changed={isChanged('motherName') || isChanged('motherNameBn')}
                />
              </div>
              <div
                className={`grid grid-cols-1 ${
                  showSpouse ? 'sm:grid-cols-3' : 'sm:grid-cols-2'
                }`}
              >
                <PaperCell
                  label="Date of Birth"
                  value={reg.dateOfBirth || '—'}
                  mono
                  changed={isChanged('dateOfBirth')}
                />
                <PaperCell
                  label="Marital Status"
                  value={normalizeMaritalStatusToEnglish(reg.maritalStatus)}
                  changed={isChanged('maritalStatus')}
                />
                {showSpouse && (
                  <PaperCell
                    label="Spouse Name"
                    value={reg.spouseName || '—'}
                    subValue={reg.spouseNameBn}
                    changed={isChanged('spouseName') || isChanged('spouseNameBn')}
                  />
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2">
                <PaperCell
                  label="Email Address"
                  value={email}
                  mono
                  changed={isChanged('email')}
                />
                <PaperCell
                  label="Mobile Number"
                  value={reg.mobile || '—'}
                  mono
                  changed={isChanged('mobile')}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2">
                <PaperCell
                  label="National ID (NID)"
                  value={reg.nid || '—'}
                  mono
                  changed={isChanged('nid')}
                />
                <PaperCell
                  label="Reference (Existing Member)"
                  value={reg.referenceMemberName || '—'}
                  changed={isChanged('referenceMemberName')}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2">
                <PaperCell
                  label="Occupation"
                  value={reg.occupation || '—'}
                  changed={isChanged('occupation')}
                />
                <PaperCell
                  label="Company / Organization"
                  value={reg.companyOrganization || '—'}
                  changed={isChanged('companyOrganization')}
                />
              </div>
            </div>

            {/* Right Passport Photo Frame */}
            <div
              className={`lg:col-span-3 rounded-lg border p-2.5 flex flex-col items-center justify-between gap-2 ${
                isChanged('photoUrl')
                  ? 'border-amber-300 bg-amber-50/75 ring-1 ring-amber-200'
                  : 'border-slate-300 bg-slate-50'
              }`}
            >
              <div className="w-full flex items-center justify-between gap-1">
                <span className="text-[9.5px] font-bold tracking-wider uppercase text-slate-600">
                  APPLICANT PHOTO
                </span>
                {isChanged('photoUrl') && (
                  <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[8.5px] font-bold uppercase">
                    Updated
                  </span>
                )}
              </div>
              <div className="w-28 h-32 sm:w-32 sm:h-36 rounded-md border border-slate-200 bg-white overflow-hidden flex items-center justify-center">
                {reg.photoUrl ? (
                  <img
                    src={reg.photoUrl}
                    alt={`${applicantName} portrait`}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-[11px] text-slate-400 text-center px-2">
                    Applicant Photo
                  </span>
                )}
              </div>
              <span className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase">
                KYC Portrait
              </span>
            </div>
          </div>
        </div>

        {/* OPTIONAL SECTION: Social Media Profiles */}
        {hasSocial && socialSecNum && (
          <div className="space-y-2.5">
            <SectionBar num={socialSecNum} title="SOCIAL MEDIA PROFILES (OPTIONAL)" />
            <div className="rounded-lg overflow-hidden border border-slate-200 grid grid-cols-1 sm:grid-cols-3">
              <PaperCell
                label="WhatsApp"
                value={social?.whatsapp || '—'}
                mono={Boolean(social?.whatsapp)}
                changed={isChanged('socialMedia')}
              />
              <PaperCell
                label="Facebook Profile"
                value={social?.facebook || '—'}
                changed={isChanged('socialMedia')}
              />
              <PaperCell
                label="LinkedIn Profile"
                value={social?.linkedin || '—'}
                changed={isChanged('socialMedia')}
              />
            </div>
          </div>
        )}

        {/* RESIDENTIAL ADDRESSES */}
        <div className="space-y-2.5">
          <SectionBar num={addressSecNum} title="RESIDENTIAL ADDRESSES" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              {
                title: 'Present Address',
                rows: presentRows,
                changed: isChanged('presentAddress'),
              },
              {
                title: 'Permanent Address',
                rows: permanentRows,
                changed: isChanged('permanentAddress'),
              },
            ].map((card) => (
              <PaperCardContainer key={card.title} changed={card.changed}>
                <div className="px-3 py-1.5 bg-slate-100 border-b border-slate-200 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-slate-800">{card.title}</span>
                  {card.changed && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[8.5px] font-bold uppercase">
                      Updated
                    </span>
                  )}
                </div>
                <div className="divide-y divide-slate-100 text-xs">
                  {card.rows.map((r) => (
                    <div key={r.label} className="px-3 py-1.5 grid grid-cols-12 gap-2">
                      <span className="col-span-5 text-[10.5px] font-bold text-slate-500">
                        {r.label}
                      </span>
                      <span className="col-span-7 text-[11px] font-medium text-slate-900 break-words">
                        {r.value}
                      </span>
                    </div>
                  ))}
                </div>
              </PaperCardContainer>
            ))}
          </div>
        </div>

        {/* NOMINEE INFORMATION */}
        <div className="space-y-2.5">
          <SectionBar
            num={nomineeSecNum}
            title={`NOMINEE INFORMATION (${nominees.length} ${
              nominees.length === 1 ? 'NOMINEE' : 'NOMINEES'
            } · 100% SHARE ALLOCATION)`}
          />
          {nominees.length === 0 ? (
            <div className="px-3 py-2 text-xs text-slate-500 border border-dashed border-slate-200 rounded-lg">
              No nominee details attached.
            </div>
          ) : (
            <div className="space-y-2.5">
              {nominees.map((nominee, idx) => (
                <PaperCardContainer
                  key={`${nominee.name}-${idx}`}
                  changed={isChanged('nominees')}
                >
                  <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900">
                        {nominees.length > 1 ? `Nominee #${idx + 1}` : 'Primary Nominee'}
                      </span>
                      {isChanged('nominees') && (
                        <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[8.5px] font-bold uppercase">
                          Updated
                        </span>
                      )}
                    </div>
                    <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10.5px] font-bold">
                      {nominee.sharePercentage}% Share
                    </span>
                  </div>

                  <div className="p-3 flex flex-col sm:flex-row gap-3 items-start justify-between">
                    <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-[11px] w-full">
                      <div>
                        <span className="font-bold text-slate-500">Full Name: </span>
                        <span className="font-semibold text-slate-900">{nominee.name}</span>
                        {nominee.nameBn ? (
                          <div className="text-[11px] text-slate-700 font-medium">
                            {nominee.nameBn}
                          </div>
                        ) : null}
                      </div>
                      <div>
                        <span className="font-bold text-slate-500">Relation: </span>
                        <span className="text-slate-900">
                          {normalizeRelationToEnglish(nominee.relation)}
                        </span>
                      </div>
                      <div>
                        <span className="font-bold text-slate-500">Date of Birth: </span>
                        <span className="font-mono text-slate-900">{nominee.dateOfBirth}</span>
                      </div>
                      <div>
                        <span className="font-bold text-slate-500">Gender: </span>
                        <span className="text-slate-900">
                          {normalizeGenderToEnglish(nominee.gender)}
                        </span>
                      </div>
                      <div>
                        <span className="font-bold text-slate-500">Occupation: </span>
                        <span className="text-slate-900">{nominee.occupation}</span>
                      </div>
                      <div>
                        <span className="font-bold text-slate-500">NID / Birth Reg: </span>
                        <span className="font-mono text-slate-900">{nominee.nidOrBirthReg}</span>
                      </div>
                      <div>
                        <span className="font-bold text-slate-500">Mobile: </span>
                        <span className="font-mono text-slate-900">{nominee.mobile || '—'}</span>
                      </div>
                      <div className="sm:col-span-2">
                        <span className="font-bold text-slate-500">Address: </span>
                        <span className="text-slate-900">{nominee.address || '—'}</span>
                      </div>
                    </div>

                    <div className="shrink-0 w-20 h-20 rounded border border-slate-300 bg-slate-50 overflow-hidden flex items-center justify-center text-center p-1">
                      {nominee.gender === 'female' ? (
                        <span className="text-[10px] font-medium text-emerald-700 leading-tight">
                          Female
                          <br />
                          Photo Exempt
                        </span>
                      ) : nominee.photoUrl ? (
                        <img
                          src={nominee.photoUrl}
                          alt={nominee.name}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover rounded-xs"
                        />
                      ) : (
                        <span className="text-[10px] text-slate-400 leading-tight">
                          Nominee
                          <br />
                          Photo
                        </span>
                      )}
                    </div>
                  </div>
                </PaperCardContainer>
              ))}
            </div>
          )}
        </div>

        {/* DIGITAL AGREEMENT DECLARATION, VERIFICATION & SIGNATURES */}
        <div className="space-y-2.5">
          <SectionBar
            num={agreementSecNum}
            title="DIGITAL AGREEMENT DECLARATION, VERIFICATION & SIGNATURES"
          />

          <div className="rounded-lg overflow-hidden border border-slate-200 grid grid-cols-1 sm:grid-cols-3">
            <PaperCell
              label="Member Portrait Photo"
              value={reg.photoUrl ? 'Attached' : 'Not Attached'}
              changed={isChanged('photoUrl')}
            />
            <PaperCell
              label="Signature (300 × 80 px)"
              value={reg.signatureUrl ? 'Attached (Verified)' : 'Not Attached'}
              changed={isChanged('signatureUrl')}
            />
            <PaperCell
              label="Digital Membership Agreement"
              value={
                agreement
                  ? `Saved · ${agreement.agreementId}`
                  : reg.agreementPhotoUrl
                    ? 'Attached (Legacy Upload)'
                    : 'Saved (Encrypted Record)'
              }
              mono={Boolean(agreement)}
            />
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
            <p className="text-[11px] leading-relaxed text-slate-700">{declarationText}</p>
            {agreement && (
              <div className="pt-2 border-t border-slate-200 text-[10px] font-mono font-bold text-emerald-700 break-all">
                Agreement ID: {agreement.agreementId} · Signed: {formatDateTime(agreement.signedAt)}
                {agreement.activatedAt
                  ? ` · Activated: ${formatDateTime(agreement.activatedAt)}`
                  : ''}{' '}
                · SHA-256: {agreement.sha256Hash.slice(0, 16).toUpperCase()}…
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Applicant Signature Block */}
            <div
              className={`rounded-lg border p-3 flex flex-col items-center justify-between gap-2 ${
                isChanged('signatureUrl')
                  ? 'border-amber-300 bg-amber-50/75 ring-1 ring-amber-200'
                  : 'border-slate-300 bg-white'
              }`}
            >
              <div className="w-full max-w-[180px] aspect-[15/4] rounded border border-slate-200 bg-white flex items-center justify-center overflow-hidden p-1">
                {reg.signatureUrl ? (
                  <img
                    src={reg.signatureUrl}
                    alt={`${applicantName} signature`}
                    referrerPolicy="no-referrer"
                    className="max-w-full max-h-full object-contain"
                  />
                ) : (
                  <span className="text-[10px] text-slate-400">
                    Applicant Signature (300 × 80 px)
                  </span>
                )}
              </div>
              <div className="w-4/5 border-t border-slate-400 pt-1 text-center">
                <div className="text-[11px] font-bold text-slate-800">
                  Applicant Signature
                  {isChanged('signatureUrl') ? (
                    <span className="ml-1.5 px-1 py-0.5 rounded bg-amber-100 text-amber-800 text-[8.5px] uppercase">
                      Updated
                    </span>
                  ) : null}
                </div>
                <div className="text-[10px] text-slate-500 truncate">
                  {applicantName} · {submittedLabel}
                </div>
              </div>
            </div>

            {/* Office Use Only Block */}
            <div className="rounded-lg border border-slate-300 bg-white p-3 flex flex-col justify-between gap-2">
              <div className="text-center text-[10px] font-bold tracking-wider uppercase text-slate-500">
                FOR OFFICE USE ONLY
              </div>
              <div className="text-[11px] text-slate-500 space-y-1 font-mono px-2">
                <div>Official Member ID: {memberCode || '__________________'}</div>
                <div>Approval Date:      __________________</div>
              </div>
              <div className="w-4/5 mx-auto border-t border-slate-400 pt-1 text-center">
                <div className="text-[11px] font-bold text-slate-800">
                  Authorized Administrator Signature &amp; Seal
                </div>
                <div className="text-[10px] text-slate-500 truncate">
                  {fundName} Administration
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Paper Footer */}
        <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-[10.5px] text-slate-500">
          <span>
            {fundName} · Official Digital Membership Agreement · Confidential KYC Dossier
          </span>
          <span className="font-mono">Preview · All Updates Included</span>
        </div>
      </div>
    </div>
  );
}
