'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSession, signIn, signOut, linkOAuth2 } from "@/lib/auth-client";
import { gsap } from 'gsap';
import { NoiseOverlay } from '../components/NoiseOverlay';
import { ProjectCard } from '../components/projects/ProjectCard';
import { NewProjectCard } from '../components/projects/NewProjectCard';
import { NewProjectModal } from '../components/projects/NewProjectModal';
import { ProjectTag } from "@/app/generated/prisma/enums"
import Link from 'next/link';

type BadgeType = 
  | "I2C" | "SPI" | "WIFI" | "BLUETOOTH" | "OTHER_RF"
  | "ANALOG_SENSORS" | "DIGITAL_SENSORS" | "CAD" | "DISPLAYS" | "MOTORS"
  | "CAMERAS" | "METAL_MACHINING" | "WOOD_FASTENERS" | "MACHINE_LEARNING"
  | "MCU_INTEGRATION" | "FOUR_LAYER_PCB" | "SOLDERING";

interface WorkSession {
  id: string
  hoursClaimed: number
  hoursApproved: number | null
  content: string | null
  createdAt: string
}

interface ProjectBadge {
  id: string
  badge: BadgeType
  claimedAt: string
  grantedAt: string | null
}

interface Project {
  id: string
  title: string
  description: string | null
  tags: ProjectTag[]
  totalHoursClaimed: number
  totalHoursApproved: number
  isStarter: boolean
  coverImage: string | null
  status: "draft" | "in_review" | "approved" | "rejected"
  createdAt: string
  workSessions: WorkSession[]
  badges: ProjectBadge[]
}

type Tab = 'projects' | 'settings'

export default function Dashboard() {
  const { data: session, isPending } = useSession();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('projects');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [gridOffset, setGridOffset] = useState(0);
  const svgContainerRef = useRef<SVGSVGElement>(null);
  const rotationTweensRef = useRef<gsap.core.Tween[]>([]);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/projects');
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
      }
    } catch (error) {
      console.error('Failed to fetch projects:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session) {
      fetchProjects();
      // Check if user is admin
      fetch('/api/user')
        .then(res => res.json())
        .then(data => setIsAdmin(data.isAdmin ?? false))
        .catch(() => setIsAdmin(false));
    } else {
      setLoading(false);
    }
  }, [session, fetchProjects]);

  // Animated grid background
  useEffect(() => {
    const animate = () => {
      setGridOffset(prev => prev + 0.2);
      requestAnimationFrame(animate);
    };
    const frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, []);

  // SVG rotation animations
  useEffect(() => {
    const svgContainer = svgContainerRef.current;
    if (!svgContainer) return;

    const lines = [
      { from: 80, to: 200, duration: 60, direction: 1 },
      { from: 200, to: 320, duration: 80, direction: -1 },
      { from: 320, to: 600, duration: 105, direction: 1 },
      { from: 600, to: 720, duration: 50, direction: -1 },
      { from: 720, to: 1080, duration: 95, direction: 1 }
    ];

    lines.forEach((line, i) => {
      const lineGroup1 = svgContainer.querySelector(`[data-line-group="${i}-1"]`);
      const lineGroup2 = svgContainer.querySelector(`[data-line-group="${i}-2"]`);
      const square1a = svgContainer.querySelector(`[data-square="${i}-1a"]`);
      const square1b = svgContainer.querySelector(`[data-square="${i}-1b"]`);
      const square2a = svgContainer.querySelector(`[data-square="${i}-2a"]`);
      const square2b = svgContainer.querySelector(`[data-square="${i}-2b"]`);

      if (lineGroup1 && lineGroup2 && square1a && square1b && square2a && square2b) {
        const tween1 = gsap.to(lineGroup1, {
          rotation: 360 * line.direction,
          duration: line.duration,
          repeat: -1,
          ease: 'none',
          svgOrigin: '700 400'
        });
        
        const tween2 = gsap.to(lineGroup2, {
          rotation: 360 * line.direction,
          duration: line.duration,
          repeat: -1,
          ease: 'none',
          svgOrigin: '700 400'
        });

        const counterRotation = -360 * line.direction;
        const tween3 = gsap.to(square1a, { rotation: counterRotation, duration: line.duration, repeat: -1, ease: 'none', svgOrigin: '700 400' });
        const tween4 = gsap.to(square1b, { rotation: counterRotation, duration: line.duration, repeat: -1, ease: 'none', svgOrigin: '700 400' });
        const tween5 = gsap.to(square2a, { rotation: counterRotation, duration: line.duration, repeat: -1, ease: 'none', svgOrigin: '700 400' });
        const tween6 = gsap.to(square2b, { rotation: counterRotation, duration: line.duration, repeat: -1, ease: 'none', svgOrigin: '700 400' });
        
        rotationTweensRef.current.push(tween1, tween2, tween3, tween4, tween5, tween6);
      }
    });

    return () => {
      gsap.killTweensOf('*');
    };
  }, []);

  const handleCreateProject = async (data: {
    title: string
    description: string
    tags: ProjectTag[]
    isStarter: boolean
  }) => {
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      
      if (res.ok) {
        setIsModalOpen(false);
        fetchProjects();
      }
    } catch (error) {
      console.error('Failed to create project:', error);
    }
  };

  if (isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream-950 font-mono">
        <p className="text-cream-500">Loading...</p>
      </div>
    );
  }

  if (!session) {
    return (
      <>
        <div className="min-h-screen flex items-center justify-center bg-cream-950 font-mono">
          <div className="bg-cream-900 border-2 border-cream-600 p-8 max-w-md w-full mx-4">
            <div className="space-y-6">
              <div className="text-center">
                <h1 className="text-2xl uppercase tracking-wide text-brand-500 mb-2">
                  Dashboard
                </h1>
                <p className="text-cream-500 text-sm">
                  Sign in to continue
                </p>
              </div>
              <button
                onClick={() =>
                  signIn.oauth2({
                    providerId: "hca",
                    callbackURL: "/dashboard",
                  })
                }
                className="w-full bg-brand-500 hover:bg-brand-400 px-6 py-3 text-lg uppercase tracking-wider text-white font-medium transition-colors cursor-pointer"
              >
                Sign In with Hack Club
              </button>
            </div>
          </div>
        </div>
        <NoiseOverlay />
      </>
    );
  }

  const totalHoursClaimed = projects.reduce((acc, p) => acc + p.totalHoursClaimed, 0);
  const totalHoursApproved = projects.reduce((acc, p) => acc + p.totalHoursApproved, 0);
  
  const allBadges = projects.flatMap(p => p.badges);
  const approvedBadges = allBadges.filter(b => b.grantedAt !== null);
  const pendingBadges = allBadges.filter(b => b.grantedAt === null);
  const BADGES_REQUIRED = 5;

  const lineConfigs = [
    { from: 80, to: 200, duration: 60, direction: 1 },
    { from: 200, to: 320, duration: 80, direction: -1 },
    { from: 320, to: 600, duration: 105, direction: 1 },
    { from: 600, to: 720, duration: 50, direction: -1 },
    { from: 720, to: 1080, duration: 95, direction: 1 }
  ];

  const circles = [160, 400, 640, 1200, 1440, 2160];

  return (
    <>
      <div className="min-h-screen bg-[linear-gradient(#40352999,#40352999),url(/noise-smooth-dark.png)] font-mono relative overflow-hidden">
        {/* Animated grid background */}
        <div 
          className="absolute inset-0 opacity-40 -z-10 pointer-events-none"
          style={{
            backgroundImage: 'url(/grid-texture.png)',
            backgroundSize: '8rem 8rem',
            backgroundPosition: `${gridOffset * Math.cos(30 * Math.PI / 180)}px ${gridOffset * Math.sin(30 * Math.PI / 180)}px`,
            imageRendering: 'pixelated'
          }}
        />
        
        {/* Rotating SVG decoration */}
        <svg ref={svgContainerRef} className="absolute inset-0 w-full h-full -z-5 pointer-events-none opacity-30" viewBox="0 0 1400 800" preserveAspectRatio="xMidYMid slice">
          {circles.map((diameter) => (
            <circle key={diameter} cx="700" cy="400" r={diameter / 2} fill="none" stroke="#44382C" strokeWidth="2" />
          ))}
          
          {lineConfigs.map((line, i) => (
            <g key={i}>
              <g data-line-group={`${i}-1`}>
                <line x1="700" y1={400 - line.from} x2="700" y2={400 - line.to} stroke="#44382C" strokeWidth="2" />
                <g data-square={`${i}-1a`}>
                  <rect x={700 - 4} y={400 - line.from - 4} width="8" height="8" fill="#44382C" />
                </g>
                <g data-square={`${i}-1b`}>
                  <rect x={700 - 4} y={400 - line.to - 4} width="8" height="8" fill="#44382C" />
                </g>
              </g>
              
              <g data-line-group={`${i}-2`}>
                <line x1="700" y1={400 + line.from} x2="700" y2={400 + line.to} stroke="#44382C" strokeWidth="2" />
                <g data-square={`${i}-2a`}>
                  <rect x={700 - 4} y={400 + line.from - 4} width="8" height="8" fill="#44382C" />
                </g>
                <g data-square={`${i}-2b`}>
                  <rect x={700 - 4} y={400 + line.to - 4} width="8" height="8" fill="#44382C" />
                </g>
              </g>
            </g>
          ))}
        </svg>

        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-cream-800">
          <Link href="/" className="text-cream-500 hover:text-brand-500 transition-colors">
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              width="24" 
              height="24" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2"
            >
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            </svg>
          </Link>
          <div className="flex items-center gap-6">
            <span className="text-cream-500 text-sm hidden sm:block">
              {session.user.name || session.user.email}
            </span>
            {isAdmin && (
              <Link
                href="/admin"
                className="text-cream-500 hover:text-brand-500 text-sm uppercase transition-colors"
              >
                Admin
              </Link>
            )}
            <button
              onClick={() => signOut()}
              className="text-cream-500 hover:text-brand-500 text-sm uppercase transition-colors cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-cream-800">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex gap-0">
              <button
                onClick={() => setActiveTab('projects')}
                className={`px-6 py-3 text-sm uppercase tracking-wider transition-colors cursor-pointer border-b-2 -mb-[2px] ${
                  activeTab === 'projects'
                    ? 'text-brand-500 border-brand-500'
                    : 'text-cream-500 border-transparent hover:text-cream-100'
                }`}
              >
                Projects
              </button>
              <button
                onClick={() => setActiveTab('settings')}
                className={`px-6 py-3 text-sm uppercase tracking-wider transition-colors cursor-pointer border-b-2 -mb-[2px] ${
                  activeTab === 'settings'
                    ? 'text-brand-500 border-brand-500'
                    : 'text-cream-500 border-transparent hover:text-cream-100'
                }`}
              >
                Settings
              </button>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 py-8">
          {activeTab === 'projects' && (
            <>
              {/* Badge Progress */}
              <div className="mb-6 bg-cream-900 border-2 border-cream-600 p-4">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-brand-500 text-lg uppercase tracking-wide">Badge Progress</h2>
                    <p className="text-cream-500 text-sm">Earn {BADGES_REQUIRED} approved badges to attend the event</p>
                  </div>
                  {approvedBadges.length >= BADGES_REQUIRED && (
                    <p className="text-green-500 text-sm uppercase tracking-wide">✓ Eligible!</p>
                  )}
                </div>
                <div className="flex gap-2">
                  {Array.from({ length: BADGES_REQUIRED }).map((_, i) => {
                    const isApproved = i < approvedBadges.length;
                    const isPending = !isApproved && i < approvedBadges.length + pendingBadges.length;
                    return (
                      <div
                        key={i}
                        className={`flex-1 h-10 border-2 transition-all duration-300 flex items-center justify-center ${
                          isApproved
                            ? 'bg-brand-500 border-brand-400'
                            : isPending
                            ? 'bg-brand-500/20 border-brand-500/50 border-dashed'
                            : 'bg-cream-950 border-cream-800'
                        }`}
                      >
                        {isApproved && (
                          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-white">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                        {isPending && (
                          <span className="text-brand-500 text-xs uppercase">?</span>
                        )}
                      </div>
                    );
                  })}
                </div>
                {pendingBadges.length > 0 && (
                  <p className="text-cream-500 text-xs mt-2">{pendingBadges.length} badge{pendingBadges.length > 1 ? 's' : ''} pending approval</p>
                )}
              </div>

              {/* Stats bar */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex gap-6">
                  <div>
                    <p className="text-cream-500 text-xs uppercase">Projects</p>
                    <p className="text-cream-100 text-2xl">{projects.length}</p>
                  </div>
                  <div>
                    <p className="text-cream-500 text-xs uppercase">Claimed</p>
                    <p className="text-cream-100 text-2xl">~{totalHoursClaimed.toFixed(1)}h</p>
                  </div>
                  <div>
                    <p className="text-cream-500 text-xs uppercase">Approved</p>
                    <p className="text-brand-500 text-2xl">~{totalHoursApproved.toFixed(1)}h</p>
                  </div>
                </div>
                <Link
                  href="/starter-projects"
                  className="text-brand-500 hover:text-brand-400 text-sm uppercase transition-colors flex items-center gap-2"
                >
                  Browse Starter Projects
                  <svg 
                    xmlns="http://www.w3.org/2000/svg" 
                    width="16" 
                    height="16" 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    stroke="currentColor" 
                    strokeWidth="2"
                  >
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                  </svg>
                </Link>
              </div>

              {/* Project Cards Grid */}
              {loading ? (
                <div className="p-8 text-center">
                  <p className="text-cream-500">Loading projects...</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  <NewProjectCard onClick={() => setIsModalOpen(true)} />
                  
                  {projects.map((project) => (
                    <ProjectCard
                      key={project.id}
                      project={project}
                    />
                  ))}
                </div>
              )}

              {!loading && projects.length === 0 && (
                <div className="p-8 text-center">
                  <p className="text-cream-500">No projects yet. Create your first one!</p>
                </div>
              )}
            </>
          )}

          {activeTab === 'settings' && (
            <div className="max-w-xl">
              <div className="bg-cream-900 border-2 border-cream-600 p-6 space-y-6">
                <div>
                  <h2 className="text-brand-500 text-xl uppercase mb-4">Account</h2>
                  <div className="space-y-3">
                    <div>
                      <p className="text-cream-500 text-xs uppercase">Email</p>
                      <p className="text-cream-100">{session.user.email}</p>
                    </div>
                    {session.user.name && (
                      <div>
                        <p className="text-cream-500 text-xs uppercase">Name</p>
                        <p className="text-cream-100">{session.user.name}</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="border-t border-cream-600 pt-6">
                  <h2 className="text-brand-500 text-xl uppercase mb-4">Integrations</h2>
                  <div className="space-y-3">
                    <button
                      onClick={() =>
                        linkOAuth2({
                          providerId: "github",
                          callbackURL: "/dashboard",
                        })
                      }
                      className="w-full bg-cream-850 hover:bg-cream-800 px-6 py-3 text-lg uppercase tracking-wider text-cream-100 transition-colors cursor-pointer flex items-center justify-center gap-3"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                      </svg>
                      Link GitHub
                    </button>
                    <p className="text-cream-500 text-xs">Required to save journal entries to your project repositories</p>
                    
                    <button
                      onClick={() =>
                        linkOAuth2({
                          providerId: "hackatime",
                          callbackURL: "/dashboard",
                        })
                      }
                      className="w-full bg-cream-850 hover:bg-cream-800 px-6 py-3 text-lg uppercase tracking-wider text-cream-100 transition-colors cursor-pointer"
                    >
                      Link Hackatime
                    </button>
                  </div>
                </div>

                <div className="border-t border-cream-600 pt-6">
                  <h2 className="text-brand-500 text-xl uppercase mb-4">Session</h2>
                  <button
                    onClick={() => signOut()}
                    className="w-full bg-red-600/20 hover:bg-red-600/30 border-2 border-red-600/50 px-6 py-3 text-lg uppercase tracking-wider text-red-500 transition-colors cursor-pointer"
                  >
                    Sign Out
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <NewProjectModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleCreateProject}
      />

      <NoiseOverlay />
    </>
  );
}
