import { useState, type FormEvent } from 'react';
import { CheckCircle2, Lock, Shield, UserCheck } from 'lucide-react';
import { motion } from 'motion/react';
import type { PublicUser } from '../types/coop.ts';
import { api } from '../utils/api.ts';

interface AuthScreenProps {
  onAuthenticated: (user: PublicUser) => void;
}

const DEMO_ACCOUNTS = [
  {
    email: 'admin@amanahcoop.org',
    name: 'Tariq Al-Mansoor',
    role: 'Administrator',
    detail: 'Approve signups, loan cap, Google Sheets sync & audit trail',
  },
  {
    email: 'manager@amanahcoop.org',
    name: 'Nadia Rahman',
    role: 'Treasury Manager',
    detail: 'Review Bank/MFS deposits, disburse loans & send reminders',
  },
  {
    email: 'imran@amanahcoop.org',
    name: 'Imran Hossain',
    role: 'Member · Active Loan',
    detail: 'Has active Qard Hasan loan & repayment schedule',
  },
  {
    email: 'ayesha@amanahcoop.org',
    name: 'Ayesha Siddiqua',
    role: 'Member · Eligible',
    detail: '0 of 3 loans used · Can submit new Qard Hasan',
  },
  {
    email: 'fatima@amanahcoop.org',
    name: 'Fatima Zahra',
    role: 'Member · Pending Vote',
    detail: 'Loan request at 3/4 approvals (needs 1 more vote)',
  },
  {
    email: 'bilal@amanahcoop.org',
    name: 'Bilal Ahmed',
    role: 'Pending Approval (Blocked)',
    detail: 'Verify that unapproved signups cannot sign in until Admin approves',
  },
];

export function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('admin@amanahcoop.org');
  const [password, setPassword] = useState('Amanah@2026');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingSuccessMessage, setPendingSuccessMessage] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPendingSuccessMessage(null);
    setLoading(true);
    try {
      if (mode === 'login') {
        const res = await api.login(email, password);
        onAuthenticated(res.user);
      } else {
        const res = await api.register({ name, email, password, phone });
        if (res.pendingApproval) {
          setPendingSuccessMessage(
            res.message ||
              'Membership application submitted. An administrator must approve your account before you can sign in.'
          );
          setName('');
          setPhone('');
          setMode('login');
        } else {
          onAuthenticated(res.user);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  }

  async function handleDemoSwitch(demoEmail: string) {
    setError(null);
    setPendingSuccessMessage(null);
    setLoading(true);
    try {
      const res = await api.demoLogin(demoEmail);
      onAuthenticated(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Demo sign-in failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="max-w-6xl w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch"
      >
        <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 sm:p-8 flex flex-col justify-between shadow-2xs">
          <div className="space-y-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                <Shield className="w-4 h-4" aria-hidden="true" />
                <span>Encrypted Member Portal · HttpOnly JWT</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
                {mode === 'login' ? 'Sign In to Members Dashboard' : 'Apply for Membership'}
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                {mode === 'login'
                  ? 'Only administrator-approved members can authenticate and access the cooperative treasury.'
                  : 'New registrations require administrator review and approval before sign-in is enabled.'}
              </p>
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg w-fit">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                }}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  mode === 'login'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Approved Member Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setError(null);
                  setPendingSuccessMessage(null);
                }}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  mode === 'register'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Apply for Membership
              </button>
            </div>

            {pendingSuccessMessage && (
              <div
                role="status"
                className="p-3.5 rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 text-xs text-emerald-800 dark:text-emerald-300 flex items-start gap-2.5"
              >
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{pendingSuccessMessage}</span>
              </div>
            )}

            {error && (
              <div
                role="alert"
                className="p-3.5 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 text-xs text-rose-700 dark:text-rose-300"
              >
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'register' && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Full Legal Name
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Yusuf Rahman"
                    className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Cooperative Email
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Password
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                />
              </div>

              {mode === 'register' && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    MFS / Contact Number (Encrypted)
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="017XX-XXXXXX"
                    className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <Lock className="w-4 h-4" aria-hidden="true" />
                <span>
                  {loading
                    ? 'Processing…'
                    : mode === 'login'
                      ? 'Sign In to Dashboard'
                      : 'Submit Application for Admin Approval'}
                </span>
              </button>
            </form>
          </div>

          <p className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
            Session issued via signed JWT in an HttpOnly cookie · Unapproved registrations are
            automatically notified to cooperative administrators.
          </p>
        </div>

        <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 sm:p-8 flex flex-col justify-between shadow-2xs">
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Instant Role Access (Seeded Cooperative Profiles)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Select any approved role below to establish an HttpOnly JWT session, or test signing
                in as Bilal Ahmed to verify admin approval gating.
              </p>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
              {DEMO_ACCOUNTS.map((acc) => (
                <button
                  key={acc.email}
                  type="button"
                  disabled={loading}
                  onClick={() => void handleDemoSwitch(acc.email)}
                  className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors flex items-center justify-between gap-4 cursor-pointer disabled:opacity-50"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-900 dark:text-white">
                      <span className="truncate">{acc.name}</span>
                      <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
                        ·
                      </span>
                      <span
                        className={`text-xs font-medium whitespace-nowrap ${
                          acc.email === 'bilal@amanahcoop.org'
                            ? 'text-amber-700 dark:text-amber-400'
                            : 'text-emerald-700 dark:text-emerald-400'
                        }`}
                      >
                        {acc.role}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                      {acc.detail}
                    </p>
                  </div>
                  <UserCheck className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 space-y-1">
            <div>
              Default password for manual login:{' '}
              <span className="font-mono text-slate-700 dark:text-slate-300">Amanah@2026</span>
            </div>
            <div>
              2/3 Quorum Rule: Active cooperative members require at least two-thirds affirmative
              votes for Qard Hasan or Halal investment approvals.
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
