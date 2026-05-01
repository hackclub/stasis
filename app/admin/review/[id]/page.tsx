'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { getTierById, TIERS } from '@/lib/tiers';
import { bomItemTotal } from '@/lib/format';
import { fixMarkdownImages } from '@/lib/markdown';
import { useHotkeys, type HotkeyBinding } from '@/lib/hotkeys';
import HotkeyOverlay from '@/app/components/HotkeyOverlay';
import { ConfirmModal } from '@/app/components/ConfirmModal';

const KiCanvasEmbed = dynamic(() => import('@/app/components/KiCanvasEmbed'), { ssr: false });

interface KiCadProject {
  name: string;
  dir: string;
  projectFile: string | null;
  schematics: string[];
  boards: string[];
}

interface KiCadFilesResponse {
  owner: string;
  repo: string;
  branch: string;
  projects: KiCadProject[];
}

const MDPreview = dynamic(
  () => import('@uiw/react-md-editor').then((mod) => mod.default.Markdown),
  { ssr: false }
);

// ─── Types ───────────────────────────────────────────────────────────

interface ReviewData {
  submission: {
    id: string;
    stage: string;
    notes: string | null;
    preReviewed: boolean;
    createdAt: string;
    githubChecks: Array<{ key: string; label: string; passed: boolean; detail?: string }> | null;
    githubChecksAt: string | null;
    project: {
      id: string;
      title: string;
      description: string | null;
      coverImage: string | null;
      githubRepo: string | null;
      tier: number | null;
      tags: string[];
      noBomNeeded: boolean;
       starterProjectId: string | null;
      cartScreenshots: string[];
      totalWorkUnits: number;
      entryCount: number;
      avgWorkUnits: number;
      maxWorkUnits: number;
      minWorkUnits: number;
      bomCost: number;
      requestedAmount: number | null;
      bomTax: number | null;
      bomShipping: number | null;
      costPerHour: number | null;
      bitsPerHour: number | null;
      user: { id: string; name: string | null; email: string; image: string | null; slackId: string | null; fraudConvicted: boolean; verificationStatus: string | null };
      workSessions: Array<{
        id: string;
        title: string;
        hoursClaimed: number;
        hoursApproved: number | null;
        content: string | null;
        categories: string[];
        createdAt: string;
        media: Array<{ id: string; type: string; url: string }>;
      }>;
      badges: Array<{ id: string; badge: string; claimedAt: string; grantedAt: string | null }>;
      bomItems: Array<{
        id: string;
        name: string;
        purpose: string | null;
        quantity: number | null;
        totalCost: number;
        link: string | null;
        status: string;
      }>;
      hackatimeProjects: Array<{
        id: string;
        hackatimeProject: string;
        totalSeconds: number;
        hoursApproved: number | null;
      }>;
      firmwareHours: number;
      journalHours: number;
      allJournalHours: number;
      designHours: number;
      designReviewedAt: string | null;
      submissions: Array<{ id: string; stage: string; createdAt: string }>;
    };
    reviews: Array<{
      id: string;
      reviewerId: string;
      reviewerName: string | null;
      result: string;
      isAdminReview: boolean;
      feedback: string;
      reason: string | null;
      invalidated: boolean;
      workUnitsOverride: number | null;
      tierOverride: number | null;
      grantOverride: number | null;
      categoryOverride: string | null;
      frozenWorkUnits: number | null;
      frozenEntryCount: number | null;
      frozenFundingAmount: number | null;
      frozenTier: number | null;
      frozenReviewerNote: string | null;
      createdAt: string;
    }>;
    claim: { id: string; reviewerId: string; expiresAt: string } | null;
    claimedByOther: boolean;
  };
  conflicts: Array<{ id: string; project: { id: string; title: string } }>;
  reviewerNote: string;
  hackatimeTrustLevel: string | null;
  navigation: { nextId: string | null; prevId: string | null };
  isAdmin: boolean;
  reviewerId: string;
}

// ─── Shortcut Data ──────────────────────────────────────────────────

const HOURS_BY_GUIDE: Record<string, number> = {
  'squeak': 5,
  'blinky': 5,
};

const DEDUCTION_BY_GUIDE: Record<string, number> = {
  'blinky': 10,
};

const JUSTIFICATION_SHORTCUTS = [
  { label: 'High quality devboard', text: 'This project follows our devboard guide which typically takes 15-20 hours to complete. This project however, is signifigantly higher quality so I am going to deflate only a bit and keep it above that range.' },
  { label: 'Normal devboard', text: 'This project follows our devboard guide which typically takes 15-20 hours to complete. This project is a normal devboard within this range so I am deflating it only a bit.' },
  { label: 'Low hour devboard', text: 'This project follows our devboard guide which typically takes 15-20 hours to complete. This project reported below this range so I am deflating less.' },
  { label: 'High quality keyboard', text: 'This project is a typical full-sized keyboard with a PCB and case which takes around 15-20 hours to complete. This project however, is signifigantly higher quality so I am going to deflate only a bit and keep it above that range.' },
  { label: 'Normal keyboard', text: 'This project is a typical full-sized keyboard with a PCB and case which takes around 15-20 hours to complete. This project is a normal keyboard within this range so I am deflating it only a bit.' },
  { label: 'Low hour keyboard', text: 'This project is a typical full-sized keyboard with a PCB and case which takes around 15-20 hours to complete. This project reported below this range so I am deflating less.' },
  { label: 'Generic low', text: 'This project has a very high quality journal and all of the hours are logged. I am deflating this just to be safe.' },
  { label: 'Generic high', text: 'This project has a very high quality and is shipped. However, some of the journal entries are long and don\'t make sense so I am deflating it more' },
  { label: 'Small', text: 'This is a relatively small project and not that crazy. It seems to be one of the users first and is definitely shipped. Because of that, I am approving regardless.' },
  { label: 'Magic', text: 'This project has a incredubly high quality project and all of the hours are logged. I would say this project would qualify as magic. I am deflating this just to be safe.' },
  { label: 'Trusted', text: 'This is a very trusted user and I have talked with this person multiple times about this project and seen them working on it throughout Slack.' },
  { label: 'Spotify', text: 'This project follows the Spotify display guide which is projected to take 5-10 hours by the guide\'s author, Ducc. This is either right in that range or was deflated to be within it.' },
  { label: 'Blinky', text: 'This is a Blinky Board guide which takes around 5 hours by historical data from running this guide at events. This is either right in that range or was deflated to be within it.' },
];

const FEEDBACK_SHORTCUTS = [
  { label: 'Optimize BOM', text: 'The parts list for this project can be cost optimized. Please look into alternative vendors for your parts. Please read this to help: https://blueprint.hackclub.com/resources/parts-sourcing.' },
  { label: 'Missing PCB source', text: 'This is a PCB project but you seem to be missing some or all of the required PCB files such as .kicad_pcb, .kicad_pro, .kicad_sch, and gerbers. Please read the submission guidelines at https://blueprint.hackclub.com/about/submission-guidelines.' },
  { label: 'Missing CAD files', text: 'This project has CAD but seems to be missing some or all of the required CAD files such as .step, .f3d, etc. Please read the submission guidelines before you resubmit. https://blueprint.hackclub.com/about/submission-guidelines.' },
  { label: 'Missing/Bad ReadME', text: 'Please make a more polished ReadME.md on your GitHub. Your ReadMe should include multiple photos of your project, photos of the full assembly such as PCB+Case, and have a good description of your project. Please read the submission guidelines before you resubmit. https://blueprint.hackclub.com/about/submission-guidelines.' },
  { label: 'Journal', text: 'Your journal needs to show the step-by-step process you took in making this project. Please break your larger journal entires into multiple smaller ones, show the steps you took, and explain it better.' },
];

// ─── Module-level review-data cache ──────────────────────────────────
// Keyed on the full request path (id + query string). The prefetch effect
// populates it; fetchData reads from it for instant paint and then revalidates
// in the background (stale-while-revalidate). Browsers don't HTTP-cache
// auth-bound JSON without explicit Cache-Control headers, so we DIY this.
// Module-level means it survives client-side route transitions.
//
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const REVIEW_DATA_CACHE: Map<string, { data: any; at: number }> = new Map();
const REVIEW_CACHE_TTL_MS = 60_000; // serve stale-up-to-60s, revalidate after

// Auxiliary caches for slow third-party-backed reads (GitHub, Airtable).
// Both are idempotent and don't depend on filterQS.
const KICAD_FILES_CACHE: Map<string, KiCadFilesResponse | null> = new Map();
const AIRTABLE_CHECK_CACHE: Map<string, boolean> = new Map();

// Dedupe claim POSTs per submission id. When the user mashes j/k, repeat
// mounts of the same id were firing concurrent claim POSTs that hit the
// unique-(submissionId) constraint and 500'd. Track which ids we've claimed
// in this session and skip the POST if it's already done.
const CLAIMED_IDS: Set<string> = new Set();
// Pending DELETEs: a quick j-then-k re-mount cancels a pending DELETE
// instead of letting it race the new POST.
const PENDING_RELEASE: Map<string, ReturnType<typeof setTimeout>> = new Map();

// Skip-set: track project IDs the reviewer has explicitly skipped this session
// so the Skip button advances through the queue instead of cycling between the
// same two in_review projects.
const SKIP_STORAGE_KEY = 'reviewSkippedIds';
function getSkippedIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = sessionStorage.getItem(SKIP_STORAGE_KEY);
    return new Set<string>(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}
function saveSkippedIds(s: Set<string>) {
  if (typeof window === 'undefined') return;
  try { sessionStorage.setItem(SKIP_STORAGE_KEY, JSON.stringify([...s])); } catch {}
}
function clearSkippedIds() {
  if (typeof window === 'undefined') return;
  try { sessionStorage.removeItem(SKIP_STORAGE_KEY); } catch {}
}

// ─── Component ───────────────────────────────────────────────────────

export default function ReviewDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const filterCategory = searchParams.get('category') || '';
  const filterGuide = searchParams.get('guide') || '';
  const filterNameSearch = searchParams.get('nameSearch') || '';
  const filterSort = searchParams.get('sort') || '';
  const filterPronouns = searchParams.get('pronouns') || '';

  // Build query string for filter-aware navigation
  const filterQS = (() => {
    const qp = new URLSearchParams();
    if (filterCategory) qp.set('category', filterCategory);
    if (filterGuide) qp.set('guide', filterGuide);
    if (filterNameSearch) qp.set('nameSearch', filterNameSearch);
    if (filterSort) qp.set('sort', filterSort);
    if (filterPronouns) qp.set('pronouns', filterPronouns);
    const s = qp.toString();
    return s ? `?${s}` : '';
  })();

  // Initialize data + loading from cache on first render so we never flash a
  // spinner when the prefetch already populated it.
  const initialCacheKey = `${id}${(() => {
    const qp = new URLSearchParams();
    if (filterCategory) qp.set('category', filterCategory);
    if (filterGuide) qp.set('guide', filterGuide);
    if (filterNameSearch) qp.set('nameSearch', filterNameSearch);
    if (filterSort) qp.set('sort', filterSort);
    if (filterPronouns) qp.set('pronouns', filterPronouns);
    const s = qp.toString();
    return s ? `?${s}` : '';
  })()}`;
  const [data, setData] = useState<ReviewData | null>(
    () => (REVIEW_DATA_CACHE.get(initialCacheKey)?.data as ReviewData | undefined) ?? null
  );
  const [loading, setLoading] = useState(() => !REVIEW_DATA_CACHE.has(initialCacheKey));
  const [renderedId, setRenderedId] = useState(id);
  const [submitting, setSubmitting] = useState(false);
  const [showWorkLog, setShowWorkLog] = useState(false);
  const [moveConfirm, setMoveConfirm] = useState(false);
  const [ghChecks, setGhChecks] = useState<Array<{ key: string; label: string; passed: boolean; detail?: string }> | null>(null);
  const [ghChecksLoading, setGhChecksLoading] = useState(false);
  const [ghChecksError, setGhChecksError] = useState<string | null>(null);
  const [ghChecksAt, setGhChecksAt] = useState<string | null>(null);
  const [ghChecksCached, setGhChecksCached] = useState(false);
  const [kicadFiles, setKicadFiles] = useState<KiCadFilesResponse | null>(null);
  const [expandedKicad, setExpandedKicad] = useState<Set<number>>(new Set());

  // Form state
  const [feedback, setFeedback] = useState('');
  const [reason, setReason] = useState('');
  const [workUnitsOverride, setWorkUnitsOverride] = useState('');
  const [tierOverride, setTierOverride] = useState('');
  const [grantOverride, setGrantOverride] = useState('');
  const [additionalBitsDeduction, setAdditionalBitsDeduction] = useState('');
  const [categoryOverride, setCategoryOverride] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const noteTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showFraudWarning, setShowFraudWarning] = useState(true);
  const [flaggingFraud, setFlaggingFraud] = useState(false);
  const [airtableDuplicate, setAirtableDuplicate] = useState(false);
  const [modifyingPreReview, setModifyingPreReview] = useState(false);
  const [checkedJustifications, setCheckedJustifications] = useState<Set<number>>(new Set());
  const [checkedFeedback, setCheckedFeedback] = useState<Set<number>>(new Set());
  // Optimistic navigation: track in-flight decision + the most-recent successful one
  // (drives a brief toast on the next page) + the error from a failed decision
  // restored from sessionStorage when we route back.
  const [pendingDecision, setPendingDecision] = useState<{ result: string } | null>(null);
  const [recentDecision, setRecentDecision] = useState<{ result: string; at: number } | null>(null);
  const [failedDecisionError, setFailedDecisionError] = useState<string | null>(null);
  const [hotkeyOverlayOpen, setHotkeyOverlayOpen] = useState(false);
  const [rejectArmed, setRejectArmed] = useState(false);
  const [blankFeedbackPending, setBlankFeedbackPending] = useState<{ result: string } | null>(null);
  const feedbackRef = useRef<HTMLTextAreaElement | null>(null);
  const reasonRef = useRef<HTMLTextAreaElement | null>(null);
  const internalNoteRef = useRef<HTMLTextAreaElement | null>(null);

  // When the URL id changes (j/k), reset state SYNCHRONOUSLY during render
  // to whatever's in cache — otherwise React would render one frame with the
  // new id but old data, which manifests as a stale-data flash.
  if (renderedId !== id) {
    setRenderedId(id);
    const cached = REVIEW_DATA_CACHE.get(initialCacheKey);
    const cachedData = (cached?.data as ReviewData | undefined) ?? null;
    setData(cachedData);
    setLoading(!cached);
    setInternalNote(cachedData?.reviewerNote ?? '');
    setKicadFiles(KICAD_FILES_CACHE.get(id) ?? null);
    setAirtableDuplicate(AIRTABLE_CHECK_CACHE.get(id) ?? false);
    if (cachedData?.submission?.githubChecks) {
      setGhChecks(cachedData.submission.githubChecks);
      setGhChecksAt(cachedData.submission.githubChecksAt);
      setGhChecksCached(true);
    } else {
      setGhChecks(null);
      setGhChecksAt(null);
      setGhChecksCached(false);
    }
    setFailedDecisionError(null);
  }

  const fetchData = useCallback(async () => {
    const cacheKey = `${id}${filterQS}`;
    const cached = REVIEW_DATA_CACHE.get(cacheKey);
    const fresh = cached && Date.now() - cached.at < REVIEW_CACHE_TTL_MS;

    // If we have a cached payload, paint it immediately — no spinner, no wait.
    if (cached) {
      setData(cached.data);
      setInternalNote(cached.data.reviewerNote || '');
      setLoading(false);
    } else {
      setLoading(true);
    }

    // Skip the network entirely when we have a *fresh* hit.
    if (fresh) return;

    try {
      const res = await fetch(`/api/reviews/${id}${filterQS}`);
      if (res.ok) {
        const d = await res.json();
        REVIEW_DATA_CACHE.set(cacheKey, { data: d, at: Date.now() });
        setData(d);
        setInternalNote(d.reviewerNote || '');
      } else if (res.status === 404 || res.status === 400) {
        router.push('/admin/review');
      }
    } catch (err) {
      console.error('Failed to fetch review data:', err);
    } finally {
      setLoading(false);
    }
  }, [id, router, filterQS]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Check if project already exists in Airtable Unified DB. Cached because
  // it's idempotent and Airtable API calls are slow (200-500ms typical).
  useEffect(() => {
    if (!id) return;
    if (AIRTABLE_CHECK_CACHE.has(id)) {
      setAirtableDuplicate(AIRTABLE_CHECK_CACHE.get(id)!);
      return;
    }
    fetch(`/api/reviews/${id}/airtable-check`)
      .then((res) => res.ok ? res.json() : null)
      .then((d) => {
        const found = !!d?.found;
        AIRTABLE_CHECK_CACHE.set(id, found);
        if (found) setAirtableDuplicate(true);
      })
      .catch(() => {});
  }, [id]);

  // Auto-populate work units override based on starter project guide
  useEffect(() => {
    if (!data) return;
    const guideId = data.submission.project.starterProjectId;
    if (guideId && HOURS_BY_GUIDE[guideId] && !workUnitsOverride) {
      setWorkUnitsOverride(String(HOURS_BY_GUIDE[guideId]));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.submission.project.starterProjectId]);

  // Auto-populate additional bits deduction for kit-based guides (e.g. Blinky)
  useEffect(() => {
    if (!data) return;
    const guideId = data.submission.project.starterProjectId;
    if (guideId && DEDUCTION_BY_GUIDE[guideId] && !additionalBitsDeduction) {
      setAdditionalBitsDeduction(String(DEDUCTION_BY_GUIDE[guideId]));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.submission.project.starterProjectId]);


  // Fetch GitHub checks. On mount we seed from the cached values in the
  // initial payload; the Refresh button calls this with refresh=true.
  const loadGhChecks = useCallback((opts?: { refresh?: boolean }) => {
    setGhChecksLoading(true);
    setGhChecksError(null);
    const url = `/api/reviews/${id}/checks${opts?.refresh ? '?refresh=1' : ''}`;
    fetch(url)
      .then(async (res) => {
        const d = await res.json();
        if (res.ok && d.checks) {
          setGhChecks(d.checks);
          setGhChecksAt(d.checkedAt ?? null);
          setGhChecksCached(Boolean(d.cached));
        } else {
          setGhChecksError(d.error || d.detail || `HTTP ${res.status}`);
        }
      })
      .catch((err) => setGhChecksError(String(err)))
      .finally(() => setGhChecksLoading(false));
  }, [id]);

  // Prefetch the next/prev review payloads into the module-level cache so
  // j/k and post-approve navigation are instant. Browsers don't HTTP-cache
  // auth-bound JSON, so we cache the parsed payload ourselves.
  useEffect(() => {
    if (!data?.navigation) return;
    const { nextId, prevId } = data.navigation;

    function lowFetch(url: string) {
      try {
        // priority hint isn't yet in lib.dom.d.ts
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return fetch(url, { priority: 'low' } as any);
      } catch {
        return fetch(url);
      }
    }

    function prime(targetId: string) {
      const cacheKey = `${targetId}${filterQS}`;
      const existing = REVIEW_DATA_CACHE.get(cacheKey);
      if (!existing || Date.now() - existing.at >= REVIEW_CACHE_TTL_MS) {
        lowFetch(`/api/reviews/${targetId}${filterQS}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => { if (d) REVIEW_DATA_CACHE.set(cacheKey, { data: d, at: Date.now() }); })
          .catch(() => {});
      }
      if (!KICAD_FILES_CACHE.has(targetId)) {
        lowFetch(`/api/reviews/${targetId}/kicad-files`)
          .then(async (r) => (r.ok ? (r.json() as Promise<KiCadFilesResponse>) : null))
          .then((d) => KICAD_FILES_CACHE.set(targetId, d))
          .catch(() => {});
      }
      if (!AIRTABLE_CHECK_CACHE.has(targetId)) {
        lowFetch(`/api/reviews/${targetId}/airtable-check`)
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => AIRTABLE_CHECK_CACHE.set(targetId, !!d?.found))
          .catch(() => {});
      }
      // Warm the RSC layout shell too.
      router.prefetch(`/admin/review/${targetId}${filterQS}`);
    }

    if (nextId) prime(nextId);

    if (prevId) {
      const win = window as Window & { requestIdleCallback?: (cb: () => void) => number };
      const schedule = win.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 200));
      schedule(() => prime(prevId));
    }
  }, [data?.navigation, router, filterQS]);


  // Restore form state if the previous decision failed and routed us back here.
  // Snapshot lives in sessionStorage keyed on submission id.
  useEffect(() => {
    if (!id) return;
    const key = `failedDecision:${id}`;
    const raw = sessionStorage.getItem(key);
    if (!raw) return;
    try {
      const snap = JSON.parse(raw) as {
        feedback?: string; reason?: string;
        workUnitsOverride?: string; tierOverride?: string; grantOverride?: string;
        additionalBitsDeduction?: string; categoryOverride?: string;
        error?: string;
      };
      if (snap.feedback != null) setFeedback(snap.feedback);
      if (snap.reason != null) setReason(snap.reason);
      if (snap.workUnitsOverride != null) setWorkUnitsOverride(snap.workUnitsOverride);
      if (snap.tierOverride != null) setTierOverride(snap.tierOverride);
      if (snap.grantOverride != null) setGrantOverride(snap.grantOverride);
      if (snap.additionalBitsDeduction != null) setAdditionalBitsDeduction(snap.additionalBitsDeduction);
      if (snap.categoryOverride != null) setCategoryOverride(snap.categoryOverride);
      setFailedDecisionError(snap.error ?? 'Decision did not save');
    } catch {
      /* ignore corrupt snapshot */
    }
    sessionStorage.removeItem(key);
  }, [id]);

  // Auto-clear the "✓ approved" toast after 3s
  useEffect(() => {
    if (!recentDecision) return;
    const t = setTimeout(() => setRecentDecision(null), 3000);
    return () => clearTimeout(t);
  }, [recentDecision]);

  // Block tab close while a decision is in flight (server is still committing).
  useEffect(() => {
    if (!pendingDecision) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [pendingDecision]);

  // Seed GH checks from the initial payload — no extra fetch on mount.
  // If the submission has no cached checks, leave the panel empty until
  // the reviewer clicks Refresh (avoids a slow GitHub API call we don't need).
  useEffect(() => {
    if (!data?.submission.id) return;
    if (data.submission.githubChecks) {
      setGhChecks(data.submission.githubChecks);
      setGhChecksAt(data.submission.githubChecksAt);
      setGhChecksCached(true);
    } else {
      setGhChecks(null);
      setGhChecksAt(null);
      setGhChecksCached(false);
    }
  }, [data?.submission.id, data?.submission.githubChecks, data?.submission.githubChecksAt]);

  // Fire KiCad-file lookup and claim POST as soon as we have the URL id —
  // do NOT wait for fetchData() to round-trip first. Each request races
  // against the others and races against fetchData() so the page becomes
  // interactive faster.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    if (KICAD_FILES_CACHE.has(id)) {
      const cached = KICAD_FILES_CACHE.get(id);
      if (cached) setKicadFiles(cached);
    } else {
      fetch(`/api/reviews/${id}/kicad-files`)
        .then(async (res) => (res.ok ? (res.json() as Promise<KiCadFilesResponse>) : null))
        .then((d) => {
          KICAD_FILES_CACHE.set(id, d);
          if (!cancelled && d) setKicadFiles(d);
        })
        .catch(() => {});
    }

    // If we had a pending DELETE for this id (user pressed k after j), cancel
    // it — we're back on the page and want to keep the claim.
    const pending = PENDING_RELEASE.get(id);
    if (pending) {
      clearTimeout(pending);
      PENDING_RELEASE.delete(id);
    }

    if (!CLAIMED_IDS.has(id)) {
      CLAIMED_IDS.add(id);
      fetch(`/api/reviews/${id}/claim`, { method: 'POST' })
        .then((res) => {
          // 409 = claimed by another reviewer; fetchData will surface it on
          // the next natural refresh. 401/403/5xx = ignore; the lock is
          // best-effort and the page works without it.
          if (!res.ok) CLAIMED_IDS.delete(id);
        })
        .catch(() => { CLAIMED_IDS.delete(id); });
    }

    return () => {
      cancelled = true;
      // Schedule the DELETE; a rapid re-mount of the same id will cancel it.
      const idToRelease = id;
      const handle = setTimeout(() => {
        PENDING_RELEASE.delete(idToRelease);
        if (CLAIMED_IDS.has(idToRelease)) {
          CLAIMED_IDS.delete(idToRelease);
          fetch(`/api/reviews/${idToRelease}/claim`, { method: 'DELETE' }).catch(() => {});
        }
      }, 200);
      PENDING_RELEASE.set(idToRelease, handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function saveNote(content: string) {
    try {
      await fetch(`/api/reviews/${id}/notes`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
    } catch (err) {
      console.error('Failed to save note:', err);
    }
  }

  function toggleJustification(idx: number) {
    setCheckedJustifications(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      const texts = JUSTIFICATION_SHORTCUTS.filter((_, i) => next.has(i)).map(s => s.text);
      setReason(texts.join('\n\n'));
      return next;
    });
  }

  function toggleFeedback(idx: number) {
    setCheckedFeedback(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      const texts = FEEDBACK_SHORTCUTS.filter((_, i) => next.has(i)).map(s => s.text);
      setFeedback(texts.join('\n\n'));
      return next;
    });
  }

  function handleNoteChange(value: string) {
    setInternalNote(value);
    if (noteTimeout.current) clearTimeout(noteTimeout.current);
    noteTimeout.current = setTimeout(() => saveNote(value), 1000);
  }

  async function submitReview(result: string, overrides?: {
    feedback?: string;
    reason?: string;
    workUnitsOverride?: number;
    tierOverride?: number;
    grantOverride?: number;
    skipConfirm?: boolean;
  }) {
    const rawFeedback = (overrides?.feedback ?? feedback).trim();
    const effectiveFeedback = rawFeedback || 'Awesome project!';

    if (result === 'REJECTED' && !overrides?.skipConfirm && !confirm('Are you sure you want to permanently reject this submission?')) {
      return;
    }

    if (!rawFeedback && result !== 'REJECTED' && !overrides?.skipConfirm) {
      setBlankFeedbackPending({ result });
      return;
    }

    if (!data) return;

    const body: Record<string, unknown> = {
      result,
      feedback: effectiveFeedback,
      reason: overrides?.reason ?? (reason.trim() || undefined),
      submissionId: data.submission.id,
    };
    if (overrides?.workUnitsOverride != null) body.workUnitsOverride = overrides.workUnitsOverride;
    else if (workUnitsOverride) body.workUnitsOverride = parseFloat(workUnitsOverride);
    if (overrides?.tierOverride != null) body.tierOverride = overrides.tierOverride;
    else if (tierOverride) body.tierOverride = parseInt(tierOverride);
    if (overrides?.grantOverride != null) body.grantOverride = overrides.grantOverride;
    else if (grantOverride) body.grantOverride = parseInt(grantOverride);
    if (additionalBitsDeduction) body.additionalBitsDeduction = parseInt(additionalBitsDeduction);
    if (categoryOverride && data?.isAdmin) body.categoryOverride = categoryOverride;

    // Snapshot form state so we can restore it if the submit fails.
    const snapshot = {
      result,
      feedback,
      reason,
      workUnitsOverride,
      tierOverride,
      grantOverride,
      additionalBitsDeduction,
      categoryOverride,
    };
    const originalId = id;

    // Optimistic navigation: flip the URL immediately. The POST fires in the background.
    setSubmitting(true);
    setPendingDecision({ result });
    if (data.navigation.nextId) {
      router.push(`/admin/review/${data.navigation.nextId}${filterQS}`);
    } else {
      router.push('/admin/review');
    }

    try {
      const res = await fetch(`/api/reviews/${id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        // The reviewed project is no longer in_review; drop its cache entry
        // so a back-nav refetches (and gets a 400 / redirect to queue).
        REVIEW_DATA_CACHE.delete(`${originalId}${filterQS}`);
        // Successful — show a brief toast on the new page.
        setRecentDecision({ result, at: Date.now() });
      } else {
        let errorMsg = 'Failed to submit review';
        try {
          const err = await res.json();
          errorMsg = err.error || errorMsg;
        } catch {
          /* non-JSON response */
        }
        // Save the failed snapshot in sessionStorage and route back to the original page.
        // The destination page checks sessionStorage on mount and restores the form
        // values + shows the error banner.
        sessionStorage.setItem(
          `failedDecision:${originalId}`,
          JSON.stringify({ ...snapshot, error: errorMsg, at: Date.now() })
        );
        router.push(`/admin/review/${originalId}${filterQS}`);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Network error';
      sessionStorage.setItem(
        `failedDecision:${originalId}`,
        JSON.stringify({ ...snapshot, error: errorMsg, at: Date.now() })
      );
      router.push(`/admin/review/${originalId}${filterQS}`);
    } finally {
      setSubmitting(false);
      setPendingDecision(null);
    }
  }

  async function handleMoveQueue() {
    if (!data) return;
    const targetStage = data.submission.stage === 'DESIGN' ? 'BUILD' : 'DESIGN';
    try {
      const res = await fetch(`/api/reviews/${id}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetStage }),
      });
      if (res.ok) {
        setMoveConfirm(false);
        await fetchData();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to move queue');
      }
    } catch {
      alert('Failed to move queue');
    }
  }

  async function skipToNext() {
    fetch(`/api/reviews/${id}/claim`, { method: 'DELETE' }).catch(() => {});
    // Track skipped IDs so repeated Skip clicks actually advance instead of
    // ping-ponging between the same handful of in_review projects.
    const skipped = getSkippedIds();
    skipped.add(id);
    saveSkippedIds(skipped);
    try {
      const params = new URLSearchParams();
      if (filterCategory) params.set('category', filterCategory);
      if (filterGuide) params.set('guide', filterGuide);
      if (filterPronouns) params.set('pronouns', filterPronouns);
      params.set('limit', '50');
      const res = await fetch(`/api/reviews?${params}`);
      if (res.ok) {
        const { items } = await res.json();
        let next = items.find((p: { id: string }) => p.id !== id && !skipped.has(p.id));
        if (!next) {
          // Exhausted the queue — reset so the user can cycle again.
          clearSkippedIds();
          const fresh = new Set<string>([id]);
          saveSkippedIds(fresh);
          next = items.find((p: { id: string }) => p.id !== id);
        }
        if (next) {
          router.push(`/admin/review/${next.id}${filterQS}`);
          return;
        }
      }
    } catch {}
    router.push('/admin/review');
  }

  async function markAsFraud() {
    if (!data) return;
    if (!confirm('Are you sure you want to mark this user as fraud? This will suspend their account.')) return;
    setFlaggingFraud(true);
    try {
      const res = await fetch(`/api/admin/users/${data.submission.project.user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fraudConvicted: true }),
      });
      if (res.ok) {
        await fetchData();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to flag user as fraud');
      }
    } finally {
      setFlaggingFraud(false);
    }
  }

  // Detail-page hotkeys. Re-built each render — cheap relative to typing-driven
  // re-renders, and avoids stale closure pitfalls with submitReview/data.
  const detailHotkeys: HotkeyBinding[] = [
    { key: 'Shift+?', description: 'Show keyboard shortcuts', group: 'General', handler: () => setHotkeyOverlayOpen((v) => !v) },
    { key: '$mod+Enter', description: 'Approve', group: 'Decision', runInInputs: true, handler: () => { if (!submitting && data && !data.submission.claimedByOther) submitReview('APPROVED'); } },
    { key: '$mod+Shift+Enter', description: 'Approve and advance', group: 'Decision', runInInputs: true, handler: () => { if (!submitting && data && !data.submission.claimedByOther) submitReview('APPROVED'); } },
    { key: 'Shift+R', description: 'Return / request changes', group: 'Decision', handler: () => { if (!submitting && data && !data.submission.claimedByOther) submitReview('RETURNED'); } },
    {
      key: 'Shift+X',
      description: 'Reject (press twice within 5s)',
      group: 'Decision',
      handler: () => {
        if (submitting || !data || data.submission.claimedByOther) return;
        if (rejectArmed) {
          setRejectArmed(false);
          submitReview('REJECTED', { skipConfirm: true });
        } else {
          setRejectArmed(true);
          setTimeout(() => setRejectArmed(false), 5000);
        }
      },
    },
    { key: 'j', description: 'Next submission', group: 'Navigation', handler: () => { if (data?.navigation.nextId) router.push(`/admin/review/${data.navigation.nextId}${filterQS}`); } },
    { key: 'k', description: 'Previous submission', group: 'Navigation', handler: () => { if (data?.navigation.prevId) router.push(`/admin/review/${data.navigation.prevId}${filterQS}`); } },
    { key: 's', description: 'Skip to next', group: 'Navigation', handler: () => { skipToNext(); } },
    { key: 'f', description: 'Focus feedback textarea', group: 'Form', handler: () => feedbackRef.current?.focus() },
    { key: 'r', description: 'Focus reason textarea', group: 'Form', handler: () => reasonRef.current?.focus() },
    { key: 'n', description: 'Focus internal note', group: 'Form', handler: () => internalNoteRef.current?.focus() },
  ];

  useHotkeys(detailHotkeys, hotkeyOverlayOpen);

  if (loading || !data) {
    return (
      <div className="text-center py-12">
        <p className="text-cream-50">Loading submission...</p>
        <HotkeyOverlay open={hotkeyOverlayOpen} bindings={detailHotkeys} onClose={() => setHotkeyOverlayOpen(false)} />
      </div>
    );
  }

  const { submission, conflicts, hackatimeTrustLevel, isAdmin, reviewerId } = data;
  const project = submission.project;
  const tierInfo = project.tier ? getTierById(project.tier) : null;
  const claimedByOther = submission.claimedByOther;
  const claimExpiry = submission.claim ? new Date(submission.claim.expiresAt) : null;

  return (
    <div className="space-y-6">
      <HotkeyOverlay open={hotkeyOverlayOpen} bindings={detailHotkeys} onClose={() => setHotkeyOverlayOpen(false)} />
      <ConfirmModal
        isOpen={blankFeedbackPending !== null}
        title="No Feedback to Submitter"
        message={"The 'Feedback to Submitter' field is empty. The submitter will see a generic 'Awesome project!' message."}
        confirmLabel="Submit anyway"
        cancelLabel="Go back"
        onConfirm={() => {
          const pending = blankFeedbackPending;
          setBlankFeedbackPending(null);
          if (pending) submitReview(pending.result, { skipConfirm: true });
        }}
        onCancel={() => {
          setBlankFeedbackPending(null);
          feedbackRef.current?.focus();
        }}
      />
      {rejectArmed && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-red-500 border-2 border-red-300 px-5 py-3 shadow-lg">
          <p className="text-white text-xs uppercase tracking-wider font-bold">⚠ Press Shift+X again within 5 seconds to confirm rejection</p>
        </div>
      )}
      {/* ── Failed-decision banner (decision did not save) ── */}
      {failedDecisionError && (
        <div className="bg-red-500/15 border-2 border-red-500 p-4 flex items-center justify-between">
          <div>
            <p className="text-red-400 font-medium text-sm uppercase">Decision did not save</p>
            <p className="text-red-400/80 text-xs mt-1">{failedDecisionError}</p>
          </div>
          <button
            onClick={() => setFailedDecisionError(null)}
            className="px-3 py-1.5 text-xs uppercase border border-red-500 text-red-400 hover:bg-red-500/10 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── Recent-decision toast (last successful approve/return/reject) ── */}
      {recentDecision && (
        <div className="bg-green-500/10 border border-green-500/40 px-3 py-2">
          <p className="text-green-400 text-xs uppercase tracking-wider">
            ✓ Last decision committed: {recentDecision.result.toLowerCase()}
          </p>
        </div>
      )}

      {/* ── Claim Warning Banner ── */}
      {claimedByOther && (
        <div className="bg-red-500/10 border-2 border-red-500/40 p-4 flex items-center justify-between">
          <div>
            <p className="text-red-400 font-medium text-sm uppercase">Claimed by another reviewer</p>
            {claimExpiry && (
              <p className="text-red-400/80 text-xs mt-1">
                Expires: {claimExpiry.toLocaleTimeString()}
              </p>
            )}
          </div>
          <button
            onClick={skipToNext}
            className="px-3 py-1.5 text-xs uppercase border border-red-500 text-red-400 hover:bg-red-500/10 cursor-pointer"
          >
            Skip to Next
          </button>
        </div>
      )}

      {/* ── Airtable Duplicate Warning ── */}
      {airtableDuplicate && (
        <div className="bg-red-500/15 border-2 border-red-500 p-6">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-3xl">⚠️</span>
            <h2 className="text-red-400 text-lg uppercase tracking-wider font-bold">Already in Unified DB</h2>
          </div>
          <p className="text-red-400/80 text-sm">
            This project&apos;s GitHub URL already exists as a record in the Airtable Unified DB. It may have already been submitted and approved through another YSWS program. Verify before approving.
          </p>
        </div>
      )}

      {/* ── Fraud / Trust Warning ── */}
      {project.user.fraudConvicted && showFraudWarning && (
        <div className="bg-red-500/15 border-2 border-red-500 p-6 relative">
          <button
            onClick={() => setShowFraudWarning(false)}
            className="absolute top-2 right-3 text-red-400 hover:text-red-300 text-lg cursor-pointer"
          >
            ×
          </button>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-3xl">⚠️</span>
            <h2 className="text-red-400 text-lg uppercase tracking-wider font-bold">Fraud Alert</h2>
          </div>
          <p className="text-red-400/80 text-sm">
            This user has been flagged for fraud. Their account is suspended. Exercise extreme caution when reviewing this submission.
          </p>
        </div>
      )}

      {hackatimeTrustLevel === 'red' && !project.user.fraudConvicted && (
        <div className="bg-red-500/10 border-2 border-red-500/40 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">🔴</span>
              <div>
                <p className="text-red-400 font-medium text-sm uppercase">Hackatime Trust: Convicted</p>
                <p className="text-red-400/80 text-xs mt-1">This user has been convicted on Hackatime for fraud. They should be marked as fraud on this platform too.</p>
              </div>
            </div>
            <button
              onClick={markAsFraud}
              disabled={flaggingFraud}
              className="px-3 py-1.5 text-xs uppercase bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
            >
              {flaggingFraud ? 'Flagging...' : 'Mark as Fraud'}
            </button>
          </div>
        </div>
      )}

      {/* ── Navigation Bar ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link
            href="/admin/review"
            className="px-3 py-1.5 text-xs uppercase tracking-wider border border-cream-500/20 text-cream-50 hover:border-orange-500 transition-colors"
          >
            Back to Queue
          </Link>
          <button
            onClick={skipToNext}
            className="px-3 py-1.5 text-xs uppercase tracking-wider border border-cream-500/20 text-cream-50 hover:border-orange-500 transition-colors cursor-pointer"
          >
            Skip
          </button>
          {(filterCategory || filterGuide || filterNameSearch || filterSort) && (
            <span className="px-2 py-0.5 text-xs uppercase tracking-wider bg-orange-500/10 border border-orange-500 text-orange-500">
              Filtering: {[filterCategory, filterGuide, filterNameSearch && `name:${filterNameSearch}`, filterSort].filter(Boolean).join(' + ') || 'All'}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <div className="relative">
              <button
                onClick={() => setMoveConfirm(!moveConfirm)}
                className="px-3 py-1.5 text-xs uppercase tracking-wider border border-orange-500 text-orange-500 hover:bg-orange-500/10 cursor-pointer"
              >
                Move to {submission.stage === 'DESIGN' ? 'Build' : 'Design'} Queue
              </button>
              {moveConfirm && (
                <div className="absolute right-0 top-full mt-1 bg-brown-800 border-2 border-orange-500 p-3 z-10 w-64">
                  <p className="text-cream-50 text-xs mb-2">Move this submission to the {submission.stage === 'DESIGN' ? 'Build' : 'Design'} queue?</p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleMoveQueue}
                      className="px-2 py-1 text-xs bg-orange-500 text-white hover:bg-orange-600 cursor-pointer"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => setMoveConfirm(false)}
                      className="px-2 py-1 text-xs border border-cream-500/20 text-cream-50 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Submission Overview Card ── */}
      <div className="bg-brown-800 border border-cream-500/20 rounded overflow-hidden">
        {project.coverImage && (
          <div className="w-full h-48 overflow-hidden border-b border-cream-500/20">
            <img src={project.coverImage} alt="" className="w-full h-full object-cover" />
          </div>
        )}
        <div className="p-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <p className="text-cream-200 text-xs uppercase tracking-wider">{submission.id}</p>
              <h1 className="text-cream-50 text-2xl uppercase tracking-wide">{project.title}</h1>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <span className={`text-xs uppercase px-2 py-0.5 ${
                submission.stage === 'DESIGN' ? 'bg-blue-500/20 text-blue-400' : 'bg-green-500/20 text-green-400'
              }`}>
                {submission.stage}
              </span>
              {tierInfo && (
                <span className={`text-xs px-2 py-0.5 ${
                  { 1: 'bg-cream-500/20 text-cream-300', 2: 'bg-green-500/20 text-green-400', 3: 'bg-blue-500/20 text-blue-400', 4: 'bg-purple-500/20 text-purple-400', 5: 'bg-orange-500/20 text-orange-400' }[project.tier!] || ''
                }`}>
                  {tierInfo.name} ({tierInfo.bits} bits)
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 mb-4">
            {project.user.image && (
              <img src={project.user.image} alt="" className="w-8 h-8 rounded-full" />
            )}
            <div>
              <div className="flex items-center gap-2">
                <Link href={`/admin/users?search=${encodeURIComponent(project.user.email)}`} className="text-cream-50 text-sm hover:text-orange-400 transition-colors underline decoration-cream-500/30 hover:decoration-orange-400">{project.user.name || project.user.email}</Link>
                {project.user.fraudConvicted ? (
                  <span className="text-xs px-2 py-0.5 bg-red-600 text-white uppercase">Fraud</span>
                ) : hackatimeTrustLevel === 'red' ? (
                  <span className="text-xs px-2 py-0.5 bg-red-500/20 text-red-400 border border-red-500/40 uppercase">Convicted</span>
                ) : hackatimeTrustLevel === 'green' ? (
                  <span className="text-xs px-2 py-0.5 bg-green-500/20 text-green-400 border border-green-500/40 uppercase">Trusted</span>
                ) : (
                  <span className="text-xs px-2 py-0.5 bg-brown-900 text-cream-50 border border-cream-500/20 uppercase">Unscored</span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-cream-200 text-xs">
                  Submitted {new Date(submission.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
                {project.user.slackId && (
                  <>
                    <span className="text-cream-500 text-xs">·</span>
                    <span className="text-cream-300 text-xs font-mono">{project.user.slackId}</span>
                    <a
                      href={`https://hackclub.enterprise.slack.com/team/${project.user.slackId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs px-2 py-0.5 bg-cream-500/10 hover:bg-cream-500/20 text-cream-200 border border-cream-500/20 rounded transition-colors"
                    >
                      DM on Slack
                    </a>
                  </>
                )}
              </div>
            </div>
          </div>

          {submission.stage === 'BUILD' && project.designHours > 0 && (
            <div className="mb-3 px-3 py-2 bg-green-500/10 border border-green-500/30 text-sm">
              <span className="text-green-400">Build review:</span>
              <span className="text-cream-50 ml-2">Showing {project.journalHours}h logged after design approval</span>
              <span className="text-cream-500 ml-1">({project.designHours}h design + {project.journalHours}h build = {project.allJournalHours}h total)</span>
            </div>
          )}

          <div className="grid grid-cols-3 sm:grid-cols-6 gap-4 mb-4 text-sm">
            <div>
              <p className="text-cream-200 text-xs uppercase">{submission.stage === 'BUILD' ? 'Build Hours' : 'Work Units'}</p>
              <p className="text-cream-50">{Math.round(project.totalWorkUnits * 100) / 100}h</p>
            </div>
            <div>
              <p className="text-cream-200 text-xs uppercase">Entries</p>
              <p className="text-cream-50">{project.entryCount}</p>
            </div>
            <div>
              <p className="text-cream-200 text-xs uppercase">BOM Cost</p>
              <p className="text-cream-50">${project.bomCost.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-cream-200 text-xs uppercase">BOM $/h</p>
              <p className="text-cream-50">{project.costPerHour !== null ? `$${project.costPerHour.toFixed(2)}` : '—'}</p>
            </div>
            <div>
              <p className="text-cream-200 text-xs uppercase">Bits/h</p>
              <p className="text-orange-500">{project.bitsPerHour !== null ? project.bitsPerHour : '—'}</p>
            </div>
            <div>
              <p className="text-cream-200 text-xs uppercase">Funding</p>
              <p className="text-cream-50">{tierInfo ? `${tierInfo.bits} bits` : 'No tier'}</p>
            </div>
          </div>

          {project.description && (
            <div className="mb-4">
              <p className="text-cream-200 text-xs uppercase mb-1">Description</p>
              <p className="text-cream-50 text-sm whitespace-pre-wrap">{project.description}</p>
            </div>
          )}

          {project.githubRepo && (
            <div className="mb-4">
              <a
                href={project.githubRepo}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-orange-500 hover:text-orange-400 underline"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
                {project.githubRepo}
              </a>
            </div>
          )}

          {project.tags.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              {project.tags.map((tag) => (
                <span key={tag} className="text-xs bg-brown-900 text-cream-50 px-2 py-0.5">{tag}</span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── GitHub Checks Card ── */}
      <div className="bg-brown-800 border border-cream-500/20 rounded p-6">
        <div className="flex items-center justify-between mb-4 gap-4">
          <h2 className="text-cream-50 text-sm uppercase tracking-wider">GitHub Repo Checks</h2>
          <div className="flex items-center gap-3 text-xs text-cream-200">
            {ghChecksAt && (
              <span>
                {ghChecksCached ? 'cached' : 'fresh'} · {new Date(ghChecksAt).toLocaleString()}
              </span>
            )}
            <button
              onClick={() => loadGhChecks({ refresh: true })}
              disabled={ghChecksLoading}
              className="underline hover:text-cream-50 disabled:opacity-50"
            >
              {ghChecksLoading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>
        {ghChecksLoading && !ghChecks ? (
          <p className="text-cream-200 text-sm">Running checks...</p>
        ) : ghChecks ? (
          <div className="space-y-2">
            {ghChecks.map((check) => (
              <div key={check.key} className="flex items-center gap-2 text-sm">
                <span className={check.passed ? 'text-green-400' : 'text-red-400'}>
                  {check.passed ? '\u2713' : '\u2717'}
                </span>
                <span className="text-cream-50">{check.label}</span>
                {check.detail && (
                  <span className="text-cream-200 text-xs">({check.detail})</span>
                )}
              </div>
            ))}
          </div>
        ) : ghChecksError ? (
          <div className="text-sm">
            <p className="text-red-500">{ghChecksError}</p>
            <button
              onClick={() => loadGhChecks({ refresh: true })}
              className="mt-2 text-xs text-cream-200 underline hover:text-cream-50"
            >
              Retry checks
            </button>
          </div>
        ) : (
          <p className="text-cream-200 text-sm">Could not load checks</p>
        )}
      </div>

      {/* ── KiCanvas Card ── */}
      {kicadFiles && kicadFiles.projects.length > 0 && (
        <div className="bg-brown-800 border border-cream-500/20 rounded p-6">
          <h2 className="text-cream-50 text-sm uppercase tracking-wider mb-4">
            KiCad Files{' '}
            <span className="text-cream-200 normal-case text-xs">
              (rendered via{' '}
              <a
                href="https://kicanvas.org/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-cream-50"
              >
                KiCanvas
              </a>
              )
            </span>
          </h2>
          <div className="space-y-3">
            {kicadFiles.projects.map((proj, idx) => {
              const isOpen = expandedKicad.has(idx);
              const rawBase = `https://raw.githubusercontent.com/${kicadFiles.owner}/${kicadFiles.repo}/${kicadFiles.branch}`;
              const paths = [
                ...(proj.projectFile ? [proj.projectFile] : []),
                ...proj.schematics,
                ...proj.boards,
              ];
              const sources = paths.map((p) => `${rawBase}/${p}`);
              const fileCount = proj.schematics.length + proj.boards.length;
              return (
                <div key={`${proj.dir}/${proj.name}/${idx}`} className="border border-cream-500/10">
                  <button
                    onClick={() => {
                      setExpandedKicad((prev) => {
                        const next = new Set(prev);
                        if (next.has(idx)) next.delete(idx);
                        else next.add(idx);
                        return next;
                      });
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-brown-900/40 cursor-pointer"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-orange-500 text-xs">{isOpen ? '▼' : '▶'}</span>
                      <span className="text-cream-50 truncate">
                        {proj.dir ? `${proj.dir}/` : ''}{proj.name}
                      </span>
                      <span className="text-cream-200 text-xs">
                        ({proj.schematics.length} sch, {proj.boards.length} pcb
                        {proj.projectFile ? ', project' : ''})
                      </span>
                    </div>
                    <div className="flex gap-2 text-xs text-cream-200">
                      {proj.schematics.slice(0, 1).map((s) => (
                        <a
                          key={s}
                          href={`https://github.com/${kicadFiles.owner}/${kicadFiles.repo}/blob/${kicadFiles.branch}/${s}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="hover:text-cream-50 underline"
                        >
                          view on GitHub
                        </a>
                      ))}
                    </div>
                  </button>
                  {isOpen && (
                    <div className="p-2 border-t border-cream-500/10">
                      <KiCanvasEmbed sources={sources} controls="full" height={560} />
                      <p className="text-cream-200 text-[10px] mt-1">
                        {fileCount} file{fileCount === 1 ? '' : 's'} · branch{' '}
                        <span className="text-cream-50">{kicadFiles.branch}</span>
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Conflict Warning Card ── */}
      {conflicts.length > 0 && (
        <div className="bg-yellow-500/10 border-2 border-yellow-500/40 p-4">
          <p className="text-yellow-400 font-medium text-sm uppercase mb-2">
            Conflict: Author has other active submissions
          </p>
          <ul className="space-y-1">
            {conflicts.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/admin/review/${c.id}`}
                  className="text-yellow-400/80 text-sm hover:underline"
                >
                  {c.project.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Previous Reviews Card ── */}
      {submission.reviews.length > 0 && (
        <div className="bg-brown-800 border border-cream-500/20 rounded p-6">
          <h2 className="text-cream-50 text-sm uppercase tracking-wider mb-4">Previous Reviews</h2>
          <div className="space-y-4">
            {submission.reviews.map((review, idx) => {
              const isLatest = idx === 0 && !review.invalidated;
              const defaultExpanded = isLatest;

              return (
                <ReviewCard key={review.id} review={review} defaultExpanded={defaultExpanded} />
              );
            })}
          </div>
        </div>
      )}

      {/* ── Note from Submitter Card ── */}
      {submission.notes && (
        <div className="bg-brown-800 border border-cream-500/20 rounded p-6">
          <h2 className="text-cream-50 text-sm uppercase tracking-wider mb-2">Note from Submitter</h2>
          <p className="text-cream-50 text-sm whitespace-pre-wrap">{submission.notes}</p>
        </div>
      )}

      {/* ── Work Log / Journal Card ── */}
      <div className="bg-brown-800 border border-cream-500/20 rounded p-6">
        <h2 className="text-cream-50 text-sm uppercase tracking-wider mb-4">Work Log</h2>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4 text-sm">
          <div>
            <p className="text-cream-200 text-xs uppercase">Entries</p>
            <p className="text-cream-50 font-medium">{project.entryCount}</p>
          </div>
          <div>
            <p className="text-cream-200 text-xs uppercase">Journal</p>
            <p className="text-cream-50 font-medium">{project.journalHours}h</p>
          </div>
          <div>
            <p className="text-cream-200 text-xs uppercase">Average</p>
            <p className="text-cream-50 font-medium">{project.avgWorkUnits}h</p>
          </div>
          <div>
            <p className="text-cream-200 text-xs uppercase">Max</p>
            <p className="text-cream-50 font-medium">{project.maxWorkUnits}h</p>
          </div>
          <div>
            <p className="text-cream-200 text-xs uppercase">Min</p>
            <p className="text-cream-50 font-medium">{project.minWorkUnits}h</p>
          </div>
        </div>

        {/* Firmware Time from Hackatime */}
        {project.hackatimeProjects.length > 0 && (
          <div className="mb-4 bg-brown-900 border border-cream-500/10 p-3">
            <p className="text-cream-200 text-xs uppercase mb-2">Firmware Time (Hackatime)</p>
            <div className="space-y-1">
              {project.hackatimeProjects.map((hp) => (
                <div key={hp.id} className="flex items-center justify-between text-sm">
                  <span className="text-cream-50">{hp.hackatimeProject}</span>
                  <span className="text-cream-50">
                    {(hp.totalSeconds / 3600).toFixed(1)}h
                    {hp.hoursApproved !== null && (
                      <span className="text-green-400 ml-2">({Math.round(hp.hoursApproved * 100) / 100}h approved)</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-cream-50 text-sm mt-2">
              Firmware total: <span className="font-medium">{Math.round(project.firmwareHours * 100) / 100}h</span>
              <span className="text-cream-200 ml-2">(included in {Math.round(project.totalWorkUnits * 100) / 100}h total)</span>
            </p>
          </div>
        )}

        {/* Bar Chart */}
        {project.workSessions.length > 0 && (
          <div className="mb-4">
            <div className="flex items-end gap-1 h-24">
              {project.workSessions.map((session) => {
                const maxH = project.maxWorkUnits || 1;
                const heightPct = (session.hoursClaimed / maxH) * 100;
                return (
                  <div
                    key={session.id}
                    className="flex-1 bg-orange-400 hover:bg-orange-500 transition-colors relative group min-w-[4px]"
                    style={{ height: `${Math.max(heightPct, 4)}%` }}
                    title={`${session.title}: ${Math.round(session.hoursClaimed * 100) / 100}h`}
                  >
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-cream-200 text-brown-900 text-xs px-2 py-1 hidden group-hover:block whitespace-nowrap z-10">
                      {Math.round(session.hoursClaimed * 100) / 100}h - {session.title}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Collapsible full log */}
        <button
          onClick={() => setShowWorkLog(!showWorkLog)}
          className="text-orange-500 text-xs uppercase tracking-wider hover:text-orange-400 cursor-pointer"
        >
          {showWorkLog ? 'Hide Full Log' : 'Show Full Log'}
        </button>

        {showWorkLog && (
          <div className="mt-4 space-y-3">
            {project.workSessions.map((session) => (
              <div key={session.id} className="border border-cream-500/10 p-3">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-cream-50 text-sm font-medium">{session.title}</p>
                    <p className="text-cream-200 text-xs">
                      {new Date(session.createdAt).toLocaleDateString()} | {Math.round(session.hoursClaimed * 100) / 100}h claimed
                      {session.hoursApproved !== null && ` | ${Math.round(session.hoursApproved * 100) / 100}h approved`}
                    </p>
                    {session.categories.length > 0 && (
                      <div className="flex gap-1 mt-1">
                        {session.categories.map((c) => (
                          <span key={c} className="text-xs bg-brown-900 text-cream-50 px-1">{c}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                {session.content && (
                  <div className="mt-2 wmde-markdown-var [&_.wmde-markdown]:!bg-transparent [&_.wmde-markdown]:!text-cream-50 [&_.wmde-markdown]:!text-xs [&_.wmde-markdown]:!font-[inherit] [&_.wmde-markdown_img]:max-h-64 [&_.wmde-markdown_img]:border [&_.wmde-markdown_img]:border-cream-500/20 [&_.wmde-markdown_img]:my-2 [&_.wmde-markdown_p]:my-1" data-color-mode="light">
                    <MDPreview source={fixMarkdownImages(session.content)} />
                  </div>
                )}
                {session.media.length > 0 && (
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {session.media.map((m) => (
                      <a key={m.id} href={m.url} target="_blank" rel="noopener noreferrer">
                        {m.type === 'IMAGE' ? (
                          <img src={m.url} alt="" className="w-20 h-20 object-cover border border-cream-500/10" />
                        ) : (
                          <span className="text-xs text-orange-500 underline">Video</span>
                        )}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Supporting Evidence Card ── */}
      <div className="bg-brown-800 border border-cream-500/20 rounded p-6">
        <h2 className="text-cream-50 text-sm uppercase tracking-wider mb-4">Supporting Evidence</h2>
        <div className="flex gap-6 text-sm mb-3 flex-wrap">
          <p className="text-cream-50">
            BOM Cost: <span className="font-medium">${project.bomCost.toFixed(2)}</span>
            {((project.bomTax ?? 0) > 0 || (project.bomShipping ?? 0) > 0) && (
              <span className="text-cream-200 text-xs ml-1">
                ({(project.bomTax ?? 0) > 0 && `$${(project.bomTax ?? 0).toFixed(2)} tax`}
                {(project.bomTax ?? 0) > 0 && (project.bomShipping ?? 0) > 0 && ' + '}
                {(project.bomShipping ?? 0) > 0 && `$${(project.bomShipping ?? 0).toFixed(2)} shipping`})
              </span>
            )}
          </p>
          <p className="text-cream-50">
            User Requested: <span className="font-medium text-orange-500">
              {project.requestedAmount !== null ? `$${project.requestedAmount.toFixed(2)}` : '—'}
            </span>
            {project.requestedAmount !== null && Math.ceil(project.requestedAmount) !== Math.ceil(project.bomCost) && (
              <span className="text-cream-200 text-xs ml-1">(≠ BOM total — use this as the default grant)</span>
            )}
          </p>
          <p className="text-cream-50">
            $/h: <span className="font-medium">{project.costPerHour !== null ? `$${project.costPerHour.toFixed(2)}` : '—'}</span>
          </p>
          <p className="text-cream-50">
            Bits/h: <span className="font-medium text-orange-500">{project.bitsPerHour !== null ? project.bitsPerHour : '—'}</span>
          </p>
        </div>

        {/* BOM Items */}
        {project.bomItems.length > 0 && (
          <div className="mb-4">
            <p className="text-cream-200 text-xs uppercase mb-2">Bill of Materials</p>
            <div className="space-y-1">
              {project.bomItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between text-sm border-b border-cream-500/10 py-1">
                  <div>
                    <span className="text-cream-50">{item.name}</span>
                    {item.purpose && <span className="text-cream-200 text-xs ml-2">({item.purpose})</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-cream-50">${bomItemTotal(item).toFixed(2)}</span>
                    <span className={`text-xs px-1 ${
                      item.status === 'approved' ? 'bg-green-500/20 text-green-400' :
                      item.status === 'rejected' ? 'bg-red-500/20 text-red-400' :
                      'bg-yellow-500/20 text-yellow-400'
                    }`}>{item.status}</span>
                  </div>
                </div>
              ))}
              {(project.bomTax ?? 0) > 0 && (
                <div className="flex items-center justify-between text-sm border-b border-cream-500/10 py-1">
                  <span className="text-cream-200">Tax</span>
                  <span className="text-cream-50">${(project.bomTax ?? 0).toFixed(2)}</span>
                </div>
              )}
              {(project.bomShipping ?? 0) > 0 && (
                <div className="flex items-center justify-between text-sm border-b border-cream-500/10 py-1">
                  <span className="text-cream-200">Shipping</span>
                  <span className="text-cream-50">${(project.bomShipping ?? 0).toFixed(2)}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Cart Screenshots */}
        {project.cartScreenshots.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {project.cartScreenshots.map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                <img src={url} alt={`Cart screenshot ${i + 1}`} className="w-full h-32 object-cover border border-cream-500/10" />
              </a>
            ))}
          </div>
        ) : (
          <p className="text-cream-200 text-sm">No screenshots uploaded</p>
        )}

        {/* Session media gallery */}
        {project.workSessions.some((s) => s.media.length > 0) && (
          <div className="mt-4">
            <p className="text-cream-200 text-xs uppercase mb-2">Session Media</p>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {project.workSessions.flatMap((s) =>
                s.media.filter((m) => m.type === 'IMAGE').map((m) => (
                  <a key={m.id} href={m.url} target="_blank" rel="noopener noreferrer">
                    <img src={m.url} alt="" className="w-full h-24 object-cover border border-cream-500/10" />
                  </a>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Internal Notes Card ── */}
      <div className="bg-brown-800 border border-cream-500/20 rounded p-6">
        <div className="flex items-baseline justify-between gap-3 mb-2">
          <h2 className="text-cream-50 text-sm uppercase tracking-wider">
            Internal Notes <span className="text-cream-200 normal-case">(about this author, shared across reviewers)</span>
          </h2>
          <Link
            href={`/reviews/authors/${project.user.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-orange-400 hover:text-orange-300 text-xs uppercase tracking-wider whitespace-nowrap transition-colors"
          >
            Open standalone →
          </Link>
        </div>
        <textarea
          ref={internalNoteRef}
          value={internalNote}
          onChange={(e) => handleNoteChange(e.target.value)}
          className="w-full h-24 px-3 py-2 text-sm border border-cream-500/20 bg-brown-900 text-cream-50 focus:outline-none focus:border-orange-500 resize-y"
          placeholder="Add notes about this author..."
        />
        <p className="text-cream-200 text-xs mt-1">Auto-saved</p>
      </div>

      {/* ── Submit Review Card ── */}
      <div className={`bg-brown-800 border-2 ${claimedByOther ? 'border-cream-500/20 opacity-60' : 'border-orange-500'} p-6`}>
        <h2 className="text-cream-50 text-sm uppercase tracking-wider mb-4">Submit Review</h2>

        {claimedByOther ? (
          <p className="text-cream-200 text-sm">This submission is claimed by another reviewer. You cannot submit a review.</p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-cream-200 text-xs uppercase block mb-1">Work Units Override</label>
                <input
                  type="number"
                  step="0.1"
                  value={workUnitsOverride}
                  onChange={(e) => setWorkUnitsOverride(e.target.value)}
                  placeholder={`Current: ${Math.round(project.totalWorkUnits * 100) / 100}h`}
                  className="w-full px-3 py-1.5 text-sm border border-cream-500/20 bg-brown-900 text-cream-50 focus:outline-none focus:border-orange-500"
                />
              </div>
              <div>
                <label className="text-cream-200 text-xs uppercase block mb-1">Tier Override</label>
                <select
                  value={tierOverride}
                  onChange={(e) => setTierOverride(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-cream-500/20 bg-brown-900 text-cream-50 focus:outline-none focus:border-orange-500"
                >
                  <option value="">Current: {tierInfo?.name || 'None'}</option>
                  {TIERS.map((t) => (
                    <option key={t.id} value={t.id}>{t.name} ({t.bits} bits, {t.minHours}-{t.maxHours === Infinity ? '67+' : t.maxHours}h)</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-cream-200 text-xs uppercase block mb-1">Grant Override ($USD)</label>
                <input
                  type="number"
                  value={grantOverride}
                  onChange={(e) => setGrantOverride(e.target.value)}
                  placeholder={(() => {
                    if (project.bomCost <= 0) return 'Default: No BOM cost'
                    const effectiveTier = tierOverride ? parseInt(tierOverride) : project.tier
                    const tierMax = effectiveTier ? Math.floor((TIERS.find(t => t.id === effectiveTier)?.bits ?? 0) * 0.5) : Infinity
                    const base = project.requestedAmount ?? project.bomCost
                    const capped = Math.min(base, project.bomCost, tierMax)
                    const defaultBits = Math.ceil(capped)
                    const source = project.requestedAmount != null
                      ? (project.requestedAmount > project.bomCost || project.requestedAmount > tierMax ? 'user request, capped' : 'user request')
                      : 'BOM cost, legacy'
                    return `Default: ${defaultBits} bits (${source})`
                  })()}
                  className="w-full px-3 py-1.5 text-sm border border-cream-500/20 bg-brown-900 text-cream-50 focus:outline-none focus:border-orange-500"
                />
                {grantOverride && (
                  <p className="text-cream-200 text-xs mt-1">{grantOverride} bits = ${grantOverride} value</p>
                )}
              </div>
              <div>
                <label className="text-cream-200 text-xs uppercase block mb-1">Additional Bits Deduction</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={additionalBitsDeduction}
                  onChange={(e) => setAdditionalBitsDeduction(e.target.value)}
                  placeholder={
                    project.starterProjectId && DEDUCTION_BY_GUIDE[project.starterProjectId]
                      ? `Default: ${DEDUCTION_BY_GUIDE[project.starterProjectId]} (${project.starterProjectId} kit)`
                      : 'Default: 0'
                  }
                  className="w-full px-3 py-1.5 text-sm border border-cream-500/20 bg-brown-900 text-cream-50 focus:outline-none focus:border-orange-500"
                />
                {additionalBitsDeduction && parseInt(additionalBitsDeduction) > 0 && (
                  <p className="text-cream-200 text-xs mt-1">−{additionalBitsDeduction} bits will be subtracted from the tier award on build approval</p>
                )}
              </div>
              {isAdmin && (
                <div>
                  <label className="text-cream-200 text-xs uppercase block mb-1">Category Override (Admin)</label>
                  <select
                    value={categoryOverride}
                    onChange={(e) => setCategoryOverride(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm border border-cream-500/20 bg-brown-900 text-cream-50 focus:outline-none focus:border-orange-500"
                  >
                    <option value="">No change</option>
                    <option value="DESIGN">Design</option>
                    <option value="BUILD">Build</option>
                  </select>
                </div>
              )}
            </div>

            <div className="mb-4">
              <label className="text-cream-200 text-xs uppercase block mb-1">Internal Justification{!isAdmin && <span className="text-cream-500 normal-case ml-1">(optional)</span>}</label>
              {isAdmin && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {JUSTIFICATION_SHORTCUTS.map((s, i) => (
                    <label
                      key={i}
                      className={`flex items-center gap-1.5 px-2.5 py-1 text-xs border cursor-pointer transition-colors select-none ${
                        checkedJustifications.has(i)
                          ? 'bg-green-500/15 border-green-500 text-green-400'
                          : 'border-cream-500/20 text-cream-50 hover:border-green-500/60 hover:bg-green-500/15'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checkedJustifications.has(i)}
                        onChange={() => toggleJustification(i)}
                        className="accent-green-600 w-3 h-3"
                      />
                      {s.label}
                    </label>
                  ))}
                </div>
              )}
              <textarea
                ref={reasonRef}
                value={reason}
                onChange={(e) => { setReason(e.target.value); setCheckedJustifications(new Set()); }}
                className="w-full h-20 px-3 py-2 text-sm border border-cream-500/20 bg-brown-900 text-cream-50 focus:outline-none focus:border-orange-500 resize-y"
                placeholder="Internal reason for your decision (not shown to submitter)..."
              />
            </div>

            <div className="mb-4">
              <label className="text-cream-200 text-xs uppercase block mb-1">Feedback for Submitter</label>
              {isAdmin && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {FEEDBACK_SHORTCUTS.map((s, i) => (
                    <label
                      key={i}
                      className={`flex items-center gap-1.5 px-2.5 py-1 text-xs border cursor-pointer transition-colors select-none ${
                        checkedFeedback.has(i)
                          ? 'bg-yellow-500/15 border-yellow-500 text-yellow-400'
                          : 'border-cream-500/20 text-cream-50 hover:border-yellow-500/60 hover:bg-yellow-500/15'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checkedFeedback.has(i)}
                        onChange={() => toggleFeedback(i)}
                        className="accent-yellow-600 w-3 h-3"
                      />
                      {s.label}
                    </label>
                  ))}
                </div>
              )}
              <textarea
                ref={feedbackRef}
                value={feedback}
                onChange={(e) => { setFeedback(e.target.value); setCheckedFeedback(new Set()); }}
                className="w-full h-24 px-3 py-2 text-sm border border-cream-500/20 bg-brown-900 text-cream-50 focus:outline-none focus:border-orange-500 resize-y"
                placeholder="Feedback visible to the submitter (defaults to 'Awesome project!' if blank)..."
              />
            </div>

            {project.user.fraudConvicted && (
              <div className="mb-3 bg-red-500/10 border border-red-500/40 p-3">
                <p className="text-red-400 text-xs uppercase">Fraud-convicted user — only rejection is allowed</p>
              </div>
            )}

            {isAdmin && submission.preReviewed && !modifyingPreReview ? (() => {
              const firstPassReview = submission.reviews.find((r) => !r.isAdminReview && r.result === 'APPROVED' && !r.invalidated);
              if (!firstPassReview) return null;
              const fpTierInfo = (firstPassReview.tierOverride ?? project.tier) ? getTierById(firstPassReview.tierOverride ?? project.tier!) : null;
              const fpGrant = firstPassReview.grantOverride ?? Math.round(project.bomCost * 100) / 100;
              return (
                <div>
                  <div className="mb-4 bg-orange-500/10 border border-orange-500/40 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-orange-400 text-xs uppercase font-medium">
                        First-pass review by <Link href={`/admin/users?search=${encodeURIComponent(firstPassReview.reviewerId)}`} className="hover:text-orange-300 underline decoration-orange-400/30 hover:decoration-orange-300">{firstPassReview.reviewerName || 'Reviewer'}</Link>
                      </p>
                      <span className="text-cream-200 text-xs">
                        {new Date(firstPassReview.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3 bg-brown-900 p-3">
                      <div>
                        <p className="text-cream-200 text-xs uppercase">Hours</p>
                        <p className="text-cream-50 text-sm font-medium">
                          {firstPassReview.workUnitsOverride !== null ? (
                            <><span className="text-orange-400">{Math.round(firstPassReview.workUnitsOverride * 100) / 100}h</span> / {Math.round(project.totalWorkUnits * 100) / 100}h</>
                          ) : (
                            <>{Math.round(project.totalWorkUnits * 100) / 100}h</>
                          )}
                        </p>
                      </div>
                      <div>
                        <p className="text-cream-200 text-xs uppercase">Tier</p>
                        <p className="text-cream-50 text-sm font-medium">
                          {fpTierInfo ? `${fpTierInfo.name} (${fpTierInfo.bits} bits)` : 'None'}
                          {firstPassReview.tierOverride !== null && <span className="text-orange-400 text-xs ml-1">(override)</span>}
                        </p>
                      </div>
                      <div>
                        <p className="text-cream-200 text-xs uppercase">Grant</p>
                        <p className="text-cream-50 text-sm font-medium">
                          ${fpGrant.toFixed(2)}
                          {firstPassReview.grantOverride !== null && <span className="text-orange-400 text-xs ml-1">(override)</span>}
                        </p>
                      </div>
                      <div>
                        <p className="text-cream-200 text-xs uppercase">Result</p>
                        <p className="text-green-400 text-sm font-medium uppercase">{firstPassReview.result}</p>
                      </div>
                    </div>

                    {firstPassReview.feedback && (
                      <div className="mb-3">
                        <p className="text-cream-200 text-xs uppercase">Feedback for submitter</p>
                        <p className="text-cream-50 text-sm whitespace-pre-wrap">{firstPassReview.feedback}</p>
                      </div>
                    )}

                    {firstPassReview.reason && (
                      <div>
                        <p className="text-cream-200 text-xs uppercase">Internal justification</p>
                        <p className="text-cream-50 text-sm whitespace-pre-wrap">{firstPassReview.reason}</p>
                      </div>
                    )}
                  </div>

                  {(workUnitsOverride || tierOverride || grantOverride || categoryOverride || (reason.trim() && reason.trim() !== (firstPassReview.reason || '').trim())) && (
                    <div className="mb-3 bg-yellow-500/10 border border-yellow-500/40 p-2">
                      <p className="text-yellow-400 text-xs">
                        Overriding first-pass values:{' '}
                        {[
                          workUnitsOverride && `hours → ${workUnitsOverride}h`,
                          tierOverride && `tier → ${tierOverride}`,
                          grantOverride && `grant → $${grantOverride}`,
                          categoryOverride && `category → ${categoryOverride}`,
                          reason.trim() && reason.trim() !== (firstPassReview.reason || '').trim() && 'internal justification',
                        ].filter(Boolean).join(', ')}
                        {' '}(still credited to {firstPassReview.reviewerName || 'original reviewer'})
                      </p>
                    </div>
                  )}
                  <div className="flex gap-3 flex-wrap">
                    <button
                      onClick={() => submitReview('APPROVED', {
                        feedback: firstPassReview.feedback || undefined,
                        reason: reason.trim() || firstPassReview.reason || undefined,
                        workUnitsOverride: workUnitsOverride ? parseFloat(workUnitsOverride) : (firstPassReview.workUnitsOverride ?? undefined),
                        tierOverride: tierOverride ? parseInt(tierOverride) : (firstPassReview.tierOverride ?? undefined),
                        grantOverride: grantOverride ? parseInt(grantOverride) : (firstPassReview.grantOverride ?? undefined),
                      })}
                      disabled={submitting || project.user.fraudConvicted}
                      title={project.user.fraudConvicted ? 'Cannot approve fraud-convicted users' : undefined}
                      className="px-4 py-2 text-sm uppercase tracking-wider bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                    >
                      Send Review
                    </button>
                    <button
                      onClick={() => {
                        setFeedback(firstPassReview.feedback || '');
                        setReason(firstPassReview.reason || '');
                        if (firstPassReview.workUnitsOverride !== null) setWorkUnitsOverride(String(firstPassReview.workUnitsOverride));
                        if (firstPassReview.tierOverride !== null) setTierOverride(String(firstPassReview.tierOverride));
                        if (firstPassReview.grantOverride !== null) setGrantOverride(String(firstPassReview.grantOverride));
                        setModifyingPreReview(true);
                      }}
                      className="px-4 py-2 text-sm uppercase tracking-wider border border-orange-500 text-orange-500 hover:bg-orange-500/10 cursor-pointer"
                      title="Replace the first-pass review with your own"
                    >
                      Modify (write your own)
                    </button>
                    <button
                      onClick={skipToNext}
                      disabled={submitting}
                      className="px-4 py-2 text-sm uppercase tracking-wider border border-cream-500/20 text-cream-50 hover:border-orange-500 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                    >
                      Skip
                    </button>
                  </div>
                </div>
              );
            })() : (
              <>
                {!isAdmin && (
                  <div className="mb-3 bg-blue-500/10 border border-blue-500/40 p-3">
                    <p className="text-blue-400 text-xs">Your approval will be recorded as a first-pass review. An admin will do the final approval, which triggers Airtable sync and bit grants.</p>
                  </div>
                )}

                <div className="flex gap-3 flex-wrap items-center">
                  <button
                    onClick={() => submitReview('APPROVED')}
                    disabled={submitting || project.user.fraudConvicted}
                    title={project.user.fraudConvicted ? 'Cannot approve fraud-convicted users' : 'Ctrl+Enter'}
                    className="px-4 py-2 text-sm uppercase tracking-wider bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                  >
                    {isAdmin ? 'Approve' : 'First-Pass Approve'}
                    <span className="ml-2 text-xs opacity-60 hidden sm:inline">Ctrl+Enter</span>
                  </button>
                  <button
                    onClick={() => submitReview('RETURNED')}
                    disabled={submitting || project.user.fraudConvicted}
                    title={project.user.fraudConvicted ? 'Cannot return fraud-convicted users' : undefined}
                    className="px-4 py-2 text-sm uppercase tracking-wider bg-yellow-500 text-white hover:bg-yellow-600 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                  >
                    Return
                  </button>
                  <button
                    onClick={() => submitReview('REJECTED')}
                    disabled={submitting}
                    className="px-4 py-2 text-sm uppercase tracking-wider bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                  >
                    Permanently Reject
                  </button>
                  <button
                    onClick={skipToNext}
                    disabled={submitting}
                    className="px-4 py-2 text-sm uppercase tracking-wider border border-cream-500/20 text-cream-50 hover:border-orange-500 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                  >
                    Skip
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────

function ReviewCard({ review, defaultExpanded }: {
  review: ReviewData['submission']['reviews'][0];
  defaultExpanded: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const resultColor = {
    APPROVED: 'text-green-400 bg-green-500/15 border-green-500/40',
    RETURNED: 'text-yellow-400 bg-yellow-500/15 border-yellow-500/40',
    REJECTED: 'text-red-400 bg-red-100 border-red-500/40',
  }[review.result] || '';

  const frozenTierInfo = review.frozenTier ? getTierById(review.frozenTier) : null;

  return (
    <div className={`border ${review.invalidated ? 'border-cream-500/10 opacity-60' : 'border-cream-500/20'} p-3`}>
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2 flex-wrap">
          {review.invalidated && (
            <span className="text-xs px-1 bg-cream-500/20 text-cream-200 uppercase">Outdated</span>
          )}
          {review.isAdminReview && (
            <span className="text-xs px-1 bg-purple-500/20 text-purple-400 uppercase">Admin</span>
          )}
          <span className={`text-xs px-2 py-0.5 border ${resultColor}`}>
            {review.result}
          </span>
          {review.reviewerName && (
            <Link href={`/admin/users?search=${encodeURIComponent(review.reviewerId)}`} className="text-cream-50 text-xs font-medium hover:text-orange-400 transition-colors">by {review.reviewerName}</Link>
          )}
          <span className="text-cream-200 text-xs">
            {new Date(review.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <span className="text-cream-200 text-xs">{expanded ? 'collapse' : 'expand'}</span>
      </div>

      {expanded && (
        <div className="mt-3 space-y-2 text-sm">
          {/* Overrides */}
          {(review.workUnitsOverride || review.tierOverride || review.grantOverride || review.categoryOverride) && (
            <div className="bg-brown-900 p-2">
              <p className="text-cream-200 text-xs uppercase mb-1">Overrides Applied</p>
              {review.workUnitsOverride !== null && <p className="text-cream-50 text-xs">Work Units: {review.workUnitsOverride}h</p>}
              {review.tierOverride !== null && <p className="text-cream-50 text-xs">Tier: {review.tierOverride}</p>}
              {review.grantOverride !== null && <p className="text-cream-50 text-xs">Grant: {review.grantOverride} bits</p>}
              {review.categoryOverride && <p className="text-cream-50 text-xs">Category: {review.categoryOverride}</p>}
            </div>
          )}

          {/* Feedback */}
          {review.feedback && (
            <div>
              <p className="text-cream-200 text-xs uppercase">Feedback (shown to submitter)</p>
              <p className="text-cream-50 whitespace-pre-wrap">{review.feedback}</p>
            </div>
          )}

          {/* Internal reason */}
          {review.reason && (
            <div>
              <p className="text-cream-200 text-xs uppercase">Internal Justification</p>
              <p className="text-cream-50 whitespace-pre-wrap">{review.reason}</p>
            </div>
          )}

          {/* Frozen snapshot */}
          <div className="bg-brown-900 p-2">
            <p className="text-cream-200 text-xs uppercase mb-1">Snapshot at Review Time</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              {review.frozenWorkUnits !== null && (
                <div><span className="text-cream-200">Work Units:</span> <span className="text-cream-50">{review.frozenWorkUnits}h</span></div>
              )}
              {review.frozenEntryCount !== null && (
                <div><span className="text-cream-200">Entries:</span> <span className="text-cream-50">{review.frozenEntryCount}</span></div>
              )}
              {review.frozenFundingAmount !== null && (
                <div><span className="text-cream-200">Funding:</span> <span className="text-cream-50">${(review.frozenFundingAmount / 100).toFixed(2)}</span></div>
              )}
              {frozenTierInfo && (
                <div><span className="text-cream-200">Tier:</span> <span className="text-cream-50">{frozenTierInfo.name}</span></div>
              )}
            </div>
            {review.frozenReviewerNote && (
              <div className="mt-1">
                <span className="text-cream-200 text-xs">Note to reviewer:</span>
                <p className="text-cream-50 text-xs">{review.frozenReviewerNote}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
