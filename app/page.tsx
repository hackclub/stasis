'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import PageBorder from './components/PageBorder';
import { DottedLine } from './components/DottedLine';
import { NoiseOverlay } from './components/NoiseOverlay';
import { MagneticCorners } from './components/MagneticCorners';
import { HoverScramble } from './components/HoverScramble';
import { ASCIIArt } from './components/ASCIIArt';

import { asciiArt } from '@/lib/ascii-art';
import { useScramble } from '@/lib/scramble';
import { authClient } from '@/lib/auth-client';


const PRELAUNCH_MODE = process.env.NEXT_PUBLIC_PRELAUNCH_MODE === 'true';
const SIGNUP_GOAL = 3000;

const faqs = [
  {
    question: "How do I qualify for Stasis?",
    answer: "To qualify for Stasis, just make <mark>3 hardware projects</mark> (~45 hours) and you'll earn your ticket to Stasis!"
  },

  {
    question: "I don't know hardware!",
    answer: "Don't worry! Stasis is <mark>100% beginner friendly</mark>, we have a ton of starter projects for you to start learning skills, and if you complete and build a starter project, you can get 3 badges!"
  },
  {
    question: "What are the badges about?",
    answer: "With each hardware skill you use in your project, you can earn a badge that goes on your profile page! Special merch will be given out to those who reach <mark>5 badges</mark>, and you'll also be mailed a real-life badge so you can show off your skills!<br><br>Each project can earn a maximum of <mark>3 badges</mark> and must meet each badge's criteria."
  },
  {
    question: "Is this legit? What's Hack Club?",
    answer: "<a href='https://hackclub.com'>Hack Club</a> is the world's largest community of teenage makers, and a <mark>501(c)(3) nonprofit</mark>. Hack Club is supported by donations from tech companies like GitHub and individuals like Michael Dell. Hack Club is <a href='https://hcb.hackclub.com/hq'>fiscally transparent</a>."
  },
  {
    question: "Who's eligible?",
    answer: "To be eligible for Stasis, you must be between the ages of <mark>13 and 18</mark> (inclusive)."
  },
  {
    question: "I have more questions!",
    answer: "Join the <a href='https://hackclub.com/slack'>Hack Club Slack</a> and head to the <a href='https://hackclub.slack.com/archives/C09HSQM550A'>#stasis</a> channel! You can also email us at <a href='mailto:stasis@hackclub.com'>stasis@hackclub.com</a>."
  }
];

function ScrambleText({ children, className }: { children: string; className?: string }) {
  const ref = useScramble<HTMLSpanElement>({ threshold: 0, duration: 1.2, staggerMax: 0.6, delayMax: 0.4 });
  return <span ref={ref} className={className}>{children}</span>;
}

function HomeContent() {
  const searchParams = useSearchParams();
  const referralType = searchParams.get('t') || searchParams.get('utm_source');
  const referralCode = searchParams.get('r');

  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [footerHeight, setFooterHeight] = useState(0);
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [signupCount, setSignupCount] = useState(0);
  const [recentCount, setRecentCount] = useState(0);
  const [displayCount, setDisplayCount] = useState(0);
  const pageWrapperRef = useRef<HTMLDivElement>(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (pageWrapperRef.current) {
      (window as any).__stasisPageWrapper = pageWrapperRef.current;
    }
    return () => { delete (window as any).__stasisPageWrapper; };
  }, []);

  useEffect(() => {
    if (!PRELAUNCH_MODE) return;
    
    async function fetchCount() {
      try {
        const response = await fetch('/api/prelaunch/count');
        if (response.ok) {
          const data = await response.json();
          setSignupCount(data.count);
          setRecentCount(data.recentCount || 0);
        }
      } catch {
        // Silently fail
      }
    }

    fetchCount();
    const interval = setInterval(fetchCount, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (signupCount === 0) return;

    const duration = 1500;
    const start = performance.now();
    const startValue = Math.max(displayCount, 0);

    function animate(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayCount(Math.max(0, Math.round(startValue + (signupCount - startValue) * eased)));
      if (progress < 1) requestAnimationFrame(animate);
    }

    requestAnimationFrame(animate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signupCount]);

  async function handleSignUp() {
    if (submittingRef.current) return;
    if (!email.trim()) {
      setError('Please enter your email');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address');
      return;
    }

    setError('');
    setIsSubmitting(true);
    submittingRef.current = true;

    try {
      const response = await fetch('/api/rsvp/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        throw new Error('Failed to start RSVP');
      }

      await authClient.signIn.oauth2({
        providerId: 'hca',
        callbackURL: '/api/rsvp/callback',
      });
    } catch {
      setError('Something went wrong. Please try again.');
      setIsSubmitting(false);
      submittingRef.current = false;
    }
  }

  async function handlePrelaunchRSVP() {
    if (submittingRef.current) return;
    if (!email.trim()) {
      setError('Please enter your email');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address');
      return;
    }

    setError('');
    setIsSubmitting(true);
    submittingRef.current = true;

    try {
      const response = await fetch('/api/rsvp/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, referralType, referralCode }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to RSVP');
      }

      setSuccess(true);
      setEmail('');
      setSignupCount(prev => prev + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
      submittingRef.current = false;
    }
  }

  async function handleLogin() {
    await authClient.signIn.oauth2({
      providerId: 'hca',
      callbackURL: '/dashboard',
    });
  }

  function toggle(index: number) {
    setOpenIndex(openIndex === index ? null : index);
  }

  function handleClick(event: React.MouseEvent) {
    if ((event.target as HTMLElement).tagName === 'A') {
      event.stopPropagation();
    }
  }

  return (
    <div ref={pageWrapperRef} className="bg-[linear-gradient(#DAD2BF99,#DAD2BF99),url(/noise-smooth.png)] font-mono text-cream-800 bg-container overflow-x-hidden">
      <style jsx>{`
        .bg-container::before {
          content: '';
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: linear-gradient(#DAD2BF99, #DAD2BF99), url(/noise-smooth.png);
          pointer-events: none;
          z-index: -1;
        }
        .faq :global(a) {
          text-decoration: underline;
          color: var(--color-brand-500);
        }
        .faq :global(a:hover) {
          background-color: var(--color-brand-500);
          color: var(--color-cream-100);
        }
        .faq :global(mark) {
          background-color: #d95d39;
          color: #dad2bf;
          padding: 0.05em 0.15em;
        }
      `}</style>

      <div className="min-h-screen relative md:pt-12 z-0" style={{ paddingBottom: footerHeight }}>
        <div className="mx-auto max-w-[460px] pt-20 pb-16 md:pt-32 md:pb-24 *:py-6 *:md:py-16">
          {/* Vertical dotted lines (desktop) */}
          <div className="absolute left-1/2 top-0 h-full w-full max-w-[460px] -translate-x-1/2 pointer-events-none md:block hidden">
            <div className="absolute left-0 top-0 h-full">
              <DottedLine orientation="vertical" />
            </div>
            <div className="absolute right-0 top-0 h-full">
              <DottedLine orientation="vertical" />
            </div>
          </div>

          <div className="space-y-8 md:space-y-12 px-5 md:px-0">
            {/* Header */}
            <header className="text-center">
              <div className="absolute left-1/2 w-screen h-px -translate-x-1/2">
                <DottedLine orientation="horizontal" />
              </div>

              {/* Logo */}
              <div className="mb-2 md:mb-4 w-full relative" style={{ aspectRatio: '625/81' }}>
                <img
                  src="/stasis-logo.svg"
                  alt="Stasis"
                  width={727}
                  height={147}
                  className="absolute -translate-x-[2%] md:-translate-x-4 scale-105 md:scale-[107%] -translate-y-[28%] origin-bottom md:origin-bottom-right select-none pointer-events-none"
                />
                <div className="opacity-0 pointer-events-none select-none" style={{ aspectRatio: '625/81', width: '100%' }} />
              </div>

              <div className="absolute left-1/2 w-screen h-px -translate-x-1/2">
                <DottedLine orientation="horizontal" />
              </div>

              <ASCIIArt art={asciiArt.hackclub} horizontalPosition={80} verticalOffset="5rem" />
              <ASCIIArt art={asciiArt.earth} horizontalPosition={35} verticalOffset="12rem" />

              <HoverScramble
              segments={[
                { text: "GAXX F I GYI TIMK G PRCQJJMS R\nBCU XR" },
                { text: "HARDWARE HACKATHON", class: "text-cream-800" },
                { text: "QJ EMD\n" },
                { text: "AE" },
                { text: "MAY 15-18", class: "text-cream-800" },
                { text: "JRG HGG" },
                { text: "AUSTIN, TX", class: "text-cream-800" },
                { text: "PA\nFCX XW VQQET S" },
                { text: "COMPLETELY FREE", class: "text-cream-800" },
                { text: "M\nC LQW" },
                { text: "FLIGHT STIPENDS AVAILABLE", class: "text-cream-800" },
                { text: "\nC" },
                { text: "HIGH SCHOOLERS ONLY", class: "text-cream-800" },
                { text: "MEXDLB LEZ\nYRE VJ URVSP LWOSH JWPOX I SFF" }
              ]}
              srLabel="A hardware hackathon happening May 15 to 18, in Austin, Texas. The event is completely free with flight stipends available. For high schoolers only."
              initialScramble={true}
              initialDuration={2.5}
              initialStagger={1.2}
              initialDelay={0.8}
              continuousScramble={false}
              continuousSpeed={25}
              className="font-mono text-[0.95rem] sm:text-[1.1rem] md:text-[1.4rem] text-cream-800-20 leading-tight w-full origin-center block whitespace-nowrap overflow-hidden bg-[#DAD2BF50] py-1"
              />

              <div className="absolute left-1/2 w-screen h-px -translate-x-1/2">
                <DottedLine orientation="horizontal" />
              </div>
            </header>

            <div className="absolute left-1/2 w-screen h-px -translate-x-1/2">
              <DottedLine orientation="horizontal" />
            </div>

            {/* Prelaunch Progress Section */}
            {PRELAUNCH_MODE && (
              <div className="flex flex-col items-center py-2 mb-0 z-1 relative w-full gap-1">
                <p className="text-[14px] md:text-[18px] text-cream-800 -mt-1">
                  STASIS LAUNCHES AT {SIGNUP_GOAL.toLocaleString()} SIGNUPS!
                </p>
                <div className="w-full md:px-5 -mt-2">
                  <div className="text-center whitespace-nowrap text-[40px]">
                    <span className="text-[#d95d39]">{displayCount.toLocaleString()}</span> <span className="text-cream-800">/ {SIGNUP_GOAL.toLocaleString()}</span>
                  </div>
                  
                  {/* Progress Bar */}
                  <div className="w-full h-6 border-box border-x-6 border-y-2 border-[#d95d39] overflow-hidden flex px-[0.1rem] items-center">
                        <div 
                          className="h-4 bg-[#d95d39] transition-all duration-500 ease-out"
                          style={{ width: `${Math.max(Math.min(((signupCount - recentCount) / SIGNUP_GOAL) * 100, 100), 0)}%` }}
                        />
                        <div 
                          className="h-4 bg-gold-500 transition-all duration-500 ease-out"
                          style={{ width: `${Math.max(Math.min((recentCount / SIGNUP_GOAL) * 100, 100), 0)}%` }}
                        />
                      </div>
                    </div>

                    {/* is this doing anything?? */}
                    {recentCount > 0 && (
                      <div className="absolute left-1/2 -translate-x-1/2 -bottom-7 opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-xs text-cream-800 whitespace-nowrap pointer-events-none">
                        +{recentCount} in the last 24h
                      </div>
                    )}
          
              </div>
            )}

            {PRELAUNCH_MODE && (
              <div className="absolute left-1/2 w-screen h-px -translate-x-1/2">
                <DottedLine orientation="horizontal" />
              </div>
            )}

            {/* Sign Up / RSVP Section */}
            <div className="flex flex-col items-center !pt-0 pb-1.5 mb-0 z-1 relative gap-[3px] mt-4 md:mt-6">
              {PRELAUNCH_MODE && success ? (
                <div className="text-center py-4">
                  <p className="text-brand-500 font-medium">
                    <ScrambleText>You&apos;re on the list!</ScrambleText>
                  </p>
                  <p className="text-sm text-cream-800 mt-2">
                    <ScrambleText>Check your email for more information.</ScrambleText>
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex flex-row items-center gap-4 w-full md:px-5">
                    <div className="relative min-w-0 flex-1">
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && (PRELAUNCH_MODE ? handlePrelaunchRSVP() : handleSignUp())}
                        className="w-full h-[47px] px-3 bg-[#e9e3d6] border border-cream-800 text-cream-800 placeholder:text-[#9c8f88] focus:outline-none focus:border-brand-500 text-[14px] md:text-[18px]"
                        placeholder="example@email.com"
                      />
                      <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-[0.04]" />
                    </div>

                    <MagneticCorners offset={12}>
                      <MagneticCorners mode="border" color="#D95D39" magnetStrength={0.025} hoverOffsetIncrease={1} hoverColor="#e89161">
                        <button
                          onClick={PRELAUNCH_MODE ? handlePrelaunchRSVP : handleSignUp}
                          disabled={isSubmitting}
                          className="relative bg-brand-500 hover:bg-[#e0643e] active:bg-[#d95d39] px-4 md:px-8 h-[45px] flex items-center justify-center cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors box-border"
                        >
                          <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-[0.08]" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.3) 2px, rgba(0,0,0,0.3) 3px)', backgroundSize: '100% 3px' }} />
                          <span className={`text-[18px] uppercase tracking-wider text-[#4a230f] whitespace-nowrap ${isSubmitting ? 'invisible' : ''}`}>{PRELAUNCH_MODE ? 'RSVP' : 'Sign Up'}</span>
                          {isSubmitting && <span className="absolute inset-0 flex items-center justify-center text-[18px] text-[#4a230f]">...</span>}
                        </button>
                      </MagneticCorners>
                    </MagneticCorners>
                  </div>

                  <p className="text-[14px] text-cream-400 text-left w-full mt-2 md:mt-0 md:px-5">
                    For high schoolers aged 13-18.
                  </p>

                  {error && (
                    <p className="text-brand-500 text-sm">{error}</p>
                  )}

                  {!PRELAUNCH_MODE && (
                    <button
                      onClick={handleLogin}
                      className="text-sm text-cream-800 hover:text-brand-500 underline cursor-pointer transition-colors"
                    >
                      Already have an account? Log in
                    </button>
                  )}
                </>
              )}
            </div>

            <div className="absolute left-1/2 w-screen h-px -translate-x-1/2">
              <DottedLine orientation="horizontal" />
            </div>

            <div className="h-1"></div>

            <div className="absolute left-1/2 w-screen h-px -translate-x-1/2">
              <DottedLine orientation="horizontal" />
            </div>

            {/* How You Qualify */}
            <section className="space-y-3 md:space-y-4 md:px-5 py-1">
              <h2 className="text-[24px] uppercase text-cream-800">
                <ScrambleText>{">>: How You Qualify"}</ScrambleText>
              </h2>
              <ul className="space-y-2 text-[14px] md:text-[18px] leading-snug text-left text-cream-800">
                <li className="flex gap-2"><span>•</span><span><ScrambleText>Make 3 hardware projects (~45 hrs)</ScrambleText></span></li>
                <li className="flex gap-2"><span>•</span><span><ScrambleText>Fly to Austin, TX! (travel stipends available)</ScrambleText></span></li>
              </ul>

              {/* Badges */}
              <div className="pt-1">
                <div className="relative mt-4">
                  {/* BADGES heading - overlaps top edge of bracket box */}
                  <div className="absolute -top-[12px] left-0 right-0 flex items-center justify-center gap-3 z-10">
                    <div className="w-[35px] h-px bg-[#d95d39]" />
                    <span className="text-xl uppercase tracking-wider text-[#d95d39] px-1">Badges</span>
                    <div className="w-[35px] h-px bg-[#d95d39]" />
                  </div>
                  {/* Corner brackets */}
                  <div className="absolute left-0 top-0 w-[18px] h-[18px] border-l-[3px] border-t-[3px] border-[#d95d39]" />
                  <div className="absolute right-0 top-0 w-[18px] h-[18px] border-r-[3px] border-t-[3px] border-[#d95d39]" />
                  <div className="absolute left-0 bottom-0 w-[18px] h-[18px] border-l-[3px] border-b-[3px] border-[#d95d39]" />
                  <div className="absolute right-0 bottom-0 w-[18px] h-[18px] border-r-[3px] border-b-[3px] border-[#d95d39]" />
                  <div className="grid grid-cols-2 gap-x-1 gap-y-0 text-[14px] md:text-[16px] leading-[25px]  px-4 py-3 pt-5">
                    <ul className="[&>li]:pl-4 [&>li]:-indent-4">
                      <li><ScrambleText>· I2C</ScrambleText></li>
                      <li><ScrambleText>· SPI</ScrambleText></li>
                      <li><ScrambleText>· WiFi</ScrambleText></li>
                      <li><ScrambleText>· Bluetooth</ScrambleText></li>
                      <li><ScrambleText>· Other RF</ScrambleText></li>
                      <li><ScrambleText>· Analog Sensors</ScrambleText></li>
                      <li><ScrambleText>· Digital Sensors</ScrambleText></li>
                      <li><ScrambleText>· MCU Integration</ScrambleText></li>
                    </ul>
                    <ul className="[&>li]:pl-4 [&>li]:-indent-4">
                      <li><ScrambleText>· Displays</ScrambleText></li>
                      <li><ScrambleText>· Motors</ScrambleText></li>
                      <li><ScrambleText>· Cameras</ScrambleText></li>
                      <li><ScrambleText>· Metal/Machining</ScrambleText></li>
                      <li><ScrambleText>· Machine Learning</ScrambleText></li>
                      <li><ScrambleText>· Wood & Fasteners</ScrambleText></li>
                      <li><ScrambleText>· CAD</ScrambleText></li>
                      <li><ScrambleText>· 4-Layer PCBs</ScrambleText></li>
                    </ul>
                  </div>
                </div>
                <div aria-hidden="true" className="text-right text-xs text-cream-400 mt-1">16/16</div>
              </div>
            </section>

            <div className="absolute left-1/2 w-screen h-px -translate-x-1/2">
              <DottedLine orientation="horizontal" />
            </div>

            <ASCIIArt art={asciiArt.fish} horizontalPosition={65} verticalOffset="55rem" />
            <ASCIIArt art={asciiArt.cat} horizontalPosition={85} verticalOffset="62rem" />
            <ASCIIArt art={asciiArt.roflcopter} horizontalPosition={35} verticalOffset="85rem" />
            <ASCIIArt art={asciiArt.duck} horizontalPosition={90} verticalOffset="90rem" />
            <ASCIIArt art={asciiArt.donut} horizontalPosition={12} verticalOffset="48rem" />

            {/* FAQ */}
            <section className="text-cream-800 py-1 md:px-5 space-y-3 md:space-y-4 mb-8 md:mb-12 text-[14px] md:text-[18px] ">
              <h2 className="text-[24px] uppercase leading-normal mb-0 md:mb-2 "><ScrambleText>{">>: FAQ"}</ScrambleText></h2>
              <div>
                {faqs.map((faq, i) => (
                  <div key={i} className={`border-b-[1.5] border-cream-800 transition-colors duration-300 ${openIndex === i ? 'bg-cream-300/25' : ''}`}>
                    <button
                      onClick={(e) => { handleClick(e); toggle(i); }}
                      className="w-full text-left cursor-pointer"
                    >
                      <div className="flex items-center justify-between py-3 px-4">
                        <span>
                          <span className="mr-1">{'> '}</span>
                          <ScrambleText>{faq.question}</ScrambleText>
                        </span>
                        <span className="ml-3 mr-1 flex-shrink-0 transition-all duration-300 ease-in-out" style={{ transform: openIndex === i ? 'rotate(45deg)' : 'rotate(0deg)' }}>
                          <img src="/plus.svg" alt="" className="w-4 h-4" />
                        </span>
                      </div>
                    </button>
                    <div
                      className="grid transition-[grid-template-rows] duration-300 ease-in-out"
                      style={{ gridTemplateRows: openIndex === i ? '1fr' : '0fr' }}
                    >
                      <div className="overflow-hidden">
                        <div
                          className="pb-4 px-4 text-cream-800 faq leading-snug"
                          dangerouslySetInnerHTML={{ __html: faq.answer }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>

      <PageBorder onFooterHeightChange={(h) => setFooterHeight(h)} />
      <NoiseOverlay />
    </div>
  );
}

export default function Home() {
  return (
    <Suspense>
      <HomeContent />
    </Suspense>
  );
}
