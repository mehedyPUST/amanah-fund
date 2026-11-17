import type { Metadata } from 'next';
import Link from 'next/link';
import { FAQSection } from '../../components/FAQSection.tsx';
import { HowItWorks } from '../../components/HowItWorks.tsx';
import { PublicShell } from '../../components/PublicShell.tsx';
import { Rules } from '../../components/Rules.tsx';

export const metadata: Metadata = {
  title: 'Cooperative Rules & Shariah Charter — Amanah',
};

export default function RulesPage() {
  return (
    <PublicShell>
      <div className="space-y-6 sm:space-y-10">
        <div className="lg:hidden space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <a
              href="#rules-charter"
              className="min-h-[44px] px-2 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/85 dark:bg-slate-900/80 text-xs font-medium text-slate-700 dark:text-slate-200 flex items-center justify-center text-center"
            >
              Charter
            </a>
            <a
              href="#rules-faq"
              className="min-h-[44px] px-2 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/85 dark:bg-slate-900/80 text-xs font-medium text-slate-700 dark:text-slate-200 flex items-center justify-center text-center"
            >
              FAQ
            </a>
            <a
              href="#rules-how-it-works"
              className="min-h-[44px] px-2 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/85 dark:bg-slate-900/80 text-xs font-medium text-slate-700 dark:text-slate-200 flex items-center justify-center text-center"
            >
              How It Works
            </a>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Link
              href="/login"
              className="min-h-[44px] px-3 py-2 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/80 dark:bg-emerald-950/40 text-xs font-semibold text-emerald-800 dark:text-emerald-300 flex items-center justify-center text-center"
            >
              Sign In
            </Link>
            <Link
              href="/signup"
              className="min-h-[44px] px-3 py-2 rounded-xl bg-emerald-700 text-white text-xs font-semibold flex items-center justify-center text-center"
            >
              Apply to Join
            </Link>
          </div>
        </div>

        <div id="rules-charter" className="scroll-mt-4">
          <Rules />
        </div>

        <div id="rules-faq" className="scroll-mt-4">
          <FAQSection embedded />
        </div>

        <div id="rules-how-it-works" className="scroll-mt-4">
          <HowItWorks embedded />
        </div>
      </div>
    </PublicShell>
  );
}
