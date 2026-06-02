'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  AreaChart, Area, BarChart, Bar as RechartsBar, LineChart, Line,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, Legend,
} from 'recharts';

interface TurnaroundStats {
  avg: number;
  median: number;
  p90: number;
  sampleCount: number;
}

interface ReviewerRow {
  id: string;
  name: string;
  image: string | null;
  total: number;
  firstPass: number;
  admin: number;
  approved: number;
  returned: number;
  rejected: number;
  today: number;
  week: number;
  month: number;
  avgTurnaroundHours: number;
  activeDays: number;
}

interface ReviewData {
  queue: {
    design: { pending: number; claimed: number; preReviewed: number };
    build: { pending: number; claimed: number; preReviewed: number };
  };
  periods: {
    today: { submissions: number; reviews: number };
    thisWeek: { submissions: number; reviews: number };
    thisMonth: { submissions: number; reviews: number };
    allTime: { submissions: number; reviews: number };
  };
  dailyActivity: { date: string; submissions: number; reviews: number }[];
  weeklyActivity: { week: string; submissions: number; reviews: number }[];
  turnaround: {
    firstResponse: { design: TurnaroundStats; build: TurnaroundStats };
    resolution: { design: TurnaroundStats; build: TurnaroundStats };
  };
  turnaroundTrend: { week: string; designMedian: number; buildMedian: number }[];
  outcomes: {
    design: { approved: number; returned: number; rejected: number };
    build: { approved: number; returned: number; rejected: number };
  };
  reviewers: ReviewerRow[];
  backlog: {
    buckets: { bucket: string; count: number }[];
    oldest: {
      id: string; projectId: string; projectTitle: string; stage: string;
      submittedAt: string; ageHours: number; preReviewed: boolean;
      claimedBy: string | null; claimerName: string | null;
    }[];
  };
  agreement: {
    matrix: { firstPass: string; admin: string; count: number }[];
    agreementRate: number;
    total: number;
  };
  resubmissions: {
    design: { avg: number; distribution: { submissions: number | string; projects: number }[] };
    build: { avg: number; distribution: { submissions: number | string; projects: number }[] };
  };
  activityByDow: { dow: number; submissions: number; reviews: number }[];
  activityByHour: { hour: number; submissions: number; reviews: number }[];
  adminOutcomes: {
    design: { approved: number; returned: number; rejected: number };
    build: { approved: number; returned: number; rejected: number };
  };
  adminTurnaround: { design: TurnaroundStats; build: TurnaroundStats };
}

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ORANGE = '#D95D39';
const GREEN = '#15803d';
const BLUE = '#3b82f6';
const PURPLE = '#a855f7';
const YELLOW = '#ca8a04';
const RED = '#dc2626';
const AXIS = { fill: 'rgba(245,243,239,0.5)', fontSize: 11, fontFamily: 'var(--font-mono, monospace)' };
const GRID = { strokeDasharray: '3 3' as const, stroke: 'rgba(245,243,239,0.06)' };
const BACKLOG_COLORS = [ORANGE, YELLOW, '#b45309', RED, '#991b1b'];
const OUTCOME_COLORS = [GREEN, YELLOW, RED];

type ReviewerSortPeriod = 'today' | 'week' | 'month' | 'total';

function ChartTooltipContent({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-brown-900 border border-cream-500/20 px-3 py-2 font-mono text-xs">
      <div className="text-cream-50 mb-1 font-medium">{label}</div>
      {payload.map((entry: any, i: number) => (
        <div key={i} className="flex justify-between gap-6">
          <span style={{ color: entry.color }}>{entry.name}</span>
          <span className="text-cream-50">{typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}</span>
        </div>
      ))}
    </div>
  );
}

function PieTooltipContent({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="bg-brown-900 border border-cream-500/20 px-3 py-2 font-mono text-xs">
      <div className="text-cream-50">{d.name}: <span className="font-medium">{d.value}</span> ({(d.payload.percent * 100).toFixed(1)}%)</div>
    </div>
  );
}

function Tip({ text }: Readonly<{ text: string }>) {
  return (
    <span className="relative group ml-1.5 inline-flex align-middle">
      <span className="text-cream-50/25 text-[10px] cursor-help border border-cream-500/15 w-3.5 h-3.5 inline-flex items-center justify-center leading-none select-none">?</span>
      <span className="absolute bottom-full left-0 mb-1.5 px-2.5 py-1.5 bg-brown-900 border border-cream-500/20 text-cream-50/80 text-xs w-56 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20 leading-snug">
        {text}
      </span>
    </span>
  );
}

function StatCard({ label, value, sub, accent, tip }: Readonly<{ label: string; value: string | number; sub?: string; accent?: string; tip?: string }>) {
  return (
    <div className="bg-brown-800 border-2 border-cream-500/20 p-5">
      <div className="text-cream-50 text-xs uppercase tracking-wider mb-1">
        {label}{tip && <Tip text={tip} />}
      </div>
      <div className={`text-3xl font-mono font-medium ${accent || 'text-orange-500'}`}>{value}</div>
      {sub && <div className="text-cream-50/60 text-xs mt-1">{sub}</div>}
    </div>
  );
}

function Section({ title, children, className, tip }: Readonly<{ title: string; children: React.ReactNode; className?: string; tip?: string }>) {
  return (
    <div className={`bg-brown-800 border-2 border-cream-500/20 p-6 lg:px-10 ${className || ''}`}>
      <h2 className="text-cream-50 text-lg uppercase tracking-wide mb-4">
        {title}{tip && <Tip text={tip} />}
      </h2>
      {children}
    </div>
  );
}

function Bar({ value, max, color = 'bg-orange-500' }: Readonly<{ value: number; max: number; color?: string }>) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="h-4 bg-brown-900 border border-cream-500/20 flex-1">
      <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function formatAge(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${Math.round(hours)}h`;
  if (hours < 168) return `${Math.round(hours / 24 * 10) / 10}d`;
  return `${Math.round(hours / 168 * 10) / 10}w`;
}

function PieLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) {
  if (percent < 0.05) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="#F5F3EF" textAnchor="middle" dominantBaseline="central" fontSize={11} fontFamily="var(--font-mono, monospace)">
      {(percent * 100).toFixed(0)}%
    </text>
  );
}

export default function ReviewDataPage() {
  const [data, setData] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reviewerSort, setReviewerSort] = useState<ReviewerSortPeriod>('week');

  useEffect(() => {
    fetch('/api/admin/review-data')
      .then(res => {
        if (!res.ok) throw new Error('Failed to load review data');
        return res.json();
      })
      .then(setData)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const computed = useMemo(() => {
    if (!data) return null;
    const last7 = data.dailyActivity.slice(-7);
    const last30 = data.dailyActivity;
    const avg7dReviews = last7.reduce((s, d) => s + d.reviews, 0) / Math.max(last7.length, 1);
    const avg30dReviews = last30.reduce((s, d) => s + d.reviews, 0) / Math.max(last30.length, 1);
    const avg7dSubmissions = last7.reduce((s, d) => s + d.submissions, 0) / Math.max(last7.length, 1);
    const totalPending = data.queue.design.pending + data.queue.build.pending;
    const burnDays = avg7dReviews > 0 ? totalPending / avg7dReviews : Infinity;
    const velocityTrend = avg30dReviews > 0 ? ((avg7dReviews - avg30dReviews) / avg30dReviews) * 100 : 0;
    return { avg7dReviews, avg30dReviews, avg7dSubmissions, totalPending, burnDays, velocityTrend };
  }, [data]);

  const sortedReviewers = useMemo(() => {
    if (!data) return [];
    const key = reviewerSort === 'today' ? 'today' : reviewerSort === 'week' ? 'week' : reviewerSort === 'month' ? 'month' : 'total';
    return [...data.reviewers].sort((a, b) => b[key] - a[key]);
  }, [data, reviewerSort]);

  if (loading) return <div className="flex justify-center py-20"><div className="loader" /></div>;

  if (error || !data || !computed) {
    return <div className="bg-brown-800 border-2 border-cream-500/20 p-8 text-center"><p className="text-cream-50">{error || 'Failed to load review data'}</p></div>;
  }

  const adminDesignTotal = data.adminOutcomes.design.approved + data.adminOutcomes.design.returned + data.adminOutcomes.design.rejected;
  const adminBuildTotal = data.adminOutcomes.build.approved + data.adminOutcomes.build.returned + data.adminOutcomes.build.rejected;

  const designPieData = [
    { name: 'Approved', value: data.adminOutcomes.design.approved },
    { name: 'Returned', value: data.adminOutcomes.design.returned },
    { name: 'Rejected', value: data.adminOutcomes.design.rejected },
  ].filter(d => d.value > 0);

  const buildPieData = [
    { name: 'Approved', value: data.adminOutcomes.build.approved },
    { name: 'Returned', value: data.adminOutcomes.build.returned },
    { name: 'Rejected', value: data.adminOutcomes.build.rejected },
  ].filter(d => d.value > 0);

  const dowData = data.activityByDow.map(d => ({ ...d, name: DOW_LABELS[d.dow] }));
  const hourData = data.activityByHour.map(h => ({ ...h, name: `${String(h.hour).padStart(2, '0')}:00` }));
  const dailyData = data.dailyActivity.map(d => ({ ...d, label: d.date.slice(5) }));
  const weeklyData = data.weeklyActivity.map(w => ({ ...w, label: w.week.slice(5) }));
  const trendData = data.turnaroundTrend.map(t => ({ ...t, label: t.week.slice(5) }));

  return (
    <div className="space-y-8">
      <h1 className="text-orange-500 text-2xl uppercase tracking-wide">Review Data</h1>

      {/* Headline Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Queue Depth"
          value={computed.totalPending}
          sub={`${data.queue.design.pending} design · ${data.queue.build.pending} build`}
          tip="Total projects waiting for review across both design and build stages"
        />
        <StatCard
          label="Reviews Today"
          value={data.periods.today.reviews}
          sub={`${data.periods.thisWeek.reviews} this week · ${data.periods.thisMonth.reviews} this month`}
          tip="First-pass reviews completed. Admin decisions tracked separately in outcomes."
        />
        <StatCard
          label="Median Turnaround"
          value={`${data.turnaround.firstResponse.design.median}h`}
          sub={`Design ${data.turnaround.firstResponse.design.median}h · Build ${data.turnaround.firstResponse.build.median}h`}
          tip="50th percentile time from submission to first review. Half of all submissions are reviewed faster than this."
        />
        <StatCard
          label="Queue Burn Rate"
          value={computed.burnDays === Infinity ? '—' : `${Math.round(computed.burnDays * 10) / 10}d`}
          sub={`${Math.round(computed.avg7dReviews * 10) / 10} reviews/day (7d avg)`}
          tip="Days to clear the entire queue at the current 7-day review pace, assuming zero new submissions"
        />
      </div>

      {/* Velocity + Queue Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Section title="Review Velocity" tip="How fast reviews are being completed and whether that pace is changing">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-cream-50 text-xs uppercase tracking-wider">7-Day Avg<Tip text="Average reviews per day over the last 7 calendar days" /></div>
                <div className="text-orange-500 text-xl font-mono">{Math.round(computed.avg7dReviews * 10) / 10}/day</div>
              </div>
              <div>
                <div className="text-cream-50 text-xs uppercase tracking-wider">30-Day Avg</div>
                <div className="text-orange-500 text-xl font-mono">{Math.round(computed.avg30dReviews * 10) / 10}/day</div>
              </div>
            </div>
            <div>
              <div className="text-cream-50 text-xs uppercase tracking-wider">Trend<Tip text="Percentage change: positive means the 7-day pace is faster than the 30-day pace (reviews are accelerating)" /></div>
              <div className={`text-xl font-mono ${computed.velocityTrend >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                {computed.velocityTrend >= 0 ? '+' : ''}{Math.round(computed.velocityTrend)}%
              </div>
              <div className="text-cream-50/60 text-xs">7d vs 30d average</div>
            </div>
            <div>
              <div className="text-cream-50 text-xs uppercase tracking-wider">Submission Rate<Tip text="Average new project submissions per day (7-day window). Compare to review rate to see if backlog is growing." /></div>
              <div className="text-orange-500 text-xl font-mono">{Math.round(computed.avg7dSubmissions * 10) / 10}/day</div>
            </div>
          </div>
        </Section>

        <Section title="Queue Status" tip="Current snapshot of pending reviews by stage. Pre-reviewed items have passed first-pass and await admin.">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-cream-50/60 text-xs uppercase tracking-wider">
                <th className="text-left pb-2">Stage</th>
                <th className="text-right pb-2">Pending</th>
                <th className="text-right pb-2">Pre-Reviewed<Tip text="First-pass reviewer approved; awaiting admin decision" /></th>
                <th className="text-right pb-2">Unreviewed</th>
              </tr>
            </thead>
            <tbody>
              {(['design', 'build'] as const).map(stage => {
                const q = data.queue[stage];
                return (
                  <tr key={stage} className="border-t border-cream-500/10">
                    <td className="text-cream-50 py-2 uppercase">{stage}</td>
                    <td className="text-orange-500 font-mono text-right py-2">{q.pending}</td>
                    <td className="text-blue-400 font-mono text-right py-2">{q.preReviewed}</td>
                    <td className="text-cream-50 font-mono text-right py-2">{q.pending - q.preReviewed}</td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-cream-500/20">
                <td className="text-cream-50 py-2 font-medium uppercase">Total</td>
                <td className="text-orange-500 font-mono text-right py-2 font-medium">{computed.totalPending}</td>
                <td className="text-blue-400 font-mono text-right py-2 font-medium">{data.queue.design.preReviewed + data.queue.build.preReviewed}</td>
                <td className="text-cream-50 font-mono text-right py-2 font-medium">{computed.totalPending - data.queue.design.preReviewed - data.queue.build.preReviewed}</td>
              </tr>
            </tbody>
          </table>
        </Section>
      </div>

      {/* Daily Activity — Area Chart */}
      <Section title="Daily Activity (Last 30 Days)" tip="Submissions entering the queue vs reviews clearing it. The gap between orange and green shows backlog accumulation.">
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={dailyData}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="label" tick={AXIS} interval={4} />
            <YAxis tick={AXIS} width={35} />
            <RechartsTooltip content={<ChartTooltipContent />} />
            <Area type="monotone" dataKey="submissions" name="Submissions" stroke={ORANGE} fill={ORANGE} fillOpacity={0.25} strokeWidth={2} />
            <Area type="monotone" dataKey="reviews" name="Reviews" stroke={GREEN} fill={GREEN} fillOpacity={0.25} strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
        <div className="flex gap-4 mt-2 text-xs text-cream-50/60">
          <span className="flex items-center gap-1"><span className="w-3 h-3 inline-block" style={{ background: ORANGE }} /> Submissions</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 inline-block" style={{ background: GREEN }} /> Reviews</span>
        </div>
      </Section>

      {/* Weekly Activity (Bar) + Turnaround Trend (Line) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Section title="Weekly Activity (12 Weeks)" tip="Side-by-side comparison of submissions vs reviews per week. Bars should be roughly equal for a healthy queue.">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={weeklyData} barGap={2}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="label" tick={AXIS} />
              <YAxis tick={AXIS} width={35} />
              <RechartsTooltip content={<ChartTooltipContent />} />
              <RechartsBar dataKey="submissions" name="Submissions" fill={ORANGE} radius={[1, 1, 0, 0]} />
              <RechartsBar dataKey="reviews" name="Reviews" fill={GREEN} radius={[1, 1, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Section>

        <Section title="Turnaround Trend" tip="Median hours from submission to first review, per week. Falling lines mean reviews are getting faster.">
          {trendData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trendData}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="label" tick={AXIS} />
                <YAxis tick={AXIS} width={35} unit="h" />
                <RechartsTooltip content={<ChartTooltipContent />} />
                <Line type="monotone" dataKey="designMedian" name="Design Median" stroke={BLUE} strokeWidth={2} dot={{ r: 3, fill: BLUE }} />
                <Line type="monotone" dataKey="buildMedian" name="Build Median" stroke={PURPLE} strokeWidth={2} dot={{ r: 3, fill: PURPLE }} />
              </LineChart>
            </ResponsiveContainer>
          ) : <p className="text-cream-50/60 text-sm">No turnaround data yet</p>}
        </Section>
      </div>

      {/* Turnaround Details */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Section title="First Response Time" tip="Time from when a project is submitted to when any reviewer (first-pass or admin) first looks at it">
          <div className="grid grid-cols-2 gap-6">
            {(['design', 'build'] as const).map(stage => {
              const t = data.turnaround.firstResponse[stage];
              return (
                <div key={stage}>
                  <div className="text-cream-50 text-xs uppercase tracking-wider mb-2">{stage}</div>
                  <div className="space-y-1">
                    <div className="flex justify-between"><span className="text-cream-50/60 text-sm">Avg</span><span className="text-orange-500 font-mono">{t.avg}h</span></div>
                    <div className="flex justify-between"><span className="text-cream-50/60 text-sm">Median<Tip text="50th percentile — half are faster, half are slower" /></span><span className="text-orange-500 font-mono">{t.median}h</span></div>
                    <div className="flex justify-between"><span className="text-cream-50/60 text-sm">P90<Tip text="90th percentile — 90% of submissions are reviewed within this time" /></span><span className="text-orange-500 font-mono">{t.p90}h</span></div>
                    <div className="flex justify-between"><span className="text-cream-50/60 text-sm">Samples</span><span className="text-cream-50/60 font-mono">{t.sampleCount}</span></div>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>

        <Section title="Admin Decision Time" tip="Time from the latest submission to the admin's final decision (approve/return/reject). Includes wait for first-pass + admin.">
          <div className="grid grid-cols-2 gap-6">
            {(['design', 'build'] as const).map(stage => {
              const t = data.adminTurnaround[stage];
              return (
                <div key={stage}>
                  <div className="text-cream-50 text-xs uppercase tracking-wider mb-2">{stage}</div>
                  <div className="space-y-1">
                    <div className="flex justify-between"><span className="text-cream-50/60 text-sm">Avg</span><span className="text-orange-500 font-mono">{t.avg}h</span></div>
                    <div className="flex justify-between"><span className="text-cream-50/60 text-sm">Median</span><span className="text-orange-500 font-mono">{t.median}h</span></div>
                    <div className="flex justify-between"><span className="text-cream-50/60 text-sm">P90</span><span className="text-orange-500 font-mono">{t.p90}h</span></div>
                    <div className="flex justify-between"><span className="text-cream-50/60 text-sm">Samples</span><span className="text-cream-50/60 font-mono">{t.sampleCount}</span></div>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      </div>

      {/* Review Outcomes — Donut Charts + Agreement */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Section title="Design Outcomes" tip="Admin decisions on design submissions. 'Returned' means changes requested — the project stays in the pipeline.">
          {adminDesignTotal > 0 ? (
            <div>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={designPieData} dataKey="value" cx="50%" cy="50%" innerRadius={45} outerRadius={75} labelLine={false} label={PieLabel}>
                    {designPieData.map((_, i) => <Cell key={i} fill={OUTCOME_COLORS[i]} stroke="none" />)}
                  </Pie>
                  <RechartsTooltip content={<PieTooltipContent />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex justify-center gap-4 text-xs text-cream-50/60 mt-1">
                {designPieData.map((d, i) => (
                  <span key={d.name} className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 inline-block" style={{ background: OUTCOME_COLORS[i] }} />
                    {d.name} ({d.value})
                  </span>
                ))}
              </div>
            </div>
          ) : <p className="text-cream-50/60 text-sm">No data</p>}
        </Section>

        <Section title="Build Outcomes" tip="Admin decisions on build submissions (the final review stage before bits are awarded)">
          {adminBuildTotal > 0 ? (
            <div>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={buildPieData} dataKey="value" cx="50%" cy="50%" innerRadius={45} outerRadius={75} labelLine={false} label={PieLabel}>
                    {buildPieData.map((_, i) => <Cell key={i} fill={OUTCOME_COLORS[i]} stroke="none" />)}
                  </Pie>
                  <RechartsTooltip content={<PieTooltipContent />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex justify-center gap-4 text-xs text-cream-50/60 mt-1">
                {buildPieData.map((d, i) => (
                  <span key={d.name} className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 inline-block" style={{ background: OUTCOME_COLORS[i] }} />
                    {d.name} ({d.value})
                  </span>
                ))}
              </div>
            </div>
          ) : <p className="text-cream-50/60 text-sm">No data</p>}
        </Section>

        <Section title="First-Pass Agreement" tip="How often the admin's decision matches what the first-pass reviewer recommended. Higher = reviewers are well-calibrated.">
          <div className="text-orange-500 text-2xl font-mono mb-3">{data.agreement.agreementRate}%</div>
          <div className="text-cream-50/60 text-xs mb-2">{data.agreement.total} paired reviews</div>
          {data.agreement.matrix.length > 0 && (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-cream-50/60 uppercase tracking-wider">
                  <th className="text-left pb-1">First-Pass</th>
                  <th className="text-left pb-1">Admin</th>
                  <th className="text-right pb-1">Count</th>
                </tr>
              </thead>
              <tbody>
                {data.agreement.matrix.map((r, i) => (
                  <tr key={i} className={`border-t border-cream-500/10 ${r.firstPass === r.admin ? 'text-green-400' : 'text-red-400'}`}>
                    <td className="py-1">{r.firstPass}</td>
                    <td className="py-1">{r.admin}</td>
                    <td className="text-right font-mono py-1">{r.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      </div>

      {/* Backlog Age — Horizontal Bar */}
      {data.backlog.buckets.length > 0 && (
        <Section title="Backlog Age Distribution" tip="How long pending submissions have been waiting. Red items have been in the queue for over a week — these need attention.">
          <ResponsiveContainer width="100%" height={Math.max(data.backlog.buckets.length * 40, 120)}>
            <BarChart data={data.backlog.buckets} layout="vertical" barSize={20}>
              <CartesianGrid {...GRID} horizontal={false} />
              <XAxis type="number" tick={AXIS} />
              <YAxis type="category" dataKey="bucket" tick={AXIS} width={80} />
              <RechartsTooltip content={<ChartTooltipContent />} />
              <RechartsBar dataKey="count" name="Projects" radius={[0, 2, 2, 0]}>
                {data.backlog.buckets.map((_, i) => <Cell key={i} fill={BACKLOG_COLORS[Math.min(i, BACKLOG_COLORS.length - 1)]} />)}
              </RechartsBar>
            </BarChart>
          </ResponsiveContainer>
        </Section>
      )}

      {/* Reviewer Leaderboard */}
      <Section title="Reviewer Leaderboard" tip="All reviewers ranked by review count in the selected period. Avg Turn = average hours from submission to this reviewer's review.">
        <div className="flex gap-2 mb-4">
          {([['today', 'Today'], ['week', 'This Week'], ['month', 'This Month'], ['total', 'All Time']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setReviewerSort(key)}
              className={`px-3 py-1 text-xs uppercase tracking-wider border transition-colors cursor-pointer ${
                reviewerSort === key
                  ? 'border-orange-500 text-orange-500 bg-orange-500/10'
                  : 'border-cream-500/20 text-cream-50/60 hover:text-cream-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {sortedReviewers.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-cream-50/60 text-xs uppercase tracking-wider">
                  <th className="text-left pb-2 pr-2">#</th>
                  <th className="text-left pb-2 pr-4">Reviewer</th>
                  <th className="text-right pb-2 px-2"><span className={reviewerSort === 'today' ? 'text-orange-500' : ''}>Today</span></th>
                  <th className="text-right pb-2 px-2"><span className={reviewerSort === 'week' ? 'text-orange-500' : ''}>Week</span></th>
                  <th className="text-right pb-2 px-2"><span className={reviewerSort === 'month' ? 'text-orange-500' : ''}>Month</span></th>
                  <th className="text-right pb-2 px-2"><span className={reviewerSort === 'total' ? 'text-orange-500' : ''}>Total</span></th>
                  <th className="text-right pb-2 px-2">1st/Admin<Tip text="First-pass reviews vs admin reviews by this reviewer" /></th>
                  <th className="text-right pb-2 px-2">Avg Turn<Tip text="Average hours from submission creation to this reviewer completing their review" /></th>
                  <th className="text-right pb-2 px-2">Approve%<Tip text="Percentage of this reviewer's reviews that result in approval" /></th>
                  <th className="text-right pb-2 px-2">Days<Tip text="Unique calendar days this reviewer has submitted at least one review" /></th>
                </tr>
              </thead>
              <tbody>
                {sortedReviewers.filter(r => {
                  const k = reviewerSort === 'today' ? 'today' : reviewerSort === 'week' ? 'week' : reviewerSort === 'month' ? 'month' : 'total';
                  return r[k] > 0;
                }).map((r, i) => {
                  const approvePct = r.total > 0 ? Math.round((r.approved / r.total) * 100) : 0;
                  return (
                    <tr key={r.id} className="border-t border-cream-500/10">
                      <td className="text-cream-50/60 font-mono py-2 pr-2">{i + 1}</td>
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-2">
                          {r.image && <img src={r.image} alt="" className="w-5 h-5 border border-cream-500/20" />}
                          <span className="text-cream-50">{r.name}</span>
                        </div>
                      </td>
                      <td className={`text-right font-mono py-2 px-2 ${reviewerSort === 'today' ? 'text-orange-500' : 'text-cream-50'}`}>{r.today}</td>
                      <td className={`text-right font-mono py-2 px-2 ${reviewerSort === 'week' ? 'text-orange-500' : 'text-cream-50'}`}>{r.week}</td>
                      <td className={`text-right font-mono py-2 px-2 ${reviewerSort === 'month' ? 'text-orange-500' : 'text-cream-50'}`}>{r.month}</td>
                      <td className={`text-right font-mono py-2 px-2 ${reviewerSort === 'total' ? 'text-orange-500' : 'text-cream-50'}`}>{r.total}</td>
                      <td className="text-cream-50/60 text-right font-mono py-2 px-2">{r.firstPass}/{r.admin}</td>
                      <td className="text-cream-50 text-right font-mono py-2 px-2">{r.avgTurnaroundHours}h</td>
                      <td className="text-right font-mono py-2 px-2">
                        <span className={approvePct >= 70 ? 'text-green-700' : approvePct >= 40 ? 'text-yellow-600' : 'text-red-600'}>{approvePct}%</span>
                      </td>
                      <td className="text-cream-50/60 text-right font-mono py-2 px-2">{r.activeDays}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <p className="text-cream-50/60 text-sm">No reviews yet</p>}
      </Section>

      {/* Oldest Pending */}
      {data.backlog.oldest.length > 0 && (
        <Section title="Oldest Pending Submissions" tip="The 10 longest-waiting submissions currently in the queue. Red age = over 1 week, yellow = over 3 days.">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-cream-50/60 text-xs uppercase tracking-wider">
                  <th className="text-left pb-2">Project</th>
                  <th className="text-left pb-2 px-2">Stage</th>
                  <th className="text-right pb-2 px-2">Age</th>
                  <th className="text-center pb-2 px-2">Pre-Rev</th>
                  <th className="text-left pb-2 px-2">Claimed By</th>
                </tr>
              </thead>
              <tbody>
                {data.backlog.oldest.map((item, i) => (
                  <tr key={i} className="border-t border-cream-500/10">
                    <td className="py-2">
                      <a href={`/admin/review/${item.id}`} className="text-cream-50 hover:text-orange-500 transition-colors">
                        {item.projectTitle}
                      </a>
                    </td>
                    <td className={`py-2 px-2 uppercase text-xs ${item.stage === 'DESIGN' ? 'text-blue-400' : 'text-green-400'}`}>{item.stage}</td>
                    <td className={`text-right font-mono py-2 px-2 ${item.ageHours > 168 ? 'text-red-600' : item.ageHours > 72 ? 'text-yellow-600' : 'text-cream-50'}`}>
                      {formatAge(item.ageHours)}
                    </td>
                    <td className="text-center py-2 px-2">
                      {item.preReviewed ? <span className="text-blue-400">Yes</span> : <span className="text-cream-50/40">No</span>}
                    </td>
                    <td className="text-cream-50/60 py-2 px-2">{item.claimerName || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* Period Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {([
          ['Today', data.periods.today],
          ['This Week', data.periods.thisWeek],
          ['This Month', data.periods.thisMonth],
          ['All Time', data.periods.allTime],
        ] as const).map(([label, p]) => (
          <div key={label} className="bg-brown-800 border-2 border-cream-500/20 p-4">
            <div className="text-cream-50 text-xs uppercase tracking-wider mb-2">{label}</div>
            <div className="flex justify-between">
              <div>
                <div className="text-orange-500 text-lg font-mono">{p.submissions}</div>
                <div className="text-cream-50/60 text-xs">submissions</div>
              </div>
              <div className="text-right">
                <div className="text-green-700 text-lg font-mono">{p.reviews}</div>
                <div className="text-cream-50/60 text-xs">reviews</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Activity Patterns — DOW (Bar) + Hour (Area) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Section title="Activity by Day of Week" tip="All-time submissions and reviews grouped by day of week (UTC). Shows which days reviewers are most active.">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={dowData} barGap={2}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="name" tick={AXIS} />
              <YAxis tick={AXIS} width={35} />
              <RechartsTooltip content={<ChartTooltipContent />} />
              <RechartsBar dataKey="submissions" name="Submissions" fill={ORANGE} radius={[1, 1, 0, 0]} />
              <RechartsBar dataKey="reviews" name="Reviews" fill={GREEN} radius={[1, 1, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Section>

        <Section title="Activity by Hour (UTC)" tip="When submissions and reviews happen throughout the day. Peaks show when users submit and when reviewers are working.">
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={hourData}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="name" tick={AXIS} interval={3} />
              <YAxis tick={AXIS} width={35} />
              <RechartsTooltip content={<ChartTooltipContent />} />
              <Area type="monotone" dataKey="submissions" name="Submissions" stroke={ORANGE} fill={ORANGE} fillOpacity={0.2} strokeWidth={2} />
              <Area type="monotone" dataKey="reviews" name="Reviews" stroke={GREEN} fill={GREEN} fillOpacity={0.2} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </Section>
      </div>

      {/* Resubmission Patterns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {(['design', 'build'] as const).map(stage => {
          const r = data.resubmissions[stage];
          const distMax = Math.max(...r.distribution.map(d => d.projects), 1);
          return (
            <Section key={stage} title={`${stage === 'design' ? 'Design' : 'Build'} Resubmissions`} tip={`How many times projects are submitted for ${stage} review. Higher counts mean more back-and-forth before approval.`}>
              <div className="space-y-3">
                <div>
                  <div className="text-cream-50 text-xs uppercase tracking-wider">Avg Submissions per Project</div>
                  <div className="text-orange-500 text-xl font-mono">{r.avg}</div>
                </div>
                <div className="space-y-1">
                  {r.distribution.map(d => (
                    <div key={String(d.submissions)} className="flex items-center gap-2 text-sm">
                      <span className="text-cream-50 w-20">{d.submissions === 1 ? '1 (first try)' : `${d.submissions} tries`}</span>
                      <span className="text-cream-50 font-mono w-10 text-right">{d.projects}</span>
                      <Bar value={d.projects} max={distMax} color={d.submissions === 1 ? 'bg-green-600' : 'bg-orange-500'} />
                    </div>
                  ))}
                </div>
              </div>
            </Section>
          );
        })}
      </div>
    </div>
  );
}
