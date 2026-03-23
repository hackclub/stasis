'use client';

import { useState, useEffect } from 'react';

interface Stats {
  projects: {
    total: number;
    byDesignStatus: Record<string, number>;
    byBuildStatus: Record<string, number>;
    pendingDesignReview: number;
    pendingBuildReview: number;
    byTier: Record<string, number>;
  };
  users: {
    total: number;
    withProjects: number;
    fraudFlagged: number;
    signupsByMonth: { month: string; count: number }[];
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
  draft: 'text-brown-800',
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

function Bar({ value, max, color = 'bg-orange-500' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="h-4 bg-cream-200 border border-cream-400 flex-1">
      <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-cream-100 border-2 border-cream-400 p-5">
      <div className="text-brown-800 text-xs uppercase tracking-wider mb-1">{label}</div>
      <div className="text-orange-500 text-3xl font-mono font-medium">{value}</div>
      {sub && <div className="text-brown-800/60 text-xs mt-1">{sub}</div>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-cream-100 border-2 border-cream-400 p-6">
      <h2 className="text-brown-800 text-lg uppercase tracking-wide mb-4">{title}</h2>
      {children}
    </div>
  );
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
      <div className="bg-cream-100 border-2 border-cream-400 p-8 text-center">
        <p className="text-brown-800">{error || 'Failed to load stats'}</p>
      </div>
    );
  }

  const maxBadgeCount = Math.max(...Object.values(stats.badges.byType), 1);
  const maxCategoryCount = Math.max(...Object.values(stats.time.byCategory), 1);
  const maxTierCount = Math.max(...Object.values(stats.projects.byTier), 1);
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

      {/* User Funnel */}
      {stats.funnel.length > 0 && (
        <Section title="User Funnel">
          <div className="space-y-2">
            {FUNNEL_ORDER.map((step, i) => {
              const row = stats.funnel.find((f) => f.step === step);
              const count = row?.count ?? 0;
              const firstCount = stats.funnel.find((f) => f.step === FUNNEL_ORDER[0])?.count ?? 1;
              const prevCount = i > 0 ? (stats.funnel.find((f) => f.step === FUNNEL_ORDER[i - 1])?.count ?? 1) : count;
              const dropoff = i > 0 && prevCount > 0 ? Math.round((count / prevCount) * 100) : 100;
              const pctOfTotal = firstCount > 0 ? Math.round((count / firstCount) * 100) : 0;
              return (
                <div key={step}>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-brown-800 w-40">{FUNNEL_LABELS[step] ?? step}</span>
                    <span className="text-brown-800 font-mono w-14 text-right">{count}</span>
                    <div className="flex-1 h-6 bg-cream-200 border border-cream-400 relative">
                      <div
                        className="h-full bg-orange-500 transition-all"
                        style={{ width: `${pctOfTotal}%` }}
                      />
                      <span className="absolute inset-0 flex items-center justify-center text-xs font-mono text-brown-800">
                        {pctOfTotal}%
                      </span>
                    </div>
                    {i > 0 && (
                      <span className={`text-xs font-mono w-16 text-right ${dropoff < 50 ? 'text-red-600' : 'text-brown-800/60'}`}>
                        {dropoff}% kept
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
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
                    <span className="text-brown-800 font-mono w-20">{w.week.slice(5)}</span>
                    <div className="flex-1 flex gap-0.5 h-4">
                      <div className="h-full bg-orange-500" style={{ width: `${(w.projects / maxVal) * 100}%` }} title={`${w.projects} projects`} />
                      <div className="h-full bg-green-600" style={{ width: `${(w.reviews / maxVal) * 100}%` }} title={`${w.reviews} reviews`} />
                    </div>
                    <span className="text-brown-800 font-mono w-20 text-right text-xs">{w.projects}p / {w.reviews}r</span>
                  </div>
                );
              })}
              <div className="flex gap-4 mt-2 text-xs text-brown-800/60">
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
                    <span className="text-brown-800 font-mono w-20">{w.week.slice(5)}</span>
                    <div className="flex-1 space-y-0.5">
                      <div className="h-2 bg-cream-200 border border-cream-400">
                        <div className="h-full bg-yellow-600" style={{ width: `${(w.bits / maxB) * 100}%` }} />
                      </div>
                      <div className="h-2 bg-cream-200 border border-cream-400">
                        <div className="h-full bg-blue-500" style={{ width: `${(w.hours / maxH) * 100}%` }} />
                      </div>
                    </div>
                    <span className="text-brown-800 font-mono w-28 text-right text-xs">{w.bits}b / {w.hours}h</span>
                  </div>
                );
              })}
              <div className="flex gap-4 mt-2 text-xs text-brown-800/60">
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
              <div className="text-brown-800 text-xs uppercase tracking-wider">Design Reviews</div>
              <div className="text-orange-500 text-xl font-mono">{stats.reviewTurnaround.avgDesignHours}h avg</div>
              <div className="text-brown-800/60 text-xs">{stats.reviewTurnaround.medianDesignHours}h median</div>
            </div>
            <div>
              <div className="text-brown-800 text-xs uppercase tracking-wider">Build Reviews</div>
              <div className="text-orange-500 text-xl font-mono">{stats.reviewTurnaround.avgBuildHours}h avg</div>
              <div className="text-brown-800/60 text-xs">{stats.reviewTurnaround.medianBuildHours}h median</div>
            </div>
          </div>
        </Section>

        <Section title="Project Pipeline">
          <div className="space-y-3">
            <div>
              <div className="text-brown-800 text-xs uppercase tracking-wider">Create → Design Review</div>
              <div className="text-orange-500 text-xl font-mono">{stats.projectPipeline.avgDaysToDesignReview}d</div>
            </div>
            <div>
              <div className="text-brown-800 text-xs uppercase tracking-wider">Design → Build Review</div>
              <div className="text-orange-500 text-xl font-mono">{stats.projectPipeline.avgDaysToBuildReview}d</div>
            </div>
            <div>
              <div className="text-brown-800 text-xs uppercase tracking-wider">Total Lifecycle</div>
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
                    <span className="text-brown-800 w-16 font-mono">{b.bucket}</span>
                    <span className="text-brown-800 font-mono w-10 text-right">{b.count}</span>
                    <Bar value={b.count} max={maxBucket} color={b.bucket === '350-499' || b.bucket === '500+' ? 'bg-green-600' : 'bg-orange-500'} />
                  </div>
                );
              })}
              <div className="text-brown-800/60 text-xs mt-2">Green = qualified for Stasis (350+)</div>
            </div>
          ) : (
            <p className="text-brown-800/60 text-sm">No balance data yet</p>
          )}
        </Section>
      </div>

      {/* Detail Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Projects */}
        <Section title="Projects">
          <div className="space-y-4">
            <div>
              <h3 className="text-brown-800 text-xs uppercase tracking-wider mb-2">Design Status</h3>
              <div className="space-y-1">
                {Object.entries(STATUS_LABELS).map(([key, label]) => {
                  const count = stats.projects.byDesignStatus[key] ?? 0;
                  return (
                    <div key={key} className="flex items-center gap-2 text-sm">
                      <span className={`w-28 ${STATUS_COLORS[key]}`}>{label}</span>
                      <span className="text-brown-800 font-mono w-10 text-right">{count}</span>
                      <Bar value={count} max={stats.projects.total} />
                    </div>
                  );
                })}
              </div>
            </div>
            <div>
              <h3 className="text-brown-800 text-xs uppercase tracking-wider mb-2">Build Status</h3>
              <div className="space-y-1">
                {Object.entries(STATUS_LABELS).map(([key, label]) => {
                  const count = stats.projects.byBuildStatus[key] ?? 0;
                  return (
                    <div key={key} className="flex items-center gap-2 text-sm">
                      <span className={`w-28 ${STATUS_COLORS[key]}`}>{label}</span>
                      <span className="text-brown-800 font-mono w-10 text-right">{count}</span>
                      <Bar value={count} max={stats.projects.total} />
                    </div>
                  );
                })}
              </div>
            </div>
            <div>
              <h3 className="text-brown-800 text-xs uppercase tracking-wider mb-2">Tier Distribution</h3>
              <div className="space-y-1">
                {['1', '2', '3', '4', '5', 'untiered'].map((tier) => {
                  const count = stats.projects.byTier[tier] ?? 0;
                  if (count === 0 && tier === 'untiered') return null;
                  return (
                    <div key={tier} className="flex items-center gap-2 text-sm">
                      <span className="text-brown-800 w-28">
                        {tier === 'untiered' ? 'Untiered' : `Tier ${tier} (${TIER_BITS[tier]}b)`}
                      </span>
                      <span className="text-brown-800 font-mono w-10 text-right">{count}</span>
                      <Bar value={count} max={maxTierCount} />
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
            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="text-brown-800 text-xs uppercase tracking-wider">Total</div>
                <div className="text-orange-500 text-xl font-mono">{stats.users.total}</div>
              </div>
              <div>
                <div className="text-brown-800 text-xs uppercase tracking-wider">With Projects</div>
                <div className="text-orange-500 text-xl font-mono">{stats.users.withProjects}</div>
              </div>
              <div>
                <div className="text-brown-800 text-xs uppercase tracking-wider">Fraud Flagged</div>
                <div className="text-red-600 text-xl font-mono">{stats.users.fraudFlagged}</div>
              </div>
            </div>
            {stats.users.signupsByMonth.length > 0 && (
              <div>
                <h3 className="text-brown-800 text-xs uppercase tracking-wider mb-2">Signups by Month</h3>
                <div className="space-y-1">
                  {stats.users.signupsByMonth.map((row) => (
                    <div key={row.month} className="flex items-center gap-2 text-sm">
                      <span className="text-brown-800 w-20 font-mono">{row.month}</span>
                      <span className="text-brown-800 font-mono w-10 text-right">{row.count}</span>
                      <Bar value={row.count} max={maxSignupCount} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Section>

        {/* Bits Economy */}
        <Section title="Bits Economy">
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <div className="text-brown-800 text-xs uppercase tracking-wider">Distributed</div>
                <div className="text-green-700 text-xl font-mono">{stats.economy.totalDistributed.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-brown-800 text-xs uppercase tracking-wider">Spent</div>
                <div className="text-red-600 text-xl font-mono">{stats.economy.totalSpent.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-brown-800 text-xs uppercase tracking-wider">Avg Balance</div>
                <div className="text-orange-500 text-xl font-mono">{stats.economy.avgBalance}</div>
              </div>
              <div>
                <div className="text-brown-800 text-xs uppercase tracking-wider">Median Balance</div>
                <div className="text-orange-500 text-xl font-mono">{stats.economy.medianBalance}</div>
              </div>
            </div>
            <div>
              <h3 className="text-brown-800 text-xs uppercase tracking-wider mb-2">By Transaction Type</h3>
              <div className="space-y-1 text-sm">
                {Object.entries(stats.economy.byType).map(([type, data]) => (
                  <div key={type} className="flex items-center justify-between gap-4">
                    <span className="text-brown-800">{type.replace(/_/g, ' ')}</span>
                    <span className="font-mono text-brown-800">
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
                <div className="text-brown-800 text-xs uppercase tracking-wider">Claimed</div>
                <div className="text-orange-500 text-xl font-mono">{stats.time.totalHoursClaimed}h</div>
              </div>
              <div>
                <div className="text-brown-800 text-xs uppercase tracking-wider">Approved</div>
                <div className="text-green-700 text-xl font-mono">{stats.time.totalHoursApproved}h</div>
              </div>
              <div>
                <div className="text-brown-800 text-xs uppercase tracking-wider">Sessions</div>
                <div className="text-orange-500 text-xl font-mono">{stats.time.totalSessions}</div>
              </div>
              <div>
                <div className="text-brown-800 text-xs uppercase tracking-wider">Bits / Hour</div>
                <div className="text-orange-500 text-xl font-mono">
                  {stats.time.bitsPerHour !== null ? stats.time.bitsPerHour : '—'}
                </div>
                <div className="text-brown-800/60 text-xs">distributed / approved hours</div>
              </div>
            </div>
            {Object.keys(stats.time.byCategory).length > 0 && (
              <div>
                <h3 className="text-brown-800 text-xs uppercase tracking-wider mb-2">By Category</h3>
                <div className="space-y-1">
                  {Object.entries(stats.time.byCategory)
                    .sort(([, a], [, b]) => b - a)
                    .map(([cat, count]) => (
                      <div key={cat} className="flex items-center gap-2 text-sm">
                        <span className="text-brown-800 w-36">{CATEGORY_LABELS[cat] ?? cat}</span>
                        <span className="text-brown-800 font-mono w-10 text-right">{count}</span>
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
                  <span className="text-brown-800 w-36">{BADGE_LABELS[badge] ?? badge}</span>
                  <span className="text-brown-800 font-mono w-10 text-right">{count}</span>
                  <Bar value={count} max={maxBadgeCount} />
                </div>
              ))}
            {stats.badges.total === 0 && (
              <p className="text-brown-800/60 text-sm">No badges claimed yet</p>
            )}
          </div>
        </Section>

        {/* Top Reviewers */}
        <Section title="Top Reviewers">
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4 mb-4">
              {Object.entries(stats.reviews.byDecision).map(([decision, count]) => (
                <div key={decision}>
                  <div className="text-brown-800 text-xs uppercase tracking-wider">{decision.replace(/_/g, ' ')}</div>
                  <div className="text-orange-500 text-xl font-mono">{count}</div>
                </div>
              ))}
            </div>
            {stats.reviews.topReviewers.length > 0 ? (
              <div className="space-y-2">
                {stats.reviews.topReviewers.map((reviewer, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <span className="text-brown-800/60 w-5 text-right font-mono">{i + 1}</span>
                    {reviewer.image && (
                      <img src={reviewer.image} alt="" className="w-6 h-6 border border-cream-400" />
                    )}
                    <span className="text-brown-800 flex-1">{reviewer.name}</span>
                    <span className="text-orange-500 font-mono">{reviewer.count} reviews</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-brown-800/60 text-sm">No reviews yet</p>
            )}
          </div>
        </Section>

        {/* Bill of Materials */}
        <Section title="Bill of Materials">
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="text-brown-800 text-xs uppercase tracking-wider">Total Items</div>
                <div className="text-orange-500 text-xl font-mono">{stats.bom.totalItems}</div>
              </div>
              <div>
                <div className="text-brown-800 text-xs uppercase tracking-wider">Approved Cost</div>
                <div className="text-orange-500 text-xl font-mono">${stats.bom.totalApprovedCost.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-brown-800 text-xs uppercase tracking-wider">Cost / Hour</div>
                <div className="text-orange-500 text-xl font-mono">
                  {stats.bom.costPerHour !== null ? `$${stats.bom.costPerHour.toFixed(2)}` : '—'}
                </div>
                <div className="text-brown-800/60 text-xs">approved BOM / approved hours</div>
              </div>
            </div>
            <div className="space-y-1 text-sm">
              {Object.entries(stats.bom.byStatus).map(([status, count]) => (
                <div key={status} className="flex items-center justify-between">
                  <span className="text-brown-800 capitalize">{status}</span>
                  <span className="text-brown-800 font-mono">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </Section>

        {/* Qualification */}
        <Section title="Qualification Progress">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-brown-800 text-xs uppercase tracking-wider">Stasis Qualified</div>
              <div className="text-orange-500 text-2xl font-mono">{stats.qualification.qualifiedStasis}</div>
              <div className="text-brown-800/60 text-xs">350+ bits</div>
            </div>
            <div>
              <div className="text-brown-800 text-xs uppercase tracking-wider">Open Sauce Qualified</div>
              <div className="text-orange-500 text-2xl font-mono">{stats.qualification.qualifiedOpenSauce}</div>
              <div className="text-brown-800/60 text-xs">250+ bits</div>
            </div>
            <div>
              <div className="text-brown-800 text-xs uppercase tracking-wider">Users with Bits</div>
              <div className="text-orange-500 text-2xl font-mono">{stats.qualification.totalUsersWithBits}</div>
              <div className="text-brown-800/60 text-xs">balance &gt; 0</div>
            </div>
          </div>
        </Section>

      </div>
    </div>
  );
}
