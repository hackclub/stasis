'use client';

import { useState } from 'react';
import PageBorder from './components/PageBorder';
import { DottedLine } from './components/DottedLine';
import { NoiseOverlay } from './components/NoiseOverlay';
import { MagneticCorners } from './components/MagneticCorners';
import { HoverScramble } from './components/HoverScramble';
import { ASCIIArt } from './components/ASCIIArt';
import { asciiArt } from '@/lib/ascii-art';
import { useScramble } from '@/lib/scramble';
import { authClient } from '@/lib/auth-client';

const faqs = [
  {
    question: "How do I qualify for Stasis?",
    answer: "To qualify for Stasis, you need to earn 5 badges by building hardware projects. Each badge is a skill you learn and demonstrate in your projects. You can only earn up to 3 badges per project, so you’ll need to build at least 2 projects to attend. In addition to earning 5 badges, spend 10 hours building your projects and you’ll earn your ticket to Stasis!"
  },
  {
    question: "How many spots are there?",
    answer: "Stasis will have 100 teenagers from all over the world, with spots being first come first serve, so get started as soon as you can!"
  },
  {
    question: "I don't know hardware!",
    answer: "Don't worry! Stasis is 100% beginner friendly, we have a ton of starter projects for you to start learning skills, and if you complete and build a starter project, you can get 3 badges!"
  },
  {
    question: "Wait, I can get badges from learning hardware?",
    answer: "Yes! If you follow a starter project's tutorial and build it, you can earn up to 3 badges. This can only be done once, however, so you can't complete 2 starter projects and get 6 badges."
  },
  {
    question: "What does 50/50 mean?",
    answer: "Stasis will have an equal split of hackers that are male-identifying and hackers that are underrepresented in tech because of their gender. If you identify with a gender that is a minority in STEM, then you fall in the underrepresented 50. If you identify with a gender that is a majority in STEM, you fall into the male-identifying 50."
  },
  {
    question: "Is this legit? What's Hack Club?",
    answer: "<a href='https://hackclub.com'>Hack Club</a> is the world's largest community of teenage makers, and a 501(c)(3) nonprofit. Hack Club is supported by donations from tech companies like GitHub and invidiuals like Michael Dell. Hack Club is <a href='https://hcb.hackclub.com/hq'>fiscally transparent</a>."
  },
  {
    question: "Who's eligible?",
    answer: "To be eligible for Stasis, you must be between the ages of 13 and 18 (<b>inclusive</b>), and you must be able to attend the event in person."
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

export default function Home() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [footerHeight, setFooterHeight] = useState(0);
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

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
        .faq a {
          text-decoration: underline;
          color: var(--color-brand-500);
        }
        .faq a:hover {
          background-color: var(--color-brand-500);
          color: var(--color-cream-100);
        }
      `}</style>

      <div className="min-h-screen relative md:pt-12 z-0" style={{ paddingBottom: footerHeight }}>
        <div className="mx-auto max-w-md pt-20 pb-16 md:pt-32 md:pb-24 *:py-6 *:md:py-16">
          {/* Vertical dotted lines (desktop) */}
          <div className="absolute left-1/2 top-0 h-full w-full max-w-md -translate-x-1/2 pointer-events-none md:block hidden">
            <div className="absolute left-0 top-0 h-full">
              <DottedLine orientation="vertical" />
            </div>
            <div className="absolute right-0 top-0 h-full">
              <DottedLine orientation="vertical" />
            </div>
          </div>

          <div className="space-y-8 md:space-y-12 px-5 md:px-2">
            {/* Header */}
            <header className="text-center">
              <div className="absolute left-1/2 w-screen h-px -translate-x-1/2">
                <DottedLine orientation="horizontal" />
              </div>

              {/* Logo */}
              <div className="mb-2 md:mb-4 py-1 w-full h-auto relative">
                <img 
                  src="/stasis-logo.svg" 
                  alt="Hack Club Stasis" 
                  className="absolute -translate-x-[2%] md:-translate-x-0 scale-105 md:scale-[116%] -translate-y-[28%] origin-bottom md:origin-bottom-right select-none pointer-events-none"
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
                { text: "MAY 15-17", class: "text-cream-800" },
                { text: "JRG HGG" },
                { text: "AUSTIN, TX", class: "text-cream-800" },
                { text: "PA\nFCX XW VQQET S" },
                { text: "COMPLETELY FREE", class: "text-cream-800" },
                { text: "M\nC LQW" },
                { text: "FLIGHT STIPENDS AVAILABLE", class: "text-cream-800" },
                { text: "\nC" },
                { text: "HIGH SCHOOLERS ONLY", class: "text-cream-800" },
                { text: "MEXDLB LEZ\nYRE  VJ URVSP LWOSH JWPOX I SFF" }
              ]}
              initialScramble={true}
              initialDuration={2.5}
              initialStagger={1.2}
              initialDelay={0.8}
              continuousScramble={false}
              continuousSpeed={25}
              className="font-mono font-medium text-[0.95rem] sm:text-[1.1rem] md:text-[1.4rem] text-cream-800-20 leading-tight w-full origin-center block whitespace-pre-line bg-[#DAD2BF50]"
              />

              <div className="absolute left-1/2 w-screen h-px -translate-x-1/2">
                <DottedLine orientation="horizontal" />
              </div>
            </header>

            <div className="absolute left-1/2 w-screen h-px -translate-x-1/2">
              <DottedLine orientation="horizontal" />
            </div>

            {/* Sign Up Section */}
            <div className="flex flex-col items-center !pt-0 pb-1.5 mb-0 z-1 relative gap-3 md:gap-4">
              <p className="text-xs text-cream-700 text-center">
                Stasis is for high schoolers aged 13-18.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-3 w-full max-w-sm">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSignUp()}
                  className="flex-1 px-3 py-2.5 bg-cream-50 border border-cream-600 text-cream-800 placeholder:text-cream-600 focus:outline-none focus:border-brand-500 text-sm md:text-base"
                  placeholder="you@example.com"
                />
                <MagneticCorners offset={8}>
                  <MagneticCorners mode="border" color="#D95D39" magnetStrength={0.025} hoverOffsetIncrease={1} hoverColor="#e89161">
                    <button 
                      onClick={handleSignUp}
                      disabled={isSubmitting}
                      className="relative bg-brand-500 hover:bg-[#e0643e] active:bg-[#c85a35] px-4 py-2.5 text-sm sm:text-base uppercase tracking-wider text-brand-900 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                      <span className={isSubmitting ? 'invisible' : ''}>Sign Up</span>
                      {isSubmitting && <span className="absolute inset-0 flex items-center justify-center">Loading...</span>}
                    </button>
                  </MagneticCorners>
                </MagneticCorners>
              </div>

              {error && (
                <p className="text-brand-500 text-sm">{error}</p>
              )}

              <button
                onClick={handleLogin}
                className="text-sm text-cream-700 hover:text-brand-500 underline cursor-pointer transition-colors"
              >
                Already have an account? Log in
              </button>
            </div>

            <div className="absolute left-1/2 w-screen h-px -translate-x-1/2">
              <DottedLine orientation="horizontal" />
            </div>

          

            <div className="h-1"></div>

            <div className="absolute left-1/2 w-screen h-px -translate-x-1/2">
              <DottedLine orientation="horizontal" />
            </div>

            {/* How You Qualify */}
            <section className="space-y-3 md:space-y-4">
              <h2 className="text-base sm:text-lg md:text-xl uppercase tracking-wide">
                <ScrambleText>How You Qualify</ScrambleText>
                <img src="/pixel-arrow.png" alt="" className="inline-block" style={{ height: '0.9em', imageRendering: 'pixelated', transform: 'translateY(-0.11em)' }} />
              </h2>
              <ul className="space-y-2 text-sm md:text-base [&>li]:pl-4 [&>li]:-indent-4 leading-relaxed">
                <li><ScrambleText>· Design hardware projects and learn new skills, get $$ to build them</ScrambleText></li>
                <li><ScrambleText>· Earn a badge for each skill you learn</ScrambleText></li>
                <li><ScrambleText>· Get five badges and fly to Austin, TX! (travel stipends available)</ScrambleText></li>
              </ul>
            </section>

            <div className="absolute left-1/2 w-screen h-px -translate-x-1/2">
              <DottedLine orientation="horizontal" />
            </div>

            <ASCIIArt art={asciiArt.fish} horizontalPosition={65} />

            {/* Badges You Can Earn */}
            <section className="space-y-3 md:space-y-4">
              <h2 className="text-base sm:text-lg md:text-xl uppercase tracking-wide"><ScrambleText>Badges You Can Earn</ScrambleText></h2>
              <ul className="space-y-1 text-sm md:text-base [&>li]:pl-4 [&>li]:-indent-4 columns-1 sm:columns-2 md:columns-1 gap-x-6">
                <li><ScrambleText>· I2C</ScrambleText></li>
                <li><ScrambleText>· SPI</ScrambleText></li>
                <li><ScrambleText>· WiFi</ScrambleText></li>
                <li><ScrambleText>· Bluetooth</ScrambleText></li>
                <li><ScrambleText>· Other RF (LoRa, etc.)</ScrambleText></li>
                <li><ScrambleText>· Analog Sensors</ScrambleText></li>
                <li><ScrambleText>· Digital Sensors</ScrambleText></li>
                <li><ScrambleText>· CAD</ScrambleText></li>
                <li><ScrambleText>· Displays</ScrambleText></li>
                <li><ScrambleText>· Motors</ScrambleText></li>
                <li><ScrambleText>· Cameras</ScrambleText></li>
                <li><ScrambleText>· Metal/Machining</ScrambleText></li>
                <li><ScrambleText>· Wood & Fasteners</ScrambleText></li>
                <li><ScrambleText>· Machine Learning</ScrambleText></li>
                <li><ScrambleText>· MCU Integration</ScrambleText></li>
                <li><ScrambleText>· 4-Layer PCB</ScrambleText></li>
              </ul>
            </section>

            <div className="absolute left-1/2 w-screen h-px -translate-x-1/2">
              <DottedLine orientation="horizontal" />
            </div>

            <ASCIIArt art={asciiArt.cat} horizontalPosition={85} />
            <ASCIIArt art={asciiArt.roflcopter} horizontalPosition={35} verticalOffset="30rem" />
            <ASCIIArt art={asciiArt.duck} horizontalPosition={90} verticalOffset="28rem" />
            <ASCIIArt art={asciiArt.donut} horizontalPosition={12} />

            {/* FAQ */}
            <section className="space-y-3 md:space-y-4 mb-8 md:mb-12">
              <h2 className="text-base sm:text-lg md:text-xl uppercase tracking-wide mb-3 md:mb-4"><ScrambleText>Frequently Asked Questions</ScrambleText></h2>
              <div>
                {faqs.map((faq, i) => (
                  <div key={i} className="border-b border-cream-600">
                    <button
                      onClick={(e) => { handleClick(e); toggle(i); }}
                      className="w-full text-left text-sm md:text-base cursor-pointer"
                    >
                      <div className="flex items-center justify-between py-3 md:py-2.5">
                        <ScrambleText>{faq.question}</ScrambleText>
                        <span
                          className="text-xl transition-transform duration-300 ease-out ml-3 md:ml-4 mr-1 md:mr-2 flex-shrink-0"
                          style={{ transform: `rotate(${openIndex === i ? 45 : 0}deg)` }}
                        >
                          +
                        </span>
                      </div>
                      {openIndex === i && (
                        <div 
                          className="pb-3 md:pb-2.5 pr-6 md:pr-8 text-cream-700 faq leading-relaxed"
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
