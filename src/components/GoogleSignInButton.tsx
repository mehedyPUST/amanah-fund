import type { WorkspaceSessionInfo } from '../utils/googleWorkspace.ts';

interface GoogleSignInButtonProps {
  workspace: WorkspaceSessionInfo;
  connecting: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}

export function GoogleSignInButton({
  workspace,
  connecting,
  onConnect,
  onDisconnect,
}: GoogleSignInButtonProps) {
  if (workspace.connected) {
    return (
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="text-xs text-slate-600 dark:text-slate-300">
          Google Workspace: <strong className="font-medium text-slate-900 dark:text-white">{workspace.email}</strong>
        </span>
        <button
          type="button"
          onClick={onDisconnect}
          className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        >
          Disconnect Google
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onConnect}
      disabled={connecting}
      className="inline-flex items-center gap-2.5 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-100 shadow-2xs transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap"
    >
      <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="#4285F4"
          d="M23.745 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-8.97z"
        />
        <path
          fill="#34A853"
          d="M12 24c3.3 0 6.08-1.09 8.1-2.96l-3.88-3.05c-1.1.74-2.51 1.18-4.22 1.18-3.25 0-6-2.19-6.98-5.14H1.01v3.14C3.05 21.22 7.21 24 12 24z"
        />
        <path
          fill="#FBBC05"
          d="M5.02 14.03c-.25-.74-.39-1.53-.39-2.35s.14-1.61.39-2.35V6.19H1.01C.37 7.47 0 8.91 0 10.68s.37 3.21 1.01 4.49l4.01-1.14z"
        />
        <path
          fill="#EA4335"
          d="M12 4.75c1.79 0 3.4.62 4.67 1.83l3.5-3.5C18.07 1.19 15.3 0 12 0 7.21 0 3.05 2.78 1.01 6.86l4.01 3.14C6 6.94 8.75 4.75 12 4.75z"
        />
      </svg>
      <span>{connecting ? 'Connecting Google…' : 'Sign in with Google'}</span>
    </button>
  );
}
