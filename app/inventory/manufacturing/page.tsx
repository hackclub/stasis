"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { TeamPanel } from "@/app/components/inventory/TeamPanel";
import {
  ErrorBlock,
  LoadingBlock,
  PrinterTile,
  QueueTable,
  StatusBadge,
  inputClass,
  minutesToHuman,
  openStatuses,
  submittedTime,
  teamRemaining,
  useDerivedManufacturingState,
  useManufacturingState,
  type ManufacturingState,
} from "@/app/components/inventory/manufacturing/ManufacturingUI";

type FormState = {
  projectName: string;
  description: string;
  hours: string;
  minutes: string;
  material: string;
  colour: string;
  fileLink: string;
  notes: string;
  necessary: boolean;
  accurate: boolean;
  fileAccessible: boolean;
  organisersReview: boolean;
  collectResponsibility: boolean;
};

const initialForm: FormState = {
  projectName: "",
  description: "",
  hours: "0",
  minutes: "45",
  material: "PLA",
  colour: "Any",
  fileLink: "",
  notes: "",
  necessary: false,
  accurate: false,
  fileAccessible: false,
  organisersReview: false,
  collectResponsibility: false,
};

export default function ManufacturingPage() {
  const { state, loading, error, request, refresh } = useManufacturingState(8000);

  if (loading) return <LoadingBlock />;

  if (!state?.currentUser?.teamId) {
    return (
      <div className="space-y-8">
        <section>
          <h2 className="text-brown-800 font-bold text-lg uppercase tracking-wide mb-4">Manufacturing</h2>
          <p className="text-brown-800/60 text-sm mb-6">
            Join or create a team before submitting 3D prints.
          </p>
          <TeamPanel
            teamId={undefined}
            currentUserId={state?.currentUser?.id ?? ""}
            onTeamChanged={refresh}
          />
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <ErrorBlock error={error} />

      <section>
        <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
          <div>
            <h2 className="text-brown-800 font-bold text-lg uppercase tracking-wide">Manufacturing</h2>
            <p className="text-brown-800/60 text-sm mt-1">
              3D printer jobs for your inventory team.
            </p>
          </div>
          <QueueSummary state={state} />
        </div>
        <SubmitPrint state={state} request={request} refresh={refresh} />
      </section>

      <section>
        <h2 className="text-brown-800 font-bold text-lg uppercase tracking-wide mb-4">Print Queue</h2>
        <QueueView state={state} />
      </section>

      <section>
        <div className="flex items-center justify-between gap-4 mb-4">
          <h2 className="text-brown-800 font-bold text-lg uppercase tracking-wide">Printers</h2>
          <StatusBadge value={`${state.printers.length} printers`} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {state.printers.map((printer) => <PrinterTile key={printer.id} printer={printer} jobs={state.jobs} />)}
          {state.printers.length === 0 && (
            <p className="text-brown-800/60 text-sm">No printers are configured yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function QueueSummary({ state }: Readonly<{ state: ManufacturingState }>) {
  const available = state.printers.filter((printer) => printer.status === "AVAILABLE").length;
  return (
    <div className="grid grid-cols-3 gap-2 text-xs min-w-[280px]">
      <SummaryCell label="Available" value={`${available}/${state.printers.length}`} />
      <SummaryCell label="Queued" value={state.summary.totalQueuedJobs} />
      <SummaryCell label="Wait" value={minutesToHuman(state.summary.avgWaitMinutes)} />
    </div>
  );
}

function SummaryCell({ label, value }: Readonly<{ label: string; value: string | number }>) {
  return (
    <div className="border-2 border-brown-800 bg-cream-100 px-3 py-2">
      <p className="text-brown-800/60 uppercase tracking-wider">{label}</p>
      <p className="text-brown-800 font-bold text-base">{value}</p>
    </div>
  );
}

function SubmitPrint({
  state,
  request,
  refresh,
}: Readonly<{
  state: ManufacturingState;
  request: ReturnType<typeof useManufacturingState>["request"];
  refresh: () => Promise<void>;
}>) {
  const [form, setForm] = useState<FormState>(initialForm);
  const [submitError, setSubmitError] = useState("");
  const [confirmation, setConfirmation] = useState<{ projectName: string; position: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const team = state.teams.find((candidate) => candidate.id === state.currentUser?.teamId);
  const estimatedMinutes = Math.max(0, Math.round(Number(form.hours || 0) * 60 + Number(form.minutes || 0)));
  const remaining = team ? teamRemaining(team) : state.settings.defaultAllowanceMinutes;
  const overAllowance = estimatedMinutes > remaining;
  const overLongWarning = estimatedMinutes > state.settings.warningLongPrintMinutes;

  const queuePosition = useMemo(() => {
    return state.jobs.filter((job) => openStatuses.includes(job.status)).length + 1;
  }, [state.jobs]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitError("");
    setConfirmation(null);
    if (!team) {
      setSubmitError("Join a team before submitting a print job.");
      return;
    }
    if (!form.necessary || !form.accurate || !form.fileAccessible || !form.organisersReview || !form.collectResponsibility) {
      setSubmitError("Complete all confirmation checkboxes before submitting.");
      return;
    }
    if (overAllowance) {
      setSubmitError("This estimate is over your remaining allowance. Ask an organizer for an override.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await request("/api/inventory/manufacturing/jobs", {
        method: "POST",
        body: JSON.stringify({
          projectName: form.projectName,
          description: form.description,
          estimatedMinutes,
          material: form.material,
          colour: form.colour,
          fileLink: form.fileLink,
          notes: form.notes,
        }),
      });
      setConfirmation({ projectName: result.job.projectName, position: result.queuePosition });
      setForm(initialForm);
      await refresh();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not submit print job.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <form onSubmit={submit} className="border-2 border-brown-800 bg-cream-100 p-4 space-y-4">
        <ErrorBlock error={submitError} />

        <div className="grid gap-4 md:grid-cols-2">
          <Readout label="Team" value={team?.name ?? "No team"} />
          <Readout label="Submitter" value={state.currentUser?.slackDisplayName || state.currentUser?.name || state.currentUser?.email || "Unknown"} />
        </div>

        <Field label="Project Name">
          <input required className={inputClass} value={form.projectName} onChange={(event) => update("projectName", event.target.value)} placeholder="Sensor bracket" />
        </Field>

        <Field label="Short Description">
          <textarea required className={`${inputClass} min-h-20`} value={form.description} onChange={(event) => update("description", event.target.value)} placeholder="What the part does and why it matters." />
        </Field>

        <div className="grid gap-4 md:grid-cols-4">
          <Field label="Hours">
            <input className={inputClass} inputMode="numeric" value={form.hours} onChange={(event) => update("hours", event.target.value)} />
          </Field>
          <Field label="Minutes">
            <input className={inputClass} inputMode="numeric" value={form.minutes} onChange={(event) => update("minutes", event.target.value)} />
          </Field>
          <Field label="Material">
            <input className={inputClass} value={form.material} onChange={(event) => update("material", event.target.value)} />
          </Field>
          <Field label="Color Preference">
            <input className={inputClass} value={form.colour} onChange={(event) => update("colour", event.target.value)} />
          </Field>
        </div>

        <Field label="File Link">
          <input className={inputClass} value={form.fileLink} onChange={(event) => update("fileLink", event.target.value)} placeholder="Drive, Onshape, STL link, or organizer note" />
        </Field>

        <Field label="Notes For Organizers">
          <textarea className={`${inputClass} min-h-16`} value={form.notes} onChange={(event) => update("notes", event.target.value)} placeholder="Orientation, tolerances, material constraints." />
        </Field>

        <div className="grid gap-2 border-t border-brown-800 pt-4">
          <ConfirmBox checked={form.necessary} onChange={(checked) => update("necessary", checked)} label="This part is required for the project." />
          <ConfirmBox checked={form.accurate} onChange={(checked) => update("accurate", checked)} label="The time estimate is as accurate as I can make it." />
          <ConfirmBox checked={form.fileAccessible} onChange={(checked) => update("fileAccessible", checked)} label="The file link is accessible to organizers." />
          <ConfirmBox checked={form.organisersReview} onChange={(checked) => update("organisersReview", checked)} label="I understand organizers may reject, delay, split, or reassign this print." />
          <ConfirmBox checked={form.collectResponsibility} onChange={(checked) => update("collectResponsibility", checked)} label="I will collect the part when it is marked complete." />
        </div>

        <button
          type="submit"
          disabled={submitting || overAllowance || estimatedMinutes <= 0 || !team}
          className="w-full bg-orange-500 text-cream-50 px-4 py-2 hover:bg-orange-600 transition-colors uppercase text-sm tracking-wider disabled:opacity-50"
        >
          {submitting ? "Submitting..." : "Submit Print Job"}
        </button>
      </form>

      <aside className="space-y-4">
        <div className="border-2 border-brown-800 bg-cream-100 p-4">
          <h3 className="text-brown-800 font-bold text-sm uppercase tracking-wide mb-3">Print Time</h3>
          <div className="space-y-2">
            <Readout label="Remaining" value={minutesToHuman(remaining)} />
            <Readout label="This Request" value={minutesToHuman(estimatedMinutes)} />
            <Readout label="Queue Position" value={`#${queuePosition}`} />
          </div>
        </div>

        {(overAllowance || estimatedMinutes > 240 || overLongWarning) && (
          <div className="border-2 border-yellow-600 bg-yellow-50 p-4 text-sm text-brown-800">
            {overAllowance && <p>This exceeds remaining allowance. Ask an organizer for an override.</p>}
            {estimatedMinutes > 240 && <p>Prints over 4 hours may be split, delayed, or rejected.</p>}
            {overLongWarning && <p>Very long prints need organizer review before they are started.</p>}
          </div>
        )}

        {confirmation && (
          <div className="border-2 border-green-600 bg-green-50 p-4">
            <p className="text-green-700 text-xs uppercase tracking-wider font-bold">Submitted</p>
            <h3 className="text-brown-800 font-bold mt-1">{confirmation.projectName}</h3>
            <p className="text-brown-800/70 text-sm mt-1">Pending review. Queue position #{confirmation.position}.</p>
          </div>
        )}
      </aside>
    </div>
  );
}

function QueueView({ state }: Readonly<{ state: ManufacturingState }>) {
  const { printing, upcoming, completed, printers } = useDerivedManufacturingState(state);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <JobList title="Currently Printing" jobs={printing} />
        <JobList title="Next Jobs" jobs={upcoming.slice(0, 5)} />
        <JobList title="Recent Completed" jobs={completed.slice(0, 5)} />
      </div>
      <QueueTable jobs={state.jobs} printers={printers} />
    </div>
  );
}

function JobList({ title, jobs }: Readonly<{ title: string; jobs: ManufacturingState["jobs"] }>) {
  return (
    <div className="border-2 border-brown-800 bg-cream-100 p-4">
      <h3 className="text-brown-800 font-bold text-sm uppercase tracking-wide mb-3">{title}</h3>
      <div className="space-y-2">
        {jobs.map((job) => (
          <div key={job.id} className="border border-cream-300 bg-cream-50 p-2">
            <div className="flex justify-between gap-3">
              <p className="text-brown-800 font-bold text-sm truncate">{job.projectName}</p>
              <StatusBadge value={job.status} />
            </div>
            <p className="text-brown-800/60 text-xs mt-1">
              {job.teamName} | {minutesToHuman(job.estimatedMinutes)} | {submittedTime(job.submittedAt)}
            </p>
          </div>
        ))}
        {jobs.length === 0 && <p className="text-brown-800/60 text-sm">None.</p>}
      </div>
    </div>
  );
}

function Field({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <label className="block">
      <span className="block text-brown-800/70 text-xs uppercase mb-1">{label}</span>
      {children}
    </label>
  );
}

function Readout({ label, value }: Readonly<{ label: string; value: string | number }>) {
  return (
    <div className="border border-cream-300 bg-cream-50 p-2">
      <p className="text-brown-800/50 text-[10px] uppercase tracking-wider">{label}</p>
      <p className="text-brown-800 text-sm font-bold truncate">{value}</p>
    </div>
  );
}

function ConfirmBox({ checked, onChange, label }: Readonly<{ checked: boolean; onChange: (checked: boolean) => void; label: string }>) {
  return (
    <label className="flex items-start gap-2 text-sm text-brown-800/80">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-1 h-4 w-4 accent-orange-500" />
      <span>{label}</span>
    </label>
  );
}
