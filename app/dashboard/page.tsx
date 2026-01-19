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

type Tab = 'projects' | 'guides' | 'settings'

type GuidePage = 'submission-guidelines' | 'faq'

export default function Dashboard() {
  const { data: session, isPending } = useSession();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('projects');
  const [activeGuidePage, setActiveGuidePage] = useState<GuidePage>('submission-guidelines');
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
                onClick={() => setActiveTab('guides')}
                className={`px-6 py-3 text-sm uppercase tracking-wider transition-colors cursor-pointer border-b-2 -mb-[2px] ${
                  activeTab === 'guides'
                    ? 'text-brand-500 border-brand-500'
                    : 'text-cream-500 border-transparent hover:text-cream-100'
                }`}
              >
                Guides & FAQ
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

          {activeTab === 'guides' && (
            <div className="flex gap-6">
              {/* Sidebar Navigation */}
              <div className="w-56 shrink-0">
                <nav className="bg-cream-900 border-2 border-cream-600 p-4 space-y-1 sticky top-8">
                  <p className="text-cream-500 text-xs uppercase mb-3 tracking-wide">Guides</p>
                  <button
                    onClick={() => setActiveGuidePage('submission-guidelines')}
                    className={`w-full text-left px-3 py-2 text-sm transition-colors cursor-pointer ${
                      activeGuidePage === 'submission-guidelines'
                        ? 'text-brand-500 bg-cream-850'
                        : 'text-cream-100 hover:text-brand-500 hover:bg-cream-850'
                    }`}
                  >
                    Submission Guidelines
                  </button>
                  <div className="border-t border-cream-700 my-3" />
                  <p className="text-cream-500 text-xs uppercase mb-3 tracking-wide">FAQ</p>
                  <button
                    onClick={() => setActiveGuidePage('faq')}
                    className={`w-full text-left px-3 py-2 text-sm transition-colors cursor-pointer ${
                      activeGuidePage === 'faq'
                        ? 'text-brand-500 bg-cream-850'
                        : 'text-cream-100 hover:text-brand-500 hover:bg-cream-850'
                    }`}
                  >
                    General FAQ
                  </button>
                </nav>
              </div>

              {/* Content Area */}
              <div className="flex-1 min-w-0">
                {activeGuidePage === 'submission-guidelines' && (
                  <div className="bg-cream-900 border-2 border-cream-600 p-6">
                    <h1 className="text-brand-500 text-2xl uppercase tracking-wide mb-6">Submission Guidelines</h1>
                    <div className="prose prose-invert max-w-none space-y-6 text-cream-100">
                      <p className="text-cream-300">Ready to submit your project? Right this way!</p>
                      <p className="text-cream-300">
                        The main thing we check for is whether or not your project is shipped. The requirements below are a bare <em>minimum</em>, not the goal - you&apos;re encouraged to go above and beyond! Add a 3D render, custom logo, and more!
                      </p>

                      <h2 className="text-brand-400 text-xl uppercase mt-8 mb-4">Requirements</h2>

                      <h3 className="text-cream-100 text-lg mt-6 mb-3">1. Your project is original</h3>
                      <p className="text-cream-300">
                        If you follow guides from online or even from the guides section, that&apos;s fine! However, you need to have an original touch to the project. This is something different for every project. For the split keyboard, maybe add lights that flash different colors based on the program, etc. We WILL verify that your project is original even if you create it from some obscure guide.
                      </p>

                      <h3 className="text-cream-100 text-lg mt-6 mb-3">2. Your project is actually shipped & complete</h3>
                      <p className="text-cream-300">The tl;dr of what this means is:</p>

                      <h4 className="text-cream-200 font-medium mt-4 mb-2">YOUR PROJECT IS ACTUALLY COMPLETE:</h4>
                      <ul className="list-disc list-inside text-cream-300 space-y-1">
                        <li>It has a complete CAD assembly, with all components (including electronics)</li>
                        <li>You have firmware present, even if it&apos;s untested</li>
                        <li>You have sanity checked your design with someone else</li>
                        <li>(optional) you have a 3D render of your project!</li>
                      </ul>

                      <h4 className="text-cream-200 font-medium mt-4 mb-2">YOUR GITHUB REPOSITORY CONTAINS ALL OF YOUR PROJECT FILES:</h4>
                      <ul className="list-disc list-inside text-cream-300 space-y-1">
                        <li>a BOM, in CSV format in the root directory, WITH LINKS</li>
                        <li>the source files for your PCB, if you have one (.kicad_pro, .kicad_sch, gerbers.zip, etc)</li>
                        <li><strong>A .STEP file of your project&apos;s 3D CAD model (and ideally the source design file format as well - .f3d, .FCStd, etc)</strong></li>
                        <li>ANY other files that are part of your project (firmware, libraries, references, etc)</li>
                        <li>You have everything easily readable and organized into folders.</li>
                      </ul>
                      <p className="text-cream-400 italic text-sm">*if you&apos;re missing a .STEP file with all of your electronics and CAD, your project will not be approved*</p>

                      <h4 className="text-cream-200 font-medium mt-4 mb-2">YOUR README.md FILE CONTAINS THE FOLLOWING:</h4>
                      <ul className="list-disc list-inside text-cream-300 space-y-1">
                        <li>A short description of what your project is</li>
                        <li>A couple sentences on <em>why</em> you made the project</li>
                        <li><strong>PICTURES OF YOUR PROJECT</strong></li>
                        <li>A screenshot of a full 3D model with your project</li>
                        <li>A screenshot of your PCB, if you have one</li>
                        <li>A wiring diagram, if you&apos;re doing any wiring that isn&apos;t on a PCB</li>
                        <li>A BOM in table format at the end of the README</li>
                      </ul>

                      <h4 className="text-cream-200 font-medium mt-4 mb-2">YOU DO NOT HAVE:</h4>
                      <ul className="list-disc list-inside text-cream-300 space-y-1">
                        <li>AI Generated READMEs or Journal entries</li>
                        <li>Stolen work from other people</li>
                        <li>Missing firmware/software</li>
                      </ul>
                      <p className="text-red-400 text-sm mt-2">
                        Any project that includes stolen content, AI-generated readmes or journals, or other fraudulent/dishonest material may be permanently rejected and could result in a ban from Blueprint and other Hack Club programs!
                      </p>

                      <h3 className="text-cream-100 text-lg mt-6 mb-3">3. You have a quality journal</h3>
                      <p className="text-cream-300">
                        Your journal is very important for Blueprint! Not only does it allow us to verify the hours you spent, it also allows for other people to look back at your project and follow its journey. Here are some important things to keep in mind while journaling:
                      </p>
                      <ul className="list-disc list-inside text-cream-300 space-y-1">
                        <li>Try to keep each entry under 5 hours, this is not a hard requirement but your project will be more likely to be rejected</li>
                        <li>Take into account your thoughts while making a project</li>
                        <li>Don&apos;t just log the steps that led to your final project! You should have all of your failures and rabbit holes that didn&apos;t end up making it to the final piece.</li>
                      </ul>
                      <p className="text-cream-400 italic text-sm">There is no magic bullet, but as long as you put an honest effort forward you will almost certainly be approved.</p>

                      <h3 className="text-cream-100 text-lg mt-6 mb-3">4. Your project is cost optimized!</h3>
                      <p className="text-cream-300">You should always aim to make your project as cheap as possible!</p>
                      <ul className="list-disc list-inside text-cream-300 space-y-1">
                        <li>Always get the minimum quantity of your project. We are funding your project to learn not to mass-produce things like merch. On JLCPCB for example, this means only 5 PCB&apos;s, or 2 PCBA&apos;s.</li>
                        <li>JLCPCB Specific: Always choose parts for your PCB which allow you to use economic assembly rather than standard. Try and keep your PCB under 100x100mm if possible and choose Global Standard Direct (or Air Registered Mail if it is cheaper) shipping when you can.</li>
                      </ul>

                      <div className="mt-8 p-4 bg-brand-500/10 border border-brand-500/30">
                        <p className="text-brand-400">If you have all of that, you should be good to go! Go ahead and submit your project :)</p>
                      </div>
                    </div>
                  </div>
                )}

                {activeGuidePage === 'faq' && (
                  <div className="bg-cream-900 border-2 border-cream-600 p-6">
                    <h1 className="text-brand-500 text-2xl uppercase tracking-wide mb-6">Frequently Asked Questions</h1>
                    <div className="space-y-4">
                      <div className="border-b border-cream-700 pb-4">
                        <h3 className="text-cream-100 text-lg mb-2">What is Blueprint?</h3>
                        <p className="text-cream-300">Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.</p>
                      </div>
                      <div className="border-b border-cream-700 pb-4">
                        <h3 className="text-cream-100 text-lg mb-2">How do I get started?</h3>
                        <p className="text-cream-300">Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.</p>
                      </div>
                      <div className="border-b border-cream-700 pb-4">
                        <h3 className="text-cream-100 text-lg mb-2">How long does review take?</h3>
                        <p className="text-cream-300">Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo.</p>
                      </div>
                      <div className="border-b border-cream-700 pb-4">
                        <h3 className="text-cream-100 text-lg mb-2">What counts as a shipped project?</h3>
                        <p className="text-cream-300">Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt.</p>
                      </div>
                      <div className="border-b border-cream-700 pb-4">
                        <h3 className="text-cream-100 text-lg mb-2">Can I use online tutorials?</h3>
                        <p className="text-cream-300">Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet, consectetur, adipisci velit, sed quia non numquam eius modi tempora incidunt ut labore et dolore magnam aliquam quaerat voluptatem.</p>
                      </div>
                      <div className="border-b border-cream-700 pb-4">
                        <h3 className="text-cream-100 text-lg mb-2">What if my project gets rejected?</h3>
                        <p className="text-cream-300">Ut enim ad minima veniam, quis nostrum exercitationem ullam corporis suscipit laboriosam, nisi ut aliquid ex ea commodi consequatur? Quis autem vel eum iure reprehenderit qui in ea voluptate velit esse quam nihil molestiae consequatur.</p>
                      </div>
                      <div className="border-b border-cream-700 pb-4">
                        <h3 className="text-cream-100 text-lg mb-2">How are badges awarded?</h3>
                        <p className="text-cream-300">At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis praesentium voluptatum deleniti atque corrupti quos dolores et quas molestias excepturi sint occaecati cupiditate non provident.</p>
                      </div>
                      <div className="border-b border-cream-700 pb-4">
                        <h3 className="text-cream-100 text-lg mb-2">What is Hackatime?</h3>
                        <p className="text-cream-300">Similique sunt in culpa qui officia deserunt mollitia animi, id est laborum et dolorum fuga. Et harum quidem rerum facilis est et expedita distinctio.</p>
                      </div>
                      <div className="pb-4">
                        <h3 className="text-cream-100 text-lg mb-2">Where can I get help?</h3>
                        <p className="text-cream-300">Nam libero tempore, cum soluta nobis est eligendi optio cumque nihil impedit quo minus id quod maxime placeat facere possimus, omnis voluptas assumenda est, omnis dolor repellendus.</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
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
