'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { Avatar } from './Avatar';
import { StatusPill, FlagPill } from './StatusPill';
import { CommsLog, type CommsEntry } from './CommsLog';
import { ColorSelect, SelectColor } from './ColorSelect';
import { AttendanceStatus, STATUS_LABEL, AdminUser, relativeTime } from '../lib/types';

const STATUS_COLOR: Record<AttendanceStatus, SelectColor> = {
  IDENTIFIED: 'cream',
  CONTACTED: 'orange',
  SOFT_YES: 'yellow',
  CONFIRMED_YES: 'green',
  DECLINED: 'red',
};

const OWNER_PALETTE: SelectColor[] = ['emerald', 'blue', 'purple', 'pink', 'orange', 'yellow', 'cream'];
function ownerColor(id: string): SelectColor {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return OWNER_PALETTE[h % OWNER_PALETTE.length];
}

interface CandidateDetail {
  candidate: {
    id: string;
    userId: string | null;
    name: string | null;
    email: string | null;
    slackId: string | null;
    slackDisplayName: string | null;
    image: string | null;
    pronouns: string | null;
    eventPreference: string | null;
    outreachStatus: AttendanceStatus;
    ownerId: string | null;
    owner: { id: string; name: string | null; email: string; image: string | null } | null;
    snoozedUntil: string | null;
    notes: string | null;
    flakeNote: string | null;
    attendInvited: boolean;
    attendFlightBooked: boolean;
    attendCachedAt: string | null;
    isExternal: boolean;
    createdAt: string;
    updatedAt: string;
  };
  stasis: null | {
    projects: Array<{
      id: string;
      title: string;
      tier: number | null;
      designStatus: string;
      buildStatus: string;
      hoursClaimed: number;
      bitsAwarded: number | null;
      createdAt: string;
    }>;
    realBits: number;
    adminGrants: number;
    deductions: number;
    shopSpend: number;
    totalHoursClaimed: number;
  };
  attend: null | {
    found: boolean;
    status?: string;
    invitedAt?: string | null;
    confirmedAt?: string | null;
    checkedInAt?: string | null;
    city?: string | null;
    state?: string | null;
    country?: string | null;
    pronouns?: string | null;
    tshirtSize?: string | null;
    hasFlight?: boolean;
    travel?: {
      inbound?: { flightCode: string | null; confirmationCode: string | null; departureAirport: string | null; arrivalAirport: string | null; departureTime: string | null } | null;
      outbound?: { flightCode: string | null; confirmationCode: string | null; departureAirport: string | null; arrivalAirport: string | null; departureTime: string | null } | null;
      visaRequired?: boolean | null;
      visaStatus?: string | null;
    };
  };
  commsEntries: CommsEntry[];
  auditEntries: Array<{
    id: string;
    field: string;
    oldValue: string | null;
    newValue: string | null;
    createdAt: string;
    actor: { id: string; name: string | null; email: string; image: string | null } | null;
  }>;
  reminders: Array<{ id: string; dueAt: string; message: string }>;
}

const STATUS_OPTIONS: AttendanceStatus[] = ['IDENTIFIED', 'CONTACTED', 'SOFT_YES', 'CONFIRMED_YES', 'DECLINED'];

export function CandidateModal({
  candidateId,
  admins,
  onClose,
  onMutated,
}: Readonly<{
  candidateId: string;
  admins: AdminUser[];
  onClose: () => void;
  onMutated: () => void;
}>) {
  const [data, setData] = useState<CandidateDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingField, setSavingField] = useState<string | null>(null);
  const [showAudit, setShowAudit] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/attendance/${candidateId}`);
      if (!res.ok) throw new Error('Failed to load');
      const j = (await res.json()) as CandidateDetail;
      setData(j);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }, [candidateId]);

  useEffect(() => { load(); }, [load]);

  // Esc to close
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Silent URL update so links are shareable, no UI clutter
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('id', candidateId);
    window.history.replaceState(null, '', url);
    return () => {
      const u = new URL(window.location.href);
      u.searchParams.delete('id');
      window.history.replaceState(null, '', u);
    };
  }, [candidateId]);

  async function patch(patch: Record<string, unknown>, field: string) {
    setSavingField(field);
    try {
      const res = await fetch(`/api/admin/attendance/${candidateId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error('Save failed');
      await load();
      onMutated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSavingField(null);
    }
  }

  async function syncAttend() {
    setSavingField('attend');
    try {
      await fetch(`/api/admin/attendance/${candidateId}/attend-sync`, { method: 'POST' });
      await load();
      onMutated();
    } finally {
      setSavingField(null);
    }
  }

  async function deleteCandidate() {
    setConfirmingDelete(true);
  }

  async function performDelete() {
    setConfirmingDelete(false);
    const res = await fetch(`/api/admin/attendance/${candidateId}`, { method: 'DELETE' });
    if (res.ok) {
      onMutated();
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="attendance-modal-backdrop absolute inset-0 bg-black/60" />
      <div
        className="attendance-modal-drawer relative w-full max-w-3xl h-full bg-brown-900 overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {loading && !data ? (
          <div className="p-6 space-y-4">
            <div className="flex gap-4">
              <div className="w-12 h-12 bg-brown-800 animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-5 w-1/3 bg-brown-800 animate-pulse" />
                <div className="h-3 w-1/2 bg-brown-800/60 animate-pulse" />
              </div>
            </div>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-brown-800/40 animate-pulse" />
            ))}
          </div>
        ) : error || !data ? (
          <div className="p-8 text-red-400">{error ?? 'Not found'}</div>
        ) : (
          <ModalBody
            data={data}
            admins={admins}
            savingField={savingField}
            patch={patch}
            syncAttend={syncAttend}
            deleteCandidate={deleteCandidate}
            onClose={onClose}
            onAppendComms={(entry) => setData((d) => d ? { ...d, commsEntries: [entry, ...d.commsEntries] } : d)}
            onDeleteComms={(id) => setData((d) => d ? { ...d, commsEntries: d.commsEntries.filter((c) => c.id !== id) } : d)}
            onMutatedNotes={onMutated}
            showAudit={showAudit}
            setShowAudit={setShowAudit}
          />
        )}
      </div>
      {confirmingDelete ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center" onClick={() => setConfirmingDelete(false)}>
          <div className="attendance-modal-backdrop absolute inset-0 bg-black/70" />
          <div className="attendance-modal-drawer relative bg-brown-900 outline outline-1 outline-cream-200/15 shadow-[0_8px_24px_rgba(0,0,0,0.5)] p-5 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="text-cream-50 text-sm font-medium mb-1">Remove this candidate?</div>
            <div className="text-cream-300 text-xs mb-4">Notes and comms log will be permanently deleted.</div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmingDelete(false)} className="text-xs uppercase tracking-widest font-medium text-cream-200 hover:text-cream-50 bg-brown-800 px-3 py-2 cursor-pointer">Cancel</button>
              <button onClick={performDelete} className="text-xs uppercase tracking-widest font-medium text-red-300 bg-red-500/20 hover:bg-red-500/30 px-3 py-2 cursor-pointer">Remove</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ModalBody({
  data,
  admins,
  savingField,
  patch,
  syncAttend,
  deleteCandidate,
  onClose,
  onAppendComms,
  onDeleteComms,
  onMutatedNotes,
  showAudit,
  setShowAudit,
}: Readonly<{
  data: CandidateDetail;
  admins: AdminUser[];
  savingField: string | null;
  patch: (p: Record<string, unknown>, field: string) => Promise<void>;
  syncAttend: () => Promise<void>;
  deleteCandidate: () => Promise<void>;
  onClose: () => void;
  onAppendComms: (entry: CommsEntry) => void;
  onDeleteComms: (id: string) => void;
  onMutatedNotes: () => void;
  showAudit: boolean;
  setShowAudit: (v: boolean) => void;
}>) {
  const c = data.candidate;
  return (
    <>
      {/* Header */}
      <div className="sticky top-0 z-10 bg-brown-800 border-b border-cream-200/10 px-6 py-4 flex items-start gap-4">
        <Avatar name={c.name} email={c.email} image={c.image} size={48} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-cream-50 text-lg font-medium truncate">{c.name ?? c.email ?? 'Unknown'}</h2>
            <StatusPill status={c.outreachStatus} size="md" />
            {c.attendInvited ? <FlagPill label="Attend ✓" tone="positive" /> : null}
            {c.attendFlightBooked ? <FlagPill label="Flight ✓" tone="positive" /> : null}
            {c.snoozedUntil && new Date(c.snoozedUntil) > new Date() ? (
              <FlagPill label={`Snoozed → ${new Date(c.snoozedUntil).toLocaleDateString()}`} tone="snooze" />
            ) : null}
            {c.isExternal ? <FlagPill label="External" /> : null}
          </div>
          <div className="text-xs text-cream-300 mt-1 flex items-center gap-3 flex-wrap">
            {c.email ? <span>{c.email}</span> : null}
            {c.slackId ? (
              <a
                href={`https://hackclub.enterprise.slack.com/team/${c.slackId}`}
                target="_blank"
                rel="noreferrer"
                className="text-orange-400 hover:text-orange-300"
              >{c.slackId}</a>
            ) : null}
            {c.pronouns ? <span>{c.pronouns}</span> : null}
            {c.userId ? (
              <Link href={`/admin/users?search=${encodeURIComponent(c.email ?? '')}`} className="text-orange-400 hover:text-orange-300">
                user record →
              </Link>
            ) : null}
          </div>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 text-cream-300 hover:text-cream-50 hover:bg-black/20 transition-[color,background-color] duration-150 text-2xl leading-none cursor-pointer w-8 h-8 inline-flex items-center justify-center"
          aria-label="Close"
        >×</button>
      </div>

      <div className="px-6 py-6 space-y-6">
        {/* Pipeline controls */}
        <Section title="Pipeline">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Outreach status">
              <ColorSelect
                value={c.outreachStatus}
                onChange={(v) => patch({ outreachStatus: v }, 'outreachStatus')}
                disabled={savingField === 'outreachStatus'}
                fullWidth
                size="md"
                options={STATUS_OPTIONS.map((s) => ({
                  value: s,
                  label: STATUS_LABEL[s],
                  color: STATUS_COLOR[s],
                }))}
              />
            </Field>
            <Field label="Owner">
              <ColorSelect
                value={c.ownerId ?? ''}
                onChange={(v) => patch({ ownerId: v || null }, 'ownerId')}
                disabled={savingField === 'ownerId'}
                fullWidth
                size="md"
                options={[
                  { value: '', label: '— unassigned —', color: 'brown' },
                  ...admins.map((a) => ({
                    value: a.id,
                    label: a.name ?? a.email,
                    color: ownerColor(a.id),
                    hint: a.name ? a.email : undefined,
                  })),
                ]}
              />
            </Field>
            <Field label="Snooze until">
              <div className="flex gap-2">
                <input
                  type="date"
                  value={c.snoozedUntil ? c.snoozedUntil.slice(0, 10) : ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    patch({ snoozedUntil: v ? new Date(v).toISOString() : null }, 'snoozedUntil');
                  }}
                  disabled={savingField === 'snoozedUntil'}
                  className="flex-1 bg-brown-800 text-cream-50 text-sm px-2 py-1.5 outline-none focus:ring-2 focus:ring-orange-500/60 focus:ring-inset"
                />
                {c.snoozedUntil ? (
                  <button
                    onClick={() => patch({ snoozedUntil: null }, 'snoozedUntil')}
                    className="text-xs text-cream-300 hover:text-cream-50 px-3 py-2 cursor-pointer"
                  >Clear</button>
                ) : null}
              </div>
            </Field>
            <Field label="Flake note">
              <FlakeNoteInput
                value={c.flakeNote}
                onSave={(v) => patch({ flakeNote: v || null }, 'flakeNote')}
                saving={savingField === 'flakeNote'}
              />
            </Field>
          </div>
        </Section>

        {/* Comms log */}
        <Section title="Communications log" right={<span className="text-xs uppercase tracking-widest text-cream-300 font-medium tabular-nums">{data.commsEntries.length} entries</span>}>
          <CommsLog
            candidateId={c.id}
            entries={data.commsEntries}
            onAppend={onAppendComms}
            onDelete={onDeleteComms}
          />
        </Section>

        {/* Notes (free blob) */}
        <Section title="Notes">
          <NotesField
            value={c.notes}
            onSave={(v) => patch({ notes: v || null }, 'notes').then(() => onMutatedNotes())}
            saving={savingField === 'notes'}
          />
        </Section>

        {/* Stasis effort panel */}
        {data.stasis ? (
          <Section title="Stasis activity">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm mb-3">
              <Stat label="Real bits" value={data.stasis.realBits} hint="design + build approvals only" />
              <Stat label="Hours claimed" value={data.stasis.totalHoursClaimed.toFixed(1)} hint="pre-deflation" />
              <Stat label="Projects" value={data.stasis.projects.length} />
              <Stat label="Admin grants" value={data.stasis.adminGrants} hint="manual bit grants" muted />
            </div>
            {data.stasis.projects.length === 0 ? (
              <div className="text-xs text-cream-300 italic">No projects yet.</div>
            ) : (
              <div className="flex flex-col gap-px bg-brown-900">
                {data.stasis.projects.map((p) => (
                  <a
                    key={p.id}
                    href={`/admin/projects/${p.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-3 px-3 py-2 bg-brown-800 hover:bg-orange-500/10 group"
                  >
                    <span className="text-xs text-cream-200 font-medium w-12 tabular-nums">T{p.tier ?? '–'}</span>
                    <span className="text-sm text-cream-50 group-hover:text-orange-400 flex-1 truncate">{p.title}</span>
                    <span className="text-xs text-cream-300 font-medium">{statusShort(p.designStatus, p.buildStatus)}</span>
                    <span className="text-xs text-cream-200 w-14 text-right tabular-nums">{p.hoursClaimed.toFixed(1)}h</span>
                  </a>
                ))}
              </div>
            )}
          </Section>
        ) : null}

        {/* Attend panel */}
        <Section
          title="Attend"
          right={
            <button
              onClick={syncAttend}
              disabled={savingField === 'attend'}
              className="text-xs uppercase tracking-widest font-medium text-orange-400 hover:text-orange-300 disabled:opacity-40 cursor-pointer px-3 py-2"
            >{savingField === 'attend' ? 'Syncing…' : 'Sync now'}</button>
          }
        >
          {!data.attend ? (
            <div className="text-xs text-cream-300 italic">
              {process.env.NEXT_PUBLIC_ATTEND_ENABLED === 'false'
                ? 'Attend integration disabled.'
                : 'No record found in Attend for this email.'}
            </div>
          ) : !data.attend.found ? (
            <div className="text-xs text-cream-300 italic">Not in Attend yet — invite still needed.</div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                <Stat label="Status" value={data.attend.status ?? '—'} />
                <Stat label="Invited" value={data.attend.invitedAt ? new Date(data.attend.invitedAt).toLocaleDateString() : '—'} muted />
                <Stat label="Onboarded" value={data.attend.confirmedAt ? new Date(data.attend.confirmedAt).toLocaleDateString() : '—'} muted />
                <Stat label="Checked in" value={data.attend.checkedInAt ? new Date(data.attend.checkedInAt).toLocaleDateString() : '—'} muted />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs text-cream-200">
                {data.attend.city ? <span><span className="text-cream-300">From:</span> {[data.attend.city, data.attend.state, data.attend.country].filter(Boolean).join(', ')}</span> : null}
                {data.attend.tshirtSize ? <span><span className="text-cream-300">Shirt:</span> {data.attend.tshirtSize}</span> : null}
                {data.attend.travel?.visaRequired ? <span><span className="text-cream-300">Visa:</span> {data.attend.travel.visaStatus ?? 'required'}</span> : null}
              </div>
              {data.attend.travel?.inbound ? (
                <div className="text-xs bg-brown-800 px-3 py-2.5">
                  <div className="text-cream-300 uppercase tracking-widest text-xs font-medium mb-1">Inbound flight</div>
                  <div className="text-cream-100">
                    {data.attend.travel.inbound.flightCode ?? '—'} · {data.attend.travel.inbound.departureAirport ?? '?'} → {data.attend.travel.inbound.arrivalAirport ?? '?'}
                    {data.attend.travel.inbound.confirmationCode ? <> · conf <span className="text-orange-400">{data.attend.travel.inbound.confirmationCode}</span></> : null}
                  </div>
                  {data.attend.travel.inbound.departureTime ? (
                    <div className="text-cream-300 mt-0.5 tabular-nums">{new Date(data.attend.travel.inbound.departureTime).toLocaleString()}</div>
                  ) : null}
                </div>
              ) : null}
              {data.attend.travel?.outbound ? (
                <div className="text-xs bg-brown-800 px-3 py-2.5">
                  <div className="text-cream-300 uppercase tracking-widest text-xs font-medium mb-1">Outbound flight</div>
                  <div className="text-cream-100">
                    {data.attend.travel.outbound.flightCode ?? '—'} · {data.attend.travel.outbound.departureAirport ?? '?'} → {data.attend.travel.outbound.arrivalAirport ?? '?'}
                    {data.attend.travel.outbound.confirmationCode ? <> · conf <span className="text-orange-400">{data.attend.travel.outbound.confirmationCode}</span></> : null}
                  </div>
                </div>
              ) : null}
            </div>
          )}
          {data.candidate.attendCachedAt ? (
            <div className="text-xs text-cream-300 mt-2">Last synced from Attend {relativeTime(data.candidate.attendCachedAt)}</div>
          ) : null}
        </Section>

        {/* Audit log (collapsed) */}
        <div>
          <button
            onClick={() => setShowAudit(!showAudit)}
            className="text-xs uppercase tracking-widest font-medium text-cream-300 hover:text-cream-100 cursor-pointer tabular-nums px-2 py-1 inline-flex items-center gap-1.5"
          >
            <span
              aria-hidden
              className={`text-[9px] leading-none transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${showAudit ? 'rotate-90' : ''}`}
            >▶</span>
            Audit log ({data.auditEntries.length})
          </button>
          {showAudit ? (
            <div className="mt-2 flex flex-col gap-px bg-brown-900 text-xs">
              {data.auditEntries.length === 0 ? (
                <div className="p-2 bg-brown-800 text-cream-300 italic">No changes recorded.</div>
              ) : data.auditEntries.map((a) => (
                <div key={a.id} className="px-3 py-1.5 bg-brown-800 flex items-center gap-2 text-cream-200">
                  <span className="text-cream-300 w-20 truncate">{a.actor?.name ?? a.actor?.email ?? 'system'}</span>
                  <span className="text-cream-100" title={a.field}>{auditFieldLabel(a.field)}</span>
                  <span className="text-cream-400">→</span>
                  <span className="text-cream-50 truncate flex-1">{auditValueLabel(a.field, a.newValue)}</span>
                  <span className="text-cream-300 text-xs tabular-nums">{relativeTime(a.createdAt)}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="pt-2 flex justify-end">
          <button
            onClick={deleteCandidate}
            className="text-xs uppercase tracking-widest font-medium text-red-300 bg-red-500/15 hover:bg-red-500/25 cursor-pointer px-3 py-2"
          >Remove from dashboard</button>
        </div>
      </div>
    </>
  );
}

function Section({ title, right, children }: Readonly<{ title: string; right?: React.ReactNode; children: React.ReactNode }>) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-orange-500 text-xs uppercase tracking-widest font-medium">{title}</h3>
        {right}
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <div>
      <label className="block text-xs uppercase tracking-widest text-cream-300 font-medium mb-1">{label}</label>
      {children}
    </div>
  );
}

function Stat({ label, value, hint, muted }: Readonly<{ label: string; value: string | number; hint?: string; muted?: boolean }>) {
  return (
    <div className={`bg-brown-800 px-2.5 py-1.5 ${muted ? 'opacity-70' : ''}`}>
      <div className="text-xs uppercase tracking-widest text-cream-300 font-medium">{label}</div>
      <div className="text-cream-50 text-sm font-medium mt-0.5 tabular-nums">{value}</div>
      {hint ? <div className="text-xs text-cream-300 mt-0.5">{hint}</div> : null}
    </div>
  );
}

function FlakeNoteInput({ value, onSave, saving }: Readonly<{ value: string | null; onSave: (v: string) => void; saving: boolean }>) {
  const [draft, setDraft] = useState(value ?? '');
  useEffect(() => { setDraft(value ?? ''); }, [value]);
  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { if (draft !== (value ?? '')) onSave(draft); }}
      placeholder="e.g. low confidence, parents undecided"
      disabled={saving}
      className="w-full bg-brown-800 text-cream-50 text-sm px-2 py-1.5 outline-none focus:ring-2 focus:ring-orange-500/60 focus:ring-inset"
    />
  );
}

function NotesField({ value, onSave, saving }: Readonly<{ value: string | null; onSave: (v: string) => void; saving: boolean }>) {
  const [draft, setDraft] = useState(value ?? '');
  const debouncedRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { setDraft(value ?? ''); }, [value]);
  useEffect(() => {
    if (debouncedRef.current) clearTimeout(debouncedRef.current);
    if (draft === (value ?? '')) return;
    debouncedRef.current = setTimeout(() => onSave(draft), 800);
    return () => { if (debouncedRef.current) clearTimeout(debouncedRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);
  return (
    <textarea
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      placeholder="Free-form notes — anything that doesn't fit elsewhere."
      rows={4}
      disabled={saving}
      className="w-full bg-brown-800 text-cream-50 text-sm px-3 py-2 outline-none focus:ring-2 focus:ring-orange-500/60 focus:ring-inset resize-y"
    />
  );
}

const AUDIT_FIELD_LABEL: Record<string, string> = {
  outreachStatus: 'Status',
  ownerId: 'Owner',
  snoozedUntil: 'Snoozed until',
  flakeNote: 'Flake note',
  notes: 'Notes',
  attendInvited: 'Invited in Attend',
  attendFlightBooked: 'Flight booked',
  pronouns: 'Pronouns',
  eventPreference: 'Goal',
};
function auditFieldLabel(field: string): string {
  return AUDIT_FIELD_LABEL[field] ?? field;
}
function auditValueLabel(field: string, value: string | null): string {
  if (value === null || value === '') return '∅';
  if (field === 'outreachStatus' && value in STATUS_LABEL) {
    return STATUS_LABEL[value as AttendanceStatus];
  }
  return value;
}

function statusShort(design: string, build: string): string {
  if (build === 'approved') return 'Built';
  if (build === 'in_review') return 'Build review';
  if (design === 'approved') return 'Design ✓';
  if (design === 'in_review') return 'Design review';
  if (design === 'rejected') return 'Design rejected';
  if (design === 'draft' || design === 'not_submitted') return 'Design draft';
  return design;
}
