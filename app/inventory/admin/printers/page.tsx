'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useInventorySSE } from '@/lib/inventory/useInventorySSE';
import {
  minutesToHuman,
  nextJobForPrinter,
  printNeedsEstimateReview,
  printReadyForStart,
  printerStatuses,
  statusLabel,
  submittedTime,
  teamRemaining,
  type ManufacturingJob,
  type ManufacturingPrinter,
  type ManufacturingState,
  type ManufacturingTeam,
  type PrinterStatus,
} from '@/app/components/inventory/manufacturing/ManufacturingUI';

const DISABLED_PRINTER_STATUSES: PrinterStatus[] = ['MAINTENANCE', 'OFFLINE', 'PAUSED'];

function splitEstimateMinutes(totalMinutes: number | null) {
  if (!totalMinutes || totalMinutes <= 0) return { hours: '', minutes: '' };
  return {
    hours: String(Math.floor(totalMinutes / 60)),
    minutes: String(totalMinutes % 60),
  };
}

function readEstimateMinutes(hoursText: string, minutesText: string) {
  const hours = hoursText.trim() === '' ? 0 : Number(hoursText);
  const minutes = minutesText.trim() === '' ? 0 : Number(minutesText);
  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    minutes < 0 ||
    minutes > 59 ||
    hours + minutes === 0
  ) {
    return null;
  }
  return hours * 60 + minutes;
}

export default function PrintersPage() {
  const [state, setState] = useState<ManufacturingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [selectedPrinterId, setSelectedPrinterId] = useState<string | null>(null);
  const [estimateDrafts, setEstimateDrafts] = useState<Record<string, { hours: string; minutes: string }>>({});
  const [rejectDrafts, setRejectDrafts] = useState<Record<string, string>>({});
  const sseEvent = useInventorySSE('admin');

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/inventory/manufacturing/state', { cache: 'no-store' });
      if (!response.ok) throw new Error('Failed to load printers.');
      setState(await response.json());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load printers.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!sseEvent) return;
    if (
      sseEvent.type === 'manufacturing_job_created' ||
      sseEvent.type === 'manufacturing_job_updated' ||
      sseEvent.type === 'manufacturing_printer_updated'
    ) {
      refresh();
    }
  }, [sseEvent, refresh]);

  const selectedPrinter = useMemo(
    () => state?.printers.find((printer) => printer.id === selectedPrinterId) ?? null,
    [state?.printers, selectedPrinterId]
  );
  const selectedJob = selectedPrinter && state
    ? nextJobForPrinter(selectedPrinter, state.jobs)
    : null;
  const selectedTeam = selectedJob && state
    ? state.teams.find((team) => team.id === selectedJob.teamId) ?? null
    : null;

  const startSelectedPrinter = () => {
    if (!state || !selectedPrinterId) return;
    const latestPrinter = state.printers.find((printer) => printer.id === selectedPrinterId);
    if (!latestPrinter) {
      setError('Printer not found.');
      return;
    }
    const latestJob = nextJobForPrinter(latestPrinter, state.jobs);
    if (!latestJob) {
      setError('No queued print is available for this printer.');
      setSelectedPrinterId(null);
      return;
    }

    void updatePrinter(latestPrinter, { assignNext: true });
  };

  const updatePrinter = async (printer: ManufacturingPrinter, patch: Record<string, unknown>) => {
    setUpdating(printer.id);
    setError(null);
    try {
      const response = await fetch(`/api/inventory/admin/manufacturing/printers/${printer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || 'Failed to update printer.');
      setState(data.state);
      if (patch.assignNext) {
        setSelectedPrinterId(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update printer.');
    } finally {
      setUpdating(null);
    }
  };

  const updateJob = async (job: ManufacturingJob, patch: Record<string, unknown>) => {
    setUpdating(job.id);
    setError(null);
    try {
      const response = await fetch(`/api/inventory/admin/manufacturing/jobs/${job.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || 'Failed to update print job.');
      setState(data.state);
      setSelectedPrinterId(null);
      setRejectDrafts((current) => {
        const next = { ...current };
        delete next[job.id];
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update print job.');
    } finally {
      setUpdating(null);
    }
  };

  const estimateDraftForJob = (job: ManufacturingJob) => {
    return estimateDrafts[job.id] ?? splitEstimateMinutes(job.estimatedMinutes);
  };

  const setEstimateDraft = (job: ManufacturingJob, field: 'hours' | 'minutes', value: string) => {
    setEstimateDrafts((current) => ({
      ...current,
      [job.id]: {
        ...(current[job.id] ?? splitEstimateMinutes(job.estimatedMinutes)),
        [field]: value,
      },
    }));
  };

  const rejectDraftForJob = (job: ManufacturingJob) => rejectDrafts[job.id] ?? '';

  const setRejectDraft = (job: ManufacturingJob, value: string) => {
    setRejectDrafts((current) => ({ ...current, [job.id]: value }));
  };

  const submitEstimate = (job: ManufacturingJob, pushToFront = false) => {
    if (!state) return;
    const draft = estimateDraftForJob(job);
    const estimatedMinutes = readEstimateMinutes(draft.hours, draft.minutes);
    if (!estimatedMinutes) {
      setError('Enter an estimated print time.');
      return;
    }

    const team = state.teams.find((candidate) => candidate.id === job.teamId) ?? null;
    const remaining = team ? teamRemaining(team) : null;
    const overBudget = remaining !== null && estimatedMinutes > remaining;
    if (overBudget) {
      const confirmed = window.confirm('This estimate exceeds the team budget. Allow it anyway and floor the remaining budget to 0? Team approval is still required unless auto-approve is enabled.');
      if (!confirmed) return;
      void updateJob(job, {
        status: job.teamAutoApprovePrints ? 'QUEUED' : 'TIME_APPROVAL_REQUESTED',
        estimatedMinutes,
        forceOverBudget: true,
        priority: pushToFront,
      });
      return;
    }

    if (job.teamAutoApprovePrints) {
      void updateJob(job, { status: 'QUEUED', estimatedMinutes, priority: pushToFront });
      return;
    }

    void updateJob(job, { status: 'TIME_APPROVAL_REQUESTED', estimatedMinutes, priority: pushToFront });
  };

  const rejectJob = (job: ManufacturingJob) => {
    void updateJob(job, { status: 'REJECTED_BY_PRINTER', rejectReason: rejectDraftForJob(job) });
  };

  if (loading) {
    return <div className="flex justify-center py-12"><div className="loader" /></div>;
  }

  const printers = state?.printers ?? [];
  const estimateJobs = state?.jobs.filter(printNeedsEstimateReview) ?? [];
  const queuedJobs = state?.jobs.filter(printReadyForStart) ?? [];

  return (
    <div className="font-mono space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-cream-400 pb-5">
        <div>
          <p className="text-xs uppercase tracking-wider text-orange-500">Printer Queue</p>
          <h1 className="mt-2 text-3xl font-bold uppercase leading-none text-brown-800 md:text-5xl">Jonathan</h1>
        </div>
        <div className="text-sm text-brown-800/70">
          {queuedJobs.length} ready to print
        </div>
      </div>

      {error && <div className="border-2 border-red-700 bg-red-50 p-4 text-sm text-red-800">{error}</div>}

      {state && (
        <EstimateQueue
          jobs={estimateJobs}
          teams={state.teams}
          readyQueueCount={queuedJobs.length}
          updating={updating}
          estimateDraftForJob={estimateDraftForJob}
          setEstimateDraft={setEstimateDraft}
          submitEstimate={submitEstimate}
          rejectDraftForJob={rejectDraftForJob}
          setRejectDraft={setRejectDraft}
          rejectJob={rejectJob}
        />
      )}

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-orange-500">Fully Approved Printer Control</p>
            <h2 className="mt-1 text-xl font-bold uppercase text-brown-800">Printers</h2>
          </div>
          <span className="text-sm text-brown-800/60">{queuedJobs.length} ready to print</span>
        </div>

        {printers.length === 0 ? (
          <p className="text-brown-800/60 text-sm">No printers configured. Add printers from Inventory.</p>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {printers.map((printer) => {
              const current = state?.jobs.find((job) => job.id === printer.currentJobId) ?? null;
              const next = state ? nextJobForPrinter(printer, state.jobs) : null;
              const disabled = DISABLED_PRINTER_STATUSES.includes(printer.status);
              const printing = printer.status === 'PRINTING';
              return (
                <PrinterCard
                  key={printer.id}
                  printer={printer}
                  tone={printerTone(printer.status)}
                  statusControl={(
                    <select
                      value={printer.status}
                      onChange={(event) => updatePrinter(printer, { status: event.target.value })}
                      disabled={updating === printer.id}
                      className="border border-brown-800 bg-cream-50 px-2 py-1 text-xs text-brown-800 disabled:opacity-50"
                    >
                      {printerStatuses.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
                    </select>
                  )}
                >
                  <div className="grid gap-3 text-sm md:grid-cols-2">
                    <Readout label="Current" value={current?.projectName ?? 'None'} />
                    <Readout label="State" value={statusLabel(printer.status)} />
                  </div>
                  <div className="flex flex-wrap gap-2 pt-2">
                    <button
                      type="button"
                      disabled={!next || disabled || printing || updating === printer.id}
                      onClick={() => setSelectedPrinterId(printer.id)}
                      className="border-2 border-brown-800 bg-orange-500 px-4 py-2 text-sm uppercase tracking-wider text-cream-50 transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Start Next
                    </button>
                    <button
                      type="button"
                      disabled={!current || disabled || !printing || updating === printer.id}
                      onClick={() => updatePrinter(printer, { completeCurrent: true })}
                      className="border-2 border-brown-800 px-4 py-2 text-sm uppercase tracking-wider text-brown-800 transition-colors hover:bg-cream-200 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Mark Print Ready
                    </button>
                  </div>
                </PrinterCard>
              );
            })}
          </div>
        )}
      </section>

      {selectedPrinter && selectedJob && (
        <StartNextModal
          printer={selectedPrinter}
          job={selectedJob}
          team={selectedTeam}
          updating={updating === selectedJob.id || updating === selectedPrinter.id}
          onClose={() => {
            setSelectedPrinterId(null);
          }}
          onStart={startSelectedPrinter}
        />
      )}
    </div>
  );
}

function EstimateQueue({
  jobs,
  teams,
  readyQueueCount,
  updating,
  estimateDraftForJob,
  setEstimateDraft,
  submitEstimate,
  rejectDraftForJob,
  setRejectDraft,
  rejectJob,
}: Readonly<{
  jobs: ManufacturingJob[];
  teams: ManufacturingTeam[];
  readyQueueCount: number;
  updating: string | null;
  estimateDraftForJob: (job: ManufacturingJob) => { hours: string; minutes: string };
  setEstimateDraft: (job: ManufacturingJob, field: 'hours' | 'minutes', value: string) => void;
  submitEstimate: (job: ManufacturingJob, pushToFront?: boolean) => void;
  rejectDraftForJob: (job: ManufacturingJob) => string;
  setRejectDraft: (job: ManufacturingJob, reason: string) => void;
  rejectJob: (job: ManufacturingJob) => void;
}>) {
  const [openActionJobId, setOpenActionJobId] = useState<string | null>(null);

  return (
    <section className="border-2 border-brown-800 bg-cream-100 p-4">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-orange-500">Main Queue</p>
          <h2 className="mt-1 text-xl font-bold uppercase text-brown-800">Print Requests</h2>
        </div>
        <span className="text-sm text-brown-800/60">{jobs.length} awaiting estimate</span>
      </div>

      {jobs.length === 0 ? (
        <p className="text-sm text-brown-800/60">No prints are waiting for estimates.</p>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => {
            const team = teams.find((candidate) => candidate.id === job.teamId) ?? null;
            const draft = estimateDraftForJob(job);
            const estimatedMinutes = readEstimateMinutes(draft.hours, draft.minutes);
            const remainingMinutes = team ? teamRemaining(team) : null;
            const overBudget =
              estimatedMinutes !== null &&
              remainingMinutes !== null &&
              estimatedMinutes > remainingMinutes;
            const actionLabel = overBudget
              ? job.teamAutoApprovePrints
                ? 'Override & Move To Queue'
                : 'Override & Send Estimate'
              : job.teamAutoApprovePrints
                ? 'Move To Print Queue'
                : 'Send Estimate';
            const normalQueueLabel = job.teamAutoApprovePrints
              ? 'Add To Queue'
              : 'Send Estimate - Normal Queue';
            const frontQueueLabel = job.teamAutoApprovePrints
              ? 'Push To Front'
              : 'Send Estimate - Push Front After Approval';
            const rejectReason = rejectDraftForJob(job);

            return (
              <div key={job.id} className="border border-brown-800 bg-cream-50 p-3">
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]">
                  <div className="min-w-0 space-y-2">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-brown-800/50">#{job.id.slice(-6).toUpperCase()} | {statusLabel(job.status)}</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-sm font-bold uppercase tracking-wide text-brown-800">{job.projectName}</h3>
                        {job.urgent && (
                          <span className="border border-red-700 bg-red-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-700">
                            Urgent
                          </span>
                        )}
                        {job.priority && (
                          <span className="border border-red-700 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-700">
                            Front of Queue
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-brown-800/60">
                        {job.teamName} | {job.submittedBy.name || job.submittedBy.slackDisplayName || 'Unknown'} | {job.slackHandle || job.submittedBy.slackDisplayName || 'No Slack'} | {submittedTime(job.submittedAt)}
                      </p>
                    </div>
                    <Readout label="Description" value={job.description} />
                    {job.fileLink && <Readout label="File" value={job.fileLink} />}
                    {job.notes && <Readout label="Notes" value={job.notes} />}
                    {job.staffNotes && <Readout label="Staff Notes" value={job.staffNotes} />}
                    <div className="flex flex-wrap gap-2 text-xs text-brown-800/60">
                      <span>{job.material} | {job.colour}</span>
                      {team && <span>{minutesToHuman(teamRemaining(team))} left of {minutesToHuman(team.allowanceMinutes)}</span>}
                      {job.teamAutoApprovePrints && <span className="font-bold text-red-700">auto-approve enabled</span>}
                    </div>
                    {job.urgent && (
                      <p className="border border-red-700 bg-red-50 p-2 text-xs uppercase tracking-wider text-red-700">
                        Team marked this project-critical. Use queue priority only if this is actually blocking their build.
                      </p>
                    )}
                    {overBudget && (
                      <p className="text-xs uppercase tracking-wider text-red-700">
                        Over budget. Team approval is still required unless auto-approve is enabled.
                      </p>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block">
                        <span className="block text-[10px] uppercase tracking-wider text-brown-800/50">Hours</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={draft.hours}
                          onChange={(event) => setEstimateDraft(job, 'hours', event.target.value)}
                          className="mt-1 w-full border-2 border-brown-800 bg-cream-50 px-3 py-2 text-sm text-brown-800"
                          placeholder="0"
                        />
                      </label>
                      <label className="block">
                        <span className="block text-[10px] uppercase tracking-wider text-brown-800/50">Minutes</span>
                        <input
                          type="number"
                          min="0"
                          max="59"
                          step="1"
                          value={draft.minutes}
                          onChange={(event) => setEstimateDraft(job, 'minutes', event.target.value)}
                          className="mt-1 w-full border-2 border-brown-800 bg-cream-50 px-3 py-2 text-sm text-brown-800"
                          placeholder="0"
                        />
                      </label>
                    </div>
                    <div className="relative">
                      <div className="flex w-full">
                        <button
                          type="button"
                          disabled={updating === job.id}
                          onClick={() => submitEstimate(job, false)}
                          className={`min-w-0 flex-1 border-2 px-4 py-2 text-sm uppercase tracking-wider text-cream-50 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${overBudget ? 'border-red-700 bg-red-700 hover:bg-red-600' : 'border-orange-500 bg-orange-500 hover:bg-orange-600'}`}
                        >
                          {updating === job.id ? 'Saving...' : actionLabel}
                        </button>
                        <button
                          type="button"
                          disabled={updating === job.id}
                          aria-label="Queue priority options"
                          onClick={() => setOpenActionJobId(openActionJobId === job.id ? null : job.id)}
                          className={`border-2 border-l-0 px-3 py-2 text-sm uppercase tracking-wider text-cream-50 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${overBudget ? 'border-red-700 bg-red-700 hover:bg-red-600' : 'border-orange-500 bg-orange-500 hover:bg-orange-600'}`}
                        >
                          v
                        </button>
                      </div>
                      {openActionJobId === job.id && (
                        <div className="absolute right-0 z-20 mt-1 w-full border-2 border-brown-800 bg-cream-50 shadow-xl">
                          <button
                            type="button"
                            disabled={updating === job.id}
                            onClick={() => {
                              setOpenActionJobId(null);
                              submitEstimate(job, false);
                            }}
                            className="block w-full px-3 py-2 text-left text-xs uppercase tracking-wider text-brown-800 hover:bg-cream-200 disabled:opacity-40"
                          >
                            {normalQueueLabel}
                          </button>
                          <button
                            type="button"
                            disabled={updating === job.id}
                            onClick={() => {
                              setOpenActionJobId(null);
                              submitEstimate(job, true);
                            }}
                            className="block w-full border-t border-brown-800 px-3 py-2 text-left text-xs font-bold uppercase tracking-wider text-red-700 hover:bg-red-50 disabled:opacity-40"
                          >
                            {frontQueueLabel}
                          </button>
                          <p className="border-t border-brown-800 px-3 py-2 text-[10px] uppercase tracking-wider text-brown-800/60">
                            {readyQueueCount > 0
                              ? `Push front places it ahead of ${readyQueueCount} approved print${readyQueueCount === 1 ? '' : 's'} already waiting.`
                              : 'No approved prints are waiting yet.'}
                          </p>
                        </div>
                      )}
                    </div>
                    <label className="block">
                      <span className="mb-1 block text-[10px] uppercase tracking-wider text-brown-800/50">Reject Reason</span>
                      <textarea
                        value={rejectReason}
                        onChange={(event) => setRejectDraft(job, event.target.value)}
                        className="min-h-16 w-full border-2 border-brown-800 bg-cream-50 px-3 py-2 text-sm text-brown-800"
                        placeholder="Optional"
                      />
                    </label>
                    <button
                      type="button"
                      disabled={updating === job.id}
                      onClick={() => rejectJob(job)}
                      className="w-full border-2 border-red-700 px-4 py-2 text-sm uppercase tracking-wider text-red-700 transition-colors hover:bg-red-700 hover:text-cream-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {updating === job.id ? 'Rejecting...' : 'Reject Print'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function PrinterCard({
  printer,
  tone,
  statusControl,
  children,
}: Readonly<{
  printer: ManufacturingPrinter;
  tone: string;
  statusControl: ReactNode;
  children: ReactNode;
}>) {
  return (
    <section className={`border-2 p-4 ${tone}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-brown-800/50">{printer.id.slice(-8).toUpperCase()}</p>
          <h2 className="text-xl font-bold uppercase text-brown-800">{printer.name}</h2>
          {printer.notes && <p className="mt-1 text-sm text-brown-800/60">{printer.notes}</p>}
        </div>
        {statusControl}
      </div>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function StartNextModal({
  printer,
  job,
  team,
  updating,
  onClose,
  onStart,
}: Readonly<{
  printer: ManufacturingPrinter;
  job: ManufacturingJob;
  team: ManufacturingTeam | null;
  updating: boolean;
  onClose: () => void;
  onStart: () => void;
}>) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center font-mono">
      <div className="absolute inset-0 bg-[#3D3229]/80" onClick={onClose} />
      <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto border-2 border-brown-800 bg-cream-100 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-brown-800 pb-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-orange-500">{printer.name}</p>
            <h2 className="mt-1 text-xl font-bold uppercase text-brown-800">Start Print</h2>
          </div>
          <button type="button" onClick={onClose} className="text-brown-800/60 hover:text-brown-800">x</button>
        </div>

        <div className="mt-4 space-y-4 text-sm text-brown-800">
          <Readout label="Project" value={job.projectName} />
          <Readout label="Team" value={job.teamName} />
          <Readout label="Requester" value={job.submittedBy.name || job.submittedBy.slackDisplayName || 'Unknown'} />
          <Readout label="Slack" value={job.slackHandle || job.submittedBy.slackDisplayName || 'None'} />
          <Readout label="Submitted" value={submittedTime(job.submittedAt)} />
          {job.urgent && <Readout label="Urgency" value="Team marked this project-critical." />}
          {team && (
            <Readout
              label="Team Budget"
              value={`${minutesToHuman(teamRemaining(team))} left of ${minutesToHuman(team.allowanceMinutes)}`}
            />
          )}
          <Readout
            label="Team Print Allocation"
            value={job.estimatedMinutes ? minutesToHuman(job.estimatedMinutes) : 'Not estimated'}
          />
          <Readout label="Material" value={`${job.material} | ${job.colour}`} />
          {job.fileLink && <Readout label="File" value={job.fileLink} />}
          {job.description && <Readout label="Description" value={job.description} />}
          {job.notes && <Readout label="Notes" value={job.notes} />}
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onStart}
            disabled={updating}
            className="border-2 border-brown-800 bg-orange-500 px-4 py-2 text-sm uppercase tracking-wider text-cream-50 transition-colors hover:bg-orange-600 disabled:opacity-40"
          >
            {updating ? 'Starting...' : 'Start Print'}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={updating}
            className="border-2 border-brown-800 px-4 py-2 text-sm uppercase tracking-wider text-brown-800 transition-colors hover:bg-cream-200 disabled:opacity-40"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function Readout({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="border border-brown-800 bg-cream-50 p-2">
      <p className="text-[10px] uppercase tracking-wider text-brown-800/50">{label}</p>
      <p className="mt-1 break-words text-brown-800">{value}</p>
    </div>
  );
}

function printerTone(status: PrinterStatus): string {
  switch (status) {
    case 'MAINTENANCE':
    case 'OFFLINE':
      return 'border-red-700 bg-red-50';
    case 'PAUSED':
      return 'border-cream-400 bg-cream-200';
    case 'PRINTING':
      return 'border-yellow-600 bg-yellow-50';
    default:
      return 'border-brown-800 bg-cream-100';
  }
}
