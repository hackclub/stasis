"use client";

import { useCallback, useEffect, useMemo, useState, type ButtonHTMLAttributes, type ReactNode } from "react";

export type PrinterStatus = "AVAILABLE" | "PRINTING" | "PAUSED" | "MAINTENANCE" | "OFFLINE";
export type JobStatus =
  | "PENDING"
  | "TIME_APPROVAL_REQUESTED"
  | "TIME_REJECTED_BY_TEAM"
  | "QUEUED"
  | "PRINTING"
  | "READY"
  | "COMPLETED"
  | "REJECTED"
  | "REJECTED_BY_ORGANIZER"
  | "REJECTED_BY_PRINTER"
  | "CANCELLED";

export type ManufacturingPrinter = {
  id: string;
  name: string;
  status: PrinterStatus;
  currentJobId: string | null;
  notes: string;
  lastCompletedJobId: string | null;
  sortOrder: number;
};

export type ManufacturingJob = {
  id: string;
  teamId: string;
  teamName: string;
  slackHandle: string;
  submittedBy: {
    id: string;
    name: string | null;
    slackDisplayName: string | null;
    image: string | null;
  };
  teamAutoApprovePrints: boolean;
  projectName: string;
  description: string;
  estimatedMinutes: number | null;
  material: string;
  colour: string;
  fileLink: string;
  notes: string;
  status: JobStatus;
  assignedPrinterId: string | null;
  assignedPrinter: { id: string; name: string; status: PrinterStatus } | null;
  submittedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  collectedAt: string | null;
  dismissedAt: string | null;
  timeEstimateRequestedAt: string | null;
  timeApprovedAt: string | null;
  timeRejectedAt: string | null;
  overBudgetApprovedAt: string | null;
  staffNotes: string;
  urgent: boolean;
  priority: boolean;
};

export type ManufacturingTeam = {
  id: string;
  name: string;
  locked: boolean;
  allowanceMinutes: number;
  usedMinutes: number;
  reservedMinutes: number;
  jobsSubmitted: number;
  jobsCompleted: number;
  memberCount: number;
  autoApprovePrints: boolean;
};

export type ManufacturingState = {
  printers: ManufacturingPrinter[];
  jobs: ManufacturingJob[];
  teams: ManufacturingTeam[];
  settings: {
    defaultAllowanceMinutes: number;
    warningLongPrintMinutes: number;
    eventName: string;
  };
  summary: {
    activePrinters: number;
    totalQueuedJobs: number;
    avgWaitMinutes: number;
    usedMinutes: number;
    reservedMinutes: number;
    remainingAllowanceMinutes: number;
    queuePressure: "low" | "medium" | "high";
    longestWaitingJobId: string | null;
    longestPrintJobId: string | null;
    teamsCloseToLimit: string[];
  };
  currentUser: {
    id: string;
    name: string | null;
    email: string;
    slackDisplayName: string | null;
    image: string | null;
    teamId: string | null;
    teamName: string | null;
  } | null;
  updatedAt: string;
};

export const jobStatuses: JobStatus[] = [
  "PENDING",
  "TIME_APPROVAL_REQUESTED",
  "TIME_REJECTED_BY_TEAM",
  "QUEUED",
  "PRINTING",
  "READY",
  "COMPLETED",
  "REJECTED",
  "REJECTED_BY_ORGANIZER",
  "REJECTED_BY_PRINTER",
  "CANCELLED",
];

export const printerStatuses: PrinterStatus[] = [
  "AVAILABLE",
  "PRINTING",
  "PAUSED",
  "MAINTENANCE",
  "OFFLINE",
];

export const openStatuses: JobStatus[] = ["PENDING", "TIME_APPROVAL_REQUESTED", "QUEUED"];
export const activeStatuses: JobStatus[] = ["PRINTING"];
export const closedStatuses: JobStatus[] = ["READY", "COMPLETED", "TIME_REJECTED_BY_TEAM", "REJECTED", "REJECTED_BY_ORGANIZER", "REJECTED_BY_PRINTER", "CANCELLED"];

export function minutesToHuman(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h <= 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function submittedTime(iso: string): string {
  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}

export function statusLabel(value: string): string {
  return value.replace(/_/g, " ").toUpperCase();
}

export function teamRemaining(team: ManufacturingTeam): number {
  return Math.max(0, team.allowanceMinutes - team.usedMinutes - team.reservedMinutes);
}

export function usagePercent(team: ManufacturingTeam): number {
  if (team.allowanceMinutes <= 0) return 100;
  return Math.min(100, ((team.usedMinutes + team.reservedMinutes) / team.allowanceMinutes) * 100);
}

export function usageTone(team: ManufacturingTeam): "green" | "yellow" | "red" {
  const pct = usagePercent(team);
  if (pct < 50) return "green";
  if (pct <= 85) return "yellow";
  return "red";
}

export function printerJob(printer: ManufacturingPrinter, jobs: ManufacturingJob[]): ManufacturingJob | null {
  if (!printer.currentJobId) return null;
  return jobs.find((job) => job.id === printer.currentJobId) ?? null;
}

export function printReadyForStart(job: ManufacturingJob): boolean {
  return (
    job.status === "QUEUED" &&
    Boolean(job.estimatedMinutes && job.estimatedMinutes > 0) &&
    (job.teamAutoApprovePrints || Boolean(job.timeApprovedAt))
  );
}

export function printNeedsEstimateReview(job: ManufacturingJob): boolean {
  if (job.status !== "QUEUED") return false;
  return !printReadyForStart(job);
}

export function nextJobForPrinter(printer: ManufacturingPrinter, jobs: ManufacturingJob[]): ManufacturingJob | null {
  return sortQueue(jobs).find((job) => printReadyForStart(job) && (!job.assignedPrinterId || job.assignedPrinterId === printer.id)) ?? null;
}

export function sortQueue(jobs: ManufacturingJob[]): ManufacturingJob[] {
  const rank: Record<string, number> = {
    PRINTING: 0,
    QUEUED: 1,
    TIME_APPROVAL_REQUESTED: 2,
    PENDING: 3,
    READY: 4,
    COMPLETED: 5,
    TIME_REJECTED_BY_TEAM: 6,
    REJECTED: 6,
    REJECTED_BY_ORGANIZER: 6,
    REJECTED_BY_PRINTER: 6,
    CANCELLED: 7,
  };

  return [...jobs].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority ? -1 : 1;
    return (rank[a.status] ?? 99) - (rank[b.status] ?? 99) || new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime();
  });
}

export function useManufacturingState(refreshMs = 0) {
  const [state, setState] = useState<ManufacturingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/inventory/manufacturing/state", { cache: "no-store" });
      if (!response.ok) throw new Error("State fetch failed.");
      setState(await response.json());
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load manufacturing state.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    if (!refreshMs) return;
    const interval = window.setInterval(refresh, refreshMs);
    return () => window.clearInterval(interval);
  }, [refresh, refreshMs]);

  const request = useCallback(async (url: string, options: RequestInit = {}) => {
    const response = await fetch(url, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Request failed.");
    if (data.state) setState(data.state);
    else if (data.printers) setState(data);
    return data;
  }, []);

  return { state, loading, error, refresh, request };
}

export function useDerivedManufacturingState(state: ManufacturingState | null) {
  return useMemo(() => {
    const jobs = state?.jobs ?? [];
    return {
      printing: jobs.filter((job) => activeStatuses.includes(job.status)),
      upcoming: sortQueue(jobs).filter((job) => openStatuses.includes(job.status)),
      completed: sortQueue(jobs).filter((job) => job.status === "READY" || job.status === "COMPLETED"),
      printers: state?.printers ?? [],
      teams: state?.teams ?? [],
    };
  }, [state]);
}

export function PageTitle({ eyebrow, title, children }: Readonly<{ eyebrow: string; title: string; children?: ReactNode }>) {
  return (
    <div className="mb-6 border-b-2 border-cream-400 pb-5">
      <p className="text-xs uppercase tracking-wider text-orange-500">{eyebrow}</p>
      <div className="mt-2 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <h1 className="text-3xl font-bold uppercase leading-none text-brown-800 md:text-5xl">{title}</h1>
        {children && <div className="text-sm text-brown-800/70 md:text-right">{children}</div>}
      </div>
    </div>
  );
}

export function Panel({ children, className = "" }: Readonly<{ children: ReactNode; className?: string }>) {
  return <section className={`border-2 border-brown-800 bg-cream-100 p-4 ${className}`}>{children}</section>;
}

export function Button({
  children,
  tone = "plain",
  className = "",
  ...props
}: Readonly<ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "primary" | "plain" | "danger" | "dark" }>) {
  const tones = {
    primary: "border-orange-500 bg-orange-500 text-cream-50 hover:bg-orange-600",
    plain: "border-brown-800 bg-cream-100 text-brown-800 hover:border-orange-500 hover:text-orange-500",
    danger: "border-red-700 bg-red-700 text-white hover:bg-red-600",
    dark: "border-brown-900 bg-brown-900 text-cream-50 hover:bg-brown-800",
  };
  return (
    <button {...props} className={`border-2 px-3 py-2 text-xs uppercase tracking-wider transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${tones[tone]} ${className}`}>
      {children}
    </button>
  );
}

export function Field({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs uppercase tracking-wider text-brown-800/70">{label}</span>
      {children}
    </label>
  );
}

export const inputClass = "w-full border-2 border-brown-800 bg-cream-50 px-3 py-2 text-sm text-brown-800 placeholder:text-brown-800/35 focus:border-orange-500 focus:outline-none";

export function StatusBadge({ value, urgent = false }: Readonly<{ value: string; urgent?: boolean }>) {
  const danger = ["MAINTENANCE", "OFFLINE", "TIME_REJECTED_BY_TEAM", "REJECTED", "REJECTED_BY_ORGANIZER", "REJECTED_BY_PRINTER", "CANCELLED"].includes(value);
  const muted = value === "PAUSED";
  const live = ["PRINTING", "QUEUED", "AVAILABLE", "READY", "COMPLETED", "low", "medium"].includes(value);
  let className = "border-brown-800 bg-cream-200 text-brown-800";
  if (live) className = "border-orange-500 bg-orange-50 text-orange-600";
  if (muted) className = "border-cream-400 bg-cream-200 text-brown-800/60";
  if (danger) className = "border-red-700 bg-red-50 text-red-800";
  if (urgent) className = "border-orange-500 bg-orange-500 text-cream-50";
  return <span className={`inline-flex border px-2 py-1 text-[10px] uppercase tracking-wider ${className}`}>{urgent ? "URGENT" : statusLabel(value)}</span>;
}

export function Progress({ value, tone = "orange" }: Readonly<{ value: number; tone?: "orange" | "green" | "yellow" | "red" }>) {
  const tones = {
    orange: "bg-orange-500",
    green: "bg-green-600",
    yellow: "bg-yellow-500",
    red: "bg-red-700",
  };
  return (
    <div className="h-3 border border-brown-800 bg-cream-200">
      <div className={`h-full ${tones[tone]} transition-all`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function Metric({ label, value, detail }: Readonly<{ label: string; value: string | number; detail?: string }>) {
  return (
    <Panel>
      <p className="text-xs uppercase tracking-wider text-brown-800/70">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-orange-500">{value}</p>
      {detail && <p className="mt-1 text-sm text-brown-800/70">{detail}</p>}
    </Panel>
  );
}

export function Readout({ label, value }: Readonly<{ label: string; value: string | number }>) {
  return (
    <div className="border border-brown-800 bg-cream-200 p-2">
      <p className="text-[10px] uppercase tracking-wider text-brown-800/50">{label}</p>
      <p className="mt-1 truncate text-brown-800">{value}</p>
    </div>
  );
}

export function LoadingBlock({ label = "Loading manufacturing..." }: Readonly<{ label?: string }>) {
  return <div className="border-2 border-brown-800 bg-cream-100 p-8 text-center text-sm uppercase tracking-wider text-brown-800/70">{label}</div>;
}

export function ErrorBlock({ error }: Readonly<{ error: string }>) {
  if (!error) return null;
  return <div className="mb-4 border-2 border-red-700 bg-red-50 p-4 text-sm text-red-800">{error}</div>;
}

export function PrinterTile({ printer, jobs }: Readonly<{ printer: ManufacturingPrinter; jobs: ManufacturingJob[] }>) {
  const current = printerJob(printer, jobs);
  const next = nextJobForPrinter(printer, jobs);
  const blocked = printer.status === "MAINTENANCE" || printer.status === "OFFLINE";
  const paused = printer.status === "PAUSED";
  return (
    <div className={`border-2 p-3 ${blocked ? "border-red-700 bg-red-50" : paused ? "border-cream-400 bg-cream-200" : "border-brown-800 bg-cream-100"}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-brown-800/50">{printer.id.slice(-8).toUpperCase()}</p>
          <p className="font-semibold text-brown-800">{printer.name}</p>
        </div>
        <StatusBadge value={printer.status} />
      </div>
      <div className="mt-3 space-y-1 text-xs text-brown-800/70">
        <p className="truncate">Now: {current ? current.projectName : "None"}</p>
        <p className="truncate">Next: {next ? next.projectName : "None"}</p>
      </div>
    </div>
  );
}

export function QueueTable({ jobs, printers, limit }: Readonly<{ jobs: ManufacturingJob[]; printers: ManufacturingPrinter[]; limit?: number }>) {
  const rows = sortQueue(jobs)
    .filter((job) => !["REJECTED", "REJECTED_BY_ORGANIZER", "REJECTED_BY_PRINTER", "CANCELLED"].includes(job.status))
    .slice(0, limit ?? jobs.length);

  return (
    <div className="overflow-x-auto border-2 border-brown-800 bg-cream-100">
      <table className="w-full min-w-[860px] border-collapse">
        <thead>
          <tr className="border-b-2 border-brown-800">
            {["#", "Team", "Project", "Estimate", "Printer", "Status", "Submitted", "Flags"].map((heading) => (
              <th key={heading} className="px-3 py-2 text-left text-[11px] uppercase tracking-wider text-brown-800/70">{heading}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((job, index) => (
            <tr key={job.id} className="border-t border-brown-800/20 hover:bg-cream-200">
              <td className="px-3 py-3 text-sm text-brown-800/70">{index + 1}</td>
              <td className="px-3 py-3">
                <p className="font-medium text-brown-800">{job.teamName}</p>
                <p className="text-xs text-brown-800/50">{job.slackHandle || job.submittedBy.slackDisplayName || "No Slack"}</p>
              </td>
              <td className="px-3 py-3">
                <p className="text-brown-800">{job.projectName}</p>
                <p className="max-w-[320px] truncate text-xs text-brown-800/50">{job.description}</p>
              </td>
              <td className="px-3 py-3 text-sm text-brown-800">{job.estimatedMinutes ? minutesToHuman(job.estimatedMinutes) : "Not estimated"}</td>
              <td className="px-3 py-3 text-sm text-brown-800">{printers.find((printer) => printer.id === job.assignedPrinterId)?.name ?? "Unassigned"}</td>
              <td className="px-3 py-3"><StatusBadge value={job.status} /></td>
              <td className="px-3 py-3 text-sm text-brown-800">{submittedTime(job.submittedAt)}</td>
              <td className="px-3 py-3">
                <div className="flex flex-wrap gap-1">
                  {job.urgent && <StatusBadge value="urgent" urgent />}
                  {job.priority && (
                    <span className="inline-flex border border-red-700 bg-red-50 px-2 py-1 text-[10px] uppercase tracking-wider text-red-800">
                      Front
                    </span>
                  )}
                  {!job.urgent && !job.priority && <span className="text-brown-800/35">-</span>}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TeamRow({ team, editable = false, onSave }: Readonly<{ team: ManufacturingTeam; editable?: boolean; onSave?: (minutes: number) => Promise<void> }>) {
  const [hours, setHours] = useState(String(team.allowanceMinutes / 60));
  const tone = usageTone(team);
  const toneMap = { green: "green", yellow: "yellow", red: "red" } as const;

  return (
    <Panel className="space-y-3">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <p className="text-xs uppercase tracking-wider text-orange-500">{team.id.slice(-8).toUpperCase()}</p>
          <h3 className="text-xl font-semibold text-brown-800">{team.name}</h3>
          <p className="text-sm text-brown-800/70">{team.memberCount} members{team.locked ? " / locked" : ""}</p>
        </div>
        <StatusBadge value={teamRemaining(team) < 0 ? "over limit" : usagePercent(team) >= 85 ? "near limit" : "tracking"} />
      </div>
      <Progress value={usagePercent(team)} tone={toneMap[tone]} />
      <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
        <Readout label="Allowance" value={minutesToHuman(team.allowanceMinutes)} />
        <Readout label="Used" value={minutesToHuman(team.usedMinutes)} />
        <Readout label="Reserved" value={minutesToHuman(team.reservedMinutes)} />
        <Readout label="Remaining" value={minutesToHuman(teamRemaining(team))} />
        <Readout label="Jobs" value={`${team.jobsSubmitted}/${team.jobsCompleted}`} />
      </div>
      {editable && onSave && (
        <div className="flex gap-2 border-t border-brown-800 pt-3">
          <input className={`${inputClass} max-w-28`} value={hours} onChange={(event) => setHours(event.target.value)} inputMode="decimal" />
          <Button onClick={() => onSave(Math.round(Number(hours) * 60))}>Set hours</Button>
        </div>
      )}
    </Panel>
  );
}

export function Segmented({ value, options, onChange }: Readonly<{ value: string; options: Array<[string, string]>; onChange: (value: string) => void }>) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map(([id, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={`border-2 px-3 py-2 text-[10px] uppercase tracking-wider ${value === id ? "border-orange-500 bg-orange-500 text-cream-50" : "border-brown-800 bg-cream-100 text-brown-800 hover:border-orange-500"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
