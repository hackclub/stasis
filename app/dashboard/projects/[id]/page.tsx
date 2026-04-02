'use client';

import React, { useState, useEffect, useCallback, use, useRef } from 'react';
import { useSession, linkOAuth2 } from "@/lib/auth-client";
import { useRouter } from 'next/navigation';

import { StageProgress } from '@/app/components/projects/StageProgress';
import { Timeline } from '@/app/components/projects/Timeline';
import { OnboardingTutorial } from '@/app/components/OnboardingTutorial';
import Link from 'next/link';
import { ProjectTag, BadgeType } from "@/app/generated/prisma/enums";
import type { TimelineItem } from '@/app/api/projects/[id]/timeline/route';
import { AVAILABLE_BADGES, MAX_BADGES_PER_PROJECT, getBadgeImage } from "@/lib/badges";
import { formatPrice, bomItemTotal } from "@/lib/format";
import { TIERS } from "@/lib/tiers";
import { STARTER_PROJECTS } from "@/lib/starter-projects";
import { BomCsvImportModal } from '@/app/components/projects/BomCsvImportModal';
import PreflightChecks from '@/app/components/projects/PreflightChecks';
import type { PreflightCheck } from '@/app/components/projects/PreflightChecks';

type ProjectStatus = "draft" | "in_review" | "approved" | "rejected" | "update_requested";


interface SessionMedia {
  id: string;
  type: "IMAGE" | "VIDEO";
  url: string;
}

interface WorkSession {
  id: string;
  hoursClaimed: number;
  hoursApproved: number | null;
  reviewComments: string | null;
  content: string | null;
  stage: "DESIGN" | "BUILD";
  createdAt: string;
  media: SessionMedia[];
}

interface ProjectBadge {
  id: string;
  badge: BadgeType;
  claimedAt: string;
  grantedAt: string | null;
}

interface BOMItem {
  id: string;
  name: string;
  purpose: string | null;
  quantity: number | null;
  totalCost: number;
  link: string | null;
  distributor: string | null;
  status: "pending" | "approved" | "rejected";
  reviewComments: string | null;
}

interface Project {
  id: string;
  title: string;
  description: string | null;
  tags: ProjectTag[];
  totalHoursClaimed: number;
  totalHoursApproved: number;
  isStarter: boolean;
  starterProjectId: string | null;
  noBomNeeded: boolean;
  bomTax: number | null;
  bomShipping: number | null;

  coverImage: string | null;
  githubRepo: string | null;
  
  // Stage-based status
  designStatus: ProjectStatus;
  designSubmissionNotes: string | null;
  designReviewComments: string | null;
  designReviewedAt: string | null;
  designReviewedBy: string | null;
  
  buildStatus: ProjectStatus;
  buildSubmissionNotes: string | null;
  buildReviewComments: string | null;
  buildReviewedAt: string | null;
  buildReviewedBy: string | null;
  
  tier: number | null;
  bitsAwarded: number | null;
  cartScreenshots: string[];
  createdAt: string;
  workSessions: WorkSession[];
  badges: ProjectBadge[];
  bomItems: BOMItem[];
}


const BADGE_LABELS: Record<BadgeType, string> = {
  I2C: "I2C",
  SPI: "SPI",
  WIFI: "WiFi",
  BLUETOOTH: "Bluetooth",
  OTHER_RF: "Other RF",
  ANALOG_SENSORS: "Analog Sensors",
  DIGITAL_SENSORS: "Digital Sensors",
  CAD: "CAD",
  DISPLAYS: "Displays",
  MOTORS: "Motors",
  CAMERAS: "Cameras",
  METAL_MACHINING: "Metal Machining",
  WOOD_FASTENERS: "Wood & Fasteners",
  MACHINE_LEARNING: "Machine Learning",
  MCU_INTEGRATION: "MCU Integration",
  FOUR_LAYER_PCB: "4-Layer PCB",
  SOLDERING: "Soldering",
  WOODWORKING: "Woodworking",
};


export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);
  const { data: session, isPending } = useSession();
  const router = useRouter();
  
  const [project, setProject] = useState<Project | null>(null);
  const skipVerification = process.env.NEXT_PUBLIC_SKIP_YSWS_VERIFICATION_CHECK === 'true';
  const sessionVerified = skipVerification || (session?.user as Record<string, unknown> | undefined)?.verificationStatus === 'verified';
  const [isVerified, setIsVerified] = useState(sessionVerified);
  const [refreshingVerification, setRefreshingVerification] = useState(false);
  const [hasAddress, setHasAddress] = useState(true); // default true so it doesn't block when PII is disabled
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showDesignSubmitDialog, setShowDesignSubmitDialog] = useState(false);
  const [showBuildSubmitDialog, setShowBuildSubmitDialog] = useState(false);
  const [submissionNotes, setSubmissionNotes] = useState('');
  const [showDesignUnsubmitDialog, setShowDesignUnsubmitDialog] = useState(false);
  const [showBuildUnsubmitDialog, setShowBuildUnsubmitDialog] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [preflightChecks, setPreflightChecks] = useState<PreflightCheck[] | null>(null);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [preflightError, setPreflightError] = useState<string | null>(null);
  const [preflightCanSubmit, setPreflightCanSubmit] = useState(true);
  const [submitStep, setSubmitStep] = useState<'type' | 'confirm'>('type');
  const [submitPcb, setSubmitPcb] = useState(false);
  const [submitCad, setSubmitCad] = useState(false);
  const [submitFirmware, setSubmitFirmware] = useState(false);
  const [submitNone, setSubmitNone] = useState(false);
  
  const [bomForm, setBomForm] = useState({
    name: '',
    purpose: '',
    quantity: '',
    totalCost: '',
    link: '',
    distributor: '',
  });
  const [addingBom, setAddingBom] = useState(false);
  const [deletingBomId, setDeletingBomId] = useState<string | null>(null);
  const [editingBomItem, setEditingBomItem] = useState<BOMItem | null>(null);
  const [editBomForm, setEditBomForm] = useState({ name: '', purpose: '', quantity: '', totalCost: '', link: '', distributor: '' });
  const [savingBomEdit, setSavingBomEdit] = useState(false);
  const [showBomImport, setShowBomImport] = useState(false);
  const [deletingAllBom, setDeletingAllBom] = useState(false);
  const [showDeleteAllBomConfirm, setShowDeleteAllBomConfirm] = useState(false);
  const [deleteAllBomTyped, setDeleteAllBomTyped] = useState('');
  const [timelineItems, setTimelineItems] = useState<TimelineItem[]>([]);
  const [showCartScreenshots, setShowCartScreenshots] = useState(false);
  const [uploadingCartScreenshot, setUploadingCartScreenshot] = useState(false);
  const [expandedScreenshot, setExpandedScreenshot] = useState<string | null>(null);
  const [hackatimeLinked, setHackatimeLinked] = useState<boolean | null>(null);
  const [hackatimeProjects, setHackatimeProjects] = useState<{ id: string; hackatimeProject: string; totalSeconds: number; hoursApproved: number | null }[]>([]);
  const [availableHackatimeProjects, setAvailableHackatimeProjects] = useState<{ name: string; total_seconds: number; archived: boolean }[]>([]);
  const [loadingHackatime, setLoadingHackatime] = useState(false);
  const [hackatimeSearch, setHackatimeSearch] = useState('');
  const [linkingHackatime, setLinkingHackatime] = useState(false);
  const [hackatimePickerOpen, setHackatimePickerOpen] = useState(false);

  // Inline editing state
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editGithubRepo, setEditGithubRepo] = useState('');
  const [editStarterProjectId, setEditStarterProjectId] = useState('');
  const [savingField, setSavingField] = useState(false);
  const [claimingBadge, setClaimingBadge] = useState<BadgeType | null>(null);
  const [alreadyClaimedBadges, setAlreadyClaimedBadges] = useState<BadgeType[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [importingJournal, setImportingJournal] = useState(false);

  const canEdit = project && project.designStatus !== "in_review" && project.buildStatus !== "in_review";

  const startEditing = (field: string) => {
    if (!project || !canEdit) return;
    setEditingField(field);
    switch (field) {
      case 'title': setEditTitle(project.title); break;
      case 'description': setEditDescription(project.description || ''); break;
      case 'githubRepo': setEditGithubRepo(project.githubRepo || ''); break;
      case 'projectType':
        setEditStarterProjectId(project.starterProjectId || '');
        break;
    }
  };

  const cancelEditing = () => setEditingField(null);

  const saveField = async (field: string, data: Record<string, unknown>) => {
    if (!project) return;
    setSavingField(true);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        setProject({ ...project, ...data } as Project);
        setEditingField(null);
      }
    } catch (error) {
      console.error(`Failed to update ${field}:`, error);
    } finally {
      setSavingField(false);
    }
  };

  const handleClaimBadge = async (badge: BadgeType) => {
    if (!project) return;
    const badges = project.badges ?? [];
    if (badges.length >= MAX_BADGES_PER_PROJECT) return;
    if (badges.some(b => b.badge === badge)) return;

    setClaimingBadge(badge);
    try {
      const res = await fetch('/api/badges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ badge, projectId: project.id }),
      });
      if (res.ok) {
        const updatedRes = await fetch(`/api/projects/${projectId}`);
        if (updatedRes.ok) setProject(await updatedRes.json());
        const claimedRes = await fetch(`/api/badges/claimed?excludeProjectId=${project.id}`);
        if (claimedRes.ok) setAlreadyClaimedBadges(await claimedRes.json());
      }
    } catch (error) {
      console.error('Failed to claim badge:', error);
    } finally {
      setClaimingBadge(null);
    }
  };

  const handleUnclaimBadge = async (badgeId: string, isGranted: boolean) => {
    if (!project || isGranted) return;
    try {
      const res = await fetch(`/api/badges/${badgeId}`, { method: 'DELETE' });
      if (res.ok) {
        const updatedRes = await fetch(`/api/projects/${projectId}`);
        if (updatedRes.ok) setProject(await updatedRes.json());
      }
    } catch (error) {
      console.error('Failed to unclaim badge:', error);
    }
  };

  const handleDeleteProject = async () => {
    if (!project || deleteConfirmText.toLowerCase() !== project.title.toLowerCase()) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/projects/${project.id}`, { method: 'DELETE' });
      if (res.ok) router.push('/dashboard');
    } catch (error) {
      console.error('Failed to delete project:', error);
    } finally {
      setDeleting(false);
    }
  };

  const handleImportJournal = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !project) return;
    e.target.value = '';
    setImportingJournal(true);
    try {
      const markdown = await file.text();
      const previewRes = await fetch(`/api/projects/${project.id}/sessions/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markdown, dryRun: true }),
      });
      if (!previewRes.ok) {
        const data = await previewRes.json();
        alert(data.error || 'Failed to parse journal');
        return;
      }
      const { count } = await previewRes.json();
      if (!confirm(`Found ${count} journal ${count === 1 ? 'entry' : 'entries'}. Import them?`)) return;

      const res = await fetch(`/api/projects/${project.id}/sessions/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markdown }),
      });
      if (res.ok) {
        const data = await res.json();
        alert(`Imported ${data.imported} journal ${data.imported === 1 ? 'entry' : 'entries'}`);
        const [updatedRes, timelineRes] = await Promise.all([
          fetch(`/api/projects/${projectId}`),
          fetch(`/api/projects/${projectId}/timeline`),
        ]);
        if (updatedRes.ok) setProject(await updatedRes.json());
        if (timelineRes.ok) setTimelineItems(await timelineRes.json());
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to import journal');
      }
    } catch (error) {
      console.error('Failed to import journal:', error);
      alert('Failed to import journal');
    } finally {
      setImportingJournal(false);
    }
  };

  useEffect(() => {
    async function fetchProject() {
      try {
        const res = await fetch(`/api/projects/${projectId}`);
        if (res.ok) {
          const data = await res.json();
          setProject(data);
        } else if (res.status === 403) {
          router.push(`/dashboard/discover/${projectId}`);
        } else if (res.status === 404) {
          router.push('/dashboard');
        }
      } catch (err) {
        console.error('Failed to fetch project:', err);
      } finally {
        setLoading(false);
      }
    }

    async function fetchTimeline() {
      try {
        const res = await fetch(`/api/projects/${projectId}/timeline`);
        if (res.ok) {
          const data = await res.json();
          setTimelineItems(data);
        }
      } catch (err) {
        console.error('Failed to fetch timeline:', err);
      }
    }

    async function refreshAddress() {
      try {
        const res = await fetch('/api/user/refresh-address', { method: 'POST' });
        if (res.ok) {
          const data = await res.json();
          if (data.piiEnabled) {
            setHasAddress(data.hasAddress);
          }
          if (data.verificationStatus === 'verified') {
            setIsVerified(true);
          }
        }
      } catch (err) {
        console.error('Failed to check address:', err);
      }
    }

    async function fetchClaimedBadges() {
      try {
        const res = await fetch(`/api/badges/claimed?excludeProjectId=${projectId}`);
        if (res.ok) setAlreadyClaimedBadges(await res.json());
      } catch (err) {
        console.error('Failed to fetch claimed badges:', err);
      }
    }

    async function fetchHackatime() {
      setLoadingHackatime(true);
      try {
        const [linkedRes, availRes] = await Promise.all([
          fetch(`/api/projects/${projectId}/hackatime`),
          fetch('/api/hackatime/projects'),
        ]);
        if (linkedRes.ok) {
          const data = await linkedRes.json();
          setHackatimeProjects(data.linkedProjects ?? []);
        }
        if (availRes.ok) {
          const data = await availRes.json();
          setAvailableHackatimeProjects(data.projects ?? []);
          setHackatimeLinked(true);
        } else if (availRes.status === 404) {
          setHackatimeLinked(false);
        }
      } catch (err) {
        console.error('Failed to fetch hackatime data:', err);
      } finally {
        setLoadingHackatime(false);
      }
    }

    if (session) {
      fetchProject();
      fetchTimeline();
      refreshAddress();
      fetchClaimedBadges();
      fetchHackatime();
    } else if (!isPending) {
      router.push('/dashboard');
    }
  }, [session, isPending, projectId, router]);

  // Sync session verification status into local state
  useEffect(() => {
    if (sessionVerified) setIsVerified(true);
  }, [sessionVerified]);

  const handleRefreshVerification = useCallback(async () => {
    setRefreshingVerification(true);
    try {
      const res = await fetch('/api/user/refresh-address', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.piiEnabled) setHasAddress(data.hasAddress);
        if (data.verificationStatus === 'verified') setIsVerified(true);
      }
    } catch (err) {
      console.error('Failed to refresh verification:', err);
    } finally {
      setRefreshingVerification(false);
    }
  }, []);

  // Listen for project tutorial replay triggers (from UserMenu or floating button)
  useEffect(() => {
    if (localStorage.getItem('stasis_replay_project_tutorial')) {
      localStorage.removeItem('stasis_replay_project_tutorial');
      setShowTutorial(true);
    }
    const handler = () => {
      localStorage.removeItem('stasis_replay_project_tutorial');
      setShowTutorial(true);
    };
    window.addEventListener('stasis:replay-project-tutorial', handler);
    return () => window.removeEventListener('stasis:replay-project-tutorial', handler);
  }, []);

  const allPreflightRef = useRef<{ checks: PreflightCheck[]; canSubmit: boolean } | null>(null);

  const startBackgroundScan = async () => {
    if (!project) return;
    setPreflightLoading(true);
    setPreflightError(null);
    allPreflightRef.current = null;
    try {
      const res = await fetch(`/api/projects/${project.id}/preflight?pcb=true&cad=true&firmware=true`);
      if (res.ok) {
        allPreflightRef.current = await res.json();
      } else {
        const data = await res.json().catch(() => ({}));
        setPreflightError(data.error || 'Failed to run pre-submission checks');
      }
    } catch {
      setPreflightError('Could not connect - check your internet connection');
    } finally {
      setPreflightLoading(false);
    }
  };

  const applyTypeFilter = (pcb: boolean, cad: boolean, firmware: boolean) => {
    const all = allPreflightRef.current;
    if (!all) return;
    const pcbKeys = ['pcb_source', 'pcb_fab'];
    const cadKeys = ['cad_source', 'cad_models'];
    const firmwareKeys = ['firmware'];
    const filtered = all.checks.filter((c) => {
      if (pcbKeys.includes(c.key)) return pcb;
      if (cadKeys.includes(c.key)) return cad;
      if (firmwareKeys.includes(c.key)) return firmware;
      return true;
    });
    setPreflightChecks(filtered);
    setPreflightCanSubmit(!filtered.some((c) => c.blocking && c.status === 'fail'));
  };

  const openSubmitDialog = (stage: "design" | "build") => {
    setPreflightChecks(null);
    setPreflightError(null);
    setPreflightCanSubmit(true);
    setSubmitStep('type');
    setSubmitPcb(false);
    setSubmitCad(false);
    setSubmitFirmware(false);
    setSubmitNone(false);
    if (stage === "design") {
      setShowDesignSubmitDialog(true);
    } else {
      setShowBuildSubmitDialog(true);
    }
    startBackgroundScan();
  };

  const proceedToConfirm = () => {
    setSubmitStep('confirm');
    if (allPreflightRef.current) {
      applyTypeFilter(submitPcb, submitCad, submitFirmware);
    }
  };

  const handleSubmitStage = async (stage: "design" | "build") => {
    if (!project) return;
    const notes = submissionNotes.trim();
    if (stage === "design") {
      setShowDesignSubmitDialog(false);
    } else {
      setShowBuildSubmitDialog(false);
    }
    setSubmissionNotes('');
    setSubmitting(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage, submissionNotes: notes || undefined }),
      });
      
      if (res.ok) {
        const [updatedRes, timelineRes] = await Promise.all([
          fetch(`/api/projects/${projectId}`),
          fetch(`/api/projects/${projectId}/timeline`),
        ]);
        if (updatedRes.ok) {
          setProject(await updatedRes.json());
        }
        if (timelineRes.ok) {
          setTimelineItems(await timelineRes.json());
        }
      } else {
        const data = await res.json();
        alert(data.error || `Failed to submit ${stage} for review`);
      }
    } catch (error) {
      console.error(`Failed to submit ${stage} for review:`, error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitDesign = () => handleSubmitStage("design");
  const handleSubmitBuild = () => handleSubmitStage("build");

  const handleUnsubmitStage = async (stage: "design" | "build") => {
    if (!project) return;
    if (stage === "design") {
      setShowDesignUnsubmitDialog(false);
    } else {
      setShowBuildUnsubmitDialog(false);
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/unsubmit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage }),
      });

      if (res.ok) {
        const [updatedRes, timelineRes] = await Promise.all([
          fetch(`/api/projects/${projectId}`),
          fetch(`/api/projects/${projectId}/timeline`),
        ]);
        if (updatedRes.ok) {
          setProject(await updatedRes.json());
        }
        if (timelineRes.ok) {
          setTimelineItems(await timelineRes.json());
        }
      } else {
        const data = await res.json();
        alert(data.error || `Failed to unsubmit ${stage}`);
      }
    } catch (error) {
      console.error(`Failed to unsubmit ${stage}:`, error);
    } finally {
      setSubmitting(false);
    }
  };

  // Computed values for stage requirements
  const designSessions = project?.workSessions.filter(s => s.stage === "DESIGN") ?? [];
  const buildSessions = project?.workSessions.filter(s => s.stage === "BUILD") ?? [];
  
  const canSubmitDesign = project &&
    (project.designStatus === "draft" || project.designStatus === "rejected" || project.designStatus === "update_requested") &&
    project.description?.trim() &&
    (project.bomItems.length > 0 || project.noBomNeeded) &&
    (project.noBomNeeded || project.bomItems.length === 0 || project.cartScreenshots.length > 0) &&
    designSessions.length > 0 &&
    project.githubRepo &&
    project.coverImage &&
    isVerified &&
    hasAddress;

  // Check if there are new build sessions since last approval
  const hasNewBuildSessions = project?.buildStatus === "approved" && project?.buildReviewedAt
    ? buildSessions.some(s => new Date(s.createdAt) > new Date(project.buildReviewedAt!))
    : true;
    
  const canSubmitBuild = project &&
    project.designStatus === "approved" &&
    (project.buildStatus === "draft" || project.buildStatus === "rejected" || project.buildStatus === "approved" || project.buildStatus === "update_requested") &&
    buildSessions.length > 0 &&
    hasNewBuildSessions &&
    isVerified &&
    hasAddress;

  const handleRequestUpdate = async () => {
    if (!project) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: "build" }),
      });
      
      if (res.ok) {
        const updatedRes = await fetch(`/api/projects/${projectId}`);
        if (updatedRes.ok) {
          setProject(await updatedRes.json());
        }
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to request update');
      }
    } catch (error) {
      console.error('Failed to request update:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleScreenshotUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !project) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!uploadRes.ok) {
        const data = await uploadRes.json();
        alert(data.error || 'Failed to upload image');
        return;
      }

      const { url } = await uploadRes.json();

      const updateRes = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coverImage: url }),
      });

      if (updateRes.ok) {
        setProject({ ...project, coverImage: url });
      }
    } catch (error) {
      console.error('Failed to upload screenshot:', error);
      alert('Failed to upload screenshot');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleAddBomItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project || !bomForm.name || !bomForm.totalCost) return;
    
    setAddingBom(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/bom`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: bomForm.name,
          purpose: bomForm.purpose || null,
          quantity: bomForm.quantity ? parseInt(bomForm.quantity, 10) : null,
          totalCost: parseFloat(bomForm.totalCost),
          link: bomForm.link || null,
          distributor: bomForm.distributor || null,
        }),
      });
      
      if (res.ok) {
        const updatedRes = await fetch(`/api/projects/${projectId}`);
        if (updatedRes.ok) {
          setProject(await updatedRes.json());
        }
        setBomForm({ name: '', purpose: '', quantity: '', totalCost: '', link: '', distributor: '' });
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to add BOM item');
      }
    } catch (error) {
      console.error('Failed to add BOM item:', error);
      alert('Failed to add BOM item');
    } finally {
      setAddingBom(false);
    }
  };

  const handleDeleteBomItem = async (bomId: string) => {
    if (!project) return;
    
    setDeletingBomId(bomId);
    try {
      const res = await fetch(`/api/projects/${project.id}/bom/${bomId}`, {
        method: 'DELETE',
      });
      
      if (res.ok) {
        const updatedRes = await fetch(`/api/projects/${projectId}`);
        if (updatedRes.ok) {
          setProject(await updatedRes.json());
        }
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to delete BOM item');
      }
    } catch (error) {
      console.error('Failed to delete BOM item:', error);
      alert('Failed to delete BOM item');
    } finally {
      setDeletingBomId(null);
    }
  };

  const handleDeleteAllBomItems = async () => {
    if (!project) return;

    setDeletingAllBom(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/bom`, {
        method: 'DELETE',
      });

      if (res.ok) {
        const updatedRes = await fetch(`/api/projects/${projectId}`);
        if (updatedRes.ok) {
          setProject(await updatedRes.json());
        }
        setShowDeleteAllBomConfirm(false);
        setDeleteAllBomTyped('');
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to delete all BOM items');
      }
    } catch (error) {
      console.error('Failed to delete all BOM items:', error);
      alert('Failed to delete all BOM items');
    } finally {
      setDeletingAllBom(false);
    }
  };

  const openEditBomItem = (item: BOMItem) => {
    setEditingBomItem(item);
    setEditBomForm({
      name: item.name,
      purpose: item.purpose || '',
      quantity: item.quantity != null ? String(item.quantity) : '',
      totalCost: String(item.totalCost),
      link: item.link || '',
      distributor: item.distributor || '',
    });
  };

  const handleSaveBomEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project || !editingBomItem || !editBomForm.name || !editBomForm.totalCost) return;

    setSavingBomEdit(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/bom/${editingBomItem.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editBomForm.name,
          purpose: editBomForm.purpose || null,
          quantity: editBomForm.quantity ? parseInt(editBomForm.quantity, 10) : null,
          totalCost: parseFloat(editBomForm.totalCost),
          link: editBomForm.link || null,
          distributor: editBomForm.distributor || null,
        }),
      });

      if (res.ok) {
        const updatedRes = await fetch(`/api/projects/${projectId}`);
        if (updatedRes.ok) {
          setProject(await updatedRes.json());
        }
        setEditingBomItem(null);
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to update BOM item');
      }
    } catch (error) {
      console.error('Failed to update BOM item:', error);
      alert('Failed to update BOM item');
    } finally {
      setSavingBomEdit(false);
    }
  };

  const handleToggleNoBomNeeded = async () => {
    if (!project) return;
    
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noBomNeeded: !project.noBomNeeded }),
      });
      
      if (res.ok) {
        setProject({ ...project, noBomNeeded: !project.noBomNeeded });
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to update project');
      }
    } catch (error) {
      console.error('Failed to update project:', error);
      alert('Failed to update project');
    }
  };

  const handleUpdateBomField = async (field: 'bomTax' | 'bomShipping', value: number | null) => {
    if (!project) return;
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      });
      if (res.ok) {
        setProject({ ...project, [field]: value });
      }
    } catch (error) {
      console.error(`Failed to update ${field}:`, error);
    }
  };

  const handleCartScreenshotUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !project) return;

    setUploadingCartScreenshot(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!uploadRes.ok) {
        const data = await uploadRes.json();
        alert(data.error || 'Failed to upload image');
        return;
      }

      const { url } = await uploadRes.json();
      const newScreenshots = [...project.cartScreenshots, url];

      const updateRes = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cartScreenshots: newScreenshots }),
      });

      if (updateRes.ok) {
        setProject({ ...project, cartScreenshots: newScreenshots });
      }
    } catch (error) {
      console.error('Failed to upload cart screenshot:', error);
      alert('Failed to upload cart screenshot');
    } finally {
      setUploadingCartScreenshot(false);
      e.target.value = '';
    }
  };

  const handleDeleteCartScreenshot = async (url: string) => {
    if (!project) return;
    const newScreenshots = project.cartScreenshots.filter(s => s !== url);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cartScreenshots: newScreenshots }),
      });
      if (res.ok) {
        setProject({ ...project, cartScreenshots: newScreenshots });
      }
    } catch (error) {
      console.error('Failed to delete cart screenshot:', error);
      alert('Failed to delete cart screenshot');
    }
  };

  const handleLinkHackatimeProject = async (projectName: string) => {
    if (!project) return;
    setLinkingHackatime(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/hackatime`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hackatimeProject: projectName }),
      });
      if (res.ok) {
        const linkedRes = await fetch(`/api/projects/${project.id}/hackatime`);
        if (linkedRes.ok) {
          const data = await linkedRes.json();
          setHackatimeProjects(data.linkedProjects ?? []);
        }
        setHackatimeSearch('');
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to link project');
      }
    } catch (error) {
      console.error('Failed to link hackatime project:', error);
    } finally {
      setLinkingHackatime(false);
    }
  };

  const handleUnlinkHackatimeProject = async (hackatimeProjectId: string) => {
    if (!project) return;
    const hp = hackatimeProjects.find(p => p.id === hackatimeProjectId);
    if (hp?.hoursApproved !== null && hp?.hoursApproved !== undefined) {
      if (!confirm('This project has already been reviewed. Unlinking will discard the review. Continue?')) return;
    }
    try {
      const res = await fetch(`/api/projects/${project.id}/hackatime?hackatimeProjectId=${hackatimeProjectId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setHackatimeProjects(prev => prev.filter(p => p.id !== hackatimeProjectId));
      }
    } catch (error) {
      console.error('Failed to unlink hackatime project:', error);
    }
  };

  if (isPending || loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="loader" />
      </div>
    );
  }

  if (!project) {
    return null;
  }

  const badges = project.badges ?? [];

  return (
    <div className="max-w-4xl mx-auto">
      {/* Onboarding Tutorial */}
      <OnboardingTutorial type="project" forceShow={showTutorial} onComplete={() => setShowTutorial(false)} badgeCount={badges.length} />


      {/* Breadcrumb */}
      <div className="mb-6">
        <Link href="/dashboard" className="text-brown-800 hover:text-orange-400 transition-colors flex items-center gap-2 text-sm">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          Back to Projects
        </Link>
      </div>

      <div>
          {/* Project Header */}
          <div className="mb-8">
            <div className="flex flex-col-reverse sm:flex-row sm:items-start sm:justify-between gap-4">
              <div className="flex-1">
                {editingField === 'title' ? (
                  <div className="mb-2">
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="w-full bg-white border-2 border-orange-500 text-orange-500 text-3xl uppercase tracking-wide px-2 py-1 focus:outline-none"
                      autoFocus
                    />
                    <div className="flex gap-2 mt-2">
                      <button onClick={() => saveField('title', { title: editTitle.trim() })} disabled={!editTitle.trim() || savingField} className="bg-orange-500 hover:bg-orange-400 disabled:bg-cream-300 text-white px-3 py-1 text-xs uppercase cursor-pointer">
                        {savingField ? 'Saving...' : 'Save'}
                      </button>
                      <button onClick={cancelEditing} className="bg-cream-300 hover:bg-cream-400 text-brown-800 px-3 py-1 text-xs uppercase cursor-pointer">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <h1 className="text-orange-500 text-3xl uppercase tracking-wide mb-2 group">
                    {project.title}
                    {canEdit && (
                      <button onClick={() => startEditing('title')} className="ml-2 text-cream-500 hover:text-orange-400 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer inline-block align-middle">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                    )}
                  </h1>
                )}

                {editingField === 'description' ? (
                  <div>
                    <textarea
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      className="w-full bg-white border-2 border-orange-500 text-brown-800 px-2 py-1 text-lg focus:outline-none resize-none h-24"
                      autoFocus
                    />
                    <div className="flex gap-2 mt-2">
                      <button onClick={() => saveField('description', { description: editDescription.trim() })} disabled={savingField} className="bg-orange-500 hover:bg-orange-400 disabled:bg-cream-300 text-white px-3 py-1 text-xs uppercase cursor-pointer">
                        {savingField ? 'Saving...' : 'Save'}
                      </button>
                      <button onClick={cancelEditing} className="bg-cream-300 hover:bg-cream-400 text-brown-800 px-3 py-1 text-xs uppercase cursor-pointer">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <p data-tutorial="description" className="text-brown-800 text-lg group">
                    {project.description || <span className="text-cream-500 italic">No description</span>}
                    {canEdit && (
                      <button onClick={() => startEditing('description')} className="ml-2 text-cream-500 hover:text-orange-400 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer inline-block align-middle">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                    )}
                  </p>
                )}
              </div>
              
              {/* Project Image / Upload */}
              <label className="w-full sm:w-64 h-44 bg-cream-100 border-2 border-dashed border-cream-400 hover:border-orange-500 hover:bg-cream-200 flex flex-col items-center justify-center flex-shrink-0 transition-colors cursor-pointer group relative overflow-hidden">
                {project.coverImage ? (
                  <>
                    <img 
                      src={project.coverImage} 
                      alt={project.title}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white mb-1">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                        <circle cx="8.5" cy="8.5" r="1.5"/>
                        <polyline points="21 15 16 10 5 21"/>
                      </svg>
                      <span className="text-white text-xs uppercase font-medium">Change Image</span>
                    </div>
                  </>
                ) : uploading ? (
                  <span className="text-brown-800 text-xs uppercase">Uploading...</span>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-brown-800 group-hover:text-orange-500 mb-1">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                      <circle cx="8.5" cy="8.5" r="1.5"/>
                      <polyline points="21 15 16 10 5 21"/>
                    </svg>
                    <span className="text-brown-800 group-hover:text-orange-500 text-xs uppercase font-medium">Upload Project Image</span>
                    <span className="text-cream-600 text-[10px] mt-1">Required for submission</span>
                  </>
                )}
                <input 
                  type="file" 
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  onChange={handleScreenshotUpload}
                  disabled={uploading}
                  className="hidden"
                />
              </label>
            </div>

            {project.isStarter && (
              <div className="flex flex-wrap gap-2 mt-4">
                <span className="text-xs bg-orange-500 text-white font-medium px-2 py-1 uppercase">
                  Starter
                </span>
              </div>
            )}

            {/* Stats */}
            <div className="mt-4 bg-cream-200/80 border border-cream-300 p-4 w-full sm:w-fit">
              <div className="flex flex-wrap gap-3 sm:gap-6 text-sm">
                <div>
                  <span className="text-brown-800">Hours Logged:</span>{' '}
                  <span className="text-brown-800">{project.totalHoursClaimed.toFixed(1)}h</span>
                </div>
                <div>
                  <span className="text-brown-800">Hours Approved:</span>{' '}
                  <span className="text-orange-500">{project.totalHoursApproved.toFixed(1)}h</span>
                </div>
                {project.bitsAwarded != null && (
                  <div>
                    <span className="text-brown-800">Bits Received:</span>{' '}
                    <span className="text-orange-500">{project.bitsAwarded}</span>
                  </div>
                )}
              </div>

              {/* GitHub Repo */}
              <div data-tutorial="github" className="mt-3 text-sm">
                <span className="text-brown-800">GitHub Repo:</span>{' '}
                {editingField === 'githubRepo' ? (
                  <span className="inline-flex items-center gap-2">
                    <input
                      type="text"
                      value={editGithubRepo}
                      onChange={(e) => setEditGithubRepo(e.target.value)}
                      className="bg-white border-2 border-orange-500 text-brown-800 px-2 py-0.5 text-sm focus:outline-none w-full sm:w-64"
                      placeholder="github.com/username/repo"
                      autoFocus
                    />
                    <button onClick={() => saveField('githubRepo', { githubRepo: editGithubRepo.trim() || null })} disabled={savingField} className="bg-orange-500 hover:bg-orange-400 disabled:bg-cream-300 text-white px-2 py-0.5 text-xs uppercase cursor-pointer">
                      {savingField ? '...' : 'Save'}
                    </button>
                    <button onClick={cancelEditing} className="bg-cream-300 hover:bg-cream-400 text-brown-800 px-2 py-0.5 text-xs uppercase cursor-pointer">Cancel</button>
                  </span>
                ) : project.githubRepo ? (
                  <span className="group">
                    <a
                      href={project.githubRepo}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-orange-500 hover:text-orange-400 underline"
                    >
                      {project.githubRepo}
                    </a>
                    {canEdit && (
                      <button onClick={() => startEditing('githubRepo')} className="ml-1 text-cream-500 hover:text-orange-400 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer inline-block align-middle">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                    )}
                  </span>
                ) : (
                  <span className="text-brown-800">
                    Not set.{' '}
                    {canEdit && (
                      <button onClick={() => startEditing('githubRepo')} className="text-orange-500 hover:text-orange-400 underline cursor-pointer">
                        Add one
                      </button>
                    )}
                  </span>
                )}
              </div>

            </div>

            {/* Quick Actions */}
            {(project.designStatus !== "in_review" && project.buildStatus !== "in_review") && (
              <div className="mt-6">
                <div className="flex flex-wrap gap-3">
                  <Link
                    href={`/dashboard/projects/${project.id}/session/new`}
                    data-tutorial="actions"
                    className="inline-block bg-orange-500 hover:bg-orange-400 text-white font-medium py-3 px-6 text-center uppercase tracking-wider transition-colors"
                  >
                    + New Journal Entry
                  </Link>
                  <a
                    href="https://lapse.hackclub.com/timelapse/create"
                    target="_blank"
                    rel="noopener noreferrer"
                    data-tutorial="timelapse"
                    className="inline-flex items-center gap-2 bg-cream-300 hover:bg-cream-400 text-brown-800 font-medium py-3 px-6 text-center uppercase tracking-wider transition-colors cursor-pointer border border-cream-400"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/>
                      <polyline points="12 6 12 12 16 14"/>
                    </svg>
                    Start Timelapse
                  </a>
                </div>
                <p className="text-cream-600 text-xs mt-2">
                  Planning to work 7+ hours? We recommend including a timelapse recording of your session.
                </p>
              </div>
            )}

          </div>

          {/* Stage Progress */}
          <div data-tutorial="stage-progress" className="bg-cream-100 border-2 border-cream-400 p-6 mb-6">
            <StageProgress 
              designStatus={project.designStatus} 
              buildStatus={project.buildStatus}
            />
            
            {/* Design Stage Review Comments */}
            {(project.designStatus === "rejected" || project.designStatus === "update_requested") && project.designReviewComments && (
              <div className="mt-4 bg-red-600/20 border border-red-600 p-3">
                <p className="text-red-500/80 text-xs uppercase mb-1">Design Feedback</p>
                <p className="text-red-600 text-sm whitespace-pre-wrap">{project.designReviewComments}</p>
              </div>
            )}
            
            {/* Build Stage Review Comments */}
            {(project.buildStatus === "rejected" || project.buildStatus === "update_requested") && project.buildReviewComments && (
              <div className="mt-4 bg-red-600/20 border border-red-600 p-3">
                <p className="text-red-500/80 text-xs uppercase mb-1">Build Feedback</p>
                <p className="text-red-600 text-sm whitespace-pre-wrap">{project.buildReviewComments}</p>
              </div>
            )}
          </div>

          {/* Badges Section */}
          <div data-tutorial="badges" className="bg-cream-100 border-2 border-cream-400 p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-brown-800 text-xl uppercase tracking-wide">Badges ({badges.length}/{MAX_BADGES_PER_PROJECT})</h2>
              {canEdit && editingField !== 'badges' && (
                <button onClick={() => startEditing('badges')} className="text-orange-500 hover:text-orange-400 text-xs uppercase cursor-pointer">
                  Manage Badges
                </button>
              )}
              {editingField === 'badges' && (
                <button onClick={cancelEditing} className="text-cream-600 hover:text-brown-800 text-xs uppercase cursor-pointer">
                  Done
                </button>
              )}
            </div>

            {badges.length === 0 && editingField !== 'badges' ? (
              <p className="text-brown-800 text-sm">
                No badges claimed yet.{' '}
                {canEdit && (
                  <button onClick={() => startEditing('badges')} className="text-orange-500 hover:text-orange-400 underline cursor-pointer">
                    Claim some
                  </button>
                )}
              </p>
            ) : (
              <div className="flex flex-wrap gap-4">
                {badges.map((badge) => {
                  return (
                    <div key={badge.id} className="flex flex-col items-center gap-1 w-24 relative group">
                      <img
                        src={getBadgeImage(badge.badge)}
                        alt={BADGE_LABELS[badge.badge]}
                        className={`w-20 h-20 object-contain ${!badge.grantedAt ? 'grayscale opacity-60' : ''}`}
                      />
                      <span className="text-xs uppercase text-brown-800 text-center">
                        {BADGE_LABELS[badge.badge]}
                      </span>
                      {editingField === 'badges' && !badge.grantedAt && (
                        <button
                          onClick={() => handleUnclaimBadge(badge.id, !!badge.grantedAt)}
                          className="absolute -top-1 -right-1 bg-red-600 hover:bg-red-500 text-white w-5 h-5 flex items-center justify-center text-[10px] cursor-pointer"
                        >
                          ✕
                        </button>
                      )}
                      {badge.grantedAt && (
                        <span className="text-[10px] text-green-600 uppercase">Granted</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Badge claiming UI */}
            {editingField === 'badges' && badges.length < MAX_BADGES_PER_PROJECT && (
              <div className="mt-4 border-t border-cream-400 pt-4">
                <p className="text-brown-800 text-xs uppercase mb-2">Available to claim</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                  {AVAILABLE_BADGES.filter(b => !badges.some(pb => pb.badge === b.value)).map((badge) => {
                    const isClaimedElsewhere = alreadyClaimedBadges.includes(badge.value);
                    return (
                      <button
                        key={badge.value}
                        type="button"
                        onClick={() => handleClaimBadge(badge.value)}
                        disabled={claimingBadge === badge.value || isClaimedElsewhere}
                        className={`text-left px-3 py-2 border text-sm transition-colors ${
                          isClaimedElsewhere
                            ? 'bg-cream-200 border-cream-300 text-cream-500 cursor-not-allowed'
                            : 'bg-white border-cream-400 hover:border-orange-400 text-brown-800 cursor-pointer disabled:opacity-50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <img src={getBadgeImage(badge.value)} alt="" className={`w-8 h-8 object-contain ${isClaimedElsewhere ? 'grayscale opacity-50' : ''}`} />
                          <span>{isClaimedElsewhere ? `${badge.label} (claimed)` : badge.label}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Hackatime Firmware Tracking */}
          <div className="bg-cream-100 border-2 border-cream-400 p-6 mb-6">
            <h2 className="text-brown-800 text-xl uppercase tracking-wide mb-2">Firmware Time</h2>
            <p className="text-brown-800 text-sm mb-4">
              Journaling time spent on writing firmware is not required, link your <a href="https://hackatime.hackclub.com" target="_blank" rel="noopener noreferrer" className="text-orange-500 hover:text-orange-400 underline">Hackatime</a> projects and we&apos;ll pull your coding time automatically.
            </p>
            
            {hackatimeLinked === null ? (
              <div className="loader" style={{ width: 12, height: 18 }} />
            ) : !hackatimeLinked ? (
              <p className="text-brown-800 text-sm">
                No Hackatime account linked.{' '}
                <button
                  onClick={() => linkOAuth2({ providerId: "hackatime", callbackURL: `/dashboard/projects/${project.id}` })}
                  className="text-orange-500 hover:text-orange-400 underline cursor-pointer"
                >
                  Link your account
                </button>
              </p>
            ) : (
              <div className="space-y-3">
                {/* Linked projects */}
                {hackatimeProjects.length > 0 && (
                  <div className="space-y-2">
                    {hackatimeProjects.map((hp) => (
                      <div key={hp.id} className="flex items-center justify-between bg-cream-200 border border-cream-300 px-3 py-2 group">
                        <div className="flex items-center gap-2">
                          <span className="text-brown-800 text-sm">{hp.hackatimeProject}</span>
                          <span className="text-cream-600 text-sm">
                            {hp.totalSeconds > 0 ? `${(hp.totalSeconds / 3600).toFixed(1)}h` : '0h'}
                          </span>
                        </div>
                        {project.designStatus !== "in_review" && project.buildStatus !== "in_review" && (
                          <button
                            onClick={() => handleUnlinkHackatimeProject(hp.id)}
                            className="text-cream-500 hover:text-red-500 transition-colors cursor-pointer"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                          </button>
                        )}
                      </div>
                    ))}
                    <div className="text-sm text-brown-800 mt-1">
                      Total firmware time:{' '}
                      <span className="text-brown-800">{(hackatimeProjects.reduce((sum, p) => sum + p.totalSeconds, 0) / 3600).toFixed(1)}h</span>
                    </div>
                  </div>
                )}

                {/* Add project picker - hidden while in review */}
                {project.designStatus !== "in_review" && project.buildStatus !== "in_review" && (
                  <div className="relative">
                    <input
                      type="text"
                      value={hackatimeSearch}
                      onChange={(e) => setHackatimeSearch(e.target.value)}
                      onFocus={() => setHackatimePickerOpen(true)}
                      onBlur={() => setTimeout(() => setHackatimePickerOpen(false), 150)}
                      disabled={linkingHackatime}
                      placeholder="+ Link a Hackatime project..."
                      className="w-full bg-white border-2 border-dashed border-cream-400 text-brown-800 px-3 py-2.5 text-sm focus:border-orange-500 focus:border-solid focus:outline-none transition-colors placeholder:text-cream-500 disabled:opacity-50"
                    />
                    {hackatimePickerOpen && (
                      <div className="absolute z-10 left-0 right-0 border border-cream-300 border-t-0 max-h-48 overflow-y-auto bg-white">
                        {availableHackatimeProjects
                          .filter(p => !p.archived && p.name.toLowerCase().includes(hackatimeSearch.toLowerCase()))
                          .filter(p => !hackatimeProjects.some(hp => hp.hackatimeProject === p.name))
                          .map((p) => (
                            <button
                              key={p.name}
                              onClick={() => handleLinkHackatimeProject(p.name)}
                              disabled={linkingHackatime}
                              className="w-full text-left px-3 py-2.5 text-sm hover:bg-orange-500/10 transition-colors cursor-pointer flex justify-between items-center border-b border-cream-200 last:border-b-0"
                            >
                              <span className="text-brown-800 font-medium">{p.name}</span>
                              <span className="text-cream-600 text-xs">{(p.total_seconds / 3600).toFixed(1)}h</span>
                            </button>
                          ))}
                        {availableHackatimeProjects
                          .filter(p => !p.archived && p.name.toLowerCase().includes(hackatimeSearch.toLowerCase()))
                          .filter(p => !hackatimeProjects.some(hp => hp.hackatimeProject === p.name))
                          .length === 0 && (
                          <p className="px-3 py-2.5 text-cream-500 text-sm">No matching projects</p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {loadingHackatime && <div className="loader" style={{ width: 12, height: 18 }} />}
              </div>
            )}
          </div>

          {/* Stage Requirements */}
          {project.designStatus !== "approved" && (
            <div className="bg-cream-100 border-2 border-cream-400 p-4 mb-6">
              <p className="text-brown-800 text-xs uppercase mb-3">Design Stage Requirements</p>
              <div className="space-y-2">
                <div className={`flex items-center gap-2 text-sm ${project.description?.trim() ? 'text-green-500' : 'text-brown-800'}`}>
                  {project.description?.trim() ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <span className="w-3.5 h-3.5 border border-cream-500 inline-block" />
                  )}
                  Project description
                </div>
                <div className={`flex items-center gap-2 text-sm ${(project.bomItems.length > 0 || project.noBomNeeded) ? 'text-green-500' : 'text-brown-800'}`}>
                  {(project.bomItems.length > 0 || project.noBomNeeded) ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <span className="w-3.5 h-3.5 border border-cream-500 inline-block" />
                  )}
                  {project.noBomNeeded ? 'No parts needed' : `At least 1 BOM item (${project.bomItems.length} added)`}
                </div>
                {!project.noBomNeeded && project.bomItems.length > 0 && (
                  <div className={`flex items-center gap-2 text-sm ${project.cartScreenshots.length > 0 ? 'text-green-500' : 'text-brown-800'}`}>
                    {project.cartScreenshots.length > 0 ? (
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      <span className="w-3.5 h-3.5 border border-cream-500 inline-block" />
                    )}
                    Cart screenshot ({project.cartScreenshots.length} uploaded)
                  </div>
                )}
                <div className={`flex items-center gap-2 text-sm ${designSessions.length > 0 ? 'text-green-500' : 'text-brown-800'}`}>
                  {designSessions.length > 0 ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <span className="w-3.5 h-3.5 border border-cream-500 inline-block" />
                  )}
                  At least 1 journal entry ({designSessions.length} logged)
                </div>
                <div className={`flex items-center gap-2 text-sm ${project.githubRepo ? 'text-green-500' : 'text-brown-800'}`}>
                  {project.githubRepo ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <span className="w-3.5 h-3.5 border border-cream-500 inline-block" />
                  )}
                  GitHub repo linked
                </div>
                <div className={`flex items-center gap-2 text-sm ${project.badges.length > 0 ? 'text-green-500' : 'text-cream-500'}`}>
                  {project.badges.length > 0 ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <span className="w-3.5 h-3.5 border border-cream-500 inline-block" />
                  )}
                  Badges claimed ({project.badges.length} claimed) — optional
                </div>
                <div className={`flex items-center gap-2 text-sm ${project.coverImage ? 'text-green-500' : 'text-brown-800'}`}>
                  {project.coverImage ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <span className="w-3.5 h-3.5 border border-cream-500 inline-block" />
                  )}
                  Upload a project image
                </div>
                <div className={`flex items-center gap-2 text-sm ${isVerified ? 'text-green-500' : 'text-brown-800'}`}>
                  {isVerified ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <span className="w-3.5 h-3.5 border border-cream-500 inline-block" />
                  )}
                  Verify your YSWS Eligibility
                  {!isVerified && (
                    <>
                      <a
                        href="https://auth.hackclub.com/verifications/document"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-1 px-2 py-0.5 bg-orange-500 text-white text-xs uppercase hover:bg-orange-400 transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        do this now
                      </a>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRefreshVerification(); }}
                        disabled={refreshingVerification}
                        className="px-2 py-0.5 text-brown-600 text-xs uppercase hover:text-brown-800 transition-colors disabled:opacity-50"
                      >
                        {refreshingVerification ? 'checking...' : 'refresh'}
                      </button>
                    </>
                  )}
                </div>
                <div className={`flex items-center gap-2 text-sm ${hasAddress ? 'text-green-500' : 'text-brown-800'}`}>
                  {hasAddress ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <span className="w-3.5 h-3.5 border border-cream-500 inline-block" />
                  )}
                  Add your shipping address
                  {!hasAddress && (
                    <a
                      href="https://auth.hackclub.com/addresses"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-1 px-2 py-0.5 bg-orange-500 text-white text-xs uppercase hover:bg-orange-400 transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      do this now
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}

          {project.designStatus === "approved" && project.buildStatus !== "approved" && (
            <div className="bg-cream-100 border-2 border-cream-400 p-4 mb-6">
              <p className="text-brown-800 text-xs uppercase mb-3">Build Stage Requirements</p>
              <div className="space-y-2">
                <div className={`flex items-center gap-2 text-sm ${isVerified ? 'text-green-500' : 'text-brown-800'}`}>
                  {isVerified ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <span className="w-3.5 h-3.5 border border-cream-500 inline-block" />
                  )}
                  Verify your YSWS Eligibility
                  {!isVerified && (
                    <>
                      <a
                        href="https://auth.hackclub.com/verifications/document"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-1 px-2 py-0.5 bg-orange-500 text-white text-xs uppercase hover:bg-orange-400 transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        do this now
                      </a>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRefreshVerification(); }}
                        disabled={refreshingVerification}
                        className="px-2 py-0.5 text-brown-600 text-xs uppercase hover:text-brown-800 transition-colors disabled:opacity-50"
                      >
                        {refreshingVerification ? 'checking...' : 'refresh'}
                      </button>
                    </>
                  )}
                </div>
                <div className={`flex items-center gap-2 text-sm ${hasAddress ? 'text-green-500' : 'text-brown-800'}`}>
                  {hasAddress ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <span className="w-3.5 h-3.5 border border-cream-500 inline-block" />
                  )}
                  Add your shipping address
                  {!hasAddress && (
                    <a
                      href="https://auth.hackclub.com/addresses"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-1 px-2 py-0.5 bg-orange-500 text-white text-xs uppercase hover:bg-orange-400 transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      do this now
                    </a>
                  )}
                </div>
                <div className={`flex items-center gap-2 text-sm ${buildSessions.length > 0 ? 'text-green-500' : 'text-brown-800'}`}>
                  {buildSessions.length > 0 ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <span className="w-3.5 h-3.5 border border-cream-500 inline-block" />
                  )}
                  At least 1 journal entry ({buildSessions.length} logged)
                </div>
              </div>
            </div>
          )}

          {/* Bill of Materials */}
          <div data-tutorial="bom" className="bg-cream-100 border-2 border-cream-400 p-6 mb-6">
            <h2 className="text-brown-800 text-xl uppercase tracking-wide mb-4">Bill of Materials</h2>
            
            <div className="bg-blue-600/20 border border-blue-600 p-3 mb-4">
              <p className="text-blue-600 text-sm">
                Your project&apos;s complexity level determines its <span className="font-medium">bit</span> allocation (<span className="font-medium">1 bit</span> = $1). List the parts you need here—your BOM will be reviewed when you submit your design, and you&apos;ll receive a grant card to purchase approved materials. You can <span className="font-medium">add tax and shipping costs separately</span> below the items table.
              </p>
            </div>

            {(project.bomItems ?? []).length > 0 ? (
              <div className="overflow-x-auto mb-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-cream-400">
                      <th className="text-left text-brown-800 uppercase text-xs py-2 pr-3">Name</th>
                      <th className="text-left text-brown-800 uppercase text-xs py-2 pr-3">Purpose</th>
                      <th className="text-right text-brown-800 uppercase text-xs py-2 pr-3">Qty</th>
                      <th className="text-right text-brown-800 uppercase text-xs py-2 pr-3">Total (USD)</th>
                      <th className="text-left text-brown-800 uppercase text-xs py-2 pr-3">Link</th>
                      <th className="text-left text-brown-800 uppercase text-xs py-2 pr-3">Distributor</th>
                      {(project.designStatus === "draft" || project.designStatus === "rejected" || project.designStatus === "update_requested") && (
                        <th className="text-center text-brown-800 uppercase text-xs py-2"></th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {(project.bomItems ?? []).map((item) => (
                      <tr key={item.id} className="border-b border-cream-300">
                        <td className="text-brown-800 py-2 pr-3">{item.name}</td>
                        <td className="text-brown-800 py-2 pr-3">{item.purpose || '-'}</td>
                        <td className="text-brown-800 py-2 pr-3 text-right">{item.quantity ?? '-'}</td>
                        <td className="text-brown-800 py-2 pr-3 text-right">${formatPrice(item.totalCost)}</td>
                        <td className="py-2 pr-3">
                          {item.link ? (
                            <a href={item.link} target="_blank" rel="noopener noreferrer" className="text-orange-500 hover:text-orange-400 underline">
                              Link to Listing
                            </a>
                          ) : '-'}
                        </td>
                        <td className="text-brown-800 py-2 pr-3">{item.distributor || '-'}</td>
                        {(project.designStatus === "draft" || project.designStatus === "rejected" || project.designStatus === "update_requested") && (
                          <td className="py-2 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => openEditBomItem(item)}
                                className="text-orange-500 hover:text-orange-400 transition-colors cursor-pointer text-xs uppercase tracking-wider"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDeleteBomItem(item.id)}
                                disabled={deletingBomId === item.id}
                                className="text-red-500 hover:text-red-400 disabled:text-cream-400 transition-colors cursor-pointer"
                              >
                                {deletingBomId === item.id ? '...' : '✕'}
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
                
                {/* Tax & Shipping */}
                <div className="flex gap-4 mt-3 pt-3 border-t border-cream-300">
                  <div>
                    <label className="text-brown-800 text-xs uppercase block mb-1">Tax (USD)</label>
                    {(project.designStatus === "draft" || project.designStatus === "rejected" || project.designStatus === "update_requested") ? (
                      <input
                        type="number"
                        step="any"
                        min="0"
                        defaultValue={project.bomTax ?? ''}
                        onBlur={(e) => {
                          const val = e.target.value ? parseFloat(e.target.value) : null;
                          if (val !== (project.bomTax ?? null)) handleUpdateBomField('bomTax', val);
                        }}
                        className="w-28 bg-white border-2 border-cream-400 text-brown-800 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
                        placeholder="0.00"
                      />
                    ) : (
                      <span className="text-brown-800 text-sm">${formatPrice(project.bomTax ?? 0)}</span>
                    )}
                  </div>
                  <div>
                    <label className="text-brown-800 text-xs uppercase block mb-1">Shipping (USD)</label>
                    {(project.designStatus === "draft" || project.designStatus === "rejected" || project.designStatus === "update_requested") ? (
                      <input
                        type="number"
                        step="any"
                        min="0"
                        defaultValue={project.bomShipping ?? ''}
                        onBlur={(e) => {
                          const val = e.target.value ? parseFloat(e.target.value) : null;
                          if (val !== (project.bomShipping ?? null)) handleUpdateBomField('bomShipping', val);
                        }}
                        className="w-28 bg-white border-2 border-cream-400 text-brown-800 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
                        placeholder="0.00"
                      />
                    ) : (
                      <span className="text-brown-800 text-sm">${formatPrice(project.bomShipping ?? 0)}</span>
                    )}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1 mt-3 pt-3 border-t border-cream-400">
                  <div className="flex items-center">
                    <span className="text-brown-800 text-sm uppercase mr-3">Total Estimated Cost (USD):</span>
                    <span className="text-brown-800 font-medium">
                      ${formatPrice((project.bomItems ?? []).reduce((sum, item) => sum + bomItemTotal(item), 0) + (project.bomTax ?? 0) + (project.bomShipping ?? 0))}
                    </span>
                  </div>
                  <div className="flex items-center">
                    <span className="text-brown-800 text-xs mr-3">Estimated cost in bits:</span>
                    <span className="text-brown-800 text-sm">
                      {Math.ceil((project.bomItems ?? []).reduce((sum, item) => sum + bomItemTotal(item), 0) + (project.bomTax ?? 0) + (project.bomShipping ?? 0))}&nbsp;bits
                    </span>
                  </div>
                  {project.bitsAwarded != null && project.totalHoursApproved > 0 && (
                    <div className="flex items-center">
                      <span className="text-brown-800 text-xs mr-3">Bits per hour:</span>
                      <span className="text-orange-500 text-sm">
                        {(project.bitsAwarded / project.totalHoursApproved).toFixed(1)}/h
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-brown-800 text-sm mb-4">No items added yet.</p>
            )}

            {/* Cart Screenshots */}
            {!project.noBomNeeded && (project.bomItems ?? []).length > 0 && (
              <div className="border-t border-cream-400 pt-4 mb-4">
                <p className="text-brown-800 text-xs uppercase mb-3">Cart Screenshots</p>
                {project.cartScreenshots.length === 0 ? (
                  <div className="flex items-center gap-3">
                    <p className="text-cream-600 text-sm">Upload screenshots of your cart with the items you plan to buy.</p>
                    {(project.designStatus === "draft" || project.designStatus === "rejected" || project.designStatus === "update_requested") && (
                      <label className="shrink-0 bg-orange-500 hover:bg-orange-400 text-white px-3 py-1.5 text-xs uppercase tracking-wider transition-colors cursor-pointer">
                        {uploadingCartScreenshot ? 'Uploading...' : 'Upload'}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/gif,image/webp"
                          onChange={handleCartScreenshotUpload}
                          disabled={uploadingCartScreenshot}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>
                ) : (
                  <div className="flex gap-2 flex-wrap">
                    {project.cartScreenshots.map((url, i) => (
                      <div key={i} className="relative group w-20 h-20">
                        <button type="button" onClick={() => setExpandedScreenshot(url)} className="block w-full h-full border border-cream-400 hover:border-orange-500 transition-colors overflow-hidden cursor-pointer">
                          <img src={url} alt={`Cart screenshot ${i + 1}`} className="w-full h-full object-cover" />
                        </button>
                        {(project.designStatus === "draft" || project.designStatus === "rejected" || project.designStatus === "update_requested") && (
                          <button
                            type="button"
                            onClick={() => handleDeleteCartScreenshot(url)}
                            className="absolute -top-1.5 -right-1.5 bg-red-600 hover:bg-red-500 text-white w-5 h-5 flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                    {(project.designStatus === "draft" || project.designStatus === "rejected" || project.designStatus === "update_requested") && (
                      <label className="w-20 h-20 border-2 border-dashed border-cream-400 hover:border-orange-500 flex items-center justify-center cursor-pointer transition-colors group">
                        {uploadingCartScreenshot ? (
                          <span className="text-cream-600 text-[10px] uppercase">Uploading</span>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-cream-500 group-hover:text-orange-500 transition-colors">
                            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                          </svg>
                        )}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/gif,image/webp"
                          onChange={handleCartScreenshotUpload}
                          disabled={uploadingCartScreenshot}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>
                )}
              </div>
            )}

            {(project.designStatus === "draft" || project.designStatus === "rejected" || project.designStatus === "update_requested") && (
              <form onSubmit={handleAddBomItem} className="border-t border-cream-400 pt-4">
                <p className="text-brown-800 text-xs uppercase mb-3">Add New Item</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
                  <div>
                    <label className="text-brown-800 text-xs uppercase block mb-1">Name *</label>
                    <input
                      type="text"
                      value={bomForm.name}
                      onChange={(e) => setBomForm({ ...bomForm, name: e.target.value })}
                      required
                      className="w-full bg-white border-2 border-cream-400 text-brown-800 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
                      placeholder="Component name"
                    />
                  </div>
                  <div>
                    <label className="text-brown-800 text-xs uppercase block mb-1">Purpose *</label>
                    <input
                      type="text"
                      value={bomForm.purpose}
                      onChange={(e) => setBomForm({ ...bomForm, purpose: e.target.value })}
                      required
                      className="w-full bg-white border-2 border-cream-400 text-brown-800 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
                      placeholder="What is it for?"
                    />
                  </div>
                  <div>
                    <label className="text-brown-800 text-xs uppercase block mb-1">Quantity</label>
                    <input
                      type="number"
                      min="1"
                      value={bomForm.quantity}
                      onChange={(e) => setBomForm({ ...bomForm, quantity: e.target.value })}
                      className="w-full bg-white border-2 border-cream-400 text-brown-800 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
                      placeholder="1"
                    />
                  </div>
                  <div>
                    <label className="text-brown-800 text-xs uppercase block mb-1">Total Cost (USD)</label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={bomForm.totalCost}
                      onChange={(e) => setBomForm({ ...bomForm, totalCost: e.target.value })}
                      className="w-full bg-white border-2 border-cream-400 text-brown-800 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="text-brown-800 text-xs uppercase block mb-1">Link</label>
                    <input
                      type="url"
                      value={bomForm.link}
                      onChange={(e) => setBomForm({ ...bomForm, link: e.target.value })}
                      className="w-full bg-white border-2 border-cream-400 text-brown-800 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
                      placeholder="https://..."
                    />
                  </div>
                  <div>
                    <label className="text-brown-800 text-xs uppercase block mb-1">Distributor *</label>
                    <input
                      type="text"
                      value={bomForm.distributor}
                      onChange={(e) => setBomForm({ ...bomForm, distributor: e.target.value })}
                      required
                      className="w-full bg-white border-2 border-cream-400 text-brown-800 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
                      placeholder="e.g. Digikey, Amazon"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={addingBom || !bomForm.name || !bomForm.purpose || !bomForm.totalCost || !bomForm.distributor}
                  className="bg-orange-500 hover:bg-orange-400 disabled:bg-cream-300 disabled:text-cream-500 disabled:cursor-not-allowed text-white px-4 py-2 uppercase text-sm tracking-wider transition-colors cursor-pointer"
                >
                  {addingBom ? 'Adding...' : '+ Add Item'}
                </button>
              </form>
            )}

            <div className="border-t border-cream-400 pt-4 mt-4 flex items-center gap-4">
              {(project.bomItems ?? []).length > 0 && (
                <button
                  onClick={() => {
                    const items = project.bomItems ?? [];
                    const header = "Name,Purpose,Quantity,Total Cost (USD),Link,Distributor";
                    const rows = items.map((item) => {
                      const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
                      return [
                        escape(item.name),
                        escape(item.purpose || ""),
                        item.quantity ?? "",
                        item.totalCost.toFixed(2),
                        escape(item.link || ""),
                        escape(item.distributor || ""),
                      ].join(",");
                    });
                    const csv = [header, ...rows].join("\n");
                    const blob = new Blob([csv], { type: "text/csv" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `${project.title || "project"}-bom.csv`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="bg-orange-500 hover:bg-orange-400 text-white px-3 py-1.5 text-xs uppercase tracking-wider transition-colors cursor-pointer"
                >
                  Export CSV
                </button>
              )}
              {(project.designStatus === "draft" || project.designStatus === "rejected" || project.designStatus === "update_requested") && (
                <button
                  onClick={() => setShowBomImport(true)}
                  className="bg-orange-500 hover:bg-orange-400 text-white px-3 py-1.5 text-xs uppercase tracking-wider transition-colors cursor-pointer"
                >
                  Import CSV
                </button>
              )}
              {(project.designStatus === "draft" || project.designStatus === "rejected" || project.designStatus === "update_requested") && (project.bomItems ?? []).length > 0 && (
                <button
                  onClick={() => setShowDeleteAllBomConfirm(true)}
                  className="bg-red-600 hover:bg-red-500 text-white px-3 py-1.5 text-xs uppercase tracking-wider transition-colors cursor-pointer"
                >
                  Delete All Items
                </button>
              )}
              {((project.bomItems ?? []).length > 0 || (project.designStatus === "draft" || project.designStatus === "rejected" || project.designStatus === "update_requested")) && (
                <div className="w-px h-4 bg-cream-400" />
              )}
              {(project.designStatus === "draft" || project.designStatus === "rejected" || project.designStatus === "update_requested") && (
                <button
                  onClick={handleToggleNoBomNeeded}
                  className={`text-sm transition-colors cursor-pointer ${
                    project.noBomNeeded 
                      ? 'text-green-600 hover:text-green-500' 
                      : 'text-cream-600 hover:text-cream-500'
                  }`}
                >
                  {project.noBomNeeded ? (
                    <span className="flex items-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      No parts needed for this project
                    </span>
                  ) : (
                    "I don't need to buy any parts for this project"
                  )}
                </button>
              )}
            </div>
            {showBomImport && project && (
              <BomCsvImportModal
                projectId={project.id}
                onClose={() => setShowBomImport(false)}
                onImported={async () => {
                  const res = await fetch(`/api/projects/${projectId}`);
                  if (res.ok) setProject(await res.json());
                }}
              />
            )}
            {showDeleteAllBomConfirm && project && (
              <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
                <div className="bg-cream-100 border-2 border-red-600 p-8 max-w-md w-full mx-4">
                  <h3 className="text-red-600 text-xl uppercase tracking-wide mb-2 text-center">Delete All BOM Items</h3>
                  <div className="bg-red-600/10 border border-red-600 p-4 mb-4">
                    <p className="text-red-600 text-sm text-center font-medium">
                      This will permanently delete all {(project.bomItems ?? []).length} item{(project.bomItems ?? []).length === 1 ? '' : 's'} from your Bill of Materials. This action cannot be undone.
                    </p>
                  </div>
                  <p className="text-brown-800 text-sm mb-2">
                    Type <span className="font-bold text-red-600">DELETE</span> to confirm:
                  </p>
                  <input
                    type="text"
                    value={deleteAllBomTyped}
                    onChange={(e) => setDeleteAllBomTyped(e.target.value)}
                    className="w-full bg-white border-2 border-cream-400 text-brown-800 px-3 py-2 text-sm focus:border-red-600 focus:outline-none mb-4"
                    placeholder="Type DELETE here"
                    autoFocus
                  />
                  <div className="flex gap-3">
                    <button
                      onClick={() => { setShowDeleteAllBomConfirm(false); setDeleteAllBomTyped(''); }}
                      className="flex-1 bg-cream-300 hover:bg-cream-400 text-brown-800 px-4 py-2 uppercase text-sm tracking-wider transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDeleteAllBomItems}
                      disabled={deleteAllBomTyped !== 'DELETE' || deletingAllBom}
                      className="flex-1 bg-red-600 hover:bg-red-500 disabled:bg-cream-300 disabled:text-cream-500 disabled:cursor-not-allowed text-white px-4 py-2 uppercase text-sm tracking-wider transition-colors cursor-pointer"
                    >
                      {deletingAllBom ? 'Deleting...' : 'Delete All Items'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Complexity Level & Project Type */}
          {canEdit && (
            <div className="bg-cream-100 border-2 border-cream-400 p-6 mb-6">
              <h2 className="text-brown-800 text-xl uppercase tracking-wide mb-4">Project Settings</h2>

              {/* Tier - always visible as selectable buttons */}
              <div className="mb-5">
                <p className="text-brown-800 text-xs uppercase mb-2">
                  Complexity Level
                  {project.designStatus === 'approved' && (
                    <span className="ml-2 text-cream-500 normal-case">(locked by reviewer)</span>
                  )}
                </p>
                <div className="flex flex-wrap gap-2">
                  {TIERS.map((tier) => {
                    const isSelected = project.tier === tier.id;
                    const isLocked = project.designStatus === 'approved';
                    return (
                      <button
                        key={tier.id}
                        type="button"
                        onClick={() => !isLocked && saveField('tier', { tier: isSelected ? null : tier.id })}
                        disabled={isLocked}
                        className={`px-3 py-2 text-sm text-left border transition-colors ${
                          isSelected
                            ? isLocked
                              ? 'bg-green-600/20 border-green-600 text-green-700 cursor-default'
                              : 'bg-orange-500 text-white border-orange-400 cursor-pointer'
                            : isLocked
                              ? 'bg-cream-200 text-cream-400 border-cream-300 cursor-default'
                              : 'bg-cream-300 text-brown-800 hover:bg-cream-400 border-cream-400 cursor-pointer'
                        }`}
                      >
                        <span className="uppercase font-medium">{tier.name}</span>
                        <span className="block text-xs mt-0.5 opacity-80">
                          {tier.bits}&nbsp;bits · {tier.minHours}{tier.maxHours === Infinity ? '+' : `–${tier.maxHours}`}h
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Journal Import/Export */}
              <div className="border-t border-cream-400 pt-4 mb-5">
                <p className="text-brown-800 text-xs uppercase mb-2">Journal Import / Export</p>
                <div className="flex flex-wrap gap-2">
                  <a
                    href={`/api/projects/${project.id}/sessions/export`}
                    className="inline-flex items-center gap-2 bg-cream-300 hover:bg-cream-400 text-brown-800 px-3 py-2 text-sm uppercase tracking-wider transition-colors cursor-pointer border border-cream-400"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    Export Journal
                  </a>
                  <label className={`inline-flex items-center gap-2 bg-cream-300 hover:bg-cream-400 text-brown-800 px-3 py-2 text-sm uppercase tracking-wider transition-colors cursor-pointer border border-cream-400 ${importingJournal ? 'opacity-50 pointer-events-none' : ''}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                    {importingJournal ? 'Importing...' : 'Import Journal'}
                    <input
                      type="file"
                      accept=".md,.markdown,text/markdown"
                      onChange={handleImportJournal}
                      disabled={importingJournal}
                      className="hidden"
                    />
                  </label>
                </div>
                <p className="text-cream-600 text-xs mt-1">Export your journal to put it in your GitHub repo! You can also import from Blueprint.</p>
              </div>

              {/* Project Type - always visible as toggle */}
              <div className="border-t border-cream-400 pt-4">
                <p className="text-brown-800 text-xs uppercase mb-2">Project Type</p>
                <div className="flex gap-2 max-w-xs">
                  <button
                    type="button"
                    onClick={() => !project.isStarter || saveField('projectType', { isStarter: false, starterProjectId: null })}
                    className={`flex-1 px-3 py-2 text-sm uppercase transition-colors cursor-pointer ${
                      !project.isStarter
                        ? 'bg-orange-500 text-white font-medium'
                        : 'bg-cream-300 text-brown-800 hover:bg-cream-400'
                    }`}
                  >
                    Custom
                  </button>
                  <button
                    type="button"
                    onClick={() => project.isStarter || startEditing('projectType')}
                    className={`flex-1 px-3 py-2 text-sm uppercase transition-colors cursor-pointer ${
                      project.isStarter
                        ? 'bg-orange-500 text-white font-medium'
                        : 'bg-cream-300 text-brown-800 hover:bg-cream-400'
                    }`}
                  >
                    Starter
                  </button>
                </div>
                {(project.isStarter || editingField === 'projectType') && (
                  <div className="mt-2 max-w-xs">
                    <select
                      value={editingField === 'projectType' ? editStarterProjectId : (project.starterProjectId || '')}
                      onChange={(e) => {
                        if (e.target.value) {
                          saveField('projectType', { isStarter: true, starterProjectId: e.target.value });
                        } else {
                          setEditStarterProjectId('');
                        }
                      }}
                      className="w-full bg-white border-2 border-cream-400 text-brown-800 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
                    >
                      <option value="">Select a starter project...</option>
                      {STARTER_PROJECTS.map((sp) => (
                        <option key={sp.id} value={sp.id}>{sp.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-3 mb-8">
            {/* Design Stage: Submit or Unsubmit */}
            {(project.designStatus === "draft" || project.designStatus === "rejected" || project.designStatus === "update_requested") && (
              <button
                data-tutorial="submit"
                onClick={() => openSubmitDialog('design')}
                disabled={submitting || !canSubmitDesign}
                className="flex-1 min-w-[200px] bg-green-600 hover:bg-green-500 disabled:bg-cream-300 disabled:text-cream-500 disabled:cursor-not-allowed text-white py-3 uppercase tracking-wider transition-colors cursor-pointer"
              >
                {submitting ? 'Submitting...' : (project.designStatus === "draft" ? 'Submit Design for Review' : 'Resubmit Design')}
              </button>
            )}
            {project.designStatus === "in_review" && (
              <button
                onClick={() => setShowDesignUnsubmitDialog(true)}
                disabled={submitting}
                className="flex-1 min-w-[200px] border-2 border-red-400 bg-cream-100 hover:bg-red-50 text-red-600 py-3 uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Unsubmitting...' : 'Unsubmit Design'}
              </button>
            )}

            {/* Build Stage: Submit or Unsubmit */}
            {project.designStatus === "approved" && (project.buildStatus === "draft" || project.buildStatus === "rejected" || project.buildStatus === "approved" || project.buildStatus === "update_requested") && (
              <button
                data-tutorial="submit"
                onClick={() => openSubmitDialog('build')}
                disabled={submitting || !canSubmitBuild}
                className="flex-1 min-w-[200px] bg-green-600 hover:bg-green-500 disabled:bg-cream-300 disabled:text-cream-500 disabled:cursor-not-allowed text-white py-3 uppercase tracking-wider transition-colors cursor-pointer"
              >
                {submitting ? 'Submitting...' : (project.buildStatus === "draft" ? 'Submit Build for Review' : 'Resubmit Build')}
              </button>
            )}
            {project.buildStatus === "in_review" && (
              <button
                onClick={() => setShowBuildUnsubmitDialog(true)}
                disabled={submitting}
                className="flex-1 min-w-[200px] border-2 border-red-400 bg-cream-100 hover:bg-red-50 text-red-600 py-3 uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Unsubmitting...' : 'Unsubmit Build'}
              </button>
            )}
          </div>

          {/* Edit BOM Item Modal */}
          {editingBomItem && (
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setEditingBomItem(null)}>
              <div className="bg-cream-100 border-2 border-cream-400 max-w-lg w-full p-6" onClick={(e) => e.stopPropagation()}>
                <h3 className="text-brown-800 text-xl uppercase tracking-wide mb-4">Edit BOM Item</h3>
                <form onSubmit={handleSaveBomEdit}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                    <div>
                      <label className="text-brown-800 text-xs uppercase block mb-1">Name *</label>
                      <input
                        type="text"
                        value={editBomForm.name}
                        onChange={(e) => setEditBomForm({ ...editBomForm, name: e.target.value })}
                        required
                        className="w-full bg-white border-2 border-cream-400 text-brown-800 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-brown-800 text-xs uppercase block mb-1">Purpose</label>
                      <input
                        type="text"
                        value={editBomForm.purpose}
                        onChange={(e) => setEditBomForm({ ...editBomForm, purpose: e.target.value })}
                        className="w-full bg-white border-2 border-cream-400 text-brown-800 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-brown-800 text-xs uppercase block mb-1">Quantity</label>
                      <input
                        type="number"
                        min="1"
                        value={editBomForm.quantity}
                        onChange={(e) => setEditBomForm({ ...editBomForm, quantity: e.target.value })}
                        className="w-full bg-white border-2 border-cream-400 text-brown-800 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-brown-800 text-xs uppercase block mb-1">Total Cost (USD)</label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={editBomForm.totalCost}
                        onChange={(e) => setEditBomForm({ ...editBomForm, totalCost: e.target.value })}
                        className="w-full bg-white border-2 border-cream-400 text-brown-800 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-brown-800 text-xs uppercase block mb-1">Link</label>
                      <input
                        type="url"
                        value={editBomForm.link}
                        onChange={(e) => setEditBomForm({ ...editBomForm, link: e.target.value })}
                        className="w-full bg-white border-2 border-cream-400 text-brown-800 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
                        placeholder="https://..."
                      />
                    </div>
                    <div>
                      <label className="text-brown-800 text-xs uppercase block mb-1">Distributor</label>
                      <input
                        type="text"
                        value={editBomForm.distributor}
                        onChange={(e) => setEditBomForm({ ...editBomForm, distributor: e.target.value })}
                        className="w-full bg-white border-2 border-cream-400 text-brown-800 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setEditingBomItem(null)}
                      className="flex-1 bg-cream-200 hover:bg-cream-300 text-brown-800 py-2 uppercase tracking-wider text-sm transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={savingBomEdit || !editBomForm.name || !editBomForm.totalCost}
                      className="flex-1 bg-orange-500 hover:bg-orange-400 disabled:bg-cream-300 disabled:text-cream-500 disabled:cursor-not-allowed text-white py-2 uppercase tracking-wider text-sm transition-colors cursor-pointer"
                    >
                      {savingBomEdit ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Design Submit Dialog (2-step) */}
          {showDesignSubmitDialog && (
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
              <div className="bg-cream-100 border-2 border-cream-400 max-w-lg w-full p-6 max-h-[80vh] overflow-y-auto">
                {submitStep === 'type' ? (
                  <>
                    <h3 className="text-brown-800 text-xl uppercase tracking-wide mb-4">What does your project include?</h3>
                    <p className="text-brown-800 text-sm leading-relaxed mb-4">
                      Select what applies. We&apos;ll check your GitHub repo for the required files.
                    </p>
                    <div className="space-y-3 mb-6">
                      <label className={`flex items-center gap-3 cursor-pointer ${submitNone ? 'opacity-40' : ''}`}>
                        <input type="checkbox" checked={submitPcb} onChange={() => setSubmitPcb(!submitPcb)} disabled={submitNone} className="w-4 h-4 accent-orange-500" />
                        <span className="text-brown-800 text-sm">Custom PCB</span>
                      </label>
                      <label className={`flex items-center gap-3 cursor-pointer ${submitNone ? 'opacity-40' : ''}`}>
                        <input type="checkbox" checked={submitCad} onChange={() => setSubmitCad(!submitCad)} disabled={submitNone} className="w-4 h-4 accent-orange-500" />
                        <span className="text-brown-800 text-sm">Custom CAD</span>
                      </label>
                      <label className={`flex items-center gap-3 cursor-pointer ${submitNone ? 'opacity-40' : ''}`}>
                        <input type="checkbox" checked={submitFirmware} onChange={() => setSubmitFirmware(!submitFirmware)} disabled={submitNone} className="w-4 h-4 accent-orange-500" />
                        <span className="text-brown-800 text-sm">Firmware</span>
                      </label>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" checked={submitNone} onChange={() => { setSubmitNone(!submitNone); if (!submitNone) { setSubmitPcb(false); setSubmitCad(false); setSubmitFirmware(false); } }} className="w-4 h-4 accent-orange-500" />
                        <span className="text-brown-800 text-sm">None of the above</span>
                      </label>
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={() => { setShowDesignSubmitDialog(false); setSubmissionNotes(''); }}
                        className="flex-1 bg-cream-200 hover:bg-cream-300 text-brown-800 py-2 uppercase tracking-wider transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={proceedToConfirm}
                        disabled={!submitPcb && !submitCad && !submitFirmware && !submitNone}
                        className="flex-1 bg-green-600 hover:bg-green-500 disabled:bg-cream-300 disabled:text-cream-500 disabled:cursor-not-allowed text-white py-2 uppercase tracking-wider transition-colors cursor-pointer"
                      >
                        Next
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <h3 className="text-brown-800 text-xl uppercase tracking-wide mb-4">Submit Design for Review?</h3>
                    <p className="text-brown-800 text-sm leading-relaxed mb-4">
                      Your design, BOM, and complexity level will be reviewed. Once approved, your badges will be granted and you&apos;ll receive a grant card to purchase materials!
                    </p>
                    <p className="text-red-500 text-sm font-medium mb-4">
                      IMPORTANT: Before submitting, please make sure to read the{' '}
                      <Link href="/docs/submission-guidelines" className="underline hover:text-red-400">
                        submission guidelines
                      </Link>
                      .
                    </p>
                    <PreflightChecks
                      checks={preflightChecks}
                      loading={preflightLoading}
                      error={preflightError}
                      onRetry={async () => { await startBackgroundScan(); applyTypeFilter(submitPcb, submitCad, submitFirmware); }}
                    />
                    <div className="mb-4">
                      <label className="block text-brown-800 text-sm font-medium uppercase tracking-wide mb-1">Note to reviewer (optional)</label>
                      <p className="text-brown-600 text-xs mb-2">Anything you&apos;d like the reviewer to know about your project?</p>
                      <textarea
                        value={submissionNotes}
                        onChange={(e) => setSubmissionNotes(e.target.value)}
                        placeholder=""
                        className="w-full bg-cream-200 border border-cream-400 text-brown-800 p-2 text-sm resize-vertical min-h-[80px] placeholder:text-brown-400"
                        maxLength={1000}
                      />
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={() => setSubmitStep('type')}
                        className="flex-1 bg-cream-200 hover:bg-cream-300 text-brown-800 py-2 uppercase tracking-wider transition-colors cursor-pointer"
                      >
                        Back
                      </button>
                      <button
                        onClick={handleSubmitDesign}
                        disabled={preflightLoading || (!preflightCanSubmit && !preflightError)}
                        className="flex-1 bg-green-600 hover:bg-green-500 disabled:bg-cream-300 disabled:text-cream-500 disabled:cursor-not-allowed text-white py-2 uppercase tracking-wider transition-colors cursor-pointer"
                      >
                        Submit Design
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Build Submit Dialog (2-step) */}
          {showBuildSubmitDialog && (
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
              <div className="bg-cream-100 border-2 border-cream-400 max-w-lg w-full p-6 max-h-[80vh] overflow-y-auto">
                {submitStep === 'type' ? (
                  <>
                    <h3 className="text-brown-800 text-xl uppercase tracking-wide mb-4">What does your project include?</h3>
                    <p className="text-brown-800 text-sm leading-relaxed mb-4">
                      Select what applies. We&apos;ll check your GitHub repo for the required files.
                    </p>
                    <div className="space-y-3 mb-6">
                      <label className={`flex items-center gap-3 cursor-pointer ${submitNone ? 'opacity-40' : ''}`}>
                        <input type="checkbox" checked={submitPcb} onChange={() => setSubmitPcb(!submitPcb)} disabled={submitNone} className="w-4 h-4 accent-orange-500" />
                        <span className="text-brown-800 text-sm">Custom PCB</span>
                      </label>
                      <label className={`flex items-center gap-3 cursor-pointer ${submitNone ? 'opacity-40' : ''}`}>
                        <input type="checkbox" checked={submitCad} onChange={() => setSubmitCad(!submitCad)} disabled={submitNone} className="w-4 h-4 accent-orange-500" />
                        <span className="text-brown-800 text-sm">Custom CAD</span>
                      </label>
                      <label className={`flex items-center gap-3 cursor-pointer ${submitNone ? 'opacity-40' : ''}`}>
                        <input type="checkbox" checked={submitFirmware} onChange={() => setSubmitFirmware(!submitFirmware)} disabled={submitNone} className="w-4 h-4 accent-orange-500" />
                        <span className="text-brown-800 text-sm">Firmware</span>
                      </label>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" checked={submitNone} onChange={() => { setSubmitNone(!submitNone); if (!submitNone) { setSubmitPcb(false); setSubmitCad(false); setSubmitFirmware(false); } }} className="w-4 h-4 accent-orange-500" />
                        <span className="text-brown-800 text-sm">None of the above</span>
                      </label>
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={() => { setShowBuildSubmitDialog(false); setSubmissionNotes(''); }}
                        className="flex-1 bg-cream-200 hover:bg-cream-300 text-brown-800 py-2 uppercase tracking-wider transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={proceedToConfirm}
                        disabled={!submitPcb && !submitCad && !submitFirmware && !submitNone}
                        className="flex-1 bg-green-600 hover:bg-green-500 disabled:bg-cream-300 disabled:text-cream-500 disabled:cursor-not-allowed text-white py-2 uppercase tracking-wider transition-colors cursor-pointer"
                      >
                        Next
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <h3 className="text-brown-800 text-xl uppercase tracking-wide mb-4">Submit Build for Review?</h3>
                    <p className="text-brown-800 text-sm leading-relaxed mb-4">
                      Your build work will be reviewed. Once approved, you&apos;ll earn the <span className="text-orange-500 font-medium">bits</span> for this project&apos;s complexity level!
                    </p>
                    <p className="text-red-500 text-sm font-medium mb-4">
                      IMPORTANT: Before submitting, please make sure to read the{' '}
                      <Link href="/docs/submission-guidelines" className="underline hover:text-red-400">
                        submission guidelines
                      </Link>
                      .
                    </p>
                    <PreflightChecks
                      checks={preflightChecks}
                      loading={preflightLoading}
                      error={preflightError}
                      onRetry={async () => { await startBackgroundScan(); applyTypeFilter(submitPcb, submitCad, submitFirmware); }}
                    />
                    <div className="mb-4">
                      <label className="block text-brown-800 text-sm font-medium uppercase tracking-wide mb-1">Note to reviewer (optional)</label>
                      <p className="text-brown-600 text-xs mb-2">Anything you&apos;d like the reviewer to know about your project?</p>
                      <textarea
                        value={submissionNotes}
                        onChange={(e) => setSubmissionNotes(e.target.value)}
                        placeholder=""
                        className="w-full bg-cream-200 border border-cream-400 text-brown-800 p-2 text-sm resize-vertical min-h-[80px] placeholder:text-brown-400"
                        maxLength={1000}
                      />
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={() => setSubmitStep('type')}
                        className="flex-1 bg-cream-200 hover:bg-cream-300 text-brown-800 py-2 uppercase tracking-wider transition-colors cursor-pointer"
                      >
                        Back
                      </button>
                      <button
                        onClick={handleSubmitBuild}
                        disabled={preflightLoading || (!preflightCanSubmit && !preflightError)}
                        className="flex-1 bg-green-600 hover:bg-green-500 disabled:bg-cream-300 disabled:text-cream-500 disabled:cursor-not-allowed text-white py-2 uppercase tracking-wider transition-colors cursor-pointer"
                      >
                        Submit Build
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Design Unsubmit Confirmation Dialog */}
          {showDesignUnsubmitDialog && (
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
              <div className="bg-cream-100 border-2 border-cream-400 max-w-md w-full p-6">
                <h3 className="text-brown-800 text-xl uppercase tracking-wide mb-4">Unsubmit Design?</h3>
                <p className="text-brown-800 text-sm leading-relaxed mb-6">
                  This will pull your design back from review and return it to draft status. You can make changes and resubmit when ready.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowDesignUnsubmitDialog(false)}
                    className="flex-1 bg-cream-200 hover:bg-cream-300 text-brown-800 py-2 uppercase tracking-wider transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleUnsubmitStage("design")}
                    className="flex-1 bg-red-600 hover:bg-red-500 text-white py-2 uppercase tracking-wider transition-colors cursor-pointer"
                  >
                    Unsubmit Design
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Build Unsubmit Confirmation Dialog */}
          {showBuildUnsubmitDialog && (
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
              <div className="bg-cream-100 border-2 border-cream-400 max-w-md w-full p-6">
                <h3 className="text-brown-800 text-xl uppercase tracking-wide mb-4">Unsubmit Build?</h3>
                <p className="text-brown-800 text-sm leading-relaxed mb-6">
                  This will pull your build back from review and return it to draft status. You can make changes and resubmit when ready.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowBuildUnsubmitDialog(false)}
                    className="flex-1 bg-cream-200 hover:bg-cream-300 text-brown-800 py-2 uppercase tracking-wider transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleUnsubmitStage("build")}
                    className="flex-1 bg-red-600 hover:bg-red-500 text-white py-2 uppercase tracking-wider transition-colors cursor-pointer"
                  >
                    Unsubmit Build
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Cart Screenshots Modal */}
          {showCartScreenshots && project && (
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
              <div className="bg-cream-100 border-2 border-cream-400 max-w-lg w-full p-6 max-h-[80vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-brown-800 text-xl uppercase tracking-wide">Cart Screenshots</h3>
                  <button
                    onClick={() => setShowCartScreenshots(false)}
                    className="text-brown-800 hover:text-orange-500 transition-colors cursor-pointer"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
                {project.cartScreenshots.length > 0 && (
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    {project.cartScreenshots.map((url, i) => (
                      <div key={i} className="relative group">
                        <button type="button" onClick={() => setExpandedScreenshot(url)} className="w-full cursor-pointer">
                          <img src={url} alt={`Cart screenshot ${i + 1}`} className="w-full h-40 object-cover border border-cream-400 hover:border-orange-500 transition-colors" />
                        </button>
                        {(project.designStatus === "draft" || project.designStatus === "rejected" || project.designStatus === "update_requested") && (
                          <button
                            onClick={() => handleDeleteCartScreenshot(url)}
                            className="absolute top-1 right-1 bg-red-600 hover:bg-red-500 text-white w-6 h-6 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {(project.designStatus === "draft" || project.designStatus === "rejected" || project.designStatus === "update_requested") && (
                  <div className="flex gap-3">
                    <label className="flex-1 bg-orange-500 hover:bg-orange-400 text-white py-2 text-center uppercase text-sm tracking-wider transition-colors cursor-pointer">
                      {uploadingCartScreenshot ? 'Uploading...' : '+ Upload Screenshot'}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/gif,image/webp"
                        onChange={handleCartScreenshotUpload}
                        disabled={uploadingCartScreenshot}
                        className="hidden"
                      />
                    </label>
                    {project.cartScreenshots.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowCartScreenshots(false)}
                        className="flex-1 bg-green-600 hover:bg-green-500 text-white py-2 uppercase text-sm tracking-wider transition-colors cursor-pointer"
                      >
                        Done
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Expanded Screenshot Overlay */}
          {expandedScreenshot && (
            <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4 cursor-pointer" onClick={() => setExpandedScreenshot(null)}>
              <img src={expandedScreenshot} alt="Cart screenshot" className="max-w-full max-h-full object-contain" />
            </div>
          )}

        {/* Timeline */}
        <div data-tutorial="timeline" className="bg-cream-100 border-2 border-cream-400 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-brown-800 text-xl uppercase tracking-wide">Timeline</h2>
          </div>
          <Timeline items={timelineItems} projectId={projectId} />
        </div>

        {/* Delete Project */}
        {canEdit && (
          <div className="bg-cream-100 border-2 border-red-600/30 p-6">
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(!showDeleteConfirm)}
              className="text-red-500 hover:text-red-400 text-sm uppercase transition-colors cursor-pointer"
            >
              {showDeleteConfirm ? 'Cancel Delete' : 'Delete Project...'}
            </button>

            {showDeleteConfirm && (
              <div className="mt-4 space-y-3">
                <p className="text-brown-800 text-sm">
                  Type <span className="text-red-500 font-bold">{project.title}</span> to confirm deletion:
                </p>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  className="w-full bg-white border-2 border-red-600/50 text-brown-800 px-3 py-2 focus:border-red-500 focus:outline-none transition-colors"
                  placeholder="Type project name..."
                />
                <button
                  type="button"
                  onClick={handleDeleteProject}
                  disabled={deleteConfirmText.toLowerCase() !== project.title.toLowerCase() || deleting}
                  className="w-full bg-red-600 hover:bg-red-500 disabled:bg-cream-400 disabled:cursor-not-allowed text-white py-2 text-sm uppercase tracking-wider transition-colors cursor-pointer"
                >
                  {deleting ? 'Deleting...' : 'Permanently Delete Project'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Floating help button to replay project tutorial */}
      {!showTutorial && (
        <button
          onClick={() => setShowTutorial(true)}
          className="fixed bottom-10 right-10 w-10 h-10 bg-orange-500 hover:bg-orange-600 text-white flex items-center justify-center text-lg font-bold transition-colors cursor-pointer z-40"
          aria-label="Replay project tutorial"
          title="Replay project tutorial"
        >
          ?
        </button>
      )}
    </div>
  );
}
