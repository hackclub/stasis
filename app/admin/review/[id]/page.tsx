'use client';

import { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { getTierById, TIERS } from '@/lib/tiers';
import { bomItemTotal } from '@/lib/format';
import { fixMarkdownImages } from '@/lib/markdown';
import { useHotkeys, type HotkeyBinding } from '@/lib/hotkeys';
import HotkeyOverlay from '@/app/components/HotkeyOverlay';
import { ConfirmModal } from '@/app/components/ConfirmModal';
import { Select } from '@/app/components/Select';
import { Kbd } from '@/app/components/Kbd';
import { Tooltip } from '@/app/components/Tooltip';

const CadFileBrowser = dynamic(() => import('@/app/components/CadFileBrowser'), { ssr: false });

const MDPreview = dynamic(
  () => import('@uiw/react-md-editor').then((mod) => mod.default.Markdown),
  { ssr: false }
);

// ─── Types ───────────────────────────────────────────────────────────

type AiReadmeStatusValue = 'pending' | 'done' | 'failed' | 'skipped';

type AiReadmeSectionKey =
  | 'description'
  | 'motivation'
  | 'project_photos'
  | 'render_3d'
  | 'pcb_screenshot'
  | 'wiring_diagram'
  | 'bom_table';

interface AiReadmeVerdictPayload {
  authenticity: 'likely_human' | 'unclear' | 'likely_ai';
  authenticityNotes: string;
  sections: Array<{
    key: AiReadmeSectionKey;
    present: boolean | null;
    notes: string;
  }>;
  rationale: string;
  modelVersion: string;
  promptVersion: string;
  truncated: boolean;
  /** Present on failed/skipped statuses instead of a real verdict. */
  reason?: string;
}

const SECTION_LABELS: Record<AiReadmeSectionKey, string> = {
  description: 'Description',
  motivation: 'Motivation',
  project_photos: 'Project photos',
  render_3d: '3D model screenshot',
  pcb_screenshot: 'PCB screenshot',
  wiring_diagram: 'Wiring diagram',
  bom_table: 'BOM table at end',
};

const SECTION_ORDER: AiReadmeSectionKey[] = [
  'description',
  'motivation',
  'project_photos',
  'render_3d',
  'pcb_screenshot',
  'wiring_diagram',
  'bom_table',
];

interface ReviewData {
  submission: {
    id: string;
    stage: string;
    notes: string | null;
    preReviewed: boolean;
    createdAt: string;
    githubChecks: Array<{ key: string; label: string; passed: boolean; detail?: string }> | null;
    githubChecksAt: string | null;
    aiReadmeVerdict: AiReadmeVerdictPayload | null;
    aiReadmeVerdictAt: string | null;
    aiReadmeStatus: AiReadmeStatusValue | null;
    cadFiles: import('@/lib/cad-discovery').CadFilesPayload | null;
    cadFilesAt: string | null;
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

/** Per-tier label tone — mirrors the tier pill colors in the page header. */
const TIER_TONE: Record<number, string> = {
  1: 'text-cream-100',
  2: 'text-green-300',
  3: 'text-blue-300',
  4: 'text-purple-300',
  5: 'text-orange-300',
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
// Pull every `![alt](url)` out of a markdown blob so it can render alongside
// the entry's text instead of being inlined into the body. Doesn't try to
// handle escaped parens — URLs in submissions don't have them in practice.
function splitMarkdownImages(content: string): { text: string; images: string[] } {
  const images: string[] = [];
  const text = content.replace(/!\[[^\]]*\]\(([^)]+)\)/g, (_m, url: string) => {
    images.push(url);
    return '';
  });
  return { text: text.trim(), images };
}

const REVIEW_CACHE_TTL_MS = 60_000; // serve stale-up-to-60s, revalidate after

// Auxiliary caches for slow third-party-backed reads (GitHub, Airtable).
// Both are idempotent and don't depend on filterQS.
const AIRTABLE_CHECK_CACHE: Map<string, boolean> = new Map();

const CHECK_KEY_TO_CAD_TAB: Record<string, true> = {
  checks_05_3d_file: true,
  checks_06_3d_source: true,
  checks_07_firmware_file: true,
  checks_09_pcb_source: true,
  checks_10_pcb_fab: true,
};

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
  const filterAttendees = searchParams.get('prioritizeAttending') === 'true';
  const filterRegion = searchParams.get('region') || '';
  const viewAs = searchParams.get('viewAs') || '';

  // Build query string for filter-aware navigation
  const filterQS = (() => {
    const qp = new URLSearchParams();
    if (filterCategory) qp.set('category', filterCategory);
    if (filterGuide) qp.set('guide', filterGuide);
    if (filterNameSearch) qp.set('nameSearch', filterNameSearch);
    if (filterSort) qp.set('sort', filterSort);
    if (filterPronouns) qp.set('pronouns', filterPronouns);
    if (filterAttendees) qp.set('prioritizeAttending', 'true');
    if (filterRegion) qp.set('region', filterRegion);
    if (viewAs) qp.set('viewAs', viewAs);
    const s = qp.toString();
    return s ? `?${s}` : '';
  })();

  // Initialize data + loading from cache on first render so we never flash a
  // spinner when the prefetch already populated it.
  const initialCacheKey = `${id}${filterQS}`;
  const [data, setData] = useState<ReviewData | null>(
    () => (REVIEW_DATA_CACHE.get(initialCacheKey)?.data as ReviewData | undefined) ?? null
  );
  const [loading, setLoading] = useState(() => !REVIEW_DATA_CACHE.has(initialCacheKey));
  const [renderedId, setRenderedId] = useState(id);
  const [submitting, setSubmitting] = useState(false);
  const [moveConfirm, setMoveConfirm] = useState(false);
  // ID of the journal entry currently flashing after a TOC click — cleared
  // after the highlight animation completes.
  const [flashSessionId, setFlashSessionId] = useState<string | null>(null);
  // Image preview popup that tracks the cursor while hovering over a TOC
  // thumbnail or a journal entry image.
  const [hoverPreview, setHoverPreview] = useState<{ url: string; x: number; y: number } | null>(null);
  // Small text tooltip for the work-log histogram. Different from the image
  // popup so it can be sized and styled for short labels.
  const [histTooltip, setHistTooltip] = useState<{ label: string; x: number; y: number } | null>(null);
  // Measured popup size — used to position the image preview exactly 16px
  // from the cursor, then clamped to the viewport using the actual rendered
  // dimensions instead of the worst-case 40vw/60vh.
  const popupRef = useRef<HTMLDivElement | null>(null);
  const [popupSize, setPopupSize] = useState({ w: 0, h: 0 });
  const [ghChecks, setGhChecks] = useState<Array<{ key: string; label: string; passed: boolean; detail?: string }> | null>(null);
  const [ghChecksLoading, setGhChecksLoading] = useState(false);
  const [ghChecksError, setGhChecksError] = useState<string | null>(null);
  const [ghChecksAt, setGhChecksAt] = useState<string | null>(null);
  const [ghChecksCached, setGhChecksCached] = useState(false);
  const [aiVerdict, setAiVerdict] = useState<AiReadmeVerdictPayload | null>(null);
  const [aiVerdictAt, setAiVerdictAt] = useState<string | null>(null);
  const [aiStatus, setAiStatus] = useState<AiReadmeStatusValue | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

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
  const [hideChrome, setHideChrome] = useState(false);
  // Pane widths for the resizable 3-column layout. github1s wants more room
  // than the action panel to be useful for code browsing, so the left default
  // is wider. Both are loaded from localStorage on mount if previously set.
  const [leftWidth, setLeftWidth] = useState(600);
  const [rightWidth, setRightWidth] = useState(420);
  const [resizing, setResizing] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'cad' | 'images' | 'repo' | null>('cad');
  // Workspace height is computed from the workspace's offset to the top of the
  // page so the panes fit in the remaining viewport. Without this the outer
  // page scrolls *in addition* to the panes — a confusing double-scroll.
  // `isXlPlus` tracks the xl breakpoint via matchMedia so we can apply the
  // height constraint via inline style (more reliable than a Tailwind
  // arbitrary-value utility for runtime-computed values).
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const [workspaceHeight, setWorkspaceHeight] = useState(0);
  // Space below the workspace in document flow (admin layout's `py-8` etc.).
  // We swallow it with a negative margin so the panes reach the viewport bottom.
  const [bottomBuffer, setBottomBuffer] = useState(0);
  const [isXlPlus, setIsXlPlus] = useState(false);
  const [blankFeedbackPending, setBlankFeedbackPending] = useState<{ result: string } | null>(null);
  const feedbackRef = useRef<HTMLTextAreaElement | null>(null);
  const reasonRef = useRef<HTMLTextAreaElement | null>(null);
  const internalNoteRef = useRef<HTMLTextAreaElement | null>(null);
  const hoursOverrideRef = useRef<HTMLInputElement | null>(null);
  const tierOverrideRef = useRef<HTMLButtonElement | null>(null);
  const grantOverrideRef = useRef<HTMLInputElement | null>(null);
  const deductionOverrideRef = useRef<HTMLInputElement | null>(null);
  // First chips in their respective groups — `Tab`/arrow key chip navigation
  // is handled by native focus traversal, but these refs let keyboard
  // shortcuts focus the row when entering chip-toggle mode by error.
  const journalSectionRef = useRef<HTMLDivElement | null>(null);
  const actionPanelRef = useRef<HTMLElement | null>(null);

  // Hide admin chrome (header + tab bar) for more vertical room. Toggles
  // `.hide-admin-chrome` on <html>, persists in localStorage so the preference
  // sticks across navigations between reviews. Uses useLayoutEffect for the
  // initial sync so the class is applied before paint — without that, going
  // queue → review flashes the chrome back in for one frame. We also do not
  // clean up on unmount, so the class survives the gap between unmount and
  // the next mount; sibling admin pages set their own preference on entry.
  useLayoutEffect(() => {
    const stored = localStorage.getItem('review:hideChrome') === '1';
    if (stored) {
      document.documentElement.classList.add('hide-admin-chrome');
      setHideChrome(true);
    }
  }, []);
  useEffect(() => {
    const html = document.documentElement;
    if (hideChrome) html.classList.add('hide-admin-chrome');
    else html.classList.remove('hide-admin-chrome');
    localStorage.setItem('review:hideChrome', hideChrome ? '1' : '0');
  }, [hideChrome]);

  // Re-measure the image-preview popup whenever the hovered URL changes.
  // Runs synchronously before paint so the very first frame already has the
  // correct clamped position — no flicker for cached images. Uncached images
  // pick up a follow-up measurement via the `onLoad` handler on the <img>.
  useLayoutEffect(() => {
    setPopupSize({ w: 0, h: 0 });
  }, [hoverPreview?.url]);

  // Track the xl breakpoint via matchMedia. We apply the height constraint
  // via inline style only at xl+; below that the page falls back to natural
  // single-column flow.
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1280px)');
    const sync = () => setIsXlPlus(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  // Measure the workspace's top offset and set its height to fit the remaining
  // viewport. Re-runs when data first arrives (so the workspace exists in the
  // DOM), when admin chrome toggles, and whenever an ancestor/sibling's size
  // changes (banners appearing, etc.) via ResizeObserver on the document body.
  const hasData = !!data;
  useEffect(() => {
    if (!hasData) return;
    const el = workspaceRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      const topFromPage = rect.top + window.scrollY;
      // Read the admin layout's padding-bottom directly. We can't use
      // (docHeight - workspaceBottom) because once we apply our own negative
      // margin the document shrinks and the next measurement returns 0,
      // creating an oscillation. The admin's computed padding is stable.
      const adminContent = el.closest('[data-admin-content]') as HTMLElement | null;
      const adminPb = adminContent
        ? parseFloat(getComputedStyle(adminContent).paddingBottom) || 0
        : 0;
      setBottomBuffer(adminPb);
      setWorkspaceHeight(Math.max(0, window.innerHeight - topFromPage));
    };
    update();
    window.addEventListener('resize', update);
    const ro = new ResizeObserver(update);
    ro.observe(document.body);
    if (el.parentElement) ro.observe(el.parentElement);
    return () => {
      window.removeEventListener('resize', update);
      ro.disconnect();
    };
  }, [hideChrome, hasData]);

  // Restore persisted pane widths and repo-collapsed state on mount.
  useEffect(() => {
    const l = Number(localStorage.getItem('review:leftPaneWidth'));
    const r = Number(localStorage.getItem('review:rightPaneWidth'));
    if (Number.isFinite(l) && l >= 280 && l <= 800) setLeftWidth(l);
    if (Number.isFinite(r) && r >= 280 && r <= 800) setRightWidth(r);
    const storedTab = localStorage.getItem('review:sidebarTab');
    if (storedTab === 'repo' || storedTab === 'cad' || storedTab === 'images' || storedTab === 'closed') {
      setSidebarTab(storedTab === 'closed' ? null : storedTab as any);
    }
  }, []);

  // Start a drag on one of the pane dividers. Handlers are attached to the
  // document so the gesture survives cursor excursions outside the divider
  // hit zone; `resizing` flips on a full-viewport overlay that prevents the
  // github1s iframe from swallowing mouse events while dragging.
  const beginPaneDrag = (side: 'left' | 'right') => (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = side === 'left' ? leftWidth : rightWidth;
    let nextW = startW;
    setResizing(true);
    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      // `right` pane grows as the divider moves LEFT, so flip the sign.
      const raw = side === 'left' ? startW + dx : startW - dx;
      nextW = Math.max(280, Math.min(800, raw));
      if (side === 'left') setLeftWidth(nextW);
      else setRightWidth(nextW);
    };
    const onUp = () => {
      const key = side === 'left' ? 'review:leftPaneWidth' : 'review:rightPaneWidth';
      localStorage.setItem(key, String(Math.round(nextW)));
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      setResizing(false);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

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
    setAiVerdict(cachedData?.submission?.aiReadmeVerdict ?? null);
    setAiVerdictAt(cachedData?.submission?.aiReadmeVerdictAt ?? null);
    setAiStatus(cachedData?.submission?.aiReadmeStatus ?? null);
    setAiError(null);
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


  // Restore form state on id change. Precedence:
  //   1. failedDecision sessionStorage (the user JUST tried to submit and the
  //      server returned an error — restoring this also surfaces the error
  //      banner). One-shot: consumed and removed.
  //   2. reviewDraft localStorage (the user typed feedback/reason/overrides,
  //      then j/k-navigated away — restore so the work isn't lost).
  //   3. Empty form (no prior state for this id).
  //
  // Both restore paths need to run in the SAME effect so failedDecision
  // wins — a separate effect couldn't see the sessionStorage key before this
  // one removed it.
  const [draftRestored, setDraftRestored] = useState<{ id: string; at: number } | null>(null);
  useEffect(() => {
    if (!id) return;

    const failedKey = `failedDecision:${id}`;
    const failedRaw = sessionStorage.getItem(failedKey);
    if (failedRaw) {
      try {
        const snap = JSON.parse(failedRaw) as {
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
      } catch { /* ignore corrupt snapshot */ }
      sessionStorage.removeItem(failedKey);
      return;
    }

    const draftKey = `reviewDraft:${id}`;
    let draftRaw: string | null = null;
    try { draftRaw = localStorage.getItem(draftKey); } catch { /* ignore quota / privacy errors */ }
    if (!draftRaw) {
      // No prior state — clear form so the previous submission's edits don't
      // carry over.
      setFeedback('');
      setReason('');
      setWorkUnitsOverride('');
      setTierOverride('');
      setGrantOverride('');
      setAdditionalBitsDeduction('');
      setCategoryOverride('');
      setCheckedJustifications(new Set());
      setCheckedFeedback(new Set());
      return;
    }
    try {
      const draft = JSON.parse(draftRaw) as {
        feedback?: string; reason?: string;
        workUnitsOverride?: string; tierOverride?: string; grantOverride?: string;
        additionalBitsDeduction?: string; categoryOverride?: string;
        checkedJustifications?: number[]; checkedFeedback?: number[];
      };
      setFeedback(draft.feedback ?? '');
      setReason(draft.reason ?? '');
      setWorkUnitsOverride(draft.workUnitsOverride ?? '');
      setTierOverride(draft.tierOverride ?? '');
      setGrantOverride(draft.grantOverride ?? '');
      setAdditionalBitsDeduction(draft.additionalBitsDeduction ?? '');
      setCategoryOverride(draft.categoryOverride ?? '');
      setCheckedJustifications(new Set(draft.checkedJustifications ?? []));
      setCheckedFeedback(new Set(draft.checkedFeedback ?? []));
      setDraftRestored({ id, at: Date.now() });
    } catch {
      try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Auto-clear the "draft restored" toast after 3s.
  useEffect(() => {
    if (!draftRestored) return;
    const t = setTimeout(() => setDraftRestored(null), 3000);
    return () => clearTimeout(t);
  }, [draftRestored]);

  // Auto-save form state to localStorage as a draft, debounced 500ms. Removes
  // the draft entry when the form is empty so we don't leave stale entries
  // around (and so the restore effect treats a freshly-cleared form as "no
  // draft", not "empty draft").
  useEffect(() => {
    if (!id) return;
    const handle = setTimeout(() => {
      const hasContent =
        feedback.length > 0 ||
        reason.length > 0 ||
        workUnitsOverride.length > 0 ||
        tierOverride.length > 0 ||
        grantOverride.length > 0 ||
        additionalBitsDeduction.length > 0 ||
        categoryOverride.length > 0 ||
        checkedJustifications.size > 0 ||
        checkedFeedback.size > 0;
      const key = `reviewDraft:${id}`;
      try {
        if (hasContent) {
          localStorage.setItem(key, JSON.stringify({
            feedback,
            reason,
            workUnitsOverride,
            tierOverride,
            grantOverride,
            additionalBitsDeduction,
            categoryOverride,
            checkedJustifications: [...checkedJustifications],
            checkedFeedback: [...checkedFeedback],
            updatedAt: Date.now(),
          }));
        } else {
          localStorage.removeItem(key);
        }
      } catch { /* quota exceeded — silently drop the save */ }
    }, 500);
    return () => clearTimeout(handle);
  }, [id, feedback, reason, workUnitsOverride, tierOverride, grantOverride, additionalBitsDeduction, categoryOverride, checkedJustifications, checkedFeedback]);

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

  // Seed AI README verdict from the initial payload.
  useEffect(() => {
    if (!data?.submission.id) return;
    setAiVerdict(data.submission.aiReadmeVerdict ?? null);
    setAiVerdictAt(data.submission.aiReadmeVerdictAt ?? null);
    setAiStatus(data.submission.aiReadmeStatus ?? null);
    setAiError(null);
  }, [data?.submission.id, data?.submission.aiReadmeVerdict, data?.submission.aiReadmeVerdictAt, data?.submission.aiReadmeStatus]);

  // Poll while the AI check is pending — the background job updates the row
  // out-of-band, so the only way the UI learns it landed is by re-checking.
  useEffect(() => {
    if (aiStatus !== 'pending') return;
    if (!data?.submission.id) return;
    let cancelled = false;
    const submissionId = data.submission.id;

    const poll = () => {
      fetch(`/api/reviews/${submissionId}/ai-readme`)
        .then(async (res) => {
          if (cancelled) return;
          const d = await res.json().catch(() => null);
          if (!d) return;
          if (d.status && d.status !== 'pending') {
            setAiVerdict(d.verdict ?? null);
            setAiVerdictAt(d.verdictAt ?? null);
            setAiStatus(d.status);
          }
        })
        .catch(() => {});
    };

    // First poll quickly so a fast verdict shows up nearly instantly, then
    // back off. After 90s give up — reviewer can refresh manually.
    const t1 = setTimeout(poll, 4000);
    const t2 = setTimeout(poll, 12000);
    const t3 = setTimeout(poll, 30000);
    const t4 = setTimeout(poll, 90000);
    return () => {
      cancelled = true;
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4);
    };
  }, [aiStatus, data?.submission.id]);

  const loadAiVerdict = useCallback((opts?: { refresh?: boolean }) => {
    if (!data?.submission.id) return;
    setAiLoading(true);
    setAiError(null);
    const url = `/api/reviews/${data.submission.id}/ai-readme${opts?.refresh ? '?refresh=1' : ''}`;
    fetch(url)
      .then(async (res) => {
        const d = await res.json();
        if (res.ok) {
          setAiVerdict(d.verdict ?? null);
          setAiVerdictAt(d.verdictAt ?? null);
          setAiStatus(d.status ?? null);
          if (d.reason && (d.status === 'failed' || d.status === 'skipped')) {
            setAiError(d.reason);
          }
        } else {
          setAiError(d.error || d.detail || `HTTP ${res.status}`);
        }
      })
      .catch((err) => setAiError(String(err)))
      .finally(() => setAiLoading(false));
  }, [data?.submission.id]);

  // Fire claim POST as soon as we have the URL id — do NOT wait for
  // fetchData() to round-trip first so the page becomes interactive faster.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;

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
    const effectiveReason = (overrides?.reason ?? reason).trim();

    if (!isAdmin && !effectiveReason) {
      reasonRef.current?.focus();
      return;
    }

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
    if (viewAs) body.viewAs = viewAs;

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
        // Drop the saved draft for this submission — it's been committed.
        try { localStorage.removeItem(`reviewDraft:${originalId}`); } catch { /* ignore */ }
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
      if (filterAttendees) params.set('prioritizeAttending', 'true');
      if (filterRegion) params.set('region', filterRegion);
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

  // Whether the current submission can have a decision posted right now. Used
  // by every decision binding so we don't have to repeat the guard.
  const canDecide = !submitting && !!data && !data.submission.claimedByOther;
  const isAdminUser = !!data?.isAdmin;

  function jumpJournal(delta: 1 | -1) {
    if (!data) return;
    const sessions = data.submission.project.workSessions;
    if (sessions.length === 0) return;
    // Sessions render newest-first; find the closest one in the viewport and
    // hop one over. `getBoundingClientRect().top` for each candidate; nearest
    // to the top of the scroll container wins.
    let activeIdx = -1;
    let activeAbsTop = Infinity;
    for (let i = 0; i < sessions.length; i++) {
      const el = document.getElementById(`session-${sessions[i].id}`);
      if (!el) continue;
      const top = el.getBoundingClientRect().top;
      // Pick the entry whose top is closest to (but not far below) 80px from
      // viewport top — that's where scroll-mt-4 anchors them after a jump.
      if (top <= 100 && top > -el.clientHeight + 100) {
        if (Math.abs(top - 80) < activeAbsTop) {
          activeAbsTop = Math.abs(top - 80);
          activeIdx = i;
        }
      }
    }
    if (activeIdx === -1) {
      // Nothing in view yet — pick the first if going forward, last if back.
      activeIdx = delta > 0 ? -1 : sessions.length;
    }
    // Sessions are stored in chronological order but rendered reversed.
    // "Next" in the rendered list means *earlier* chronologically.
    const nextIdx = activeIdx + (delta > 0 ? -1 : 1);
    if (nextIdx < 0 || nextIdx >= sessions.length) return;
    const target = sessions[nextIdx];
    scrollToSession(target.id);
  }

  function scrollWorkspaceToTop() {
    // The xl+ layout has its own overflow container; below xl the page
    // scrolls. Try the workspace first, fall back to window.
    const scroller = workspaceRef.current?.querySelector('.xl\\:overflow-y-auto') as HTMLElement | null;
    if (scroller) scroller.scrollTo({ top: 0, behavior: 'smooth' });
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function scrollWorkspaceToBottom() {
    const scroller = workspaceRef.current?.querySelector('.xl\\:overflow-y-auto') as HTMLElement | null;
    if (scroller) scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' });
    else window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  }
  function jumpToJournalSection() {
    const el = journalSectionRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function jumpToActionPanel() {
    // Focus feedback — most-common entry point into the action panel.
    feedbackRef.current?.focus();
    feedbackRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function openGithubRepo() {
    if (data?.submission.project.githubRepo) {
      window.open(data.submission.project.githubRepo, '_blank', 'noopener,noreferrer');
    }
  }
  function backToQueue() {
    router.push(`/admin/review${filterQS}`);
  }
  function handleReject() {
    if (!canDecide) return;
    if (rejectArmed) {
      setRejectArmed(false);
      submitReview('REJECTED', { skipConfirm: true });
    } else {
      setRejectArmed(true);
      setTimeout(() => setRejectArmed(false), 5000);
    }
  }

  // Mirror the "Confirm & Send" button when an admin is approving a
  // pre-reviewed submission — otherwise Ctrl+Enter would commit with empty
  // overrides and silently drop the first-pass reviewer's chosen tier/grant.
  function handleApprove() {
    if (!canDecide || !data) return;
    if (isAdminUser && data.submission.preReviewed && !modifyingPreReview) {
      const firstPass = data.submission.reviews.find(
        (r) => !r.isAdminReview && r.result === 'APPROVED' && !r.invalidated
      );
      if (firstPass) {
        submitReview('APPROVED', {
          feedback: firstPass.feedback || undefined,
          reason: reason.trim() || firstPass.reason || undefined,
          workUnitsOverride: workUnitsOverride ? parseFloat(workUnitsOverride) : (firstPass.workUnitsOverride ?? undefined),
          tierOverride: tierOverride ? parseInt(tierOverride) : (firstPass.tierOverride ?? undefined),
          grantOverride: grantOverride ? parseInt(grantOverride) : (firstPass.grantOverride ?? undefined),
        });
        return;
      }
    }
    submitReview('APPROVED');
  }

  // Detail-page hotkeys. Re-built each render — cheap relative to typing-driven
  // re-renders, and avoids stale closure pitfalls with submitReview/data.
  // Bindings are ordered by group so the help overlay reads top→bottom in
  // the order a reviewer actually moves through a submission.
  //
  // Modifier policy: single-letter triggers are all gated behind $mod (Ctrl on
  // Linux/Win, Cmd on Mac) so accidental keystrokes (focus drifted off an
  // input) don't fire navigation. Letters that collide with unblockable
  // browser shortcuts (T = new tab, N = new window, W = close, 1–9 = switch
  // tab) are remapped: tier → $mod+;, internal note → $mod+I, chip numbers
  // dropped in favor of the chip-toolbar's arrow-key navigation.
  const detailHotkeys: HotkeyBinding[] = [
    // ─── General ─────────────────────────────────────────────────────
    { key: 'Shift+?', description: 'Show keyboard shortcuts', group: 'General', handler: () => setHotkeyOverlayOpen((v) => !v) },
    { key: 'Escape', description: 'Blur input / close popups', group: 'General', runInInputs: true, handler: () => {
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) {
        el.blur();
      }
      if (moveConfirm) setMoveConfirm(false);
      if (rejectArmed) setRejectArmed(false);
    } },

    // ─── Decision (work from inputs so users can type then commit) ──
    { key: '$mod+Enter', description: 'Approve / Confirm & Send', group: 'Decision', runInInputs: true, handler: handleApprove },
    { key: 'Shift+R', description: 'Return for edits', group: 'Decision', handler: () => { if (canDecide) submitReview('RETURNED'); } },
    { key: 'Shift+X', description: 'Reject (press twice within 5s)', group: 'Decision', handler: handleReject },
    { key: 'Shift+M', description: 'Move to opposite queue (admin)', group: 'Decision', handler: () => { if (isAdminUser && !submitting) handleMoveQueue(); } },

    // ─── Navigation between submissions (Ctrl-gated) ────────────────
    { key: '$mod+j', description: 'Next submission', group: 'Navigation', handler: () => { if (data?.navigation.nextId) router.push(`/admin/review/${data.navigation.nextId}${filterQS}`); } },
    { key: '$mod+k', description: 'Previous submission', group: 'Navigation', handler: () => { if (data?.navigation.prevId) router.push(`/admin/review/${data.navigation.prevId}${filterQS}`); } },
    { key: '$mod+s', description: 'Skip to next', group: 'Navigation', handler: () => { skipToNext(); } },
    { key: '$mod+o', description: 'Open GitHub repo', group: 'Navigation', handler: openGithubRepo },

    // ─── In-page jumps ──────────────────────────────────────────────
    { key: '$mod+]', description: 'Next journal entry', group: 'In-page', handler: () => jumpJournal(1) },
    { key: '$mod+[', description: 'Previous journal entry', group: 'In-page', handler: () => jumpJournal(-1) },
    { key: 'Shift+J', description: 'Jump to journal entries', group: 'In-page', handler: jumpToJournalSection },
    { key: 'Shift+A', description: 'Jump to action panel', group: 'In-page', handler: jumpToActionPanel },
    { key: 'Home', description: 'Scroll to top', group: 'In-page', handler: scrollWorkspaceToTop },
    { key: 'End', description: 'Scroll to bottom', group: 'In-page', handler: scrollWorkspaceToBottom },
    { key: 'Shift+H', description: 'Toggle hide admin nav', group: 'In-page', handler: () => setHideChrome((v) => !v) },
    { key: 'Shift+G', description: 'Toggle Repo panel', group: 'In-page', handler: () => { const next = sidebarTab === 'repo' ? null : 'repo'; setSidebarTab(next); localStorage.setItem('review:sidebarTab', next ?? 'closed'); } },
    { key: 'Shift+C', description: 'Toggle Files panel', group: 'In-page', handler: () => { const next = sidebarTab === 'cad' ? null : 'cad'; setSidebarTab(next); localStorage.setItem('review:sidebarTab', next ?? 'closed'); } },
    { key: 'Shift+I', description: 'Toggle Images panel', group: 'In-page', handler: () => { const next = sidebarTab === 'images' ? null : 'images'; setSidebarTab(next); localStorage.setItem('review:sidebarTab', next ?? 'closed'); } },

    // ─── Focus form fields (Ctrl-gated) ─────────────────────────────
    { key: '$mod+f', description: 'Focus feedback (submitter)', group: 'Focus', handler: () => feedbackRef.current?.focus() },
    { key: '$mod+r', description: 'Focus reason / justification', group: 'Focus', handler: () => reasonRef.current?.focus() },
    { key: '$mod+i', description: 'Focus internal note', group: 'Focus', handler: () => internalNoteRef.current?.focus() },
    { key: '$mod+h', description: 'Focus hours override', group: 'Focus', handler: () => hoursOverrideRef.current?.focus() },
    { key: '$mod+;', description: 'Focus tier override', group: 'Focus', handler: () => tierOverrideRef.current?.focus() },
    { key: '$mod+b', description: 'Focus bits deduction', group: 'Focus', handler: () => deductionOverrideRef.current?.focus() },
    { key: '$mod+$', description: 'Focus grant override (USD)', group: 'Focus', handler: () => grantOverrideRef.current?.focus() },
  ];

  // Suspend bindings while overlay or the blank-feedback confirm modal is open
  // so number keys / Enter inside the modal don't accidentally trigger
  // decisions.
  useHotkeys(detailHotkeys, hotkeyOverlayOpen || blankFeedbackPending !== null);

  // Newest-first ordering for the TOC and the journal-entry list. Computed
  // here (before the early return) so hook order stays stable across renders.
  // Histogram keeps chronological order so time still reads left→right; the
  // chronological index (`i = N - 1 - displayI`) is used for entry numbering
  // so #1 always means "first entry" regardless of display order.
  const reversedSessions = useMemo(
    () => (data ? [...data.submission.project.workSessions].reverse() : []),
    [data]
  );

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

  // Stat flags — values worth a second look from the reviewer. Drives a subtle
  // color shift in the overview/work-log stats so unusual submissions are
  // skimmable at a glance.
  const outOfTierRange = !!(tierInfo && (
    project.totalWorkUnits < tierInfo.minHours ||
    (tierInfo.maxHours !== Infinity && project.totalWorkUnits > tierInfo.maxHours)
  ));
  const highBomPerHour = project.costPerHour !== null && project.costPerHour > 5;
  const highBitsPerHour = project.bitsPerHour !== null && project.bitsPerHour > 10;
  const highAvgJournal = project.avgWorkUnits > 3;
  const claimedByOther = submission.claimedByOther;
  const claimExpiry = submission.claim ? new Date(submission.claim.expiresAt) : null;

  // github1s embeds the repo in a VSCode-like file browser. We only show the
  // column when the project has a github.com URL we can parse to owner/repo.
  const github1sUrl = (() => {
    if (!project.githubRepo) return null;
    try {
      const u = new URL(project.githubRepo);
      if (u.hostname !== 'github.com' && u.hostname !== 'www.github.com') return null;
      const path = u.pathname.replace(/^\/+|\/+$/g, '');
      if (!path) return null;
      return `https://github1s.com/${path}`;
    } catch {
      return null;
    }
  })();

  // Returns the mouse-handler props for an image thumbnail so hovering shows
  // the full image in a cursor-following popup.
  const hoverProps = (url: string) => ({
    onMouseEnter: (e: React.MouseEvent) => setHoverPreview({ url, x: e.clientX, y: e.clientY }),
    onMouseMove: (e: React.MouseEvent) => setHoverPreview({ url, x: e.clientX, y: e.clientY }),
    onMouseLeave: () => setHoverPreview(null),
  });
  // Histogram tooltip handlers — same cursor-following pattern as hoverProps
  // but plain text instead of an image.
  const histHoverProps = (label: string) => ({
    onMouseEnter: (e: React.MouseEvent) => setHistTooltip({ label, x: e.clientX, y: e.clientY }),
    onMouseMove: (e: React.MouseEvent) => setHistTooltip({ label, x: e.clientX, y: e.clientY }),
    onMouseLeave: () => setHistTooltip(null),
  });

  // Smooth-scrolls the matching journal article into view and triggers a
  // 1.2-second background flash. scrollIntoView walks up to the nearest
  // scrollable ancestor — at xl+ that's the evidence pane's overflow-y-auto;
  // below xl the page itself scrolls.
  const scrollToSession = (sessionId: string) => {
    const el = document.getElementById(`session-${sessionId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setFlashSessionId(sessionId);
    window.setTimeout(() => {
      setFlashSessionId((curr) => (curr === sessionId ? null : curr));
    }, 1200);
  };

  return (
    <div className="space-y-4">
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

      {/* Persistent hint that hotkeys exist. Idle, low-key, and dismissable
          via the help itself — pressing `?` toggles the overlay, which acts
          as both teach-me and reference. */}
      {!hotkeyOverlayOpen && !rejectArmed && (
        <button
          type="button"
          onClick={() => setHotkeyOverlayOpen(true)}
          className="hidden md:flex fixed bottom-3 right-3 z-30 items-center gap-1.5 px-2 py-1 text-[10px] uppercase tracking-wider bg-brown-900/90 border border-cream-500/20 text-cream-200 hover:text-cream-50 hover:border-orange-500/60 transition-colors cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500"
          aria-label="Show keyboard shortcuts"
          title="Show keyboard shortcuts"
        >
          <kbd className="bg-brown-800 border border-cream-500/30 px-1 leading-none text-[10px]">?</kbd>
          <span>shortcuts</span>
        </button>
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

      {/* ── Draft-restored toast (auto-saved feedback/reason reloaded) ── */}
      {draftRestored && (
        <div className="bg-orange-500/10 border border-orange-500/40 px-3 py-2">
          <p className="text-orange-400 text-xs uppercase tracking-wider">
            ↻ Draft restored — your previous edits to this submission are back
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

      {viewAs === 'first-pass' && (
        <div className="mb-4 flex items-center justify-between px-4 py-2 border border-blue-500/40 bg-blue-500/10 text-blue-300 text-sm">
          <span className="uppercase tracking-wider text-xs font-medium">Acting as first-pass reviewer</span>
          <Link
            href={(() => {
              const qp = new URLSearchParams(filterQS.replace(/^\?/, ''));
              qp.delete('viewAs');
              const s = qp.toString();
              return `/admin/review/${id}${s ? `?${s}` : ''}`;
            })()}
            className="px-3 py-1 text-xs uppercase tracking-wider border border-blue-400/50 hover:bg-blue-500/20"
          >
            Exit Preview
          </Link>
        </div>
      )}

      {/* ── Navigation Bar ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/review${filterQS}`}
            className="px-3 py-1.5 text-xs uppercase tracking-wider border border-cream-500/20 text-cream-50 hover:border-orange-500 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500"
          >
            Back to Queue
          </Link>
          <button
            onClick={skipToNext}
            aria-keyshortcuts="Control+S"
            title="Skip (Ctrl+S)"
            className="px-3 py-1.5 text-xs uppercase tracking-wider border border-cream-500/20 text-cream-50 hover:border-orange-500 transition-colors cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500"
          >
            Skip
          </button>
          {(filterCategory || filterGuide || filterNameSearch || filterSort) && (
            <span className="px-2 py-0.5 text-xs uppercase tracking-wider bg-orange-500/10 border border-orange-500 text-orange-500">
              Filtering: {[filterCategory, filterGuide, filterNameSearch && `name:${filterNameSearch}`, filterSort].filter(Boolean).join(' + ') || 'All'}
            </span>
          )}
          {isAdmin && viewAs !== 'first-pass' && (
            <Link
              href={(() => {
                const qp = new URLSearchParams(filterQS.replace(/^\?/, ''));
                qp.set('viewAs', 'first-pass');
                return `/admin/review/${id}?${qp}`;
              })()}
              title="Preview what first-pass reviewers see"
              className="px-3 py-1.5 text-xs uppercase tracking-wider border border-cream-500/20 text-cream-50 hover:border-blue-400 hover:text-blue-300 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
            >
              View as 1st-Pass
            </Link>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setHotkeyOverlayOpen(true)}
            title="Keyboard shortcuts (?)"
            aria-keyshortcuts="?"
            className="px-3 py-1.5 text-xs uppercase tracking-wider border border-cream-500/20 text-cream-50 hover:border-orange-500 transition-colors cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500"
          >
            ? Shortcuts
          </button>
          <button
            onClick={() => setHideChrome((v) => !v)}
            title={hideChrome ? 'Show admin nav (Shift+H)' : 'Hide admin nav for more vertical space (Shift+H)'}
            aria-keyshortcuts="Shift+H"
            className="px-3 py-1.5 text-xs uppercase tracking-wider border border-cream-500/20 text-cream-50 hover:border-orange-500 transition-colors cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500"
          >
            {hideChrome ? '↓ Show nav' : '↑ Hide nav'}
          </button>
          {isAdmin && (
            <div className="relative">
              <button
                onClick={() => setMoveConfirm(!moveConfirm)}
                aria-keyshortcuts="Shift+M"
                title="Move to opposite queue (Shift+M)"
                className="px-3 py-1.5 text-xs uppercase tracking-wider border border-orange-500 text-orange-500 hover:bg-orange-500/10 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500"
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

      {/* ── Workspace ──
           Below xl: stacked column.
           xl: flex row with [evidence · resizer · action].
           2xl+: flex row with [github1s · resizer · evidence · resizer · action].
           Pane widths come from `leftWidth` / `rightWidth` state via CSS vars so
           the responsive `xl:w-[var(--w)]` utilities pick them up only at the
           right breakpoint (and the panes stack full-width below xl). */}
      {resizing && (
        <div className="fixed inset-0 z-[100] cursor-col-resize select-none" />
      )}
      <div
        ref={workspaceRef}
        style={{
          ['--left-w' as string]: `${leftWidth}px`,
          ['--right-w' as string]: `${rightWidth}px`,
          ...(isXlPlus && workspaceHeight > 0 ? { height: `${workspaceHeight}px`, overflow: 'hidden', marginBottom: `-${bottomBuffer}px` } : {}),
        }}
        className="flex flex-col xl:flex-row items-stretch gap-4 xl:gap-0"
      >

      {/* ── Sidebar — 2xl+ only ──
           Vertical tab rail on the left edge. Clicking a tab opens the
           panel; clicking the active tab closes it. When closed, only the
           rail is visible (same as the old "collapsed" state). */}
      <div className="hidden 2xl:flex 2xl:h-full shrink-0">
        {/* Tab rail — always visible */}
        <div className="flex flex-col w-12 shrink-0 bg-brown-800 outline outline-1 -outline-offset-1 outline-cream-200/15 items-center py-3 gap-2">
          {([['cad', 'Files'], ['images', 'Images'], ['repo', 'Repo']] as const).map(([tab, label]) => (
            <button
              key={tab}
              onClick={() => {
                const next = sidebarTab === tab ? null : tab;
                setSidebarTab(next);
                localStorage.setItem('review:sidebarTab', next ?? 'closed');
              }}
              title={`${sidebarTab === tab ? 'Close' : 'Open'} ${label} panel`}
              className={`w-10 px-4 py-2 text-[10px] uppercase tracking-widest font-medium transition-[color,background-color,transform] duration-150 cursor-pointer active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-orange-500/60 focus-visible:ring-inset ${
                sidebarTab === tab
                  ? 'bg-orange-500/15 text-orange-400'
                  : 'text-cream-300 hover:text-cream-50 hover:bg-brown-700/40'
              }`}
              style={{ writingMode: 'vertical-lr', transform: 'rotate(180deg)' }}
            >
              {label}
            </button>
          ))}
          {project.githubRepo && (
            <>
              <div className="w-4 border-t border-cream-200/10 my-1" />
              <a
                href={project.githubRepo}
                target="_blank"
                rel="noopener noreferrer"
                title="Open on GitHub"
                className="text-cream-400 hover:text-cream-50 transition-colors focus-visible:ring-2 focus-visible:ring-orange-500/60"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65S8.93 17.38 9 18v4"/><path d="M9 18c-4.51 2-5-2-7-2"/></svg>
              </a>
            </>
          )}
        </div>

        {/* Panel body — only when a tab is active */}
        {sidebarTab && (
          <>
            <div
              className="flex flex-col h-full w-[var(--left-w)] bg-brown-800 outline outline-1 -outline-offset-1 outline-cream-200/15 min-h-0"
            >
              {/* Repo content — stays mounted */}
              <div className={`flex-1 min-h-0 ${sidebarTab === 'repo' ? 'flex flex-col' : 'hidden'}`}>
                {github1sUrl ? (
                  <iframe
                    src={github1sUrl}
                    title="github1s repository browser"
                    className="flex-1 w-full border-0 bg-brown-900"
                  />
                ) : (
                  <div className="flex-1 flex items-center justify-center text-cream-200 text-xs px-4 text-center">
                    No GitHub repo on this submission
                  </div>
                )}
              </div>
              {/* CAD content — stays mounted */}
              <div className={`flex-1 min-h-0 ${sidebarTab === 'cad' ? 'flex flex-col' : 'hidden'}`}>
                <CadFileBrowser
                  cadData={data?.submission.cadFiles ?? null}
                  onImageHover={(url, e) => {
                    if (url && e) setHoverPreview({ url, x: e.clientX, y: e.clientY });
                    else setHoverPreview(null);
                  }}
                />
              </div>
              {/* Images panel */}
              <div className={`flex-1 min-h-0 overflow-y-auto ${sidebarTab === 'images' ? 'block' : 'hidden'}`}>
                {data && (() => {
                  const project = data.submission.project;
                  const allImages: Array<{ url: string; label: string; priority: number }> = [];
                  if (project.coverImage) {
                    allImages.push({ url: project.coverImage, label: 'Cover image', priority: 0 });
                  }
                  if (project.githubRepo) {
                    const cadData = data.submission.cadFiles as import('@/lib/cad-discovery').CadFilesPayload | null;
                    if (cadData) {
                      const readmeUrl = `https://raw.githubusercontent.com/${cadData.owner}/${cadData.repo}/${cadData.branch}/README.md`;
                      // README images are resolved from cadFiles data — they'll be fetched async
                    }
                  }
                  for (const session of [...project.workSessions].reverse()) {
                    const mdImgs = session.content ? splitMarkdownImages(session.content).images : [];
                    const mediaImgs = session.media.filter((m) => m.type === 'IMAGE').map((m) => m.url);
                    const seen = new Set<string>();
                    for (const url of [...mediaImgs, ...mdImgs]) {
                      if (seen.has(url)) continue;
                      seen.add(url);
                      allImages.push({ url, label: session.title || `Entry ${session.id.slice(-6)}`, priority: 2 });
                    }
                  }
                  for (const url of project.cartScreenshots) {
                    allImages.push({ url, label: 'Cart screenshot', priority: 3 });
                  }
                  allImages.sort((a, b) => a.priority - b.priority);
                  if (allImages.length === 0) {
                    return <div className="flex-1 flex items-center justify-center text-cream-400 text-xs p-4">No images found</div>;
                  }
                  return (
                    <div className="columns-3 gap-1 p-1">
                      {allImages.map((img, i) => (
                        <div key={`${img.url}-${i}`} className="mb-1 break-inside-avoid group relative">
                          <img
                            src={img.url}
                            alt={img.label}
                            loading="lazy"
                            className="w-full block bg-brown-950"
                            {...hoverProps(img.url)}
                          />
                          <div className="absolute bottom-0 left-0 right-0 bg-brown-900/80 px-1 py-px text-[8px] text-cream-300 truncate opacity-0 group-hover:opacity-100 transition-opacity">
                            {img.label}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* divider between sidebar panel and evidence (2xl+) */}
            <div
              onMouseDown={beginPaneDrag('left')}
              role="separator"
              aria-orientation="vertical"
              title="Drag to resize"
              className="flex self-stretch w-6 shrink-0 cursor-col-resize group items-center justify-center"
            >
              <div className="w-px h-full bg-cream-500/15 group-hover:bg-orange-500/60 group-active:bg-orange-500 transition-colors" />
            </div>
          </>
        )}
      </div>

      <div className="space-y-4 min-w-0 flex-1 xl:h-full xl:overflow-y-auto xl:pr-1">

      {/* ── Submission Overview Card ──
           Image on the left as a contained thumbnail (no cropping), info column
           on the right. The image scales down to fit the card's natural height
           so wide cover images don't waste vertical space. Stacks vertically
           below xl so the info column has room to breathe. */}
      <div className="bg-brown-800 border border-cream-500/20 overflow-hidden flex flex-col xl:flex-row items-stretch">
        {project.coverImage && (
          <div className="w-full xl:w-72 shrink-0 xl:border-r xl:border-b-0 border-b border-cream-500/20 bg-brown-900 flex items-center justify-center max-h-56 xl:max-h-none overflow-hidden">
            <img src={project.coverImage} alt="" className="max-w-full max-h-full object-contain" />
          </div>
        )}
        <div className="flex-1 min-w-0 p-5">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div>
              <p className="text-cream-200 text-xs uppercase tracking-wider">{submission.id}</p>
              <h1 className="text-cream-50 text-2xl uppercase tracking-wide">{project.title}</h1>
            </div>
            <div className="flex gap-2 flex-shrink-0 flex-wrap justify-end">
              <span className={`text-sm font-semibold uppercase tracking-wider px-3 py-1.5 border ${
                submission.stage === 'DESIGN'
                  ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                  : 'bg-green-500/20 text-green-300 border-green-500/40'
              }`}>
                {submission.stage}
              </span>
              {tierInfo && (
                <span className={`inline-flex items-baseline gap-2 text-sm font-medium px-3 py-1.5 border ${
                  {
                    1: 'bg-cream-500/15 text-cream-100 border-cream-500/40',
                    2: 'bg-green-500/20 text-green-300 border-green-500/40',
                    3: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
                    4: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
                    5: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
                  }[project.tier!] || ''
                }`}>
                  <span className="uppercase tracking-wider font-semibold">{tierInfo.name}</span>
                  <span className="opacity-60">·</span>
                  <span className="tabular-nums">{tierInfo.minHours}–{tierInfo.maxHours === Infinity ? '∞' : tierInfo.maxHours}h</span>
                  <span className="opacity-60">·</span>
                  <span className="tabular-nums">{tierInfo.bits} bits</span>
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 mb-3">
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
                      className="text-xs px-2 py-0.5 bg-cream-500/10 hover:bg-cream-500/20 text-cream-200 border border-cream-500/20 transition-colors"
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

          <div className="grid grid-cols-3 gap-x-4 gap-y-3 mb-3 text-sm">
            <div>
              <p className="text-cream-200 text-xs uppercase">Hours</p>
              <p className={outOfTierRange ? 'text-red-400 font-medium' : tierInfo ? 'text-green-400 font-medium' : 'text-cream-50'}>
                {tierInfo ? (
                  <Tooltip content={`${outOfTierRange ? 'Outside' : 'Within'} ${tierInfo.name} tier range (${tierInfo.minHours}–${tierInfo.maxHours === Infinity ? '∞' : tierInfo.maxHours}h)`}>
                    <>{Math.round(project.totalWorkUnits * 100) / 100}h</>
                  </Tooltip>
                ) : (
                  <>{Math.round(project.totalWorkUnits * 100) / 100}h</>
                )}
                {outOfTierRange && tierInfo && (
                  <span className="text-red-400/70 text-xs ml-1 normal-case">
                    (tier: {tierInfo.minHours}–{tierInfo.maxHours === Infinity ? '∞' : tierInfo.maxHours}h)
                  </span>
                )}
              </p>
            </div>
            <div>
              <p className="text-cream-200 text-xs uppercase">Journal Entries</p>
              <p className="text-cream-50">{project.entryCount}</p>
            </div>
            <div>
              <p className="text-cream-200 text-xs uppercase">BOM Cost</p>
              <p className="text-cream-50">${project.bomCost.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-cream-200 text-xs uppercase">Requested $/Hour</p>
              <p className={project.costPerHour === null ? 'text-cream-50' : highBomPerHour ? 'text-yellow-400 font-medium' : 'text-green-400 font-medium'}>
                {project.costPerHour !== null ? (
                  <Tooltip content={highBomPerHour ? 'High cost per hour (> $5/h)' : 'Within normal range (≤ $5/h)'}>
                    <>${project.costPerHour.toFixed(2)}</>
                  </Tooltip>
                ) : '—'}
              </p>
            </div>
            <div>
              <p className="text-cream-200 text-xs uppercase">Bits/Hour</p>
              <p className={project.bitsPerHour === null ? 'text-cream-50' : highBitsPerHour ? 'text-yellow-400 font-medium' : 'text-green-400 font-medium'}>
                {project.bitsPerHour !== null ? (
                  <Tooltip content={highBitsPerHour ? 'High bits per hour (> 10)' : 'Within normal range (≤ 10)'}>
                    <>{project.bitsPerHour}</>
                  </Tooltip>
                ) : '—'}
              </p>
            </div>
            <div>
              <p className="text-cream-200 text-xs uppercase">Tier Award</p>
              <p className="text-cream-50">{tierInfo ? `${tierInfo.bits} bits` : 'No tier'}</p>
            </div>
          </div>

          {project.description && (
            <div className="mb-3">
              <p className="text-cream-200 text-xs uppercase mb-1">Description</p>
              <p className="text-cream-50 text-sm whitespace-pre-wrap">{project.description}</p>
            </div>
          )}

          {project.githubRepo && (
            <div className="mb-3">
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

          {(() => {
            const videos = project.workSessions.flatMap((s) => s.media.filter((m) => m.type === 'VIDEO'));
            if (videos.length === 0) return null;
            return (
              <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1">
                {videos.map((v, i) => (
                  <a
                    key={v.id}
                    href={v.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-orange-500 hover:text-orange-400 underline"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                    {videos.length === 1 ? 'Demo Video ↗' : `Demo Video ${i + 1} ↗`}
                  </a>
                ))}
              </div>
            );
          })()}

          {project.tags.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              {project.tags.map((tag) => (
                <span key={tag} className="text-xs bg-brown-900 text-cream-50 px-2 py-0.5">{tag}</span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Repo & README Audit Card ── */}
      <div className="bg-brown-800 border border-cream-500/20 p-5">
        <div className="flex items-center justify-between mb-3 gap-4">
          <h2 className="text-cream-50 text-sm uppercase tracking-wider">Repo &amp; README Audit</h2>
        </div>

        {/* ── Files (file-tree scan) ── */}
        <div className="flex items-center justify-between mb-2 gap-4">
          <div className="text-cream-200 text-xs uppercase tracking-wider">Required Files</div>
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
          <div className="space-y-1.5">
            {ghChecks.map((check) => {
              const canOpenCad = CHECK_KEY_TO_CAD_TAB[check.key] && check.passed;
              const openCad = () => { setSidebarTab('cad'); localStorage.setItem('review:sidebarTab', 'cad'); };
              return (
                <div key={check.key} className="flex items-center gap-2 text-sm">
                  <span className={check.passed ? 'text-green-400' : 'text-red-400'}>
                    {check.passed ? '\u2713' : '\u2717'}
                  </span>
                  {canOpenCad ? (
                    <button
                      onClick={openCad}
                      title="Open in Files panel"
                      className="inline-flex items-center gap-1.5 text-cream-50 hover:underline cursor-pointer focus-visible:ring-2 focus-visible:ring-orange-500/60"
                    >
                      <span>{check.label}</span>
                      <svg className="text-orange-400 shrink-0" xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                    </button>
                  ) : (
                    <span className="text-cream-50">{check.label}</span>
                  )}
                  {check.detail && (
                    <span className="text-cream-200 text-xs">({check.detail})</span>
                  )}
                </div>
              );
            })}
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

        {/* divider between deterministic file scan and probabilistic AI section */}
        <div className="my-5 border-t border-cream-500/10" />

        {/* ── README Content (AI assist) ── */}
        <AiReadmeSection
          verdict={aiVerdict}
          verdictAt={aiVerdictAt}
          status={aiStatus}
          loading={aiLoading}
          error={aiError}
          onRefresh={() => loadAiVerdict({ refresh: true })}
        />
      </div>


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
        <div className="bg-brown-800 border border-cream-500/20 p-5">
          <h2 className="text-cream-50 text-sm uppercase tracking-wider mb-3">Previous Reviews</h2>
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
        <div className="bg-brown-800 border border-cream-500/20 p-5">
          <h2 className="text-cream-50 text-sm uppercase tracking-wider mb-2">Note from Submitter</h2>
          <p className="text-cream-50 text-sm whitespace-pre-wrap">{submission.notes}</p>
        </div>
      )}

      {/* ── Supporting Evidence Card ── */}
      <div className="bg-brown-800 border border-cream-500/20 p-5">
        <h2 className="text-cream-50 text-sm uppercase tracking-wider mb-3">Costs &amp; Materials</h2>
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
            $/h: <span className={`font-medium ${project.costPerHour === null ? '' : highBomPerHour ? 'text-yellow-400' : 'text-green-400'}`} title={highBomPerHour ? 'High cost per hour (> $5/h)' : project.costPerHour !== null ? 'Within normal range (≤ $5/h)' : undefined}>{project.costPerHour !== null ? `$${project.costPerHour.toFixed(2)}` : '—'}</span>
          </p>
          <p className="text-cream-50">
            Bits/h: <span className={`font-medium ${project.bitsPerHour === null ? '' : highBitsPerHour ? 'text-yellow-400' : 'text-green-400'}`} title={highBitsPerHour ? 'High bits per hour (> 10)' : project.bitsPerHour !== null ? 'Within normal range (≤ 10)' : undefined}>{project.bitsPerHour !== null ? project.bitsPerHour : '—'}</span>
          </p>
        </div>

        {/* BOM Items */}
        {project.bomItems.length > 0 && (
          <div className="mb-3">
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

        {/* Session media gallery — small thumbnails with hover-to-enlarge;
            scroll-capped so a project with 100 photos doesn't blow up the card. */}
        {project.workSessions.some((s) => s.media.length > 0) && (() => {
          const seen = new Set<string>();
          const unique: { id: string; url: string }[] = [];
          for (const session of project.workSessions) {
            for (const m of session.media) {
              if (m.type !== 'IMAGE' || seen.has(m.url)) continue;
              seen.add(m.url);
              unique.push({ id: m.id, url: m.url });
            }
          }
          const tall = unique.length > 24;
          return (
            <div className="mt-4">
              <div className="flex items-baseline justify-between mb-2">
                <p className="text-cream-200 text-xs uppercase">Journal Photos</p>
                <p className="text-cream-300 text-[10px] tabular-nums">{unique.length} {unique.length === 1 ? 'photo' : 'photos'}</p>
              </div>
              <div
                className={tall ? 'max-h-72 overflow-y-auto pr-1' : ''}
                style={tall ? { maskImage: 'linear-gradient(to bottom, black calc(100% - 20px), transparent)', WebkitMaskImage: 'linear-gradient(to bottom, black calc(100% - 20px), transparent)' } : undefined}
              >
                <div className="grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-1">
                  {unique.map((m) => (
                    <div
                      key={m.id}
                      className="aspect-square bg-brown-900 border border-cream-500/10 overflow-hidden cursor-zoom-in"
                      {...hoverProps(m.url)}
                    >
                      <img src={m.url} alt="" loading="lazy" className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* ── Work Log Card (bottom of evidence column) ──
           Heading + inline summary stats; compact bar-chart of per-entry hours;
           optional Hackatime block; then every journal entry is rendered inline
           (no collapsible) with a rounded orange bar on the left and a generous
           gap separating each entry. */}
      <div ref={journalSectionRef} className="bg-brown-800 border border-cream-500/20 p-5">
        <div className="flex items-baseline justify-between gap-4 flex-wrap mb-3">
          <h2 className="text-cream-50 text-sm uppercase tracking-wider">Journal Entries</h2>
          <div className="text-cream-200 text-xs flex items-baseline gap-x-2 gap-y-1 flex-wrap">
            <span><span className="text-cream-50 font-medium">{project.entryCount}</span> entries</span>
            <span className="text-cream-500">·</span>
            <span><span className="text-cream-50 font-medium">{project.journalHours}h</span> logged</span>
            <span className="text-cream-500">·</span>
            <span>avg <span className={highAvgJournal ? 'text-yellow-400 font-medium' : 'text-green-400 font-medium'} title={highAvgJournal ? 'Average journal entry over 3h' : 'Within normal range (≤ 3h)'}>{project.avgWorkUnits}h</span></span>
            <span className="text-cream-500">·</span>
            <span>max <span className="text-cream-50">{project.maxWorkUnits}h</span></span>
            <span className="text-cream-500">·</span>
            <span>min <span className="text-cream-50">{project.minWorkUnits}h</span></span>
          </div>
        </div>

        {/* Histogram — per-entry hours visualization. Bars are clickable and
             scroll to / flash the matching entry, so this and the TOC below
             are two views of the same navigation. */}
        {project.workSessions.length > 0 && (() => {
          const maxH = project.maxWorkUnits || 1;
          return (
            <div className="flex gap-0.5 h-12 mb-3">
              {project.workSessions.map((session) => {
                const heightPct = (session.hoursClaimed / maxH) * 100;
                const hours = Math.round(session.hoursClaimed * 100) / 100;
                return (
                  <button
                    key={session.id}
                    type="button"
                    tabIndex={-1}
                    onClick={() => scrollToSession(session.id)}
                    {...histHoverProps(`${session.title} · ${hours}h`)}
                    className="flex-1 h-full flex items-end min-w-[3px] cursor-pointer group p-0"
                  >
                    <span
                      className="w-full block bg-orange-500/50 group-hover:bg-orange-500 transition-colors"
                      style={{ height: `${Math.max(heightPct, 4)}%` }}
                    />
                  </button>
                );
              })}
            </div>
          );
        })()}

        {/* TOC — clickable list of entries, newest first. Zebra rows match the
             entry stripes below. Scrolls within a fixed cap if there are more
             than 10 entries; a bottom mask-fade + a "scroll" hint badge make
             the overflow obvious. */}
        {project.workSessions.length > 0 && (() => {
          const scrollable = project.workSessions.length > 10;
          return (
            <div className="relative -mx-5 mb-4 border-y border-cream-500/10">
              <div
                className={scrollable ? 'max-h-80 overflow-y-auto' : ''}
                style={scrollable ? { maskImage: 'linear-gradient(to bottom, black calc(100% - 28px), transparent)', WebkitMaskImage: 'linear-gradient(to bottom, black calc(100% - 28px), transparent)' } : undefined}
              >
            {reversedSessions.map((session, displayI) => {
              const i = project.workSessions.length - 1 - displayI;
              const hours = Math.round(session.hoursClaimed * 100) / 100;
              const isZebra = displayI % 2 === 1;
              const mdImgs = session.content ? splitMarkdownImages(session.content).images : [];
              const mediaImgs = session.media.filter((m) => m.type === 'IMAGE').map((m) => m.url);
              const allImgs = Array.from(new Set([...mdImgs, ...mediaImgs]));
              const SHOWN_LIMIT = 6;
              const shown = allImgs.length > SHOWN_LIMIT + 1 ? allImgs.slice(0, SHOWN_LIMIT) : allImgs;
              const overflow = allImgs.length - shown.length;
              return (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => scrollToSession(session.id)}
                  className={`flex items-center w-full text-left px-5 py-1.5 hover:bg-orange-500/15 transition-colors cursor-pointer ${isZebra ? 'bg-brown-900' : ''}`}
                >
                  <span className="text-cream-300 text-xs tabular-nums w-8 shrink-0 text-right pr-2">{i + 1}</span>
                  <span className="text-cream-50 text-sm flex-1 truncate pr-3">{session.title}</span>
                  {allImgs.length > 0 && (
                    <span className="flex items-center gap-1 mr-3 shrink-0">
                      {shown.map((url, idx) => (
                        <span
                          key={`${url}-${idx}`}
                          className="w-6 h-6 border border-cream-500/20 bg-brown-900 overflow-hidden shrink-0"
                          {...hoverProps(url)}
                        >
                          <img src={url} alt="" loading="lazy" className="w-full h-full object-cover" />
                        </span>
                      ))}
                      {overflow > 0 && (
                        <span className="w-6 h-6 border border-cream-500/20 bg-brown-800 flex items-center justify-center text-cream-200 text-[9px] font-medium tracking-wider shrink-0">
                          +{overflow}
                        </span>
                      )}
                    </span>
                  )}
                  <span className="text-xs text-cream-200 shrink-0 w-14 text-right tabular-nums">
                    <span className="text-cream-50 font-medium">{hours}h</span>
                  </span>
                </button>
              );
            })}
              </div>
              {scrollable && (
                <div className="pointer-events-none absolute bottom-1 right-2 text-[10px] uppercase tracking-wider text-cream-200 bg-brown-900/85 border border-cream-500/20 px-1.5 py-0.5">
                  ↓ {project.workSessions.length} entries · scroll
                </div>
              )}
            </div>
          );
        })()}

        {project.hackatimeProjects.length > 0 && (
          <div className="mb-4 bg-brown-900 border border-cream-500/10 p-3">
            <p className="text-cream-200 text-xs uppercase mb-2">Coding Time (via Hackatime)</p>
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
              Coding total: <span className="font-medium">{Math.round(project.firmwareHours * 100) / 100}h</span>
              <span className="text-cream-200 ml-2">(included in {Math.round(project.totalWorkUnits * 100) / 100}h total)</span>
            </p>
          </div>
        )}

        {project.workSessions.length > 0 && (
          <div className="-mx-5">
            {reversedSessions.map((session, displayI) => {
              const i = project.workSessions.length - 1 - displayI;
              const { text, images: mdImages } = session.content
                ? splitMarkdownImages(session.content)
                : { text: '', images: [] };
              const mediaImages = session.media.filter((m) => m.type === 'IMAGE');
              const mediaVideos = session.media.filter((m) => m.type !== 'IMAGE');
              // Dedupe — markdown inserts often reference the same URLs that
              // appear in session.media, which caused every image to show twice.
              const galleryUrls = Array.from(new Set([
                ...mdImages,
                ...mediaImages.map((m) => m.url),
              ]));
              const galleryImages = galleryUrls.map((url, idx) => ({ key: `img-${idx}`, url }));
              // Variable grid that uses the aside's width: a featured wide tile
              // for small counts (3-5) so the images aren't tiny when there's
              // room to make them prominent. 6+ falls back to a uniform 3-col.
              const galleryLayout = (() => {
                const n = galleryImages.length;
                if (n === 0) return null;
                if (n === 1) return { container: 'grid grid-cols-1', itemClass: (_: number) => 'aspect-[4/3]' };
                if (n === 2) return { container: 'grid grid-cols-2 gap-1', itemClass: (_: number) => 'aspect-square' };
                if (n === 3) return {
                  container: 'grid grid-cols-2 gap-1',
                  itemClass: (idx: number) => (idx === 0 ? 'col-span-2 aspect-video' : 'aspect-square'),
                };
                if (n === 4) return {
                  container: 'grid grid-cols-3 gap-1',
                  itemClass: (idx: number) => (idx === 0 ? 'col-span-3 aspect-video' : 'aspect-square'),
                };
                if (n === 5) return {
                  container: 'grid grid-cols-2 gap-1',
                  itemClass: (idx: number) => (idx === 0 ? 'col-span-2 aspect-video' : 'aspect-square'),
                };
                return { container: 'grid grid-cols-3 gap-1', itemClass: (_: number) => 'aspect-square' };
              })();
              const hasAside = galleryImages.length > 0 || mediaVideos.length > 0;
              const isZebra = displayI % 2 === 1;
              const isFlashing = flashSessionId === session.id;
              return (
                <article
                  key={session.id}
                  id={`session-${session.id}`}
                  className={`scroll-mt-4 flex flex-col md:flex-row gap-5 px-5 py-5 transition-colors duration-700 ${isFlashing ? '!bg-orange-500/25' : isZebra ? 'bg-brown-900' : ''}`}
                >
                  <div className="flex-1 min-w-0 space-y-2.5">
                    <div className="flex items-baseline justify-between gap-3 flex-wrap">
                      <h3 className="text-cream-50 text-base font-semibold tracking-tight leading-snug flex items-center gap-2.5">
                        <span
                          className="inline-flex items-center justify-center w-6 h-6 bg-orange-500 text-brown-900 text-[10px] font-bold tabular-nums shrink-0"
                          aria-hidden
                        >
                          {i + 1}
                        </span>
                        {session.title}
                      </h3>
                      <div className="flex items-baseline gap-x-2 text-[11px] uppercase tracking-wider text-cream-200 shrink-0 flex-wrap">
                        <span className="tabular-nums">
                          {new Date(session.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        </span>
                        <span className="text-cream-500">·</span>
                        <span><span className="text-cream-50 font-medium">{Math.round(session.hoursClaimed * 100) / 100}h</span> claimed</span>
                        {session.hoursApproved !== null && (
                          <>
                            <span className="text-cream-500">·</span>
                            <span className="text-green-400"><span className="font-medium">{Math.round(session.hoursApproved * 100) / 100}h</span> approved</span>
                          </>
                        )}
                      </div>
                    </div>
                    {session.categories.length > 0 && (
                      <div className="flex gap-1 flex-wrap">
                        {session.categories.map((c) => (
                          <span key={c} className="text-[10px] uppercase tracking-wider bg-brown-800 text-cream-200 px-1.5 py-0.5 border border-cream-500/10">{c}</span>
                        ))}
                      </div>
                    )}
                    {text && (
                      <div className="wmde-markdown-var [&_.wmde-markdown]:!bg-transparent [&_.wmde-markdown]:!text-cream-100 [&_.wmde-markdown]:!text-sm [&_.wmde-markdown]:!leading-relaxed [&_.wmde-markdown]:!font-[inherit] [&_.wmde-markdown_p]:my-1.5 [&_.wmde-markdown_pre]:!bg-brown-950 [&_.wmde-markdown_pre]:!border-cream-500/10 [&_.wmde-markdown_code]:!bg-brown-950 [&_.wmde-markdown_code]:!text-cream-200" data-color-mode="dark">
                        <MDPreview source={fixMarkdownImages(text)} />
                      </div>
                    )}
                  </div>
                  {hasAside && (
                    <aside className="md:w-44 shrink-0">
                      {galleryLayout && (
                        <div className="max-h-72 overflow-y-auto pr-1">
                          <div className={galleryLayout.container}>
                            {galleryImages.map(({ key, url }, idx) => (
                              <div
                                key={key}
                                className={`${galleryLayout.itemClass(idx)} bg-brown-900 border border-cream-500/10 overflow-hidden cursor-zoom-in`}
                                {...hoverProps(url)}
                              >
                                <img src={url} alt="" loading="lazy" className="w-full h-full object-cover" />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {mediaVideos.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {mediaVideos.map((m) => (
                            <a
                              key={m.id}
                              href={m.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block text-xs text-orange-500 hover:text-orange-400 underline"
                            >
                              Video ↗
                            </a>
                          ))}
                        </div>
                      )}
                    </aside>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>

      </div>

      {/* divider between evidence and action panel (xl+) */}
      <div
        onMouseDown={beginPaneDrag('right')}
        role="separator"
        aria-orientation="vertical"
        title="Drag to resize"
        className="hidden xl:flex xl:self-stretch w-6 shrink-0 cursor-col-resize group items-center justify-center"
      >
        <div className="w-px h-full bg-cream-500/15 group-hover:bg-orange-500/60 group-active:bg-orange-500 transition-colors" />
      </div>

      <aside className="w-full xl:w-[var(--right-w)] shrink-0 space-y-4 xl:h-full xl:overflow-y-auto xl:pr-1">

      {/* ── Submit Review Card ── */}
      <div className={`bg-brown-800 border-2 ${claimedByOther ? 'border-cream-500/20 opacity-60' : 'border-orange-500'} p-5`}>
        <h2 className="text-cream-50 text-sm uppercase tracking-wider mb-3">Submit Review</h2>

        {claimedByOther ? (
          <p className="text-cream-200 text-sm">This submission is claimed by another reviewer. You cannot submit a review.</p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3">
              <div>
                <label className="text-cream-200 text-xs uppercase block mb-1">
                  Hours Override <Kbd className="ml-1.5">⌃H</Kbd>
                </label>
                <input
                  ref={hoursOverrideRef}
                  type="number"
                  step="0.1"
                  value={workUnitsOverride}
                  onChange={(e) => setWorkUnitsOverride(e.target.value)}
                  placeholder={`Current: ${Math.round(project.totalWorkUnits * 100) / 100}h`}
                  aria-keyshortcuts="Control+H"
                  className="w-full px-3 py-1.5 text-sm border border-cream-500/20 bg-brown-900 text-cream-50 focus:outline-none focus:border-orange-500 focus-visible:ring-1 focus-visible:ring-orange-500"
                />
              </div>
              <div>
                <label className="text-cream-200 text-xs uppercase block mb-1">
                  Tier Override <Kbd className="ml-1.5">⌃;</Kbd>
                </label>
                <Select
                  triggerRef={tierOverrideRef}
                  value={tierOverride}
                  onChange={setTierOverride}
                  ariaKeyshortcuts="Control+;"
                  options={[
                    { value: '', label: `Current: ${tierInfo?.name || 'None'}` },
                    ...TIERS.map((t) => ({
                      value: String(t.id),
                      label: t.name,
                      hint: `${t.bits} bits · ${t.minHours}–${t.maxHours === Infinity ? '67+' : t.maxHours}h`,
                      tone: TIER_TONE[t.id],
                    })),
                  ]}
                />
              </div>
              <div>
                <label className="text-cream-200 text-xs uppercase block mb-1">
                  Grant Override (USD) <Kbd className="ml-1.5">⌃$</Kbd>
                </label>
                <input
                  ref={grantOverrideRef}
                  type="number"
                  value={grantOverride}
                  onChange={(e) => setGrantOverride(e.target.value)}
                  aria-keyshortcuts="Control+$"
                  placeholder={(() => {
                    if (project.noBomNeeded) return 'Default: No grant (user opted out of parts)'
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
                  className="w-full px-3 py-1.5 text-sm border border-cream-500/20 bg-brown-900 text-cream-50 focus:outline-none focus:border-orange-500 focus-visible:ring-1 focus-visible:ring-orange-500"
                />
                {grantOverride && (
                  <p className="text-cream-200 text-xs mt-1">{grantOverride} bits = ${grantOverride} value</p>
                )}
              </div>
              <div>
                <label className="text-cream-200 text-xs uppercase block mb-1">
                  Bits Deduction <Kbd className="ml-1.5">⌃B</Kbd>
                </label>
                <input
                  ref={deductionOverrideRef}
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
                  aria-keyshortcuts="Control+B"
                  className="w-full px-3 py-1.5 text-sm border border-cream-500/20 bg-brown-900 text-cream-50 focus:outline-none focus:border-orange-500 focus-visible:ring-1 focus-visible:ring-orange-500"
                />
                {additionalBitsDeduction && parseInt(additionalBitsDeduction) > 0 && (
                  <p className="text-cream-200 text-xs mt-1">−{additionalBitsDeduction} bits will be subtracted from the tier award on build approval</p>
                )}
              </div>
              {isAdmin && (
                <div>
                  <label className="text-cream-200 text-xs uppercase block mb-1">Stage Override (Admin)</label>
                  <Select
                    value={categoryOverride}
                    onChange={setCategoryOverride}
                    options={[
                      { value: '', label: 'No change' },
                      { value: 'DESIGN', label: 'Design', tone: 'text-blue-300' },
                      { value: 'BUILD', label: 'Build', tone: 'text-green-300' },
                    ]}
                  />
                </div>
              )}
            </div>

            <div className="mb-3">
              <label className="text-cream-200 text-xs uppercase block mb-1">
                Internal Justification
                {!isAdmin && <span className="text-orange-500 normal-case ml-1">(required)</span>}
                {isAdmin && <span className="text-cream-500 normal-case ml-1.5"><Kbd>⌃R</Kbd> · Tab in, ←→ navigate, Space toggle</span>}
              </label>
              {isAdmin && (
                <ChipGroup
                  items={JUSTIFICATION_SHORTCUTS}
                  checkedSet={checkedJustifications}
                  onToggle={toggleJustification}
                  ariaLabel="Justification presets"
                  variant="green"
                />
              )}
              <textarea
                ref={reasonRef}
                value={reason}
                onChange={(e) => { setReason(e.target.value); setCheckedJustifications(new Set()); }}
                aria-keyshortcuts="Control+R"
                className="w-full h-20 px-3 py-2 text-sm border border-cream-500/20 bg-brown-900 text-cream-50 focus:outline-none focus:border-orange-500 focus-visible:ring-1 focus-visible:ring-orange-500 resize-y"
                placeholder="Internal reason for your decision (not shown to submitter)..."
              />
            </div>

            <div className="mb-3">
              <label className="text-cream-200 text-xs uppercase block mb-1">
                Feedback for Submitter
                {isAdmin && <span className="text-cream-500 normal-case ml-1.5"><Kbd>⌃F</Kbd> · Tab in, ←→ navigate, Space toggle</span>}
              </label>
              {isAdmin && (
                <ChipGroup
                  items={FEEDBACK_SHORTCUTS}
                  checkedSet={checkedFeedback}
                  onToggle={toggleFeedback}
                  ariaLabel="Feedback presets"
                  variant="yellow"
                />
              )}
              <textarea
                ref={feedbackRef}
                value={feedback}
                onChange={(e) => { setFeedback(e.target.value); setCheckedFeedback(new Set()); }}
                aria-keyshortcuts="Control+F"
                className="w-full h-24 px-3 py-2 text-sm border border-cream-500/20 bg-brown-900 text-cream-50 focus:outline-none focus:border-orange-500 focus-visible:ring-1 focus-visible:ring-orange-500 resize-y"
                placeholder="Feedback visible to the submitter (defaults to 'Awesome project!' if blank)..."
              />
              <p className="text-cream-200/60 text-[10px] mt-1 uppercase tracking-wider">Draft auto-saves locally as you type · restored when you return to this submission</p>
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
                  <div className="mb-3 bg-orange-500/10 border border-orange-500/40 p-4">
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
                        <p className="text-cream-200 text-xs uppercase">Decision</p>
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
                      Confirm &amp; Send
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
                      Modify Review
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
                    onClick={() => handleApprove()}
                    disabled={submitting || project.user.fraudConvicted}
                    title={project.user.fraudConvicted ? 'Cannot approve fraud-convicted users' : 'Ctrl+Enter'}
                    aria-keyshortcuts="Control+Enter"
                    className="px-4 py-2 text-sm uppercase tracking-wider bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500"
                  >
                    {isAdmin ? 'Approve' : 'First-Pass Approve'}
                    <span className="ml-2 text-xs opacity-60 hidden sm:inline">Ctrl+Enter</span>
                  </button>
                  <button
                    onClick={() => submitReview('RETURNED')}
                    disabled={submitting || project.user.fraudConvicted}
                    title={project.user.fraudConvicted ? 'Cannot return fraud-convicted users' : 'Shift+R'}
                    aria-keyshortcuts="Shift+R"
                    className="px-4 py-2 text-sm uppercase tracking-wider bg-yellow-500 text-white hover:bg-yellow-600 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500"
                  >
                    Return for Edits
                    <span className="ml-2 text-xs opacity-60 hidden sm:inline">Shift+R</span>
                  </button>
                  <button
                    onClick={() => submitReview('REJECTED')}
                    disabled={submitting}
                    title="Shift+X twice within 5s"
                    aria-keyshortcuts="Shift+X Shift+X"
                    className="px-4 py-2 text-sm uppercase tracking-wider bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500"
                  >
                    Permanently Reject
                    <span className="ml-2 text-xs opacity-60 hidden sm:inline">⇧X×2</span>
                  </button>
                  <button
                    onClick={skipToNext}
                    disabled={submitting}
                    title="Skip (Ctrl+S)"
                    aria-keyshortcuts="Control+S"
                    className="px-4 py-2 text-sm uppercase tracking-wider border border-cream-500/20 text-cream-50 hover:border-orange-500 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500"
                  >
                    Skip
                    <span className="ml-2 text-xs opacity-60 hidden sm:inline">⌃S</span>
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* ── Internal Notes Card ── */}
      <div className="bg-brown-800 border border-cream-500/20 p-5">
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
          aria-keyshortcuts="Control+I"
          className="w-full h-24 px-3 py-2 text-sm border border-cream-500/20 bg-brown-900 text-cream-50 focus:outline-none focus:border-orange-500 focus-visible:ring-1 focus-visible:ring-orange-500 resize-y"
          placeholder="Add notes about this author..."
        />
        <p className="text-cream-200 text-xs mt-1">Auto-saved</p>
      </div>

      </aside>
      </div>

      {/* Cursor-following histogram tooltip. Centered above the cursor; flips
          to one side near viewport edges so it stays on screen. */}
      {histTooltip && (
        <div
          className="fixed pointer-events-none z-[200] bg-cream-200 text-brown-900 text-xs px-2 py-1 shadow-2xl max-w-[18rem] leading-tight"
          style={{
            left: histTooltip.x,
            top: histTooltip.y,
            transform: `translate(${histTooltip.x < 120 ? '0%' : histTooltip.x > window.innerWidth - 120 ? '-100%' : '-50%'}, calc(-100% - 12px))`,
          }}
        >
          {histTooltip.label}
        </div>
      )}

      {/* Cursor-following image preview popup. Positioned exactly 16px from
          the cursor using the popup's measured size, then clamped so it stays
          on-screen. `pointer-events-none` keeps it out of the mouse path;
          `visibility: hidden` until the first measurement avoids a one-frame
          jump on hover. */}
      {hoverPreview && (() => {
        const measured = popupSize.w > 0 && popupSize.h > 0;
        const w = popupSize.w;
        const h = popupSize.h;
        const sidebarW = sidebarTab ? leftWidth + 48 + 24 : 48;
        const availW = window.innerWidth - sidebarW;
        const availH = window.innerHeight;
        const left = sidebarW + (availW - w) / 2;
        const top = (availH - h) / 2;
        return (
          <div
            ref={popupRef}
            className="fixed pointer-events-none z-[200] shadow-2xl"
            style={{ left: Math.max(sidebarW + 16, left), top: Math.max(16, top), visibility: measured ? 'visible' : 'hidden' }}
          >
            <img
              src={hoverPreview.url}
              alt=""
              onLoad={() => {
                if (!popupRef.current) return;
                const rect = popupRef.current.getBoundingClientRect();
                setPopupSize({ w: rect.width, h: rect.height });
              }}
              className="min-w-[320px] min-h-[240px] max-w-[40vw] max-h-[60vh] object-contain block bg-brown-900"
            />
          </div>
        );
      })()}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────

// Toolbar-pattern chip group. Tab into the group lands on the most-recently
// focused chip (roving tabindex), arrow keys / Home / End move between chips
// inside, Tab leaves the group. Space toggles via native checkbox semantics —
// no explicit handler needed.
function ChipGroup<T extends { label: string; text: string }>({
  items,
  checkedSet,
  onToggle,
  ariaLabel,
  variant,
}: Readonly<{
  items: T[];
  checkedSet: Set<number>;
  onToggle: (i: number) => void;
  ariaLabel: string;
  variant: 'green' | 'yellow';
}>) {
  const [activeIdx, setActiveIdx] = useState(0);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  // Keep activeIdx in range if items shrink (defensive — items list is
  // module-level today, but treating it as dynamic costs nothing).
  if (activeIdx >= items.length && items.length > 0) {
    // Schedule a state update; render with clamped value this frame to
    // avoid React warnings about out-of-range refs.
    queueMicrotask(() => setActiveIdx(0));
  }

  function focusIdx(i: number) {
    const next = ((i % items.length) + items.length) % items.length;
    setActiveIdx(next);
    refs.current[next]?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault();
        focusIdx(activeIdx + 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault();
        focusIdx(activeIdx - 1);
        break;
      case 'Home':
        e.preventDefault();
        focusIdx(0);
        break;
      case 'End':
        e.preventDefault();
        focusIdx(items.length - 1);
        break;
    }
  }

  const accentColor = variant === 'green' ? 'accent-green-600' : 'accent-yellow-600';

  return (
    <div
      role="toolbar"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className="flex flex-wrap gap-1.5 mb-2"
    >
      {items.map((s, i) => {
        const isActive = i === activeIdx;
        const isChecked = checkedSet.has(i);
        const checkedClass = variant === 'green'
          ? 'bg-green-500/15 border-green-500 text-green-400'
          : 'bg-yellow-500/15 border-yellow-500 text-yellow-400';
        const idleClass = variant === 'green'
          ? 'border-cream-500/20 text-cream-50 hover:border-green-500/60 hover:bg-green-500/15'
          : 'border-cream-500/20 text-cream-50 hover:border-yellow-500/60 hover:bg-yellow-500/15';
        return (
          <label
            key={i}
            className={`relative flex items-center gap-1.5 px-2.5 py-1 text-xs border cursor-pointer transition-colors select-none has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-orange-500 has-[:focus-visible]:outline-offset-1 ${isChecked ? checkedClass : idleClass}`}
          >
            <input
              ref={(el) => { refs.current[i] = el; }}
              type="checkbox"
              checked={isChecked}
              onChange={() => onToggle(i)}
              onFocus={() => setActiveIdx(i)}
              tabIndex={isActive ? 0 : -1}
              aria-checked={isChecked}
              className={`${accentColor} w-3 h-3`}
            />
            {s.label}
          </label>
        );
      })}
    </div>
  );
}

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
            <p className="text-cream-200 text-xs uppercase mb-1">Values When Reviewed</p>
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

// ── README Content section (AI-assisted, reviewer-only) ─────────────────
//
// Two distill pills sit at the top: authenticity ("LIKELY HUMAN" etc.) and
// completeness ("5/7 SECTIONS"). The orange accent is reserved for failure
// states — likely_ai authenticity or below-threshold completeness. Per-row
// findings render below the pills with three-state icons (presence is null
// when the section doesn't apply to this project type).
function AiReadmeSection({
  verdict,
  verdictAt,
  status,
  loading,
  error,
  onRefresh,
}: Readonly<{
  verdict: AiReadmeVerdictPayload | null;
  verdictAt: string | null;
  status: AiReadmeStatusValue | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}>) {
  const isDone = status === 'done' && verdict;
  const sections = useMemo(() => {
    if (!verdict?.sections) return [];
    // Preserve the canonical order so the UI is stable regardless of model output.
    const byKey = new Map(verdict.sections.map((s) => [s.key, s]));
    return SECTION_ORDER.map((key) => byKey.get(key)).filter(
      (s): s is NonNullable<typeof s> => s !== undefined
    );
  }, [verdict]);

  const applicableSections = sections.filter((s) => s.present !== null);
  const presentCount = applicableSections.filter((s) => s.present === true).length;
  const totalApplicable = applicableSections.length;
  const completenessOk = totalApplicable > 0 && presentCount === totalApplicable;

  const authenticity = verdict?.authenticity ?? 'unclear';
  const authLabel =
    authenticity === 'likely_human'
      ? 'LIKELY HUMAN'
      : authenticity === 'likely_ai'
        ? 'LIKELY AI-WRITTEN'
        : 'UNCLEAR';
  const authBad = authenticity === 'likely_ai';

  return (
    <div>
      <div className="flex items-center justify-between mb-3 gap-4">
        <div className="flex items-center gap-2">
          <div className="text-cream-200 text-xs uppercase tracking-wider">README Content</div>
          <span className="text-cream-200/60 text-[10px] uppercase tracking-wider">· AI assist</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-cream-200">
          {verdict?.modelVersion && (
            <span className="text-cream-200/60">
              {verdict.promptVersion} · {verdict.modelVersion.replace(/-\d{8}$/, '')}
            </span>
          )}
          {verdictAt && (
            <span>{new Date(verdictAt).toLocaleString()}</span>
          )}
          <button
            onClick={onRefresh}
            disabled={loading}
            className="underline hover:text-cream-50 disabled:opacity-50"
          >
            {loading ? 'Re-running…' : 'Re-run'}
          </button>
        </div>
      </div>

      {/* Status: empty / pending / failed / skipped / done */}
      {status === null && !loading ? (
        <p className="text-cream-200 text-sm">
          No audit yet for this submission.{' '}
          <button onClick={onRefresh} className="underline hover:text-cream-50">
            Run now
          </button>
        </p>
      ) : status === 'pending' || (loading && !isDone) ? (
        <p className="text-cream-200 text-sm">AI audit running…</p>
      ) : status === 'skipped' ? (
        <div className="text-sm">
          <span className="inline-block px-2 py-0.5 mr-2 text-xs uppercase tracking-wider bg-brown-900 text-cream-200 border border-cream-500/20">
            SKIPPED
          </span>
          <span className="text-cream-200">
            {verdict?.reason || error || 'AI audit was skipped.'}
          </span>
        </div>
      ) : status === 'failed' ? (
        <div className="text-sm">
          <span className="inline-block px-2 py-0.5 mr-2 text-xs uppercase tracking-wider bg-brown-900 text-orange-500 border border-orange-500/40">
            FAILED
          </span>
          <span className="text-cream-200">
            {verdict?.reason || error || 'AI audit failed.'}{' '}
            <button onClick={onRefresh} className="underline hover:text-cream-50">
              Retry
            </button>
          </span>
        </div>
      ) : isDone ? (
        <>
          {/* Distill pills */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span
              className={
                'inline-block px-2 py-0.5 text-xs uppercase tracking-wider border ' +
                (authBad
                  ? 'bg-orange-500/15 text-orange-400 border-orange-500/40'
                  : 'bg-brown-900 text-cream-50 border-cream-500/20')
              }
            >
              {authLabel}
            </span>
            <span
              className={
                'inline-block px-2 py-0.5 text-xs uppercase tracking-wider border ' +
                (completenessOk
                  ? 'bg-brown-900 text-cream-50 border-cream-500/20'
                  : 'bg-orange-500/15 text-orange-400 border-orange-500/40')
              }
            >
              {presentCount}/{totalApplicable} SECTIONS
            </span>
            {verdict.truncated && (
              <span className="inline-block px-2 py-0.5 text-xs uppercase tracking-wider bg-brown-900 text-cream-200 border border-cream-500/20">
                TRUNCATED
              </span>
            )}
          </div>

          {/* Per-section findings */}
          <div className="space-y-2 mb-3">
            {sections.map((s) => {
              const label = SECTION_LABELS[s.key];
              const symbol =
                s.present === true ? '✓' : s.present === false ? '✗' : '○';
              const symbolColor =
                s.present === true
                  ? 'text-green-400'
                  : s.present === false
                    ? 'text-red-400'
                    : 'text-cream-200/50';
              return (
                <div key={s.key} className="flex items-start gap-2 text-sm">
                  <span className={symbolColor + ' leading-5 w-4 text-center'}>{symbol}</span>
                  <span className="text-cream-50">{label}</span>
                  {s.present === null ? (
                    <span className="text-cream-200/60 text-xs">(n/a)</span>
                  ) : s.notes ? (
                    <span className="text-cream-200 text-xs">— {s.notes}</span>
                  ) : null}
                </div>
              );
            })}
          </div>

          {/* Authenticity row + rationale */}
          <div className="flex items-start gap-2 text-sm mb-2">
            <span className="text-cream-200/80 leading-5 w-4 text-center">{'◔'}</span>
            <span className="text-cream-50">AI authorship</span>
            {verdict.authenticityNotes && (
              <span className="text-cream-200 text-xs">— {verdict.authenticityNotes}</span>
            )}
          </div>

          {verdict.rationale && (
            <div className="mt-2 border-l border-cream-500/20 pl-3 text-cream-200 text-xs italic">
              {verdict.rationale}
            </div>
          )}

          <p className="mt-3 text-[10px] uppercase tracking-wider text-cream-200/50">
            Evidence for reviewers — not a verdict. AI authorship detection is imperfect.
          </p>
        </>
      ) : (
        <p className="text-cream-200 text-sm">Could not load AI audit.</p>
      )}
    </div>
  );
}
