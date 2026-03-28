'use client';

export interface PreflightCheck {
  key: string;
  label: string;
  status: 'pass' | 'fail' | 'warn' | 'info';
  detail?: string;
  blocking?: boolean;
}

interface Props {
  checks: PreflightCheck[] | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

const statusOrder: Record<string, number> = { fail: 0, warn: 1, info: 2, pass: 3 };

function CheckIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-green-600 shrink-0 mt-[3px]">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-red-500 shrink-0 mt-[3px]">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function WarnIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-yellow-600 shrink-0 mt-[3px]">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500 shrink-0 mt-[3px]">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

function StatusIcon({ status }: { status: PreflightCheck['status'] }) {
  switch (status) {
    case 'fail': return <XIcon />;
    case 'warn': return <WarnIcon />;
    case 'info': return <InfoIcon />;
    case 'pass': return <CheckIcon />;
  }
}

export default function PreflightChecks({ checks, loading, error, onRetry }: Props) {
  if (loading) {
    return (
      <div className="flex items-center gap-3 py-4">
        <div className="w-5 h-5 border-2 border-brown-400 border-t-transparent rounded-full animate-spin" />
        <span className="text-brown-600 text-sm">Checking your GitHub repository...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-3">
        <p className="text-red-500 text-sm mb-2">{error}</p>
        <button
          onClick={onRetry}
          className="text-sm text-brown-800 underline hover:text-orange-500 transition-colors cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!checks || checks.length === 0) return null;

  const sorted = [...checks].sort((a, b) => (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3));
  const hasBlockingErrors = checks.some((c) => c.status === 'fail' && c.blocking);

  return (
    <div className="py-3">
      <h4 className="text-brown-800 text-xs font-medium uppercase tracking-wider mb-2">Repository Checks</h4>
      {hasBlockingErrors && (
        <p className="text-red-500 text-xs mb-2">Fix errors below before submitting.</p>
      )}
      <ul className="space-y-2">
        {sorted.map((check) => (
          <li key={check.key} className="flex items-start gap-2">
            <StatusIcon status={check.status} />
            <div className="min-w-0 flex-1">
              <span className={`text-sm ${check.status === 'fail' ? 'text-red-600 font-medium' : check.status === 'warn' ? 'text-yellow-700' : 'text-brown-800'}`}>
                {check.label}
              </span>
              {check.detail && (
                <p className="text-xs text-brown-500 mt-0.5 break-words">{check.detail}</p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
