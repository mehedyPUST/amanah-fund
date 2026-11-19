import { describe, expect, it } from 'vitest';
import { validateAndNormalizeNominees } from '../src/server/coopService.ts';
import {
  containsBanglaScript,
  containsLatinLetters,
  isEnglishOnlyText,
  isValidBanglaName,
  normalizeGenderToEnglish,
  normalizeMaritalStatusToEnglish,
  normalizeRelationToEnglish,
} from '../src/utils/inputLanguage.ts';

describe('inputLanguage & bilingual nominee validation', () => {
  it('detects Bengali script vs English-only text accurately', () => {
    expect(containsBanglaScript('Md. Abdur Rahman')).toBe(false);
    expect(containsBanglaScript('01711-223344')).toBe(false);
    expect(containsBanglaScript('মোঃ আব্দুর রহমান')).toBe(true);
    expect(containsBanglaScript('০১৭১১২২৩৩৪৪')).toBe(true);
    expect(isEnglishOnlyText('House 14, Road 5, Dhanmondi')).toBe(true);
    expect(isEnglishOnlyText('বাড়ি ১৪, ধানমন্ডি')).toBe(false);
  });

  it('validates Bangla-name fields properly', () => {
    expect(containsLatinLetters('মোছাঃ আয়েশা সিদ্দিকা')).toBe(false);
    expect(containsLatinLetters('Ayesha')).toBe(true);
    expect(isValidBanglaName('')).toBe(true);
    expect(isValidBanglaName('মোঃ আব্দুল করিম')).toBe(true);
    expect(isValidBanglaName('Md. Abdul Karim')).toBe(false);
  });

  it('normalizes Bangla dropdown labels back to canonical English for PDFs', () => {
    expect(normalizeGenderToEnglish('male')).toBe('Male');
    expect(normalizeGenderToEnglish('পুরুষ')).toBe('Male');
    expect(normalizeGenderToEnglish('মহিলা')).toBe('Female');
    expect(normalizeMaritalStatusToEnglish('বিবাহিত')).toBe('Married');
    expect(normalizeMaritalStatusToEnglish('অবিবাহিত')).toBe('Single');
    expect(normalizeRelationToEnglish('স্ত্রী')).toBe('Wife');
    expect(normalizeRelationToEnglish('মাতা')).toBe('Mother');
    expect(normalizeRelationToEnglish('পুত্র')).toBe('Son');
    expect(normalizeRelationToEnglish('Wife')).toBe('Wife');
  });

  it('validates nominee English-only fields and accepts optional Bangla name', () => {
    const valid = validateAndNormalizeNominees([
      {
        name: 'Mst. Ayesha Siddika',
        nameBn: 'মোছাঃ আয়েশা সিদ্দিকা',
        dateOfBirth: '1996-05-10',
        gender: 'female',
        occupation: 'Teacher',
        relation: 'স্ত্রী',
        sharePercentage: 100,
        nidOrBirthReg: '19961234567890',
        mobile: '01711000000',
        address: 'House 14, Road 5, Dhanmondi, Dhaka',
      },
    ]);
    expect(valid.ok).toBe(true);
    if (valid.ok) {
      expect(valid.nominees[0].name).toBe('Mst. Ayesha Siddika');
      expect(valid.nominees[0].nameBn).toBe('মোছাঃ আয়েশা সিদ্দিকা');
      expect(valid.nominees[0].relation).toBe('Wife');
    }

    const banglaOccupation = validateAndNormalizeNominees([
      {
        name: 'Mst. Ayesha Siddika',
        dateOfBirth: '1996-05-10',
        gender: 'female',
        occupation: 'শিক্ষক',
        relation: 'Wife',
        sharePercentage: 100,
        nidOrBirthReg: '19961234567890',
        address: 'House 14, Road 5, Dhanmondi, Dhaka',
      },
    ]);
    expect(banglaOccupation.ok).toBe(false);

    const englishInBanglaName = validateAndNormalizeNominees([
      {
        name: 'Mst. Ayesha Siddika',
        nameBn: 'Ayesha',
        dateOfBirth: '1996-05-10',
        gender: 'female',
        occupation: 'Teacher',
        relation: 'Wife',
        sharePercentage: 100,
        nidOrBirthReg: '19961234567890',
        address: 'House 14, Road 5, Dhanmondi, Dhaka',
      },
    ]);
    expect(englishInBanglaName.ok).toBe(false);
  });
});
