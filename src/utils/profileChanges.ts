import type {
  IdentityDocType,
  MemberGender,
  NomineeGender,
  NomineeInfo,
  ProfileChangePayload,
  StructuredBdAddress,
} from '../types/coop.ts';
import {
  normalizeGenderToEnglish,
  normalizeMaritalStatusToEnglish,
} from './inputLanguage.ts';

export const OTHER_RELATION_VALUE = '__other__';

export const FEMALE_NOMINEE_RELATIONS = [
  'Wife',
  'Mother',
  'Daughter',
  'Sister',
  'Grandmother',
  'Granddaughter',
  'Aunt',
  'Niece',
  'Mother-in-Law',
  'Sister-in-Law',
  'Daughter-in-Law',
] as const;

export const MALE_NOMINEE_RELATIONS = [
  'Husband',
  'Father',
  'Son',
  'Brother',
  'Grandfather',
  'Grandson',
  'Uncle',
  'Nephew',
  'Father-in-Law',
  'Brother-in-Law',
  'Son-in-Law',
] as const;

export const OTHER_NOMINEE_RELATIONS = [
  'Spouse',
  'Parent',
  'Child',
  'Sibling',
  'Relative',
  'Guardian',
] as const;

export function getLogicalRelationOptions(
  nomineeGender: '' | NomineeGender,
  applicantGender: '' | MemberGender
): string[] {
  if (nomineeGender === 'female') {
    return FEMALE_NOMINEE_RELATIONS.filter((r) => !(applicantGender === 'female' && r === 'Wife'));
  }
  if (nomineeGender === 'male') {
    return MALE_NOMINEE_RELATIONS.filter((r) => !(applicantGender === 'male' && r === 'Husband'));
  }
  if (nomineeGender === 'other') {
    return [...OTHER_NOMINEE_RELATIONS];
  }
  return [];
}

export interface NomineeDraft {
  id: string;
  name: string;
  nameBn: string;
  dateOfBirth: string;
  gender: '' | NomineeGender;
  occupation: string;
  relation: string;
  customRelation: string;
  sharePercentage: string;
  nidOrBirthReg: string;
  identityDocType: IdentityDocType;
  identityFrontUrl: string;
  identityBackUrl: string;
  identityFrontUploading: boolean;
  identityBackUploading: boolean;
  mobile: string;
  address: string;
  sameAsApplicantPresent: boolean;
  photoUrl: string;
  photoUploading: boolean;
}

export function createEmptyNomineeDraft(sharePercentage = '100', fixedId?: string): NomineeDraft {
  return {
    id: fixedId || `nom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: '',
    nameBn: '',
    dateOfBirth: '',
    gender: '',
    occupation: '',
    relation: '',
    customRelation: '',
    sharePercentage,
    nidOrBirthReg: '',
    identityDocType: 'nid',
    identityFrontUrl: '',
    identityBackUrl: '',
    identityFrontUploading: false,
    identityBackUploading: false,
    mobile: '',
    address: '',
    sameAsApplicantPresent: false,
    photoUrl: '',
    photoUploading: false,
  };
}

export function nomineeInfoToDraft(
  nominee: NomineeInfo,
  index: number,
  applicantGender: '' | MemberGender,
  applicantPresentAddress: string
): NomineeDraft {
  const allowed = getLogicalRelationOptions(nominee.gender, applicantGender);
  const rawRelation = String(nominee.relation || '').trim();
  const isStandardRelation = Boolean(rawRelation && allowed.includes(rawRelation));
  const addr = String(nominee.address || '').trim();
  const matchesPresent = Boolean(
    addr && applicantPresentAddress.trim() && addr === applicantPresentAddress.trim()
  );

  return {
    id: `nom-saved-${index}-${Math.random().toString(36).slice(2, 6)}`,
    name: nominee.name || '',
    nameBn: nominee.nameBn || '',
    dateOfBirth: nominee.dateOfBirth || '',
    gender: nominee.gender || '',
    occupation: nominee.occupation || '',
    relation: isStandardRelation ? rawRelation : rawRelation ? OTHER_RELATION_VALUE : '',
    customRelation: isStandardRelation ? '' : rawRelation,
    sharePercentage:
      nominee.sharePercentage !== undefined && nominee.sharePercentage !== null
        ? String(nominee.sharePercentage)
        : '100',
    nidOrBirthReg: nominee.nidOrBirthReg || '',
    identityDocType: nominee.identityDocType === 'birth_reg' ? 'birth_reg' : 'nid',
    identityFrontUrl: nominee.identityFrontUrl || '',
    identityBackUrl: nominee.identityBackUrl || '',
    identityFrontUploading: false,
    identityBackUploading: false,
    mobile: nominee.mobile || '',
    address: addr,
    sameAsApplicantPresent: matchesPresent,
    photoUrl: nominee.gender === 'female' ? '' : nominee.photoUrl || '',
    photoUploading: false,
  };
}

const PROFILE_FIELD_LABELS: Record<string, string> = {
  name: 'Full Name (English)',
  nameBn: 'Full Name (Bangla)',
  email: 'Email Address',
  mobile: 'Mobile Number',
  fatherName: "Father's Name (English)",
  fatherNameBn: "Father's Name (Bangla)",
  motherName: "Mother's Name (English)",
  motherNameBn: "Mother's Name (Bangla)",
  gender: 'Gender',
  maritalStatus: 'Marital Status',
  spouseName: 'Spouse Name (English)',
  spouseNameBn: 'Spouse Name (Bangla)',
  dateOfBirth: 'Date of Birth',
  nid: 'National ID (NID)',
  referenceMemberName: 'Reference Member',
  occupation: 'Occupation',
  companyOrganization: 'Company / Organization',
  socialMedia: 'Social Media Profiles',
  presentAddress: 'Present Address',
  permanentAddress: 'Permanent Address',
  nominees: 'Nominees',
  photoUrl: 'Member Photo',
  nidFrontUrl: 'Applicant NID (Front Side)',
  nidBackUrl: 'Applicant NID (Back Side)',
  signatureUrl: 'Signature (300 × 80 px)',
};

export interface FormattedProfileChangeItem {
  key: string;
  label: string;
  value: string;
}

export function formatProfileChangeEntries(
  changes: ProfileChangePayload | undefined | null
): FormattedProfileChangeItem[] {
  if (!changes || typeof changes !== 'object') return [];

  const entries: FormattedProfileChangeItem[] = [];
  const skipPresentDetails = Boolean(changes.presentAddress);
  const skipPermanentDetails = Boolean(changes.permanentAddress);

  for (const [key, raw] of Object.entries(changes)) {
    if (raw === undefined || raw === null) continue;
    if (key === 'presentAddressDetails' && skipPresentDetails) continue;
    if (key === 'permanentAddressDetails' && skipPermanentDetails) continue;

    const label = PROFILE_FIELD_LABELS[key] || key;

    if (key === 'nominees' && Array.isArray(raw)) {
      const list = raw as NomineeInfo[];
      if (list.length === 0) continue;
      const summary = list
        .map((n) => `${n.name} (${n.relation}, ${n.sharePercentage}%)`)
        .join('; ');
      entries.push({
        key,
        label,
        value: `${list.length} nominee(s): ${summary}`,
      });
      continue;
    }

    if (key === 'socialMedia' && typeof raw === 'object') {
      const sm = raw as NonNullable<ProfileChangePayload['socialMedia']>;
      const parts = [
        sm.whatsapp ? `WhatsApp: ${sm.whatsapp}` : '',
        sm.facebook ? `Facebook: ${sm.facebook}` : '',
        sm.linkedin ? `LinkedIn: ${sm.linkedin}` : '',
      ].filter(Boolean);
      entries.push({
        key,
        label,
        value: parts.length > 0 ? parts.join(' · ') : 'Cleared',
      });
      continue;
    }

    if ((key === 'presentAddressDetails' || key === 'permanentAddressDetails') && typeof raw === 'object') {
      const addr = raw as NonNullable<ProfileChangePayload['presentAddressDetails']>;
      const parts = [
        addr.careOf ? `C/O: ${addr.careOf}` : '',
        addr.villageRoadHouse,
        addr.postOffice,
        addr.postCode,
        addr.upazila,
        addr.district,
        addr.division,
      ].filter(Boolean);
      entries.push({
        key,
        label: key === 'presentAddressDetails' ? 'Present Address' : 'Permanent Address',
        value: parts.join(', '),
      });
      continue;
    }

    if (
      key === 'photoUrl' ||
      key === 'signatureUrl' ||
      key === 'nidFrontUrl' ||
      key === 'nidBackUrl'
    ) {
      const str = String(raw).trim();
      if (!str) {
        if (key === 'photoUrl') {
          entries.push({
            key,
            label,
            value: 'Exempt (Female)',
          });
        }
        continue;
      }
      entries.push({
        key,
        label,
        value: 'New image uploaded',
      });
      continue;
    }

    const text = String(raw).trim();
    if (!text) continue;
    entries.push({ key, label, value: text });
  }

  return entries;
}

export interface ProfileDiffEntry {
  key: string;
  label: string;
  previousValue: string;
  updatedValue: string;
  kind: 'text' | 'image' | 'nominees' | 'social' | 'address';
  previousImageUrl?: string;
  updatedImageUrl?: string;
  previousNominees?: NomineeInfo[];
  updatedNominees?: NomineeInfo[];
}

function formatStructuredAddr(addr: StructuredBdAddress | undefined): string {
  if (!addr || typeof addr !== 'object') return '';
  return [
    addr.careOf ? `C/O: ${addr.careOf}` : '',
    addr.villageRoadHouse,
    addr.postOffice
      ? `P.O: ${addr.postOffice}${addr.postCode ? ` (${addr.postCode})` : ''}`
      : '',
    addr.upazila ? `P.S/Upazila: ${addr.upazila}` : '',
    addr.district ? `Dist: ${addr.district}` : '',
    addr.division ? `Div: ${addr.division}` : '',
  ]
    .filter(Boolean)
    .join(', ');
}

function formatScalarDiffValue(key: string, val: unknown): string {
  if (val === undefined || val === null) return '';
  const text = String(val).trim();
  if (!text) return '';
  if (key === 'gender') return normalizeGenderToEnglish(text);
  if (key === 'maritalStatus') return normalizeMaritalStatusToEnglish(text);
  return text;
}

function formatSocialDiff(sm: ProfileChangePayload['socialMedia'] | undefined): string {
  if (!sm || typeof sm !== 'object') return '';
  return [
    sm.whatsapp ? `WhatsApp: ${sm.whatsapp}` : '',
    sm.facebook ? `Facebook: ${sm.facebook}` : '',
    sm.linkedin ? `LinkedIn: ${sm.linkedin}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

export function buildProfileDiffEntries(
  requestedChanges: ProfileChangePayload | undefined | null,
  previousValues?: ProfileChangePayload | undefined | null
): ProfileDiffEntry[] {
  if (!requestedChanges || typeof requestedChanges !== 'object') return [];

  const prev = previousValues || {};
  const entries: ProfileDiffEntry[] = [];
  const skipPresentDetails = Boolean(requestedChanges.presentAddress);
  const skipPermanentDetails = Boolean(requestedChanges.permanentAddress);

  for (const [key, rawNext] of Object.entries(requestedChanges)) {
    if (rawNext === undefined || rawNext === null) continue;
    if (key === 'presentAddressDetails' && skipPresentDetails) continue;
    if (key === 'permanentAddressDetails' && skipPermanentDetails) continue;

    const label =
      key === 'presentAddressDetails'
        ? 'Present Address'
        : key === 'permanentAddressDetails'
          ? 'Permanent Address'
          : PROFILE_FIELD_LABELS[key] || key;

    if (key === 'nominees' && Array.isArray(rawNext)) {
      const nextList = rawNext as NomineeInfo[];
      const prevList = Array.isArray(prev.nominees) ? prev.nominees : [];
      const summarize = (list: NomineeInfo[]) =>
        list.length > 0
          ? list.map((n) => `${n.name} (${n.relation}, ${n.sharePercentage}%)`).join('; ')
          : 'No nominees';
      entries.push({
        key,
        label,
        previousValue: summarize(prevList),
        updatedValue: summarize(nextList),
        kind: 'nominees',
        previousNominees: prevList,
        updatedNominees: nextList,
      });
      continue;
    }

    if (key === 'socialMedia' && typeof rawNext === 'object') {
      const prevStr = formatSocialDiff(prev.socialMedia);
      const nextStr = formatSocialDiff(rawNext as ProfileChangePayload['socialMedia']);
      entries.push({
        key,
        label,
        previousValue: prevStr || 'Not provided',
        updatedValue: nextStr || 'Cleared',
        kind: 'social',
      });
      continue;
    }

    if (key === 'presentAddress' || key === 'permanentAddress') {
      const detailsKey =
        key === 'presentAddress' ? 'presentAddressDetails' : 'permanentAddressDetails';
      const prevText =
        String(prev[key] || '').trim() || formatStructuredAddr(prev[detailsKey]);
      const nextText =
        String(rawNext || '').trim() || formatStructuredAddr(requestedChanges[detailsKey]);
      entries.push({
        key,
        label,
        previousValue: prevText || 'Not provided',
        updatedValue: nextText || 'Cleared',
        kind: 'address',
      });
      continue;
    }

    if (
      (key === 'presentAddressDetails' || key === 'permanentAddressDetails') &&
      typeof rawNext === 'object'
    ) {
      const prevStr = formatStructuredAddr(prev[key]);
      const nextStr = formatStructuredAddr(rawNext as StructuredBdAddress);
      entries.push({
        key,
        label,
        previousValue: prevStr || 'Not provided',
        updatedValue: nextStr || 'Cleared',
        kind: 'address',
      });
      continue;
    }

    if (
      key === 'photoUrl' ||
      key === 'signatureUrl' ||
      key === 'nidFrontUrl' ||
      key === 'nidBackUrl'
    ) {
      const nextImg = String(rawNext || '').trim();
      const prevImg = String(prev[key] || '').trim();
      if (!nextImg) {
        if (key === 'photoUrl') {
          entries.push({
            key,
            label,
            previousValue: prevImg ? 'Previous image' : 'Not provided',
            updatedValue: 'Exempt (Female)',
            kind: 'image',
            previousImageUrl: prevImg || undefined,
          });
        }
        continue;
      }
      entries.push({
        key,
        label,
        previousValue: prevImg ? 'Previous image' : 'Not provided',
        updatedValue: 'New image uploaded',
        kind: 'image',
        previousImageUrl: prevImg || undefined,
        updatedImageUrl: nextImg,
      });
      continue;
    }

    const prevFormatted = formatScalarDiffValue(key, (prev as Record<string, unknown>)[key]);
    const nextFormatted = formatScalarDiffValue(key, rawNext);
    entries.push({
      key,
      label,
      previousValue: prevFormatted || 'Not provided',
      updatedValue: nextFormatted || 'Cleared',
      kind: 'text',
    });
  }

  return entries;
}

