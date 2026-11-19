const BANGLA_SCRIPT_RE = /[\u0980-\u09FF]/;
const LATIN_LETTER_RE = /[A-Za-z]/;

/**
 * Returns true if the input contains any Bengali Unicode characters
 * (letters, vowel signs, or Bengali digits ০-৯).
 */
export function containsBanglaScript(value: string): boolean {
  return BANGLA_SCRIPT_RE.test(value);
}

/**
 * Returns true if the input contains any English/Latin letters (A-Z, a-z).
 */
export function containsLatinLetters(value: string): boolean {
  return LATIN_LETTER_RE.test(value);
}

/**
 * English-only field check: rejects any Bengali script characters.
 */
export function isEnglishOnlyText(value: string): boolean {
  return !containsBanglaScript(value);
}

/**
 * Bangla-name field check: empty is allowed (optional), otherwise rejects Latin A-Z letters.
 */
export function isValidBanglaName(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  return !containsLatinLetters(trimmed);
}

const BANGLA_TO_ENGLISH_RELATION: Record<string, string> = {
  'স্ত্রী': 'Wife',
  'স্বামী': 'Husband',
  'মাতা': 'Mother',
  'মা': 'Mother',
  'পিতা': 'Father',
  'বাবা': 'Father',
  'কন্যা': 'Daughter',
  'মেয়ে': 'Daughter',
  'পুত্র': 'Son',
  'ছেলে': 'Son',
  'বোন': 'Sister',
  'ভাই': 'Brother',
  'দাদী / নানী': 'Grandmother',
  'দাদী': 'Grandmother',
  'নানী': 'Grandmother',
  'দাদা / নানা': 'Grandfather',
  'দাদা': 'Grandfather',
  'নানা': 'Grandfather',
  'নাতনি': 'Granddaughter',
  'নাতি': 'Grandson',
  'খালা / ফুফু / চাচী / মামী': 'Aunt',
  'খালা': 'Aunt',
  'ফুফু': 'Aunt',
  'চাচী': 'Aunt',
  'মামী': 'Aunt',
  'চাচা / মামা / খালু / ফুপা': 'Uncle',
  'চাচা': 'Uncle',
  'মামা': 'Uncle',
  'খালু': 'Uncle',
  'ফুপা': 'Uncle',
  'ভাতিজি / ভাগ্নি': 'Niece',
  'ভাতিজি': 'Niece',
  'ভাগ্নি': 'Niece',
  'ভাতিজা / ভাগ্নে': 'Nephew',
  'ভাতিজা': 'Nephew',
  'ভাগ্নে': 'Nephew',
  'শাশুড়ি': 'Mother-in-Law',
  'শ্বশুর': 'Father-in-Law',
  'ভাবি / শ্যালিকা / ননদ': 'Sister-in-Law',
  'ভাবি': 'Sister-in-Law',
  'শ্যালিকা': 'Sister-in-Law',
  'ননদ': 'Sister-in-Law',
  'দুলাভাই / শ্যালক / দেবর': 'Brother-in-Law',
  'দুলাভাই': 'Brother-in-Law',
  'শ্যালক': 'Brother-in-Law',
  'দেবর': 'Brother-in-Law',
  'পুত্রবধূ': 'Daughter-in-Law',
  'জামাতা': 'Son-in-Law',
  'স্বামী / স্ত্রী': 'Spouse',
  'পিতা / মাতা': 'Parent',
  'সন্তান': 'Child',
  'ভাই / বোন': 'Sibling',
  'আত্মীয়': 'Relative',
  'অভিভাবক': 'Guardian',
};

/**
 * Ensures any relation value (even if ever stored in Bangla) resolves to its
 * canonical English label for storage and PDF export.
 */
export function normalizeRelationToEnglish(value: string): string {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  return BANGLA_TO_ENGLISH_RELATION[trimmed] || trimmed;
}

const BANGLA_TO_ENGLISH_GENDER: Record<string, string> = {
  male: 'Male',
  female: 'Female',
  other: 'Other',
  'পুরুষ': 'Male',
  'মহিলা': 'Female',
  'অন্যান্য': 'Other',
};

export function normalizeGenderToEnglish(value?: string): string {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '—';
  return BANGLA_TO_ENGLISH_GENDER[trimmed.toLowerCase()] || BANGLA_TO_ENGLISH_GENDER[trimmed] || trimmed;
}

const BANGLA_TO_ENGLISH_MARITAL: Record<string, string> = {
  single: 'Single',
  married: 'Married',
  widowed: 'Widowed',
  divorced: 'Divorced',
  'অবিবাহিত': 'Single',
  'বিবাহিত': 'Married',
  'বিধবা / বিপত্নীক': 'Widowed',
  'তালাকপ্রাপ্ত': 'Divorced',
};

export function normalizeMaritalStatusToEnglish(value?: string): string {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '—';
  return BANGLA_TO_ENGLISH_MARITAL[trimmed.toLowerCase()] || BANGLA_TO_ENGLISH_MARITAL[trimmed] || trimmed;
}
