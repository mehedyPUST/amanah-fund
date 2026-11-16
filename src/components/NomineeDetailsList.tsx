'use client';

import { useState } from 'react';
import { ExternalLink, Users } from 'lucide-react';
import type { NomineeInfo } from '../types/coop.ts';

interface NomineeDetailsListProps {
  nominees?: NomineeInfo[];
  compact?: boolean;
}

function formatGenderLabel(gender: NomineeInfo['gender']): string {
  if (gender === 'male') return 'Male';
  if (gender === 'female') return 'Female';
  return 'Other';
}

export function NomineeDetailsList({ nominees, compact = false }: NomineeDetailsListProps) {
  const [brokenPhotos, setBrokenPhotos] = useState<Record<number, boolean>>({});

  if (!nominees || nominees.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
          <Users className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
          <span>Nominee Information ({nominees.length})</span>
        </div>
        <span className="text-[11px] font-mono text-indigo-700 dark:text-indigo-400">
          Total Share: {nominees.reduce((sum, n) => sum + Number(n.sharePercentage || 0), 0)}%
        </span>
      </div>

      <div className="space-y-2.5">
        {nominees.map((nominee, idx) => {
          const hasPhoto = Boolean(nominee.photoUrl) && !brokenPhotos[idx];
          return (
            <div
              key={`${nominee.name}-${idx}`}
              className="rounded-lg border border-indigo-200/70 dark:border-indigo-900/50 bg-indigo-50/30 dark:bg-indigo-950/15 p-3.5 space-y-3 text-xs"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/70 dark:border-slate-800 pb-2">
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {nominees.length > 1 ? `Nominee #${idx + 1}: ` : ''}
                    {nominee.name}
                  </span>
                  <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
                    ·
                  </span>
                  <span className="text-slate-600 dark:text-slate-300">{nominee.relation}</span>
                  <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
                    ·
                  </span>
                  <span className="text-slate-600 dark:text-slate-300">
                    {formatGenderLabel(nominee.gender)}
                  </span>
                </div>

                <span className="font-mono font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                  {nominee.sharePercentage}% Share
                </span>
              </div>

              <div className={`grid grid-cols-1 ${compact ? 'sm:grid-cols-2' : 'sm:grid-cols-3'} gap-3`}>
                <div>
                  <div className="text-slate-500 dark:text-slate-400">Date of Birth</div>
                  <div className="mt-0.5 font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                    {nominee.dateOfBirth}
                  </div>
                </div>

                <div>
                  <div className="text-slate-500 dark:text-slate-400">Occupation</div>
                  <div className="mt-0.5 font-semibold text-slate-900 dark:text-white">
                    {nominee.occupation}
                  </div>
                </div>

                <div>
                  <div className="text-slate-500 dark:text-slate-400">NID / Birth Reg No.</div>
                  <div className="mt-0.5 font-mono font-semibold tabular-nums text-slate-900 dark:text-white break-all">
                    {nominee.nidOrBirthReg}
                  </div>
                </div>

                <div>
                  <div className="text-slate-500 dark:text-slate-400">Mobile Number</div>
                  <div className="mt-0.5 font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                    {nominee.mobile || 'Not provided'}
                  </div>
                </div>

                <div className={compact ? 'sm:col-span-2' : 'sm:col-span-2'}>
                  <div className="text-slate-500 dark:text-slate-400">Address</div>
                  <div className="mt-0.5 text-slate-900 dark:text-slate-100 leading-relaxed">
                    {nominee.address}
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-200/70 dark:border-slate-800 flex items-center justify-between gap-3">
                <span className="text-slate-500 dark:text-slate-400">Nominee Photo</span>
                {hasPhoto ? (
                  <a
                    href={nominee.photoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 text-emerald-700 dark:text-emerald-400 hover:underline font-medium"
                  >
                    <img
                      src={nominee.photoUrl}
                      alt={`${nominee.name} portrait`}
                      referrerPolicy="no-referrer"
                      onError={() => setBrokenPhotos((prev) => ({ ...prev, [idx]: true }))}
                      className="w-8 h-8 rounded object-cover border border-slate-200 dark:border-slate-700 bg-white"
                    />
                    <span>Open Nominee Photo</span>
                    <ExternalLink className="w-3 h-3" aria-hidden="true" />
                  </a>
                ) : nominee.gender === 'female' ? (
                  <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    Not required (Female nominee)
                  </span>
                ) : (
                  <span className="text-[11px] text-slate-400">Not provided</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
