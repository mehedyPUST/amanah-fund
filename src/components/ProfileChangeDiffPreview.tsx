'use client';

import { ArrowRight, FileCheck2 } from 'lucide-react';
import type { ProfileChangeRequest } from '../types/coop.ts';
import { formatDateTime } from '../utils/format.ts';
import { normalizeGenderToEnglish, normalizeRelationToEnglish } from '../utils/inputLanguage.ts';
import { buildProfileDiffEntries } from '../utils/profileChanges.ts';

export interface ProfileChangeDiffPreviewProps {
  request: ProfileChangeRequest;
}

export function ProfileChangeDiffPreview({ request }: ProfileChangeDiffPreviewProps) {
  const entries = buildProfileDiffEntries(request.requestedChanges, request.previousValues);

  return (
    <div className="space-y-3 text-left">
      {/* Header summary bar */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/70 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="space-y-0.5 min-w-0">
          <div className="font-semibold text-slate-900 dark:text-white truncate">
            {request.memberName} ({request.memberCode})
          </div>
          <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
            Requested {formatDateTime(request.requestedAt)}
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-100/90 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/70 text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 shrink-0">
          <FileCheck2 className="w-3.5 h-3.5" aria-hidden="true" />
          <span>
            {entries.length} {entries.length === 1 ? 'field' : 'fields'} changed
          </span>
        </span>
      </div>

      {/* Column Legend (Desktop) */}
      <div className="hidden sm:grid sm:grid-cols-12 gap-2 px-2 text-[10.5px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        <div className="sm:col-span-5">Previous Saved Info</div>
        <div className="sm:col-span-2 text-center" aria-hidden="true" />
        <div className="sm:col-span-5 text-emerald-700 dark:text-emerald-400">
          Updated Info
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 text-center">
          No modified fields recorded for this request.
        </div>
      ) : (
        <div className="space-y-2.5">
          {entries.map((item) => (
            <div
              key={item.key}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 overflow-hidden shadow-2xs"
            >
              <div className="px-3.5 py-1.5 bg-slate-50/90 dark:bg-slate-950/80 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-slate-800 dark:text-slate-200">
                  {item.label}
                </span>
                <span className="text-[10px] font-mono uppercase tracking-wider text-amber-700 dark:text-amber-400">
                  Modified
                </span>
              </div>

              {item.kind === 'image' ? (
                <div className="p-3 grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                  <div className="sm:col-span-5 rounded-lg border border-rose-200/80 dark:border-rose-900/50 bg-rose-50/40 dark:bg-rose-950/20 p-2.5 space-y-1.5">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400">
                      Previous
                    </div>
                    {item.previousImageUrl ? (
                      <div className="flex items-center justify-center rounded border border-slate-200 dark:border-slate-700 bg-white p-1.5">
                        <img
                          src={item.previousImageUrl}
                          alt={`Previous ${item.label}`}
                          referrerPolicy="no-referrer"
                          className={
                            item.key === 'signatureUrl'
                              ? 'max-w-[180px] aspect-[15/4] object-contain'
                              : 'w-20 h-20 rounded object-cover'
                          }
                        />
                      </div>
                    ) : (
                      <div className="text-xs italic text-slate-500 dark:text-slate-400">
                        Not provided
                      </div>
                    )}
                  </div>

                  <div className="sm:col-span-2 flex justify-center">
                    <ArrowRight
                      className="w-4 h-4 text-slate-400 dark:text-slate-500 rotate-90 sm:rotate-0"
                      aria-hidden="true"
                    />
                  </div>

                  <div className="sm:col-span-5 rounded-lg border border-emerald-200/90 dark:border-emerald-900/60 bg-emerald-50/55 dark:bg-emerald-950/25 p-2.5 space-y-1.5">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                      Updated
                    </div>
                    {item.updatedImageUrl ? (
                      <div className="flex items-center justify-center rounded border border-emerald-200 dark:border-emerald-800 bg-white p-1.5">
                        <img
                          src={item.updatedImageUrl}
                          alt={`Updated ${item.label}`}
                          referrerPolicy="no-referrer"
                          className={
                            item.key === 'signatureUrl'
                              ? 'max-w-[180px] aspect-[15/4] object-contain'
                              : 'w-20 h-20 rounded object-cover'
                          }
                        />
                      </div>
                    ) : (
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {item.updatedValue}
                      </div>
                    )}
                  </div>
                </div>
              ) : item.kind === 'nominees' ? (
                <div className="p-3 grid grid-cols-1 sm:grid-cols-12 gap-3 items-start">
                  <div className="sm:col-span-5 rounded-lg border border-rose-200/80 dark:border-rose-900/50 bg-rose-50/40 dark:bg-rose-950/20 p-2.5 space-y-2">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400">
                      Previous ({item.previousNominees?.length || 0})
                    </div>
                    {!item.previousNominees || item.previousNominees.length === 0 ? (
                      <div className="text-xs italic text-slate-500 dark:text-slate-400">
                        No nominees saved
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {item.previousNominees.map((nom, idx) => (
                          <div
                            key={`prev-nom-${idx}`}
                            className="rounded border border-slate-200/80 dark:border-slate-800 bg-white/90 dark:bg-slate-900/70 p-2 text-[11px] space-y-0.5"
                          >
                            <div className="font-semibold text-slate-800 dark:text-slate-200">
                              {nom.name}
                              {nom.nameBn ? ` (${nom.nameBn})` : ''} · {nom.sharePercentage}%
                            </div>
                            <div className="text-slate-600 dark:text-slate-400">
                              {normalizeRelationToEnglish(nom.relation)} ·{' '}
                              {normalizeGenderToEnglish(nom.gender)} · DOB: {nom.dateOfBirth}
                            </div>
                            <div className="font-mono text-[10.5px] text-slate-500 dark:text-slate-400">
                              NID/BR: {nom.nidOrBirthReg}
                              {nom.mobile ? ` · ${nom.mobile}` : ''}
                            </div>
                            <div className="text-slate-600 dark:text-slate-400 break-words">
                              {nom.address}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="sm:col-span-2 flex justify-center sm:pt-6">
                    <ArrowRight
                      className="w-4 h-4 text-slate-400 dark:text-slate-500 rotate-90 sm:rotate-0"
                      aria-hidden="true"
                    />
                  </div>

                  <div className="sm:col-span-5 rounded-lg border border-emerald-200/90 dark:border-emerald-900/60 bg-emerald-50/55 dark:bg-emerald-950/25 p-2.5 space-y-2">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                      Updated ({item.updatedNominees?.length || 0})
                    </div>
                    {!item.updatedNominees || item.updatedNominees.length === 0 ? (
                      <div className="text-xs italic text-slate-500 dark:text-slate-400">
                        Cleared
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {item.updatedNominees.map((nom, idx) => (
                          <div
                            key={`next-nom-${idx}`}
                            className="rounded border border-emerald-200/80 dark:border-emerald-800/70 bg-white dark:bg-slate-900/90 p-2 text-[11px] space-y-0.5"
                          >
                            <div className="font-semibold text-slate-900 dark:text-white">
                              {nom.name}
                              {nom.nameBn ? ` (${nom.nameBn})` : ''} · {nom.sharePercentage}%
                            </div>
                            <div className="text-slate-700 dark:text-slate-300">
                              {normalizeRelationToEnglish(nom.relation)} ·{' '}
                              {normalizeGenderToEnglish(nom.gender)} · DOB: {nom.dateOfBirth}
                            </div>
                            <div className="font-mono text-[10.5px] text-slate-600 dark:text-slate-300">
                              NID/BR: {nom.nidOrBirthReg}
                              {nom.mobile ? ` · ${nom.mobile}` : ''}
                            </div>
                            <div className="text-slate-700 dark:text-slate-300 break-words">
                              {nom.address}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-3 grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
                  <div className="sm:col-span-5 rounded-lg border border-rose-200/80 dark:border-rose-900/50 bg-rose-50/40 dark:bg-rose-950/20 px-3 py-2 space-y-0.5">
                    <div className="sm:hidden text-[10px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400">
                      Previous
                    </div>
                    <div className="text-xs text-slate-700 dark:text-slate-300 break-words">
                      {item.previousValue}
                    </div>
                  </div>

                  <div className="sm:col-span-2 flex justify-center">
                    <ArrowRight
                      className="w-4 h-4 text-slate-400 dark:text-slate-500 rotate-90 sm:rotate-0"
                      aria-hidden="true"
                    />
                  </div>

                  <div className="sm:col-span-5 rounded-lg border border-emerald-200/90 dark:border-emerald-900/60 bg-emerald-50/55 dark:bg-emerald-950/25 px-3 py-2 space-y-0.5">
                    <div className="sm:hidden text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                      Updated
                    </div>
                    <div className="text-xs font-semibold text-slate-900 dark:text-white break-words">
                      {item.updatedValue}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
