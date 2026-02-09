'use client';

import { useState, useEffect, Suspense } from 'react';
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
    answer: "To qualify for Stasis, you need to earn <mark>6 badges</mark> by building hardware projects. Each badge is a skill you learn and demonstrate in your projects. You can only earn <mark>up to 3 badges per project</mark>, so you'll need to build at least 2 projects to attend. In addition to earning 6 badges, spend <mark>10 hours</mark> building your projects and you'll earn your ticket to Stasis!"
  },
  {
    question: "How many spots are there?",
    answer: "Stasis will have <mark>100 teenagers</mark> from all over the world, with spots being <mark>first come first serve</mark>, so get started as soon as you can!"
  },
  {
    question: "I don't know hardware!",
    answer: "Don't worry! Stasis is <mark>100% beginner friendly</mark>, we have a ton of starter projects for you to start learning skills, and if you complete and build a starter project, you can get 3 badges!"
  },
  {
    question: "Wait, I can get badges from learning hardware?",
    answer: "Yes! If you follow a starter project's tutorial and build it, you can earn <mark>up to 3 badges</mark>. This can only be done once, however, so you can't complete 2 starter projects and get 5 badges."
  },
  {
    question: "What does 50/50 mean?",
    answer: "Stasis will have an <mark>equal split</mark> of hackers that are male-identifying and hackers that are underrepresented in tech because of their gender. If you identify with a gender that is a minority in STEM, then you fall in the underrepresented 50. If you identify with a gender that is a majority in STEM, you fall into the male-identifying 50."
  },
  {
    question: "Is this legit? What's Hack Club?",
    answer: "<a href='https://hackclub.com'>Hack Club</a> is the world's largest community of teenage makers, and a <mark>501(c)(3) nonprofit</mark>. Hack Club is supported by donations from tech companies like GitHub and individuals like Michael Dell. Hack Club is <a href='https://hcb.hackclub.com/hq'>fiscally transparent</a>."
  },
  {
    question: "Who's eligible?",
    answer: "To be eligible for Stasis, you must be between the ages of <mark>13 and 18</mark> (<b>inclusive</b>), and you must be able to attend the event in person."
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
  const referralType = searchParams.get('t');
  const referralCode = searchParams.get('r');

  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [footerHeight, setFooterHeight] = useState(0);
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [signupCount, setSignupCount] = useState(0);
  const [recentCount, setRecentCount] = useState(0);

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

  async function handleSignUp() {
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
    }
  }

  async function handlePrelaunchRSVP() {
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
    <div className="bg-[linear-gradient(#DAD2BF99,#DAD2BF99),url(/noise-smooth.png)] font-mono text-cream-800 bg-container overflow-x-hidden">
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
          padding: 0.1em 0.25em;
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
              <div className="mb-2 md:mb-4 w-full h-auto relative">
                <img
                  src="/stasis-logo.svg"
                  alt="Stasis"
                  className="absolute -translate-x-[2%] md:-translate-x-4 scale-105 md:scale-[107%] -translate-y-[28%] origin-bottom md:origin-bottom-right select-none pointer-events-none"
                />
                <img
                  src="/stasis-text.svg"
                  alt=""
                  className="opacity-0 pointer-events-none select-none"
                />
              </div>

              <div className="absolute left-1/2 w-screen h-px -translate-x-1/2">
                <DottedLine orientation="horizontal" />
              </div>

              <ASCIIArt art={asciiArt.hackclub} horizontalPosition={80} />
              <ASCIIArt art={asciiArt.earth} horizontalPosition={35} />

              <HoverScramble
              segments={[
                { text: "GAXX F I GYI TIMK G PRCQJJMS R\nBCU" },
                { text: "50/50 HARDWARE HACKATHON", class: "text-cream-800" },
                { text: "EMD\n" },
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
                <p className="text-[14px] md:text-[18px] text-cream-700 -mt-1">
                  STASIS LAUNCHES AT 3,000 RSVPS!
                </p>
                <div className="w-full md:px-5 -mt-2">
                  <div className="text-center whitespace-nowrap text-[40px]">
                    <span className="text-[#d95d39]">{signupCount.toLocaleString()}</span> <span className="text-cream-800">/ {SIGNUP_GOAL.toLocaleString()}</span>
                  </div>
                  
                  {/* Progress Bar */}
                    <div className="w-full h-6 border-box border-x-6 border-y-2 border-[#d95d39] overflow-hidden flex">
                      {/* <div 
                        className="h-full bg-[#d95d39] transition-all duration-500 ease-out"
                        style={{ width: `${Math.max(Math.min(((signupCount - recentCount) / SIGNUP_GOAL) * 100, 100), 0)}%` }}
                      /> */}
                      <div 
                        className="h-full bg-gold-500 transition-all duration-500 ease-out"
                        style={{ width: `${Math.max(Math.min((recentCount / SIGNUP_GOAL) * 100, 100), 0)}%` }}
                      />
                    </div>
                  </div>
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
                  <p className="text-sm text-cream-700 mt-2">
                    <ScrambleText>Check your email for more information.</ScrambleText>
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex flex-row gap-5 w-full md:px-5 items-center">
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (PRELAUNCH_MODE ? handlePrelaunchRSVP() : handleSignUp())}
                      className="min-w-0 flex-1 h-[47px] px-3 bg-[#e9e3d6] border border-black text-cream-800 placeholder:text-[#9c8f88] focus:outline-none focus:border-brand-500 text-[14px] md:text-[18px]"
                      placeholder="you@example.com"
                    />
                    
                    <MagneticCorners offset={12}>
                      <MagneticCorners mode="border" color="#D95D39" magnetStrength={0.025} hoverOffsetIncrease={1} hoverColor="#e89161">
                        <button
                          onClick={PRELAUNCH_MODE ? handlePrelaunchRSVP : handleSignUp}
                          disabled={isSubmitting}
                          className="relative bg-brand-500 hover:bg-[#e0643e] active:bg-[#d95d39] px-4 md:px-8 h-[45px] flex items-center justify-center cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors box-border"
                        >
                          <span className={`text-[24px] uppercase tracking-wider text-[#4a230f] whitespace-nowrap ${isSubmitting ? 'invisible' : ''}`}>{PRELAUNCH_MODE ? 'RSVP' : 'Sign Up'}</span>
                          {isSubmitting && <span className="absolute inset-0 flex items-center justify-center text-[14px] md:text-[18px] text-[#4a230f]">...</span>}
                        </button>
                      </MagneticCorners>
                    </MagneticCorners>
                  </div>

                  {error && (
                    <p className="text-brand-500 text-sm">{error}</p>
                  )}

                  <p className="text-[14px] text-cream-600 text-left w-full mt-2 md:mt-0 md:px-5 ">
                    For high schoolers aged 13-18.
                  </p>

                  {!PRELAUNCH_MODE && (
                    <button
                      onClick={handleLogin}
                      className="text-sm text-cream-700 hover:text-brand-500 underline cursor-pointer transition-colors"
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
              <h2 className="text-[24px] uppercase text-cream-700">
                <ScrambleText>{">>: How You Qualify"}</ScrambleText>
              </h2>
              <ul className="space-y-2 text-[14px] md:text-[18px] [&>li]:pl-4 [&>li]:-indent-4 leading-snug text-left text-cream-700">
                <li><ScrambleText>• Design hardware projects using three hardware skills, get $$ to build it</ScrambleText></li>
                <li><ScrambleText>• Earn a badge for each skill you learn</ScrambleText></li>
                <li><ScrambleText>• Get five badges and fly to Austin, TX! (travel stipends available)</ScrambleText></li>
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
                <div className="text-right text-xs text-cream-400 mt-1">16/16</div>
              </div>
            </section>

            <div className="absolute left-1/2 w-screen h-px -translate-x-1/2">
              <DottedLine orientation="horizontal" />
            </div>

            <ASCIIArt art={asciiArt.fish} horizontalPosition={65} />
            <ASCIIArt art={asciiArt.cat} horizontalPosition={85} />
            <ASCIIArt art={asciiArt.roflcopter} horizontalPosition={35} verticalOffset="30rem" />
            <ASCIIArt art={asciiArt.duck} horizontalPosition={90} verticalOffset="28rem" />
            <ASCIIArt art={asciiArt.donut} horizontalPosition={12} />

            {/* FAQ */}
            <section className="text-cream-700 py-1 md:px-5 space-y-3 md:space-y-4 mb-8 md:mb-12">
              <h2 className="text-[24px] uppercase leading-normal mb-0 md:mb-2 "><ScrambleText>{">>: FAQ"}</ScrambleText></h2>
              <div>
                {faqs.map((faq, i) => (
                  <div key={i} className={`border-b-[1.5] border-cream-700 ${openIndex === i ? 'bg-cream-300/50' : ''}`}>
                    <button
                      onClick={(e) => { handleClick(e); toggle(i); }}
                      className="w-full text-left text-[14px] md:text-[18px] cursor-pointer"
                    >
                      <div className="flex items-center justify-between py-3 px-4">
                        <span>
                          <span className="mr-1">{'> '}</span>
                          <ScrambleText>{faq.question}</ScrambleText>
                        </span>
                        <span className="ml-3 mr-1 flex-shrink-0">
                          {openIndex === i ? '×' : '+'}
                        </span>
                      </div>
                      {openIndex === i && (
                        <div
                          className="pb-4 px-4 text-cream-700 faq leading-snug"
                          dangerouslySetInnerHTML={{ __html: faq.answer }}
                        />
                      )}
                    </button>
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
