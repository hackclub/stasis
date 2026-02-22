'use client';

import { useState, useEffect, useRef, forwardRef, useImperativeHandle, useCallback } from 'react';
import { gsap } from 'gsap';

export interface AsteroidCatRef {
  trigger: () => void;
}

interface SmokeParticle {
  id: number;
  x: number;
  y: number;
  image: number;
  rotation: number;
  opacity: number;
  size: number;
}

const AsteroidCat = forwardRef<AsteroidCatRef>((_, ref) => {
  const [asteroidPosition, setAsteroidPosition] = useState<{ x: number; y: number; rotation: number } | null>(null);
  const [showAsteroid, setShowAsteroid] = useState(false);
  const [smokeParticles, setSmokeParticles] = useState<SmokeParticle[]>([]);
  const [holePosition, setHolePosition] = useState<{ x: number; y: number } | null>(null);
  const [showHole, setShowHole] = useState(false);
  const [holeOpacity, setHoleOpacity] = useState(1);
  const [shakeTransform, setShakeTransform] = useState('');
  const [isFlashing, setIsFlashing] = useState(false);
  const [isLandingFlash, setIsLandingFlash] = useState(false);

  const particleIdCounter = useRef(0);
  const OnekoRef = useRef<any>(null);

  useEffect(() => {
    import('lots-o-nekos').then((module) => {
      OnekoRef.current = module.Oneko;
    });
  }, []);

  const calculateRandomPortalPosition = useCallback(() => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    const remInPx = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const centerX = viewportWidth / 2;
    
    const isLeftSide = Math.random() < 0.5;
    
    let x: number;
    if (isLeftSide) {
      const minX = 3.5 * remInPx;
      const maxX = centerX - 14.5 * remInPx;
      x = minX + Math.random() * (maxX - minX);
    } else {
      const minX = centerX + 14.5 * remInPx;
      const maxX = viewportWidth - 3.5 * remInPx;
      x = minX + Math.random() * (maxX - minX);
    }
    
    const minY = viewportHeight / 2;
    const maxY = viewportHeight - 4 * remInPx;
    const y = minY + Math.random() * (maxY - minY);
    
    return { x, y };
  }, []);

  const spawnSmokeParticle = useCallback(async (x: number, y: number, outwardAngle?: number) => {
    const cardinalRotations = [0, 90, 180, 270];
    
    let driftX: number;
    let driftY: number;
    
    if (outwardAngle !== undefined) {
      const outwardDist = 20 + Math.random() * 20;
      driftX = Math.cos(outwardAngle) * outwardDist + (Math.random() - 0.5) * 15;
      driftY = Math.sin(outwardAngle) * outwardDist + (Math.random() - 0.5) * 15;
    } else {
      driftX = (Math.random() - 0.5) * 30;
      driftY = (Math.random() - 0.5) * 30;
    }
    
    const particleId = particleIdCounter.current++;
    const particleImage = Math.floor(Math.random() * 5) + 1;
    const particleRotation = cardinalRotations[Math.floor(Math.random() * 4)];
    const particleSize = 0.8 + Math.random() * 0.6;
    
    const particle: SmokeParticle = {
      id: particleId,
      x,
      y,
      image: particleImage,
      rotation: particleRotation,
      opacity: 1,
      size: particleSize
    };
    
    setSmokeParticles(prev => [...prev, particle]);
    
    const animState = { x, y, opacity: 1 };
    
    gsap.to(animState, {
      x: x + driftX,
      y: y + driftY,
      duration: 1.5,
      ease: 'none',
      onUpdate: () => {
        setSmokeParticles(prev => prev.map(p => 
          p.id === particleId 
            ? { ...p, x: animState.x, y: animState.y, opacity: animState.opacity }
            : p
        ));
      }
    });
    
    gsap.to(animState, {
      opacity: 0,
      duration: 1.0,
      delay: 0.5,
      ease: 'power1.out',
      onUpdate: () => {
        setSmokeParticles(prev => prev.map(p => 
          p.id === particleId 
            ? { ...p, opacity: animState.opacity }
            : p
        ));
      },
      onComplete: () => {
        setSmokeParticles(prev => prev.filter(p => p.id !== particleId));
      }
    });
  }, []);

  const spawnImpactCloud = useCallback(async (centerX: number, centerY: number) => {
    const particleCount = 20 + Math.floor(Math.random() * 11);
    
    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * 25;
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius;
      const outwardAngle = angle;
      
      setTimeout(() => {
        spawnSmokeParticle(x, y, outwardAngle);
      }, Math.random() * 100);
    }
  }, [spawnSmokeParticle]);

  const shakeScreen = useCallback(async (catElement?: HTMLElement) => {
    const pageWrapper = (window as any).__stasisPageWrapper;
    
    const amplitude = { value: 1 };
    const shakeTarget = { x: 0, y: 0 };
    const catShakeTarget = { x: 0, y: 0 };
    const pageShakeTarget = { x: 0, y: 0 };
    
    gsap.to(amplitude, {
      value: 0,
      duration: 0.8,
      ease: 'power2.out'
    });
    
    gsap.to(shakeTarget, {
      x: '+=16',
      y: '+=16',
      duration: 0.05,
      yoyo: true,
      repeat: 15,
      ease: 'power2.out',
      onUpdate: () => {
        const x = shakeTarget.x * amplitude.value;
        const y = shakeTarget.y * amplitude.value;
        setShakeTransform(`translate(${x}px, ${y}px)`);
      },
      onComplete: () => {
        setShakeTransform('');
      }
    });
    
    if (catElement) {
      gsap.to(catShakeTarget, {
        x: '+=16',
        y: '+=16',
        duration: 0.05,
        yoyo: true,
        repeat: 15,
        ease: 'power2.out',
        onUpdate: () => {
          const x = catShakeTarget.x * amplitude.value;
          const y = catShakeTarget.y * amplitude.value;
          catElement.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
        },
        onComplete: () => {
          catElement.style.transform = 'translate(-50%, -50%)';
        }
      });
    }
    
    if (pageWrapper) {
      gsap.to(pageShakeTarget, {
        x: '+=16',
        y: '+=16',
        duration: 0.05,
        yoyo: true,
        repeat: 15,
        ease: 'power2.out',
        onUpdate: () => {
          const x = pageShakeTarget.x * amplitude.value;
          const y = pageShakeTarget.y * amplitude.value;
          pageWrapper.style.transform = `translate(${x}px, ${y}px)`;
        },
        onComplete: () => {
          pageWrapper.style.transform = '';
        }
      });
    }
  }, []);

  const animateAsteroid = useCallback(async (targetX: number, targetY: number) => {
    document.body.style.overflow = 'hidden';
    
    const viewportWidth = window.innerWidth;
    const centerX = viewportWidth / 2;
    const isRightSide = targetX > centerX;
    
    const angle = Math.tan(30 * Math.PI / 180);
    const buffer = 50;
    
    const verticalDistance = targetY + buffer;
    const horizontalOffset = verticalDistance * angle;
    
    let startX: number;
    if (isRightSide) {
      startX = targetX - horizontalOffset;
    } else {
      startX = targetX + horizontalOffset;
    }
    
    const startY = -buffer;
    
    const animationState = { x: startX, y: startY, rotation: 0 };
    
    setAsteroidPosition({ ...animationState });
    setShowAsteroid(true);
    
    gsap.to(animationState, {
      x: targetX,
      y: targetY,
      rotation: 720,
      duration: 2,
      ease: 'power1.in',
      onUpdate: function() {
        setAsteroidPosition({ ...animationState });
        
        if (Math.random() < 0.7) {
          spawnSmokeParticle(animationState.x, animationState.y);
        }
      },
      onComplete: () => {
        setTimeout(() => {
          setIsLandingFlash(true);
          setTimeout(() => {
            setIsLandingFlash(false);
          }, 2500);
        }, 25);

        setShowAsteroid(false);
        
        setHolePosition({ x: targetX, y: targetY + 3 });
        setShowHole(true);
        setHoleOpacity(1);
        
        spawnImpactCloud(targetX, targetY);
        
        let cat: any = null;
        const Oneko = OnekoRef.current;
        if (Oneko) {
          cat = new Oneko({
            x: targetX + 15,
            y: targetY + 4,
            allowedIdleAnimations: ['sleeping'],
            idleAnimation: 'sleeping',
            skipAlertAnimation: true,
            idleTime: 192,
            idleAnimationFrame: 50,
            source: '/oneko.png'
          });
          
          cat.element.style.zIndex = '999999998';
          cat.element.style.pointerEvents = 'auto';
          cat.element.style.cursor = 'pointer';
          
          let isAwake = false;
          let isSitting = false;
          let sitTimer: number | null = null;
          
          const startSleeping = () => {
            cat.allowedIdleAnimations = ['sleeping'];
            cat.idleAnimation = 'sleeping';
            cat.idleTime = 192;
            cat.idleAnimationFrame = 50;
            isAwake = false;
          };
          
          const wakeUp = () => {
            isAwake = true;
            isSitting = false;
            if (sitTimer) clearTimeout(sitTimer);
            cat.allowedIdleAnimations = ['sleeping', 'scratchSelf', 'scratchWallN', 'scratchWallE', 'scratchWallS', 'scratchWallW'];
            cat.idleAnimation = null;
            cat.idleTime = 0;
          };
          
          const sit = () => {
            isSitting = true;
            cat.setTarget(cat.x, cat.y);
            
            if (sitTimer) clearTimeout(sitTimer);
            sitTimer = window.setTimeout(() => {
              startSleeping();
            }, 5000);
          };
          
          const handleMouseMove = (e: MouseEvent) => {
            if (isAwake && !isSitting) {
              cat.setTarget(e.clientX, e.clientY);
            }
          };
          
          const handleClick = (e: MouseEvent) => {
            const catRect = cat.element.getBoundingClientRect();
            const clickOnCat = e.clientX >= catRect.left && 
              e.clientX <= catRect.right && 
              e.clientY >= catRect.top && 
              e.clientY <= catRect.bottom;
            
            if (clickOnCat) {
              if (isSitting || !isAwake) {
                wakeUp();
              } else {
                sit();
              }
            } else if (isAwake && !isSitting) {
              cat.setTarget(e.clientX, e.clientY);
            } else if (!isAwake) {
              wakeUp();
              cat.setTarget(e.clientX, e.clientY);
            }
          };
          
          window.addEventListener('mousemove', handleMouseMove);
          window.addEventListener('click', handleClick);
        }
        
        shakeScreen(cat?.element);
        
        setTimeout(() => {
          const fadeState = { opacity: 1 };
          
          gsap.to(fadeState, {
            opacity: 0,
            duration: 1.5,
            delay: 0.5,
            ease: 'power1.out',
            onUpdate: () => {
              setHoleOpacity(fadeState.opacity);
            },
            onComplete: () => {
              setShowHole(false);
            }
          });
          
          document.body.style.overflow = '';
        }, 1000);
      }
    });
  }, [spawnSmokeParticle, spawnImpactCloud, shakeScreen]);

  useImperativeHandle(ref, () => ({
    trigger: () => {
      setIsFlashing(true);
      setTimeout(() => {
        setIsFlashing(false);
      }, 1000);

      const position = calculateRandomPortalPosition();
      animateAsteroid(position.x, position.y);
    }
  }));

  return (
    <>
      <style jsx global>{`
        @keyframes flash {
          0% { opacity: 1; }
          100% { opacity: 0; }
        }
        .flash-overlay {
          animation: flash 1000ms ease-out forwards;
        }
        @keyframes flashLanding {
          0% { opacity: 0.35; }
          100% { opacity: 0; }
        }
        .flash-landing-overlay {
          animation: flashLanding 2500ms ease-out forwards;
        }
      `}</style>

      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 999999999, transform: shakeTransform }} aria-hidden="true">
        {smokeParticles.map(particle => (
          <img
            key={particle.id}
            src={`/smoke-${particle.image}.png`}
            alt=""
            className="absolute pointer-events-none"
            style={{
              left: particle.x,
              top: particle.y,
              transform: `translate(-50%, -50%) rotate(${particle.rotation}deg)`,
              opacity: particle.opacity,
              width: `${particle.size}rem`,
              height: `${particle.size}rem`,
              imageRendering: 'pixelated'
            }}
          />
        ))}
      </div>

      {isFlashing && (
        <div className="fixed inset-0 bg-white pointer-events-none flash-overlay" style={{ zIndex: 2147483647 }} />
      )}

      {isLandingFlash && (
        <div className="fixed inset-0 bg-brown-800 pointer-events-none flash-landing-overlay" style={{ zIndex: 2147483647 }} />
      )}

      {showAsteroid && asteroidPosition && (
        <img
          src="/asteroid.png"
          alt=""
          className="fixed pointer-events-none"
          style={{
            left: asteroidPosition.x,
            top: asteroidPosition.y,
            transform: `translate(-50%, -50%) rotate(${asteroidPosition.rotation}deg) ${shakeTransform}`,
            width: '1.5rem',
            height: '1.5rem',
            imageRendering: 'pixelated',
            zIndex: 100
          }}
        />
      )}

      {showHole && holePosition && (
        <img
          src="/hole.png"
          alt=""
          className="fixed pointer-events-none"
          style={{
            left: holePosition.x,
            top: holePosition.y,
            transform: `translate(-50%, -50%) ${shakeTransform}`,
            width: '1.9rem',
            height: '0.8rem',
            opacity: holeOpacity,
            imageRendering: 'pixelated',
            zIndex: 100
          }}
        />
      )}
    </>
  );
});

AsteroidCat.displayName = 'AsteroidCat';
export default AsteroidCat;
