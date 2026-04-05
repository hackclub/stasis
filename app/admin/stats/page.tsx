'use client';

import { useState, useEffect, useRef } from 'react';

interface Stats {
  projects: {
    total: number;
    byDesignStatus: Record<string, number>;
    byBuildStatus: Record<string, number>;
    pendingDesignReview: number;
    pendingBuildReview: number;
    byTier: Record<string, number>;
    byTierDetailed: { tier: string; approved: number; pending: number }[];
  };
  users: {
    total: number;
    withProjects: number;
    fraudFlagged: number;
    signupsByMonth: { month: string; count: number }[];
    pronouns: Record<string, number>;
    goals: Record<string, number>;
  };
  time: {
    totalHoursClaimed: number;
    totalHoursApproved: number;
    totalSessions: number;
    byCategory: Record<string, number>;
    bitsPerHour: number | null;
  };
  economy: {
    totalDistributed: number;
    totalSpent: number;
    netCirculating: number;
    avgBalance: number;
    medianBalance: number;
    byType: Record<string, { sum: number; count: number }>;
  };
  badges: {
    total: number;
    byType: Record<string, number>;
  };
  reviews: {
    totalActions: number;
    byDecision: Record<string, number>;
    topReviewers: { name: string; image: string | null; count: number }[];
  };
  bom: {
    totalItems: number;
    totalApprovedCost: number;
    costPerHour: number | null;
    byStatus: Record<string, number>;
  };
  qualification: {
    qualifiedStasis: number;
    qualifiedOpenSauce: number;
    totalUsersWithBits: number;
  };
  funnel: { step: string; count: number }[];
  bitsFunnel: { step: string; count: number }[];
  weeklyTrends: { week: string; projects: number; reviews: number; bits: number; hours: number }[];
  reviewTurnaround: {
    avgDesignHours: number;
    avgBuildHours: number;
    medianDesignHours: number;
    medianBuildHours: number;
  };
  balanceDistribution: { bucket: string; count: number }[];
  projectPipeline: {
    avgDaysToDesignReview: number;
    avgDaysToBuildReview: number;
    avgDaysTotal: number;
  };
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  in_review: 'In Review',
  approved: 'Approved',
  rejected: 'Rejected',
  update_requested: 'Update Requested',
};

const STATUS_COLORS: Record<string, string> = {
  draft: 'text-cream-50',
  in_review: 'text-orange-500',
  approved: 'text-green-700',
  rejected: 'text-red-600',
  update_requested: 'text-yellow-700',
};

const CATEGORY_LABELS: Record<string, string> = {
  FIRMWARE: 'Firmware',
  DESIGN_PLANNING: 'Design & Planning',
  PHYSICAL_BUILDING: 'Physical Building',
  SCHEMATIC: 'Schematic',
  PCB_DESIGN: 'PCB Design',
  CADING: 'CAD',
};

const TIER_BITS: Record<string, number> = {
  '1': 50, '2': 100, '3': 200, '4': 400, '5': 600,
};

const BADGE_LABELS: Record<string, string> = {
  I2C: 'I2C',
  SPI: 'SPI',
  WIFI: 'WiFi',
  BLUETOOTH: 'Bluetooth',
  OTHER_RF: 'Other RF',
  ANALOG_SENSORS: 'Analog Sensors',
  DIGITAL_SENSORS: 'Digital Sensors',
  CAD: 'CAD',
  DISPLAYS: 'Displays',
  MOTORS: 'Motors',
  CAMERAS: 'Cameras',
  METAL_MACHINING: 'Metal Machining',
  WOOD_FASTENERS: 'Wood & Fasteners',
  MACHINE_LEARNING: 'Machine Learning',
  MCU_INTEGRATION: 'MCU Integration',
  FOUR_LAYER_PCB: '4-Layer PCB',
  SOLDERING: 'Soldering',
  WOODWORKING: 'Woodworking',
};

const FUNNEL_LABELS: Record<string, string> = {
  signed_up: 'Signed Up',
  created_project: 'Created Project',
  design_submitted: 'Design Submitted',
  design_approved: 'Design Approved',
  build_submitted: 'Build Submitted',
  build_approved: 'Build Approved',
  qualified: 'Qualified (350b)',
};

const FUNNEL_ORDER = ['signed_up', 'created_project', 'design_submitted', 'design_approved', 'build_submitted', 'build_approved', 'qualified'];

const BITS_FUNNEL_LABELS: Record<string, string> = {
  bits_1: '1+ Bits',
  bits_100: '100+ Bits',
  bits_200: '200+ Bits',
  bits_300: '300+ Bits',
  bits_400: '400+ Bits',
};

const BITS_FUNNEL_ORDER = ['bits_1', 'bits_100', 'bits_200', 'bits_300', 'bits_400'];

function Bar({ value, max, color = 'bg-orange-500' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="h-4 bg-brown-900 border border-cream-500/20 flex-1">
      <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-brown-800 border-2 border-cream-500/20 p-5">
      <div className="text-cream-50 text-xs uppercase tracking-wider mb-1">{label}</div>
      <div className="text-orange-500 text-3xl font-mono font-medium">{value}</div>
      {sub && <div className="text-cream-50/60 text-xs mt-1">{sub}</div>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-brown-800 border-2 border-cream-500/20 p-6 lg:px-10">
      <h2 className="text-cream-50 text-lg uppercase tracking-wide mb-4">{title}</h2>
      {children}
    </div>
  );
}

function HorizontalFunnel({ funnel, title, labels, order, bare }: {
  funnel: { step: string; count: number }[];
  title: string;
  labels: Record<string, string>;
  order: string[];
  bare?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const tooltipPosRef = useRef({ x: 0, y: 0 });
  const tooltipTargetRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef<number>(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [tooltipVisible, setTooltipVisible] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setContainerWidth(entry.contentRect.width);
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Smooth tooltip lerp loop
  useEffect(() => {
    const lerp = 0.12;
    const tick = () => {
      tooltipPosRef.current.x += (tooltipTargetRef.current.x - tooltipPosRef.current.x) * lerp;
      tooltipPosRef.current.y += (tooltipTargetRef.current.y - tooltipPosRef.current.y) * lerp;
      if (tooltipRef.current) {
        tooltipRef.current.style.left = `${tooltipPosRef.current.x}px`;
        tooltipRef.current.style.top = `${tooltipPosRef.current.y}px`;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const steps = order.map((step, i) => {
    const row = funnel.find((f) => f.step === step);
    const count = row?.count ?? 0;
    const firstCount = funnel.find((f) => f.step === order[0])?.count ?? 1;
    const prevCount = i > 0 ? (funnel.find((f) => f.step === order[i - 1])?.count ?? 1) : count;
    const pctRetained = i > 0 && prevCount > 0 ? ((count / prevCount) * 100) : 100;
    const pctOfTotal = firstCount > 0 ? ((count / firstCount) * 100) : 0;
    const changePct = i > 0 && prevCount > 0 ? (((count - prevCount) / prevCount) * 100) : 0;
    return { step, name: labels[step] ?? step, count, pctOfTotal, pctRetained, changePct };
  });

  const n = steps.length;
  const svgH = 80;
  const firstColW = 100;
  const segW = containerWidth > 0 && n > 1 ? (containerWidth - firstColW) / (n - 1) : 100;
  const minHeightPct = 3;

  const updateTooltipTarget = (e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      tooltipTargetRef.current = {
        x: e.clientX - rect.left + 16,
        y: e.clientY - rect.top - 80,
      };
    }
  };

  const handleContainerMove = (e: React.MouseEvent) => {
    if (!containerRef.current || containerWidth <= 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    let idx: number;
    if (relX < firstColW) {
      idx = 0;
    } else {
      idx = Math.min(1 + Math.floor((relX - firstColW) / segW), n - 1);
    }
    setHoveredIdx(idx);
    setTooltipVisible(true);
    updateTooltipTarget(e);
  };

  const handleContainerLeave = () => {
    setHoveredIdx(null);
    setTooltipVisible(false);
  };

  const content = (
      <div
        ref={containerRef}
        className="w-full relative"
        onMouseMove={handleContainerMove}
        onMouseLeave={handleContainerLeave}
      >
        {containerWidth > 0 && (
          <>
            {/* Column layout */}
            <div className="flex relative">
              {steps.map((s, i) => {
                const isHover = hoveredIdx === i;
                const isFirst = i === 0;

                // Trapezoid: left edge = previous step's height, right edge = this step's height
                const prevH = i > 0
                  ? Math.max(steps[i - 1].pctOfTotal, minHeightPct)
                  : 100;
                const thisH = Math.max(s.pctOfTotal, minHeightPct);
                const leftTop = (svgH - (svgH * prevH) / 100) / 2;
                const leftBot = svgH - leftTop;
                const rightTop = (svgH - (svgH * thisH) / 100) / 2;
                const rightBot = svgH - rightTop;
                const points = `0,${leftTop} ${segW},${rightTop} ${segW},${rightBot} 0,${leftBot}`;
                const baseOpacity = 1 - i * 0.09;

                return (
                  <div
                    key={s.step}
                    className="relative flex flex-col"
                    style={{ width: isFirst ? firstColW : segW, paddingTop: 8, paddingBottom: 8 }}
                  >
                    {/* Hover highlight — full column height */}
                    <div
                      className="absolute inset-0 pointer-events-none"
                      style={{
                        background: isHover ? 'rgba(64, 53, 41, 0.06)' : 'transparent',
                        transition: 'background 150ms',
                      }}
                    />

                    {/* Vertical divider line — full column height */}
                    {i > 0 && (
                      <div
                        className="absolute top-0 bottom-0 left-0 pointer-events-none"
                        style={{
                          width: 1,
                          background: 'rgba(64, 53, 41, 0.25)',
                        }}
                      />
                    )}

                    {/* Top label — fixed height so wrapping doesn't misalign columns */}
                    <div
                      className="relative flex items-end mb-2"
                      style={{ height: 28, paddingRight: 4 }}
                    >
                      <span
                        className={`text-xs uppercase tracking-wider leading-tight w-full ${
                          isHover ? 'text-orange-500' : 'text-cream-50'
                        }`}
                        style={{
                          fontFamily: 'var(--font-mono), monospace',
                          textAlign: 'right',
                          transition: 'color 150ms',
                        }}
                      >
                        {s.name}
                      </span>
                    </div>

                    {/* Funnel area */}
                    {isFirst ? (
                      /* First column: count display instead of polygon */
                      <div
                        className="flex flex-col items-end justify-center relative"
                        style={{ height: svgH, paddingRight: 12 }}
                      >
                        <span className="text-cream-50 font-mono font-bold text-2xl leading-none">
                          {s.count}
                        </span>
                        <span className="text-cream-50/60 font-mono text-xs mt-0.5">
                          count
                        </span>
                      </div>
                    ) : (
                      /* Remaining columns: trapezoid funnel segment */
                      <svg
                        width={segW}
                        height={svgH}
                        viewBox={`0 0 ${segW} ${svgH}`}
                        preserveAspectRatio="none"
                        className="block relative"
                      >
                        <polygon
                          points={points}
                          fill="#E86A3A"
                          opacity={isHover ? Math.min(baseOpacity + 0.08, 1) : baseOpacity}
                          style={{ pointerEvents: 'none' }}
                        />
                      </svg>
                    )}

                    {/* Bottom stats */}
                    <div className="relative flex flex-col mt-2" style={{ paddingRight: 4 }}>
                      {!isFirst ? (
                        <>
                          <span
                            className="text-cream-50 font-mono text-lg font-semibold"
                            style={{ textAlign: 'right' }}
                          >
                            {s.count}
                          </span>
                          <span
                            className="text-cream-50/40 font-mono text-sm"
                            style={{ textAlign: 'right' }}
                          >
                            {s.pctOfTotal.toFixed(1)}%
                          </span>
                        </>
                      ) : (
                        <span>&nbsp;</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Tooltip */}
            <div
              ref={tooltipRef}
              className="absolute pointer-events-none z-10"
              style={{
                opacity: tooltipVisible ? 1 : 0,
                transition: 'opacity 150ms',
              }}
            >
              {hoveredIdx !== null && (() => {
                const s = steps[hoveredIdx];
                return (
                  <div
                    className="bg-brown-800 border border-cream-500/20/20 px-4 py-3 min-w-[200px]"
                    style={{ fontFamily: 'var(--font-mono), monospace' }}
                  >
                    <div className="flex justify-between gap-6 text-sm">
                      <span className="text-cream-400 text-xs uppercase tracking-wider">Step</span>
                      <span className="text-cream-100 font-medium">{s.name}</span>
                    </div>
                    <div className="flex justify-between gap-6 text-sm mt-0.5">
                      <span className="text-cream-400 text-xs uppercase tracking-wider">Count</span>
                      <span className="text-cream-100 font-medium">{s.count}</span>
                    </div>
                    {hoveredIdx > 0 && (
                      <>
                        <div className="border-t border-cream-500/20/20 my-2" />
                        <div className="flex justify-between gap-6 text-sm">
                          <span className="text-cream-400 text-xs uppercase tracking-wider">Retained</span>
                          <span className="text-cream-100">{s.pctRetained.toFixed(1)}%</span>
                        </div>
                        <div className="flex justify-between gap-6 text-sm mt-0.5">
                          <span className="text-cream-400 text-xs uppercase tracking-wider">vs. previous</span>
                          <span className={s.changePct < 0 ? 'text-red-400' : 'text-green-400'}>
                            {s.changePct > 0 ? '+' : ''}{s.changePct.toFixed(1)}%
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                );
              })()}
            </div>
          </>
        )}
      </div>
  );

  if (bare) {
    return (
      <div>
        <h2 className="text-cream-50 text-lg uppercase tracking-wide mb-4">{title}</h2>
        {content}
      </div>
    );
  }

  return <Section title={title}>{content}</Section>;
}

export default function StatsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/stats')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load stats');
        return res.json();
      })
      .then(setStats)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="loader" />
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="bg-brown-800 border-2 border-cream-500/20 p-8 text-center">
        <p className="text-cream-50">{error || 'Failed to load stats'}</p>
      </div>
    );
  }

  const maxBadgeCount = Math.max(...Object.values(stats.badges.byType), 1);
  const maxCategoryCount = Math.max(...Object.values(stats.time.byCategory), 1);
  const maxSignupCount = Math.max(...stats.users.signupsByMonth.map((s) => s.count), 1);

  return (
    <div className="space-y-8">
      <h1 className="text-orange-500 text-2xl uppercase tracking-wide">Platform Stats</h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Projects"
          value={stats.projects.total}
          sub={`${stats.projects.pendingDesignReview + stats.projects.pendingBuildReview} pending review`}
        />
        <StatCard
          label="Total Users"
          value={stats.users.total}
          sub={`${stats.users.withProjects} with projects`}
        />
        <StatCard
          label="Hours Tracked"
          value={stats.time.totalHoursClaimed.toLocaleString()}
          sub={`${stats.time.totalHoursApproved.toLocaleString()} approved`}
        />
        <StatCard
          label="Bits Circulating"
          value={stats.economy.netCirculating.toLocaleString()}
          sub={`${stats.economy.totalDistributed.toLocaleString()} distributed`}
        />
      </div>

      {/* Funnels */}
      {(stats.funnel.length > 0 || stats.bitsFunnel.length > 0) && (
        <div className="bg-brown-800 border-2 border-cream-500/20 p-6 lg:px-10">
          {stats.funnel.length > 0 && (
            <HorizontalFunnel funnel={stats.funnel} title="User Funnel" labels={FUNNEL_LABELS} order={FUNNEL_ORDER} bare />
          )}
          {stats.funnel.length > 0 && stats.bitsFunnel.length > 0 && (
            <div className="border-t border-cream-500/20 my-6" />
          )}
          {stats.bitsFunnel.length > 0 && (
            <HorizontalFunnel funnel={stats.bitsFunnel} title="Bits Funnel" labels={BITS_FUNNEL_LABELS} order={BITS_FUNNEL_ORDER} bare />
          )}
        </div>
      )}

      {/* Weekly Trends */}
      {stats.weeklyTrends.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Section title="Weekly Projects & Reviews">
            <div className="space-y-1">
              {stats.weeklyTrends.map((w) => {
                const maxP = Math.max(...stats.weeklyTrends.map((t) => t.projects), 1);
                const maxR = Math.max(...stats.weeklyTrends.map((t) => t.reviews), 1);
                const maxVal = Math.max(maxP, maxR, 1);
                return (
                  <div key={w.week} className="flex items-center gap-2 text-xs">
                    <span className="text-cream-50 font-mono w-20">{w.week.slice(5)}</span>
                    <div className="flex-1 flex gap-0.5 h-4">
                      <div className="h-full bg-orange-500" style={{ width: `${(w.projects / maxVal) * 100}%` }} title={`${w.projects} projects`} />
                      <div className="h-full bg-green-600" style={{ width: `${(w.reviews / maxVal) * 100}%` }} title={`${w.reviews} reviews`} />
                    </div>
                    <span className="text-cream-50 font-mono w-20 text-right text-xs">{w.projects}p / {w.reviews}r</span>
                  </div>
                );
              })}
              <div className="flex gap-4 mt-2 text-xs text-cream-50/60">
                <span className="flex items-center gap-1"><span className="w-3 h-3 bg-orange-500 inline-block" /> Projects</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-600 inline-block" /> Reviews</span>
              </div>
            </div>
          </Section>

          <Section title="Weekly Bits & Hours">
            <div className="space-y-1">
              {stats.weeklyTrends.map((w) => {
                const maxB = Math.max(...stats.weeklyTrends.map((t) => t.bits), 1);
                const maxH = Math.max(...stats.weeklyTrends.map((t) => t.hours), 1);
                return (
                  <div key={w.week} className="flex items-center gap-2 text-xs">
                    <span className="text-cream-50 font-mono w-20">{w.week.slice(5)}</span>
                    <div className="flex-1 space-y-0.5">
                      <div className="h-2 bg-brown-900 border border-cream-500/20">
                        <div className="h-full bg-yellow-600" style={{ width: `${(w.bits / maxB) * 100}%` }} />
                      </div>
                      <div className="h-2 bg-brown-900 border border-cream-500/20">
                        <div className="h-full bg-blue-500" style={{ width: `${(w.hours / maxH) * 100}%` }} />
                      </div>
                    </div>
                    <span className="text-cream-50 font-mono w-28 text-right text-xs">{w.bits}b / {w.hours}h</span>
                  </div>
                );
              })}
              <div className="flex gap-4 mt-2 text-xs text-cream-50/60">
                <span className="flex items-center gap-1"><span className="w-3 h-2 bg-yellow-600 inline-block" /> Bits</span>
                <span className="flex items-center gap-1"><span className="w-3 h-2 bg-blue-500 inline-block" /> Hours</span>
              </div>
            </div>
          </Section>
        </div>
      )}

      {/* Review Performance & Project Pipeline */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Section title="Review Turnaround">
          <div className="space-y-3">
            <div>
              <div className="text-cream-50 text-xs uppercase tracking-wider">Design Reviews</div>
              <div className="text-orange-500 text-xl font-mono">{stats.reviewTurnaround.avgDesignHours}h avg</div>
              <div className="text-cream-50/60 text-xs">{stats.reviewTurnaround.medianDesignHours}h median</div>
            </div>
            <div>
              <div className="text-cream-50 text-xs uppercase tracking-wider">Build Reviews</div>
              <div className="text-orange-500 text-xl font-mono">{stats.reviewTurnaround.avgBuildHours}h avg</div>
              <div className="text-cream-50/60 text-xs">{stats.reviewTurnaround.medianBuildHours}h median</div>
            </div>
          </div>
        </Section>

        <Section title="Project Pipeline">
          <div className="space-y-3">
            <div>
              <div className="text-cream-50 text-xs uppercase tracking-wider">Create → Design Review</div>
              <div className="text-orange-500 text-xl font-mono">{stats.projectPipeline.avgDaysToDesignReview}d</div>
            </div>
            <div>
              <div className="text-cream-50 text-xs uppercase tracking-wider">Design → Build Review</div>
              <div className="text-orange-500 text-xl font-mono">{stats.projectPipeline.avgDaysToBuildReview}d</div>
            </div>
            <div>
              <div className="text-cream-50 text-xs uppercase tracking-wider">Total Lifecycle</div>
              <div className="text-orange-500 text-xl font-mono">{stats.projectPipeline.avgDaysTotal}d</div>
            </div>
          </div>
        </Section>

        <Section title="Balance Distribution">
          {stats.balanceDistribution.length > 0 ? (
            <div className="space-y-1">
              {stats.balanceDistribution.map((b) => {
                const maxBucket = Math.max(...stats.balanceDistribution.map((d) => d.count), 1);
                return (
                  <div key={b.bucket} className="flex items-center gap-2 text-sm">
                    <span className="text-cream-50 w-16 font-mono">{b.bucket}</span>
                    <span className="text-cream-50 font-mono w-10 text-right">{b.count}</span>
                    <Bar value={b.count} max={maxBucket} color={b.bucket === '350-499' || b.bucket === '500+' ? 'bg-green-600' : 'bg-orange-500'} />
                  </div>
                );
              })}
              <div className="text-cream-50/60 text-xs mt-2">Green = qualified for Stasis (350+)</div>
            </div>
          ) : (
            <p className="text-cream-50/60 text-sm">No balance data yet</p>
          )}
        </Section>
      </div>

      {/* Detail Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Projects */}
        <Section title="Projects">
          <div className="space-y-4">
            <div>
              <h3 className="text-cream-50 text-xs uppercase tracking-wider mb-2">Design Status</h3>
              <div className="space-y-1">
                {Object.entries(STATUS_LABELS).map(([key, label]) => {
                  const count = stats.projects.byDesignStatus[key] ?? 0;
                  return (
                    <div key={key} className="flex items-center gap-2 text-sm">
                      <span className={`w-28 ${STATUS_COLORS[key]}`}>{label}</span>
                      <span className="text-cream-50 font-mono w-10 text-right">{count}</span>
                      <Bar value={count} max={stats.projects.total} />
                    </div>
                  );
                })}
              </div>
            </div>
            <div>
              <h3 className="text-cream-50 text-xs uppercase tracking-wider mb-2">Build Status</h3>
              <div className="space-y-1">
                {Object.entries(STATUS_LABELS).map(([key, label]) => {
                  const count = stats.projects.byBuildStatus[key] ?? 0;
                  return (
                    <div key={key} className="flex items-center gap-2 text-sm">
                      <span className={`w-28 ${STATUS_COLORS[key]}`}>{label}</span>
                      <span className="text-cream-50 font-mono w-10 text-right">{count}</span>
                      <Bar value={count} max={stats.projects.total} />
                    </div>
                  );
                })}
              </div>
            </div>
            <div>
              <h3 className="text-cream-50 text-xs uppercase tracking-wider mb-2">Tier Distribution</h3>
              <div className="flex items-center gap-3 mb-2 text-xs">
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 bg-green-600" /> Approved</span>
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 bg-orange-500" /> Pending</span>
              </div>
              <div className="space-y-1">
                {['1', '2', '3', '4', '5', 'untiered'].map((tier) => {
                  const detail = stats.projects.byTierDetailed.find((d) => d.tier === tier);
                  const approved = detail?.approved ?? 0;
                  const pending = detail?.pending ?? 0;
                  const total = approved + pending;
                  if (total === 0 && tier === 'untiered') return null;
                  const maxCount = Math.max(...stats.projects.byTierDetailed.map((d) => d.approved + d.pending), 1);
                  const approvedPct = maxCount > 0 ? (approved / maxCount) * 100 : 0;
                  const pendingPct = maxCount > 0 ? (pending / maxCount) * 100 : 0;
                  return (
                    <div key={tier} className="flex items-center gap-2 text-sm">
                      <span className="text-cream-50 w-28">
                        {tier === 'untiered' ? 'Untiered' : `Tier ${tier} (${TIER_BITS[tier]}b)`}
                      </span>
                      <span className="text-cream-50 font-mono w-10 text-right">{total}</span>
                      <div className="h-4 bg-brown-900 border border-cream-500/20 flex-1 flex">
                        <div className="h-full bg-green-600" style={{ width: `${approvedPct}%` }} title={`${approved} approved`} />
                        <div className="h-full bg-orange-500" style={{ width: `${pendingPct}%` }} title={`${pending} pending`} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </Section>

        {/* Users */}
        <Section title="Users">
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <div className="text-cream-50 text-xs uppercase tracking-wider">Total</div>
                <div className="text-orange-500 text-xl font-mono">{stats.users.total}</div>
              </div>
              <div>
                <div className="text-cream-50 text-xs uppercase tracking-wider">With Projects</div>
                <div className="text-orange-500 text-xl font-mono">{stats.users.withProjects}</div>
              </div>
              <div>
                <div className="text-cream-50 text-xs uppercase tracking-wider">Fraud Flagged</div>
                <div className="text-red-600 text-xl font-mono">{stats.users.fraudFlagged}</div>
              </div>
            </div>
            {stats.users.signupsByMonth.length > 0 && (
              <div>
                <h3 className="text-cream-50 text-xs uppercase tracking-wider mb-2">Signups by Month</h3>
                <div className="space-y-1">
                  {stats.users.signupsByMonth.map((row) => (
                    <div key={row.month} className="flex items-center gap-2 text-sm">
                      <span className="text-cream-50 w-20 font-mono">{row.month}</span>
                      <span className="text-cream-50 font-mono w-10 text-right">{row.count}</span>
                      <Bar value={row.count} max={maxSignupCount} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Gender Ratio */}
            <div className="border-t border-brown-300 pt-4">
              <h3 className="text-cream-50 text-xs uppercase tracking-wider font-semibold mb-3">Gender Ratio</h3>
              <div className="space-y-1">
                {Object.entries(stats.users.pronouns).map(([pronouns, count]) => (
                  <div key={pronouns} className="flex items-center gap-2 text-sm">
                    <span className="text-cream-50 w-28 truncate">{pronouns}</span>
                    <span className="text-cream-50 font-mono w-10 text-right">{count}</span>
                    <Bar value={count} max={Math.max(...Object.values(stats.users.pronouns))} />
                  </div>
                ))}
              </div>
            </div>

            {/* Goal */}
            <div className="border-t border-brown-300 pt-4">
              <h3 className="text-cream-50 text-xs uppercase tracking-wider font-semibold mb-3">Goal</h3>
              <div className="space-y-1">
                {Object.entries(stats.users.goals).map(([goal, count]) => {
                  const label = goal === 'stasis' ? 'Stasis' : goal === 'opensauce' ? 'Open Sauce' : goal === 'prizes' ? 'Prizes' : goal;
                  return (
                    <div key={goal} className="flex items-center gap-2 text-sm">
                      <span className="text-cream-50 w-28 truncate">{label}</span>
                      <span className="text-cream-50 font-mono w-10 text-right">{count}</span>
                      <Bar value={count} max={Math.max(...Object.values(stats.users.goals))} />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </Section>

        {/* Bits Economy */}
        <Section title="Bits Economy">
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <div className="text-cream-50 text-xs uppercase tracking-wider">Distributed</div>
                <div className="text-green-700 text-xl font-mono">{stats.economy.totalDistributed.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-cream-50 text-xs uppercase tracking-wider">Spent</div>
                <div className="text-red-600 text-xl font-mono">{stats.economy.totalSpent.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-cream-50 text-xs uppercase tracking-wider">Avg Balance</div>
                <div className="text-orange-500 text-xl font-mono">{stats.economy.avgBalance}</div>
              </div>
              <div>
                <div className="text-cream-50 text-xs uppercase tracking-wider">Median Balance</div>
                <div className="text-orange-500 text-xl font-mono">{stats.economy.medianBalance}</div>
              </div>
            </div>
            <div>
              <h3 className="text-cream-50 text-xs uppercase tracking-wider mb-2">By Transaction Type</h3>
              <div className="space-y-1 text-sm">
                {Object.entries(stats.economy.byType).map(([type, data]) => (
                  <div key={type} className="flex items-center justify-between gap-4">
                    <span className="text-cream-50">{type.replace(/_/g, ' ')}</span>
                    <span className="font-mono text-cream-50">
                      {data.sum > 0 ? '+' : ''}{data.sum.toLocaleString()} bits ({data.count} txns)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Section>

        {/* Time Tracking */}
        <Section title="Time Tracking">
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <div className="text-cream-50 text-xs uppercase tracking-wider">Claimed</div>
                <div className="text-orange-500 text-xl font-mono">{stats.time.totalHoursClaimed}h</div>
              </div>
              <div>
                <div className="text-cream-50 text-xs uppercase tracking-wider">Approved</div>
                <div className="text-green-700 text-xl font-mono">{stats.time.totalHoursApproved}h</div>
              </div>
              <div>
                <div className="text-cream-50 text-xs uppercase tracking-wider">Sessions</div>
                <div className="text-orange-500 text-xl font-mono">{stats.time.totalSessions}</div>
              </div>
              <div>
                <div className="text-cream-50 text-xs uppercase tracking-wider">Bits / Hour</div>
                <div className="text-orange-500 text-xl font-mono">
                  {stats.time.bitsPerHour !== null ? stats.time.bitsPerHour : '—'}
                </div>
                <div className="text-cream-50/60 text-xs">distributed / approved hours</div>
              </div>
            </div>
            {Object.keys(stats.time.byCategory).length > 0 && (
              <div>
                <h3 className="text-cream-50 text-xs uppercase tracking-wider mb-2">By Category</h3>
                <div className="space-y-1">
                  {Object.entries(stats.time.byCategory)
                    .sort(([, a], [, b]) => b - a)
                    .map(([cat, count]) => (
                      <div key={cat} className="flex items-center gap-2 text-sm">
                        <span className="text-cream-50 w-36">{CATEGORY_LABELS[cat] ?? cat}</span>
                        <span className="text-cream-50 font-mono w-10 text-right">{count}</span>
                        <Bar value={count} max={maxCategoryCount} />
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        </Section>

        {/* Badges */}
        <Section title="Badges">
          <div className="space-y-1">
            {Object.entries(stats.badges.byType)
              .sort(([, a], [, b]) => b - a)
              .map(([badge, count]) => (
                <div key={badge} className="flex items-center gap-2 text-sm">
                  <span className="text-cream-50 w-36">{BADGE_LABELS[badge] ?? badge}</span>
                  <span className="text-cream-50 font-mono w-10 text-right">{count}</span>
                  <Bar value={count} max={maxBadgeCount} />
                </div>
              ))}
            {stats.badges.total === 0 && (
              <p className="text-cream-50/60 text-sm">No badges claimed yet</p>
            )}
          </div>
        </Section>

        {/* Top Reviewers */}
        <Section title="Top Reviewers">
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              {Object.entries(stats.reviews.byDecision).map(([decision, count]) => (
                <div key={decision}>
                  <div className="text-cream-50 text-xs uppercase tracking-wider">{decision.replace(/_/g, ' ')}</div>
                  <div className="text-orange-500 text-xl font-mono">{count}</div>
                </div>
              ))}
            </div>
            {stats.reviews.topReviewers.length > 0 ? (
              <div className="space-y-2">
                {stats.reviews.topReviewers.map((reviewer, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <span className="text-cream-50/60 w-5 text-right font-mono">{i + 1}</span>
                    {reviewer.image && (
                      <img src={reviewer.image} alt="" className="w-6 h-6 border border-cream-500/20" />
                    )}
                    <span className="text-cream-50 flex-1">{reviewer.name}</span>
                    <span className="text-orange-500 font-mono">{reviewer.count} reviews</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-cream-50/60 text-sm">No reviews yet</p>
            )}
          </div>
        </Section>

        {/* Bill of Materials */}
        <Section title="Bill of Materials">
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <div className="text-cream-50 text-xs uppercase tracking-wider">Total Items</div>
                <div className="text-orange-500 text-xl font-mono">{stats.bom.totalItems}</div>
              </div>
              <div>
                <div className="text-cream-50 text-xs uppercase tracking-wider">Approved Cost</div>
                <div className="text-orange-500 text-xl font-mono">${stats.bom.totalApprovedCost.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-cream-50 text-xs uppercase tracking-wider">Cost / Hour</div>
                <div className="text-orange-500 text-xl font-mono">
                  {stats.bom.costPerHour !== null ? `$${stats.bom.costPerHour.toFixed(2)}` : '—'}
                </div>
                <div className="text-cream-50/60 text-xs">approved BOM / approved hours</div>
              </div>
            </div>
            <div className="space-y-1 text-sm">
              {Object.entries(stats.bom.byStatus).map(([status, count]) => (
                <div key={status} className="flex items-center justify-between">
                  <span className="text-cream-50 capitalize">{status}</span>
                  <span className="text-cream-50 font-mono">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </Section>

        {/* Qualification */}
        <Section title="Qualification Progress">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <div className="text-cream-50 text-xs uppercase tracking-wider">Stasis Qualified</div>
              <div className="text-orange-500 text-2xl font-mono">{stats.qualification.qualifiedStasis}</div>
              <div className="text-cream-50/60 text-xs">350+ bits</div>
            </div>
            <div>
              <div className="text-cream-50 text-xs uppercase tracking-wider">Open Sauce Qualified</div>
              <div className="text-orange-500 text-2xl font-mono">{stats.qualification.qualifiedOpenSauce}</div>
              <div className="text-cream-50/60 text-xs">250+ bits</div>
            </div>
            <div>
              <div className="text-cream-50 text-xs uppercase tracking-wider">Users with Bits</div>
              <div className="text-orange-500 text-2xl font-mono">{stats.qualification.totalUsersWithBits}</div>
              <div className="text-cream-50/60 text-xs">balance &gt; 0</div>
            </div>
          </div>
        </Section>

      </div>
    </div>
  );
}
