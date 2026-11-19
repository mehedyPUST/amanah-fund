'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { MapPin } from 'lucide-react';
import type { StructuredBdAddress } from '../types/coop.ts';
import {
  BD_DIVISIONS,
  formatBdAddress,
  getDistrictsForDivision,
  getUpazilasForDistrict,
} from '../utils/bdLocations.ts';
import { containsBanglaScript } from '../utils/inputLanguage.ts';

interface TeletalkAddressFieldsProps {
  title: string;
  value: StructuredBdAddress;
  onChange: (next: StructuredBdAddress) => void;
  disabled?: boolean;
  idPrefix: string;
  headerRight?: ReactNode;
}

const OTHER_UPAZILA_VALUE = '__OTHER__';

export function TeletalkAddressFields({
  title,
  value,
  onChange,
  disabled = false,
  idPrefix,
  headerRight,
}: TeletalkAddressFieldsProps) {
  const t = useTranslations('Auth.signUpPage');

  const districts = getDistrictsForDivision(value.division);
  const upazilas = getUpazilasForDistrict(value.division, value.district);
  const isCustomUpazila =
    Boolean(value.district) &&
    Boolean(value.upazila) &&
    !upazilas.includes(value.upazila);

  const selectUpazilaValue = isCustomUpazila ? OTHER_UPAZILA_VALUE : value.upazila;
  const previewText = formatBdAddress(value);

  const careOfHasBn = containsBanglaScript(value.careOf);
  const villageHasBn = containsBanglaScript(value.villageRoadHouse);
  const customUpazilaHasBn = isCustomUpazila && containsBanglaScript(value.upazila);
  const postOfficeHasBn = containsBanglaScript(value.postOffice);

  const baseInputClass =
    'w-full px-3 py-2 text-sm rounded-lg border bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 disabled:opacity-65 disabled:cursor-not-allowed';
  const inputClass = `${baseInputClass} border-slate-200 dark:border-slate-700 focus:ring-emerald-600/30 focus:border-emerald-600`;
  const getTextInputClass = (invalid: boolean) =>
    invalid
      ? `${baseInputClass} border-rose-400 dark:border-rose-700 focus:ring-rose-500/30 focus:border-rose-500`
      : inputClass;

  function updateField<K extends keyof StructuredBdAddress>(
    field: K,
    fieldValue: StructuredBdAddress[K]
  ) {
    if (field === 'division') {
      onChange({
        ...value,
        division: fieldValue,
        district: '',
        upazila: '',
      });
      return;
    }
    if (field === 'district') {
      onChange({
        ...value,
        district: fieldValue,
        upazila: '',
      });
      return;
    }
    onChange({
      ...value,
      [field]: fieldValue,
    });
  }

  return (
    <div className="p-4 sm:p-5 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-950/55 space-y-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/70 dark:border-slate-800 pb-2.5">
        <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100">
          <MapPin className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
          <span>{title}</span>
          <span className="text-red-500">*</span>
        </div>
        {headerRight}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        <div className="sm:col-span-2">
          <label
            htmlFor={`${idPrefix}-care-of`}
            className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
          >
            {t('careOf')} <span className="text-red-500">*</span>
          </label>
          <input
            id={`${idPrefix}-care-of`}
            type="text"
            required
            disabled={disabled}
            value={value.careOf}
            onChange={(e) => updateField('careOf', e.target.value)}
            placeholder={t('careOfPh')}
            className={getTextInputClass(careOfHasBn)}
          />
          {careOfHasBn && (
            <p className="mt-1 text-[11px] font-medium text-rose-600 dark:text-rose-400">
              {t('errEnglishOnlyHint')}
            </p>
          )}
        </div>

        <div className="sm:col-span-2">
          <label
            htmlFor={`${idPrefix}-village`}
            className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
          >
            {t('villageRoadHouse')} <span className="text-red-500">*</span>
          </label>
          <input
            id={`${idPrefix}-village`}
            type="text"
            required
            disabled={disabled}
            value={value.villageRoadHouse}
            onChange={(e) => updateField('villageRoadHouse', e.target.value)}
            placeholder={t('villageRoadHousePh')}
            className={getTextInputClass(villageHasBn)}
          />
          {villageHasBn && (
            <p className="mt-1 text-[11px] font-medium text-rose-600 dark:text-rose-400">
              {t('errEnglishOnlyHint')}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor={`${idPrefix}-division`}
            className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
          >
            {t('division')} <span className="text-red-500">*</span>
          </label>
          <select
            id={`${idPrefix}-division`}
            required
            disabled={disabled}
            value={value.division}
            onChange={(e) => updateField('division', e.target.value)}
            className={inputClass}
          >
            <option value="">{t('selectDivision')}</option>
            {BD_DIVISIONS.map((div) => (
              <option key={div.name} value={div.name}>
                {div.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor={`${idPrefix}-district`}
            className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
          >
            {t('district')} <span className="text-red-500">*</span>
          </label>
          <select
            id={`${idPrefix}-district`}
            required
            disabled={disabled || !value.division}
            value={value.district}
            onChange={(e) => updateField('district', e.target.value)}
            className={inputClass}
          >
            <option value="">{t('selectDistrict')}</option>
            {districts.map((dist) => (
              <option key={dist.name} value={dist.name}>
                {dist.name}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <label
            htmlFor={`${idPrefix}-upazila`}
            className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
          >
            {t('upazila')} <span className="text-red-500">*</span>
          </label>
          <select
            id={`${idPrefix}-upazila`}
            required={!isCustomUpazila}
            disabled={disabled || !value.district}
            value={selectUpazilaValue}
            onChange={(e) => {
              const selected = e.target.value;
              if (selected === OTHER_UPAZILA_VALUE) {
                updateField('upazila', ' ');
              } else {
                updateField('upazila', selected);
              }
            }}
            className={inputClass}
          >
            <option value="">{t('selectUpazila')}</option>
            {upazilas.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
            {value.district && (
              <option value={OTHER_UPAZILA_VALUE}>{t('otherUpazilaOption')}</option>
            )}
          </select>

          {isCustomUpazila && (
            <>
              <input
                id={`${idPrefix}-upazila-custom`}
                type="text"
                required
                disabled={disabled}
                value={value.upazila.trimStart()}
                onChange={(e) => updateField('upazila', e.target.value || ' ')}
                placeholder={t('customUpazilaPh')}
                className={`${getTextInputClass(customUpazilaHasBn)} mt-2`}
              />
              {customUpazilaHasBn && (
                <p className="mt-1 text-[11px] font-medium text-rose-600 dark:text-rose-400">
                  {t('errEnglishOnlyHint')}
                </p>
              )}
            </>
          )}
        </div>

        <div>
          <label
            htmlFor={`${idPrefix}-post-office`}
            className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
          >
            {t('postOffice')} <span className="text-red-500">*</span>
          </label>
          <input
            id={`${idPrefix}-post-office`}
            type="text"
            required
            disabled={disabled}
            value={value.postOffice}
            onChange={(e) => updateField('postOffice', e.target.value)}
            placeholder={t('postOfficePh')}
            className={getTextInputClass(postOfficeHasBn)}
          />
          {postOfficeHasBn && (
            <p className="mt-1 text-[11px] font-medium text-rose-600 dark:text-rose-400">
              {t('errEnglishOnlyHint')}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor={`${idPrefix}-post-code`}
            className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
          >
            {t('postCode')} <span className="text-red-500">*</span>
          </label>
          <input
            id={`${idPrefix}-post-code`}
            type="text"
            inputMode="numeric"
            pattern="\d{4}"
            maxLength={4}
            required
            disabled={disabled}
            value={value.postCode}
            onChange={(e) => updateField('postCode', e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder={t('postCodePh')}
            className={`${inputClass} font-mono tabular-nums`}
          />
        </div>
      </div>

      {previewText && (
        <div className="pt-2 border-t border-slate-200/70 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
          <span className="font-semibold text-slate-700 dark:text-slate-300 mr-1">
            {t('addressPreview')}
          </span>
          <span>{previewText}</span>
        </div>
      )}
    </div>
  );
}
