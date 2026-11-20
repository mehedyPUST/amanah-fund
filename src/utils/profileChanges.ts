import type {
  MemberGender,
  NomineeGender,
  NomineeInfo,
  ProfileChangePayload,
} from '../types/coop.ts';

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

    if (key === 'photoUrl' || key === 'signatureUrl') {
      const str = String(raw).trim();
      if (!str) continue;
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
