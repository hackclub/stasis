'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  AreaChart, Area, BarChart, Bar as RBar, LineChart, Line,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip as RTooltip, ResponsiveContainer,
} from 'recharts';

// --- Types ---

interface ReviewData {
  queue: {
    total: number; design: number; build: number; preReviewed: number;
    medianWaitDays: number; p90WaitDays: number; maxWaitDays: number;
  };
  periods: {
    today: { submissions: number; decisions: number; firstPass: number };
    thisWeek: { submissions: number; decisions: number; firstPass: number };
    thisMonth: { submissions: number; decisions: number; firstPass: number };
    allTime: { submissions: number; decisions: number; firstPass: number };
  };
  dailyActivity: { date: string; design_subs: number; build_subs: number; design_decisions: number; build_decisions: number }[];
  queueHistory: { date: string; design: number; build: number }[];
  weeklyStats: {
    week: string; submissions: number; reviews: number;
    returned: number; admin_reviews: number; return_rate: number; active_reviewers: number;
  }[];
  turnaroundTrend: { week: string; designMedian: number; buildMedian: number; designP90: number; buildP90: number }[];
  turnaround: {
    design: { medianHours: number; p90Hours: number; samples: number };
    build: { medianHours: number; p90Hours: number; samples: number };
  };
  reviewFreshness: { bucket: string; count: number; median_age: number }[];
  backlogAge: { stage: string; bucket: string; count: number }[];
  outcomes: { approved: number; returned: number; rejected: number };
  resubmissions: { avgRounds: number; distribution: { rounds: string; count: number }[] };
  reviewers: {
    id: string; name: string; image: string | null;
    total: number; firstPass: number; admin: number;
    approved: number; returned: number; rejected: number;
    today: number; week: number; month: number; activeDays: number;
  }[];
  oldest: {
    id: string; projectId: string; projectTitle: string; stage: string;
    submittedAt: string; ageDays: number; preReviewed: boolean;
  }[];
}

// --- Constants ---

const AMBER = '#f59e0b';
const TEAL = '#2dd4bf';
const EMERALD = '#34d399';
const ROSE = '#fb7185';
const YELLOW = '#fbbf24';
const SKY = '#7dd3fc';
const VIOLET = '#a78bfa';
const SLATE = '#94a3b8';
const AXIS_TICK = { fill: 'rgba(245,243,239,0.6)', fontSize: 10, fontFamily: 'var(--font-sans, sans-serif)' };
const GRID_LINE = { strokeDasharray: '2 4' as const, stroke: 'rgba(245,243,239,0.06)' };

type SortPeriod = 'today' | 'week' | 'month' | 'total';
type TimeRange = '7d' | '30d' | '90d' | 'all';

// --- Small components ---

function Tip({ text }: Readonly<{ text: string }>) {
  return (
    <span className="relative group ml-1 inline-flex align-middle">
      <span className="text-cream-50/45 text-[9px] cursor-help border border-cream-500/10 w-3 h-3 inline-flex items-center justify-center leading-none select-none">?</span>
      <span className="absolute bottom-full left-0 mb-1.5 px-2 py-1.5 bg-brown-900 border border-cream-500/20 text-cream-50/70 text-[11px] w-56 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20 leading-snug font-normal normal-case tracking-normal">
        {text}
      </span>
    </span>
  );
}

function ChartTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-brown-900/95 border border-cream-500/15 px-3 py-2 text-[11px] font-sans backdrop-blur-sm">
      <div className="text-cream-50/70 mb-0.5">{label}</div>
      {payload.map((e: any, i: number) => (
        <div key={i} className="flex justify-between gap-4">
          <span style={{ color: e.color }}>{e.name}</span>
          <span className="text-cream-50">{typeof e.value === 'number' ? e.value.toLocaleString() : e.value}</span>
        </div>
      ))}
    </div>
  );
}

function QueueTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  const delta = d.delta ?? 0;
  return (
    <div className="bg-brown-900/95 border border-cream-500/15 px-3 py-2 text-[11px] font-sans backdrop-blur-sm">
      <div className="text-cream-50/70 mb-1">{label}</div>
      <div className="flex justify-between gap-5">
        <span style={{ color: SKY }}>Design</span>
        <span className="text-cream-50">{d.design}</span>
      </div>
      <div className="flex justify-between gap-5">
        <span style={{ color: VIOLET }}>Build</span>
        <span className="text-cream-50">{d.build}</span>
      </div>
      <div className="flex justify-between gap-5 border-t border-cream-500/10 mt-1 pt-1">
        <span className="text-cream-50/70">Total</span>
        <span className="text-cream-50">{d.total}</span>
      </div>
      {delta !== 0 && (
        <div className="flex justify-between gap-5">
          <span className="text-cream-50/50">Change</span>
          <span className={delta > 0 ? 'text-rose-400' : 'text-emerald-400'}>{delta > 0 ? '+' : ''}{delta}</span>
        </div>
      )}
    </div>
  );
}

function PieTip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="bg-brown-900/95 border border-cream-500/15 px-3 py-1.5 text-[11px] font-sans">
      <span className="text-cream-50">{d.name}: {d.value} ({(d.payload.percent * 100).toFixed(1)}%)</span>
    </div>
  );
}

function PieLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) {
  if (percent < 0.04) return null;
  const r = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  return (
    <text x={cx + radius * Math.cos(-midAngle * r)} y={cy + radius * Math.sin(-midAngle * r)}
      fill="#F5F3EF" textAnchor="middle" dominantBaseline="central" fontSize={11}
      fontFamily="var(--font-sans, sans-serif)">{(percent * 100).toFixed(0)}%</text>
  );
}

function Metric({ label, value, sub, tip, accent }: Readonly<{
  label: string; value: string | number; sub?: string; tip?: string; accent?: string;
}>) {
  return (
    <div className="min-w-0">
      <div className="text-cream-50/60 text-[10px] uppercase tracking-widest mb-0.5 truncate">
        {label}{tip && <Tip text={tip} />}
      </div>
      <div className={`text-2xl font-sans font-medium tabular-nums ${accent || 'text-cream-50'}`}>{value}</div>
      {sub && <div className="text-cream-50/50 text-[10px] mt-0.5 font-sans">{sub}</div>}
    </div>
  );
}

function SectionLabel({ children, tip }: Readonly<{ children: React.ReactNode; tip?: string }>) {
  return (
    <h2 className="text-cream-50/70 text-[11px] uppercase tracking-[0.15em] mb-4 font-medium">
      {children}{tip && <Tip text={tip} />}
    </h2>
  );
}

function RangeControl({ value, onChange }: Readonly<{ value: TimeRange; onChange: (v: TimeRange) => void }>) {
  return (
    <div className="flex gap-1">
      {([['7d', '7d'], ['30d', '30d'], ['90d', '90d'], ['all', 'All']] as const).map(([k, label]) => (
        <button key={k} onClick={() => onChange(k)}
          className={`px-2 py-0.5 text-[10px] uppercase tracking-wider border cursor-pointer transition-colors ${
            value === k ? 'border-cream-50/20 text-cream-50 bg-cream-50/5' : 'border-cream-500/8 text-cream-50/50 hover:text-cream-50/70'
          }`}>{label}</button>
      ))}
    </div>
  );
}

function fmtDays(d: number): string {
  if (d < 1) return `${Math.round(d * 24)}h`;
  if (d < 2) return `${Math.floor(d)}d ${Math.round((d % 1) * 24)}h`;
  return `${Math.round(d * 10) / 10}d`;
}

function fmtHours(h: number): string {
  if (h < 24) return `${Math.round(h)}h`;
  const days = Math.floor(h / 24);
  const hrs = Math.round(h % 24);
  if (hrs === 0) return `${days}d`;
  return `${days}d ${hrs}h`;
}

// --- Main ---

export default function ReviewDataPage() {
  const [data, setData] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortPeriod>('week');
  const [range, setRange] = useState<TimeRange>('30d');

  useEffect(() => {
    fetch('/api/admin/review-data')
      .then(r => { if (!r.ok) throw new Error('Failed to load'); return r.json(); })
      .then(setData).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, []);

  const computed = useMemo(() => {
    if (!data) return null;
    const withTotals = data.dailyActivity.map(d => ({
      ...d,
      submissions: d.design_subs + d.build_subs,
      decisions: d.design_decisions + d.build_decisions,
    }));
    const last7 = withTotals.slice(-7);
    const last30 = withTotals.slice(-30);
    const avg7d = last7.reduce((s, d) => s + d.decisions, 0) / 7;
    const avg30d = last30.reduce((s, d) => s + d.decisions, 0) / 30;
    const avg7s = last7.reduce((s, d) => s + d.submissions, 0) / 7;
    const net7 = last7.reduce((s, d) => s + d.decisions - d.submissions, 0);

    const rawQueue = data.queueHistory ?? [];
    const queueHistory = rawQueue.map((d, i) => {
      const total = d.design + d.build;
      const prev = i > 0 ? rawQueue[i - 1].design + rawQueue[i - 1].build : total;
      return { ...d, total, delta: total - prev };
    });

    const burnDays = avg7d > 0 ? data.queue.total / avg7d : Infinity;
    const outcomeTotal = data.outcomes.approved + data.outcomes.returned + data.outcomes.rejected;

    const AGE_BUCKETS = ['< 1 day', '1-3 days', '3-7 days', '1-2 weeks', '2-4 weeks', '1+ months'];
    const designAge = AGE_BUCKETS.map(b => ({ bucket: b, count: data.backlogAge.find(r => r.stage === 'DESIGN' && r.bucket === b)?.count ?? 0 }));
    const buildAge = AGE_BUCKETS.map(b => ({ bucket: b, count: data.backlogAge.find(r => r.stage === 'BUILD' && r.bucket === b)?.count ?? 0 }));

    return { avg7d, avg30d, avg7s, net7, queueHistory, burnDays, outcomeTotal, withTotals, designAge, buildAge };
  }, [data]);

  const sortedReviewers = useMemo(() => {
    if (!data) return [];
    const k = sort === 'today' ? 'today' : sort === 'week' ? 'week' : sort === 'month' ? 'month' : 'total';
    return [...data.reviewers].sort((a, b) => b[k] - a[k]).filter(r => r[k] > 0);
  }, [data, sort]);

  if (loading) return <div className="flex justify-center py-20"><div className="loader" /></div>;
  if (error || !data || !computed) return <div className="text-cream-50/60 text-center py-20">{error || 'Failed to load'}</div>;

  const rangeDays = range === '7d' ? 7 : range === '30d' ? 30 : range === '90d' ? 90 : Infinity;
  const sliceRange = <T,>(arr: T[]) => rangeDays === Infinity ? arr : arr.slice(-rangeDays);
  const dailySlice = sliceRange(computed.withTotals);
  const queueSlice = sliceRange(computed.queueHistory);
  const outcomePie = [
    { name: 'Approved', value: data.outcomes.approved },
    { name: 'Returned', value: data.outcomes.returned },
    { name: 'Rejected', value: data.outcomes.rejected },
  ].filter(d => d.value > 0);
  const outcomeColors = [EMERALD, YELLOW, ROSE];
  const backlogMax = Math.max(...computed.designAge.map(b => b.count), ...computed.buildAge.map(b => b.count), 1);
  const freshnessMax = Math.max(...data.reviewFreshness.map(b => b.count), 1);

  return (
    <div className="space-y-10 max-w-[1400px] mx-auto">

      {/* ── Headline metrics ── */}
      <div>
        <h1 className="text-cream-50/50 text-xs uppercase tracking-[0.2em] mb-6">Review pipeline</h1>
        <div className="flex flex-wrap gap-x-10 gap-y-4">
          <Metric label="In queue" value={data.queue.total}
            sub={`${data.queue.design} design · ${data.queue.build} build`}
            tip="Projects currently waiting for a review decision" />
          <Metric label="Submitted today" value={data.periods.today.submissions}
            sub={`${data.periods.thisWeek.submissions} this week`} accent="text-amber-400" />
          <Metric label="Decisions today" value={data.periods.today.decisions}
            sub={`${data.periods.thisWeek.decisions} this week · ${data.periods.today.firstPass} first-pass`}
            tip="Admin decisions (approve/return/reject) that move projects through the pipeline. First-pass = preliminary screening."
            accent="text-teal-400" />
          <Metric label="Median wait" value={fmtDays(data.queue.medianWaitDays)}
            sub={`p90 ${fmtDays(data.queue.p90WaitDays)} · max ${fmtDays(data.queue.maxWaitDays)}`}
            tip="How long the median pending project has been waiting right now" />
          <Metric label="7-day net" value={`${computed.net7 >= 0 ? '+' : ''}${computed.net7}`}
            sub={`${Math.round(computed.avg7s * 10) / 10} in · ${Math.round(computed.avg7d * 10) / 10} decided / day`}
            accent={computed.net7 <= 0 ? 'text-emerald-400' : 'text-rose-400'}
            tip="Reviews minus submissions over the last 7 days. Negative means the queue is growing." />
          <Metric label="Time to clear" value={computed.burnDays === Infinity ? '—' : fmtDays(computed.burnDays)}
            sub={`${Math.round(computed.avg7d * 10) / 10} decisions/day`}
            tip="Days to empty the queue at the current 7-day decision pace, assuming no new submissions" />
        </div>
      </div>

      {/* ── Queue over time ── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <SectionLabel tip="Queue size computed from full submission and decision history, anchored to the current actual queue. Shows whether the backlog is growing or shrinking.">
            Review queue size
          </SectionLabel>
          <RangeControl value={range} onChange={setRange} />
        </div>
        <div className="bg-brown-800/50 border border-cream-500/8 p-4 pb-2">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={queueSlice}>
              <defs>
                <linearGradient id="designGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={SKY} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={SKY} stopOpacity={0.03} />
                </linearGradient>
                <linearGradient id="buildGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={VIOLET} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={VIOLET} stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid {...GRID_LINE} />
              <XAxis dataKey="date" tick={AXIS_TICK} tickFormatter={d => d.slice(5)} interval={Math.max(1, Math.floor(queueSlice.length / 10))} />
              <YAxis tick={AXIS_TICK} width={32} />
              <RTooltip content={<QueueTip />} />
              <Area type="monotone" dataKey="total" name="Total" stroke={AMBER} fill="none" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
              <Area type="monotone" dataKey="design" name="Design" stroke={SKY} fill="url(#designGrad)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="build" name="Build" stroke={VIOLET} fill="url(#buildGrad)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
          <div className="flex gap-5 mt-1 text-[10px] text-cream-50/55 font-sans pl-8">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 inline-block rounded-full" style={{ background: SKY }} />Design</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 inline-block rounded-full" style={{ background: VIOLET }} />Build</span>
          </div>
        </div>
      </div>

      {/* ── Submissions vs Reviews ── */}
      <div>
        <SectionLabel tip="Daily volume. When submissions exceed decisions, the queue is growing. Decisions = admin approve/return/reject actions.">
          Submissions vs decisions
        </SectionLabel>
        <div className="bg-brown-800/50 border border-cream-500/8 p-4 pb-2">
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={dailySlice.map(d => ({ ...d, label: d.date.slice(5) }))}>
              <CartesianGrid {...GRID_LINE} />
              <XAxis dataKey="label" tick={AXIS_TICK} interval={Math.max(1, Math.floor(dailySlice.length / 10))} />
              <YAxis tick={AXIS_TICK} width={28} />
              <RTooltip content={<ChartTip />} />
              <Area type="monotone" dataKey="submissions" name="Submitted" stroke={AMBER} fill={AMBER} fillOpacity={0.15} strokeWidth={1.5} dot={false} />
              <Area type="monotone" dataKey="decisions" name="Decided" stroke={TEAL} fill={TEAL} fillOpacity={0.15} strokeWidth={1.5} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
          <div className="flex gap-5 mt-1 text-[10px] text-cream-50/55 font-sans pl-8">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 inline-block rounded-full" style={{ background: AMBER }} />Submitted</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 inline-block rounded-full" style={{ background: TEAL }} />Decided</span>
          </div>
        </div>
      </div>

      {/* ── Wait times ── */}
      <div>
        <SectionLabel>How long are people waiting?</SectionLabel>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Current queue age — split by stage */}
          <div className="bg-brown-800/50 border border-cream-500/8 p-5">
            <div className="text-cream-50/60 text-[10px] uppercase tracking-widest mb-3">
              Current queue — time waiting<Tip text="Age distribution of pending projects, split by design (blue) and build (purple)" />
            </div>
            <div className="space-y-1.5">
              {computed.designAge.map((b, i) => {
                const buildCount = computed.buildAge[i]?.count ?? 0;
                const total = b.count + buildCount;
                if (total === 0) return null;
                return (
                  <div key={b.bucket} className="flex items-center gap-2 text-[11px]">
                    <span className="text-cream-50/70 font-sans w-20 shrink-0 text-right">{b.bucket}</span>
                    <div className="flex-1 h-5 bg-brown-900/60 flex">
                      <div className="h-full" style={{ width: `${(b.count / backlogMax) * 100}%`, background: SKY }} />
                      <div className="h-full" style={{ width: `${(buildCount / backlogMax) * 100}%`, background: VIOLET }} />
                    </div>
                    <span className="text-cream-50/60 font-sans text-[10px] w-12 text-right">{total}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-4 mt-2 text-[10px] text-cream-50/50">
              <span className="flex items-center gap-1"><span className="w-2 h-2 inline-block" style={{ background: SKY }} />Design</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 inline-block" style={{ background: VIOLET }} />Build</span>
            </div>
          </div>

          {/* Review freshness */}
          <div className="bg-brown-800/50 border border-cream-500/8 p-5">
            <div className="text-cream-50/60 text-[10px] uppercase tracking-widest mb-3">
              Reviewed items — how old were they?<Tip text="When reviews happened in the last 30 days, how long had those items been waiting? If most reviews are on old items, we're doing FIFO. If mostly new items, we're cherry-picking." />
            </div>
            <div className="space-y-1.5">
              {data.reviewFreshness.map(b => (
                <div key={b.bucket} className="flex items-center gap-2 text-[11px]">
                  <span className="text-cream-50/70 font-sans w-20 shrink-0 text-right">{b.bucket}</span>
                  <div className="flex-1 h-5 bg-brown-900/60 relative">
                    <div className="h-full absolute left-0 top-0" style={{
                      width: `${(b.count / freshnessMax) * 100}%`,
                      background: TEAL,
                    }} />
                    <span className="absolute right-1.5 top-0.5 text-cream-50/60 font-sans text-[10px]">{b.count}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Turnaround trend + stats */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
          <div className="lg:col-span-2 bg-brown-800/50 border border-cream-500/8 p-4 pb-2">
            <div className="text-cream-50/60 text-[10px] uppercase tracking-widest mb-3">
              Turnaround trend — median<Tip text="Median days from submission to admin decision, per week by stage. Falling lines = reviews getting faster." />
            </div>
            {data.turnaroundTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height={150}>
                <LineChart data={data.turnaroundTrend.map(t => ({ ...t, label: t.week.slice(5) }))}>
                  <CartesianGrid {...GRID_LINE} />
                  <XAxis dataKey="label" tick={AXIS_TICK} />
                  <YAxis tick={AXIS_TICK} width={28} unit="d" />
                  <RTooltip content={<ChartTip />} />
                  <Line type="monotone" dataKey="designMedian" name="Design median" stroke={SKY} strokeWidth={2} dot={{ r: 2, fill: SKY }} />
                  <Line type="monotone" dataKey="buildMedian" name="Build median" stroke={VIOLET} strokeWidth={2} dot={{ r: 2, fill: VIOLET }} />
                </LineChart>
              </ResponsiveContainer>
            ) : <p className="text-cream-50/50 text-xs">No data</p>}
            <div className="text-cream-50/60 text-[10px] uppercase tracking-widest mb-3 mt-4">
              Turnaround trend — p90<Tip text="90th percentile: 90% of submissions are reviewed within this time. Shows worst-case wait." />
            </div>
            {data.turnaroundTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height={150}>
                <LineChart data={data.turnaroundTrend.map(t => ({ ...t, label: t.week.slice(5) }))}>
                  <CartesianGrid {...GRID_LINE} />
                  <XAxis dataKey="label" tick={AXIS_TICK} />
                  <YAxis tick={AXIS_TICK} width={28} unit="d" />
                  <RTooltip content={<ChartTip />} />
                  <Line type="monotone" dataKey="designP90" name="Design p90" stroke={SKY} strokeWidth={2} strokeDasharray="6 3" dot={{ r: 2, fill: SKY }} />
                  <Line type="monotone" dataKey="buildP90" name="Build p90" stroke={VIOLET} strokeWidth={2} strokeDasharray="6 3" dot={{ r: 2, fill: VIOLET }} />
                </LineChart>
              </ResponsiveContainer>
            ) : null}
            <div className="flex gap-5 mt-1 text-[10px] text-cream-50/55 font-sans pl-8">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 inline-block rounded-full" style={{ background: SKY }} />Design</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 inline-block rounded-full" style={{ background: VIOLET }} />Build</span>
              <span className="text-cream-50/45">solid = median · dashed = p90</span>
            </div>
          </div>

          <div className="bg-brown-800/50 border border-cream-500/8 p-5 space-y-4">
            <div className="text-cream-50/60 text-[10px] uppercase tracking-widest">
              Turnaround by stage<Tip text="Overall median and p90 time from submission to admin decision" />
            </div>
            {(['design', 'build'] as const).map(stage => {
              const t = data.turnaround[stage];
              return (
                <div key={stage}>
                  <div className="text-cream-50/70 text-[10px] uppercase tracking-wider mb-1" style={{ color: stage === 'design' ? SKY : VIOLET }}>{stage}</div>
                  <div className="space-y-0.5 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-cream-50/50">median</span>
                      <span className="text-cream-50 font-sans">{fmtHours(t.medianHours)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-cream-50/50">p90</span>
                      <span className="text-cream-50 font-sans">{fmtHours(t.p90Hours)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-cream-50/50">samples</span>
                      <span className="text-cream-50/70 font-sans">{t.samples}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Outcomes & Returns ── */}
      <div>
        <SectionLabel>What happens when projects get reviewed?</SectionLabel>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Outcome donut */}
          <div className="bg-brown-800/50 border border-cream-500/8 p-5">
            <div className="text-cream-50/60 text-[10px] uppercase tracking-widest mb-2">
              Admin decisions (all time)
            </div>
            {computed.outcomeTotal > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={150}>
                  <PieChart>
                    <Pie data={outcomePie} dataKey="value" cx="50%" cy="50%" innerRadius={38} outerRadius={62} labelLine={false} label={PieLabel}>
                      {outcomePie.map((_, i) => <Cell key={i} fill={outcomeColors[i]} stroke="none" />)}
                    </Pie>
                    <RTooltip content={<PieTip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex justify-center gap-4 text-[10px] text-cream-50/60 font-sans mt-1">
                  {outcomePie.map((d, i) => (
                    <span key={d.name} className="flex items-center gap-1">
                      <span className="w-2 h-2 inline-block" style={{ background: outcomeColors[i] }} />{d.name} ({d.value})
                    </span>
                  ))}
                </div>
              </>
            ) : <p className="text-cream-50/50 text-xs">No data</p>}
          </div>

          {/* Return rate trend */}
          <div className="bg-brown-800/50 border border-cream-500/8 p-4 pb-2">
            <div className="text-cream-50/60 text-[10px] uppercase tracking-widest mb-3">
              Weekly return rate<Tip text="Percentage of admin decisions that return the project for changes. A falling rate means users are submitting better work." />
            </div>
            {data.weeklyStats.length > 0 ? (
              <ResponsiveContainer width="100%" height={150}>
                <LineChart data={data.weeklyStats.filter(w => w.admin_reviews > 0).map(w => ({ ...w, label: w.week.slice(5) }))}>
                  <CartesianGrid {...GRID_LINE} />
                  <XAxis dataKey="label" tick={AXIS_TICK} />
                  <YAxis tick={AXIS_TICK} width={28} unit="%" domain={[0, 100]} />
                  <RTooltip content={<ChartTip />} />
                  <Line type="monotone" dataKey="return_rate" name="Return %" stroke={YELLOW} strokeWidth={2} dot={{ r: 2.5, fill: YELLOW }} />
                </LineChart>
              </ResponsiveContainer>
            ) : <p className="text-cream-50/50 text-xs">No data</p>}
          </div>

          {/* Resubmissions + active reviewers */}
          <div className="space-y-6">
            <div className="bg-brown-800/50 border border-cream-500/8 p-5">
              <div className="text-cream-50/60 text-[10px] uppercase tracking-widest mb-2">
                Review rounds<Tip text="How many times projects are submitted before getting approved. More rounds = more back-and-forth." />
              </div>
              <div className="text-cream-50 text-lg font-sans mb-2">{data.resubmissions.avgRounds} avg</div>
              <div className="space-y-1">
                {data.resubmissions.distribution.map(d => {
                  const max = Math.max(...data.resubmissions.distribution.map(x => x.count), 1);
                  return (
                    <div key={d.rounds} className="flex items-center gap-2 text-[11px]">
                      <span className="text-cream-50/60 font-sans w-6 text-right">{d.rounds}×</span>
                      <div className="flex-1 h-3 bg-brown-900/60">
                        <div className="h-full" style={{ width: `${(d.count / max) * 100}%`, background: d.rounds === '1' ? EMERALD : SLATE }} />
                      </div>
                      <span className="text-cream-50/60 font-sans w-8 text-right">{d.count}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-brown-800/50 border border-cream-500/8 p-5">
              <div className="text-cream-50/60 text-[10px] uppercase tracking-widest mb-2">
                Active reviewers / week<Tip text="Distinct people who completed at least one admin review that week" />
              </div>
              <div className="flex items-end gap-0.5 h-10">
                {data.weeklyStats.map((w, i) => {
                  const max = Math.max(...data.weeklyStats.map(x => x.active_reviewers), 1);
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center justify-end h-full" title={`${w.week.slice(5)}: ${w.active_reviewers}`}>
                      <div style={{ height: `${(w.active_reviewers / max) * 100}%`, background: TEAL, minHeight: w.active_reviewers > 0 ? 2 : 0 }} className="w-full" />
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between text-[9px] text-cream-50/45 font-sans mt-1">
                <span>{data.weeklyStats[0]?.week.slice(5)}</span>
                <span>{data.weeklyStats[data.weeklyStats.length - 1]?.week.slice(5)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Weekly breakdown ── */}
      <div>
        <SectionLabel tip="Side-by-side weekly view. Orange = submissions in, teal = admin decisions out. These should be roughly balanced for a stable queue.">
          Weekly throughput
        </SectionLabel>
        <div className="bg-brown-800/50 border border-cream-500/8 p-4 pb-2">
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={data.weeklyStats.map(w => ({ ...w, label: w.week.slice(5) }))} barGap={1}>
              <CartesianGrid {...GRID_LINE} />
              <XAxis dataKey="label" tick={AXIS_TICK} />
              <YAxis tick={AXIS_TICK} width={28} />
              <RTooltip content={<ChartTip />} />
              <RBar dataKey="submissions" name="Submitted" fill={AMBER} radius={[1, 1, 0, 0]} />
              <RBar dataKey="admin_reviews" name="Decided" fill={TEAL} radius={[1, 1, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Reviewer leaderboard ── */}
      <div>
        <SectionLabel tip="All reviewers ranked by review count in the selected period. Combines first-pass and admin reviews.">
          Reviewers
        </SectionLabel>
        <div className="flex gap-1.5 mb-3">
          {([['today', 'Today'], ['week', 'This week'], ['month', 'This month'], ['total', 'All time']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setSort(k)}
              className={`px-2.5 py-1 text-[10px] uppercase tracking-wider border cursor-pointer transition-colors ${
                sort === k ? 'border-cream-50/20 text-cream-50 bg-cream-50/5' : 'border-cream-500/8 text-cream-50/50 hover:text-cream-50/70'
              }`}>{label}</button>
          ))}
        </div>
        {sortedReviewers.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-cream-50/50 uppercase tracking-wider text-[9px]">
                  <th className="text-left pb-2 pr-2 w-6">#</th>
                  <th className="text-left pb-2 pr-4">Name</th>
                  <th className="text-right pb-2 px-2">{sort === 'today' ? <span className="text-cream-50/60">Today</span> : 'Today'}</th>
                  <th className="text-right pb-2 px-2">{sort === 'week' ? <span className="text-cream-50/60">Week</span> : 'Week'}</th>
                  <th className="text-right pb-2 px-2">{sort === 'month' ? <span className="text-cream-50/60">Month</span> : 'Month'}</th>
                  <th className="text-right pb-2 px-2">{sort === 'total' ? <span className="text-cream-50/60">Total</span> : 'Total'}</th>
                  <th className="text-right pb-2 px-2">Tier<Tip text="Tier 1 = first-pass screening. Tier 2 = admin decisions (approve/return/reject). Based on majority of reviews." /></th>
                  <th className="text-right pb-2 px-2">Approve%</th>
                  <th className="text-right pb-2 px-2">Active days</th>
                </tr>
              </thead>
              <tbody>
                {sortedReviewers.map((r, i) => {
                  const pct = r.total > 0 ? Math.round((r.approved / r.total) * 100) : 0;
                  return (
                    <tr key={r.id} className="border-t border-cream-500/5 hover:bg-cream-50/[0.02] transition-colors">
                      <td className="text-cream-50/45 font-sans py-1.5 pr-2">{i + 1}</td>
                      <td className="py-1.5 pr-4">
                        <div className="flex items-center gap-2">
                          {r.image && <img src={r.image} alt="" className="w-4 h-4 border border-cream-500/10" />}
                          <span className="text-cream-50/70">{r.name}</span>
                        </div>
                      </td>
                      <td className={`text-right font-sans py-1.5 px-2 ${sort === 'today' ? 'text-cream-50' : 'text-cream-50/60'}`}>{r.today}</td>
                      <td className={`text-right font-sans py-1.5 px-2 ${sort === 'week' ? 'text-cream-50' : 'text-cream-50/60'}`}>{r.week}</td>
                      <td className={`text-right font-sans py-1.5 px-2 ${sort === 'month' ? 'text-cream-50' : 'text-cream-50/60'}`}>{r.month}</td>
                      <td className={`text-right font-sans py-1.5 px-2 ${sort === 'total' ? 'text-cream-50' : 'text-cream-50/60'}`}>{r.total}</td>
                      <td className="text-right font-sans py-1.5 px-2">
                        {r.admin > r.firstPass
                          ? <span className="text-violet-400/80">Tier 2</span>
                          : <span className="text-sky-400/80">Tier 1</span>}
                      </td>
                      <td className="text-right font-sans py-1.5 px-2">
                        <span className={pct >= 60 ? 'text-emerald-400/70' : pct >= 30 ? 'text-yellow-400/70' : 'text-rose-400/70'}>{pct}%</span>
                      </td>
                      <td className="text-cream-50/50 text-right font-sans py-1.5 px-2">{r.activeDays}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <p className="text-cream-50/50 text-xs">No reviews in this period</p>}
      </div>

      {/* ── Oldest pending ── */}
      {data.oldest.length > 0 && (
        <div>
          <SectionLabel tip="The 10 longest-waiting submissions currently in the queue">Oldest pending</SectionLabel>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-cream-50/50 uppercase tracking-wider text-[9px]">
                  <th className="text-left pb-2">Project</th>
                  <th className="text-left pb-2 px-3">Stage</th>
                  <th className="text-right pb-2 px-3">Waiting</th>
                  <th className="text-center pb-2 px-3">Pre-reviewed</th>
                </tr>
              </thead>
              <tbody>
                {data.oldest.map((item, i) => (
                  <tr key={i} className="border-t border-cream-500/5">
                    <td className="py-1.5">
                      <a href={`/admin/review/${item.id}`} className="text-cream-50/60 hover:text-cream-50 transition-colors">{item.projectTitle}</a>
                    </td>
                    <td className={`py-1.5 px-3 uppercase font-sans text-[10px] ${item.stage === 'DESIGN' ? 'text-sky-400/80' : 'text-violet-400/80'}`}>{item.stage}</td>
                    <td className={`text-right font-sans py-1.5 px-3 ${item.ageDays > 14 ? 'text-rose-400/80' : item.ageDays > 7 ? 'text-amber-400/70' : 'text-cream-50/60'}`}>
                      {fmtDays(item.ageDays)}
                    </td>
                    <td className="text-center py-1.5 px-3">
                      {item.preReviewed ? <span className="text-sky-400/50">yes</span> : <span className="text-cream-50/35">no</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Period summary ── */}
      <div className="flex flex-wrap gap-6 text-[11px] text-cream-50/50 font-sans border-t border-cream-500/5 pt-6">
        {([['Today', data.periods.today], ['This week', data.periods.thisWeek], ['This month', data.periods.thisMonth], ['All time', data.periods.allTime]] as const).map(([label, p]) => (
          <div key={label}>
            <span className="text-cream-50/45 uppercase tracking-wider text-[9px]">{label}</span>
            <div className="mt-0.5">
              <span style={{ color: AMBER }}>{p.submissions}</span>
              <span className="text-cream-50/35"> submitted · </span>
              <span style={{ color: TEAL }}>{p.decisions}</span>
              <span className="text-cream-50/35"> decided · </span>
              <span className="text-cream-50/60">{p.firstPass}</span>
              <span className="text-cream-50/35"> first-pass</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
