'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { gsap } from 'gsap';
import { MagneticCorners } from '../components/MagneticCorners';
import { NoiseOverlay } from '../components/NoiseOverlay';
import { PlaceholderProjectPreview } from '../components/starter-projects/PlaceholderProjectPreview';
import { ProjectPreview } from '../components/starter-projects/ProjectPreview';
import { ProjectGridHoverCorners } from '../components/starter-projects/ProjectGridHoverCorners';
import Link from 'next/link';
import { projects, type StarterProject } from './projects';

export default function StarterProjectsPage() {
  const [gridOffset, setGridOffset] = useState(0);
  const [gridEl, setGridEl] = useState<HTMLDivElement | null>(null);
  const [placeholderCount, setPlaceholderCount] = useState(0);
  const [selectedProjectIndex, setSelectedProjectIndex] = useState<number | null>(null);
  const [projectHeights, setProjectHeights] = useState<number[]>(new Array(projects.length).fill(0));
  const [hasSelectedOnce, setHasSelectedOnce] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [showInitialMessage, setShowInitialMessage] = useState(true);
  const [initialMessageOpacity, setInitialMessageOpacity] = useState(1);
  const [initialMessageScale, setInitialMessageScale] = useState(1);
  
  const pendingIndexRef = useRef<number | null>(null);
  const svgContainerRef = useRef<SVGSVGElement>(null);
  const rotationTweensRef = useRef<gsap.core.Tween[]>([]);
  const animationFrameRef = useRef<number | undefined>(undefined);
  const measureRefs = useRef<(HTMLDivElement | null)[]>([]);
  const previewContainerRef = useRef<HTMLDivElement>(null);

  const maxHeight = Math.max(...projectHeights, 0);
  const actualProjects = projects.length;

  const handleProjectClick = useCallback((index: number) => {
    if (index === selectedProjectIndex) return;
    
    if (isTransitioning && hasSelectedOnce) {
      pendingIndexRef.current = index;
      return;
    }
    
    setSelectedProjectIndex(index);
    
    if (!hasSelectedOnce) {
      setIsTransitioning(true);
      setTimeout(() => {
        setHasSelectedOnce(true);
        setIsTransitioning(false);
      }, 500);
    }
  }, [selectedProjectIndex, isTransitioning, hasSelectedOnce]);

  const handleIntroStart = useCallback(() => {
    if (hasSelectedOnce) {
      setIsTransitioning(true);
    }
  }, [hasSelectedOnce]);

  const handleIntroEnd = useCallback(() => {
    if (hasSelectedOnce) {
      setIsTransitioning(false);
      if (pendingIndexRef.current !== null && pendingIndexRef.current !== selectedProjectIndex) {
        const next = pendingIndexRef.current;
        pendingIndexRef.current = null;
        handleProjectClick(next);
      }
    }
  }, [hasSelectedOnce, selectedProjectIndex, handleProjectClick]);

  const handleOutroStart = useCallback(() => {
    setIsTransitioning(true);
  }, []);

  const handleOutroEnd = useCallback(() => {
    if (pendingIndexRef.current === null) {
      setIsTransitioning(false);
    }
  }, []);

  const updatePlaceholders = useCallback(() => {
    if (!gridEl) return;
    
    const gridWidth = gridEl.offsetWidth;
    const gap = 2; 
    
    // TODO: fix placeholder
    const itemWidth = gridWidth < 768 ? 100 : 176;
    const itemWithGap = itemWidth + gap;
    
    const cols = Math.max(1, Math.floor((gridWidth + gap) / itemWithGap));
    const itemsInLastRow = actualProjects % cols;
    
    if (itemsInLastRow === 0 || cols === 0) {
      setPlaceholderCount(0);
    } else {
      setPlaceholderCount(cols - itemsInLastRow);
    }
  }, [gridEl, actualProjects]);

  useEffect(() => {
    if (selectedProjectIndex !== null && rotationTweensRef.current.length > 0) {
      rotationTweensRef.current.forEach(tween => {
        gsap.to(tween, {
          timeScale: 8,
          duration: 0.15,
          ease: 'power2.out',
          onComplete: () => {
            gsap.to(tween, {
              timeScale: 1,
              duration: 0.8,
              ease: 'power1.out'
            });
          }
        });
      });
    }
  }, [selectedProjectIndex]);

  useEffect(() => {
    const animate = () => {
      setGridOffset(prev => prev + 0.2);
      animationFrameRef.current = requestAnimationFrame(animate);
    };
    
    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    updatePlaceholders();
    
    if (!gridEl) return;
    
    const resizeObserver = new ResizeObserver(updatePlaceholders);
    resizeObserver.observe(gridEl);

    return () => {
      resizeObserver.disconnect();
    };
  }, [gridEl, updatePlaceholders]);

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
          svgOrigin: '1100 650'
        });
        
        const tween2 = gsap.to(lineGroup2, {
          rotation: 360 * line.direction,
          duration: line.duration,
          repeat: -1,
          ease: 'none',
          svgOrigin: '1100 650'
        });

        const tween3 = gsap.to(square1a, {
          rotation: -360 * line.direction,
          duration: line.duration,
          repeat: -1,
          ease: 'none',
          svgOrigin: `1100 ${650 - line.from}`
        });
        
        const tween4 = gsap.to(square1b, {
          rotation: -360 * line.direction,
          duration: line.duration,
          repeat: -1,
          ease: 'none',
          svgOrigin: `1100 ${650 - line.to}`
        });
        
        const tween5 = gsap.to(square2a, {
          rotation: -360 * line.direction,
          duration: line.duration,
          repeat: -1,
          ease: 'none',
          svgOrigin: `1100 ${650 + line.from}`
        });
        
        const tween6 = gsap.to(square2b, {
          rotation: -360 * line.direction,
          duration: line.duration,
          repeat: -1,
          ease: 'none',
          svgOrigin: `1100 ${650 + line.to}`
        });
        
        rotationTweensRef.current.push(tween1, tween2, tween3, tween4, tween5, tween6);
      }
    });

    measureRefs.current.forEach((el, i) => {
      if (el) {
        setProjectHeights(prev => {
          const newHeights = [...prev];
          newHeights[i] = el.clientHeight;
          return newHeights;
        });
      }
    });

    // return () => {
    //   gsap.killTweensOf('*');
    // };
  }, []);

  useEffect(() => {
    if (selectedProjectIndex === null) return;

    if (showInitialMessage) {
      gsap.to({ opacity: 1, scale: 1 }, {
        opacity: 0,
        scale: 0.95,
        duration: 0.3,
        ease: 'power2.out',
        onUpdate: function() {
          setInitialMessageOpacity(this.targets()[0].opacity);
          setInitialMessageScale(this.targets()[0].scale);
        },
        onComplete: () => {
          setShowInitialMessage(false);
        }
      });
    }
  }, [selectedProjectIndex, showInitialMessage]);

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
      <style jsx global>{`
        body {
          background-color: var(--color-brown-800);
        }

        @keyframes slide-right {
          from {
            background-position: 0 0;
          }
          to {
            background-position: 3rem 0;
          }
        }

        .animate-slide {
          animation: slide-right 4s linear infinite;
        }
      `}</style>

      <div className="bg-[linear-gradient(var(--color-brown-900)/0.6,var(--color-brown-900)/0.6),url(/noise-smooth-dark.png)] min-h-screen relative overflow-hidden z-0 p-4 sm:px-6">
        <div 
          className="absolute inset-0 opacity-40 -z-1000 pointer-none"
          style={{
            backgroundImage: 'url(/grid-texture.png)', // TODO: change image so it is more visible
            backgroundSize: '4rem 4rem',
            backgroundPosition: `${gridOffset * Math.cos(30 * Math.PI / 180)}px ${gridOffset * Math.sin(30 * Math.PI / 180)}px`,
            imageRendering: 'pixelated'
          }}
        />
        {/* back to home */}
        <div className="pt-4 2xl:absolute  2xl:ml-16 2xl:mt-16">
          <Link href="/dashboard">
            <MagneticCorners activationDistance={35} deactivationDistance={45}>
              <button className="block bg-orange-600 p-2 md:p-4 2xl:p-6 font-mono relative cursor-pointer hover:bg-orange-400">
                <img src="/home-light.svg" alt="Home" className="w-8 h-8" />
              </button>
            </MagneticCorners>
          </Link>
        </div>
        {/* apologies for the code below, temporarily removed as it was too annoying to make reponsive, will fix, sometime... */}

        {/* <img src="/stasis-logo-white-center.svg" alt="" className="absolute -z-1 w-full mx-auto scale-120 md:scale-120 xl:scale-100 -translate-x-3 lg:-translate-x-6 -translate-y-[calc(100%-2vw)] md:-translate-y-[calc(100%-6vw)] lg:-translate-y-[calc(100%-8vw)] xl:-translate-y-[calc(100%-16vw)]  opacity-8" /> */}
       
        <div className="flex flex-col max-w-6xl mx-auto font-mono mb-8 mt-10 lg:mt-16 2xl:mt-24">
          <div className="bg-orange-600 text-cream-200 text-xl w-max px-4 py-2 relative after:bg-orange-600 after:absolute after:left-full after:top-0 after:h-full after:aspect-square after:[clip-path:polygon(0_0,0_100%,100%_100%)]">
            STARTER PROJECTS
          </div>
          {/* TODO: make the before/after decor fully in frame on md, currently only on xl< */}
          <div className="bg-brown-900 w-full h-max border-2 border-orange-600 flex flex-col relative after:hidden xl:after:block after:absolute after:left-full after:w-8 after:h-[calc(100%+4px-32px)] after:-top-0.5 after:bg-orange-600 before:opacity-0 xl:before:opacity-100 before:absolute before:bg-orange-600 before:-bottom-0.5 before:left-full before:w-8 before:h-8 before:[clip-path:polygon(0_0,0_100%,100%_0)]">
            {/* preview and details */}
            <div className="flex flex-col-reverse sm:flex-row min-h-[300px]">
              {/* preview */}
              {/* <div className="bg-blue-500 w-full min-h-60 "></div> */}
              <div ref={previewContainerRef} className="w-full min-h-60 border-cream-500 border-r-0 sm:border-r-2 border-t-2 sm:border-t-0 md:flex-3/5 relative overflow-clip" style={{ minHeight: maxHeight  }}>
                <p className="text-cream-600/40 absolute top-1 right-2 z-10">PREVIEW</p>
                <svg ref={svgContainerRef} className="w-full h-full absolute inset-0 z-0 opacity-30" viewBox="0 0 1400 800" preserveAspectRatio="xMidYMid slice">
                  {/* Concentric circles */}
                  {circles.map((diameter) => (
                    <circle key={diameter} cx="1100" cy="650" r={diameter / 2} fill="none" stroke="var(--color-cream-600)" strokeWidth="2" />
                  ))}
                  
                  {/* Rotating lines with squares */}
                  {lineConfigs.map((line, i) => (
                    <g key={i}>
                      {/* First line */}
                      <g data-line-group={`${i}-1`}>
                        {/* Line connecting circles */}
                        <line x1="1100" y1={650 - line.from} x2="1100" y2={650 - line.to} stroke="var(--color-cream-500)" strokeWidth="2" />
                        
                        {/* Squares at intersection points (counter-rotated) */}
                        <g data-square={`${i}-1a`}>
                          <rect x={1100 - 4} y={650 - line.from - 4} width="8" height="8" fill="var(--color-cream-500)" />
                        </g>
                        <g data-square={`${i}-1b`}>
                          <rect x={1100 - 4} y={650 - line.to - 4} width="8" height="8" fill="var(--color-cream-500)" />
                        </g>
                      </g>
                      
                      {/* Second line (opposite side) */}
                      <g data-line-group={`${i}-2`}>
                        {/* Line connecting circles */}
                        <line x1="1100" y1={650 + line.from} x2="1100" y2={650 + line.to} stroke="var(--color-cream-500)" strokeWidth="2" />
                        
                        {/* Squares at intersection points (counter-rotated) */}
                        <g data-square={`${i}-2a`}>
                          <rect x={1100 - 4} y={650 + line.from - 4} width="8" height="8" fill="var(--color-cream-500)" />
                        </g>
                        <g data-square={`${i}-2b`}>
                          <rect x={1100 - 4} y={650 + line.to - 4} width="8" height="8" fill="var(--color-cream-500)" />
                        </g>
                      </g>
                    </g>
                  ))}
                </svg>
                
                {showInitialMessage && (
                  <div 
                    className="absolute inset-0 flex items-center justify-center z-1"
                    style={{ opacity: initialMessageOpacity }}
                  >
                    <p 
                      className="text-cream-600/40 text-2xl font-mono text-center px-4"
                      style={{ transform: `scale(${initialMessageScale})` }}
                    >
                      Select a project to see details
                    </p>
                  </div>
                )}
                
                <PreviewImage 
                  projects={projects}
                  selectedProjectIndex={selectedProjectIndex}
                  hasSelectedOnce={hasSelectedOnce}
                  onIntroStart={handleIntroStart}
                  onIntroEnd={handleIntroEnd}
                  onOutroStart={handleOutroStart}
                  onOutroEnd={handleOutroEnd}
                />
              </div>
              {/* details */}
              <div className="md:flex-2/5 flex flex-col relative ">
                <p className="text-cream-600/40 absolute top-1 right-2">DETAILS</p>
                
                {/* Hidden measurement divs for all projects */}
                {projects.map((project, i) => (
                  <div 
                    key={i}
                    ref={el => { measureRefs.current[i] = el; }}
                    className="flex flex-col space-y-3 px-4 py-12 absolute opacity-0 pointer-events-none  mx-8"
                  >
                    <h2 className="text-orange-600 text-5xl">{project.name.toUpperCase()}</h2>
                    <p className="text-cream-50 text-2xl">{project.hours} hours</p>
                    <p className="text-cream-50 text-lg">{project.short_description}</p>
                  </div>
                ))}
                
                {/* Visible project details */}
                <div 
                  className="space-y-3 px-6 md:px-8 lg:mx-6 py-6 sm:py-10">
                  <h2 className="text-orange-600 text-5xl">{projects[selectedProjectIndex ?? 0].name.toUpperCase()}</h2>
                  <p className="text-cream-300 text-2xl">~{projects[selectedProjectIndex ?? 0].hours} hours</p>
                  <p className="text-cream-300 text-lg">{projects[selectedProjectIndex ?? 0].short_description}</p>
                </div>
                <div className="w-full">
                  <div className="flex flex-row border-cream-500 border-y-2 relative z-10 min-h-18">
                    <div className="flex-1/3 sm:min-h-24 border-cream-500 border-r-2 relative">
                      <p className="text-cream-300 absolute top-2 right-4">1</p>
                    </div>
                    <div className="flex-1/3 sm:min-h-24 border-cream-500 border-r-2 relative">
                      <p className="text-cream-300 absolute top-2 right-4">2</p>
                    </div>
                    <div className="flex-1/3 sm:min-h-24 border-cream-500 relative">
                      <p className="text-cream-300 absolute top-2 right-4">3</p>
                    </div>
                  </div>
                  {/* TODO: add back hover effect using GSAP instead */}
                  {projects[selectedProjectIndex ?? 0].hasTutorial ? (
                    <Link href={`/starter-projects/${projects[selectedProjectIndex ?? 0].id}`} className="block w-full">
                      <button className="w-full h-fit text-cream-300 text-2xl hover:bg-orange-600 hover:text-cream-100 py-6 cursor-pointer relative overflow-hidden group z-1 hover:brightness-110 transition-[filter]duration-50 border-orange-600/20 border-r-3">
                        <span className="w-full h-full block">GUIDE</span>
                      </button>
                    </Link>
                  ) : (
                    <button disabled className="w-full h-fit text-cream-600/40 text-2xl py-6 cursor-not-allowed relative overflow-hidden z-1 border-orange-600/20 border-r-3">
                      <span className="w-full h-full block">GUIDE</span>
                    </button>
                  )}
                  </div>
              </div>
            </div>
            {/* grid of projects */}
            <div 
              ref={setGridEl}
              className="grid grid-cols-[repeat(auto-fit,minmax(7rem,1fr))]  md:grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-0.5 bg-cream-500 relative overflow-hidden cursor-pointer pt-0.5"
            >
              <p className="text-cream-600/40 absolute top-1 right-2 z-2">PROJECTS</p>
              <ProjectGridHoverCorners gridEl={gridEl} selectedIndex={selectedProjectIndex} />
              {projects.map((project, i) => (
                <ProjectPreview 
                  key={i}
                  project={project} 
                  selected={selectedProjectIndex === i} 
                  onClick={() => handleProjectClick(i)} 
                />
              ))}
              {Array.from({ length: placeholderCount }).map((_, i) => (
                <PlaceholderProjectPreview key={`placeholder-${i}`} />
              ))}
            </div>
          </div>
        </div>

        <footer className="pt-20 pb-24 relative px-4">
          <div className="mx-auto max-w-md w-max font-mono">
            <p className="text-xs md:text-sm text-cream-300 text-center">Made with <span className="bg-orange-600 text-cream-100">&lt;3</span> by teenagers, for teenagers</p>
            <div className="mt-2 text-cream-300 text-center">
              <a href="https://hackclub.com" target="_blank" rel="noopener" className="underline text-xs md:text-sm hover:bg-orange-600 hover:text-cream-100">Hack Club</a>
              <span>・</span>
              <a href="https://hackclub.com/slack" target="_blank" rel="noopener" className="underline text-xs md:text-sm hover:bg-orange-600 hover:text-cream-100">Slack</a>
              <span>・</span>
              <a href="https://hackclub.com/clubs" target="_blank" rel="noopener" className="underline text-xs md:text-sm hover:bg-orange-600 hover:text-cream-100">Clubs</a>
              <span>・</span>
              <a href="https://hackclub.com/hackathons" target="_blank" rel="noopener" className="underline text-xs md:text-sm hover:bg-orange-600 hover:text-cream-100">Hackathons</a>
            </div>
          </div>
        </footer>

        {/* footer darkening background TOFIX*/}


        <div className="absolute bottom-0 left-0 w-full h-48 bg-[linear-gradient(var(--color-brown-800 / 0%),var(--color-brown-800))] -z-2" />
      </div>

      <NoiseOverlay />
    </>
  );
}

interface PreviewImageProps {
  projects: StarterProject[];
  selectedProjectIndex: number | null;
  hasSelectedOnce: boolean;
  onIntroStart: () => void;
  onIntroEnd: () => void;
  onOutroStart: () => void;
  onOutroEnd: () => void;
}

function PreviewImage({ 
  projects, 
  selectedProjectIndex, 
  hasSelectedOnce,
  onIntroStart,
  onIntroEnd,
  onOutroStart,
  onOutroEnd
}: Readonly<PreviewImageProps>) {
  const [currentIndex, setCurrentIndex] = useState<number | null>(null);
  const [previousIndex, setPreviousIndex] = useState<number | null>(null);
  const [currentY, setCurrentY] = useState(500);
  const [previousY, setPreviousY] = useState(0);
  const [showPrevious, setShowPrevious] = useState(false);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (selectedProjectIndex === null) return;

    if (isFirstRender.current) {
      isFirstRender.current = false;
      setCurrentIndex(selectedProjectIndex);
      
      gsap.fromTo(
        { y: 500 },
        { y: 500 },
        {
          y: 0,
          duration: 0.5,
          ease: 'power2.out',
          onStart: onIntroStart,
          onUpdate: function() {
            setCurrentY(this.targets()[0].y);
          },
          onComplete: onIntroEnd
        }
      );
      return;
    }

    if (selectedProjectIndex === currentIndex) return;

    if (!hasSelectedOnce) {
      setCurrentIndex(selectedProjectIndex);
      gsap.fromTo(
        { y: 500 },
        { y: 500 },
        {
          y: 0,
          duration: 0.5,
          ease: 'power2.out',
          onStart: onIntroStart,
          onUpdate: function() {
            setCurrentY(this.targets()[0].y);
          },
          onComplete: onIntroEnd
        }
      );
      return;
    }

    setPreviousIndex(currentIndex);
    setShowPrevious(true);
    setPreviousY(0);
    setCurrentIndex(selectedProjectIndex);
    setCurrentY(500);

    onOutroStart();
    gsap.to({ y: 0 }, {
      y: -500,
      duration: 0.5,
      ease: 'power2.out',
      onUpdate: function() {
        setPreviousY(this.targets()[0].y);
      },
      onComplete: () => {
        setShowPrevious(false);
        onOutroEnd();
      }
    });

    onIntroStart();
    gsap.to({ y: 500 }, {
      y: 0,
      duration: 0.5,
      ease: 'power2.out',
      onUpdate: function() {
        setCurrentY(this.targets()[0].y);
      },
      onComplete: onIntroEnd
    });
  }, [selectedProjectIndex, currentIndex, hasSelectedOnce, onIntroStart, onIntroEnd, onOutroStart, onOutroEnd]);

  if (currentIndex === null) return null;

  return (
    <>
      {showPrevious && previousIndex !== null && (
        <div
          className="absolute inset-0 w-full h-full z-1"
          style={{ transform: `translateY(${previousY}px)` }}
        >
          <img
            key={projects[previousIndex].id}
            src={`/projects/${projects[previousIndex].image ?? projects[previousIndex].id + '.png'}`}
            alt=""
            className="w-full h-full object-cover"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        </div>
      )}
      <div
        className="absolute inset-0 w-full h-full z-1"
        style={{ transform: `translateY(${currentY}px)` }}
      >
        <img
          key={projects[currentIndex].id}
          src={`/projects/${projects[currentIndex].image ?? projects[currentIndex].id + '.png'}`}
          alt=""
          className="w-full h-full object-cover"
          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      </div>
    </>
  );
}
