'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { Avatar } from './Avatar';
import { StatusPill, FlagPill } from './StatusPill';
import { CommsLog, type CommsEntry } from './CommsLog';
import { AttendanceStatus, STATUS_LABEL, AdminUser, relativeTime } from '../lib/types';

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
    if (!confirm('Permanently remove this candidate from the dashboard? Notes and comms log will be deleted.')) return;
    const res = await fetch(`/api/admin/attendance/${candidateId}`, { method: 'DELETE' });
    if (res.ok) {
      onMutated();
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative w-full max-w-3xl h-full bg-brown-900 border-l border-brown-700 overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {loading && !data ? (
          <div className="p-8 text-cream-200">Loading…</div>
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
      <div className="sticky top-0 z-10 bg-brown-900 border-b border-brown-700 px-6 py-4 flex items-start gap-4">
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
          className="text-cream-300 hover:text-cream-50 text-2xl leading-none cursor-pointer"
          aria-label="Close"
        >×</button>
      </div>

      <div className="px-6 py-6 space-y-6">
        {/* Pipeline controls */}
        <Section title="Pipeline">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Outreach status">
              <select
                value={c.outreachStatus}
                onChange={(e) => patch({ outreachStatus: e.target.value }, 'outreachStatus')}
                disabled={savingField === 'outreachStatus'}
                className="w-full bg-brown-800 border border-brown-700 text-cream-50 text-sm px-2 py-1.5 focus:outline-none focus:border-orange-500"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                ))}
              </select>
            </Field>
            <Field label="Owner">
              <select
                value={c.ownerId ?? ''}
                onChange={(e) => patch({ ownerId: e.target.value || null }, 'ownerId')}
                disabled={savingField === 'ownerId'}
                className="w-full bg-brown-800 border border-brown-700 text-cream-50 text-sm px-2 py-1.5 focus:outline-none focus:border-orange-500"
              >
                <option value="">— unassigned —</option>
                {admins.map((a) => (
                  <option key={a.id} value={a.id}>{a.name ?? a.email}</option>
                ))}
              </select>
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
                  className="flex-1 bg-brown-800 border border-brown-700 text-cream-50 text-sm px-2 py-1.5 focus:outline-none focus:border-orange-500"
                />
                {c.snoozedUntil ? (
                  <button
                    onClick={() => patch({ snoozedUntil: null }, 'snoozedUntil')}
                    className="text-xs text-cream-300 hover:text-cream-50 px-2 cursor-pointer"
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
        <Section title="Communications log" right={<span className="text-[10px] uppercase tracking-wider text-cream-400">{data.commsEntries.length} entries</span>}>
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
              <Stat label="Admin grants" value={data.stasis.adminGrants} muted />
            </div>
            {data.stasis.projects.length === 0 ? (
              <div className="text-xs text-cream-400 italic">No projects yet.</div>
            ) : (
              <div className="border border-brown-700 divide-y divide-brown-700">
                {data.stasis.projects.map((p) => (
                  <a
                    key={p.id}
                    href={`/admin/projects/${p.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-3 px-3 py-2 hover:bg-brown-800/40 group"
                  >
                    <span className="text-xs text-cream-300 w-12">T{p.tier ?? '–'}</span>
                    <span className="text-sm text-cream-50 group-hover:text-orange-400 flex-1 truncate">{p.title}</span>
                    <span className="text-[10px] uppercase tracking-wider text-cream-300">{statusShort(p.designStatus, p.buildStatus)}</span>
                    <span className="text-xs text-cream-300 w-14 text-right">{p.hoursClaimed.toFixed(1)}h</span>
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
              className="text-[10px] uppercase tracking-wider text-orange-400 hover:text-orange-300 disabled:opacity-40 cursor-pointer"
            >{savingField === 'attend' ? 'Syncing…' : 'Sync now'}</button>
          }
        >
          {!data.attend ? (
            <div className="text-xs text-cream-400 italic">
              {process.env.NEXT_PUBLIC_ATTEND_ENABLED === 'false'
                ? 'Attend integration disabled.'
                : 'No record found in Attend for this email.'}
            </div>
          ) : !data.attend.found ? (
            <div className="text-xs text-cream-400 italic">Not in Attend yet — invite still needed.</div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                <Stat label="Status" value={data.attend.status ?? '—'} />
                <Stat label="Invited" value={data.attend.invitedAt ? new Date(data.attend.invitedAt).toLocaleDateString() : '—'} muted />
                <Stat label="Onboarded" value={data.attend.confirmedAt ? new Date(data.attend.confirmedAt).toLocaleDateString() : '—'} muted />
                <Stat label="Checked in" value={data.attend.checkedInAt ? new Date(data.attend.checkedInAt).toLocaleDateString() : '—'} muted />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs text-cream-200">
                {data.attend.city ? <span><span className="text-cream-400">From:</span> {[data.attend.city, data.attend.state, data.attend.country].filter(Boolean).join(', ')}</span> : null}
                {data.attend.tshirtSize ? <span><span className="text-cream-400">Shirt:</span> {data.attend.tshirtSize}</span> : null}
                {data.attend.travel?.visaRequired ? <span><span className="text-cream-400">Visa:</span> {data.attend.travel.visaStatus ?? 'required'}</span> : null}
              </div>
              {data.attend.travel?.inbound ? (
                <div className="text-xs border-t border-brown-700/60 pt-2">
                  <div className="text-cream-400 uppercase tracking-wider text-[10px] mb-1">Inbound flight</div>
                  <div className="text-cream-100">
                    {data.attend.travel.inbound.flightCode ?? '—'} · {data.attend.travel.inbound.departureAirport ?? '?'} → {data.attend.travel.inbound.arrivalAirport ?? '?'}
                    {data.attend.travel.inbound.confirmationCode ? <> · conf <span className="text-orange-400">{data.attend.travel.inbound.confirmationCode}</span></> : null}
                  </div>
                  {data.attend.travel.inbound.departureTime ? (
                    <div className="text-cream-400 mt-0.5">{new Date(data.attend.travel.inbound.departureTime).toLocaleString()}</div>
                  ) : null}
                </div>
              ) : null}
              {data.attend.travel?.outbound ? (
                <div className="text-xs border-t border-brown-700/60 pt-2">
                  <div className="text-cream-400 uppercase tracking-wider text-[10px] mb-1">Outbound flight</div>
                  <div className="text-cream-100">
                    {data.attend.travel.outbound.flightCode ?? '—'} · {data.attend.travel.outbound.departureAirport ?? '?'} → {data.attend.travel.outbound.arrivalAirport ?? '?'}
                    {data.attend.travel.outbound.confirmationCode ? <> · conf <span className="text-orange-400">{data.attend.travel.outbound.confirmationCode}</span></> : null}
                  </div>
                </div>
              ) : null}
            </div>
          )}
          {data.candidate.attendCachedAt ? (
            <div className="text-[10px] text-cream-400 mt-2">Cached badge updated {relativeTime(data.candidate.attendCachedAt)}</div>
          ) : null}
        </Section>

        {/* Audit log (collapsed) */}
        <div>
          <button
            onClick={() => setShowAudit(!showAudit)}
            className="text-[10px] uppercase tracking-wider text-cream-400 hover:text-cream-200 cursor-pointer"
          >
            {showAudit ? '▾' : '▸'} Audit log ({data.auditEntries.length})
          </button>
          {showAudit ? (
            <div className="mt-2 border border-brown-700 divide-y divide-brown-700 text-xs">
              {data.auditEntries.length === 0 ? (
                <div className="p-2 text-cream-400 italic">No changes recorded.</div>
              ) : data.auditEntries.map((a) => (
                <div key={a.id} className="px-3 py-1.5 flex items-center gap-2 text-cream-200">
                  <span className="text-cream-400 w-20 truncate">{a.actor?.name ?? a.actor?.email ?? 'system'}</span>
                  <span className="text-cream-300">{a.field}</span>
                  <span className="text-cream-400">→</span>
                  <span className="text-cream-100 truncate flex-1">{a.newValue ?? '∅'}</span>
                  <span className="text-cream-400 text-[10px]">{relativeTime(a.createdAt)}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="border-t border-brown-700 pt-4 flex justify-end">
          <button
            onClick={deleteCandidate}
            className="text-xs text-red-400 hover:text-red-300 cursor-pointer"
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
        <h3 className="text-orange-500 text-xs uppercase tracking-widest">{title}</h3>
        {right}
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-wider text-cream-400 mb-1">{label}</label>
      {children}
    </div>
  );
}

function Stat({ label, value, hint, muted }: Readonly<{ label: string; value: string | number; hint?: string; muted?: boolean }>) {
  return (
    <div className={`border border-brown-700 px-2.5 py-1.5 ${muted ? 'opacity-70' : ''}`}>
      <div className="text-[10px] uppercase tracking-wider text-cream-400">{label}</div>
      <div className="text-cream-50 text-sm mt-0.5">{value}</div>
      {hint ? <div className="text-[9px] text-cream-400 mt-0.5">{hint}</div> : null}
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
      className="w-full bg-brown-800 border border-brown-700 text-cream-50 text-sm px-2 py-1.5 focus:outline-none focus:border-orange-500"
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
      className="w-full bg-brown-800 border border-brown-700 text-cream-50 text-sm px-3 py-2 focus:outline-none focus:border-orange-500 resize-y"
    />
  );
}

function statusShort(design: string, build: string): string {
  if (build === 'approved') return 'BUILT';
  if (build === 'in_review') return 'BUILD REV';
  if (design === 'approved') return 'DSGN ✓';
  if (design === 'in_review') return 'DSGN REV';
  return design.toUpperCase();
}
