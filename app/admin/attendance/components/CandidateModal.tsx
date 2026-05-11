'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { Avatar } from './Avatar';
import { StatusPill, FlagPill } from './StatusPill';
import { CommsLog, type CommsEntry } from './CommsLog';
import { ColorSelect, SelectColor } from './ColorSelect';
import { SourceBadge } from './SourceBadge';
import { AttendanceStatus, AttendanceCandidateSource, STATUS_LABEL, SOURCE_FULL_LABEL, AdminUser, DerivedStats, DecryptedUserAddress, relativeTime, formatDollars, ownerColor } from '../lib/types';

const STATUS_COLOR: Record<AttendanceStatus, SelectColor> = {
  IDENTIFIED: 'cream',
  CONTACTED: 'orange',
  SOFT_YES: 'yellow',
  CONFIRMED_YES: 'green',
  BOOKED_FLIGHT: 'emerald',
  DECLINED: 'red',
  SHELVED: 'brown',
};

const SOURCE_COLOR: Record<AttendanceCandidateSource, SelectColor> = {
  STASIS_USER: 'orange',
  REVIEWER_INCENTIVE: 'purple',
  EXTERNAL_HC: 'blue',
  DISCRETION: 'cream',
};


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
    outreachStatus: AttendanceStatus;
    source: AttendanceCandidateSource;
    ownerId: string | null;
    owner: { id: string; name: string | null; email: string; image: string | null } | null;
    invitedAt: string | null;
    isGirl: boolean | null;
    homeAirport: string | null;
    homeStreet: string | null;
    homeCity: string | null;
    homeState: string | null;
    homeZip: string | null;
    homeCountry: string | null;
    userAddress: DecryptedUserAddress | null;
    attendCity: string | null;
    attendState: string | null;
    attendCountry: string | null;
    flightCostEstimateCents: number | null;
    flightCostUpdatedAt: string | null;
    flightStipendCents: number | null;
    stipendStatus: string | null;
    stipendAirtableUrl: string;
    notes: string | null;
    sourcingReason: string | null;
    attendInvited: boolean;
    attendOnboardingStarted: boolean;
    attendFlightBooked: boolean;
    attendStatus: string | null;
    attendCachedAt: string | null;
    isExternal: boolean;
    createdAt: string;
    updatedAt: string;
  };
  derivedStats: DerivedStats;
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

const STATUS_OPTIONS: AttendanceStatus[] = ['IDENTIFIED', 'CONTACTED', 'SOFT_YES', 'CONFIRMED_YES', 'BOOKED_FLIGHT', 'DECLINED', 'SHELVED'];
const SOURCE_OPTIONS: AttendanceCandidateSource[] = ['STASIS_USER', 'REVIEWER_INCENTIVE', 'EXTERNAL_HC', 'DISCRETION'];
const GIRL_OPTIONS: Array<{ value: string; label: string; color: SelectColor }> = [
  { value: 'unknown', label: 'Unknown', color: 'cream' },
  { value: 'true', label: 'Yes — counts', color: 'pink' },
  { value: 'false', label: 'No', color: 'brown' },
];

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
  const [attendSync, setAttendSync] = useState<{ syncing: boolean; error: string | null }>({ syncing: false, error: null });
  const attendSyncAbortRef = useRef<AbortController | null>(null);

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

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

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
    // Cancel any in-flight sync for this candidate (handles double-clicks).
    attendSyncAbortRef.current?.abort();
    const ctrl = new AbortController();
    attendSyncAbortRef.current = ctrl;
    setAttendSync({ syncing: true, error: null });
    try {
      const res = await fetch(`/api/admin/attendance/${candidateId}/attend-sync`, {
        method: 'POST',
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Sync failed (${res.status})`);
      }
      // Optimistically advance the cached timestamp so "Last synced …" jumps
      // forward even before the full reload finishes.
      setData((prev) => prev ? {
        ...prev,
        candidate: { ...prev.candidate, attendCachedAt: new Date().toISOString() },
      } : prev);
      await load();
      onMutated();
      setAttendSync({ syncing: false, error: null });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setAttendSync({ syncing: false, error: err instanceof Error ? err.message : 'Sync failed' });
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
              <div className="w-12 h-12 bg-cream-600/25 animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-5 w-1/3 bg-cream-600/25 animate-pulse" />
                <div className="h-3 w-1/2 bg-cream-600/20 animate-pulse" />
              </div>
            </div>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-cream-600/15 animate-pulse" />
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
            attendSync={attendSync}
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
  attendSync,
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
  attendSync: { syncing: boolean; error: string | null };
  onClose: () => void;
  onAppendComms: (entry: CommsEntry) => void;
  onDeleteComms: (id: string) => void;
  onMutatedNotes: () => void;
  showAudit: boolean;
  setShowAudit: (v: boolean) => void;
}>) {
  const c = data.candidate;
  const ds = data.derivedStats;
  return (
    <>
      <div className="sticky top-0 z-10 bg-brown-800 border-b border-cream-200/10 px-6 py-4 flex items-start gap-4">
        <Avatar name={c.name} email={c.email} image={c.image} size={48} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-cream-50 text-lg font-medium truncate">{c.name ?? c.email ?? 'Unknown'}</h2>
            <StatusPill status={c.outreachStatus} size="md" />
            <SourceBadge source={c.source} />
            {c.isGirl ? <FlagPill label="♀ Girl" tone="positive" title="Counts toward girl target" /> : null}
            {c.attendInvited ? <FlagPill label="Attend ✓" tone="positive" /> : null}
            {c.attendFlightBooked ? <FlagPill label="Flight ✓" tone="positive" /> : null}
            {c.isExternal ? <FlagPill label="External" /> : null}
          </div>
          <div className="text-xs text-cream-300 mt-1 flex items-center gap-3 flex-wrap">
            {c.email ? (
              <CopyableEmail email={c.email} />
            ) : c.isExternal ? (
              <InlineEmailEdit
                onSave={(v) => patch({ externalEmail: v }, 'externalEmail')}
                saving={savingField === 'externalEmail'}
              />
            ) : (
              <span className="italic text-cream-400">No email saved</span>
            )}
            {c.slackId ? (
              <a
                href={`https://hackclub.enterprise.slack.com/team/${c.slackId}`}
                target="_blank"
                rel="noreferrer"
                className="text-orange-400 hover:text-orange-300"
              >{c.slackId}</a>
            ) : null}
            {c.pronouns ? <span>{c.pronouns}</span> : null}
            {c.invitedAt ? <span>invited {relativeTime(c.invitedAt)}</span> : null}
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
        {/* Pipeline */}
        <Section title="Pipeline">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Outreach status">
              <ColorSelect
                value={c.outreachStatus}
                onChange={(v) => patch({ outreachStatus: v }, 'outreachStatus')}
                disabled={savingField === 'outreachStatus'}
                fullWidth size="md"
                options={STATUS_OPTIONS.map((s) => ({ value: s, label: STATUS_LABEL[s], color: STATUS_COLOR[s] }))}
              />
            </Field>
            <Field label="Source">
              <ColorSelect
                value={c.source}
                onChange={(v) => patch({ source: v }, 'source')}
                disabled={savingField === 'source'}
                fullWidth size="md"
                options={SOURCE_OPTIONS.map((s) => ({ value: s, label: SOURCE_FULL_LABEL[s], color: SOURCE_COLOR[s] }))}
              />
            </Field>
            <Field label="Owner">
              <ColorSelect
                value={c.ownerId ?? ''}
                onChange={(v) => patch({ ownerId: v || null }, 'ownerId')}
                disabled={savingField === 'ownerId'}
                fullWidth size="md"
                options={[
                  { value: '', label: '— unassigned —', color: 'brown' },
                  ...admins.map((a) => ({
                    value: a.id, label: a.name ?? a.email, color: ownerColor(a.id, admins),
                    hint: a.name ? a.email : undefined,
                  })),
                ]}
              />
            </Field>
            <Field label="Counts toward girl target?">
              <ColorSelect
                value={c.isGirl === null ? 'unknown' : c.isGirl ? 'true' : 'false'}
                onChange={(v) => patch({ isGirl: v === 'unknown' ? null : v === 'true' }, 'isGirl')}
                disabled={savingField === 'isGirl'}
                fullWidth size="md"
                options={GIRL_OPTIONS}
              />
            </Field>
          </div>
        </Section>

        {/* Notes — single free-form field, sits directly below pipeline */}
        <Section title="Notes">
          <NotesField
            value={c.notes}
            onSave={(v) => patch({ notes: v || null }, 'notes').then(() => onMutatedNotes())}
            saving={savingField === 'notes'}
          />
        </Section>

        {/* Address — home address (Stasis user → fallback to Attend → manual override) */}
        <Section title="Address" right={<AddressSourceHint candidate={c} />}>
          <ResolvedAddressBanner candidate={c} />
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 mt-3 items-end">
            <div className="col-span-2 sm:col-span-3">
              <Field label="Street">
                <SmallTextInput
                  value={c.homeStreet}
                  placeholder={c.userAddress?.street ?? '15 Falls Rd'}
                  onSave={(v) => patch({ homeStreet: v || null }, 'homeStreet')}
                  saving={savingField === 'homeStreet'}
                  maxLength={300}
                />
              </Field>
            </div>
            <div className="col-span-2 sm:col-span-2">
              <Field label="City">
                <SmallTextInput
                  value={c.homeCity}
                  placeholder={c.userAddress?.city ?? c.attendCity ?? 'San Francisco'}
                  onSave={(v) => patch({ homeCity: v || null }, 'homeCity')}
                  saving={savingField === 'homeCity'}
                  maxLength={200}
                />
              </Field>
            </div>
            <Field label="State / region">
              <SmallTextInput
                value={c.homeState}
                placeholder={c.userAddress?.state ?? c.attendState ?? 'CA'}
                onSave={(v) => patch({ homeState: v || null }, 'homeState')}
                saving={savingField === 'homeState'}
                maxLength={100}
              />
            </Field>
            <Field label="ZIP / postal">
              <SmallTextInput
                value={c.homeZip}
                placeholder={c.userAddress?.zip ?? '94025'}
                onSave={(v) => patch({ homeZip: v || null }, 'homeZip')}
                saving={savingField === 'homeZip'}
                maxLength={30}
              />
            </Field>
            <div className="col-span-2 sm:col-span-2">
              <Field label="Country">
                <SmallTextInput
                  value={c.homeCountry}
                  placeholder={c.userAddress?.country ?? c.attendCountry ?? 'United States'}
                  onSave={(v) => patch({ homeCountry: v || null }, 'homeCountry')}
                  saving={savingField === 'homeCountry'}
                  maxLength={100}
                />
              </Field>
            </div>
            <Field label="Home airport (IATA)">
              <SmallTextInput
                value={c.homeAirport}
                placeholder="SFO"
                onSave={(v) => patch({ homeAirport: v.toUpperCase() || null }, 'homeAirport')}
                saving={savingField === 'homeAirport'}
                maxLength={8}
              />
            </Field>
          </div>
        </Section>

        {/* Logistics — flight cost / stipend */}
        <Section title="Logistics">
          <div className="grid grid-cols-2 gap-3 items-end">
            <Field label="Flight price ($)">
              <DollarInput
                cents={c.flightCostEstimateCents}
                onSave={(cents) => patch({ flightCostEstimateCents: cents }, 'flightCostEstimateCents')}
                saving={savingField === 'flightCostEstimateCents'}
              />
            </Field>
            <Field label="Flight stipend ($)">
              <StipendReadout
                cents={c.flightStipendCents}
                status={c.stipendStatus}
                airtableUrl={c.stipendAirtableUrl}
              />
            </Field>
          </div>
          <LogisticsSummary
            estimateCents={c.flightCostEstimateCents}
            stipendCents={c.flightStipendCents}
            updatedAt={c.flightCostUpdatedAt}
            attendCity={data.attend?.city}
            attendState={data.attend?.state}
            attendCountry={data.attend?.country}
          />
        </Section>

        {/* Comms log */}
        <Section title="Communication log" right={<span className="text-xs uppercase tracking-widest text-cream-300 font-medium tabular-nums">{data.commsEntries.length} entries</span>}>
          <CommsLog
            candidateId={c.id}
            entries={data.commsEntries}
            onAppend={onAppendComms}
            onDelete={onDeleteComms}
          />
        </Section>

        {/* Stasis activity */}
        <Section title="Stasis activity">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-sm mb-3">
            <Stat label="Real bits" value={ds.realBits} hint="design + build approvals" />
            <Stat label="Hours" value={ds.totalHoursClaimed.toFixed(1)} hint="pre-deflation" />
            <Stat label="Projects" value={ds.projectsSubmitted} hint={`${ds.projectsApproved} approved`} />
            <Stat label="Top tier" value={ds.topProjectTier ?? '—'} />
            {ds.reviewerWeekCount != null ? (
              <Stat label="Reviews this wk" value={`${ds.reviewerWeekCount}/30`} hint="since 5/5 11AM EST" />
            ) : data.stasis ? (
              <Stat label="Admin grants" value={data.stasis.adminGrants} hint="manual" muted />
            ) : null}
          </div>
          {data.stasis && data.stasis.projects.length > 0 ? (
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
          ) : c.userId ? (
            <div className="text-xs text-cream-300 italic">No projects yet.</div>
          ) : (
            <div className="text-xs text-cream-300 italic">External candidate — no Stasis data.</div>
          )}
        </Section>

        {/* Attend */}
        <Section
          title="Attend"
          right={
            <button
              onClick={syncAttend}
              disabled={attendSync.syncing}
              className="text-xs uppercase tracking-widest font-medium text-orange-400 hover:text-orange-300 disabled:opacity-40 cursor-pointer px-3 py-2"
            >{attendSync.syncing ? 'Syncing…' : 'Sync now'}</button>
          }
        >
          {attendSync.error ? (
            <div className="text-xs text-red-400 mb-2">{attendSync.error}</div>
          ) : null}
          {process.env.NEXT_PUBLIC_ATTEND_ENABLED === 'false' ? (
            <div className="text-xs text-cream-300 italic">Attend integration disabled.</div>
          ) : !data.attend?.found && data.candidate.attendInvited ? (
            <div className="bg-yellow-500/10 border-l-2 border-yellow-500/40 px-3 py-2.5">
              <div className="text-xs uppercase tracking-widest text-yellow-300 font-medium mb-1">Invited — waiting for them to start onboarding</div>
              <div className="text-xs text-cream-200">
                {data.candidate.invitedAt ? <>Invitation sent {relativeTime(data.candidate.invitedAt)} ({new Date(data.candidate.invitedAt).toLocaleDateString()}). </> : null}
                They&apos;ll appear here once they click the link in their invite email.
              </div>
            </div>
          ) : !data.attend?.found ? (
            <div className="text-xs text-cream-300 italic">Not yet invited — use Send Attend invite when ready.</div>
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

        {/* Sourcing reason — set at bulk-import time, read-only */}
        {c.sourcingReason ? (
          <Section title="Why they were added">
            <div className="bg-brown-800 px-3 py-2.5 text-sm text-cream-100 whitespace-pre-wrap leading-relaxed">
              {c.sourcingReason}
            </div>
          </Section>
        ) : null}

        {/* Audit log */}
        <div>
          <button
            onClick={() => setShowAudit(!showAudit)}
            className="text-xs uppercase tracking-widest font-medium text-cream-300 hover:text-cream-100 cursor-pointer tabular-nums px-2 py-1 inline-flex items-center gap-1.5"
          >
            <span aria-hidden className={`text-xs leading-none transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${showAudit ? 'rotate-90' : ''}`}>▶</span>
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

        <div className="pt-2 flex justify-end gap-2">
          <button
            onClick={() => patch({ outreachStatus: 'SHELVED' }, 'outreachStatus')}
            disabled={c.outreachStatus === 'SHELVED' || savingField === 'outreachStatus'}
            className="text-xs uppercase tracking-widest font-medium text-cream-100 bg-brown-800 hover:bg-orange-500/15 hover:text-orange-300 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer px-3 py-2 transition-[background-color,color] duration-150"
          >Move to shelved</button>
          <button
            onClick={() => patch({ outreachStatus: 'DECLINED' }, 'outreachStatus')}
            disabled={c.outreachStatus === 'DECLINED' || savingField === 'outreachStatus'}
            className="text-xs uppercase tracking-widest font-medium text-cream-100 bg-brown-800 hover:bg-orange-500/15 hover:text-orange-300 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer px-3 py-2 transition-[background-color,color] duration-150"
          >Move to declined</button>
        </div>
      </div>
    </>
  );
}

/** Click-to-copy email pill. Shows a brief "Copied" state on success. */
function CopyableEmail({ email }: Readonly<{ email: string }>) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch { /* clipboard blocked — fall through silently */ }
  }
  return (
    <button
      type="button"
      onClick={copy}
      title={copied ? 'Copied!' : 'Click to copy'}
      className={`group inline-flex items-center gap-1.5 cursor-pointer transition-[color] duration-150 ${copied ? 'text-green-400' : 'text-cream-300 hover:text-cream-50'}`}
    >
      <span>{email}</span>
      <span aria-hidden className="text-xs opacity-0 group-hover:opacity-100 transition-opacity duration-150">
        {copied ? '✓' : '⧉'}
      </span>
    </button>
  );
}

/** Click-to-edit placeholder for missing external email. */
function InlineEmailEdit({ onSave, saving }: Readonly<{
  onSave: (v: string) => Promise<void> | void;
  saving: boolean;
}>) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function cancel() {
    setEditing(false);
    setDraft('');
  }

  async function commit() {
    const v = draft.trim();
    if (!v) { cancel(); return; }
    await onSave(v);
    cancel();
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        title="Click to set email"
        className="italic text-cream-400 hover:text-cream-50 cursor-pointer transition-[color] duration-150"
      >
        No email saved
      </button>
    );
  }

  return (
    <input
      ref={inputRef}
      type="email"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        if (e.key === 'Escape') { e.preventDefault(); cancel(); }
      }}
      placeholder="email@example.com"
      disabled={saving}
      maxLength={200}
      className="bg-brown-700 text-cream-50 text-xs px-2 py-1 outline-none focus:ring-2 focus:ring-orange-500/60 focus:ring-inset min-w-64"
    />
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

function SmallTextInput({ value, placeholder, onSave, saving, maxLength }: Readonly<{ value: string | null; placeholder?: string; onSave: (v: string) => void; saving: boolean; maxLength: number }>) {
  const [draft, setDraft] = useState(value ?? '');
  useEffect(() => { setDraft(value ?? ''); }, [value]);
  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { if (draft.trim() !== (value ?? '')) onSave(draft.trim()); }}
      placeholder={placeholder}
      disabled={saving}
      maxLength={maxLength}
      className="w-full bg-brown-800 text-cream-50 text-sm px-2 py-1.5 outline-none focus:ring-2 focus:ring-orange-500/60 focus:ring-inset"
    />
  );
}

function DollarInput({ cents, onSave, saving }: Readonly<{ cents: number | null; onSave: (cents: number | null) => void; saving: boolean }>) {
  const [draft, setDraft] = useState<string>(cents == null ? '' : String(Math.round(cents / 100)));
  useEffect(() => { setDraft(cents == null ? '' : String(Math.round(cents / 100))); }, [cents]);
  return (
    <input
      type="number"
      inputMode="numeric"
      min={0}
      step={1}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const n = draft.trim();
        if (n === '') {
          if (cents != null) onSave(null);
          return;
        }
        const num = parseInt(n, 10);
        if (!isFinite(num) || num < 0) return;
        const newCents = num * 100;
        if (newCents !== cents) onSave(newCents);
      }}
      placeholder="—"
      disabled={saving}
      className="w-full bg-brown-800 text-cream-50 text-sm px-2 py-1.5 outline-none focus:ring-2 focus:ring-orange-500/60 focus:ring-inset tabular-nums"
    />
  );
}

function StipendReadout({ cents, status, airtableUrl }: Readonly<{
  cents: number | null;
  status: string | null;
  airtableUrl: string;
}>) {
  const display = cents == null ? '—' : `$${Math.round(cents / 100).toLocaleString()}`;
  const isApproved = cents != null && cents > 0;
  return (
    <div className="bg-brown-800 px-2 py-1.5 flex items-center justify-between gap-2 min-h-[34px]">
      <div className="flex items-baseline gap-2 min-w-0">
        <span className={`text-sm font-medium tabular-nums ${isApproved ? 'text-orange-400' : 'text-cream-300'}`}>{display}</span>
        {status ? <span className="text-xs uppercase tracking-widest text-cream-300 font-medium truncate">{status}</span> : null}
      </div>
      <a
        href={airtableUrl}
        target="_blank"
        rel="noreferrer"
        className="shrink-0 text-xs uppercase tracking-widest text-orange-400 hover:text-orange-300 font-medium"
        title="Edit in Airtable — Need Based Stipends"
      >Edit in Airtable ↗</a>
    </div>
  );
}

/** Renders the resolved best-known address as a one-block readout, drawing
 * from candidate-level home* overrides first, then Stasis-user PII, then
 * Attend's cached city/state/country. Hides itself when there's nothing to
 * show. */
function ResolvedAddressBanner({ candidate }: Readonly<{ candidate: CandidateDetail['candidate'] }>) {
  const c = candidate;
  const street = c.homeStreet ?? c.userAddress?.street ?? null;
  const city = c.homeCity ?? c.userAddress?.city ?? c.attendCity ?? null;
  const state = c.homeState ?? c.userAddress?.state ?? c.attendState ?? null;
  const zip = c.homeZip ?? c.userAddress?.zip ?? null;
  const country = c.homeCountry ?? c.userAddress?.country ?? c.attendCountry ?? null;
  const cityRegion = [city, state].filter(Boolean).join(', ');
  const cityLine = [cityRegion, zip].filter(Boolean).join(' ');
  const lines = [street, cityLine, country].filter(Boolean);
  if (lines.length === 0 && !c.homeAirport) {
    return (
      <div className="text-xs text-cream-300 italic bg-brown-800 px-3 py-2.5">
        No address on file. {c.isExternal ? 'Fill in the fields below — externals don\'t come with HCA address PII.' : 'No HCA address either; ask the user to update it on hackclub.com or fill in below.'}
      </div>
    );
  }
  return (
    <div className="bg-brown-800 px-3 py-2.5 text-sm text-cream-50 flex flex-col gap-0.5 leading-snug">
      {lines.map((l, i) => <div key={i}>{l}</div>)}
      {c.homeAirport ? <div className="text-xs text-cream-300 mt-1 tabular-nums">Airport: {c.homeAirport}</div> : null}
    </div>
  );
}

/** Caption above the Address fields explaining where the displayed data is
 * coming from, since the source can be any of: candidate override, Stasis
 * user PII, or Attend cache. */
function AddressSourceHint({ candidate }: Readonly<{ candidate: CandidateDetail['candidate'] }>) {
  const c = candidate;
  const hasOverride = !!(c.homeStreet || c.homeCity || c.homeState || c.homeZip || c.homeCountry);
  const hasUserAddress = !!(c.userAddress && (c.userAddress.street || c.userAddress.city || c.userAddress.state || c.userAddress.zip || c.userAddress.country));
  const hasAttend = !!(c.attendCity || c.attendState || c.attendCountry);
  const sources: string[] = [];
  if (hasOverride) sources.push('manual override');
  if (!c.isExternal && hasUserAddress) sources.push('Stasis user');
  if (hasAttend) sources.push('Attend');
  if (sources.length === 0) return null;
  return <span className="text-xs uppercase tracking-widest text-cream-300 font-medium">source: {sources.join(' › ')}</span>;
}

function LogisticsSummary({ estimateCents, stipendCents, updatedAt, attendCity, attendState, attendCountry }: Readonly<{
  estimateCents: number | null;
  stipendCents: number | null;
  updatedAt: string | null;
  attendCity?: string | null;
  attendState?: string | null;
  attendCountry?: string | null;
}>) {
  const shortfallCents = estimateCents != null && stipendCents != null ? estimateCents - stipendCents : null;
  const attendLoc = [attendCity, attendState, attendCountry].filter(Boolean).join(', ');
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-cream-300">
      {shortfallCents != null ? (
        <span>
          <span className="text-cream-300">Shortfall:</span>{' '}
          <span className={`tabular-nums font-medium ${shortfallCents > 0 ? 'text-yellow-300' : 'text-green-400'}`}>
            {shortfallCents > 0 ? formatDollars(shortfallCents) : 'covered'}
          </span>
        </span>
      ) : null}
      {updatedAt ? <span><span className="text-cream-300">Price updated:</span> {relativeTime(updatedAt)}</span> : null}
      {attendLoc ? <span><span className="text-cream-300">Attend says:</span> {attendLoc}</span> : null}
    </div>
  );
}

const AUDIT_FIELD_LABEL: Record<string, string> = {
  outreachStatus: 'Status',
  source: 'Source',
  ownerId: 'Owner',
  invitedAt: 'Invited at',
  isGirl: 'Counts toward girls',
  homeAirport: 'Home airport',
  homeStreet: 'Home street',
  homeCity: 'Home city',
  homeState: 'Home state',
  homeZip: 'Home ZIP',
  homeCountry: 'Home country',
  flightStipendCents: 'Flight stipend',
  flightCostEstimateCents: 'Flight price',
  notes: 'Notes',
  attendInvited: 'Invited in Attend',
  attendFlightBooked: 'Flight booked',
  pronouns: 'Pronouns',
};
function auditFieldLabel(field: string): string {
  return AUDIT_FIELD_LABEL[field] ?? field;
}
function auditValueLabel(field: string, value: string | null): string {
  if (value === null || value === '') return '∅';
  if (field === 'outreachStatus' && value in STATUS_LABEL) {
    return STATUS_LABEL[value as AttendanceStatus];
  }
  if (field === 'source' && value in SOURCE_FULL_LABEL) {
    return SOURCE_FULL_LABEL[value as AttendanceCandidateSource];
  }
  if (field === 'flightStipendCents' || field === 'flightCostEstimateCents') {
    const n = parseInt(value, 10);
    return isFinite(n) ? formatDollars(n) : value;
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
