import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ASCIIArt } from '../components/ASCIIArt';
import { Footer } from '../components/Footer';
import { asciiArt } from '@/lib/ascii-art';

export const metadata: Metadata = {
  title: 'Travel to Stasis',
  description:
    'How to get to Stasis at Arena Hall in Austin, TX — flights, ground travel, visas, accommodation, and arrival times.',
  alternates: { canonical: 'https://stasis.hackclub.com/travel' },
};

const VENUE_MAP_URL =
  'https://www.google.com/maps/search/?api=1&query=Arena+Hall+108+W+Gibson+St+Austin+TX+78704';
const SLACK_SUPPORT_URL =
  'https://hackclub.enterprise.slack.com/archives/C09JP51FHNE';

const SECTIONS = [
  { id: 'schedule', num: '1', label: 'Schedule' },
  { id: 'flights', num: '2', label: 'By air' },
  { id: 'ground', num: '3', label: 'By land' },
  { id: 'visas', num: '4', label: 'Visas' },
  { id: 'accommodation', num: '5', label: 'Accommodation' },
  { id: 'late-arrivals', num: '6', label: 'Late arrivals' },
];

export default function TravelPage() {
  return (
    <div className="min-h-screen bg-[linear-gradient(#DAD2BF99,#DAD2BF99),url(/noise-smooth.png)] font-sans text-brown-900 relative overflow-clip">
      <header className="pl-3 pr-6 py-2 flex items-center justify-between border-b border-cream-400">
        <Link href="/" className="hover:opacity-80 transition-opacity">
          <Image src="/stasis-logo.svg" alt="Stasis" width={120} height={40} className="h-10 w-auto" />
        </Link>
        <Link
          href="/dashboard"
          className="text-orange-600 hover:text-orange-500 text-sm uppercase tracking-[0.18em]"
        >
          Dashboard &rarr;
        </Link>
      </header>

      <ASCIIArt art={asciiArt.earth} horizontalPosition={88} verticalOffset="14rem" />

      <main className="relative z-10 max-w-3xl mx-auto pt-14 pb-16 md:pt-20 md:pb-24 px-5 md:px-10">
        <Hero />
        <Index />

        <div className="mt-16 md:mt-20 space-y-14 md:space-y-16">
          <Schedule />
          <Flights />
          <Ground />
          <Visas />
          <Accommodation />
          <LateArrivals />
        </div>

        <Contact />
      </main>

      <Footer />
    </div>
  );
}

function Hero() {
  return (
    <section aria-labelledby="travel-heading">
      <h1
        id="travel-heading"
        className="text-[clamp(3rem,9vw,5.5rem)] leading-[0.95] font-medium tracking-[-0.02em] text-brown-900"
      >
        Travel
      </h1>

      <p className="mt-6 max-w-2xl text-lg md:text-xl leading-relaxed text-brown-800">
        Everything you need to plan your trip to Stasis — when to arrive, how to get here, and what we
        can help cover.
      </p>

      <p className="mt-6 text-base md:text-lg text-brown-900">
        Arena Hall · Austin, TX · May 15–18, 2026
      </p>
    </section>
  );
}

function Index() {
  return (
    <nav aria-label="Sections" className="mt-14 md:mt-16">
      <ol className="border-t border-cream-400">
        {SECTIONS.map((s) => (
          <li key={s.id} className="border-b border-cream-400">
            <a
              href={`#${s.id}`}
              className="group flex items-baseline gap-5 py-3 hover:text-orange-600 transition-colors"
            >
              <span className="tabular-nums text-brown-900/40 group-hover:text-orange-600 w-5">
                {s.num}.
              </span>
              <span className="text-base md:text-lg">{s.label}</span>
              <span
                aria-hidden
                className="ml-auto text-brown-900/30 group-hover:text-orange-600 transition-transform group-hover:translate-x-1"
              >
                &rarr;
              </span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function SectionFrame({
  id,
  num,
  label,
  children,
}: Readonly<{ id: string; num: string; label: string; children: React.ReactNode }>) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-24 border-t border-cream-400 pt-8 md:pt-10">
      <h2
        id={`${id}-heading`}
        className="text-2xl md:text-[28px] font-medium tracking-[-0.01em] text-brown-900"
      >
        <span className="text-brown-900/40 font-normal">{num}.</span> {label}
      </h2>
      <div className="mt-5 max-w-prose space-y-5 text-base md:text-[17px] leading-relaxed text-brown-800">
        {children}
      </div>
    </section>
  );
}

function Schedule() {
  return (
    <SectionFrame id="schedule" num="1" label="Schedule">
      <p>
        Stasis runs from <strong className="text-brown-900 font-medium">Friday, May 15</strong> through{' '}
        <strong className="text-brown-900 font-medium">Monday, May 18</strong>. Opening kicks off at 7:00 PM
        Friday, but doors are open from 3:00 PM if you want to settle in early. We wrap up between 12 and
        1 PM on Monday.
      </p>
      <ul className="mt-2 space-y-2 border-t border-cream-300 pt-5">
        <li className="grid grid-cols-[7rem_1fr] gap-x-6 items-baseline">
          <span className="text-brown-900">Doors open</span>
          <span>Friday, May 15 · 3:00 PM</span>
        </li>
        <li className="grid grid-cols-[7rem_1fr] gap-x-6 items-baseline">
          <span className="text-brown-900">Opening</span>
          <span>Friday, May 15 · 7:00 PM</span>
        </li>
        <li className="grid grid-cols-[7rem_1fr] gap-x-6 items-baseline">
          <span className="text-brown-900">Closing</span>
          <span>Monday, May 18 · 12–1 PM</span>
        </li>
      </ul>
      <p>
        For the full event timeline, see the{' '}
        <Link
          href="/schedule"
          className="text-orange-600 underline decoration-orange-600/40 underline-offset-4 hover:decoration-orange-600"
        >
          Stasis schedule
        </Link>
        .
      </p>
    </SectionFrame>
  );
}

function Flights() {
  return (
    <SectionFrame id="flights" num="2" label="By air">
      <p>
        Fly into <strong className="text-brown-900 font-medium">Austin-Bergstrom International (AUS)</strong>.
        We&apos;ll help you get to the venue — if you need a pickup, our team can meet you at the airport
        and arrange an Uber.
      </p>
      <p>
        If possible, book flights that land at least{' '}
        <strong className="text-brown-900 font-medium">one hour before</strong> the event begins and depart
        at least <strong className="text-brown-900 font-medium">three hours after</strong>{' '}
        it ends — this gives time for pickup, security, and the Austin traffic that always finds a way. If
        that&apos;s not possible, we can accommodate you; just let us know.
      </p>
      <div className="border-t border-cream-300 pt-5 space-y-3">
        <p>
          If you bought a travel stipend in the shop, we&apos;ll reimburse you up to that amount once you
          submit your booking.
        </p>
        <p>
          We can also book travel for you instead of reimbursing — but only if your purchased stipend
          covers more than the cost of your flight. Reach out to an organizer to set that up.
        </p>
      </div>
    </SectionFrame>
  );
}

function Ground() {
  return (
    <SectionFrame id="ground" num="3" label="By land">
      <p>
        Driving, taking a train, or busing in? You can get reimbursed through the{' '}
        <a
          href="https://gas.hackclub.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-orange-600 underline decoration-orange-600/40 underline-offset-4 hover:decoration-orange-600"
        >
          Hack Club Gas Fund
        </a>
        .
      </p>
      <p>
        The Gas Fund usually won&apos;t cover 100% of the cost, so plan to top it up with a travel stipend
        from the Stasis shop if you need to.
      </p>
      <div className="border-t border-cream-300 pt-5 space-y-3">
        <p className="text-brown-900">Arena Hall, 108 W Gibson St, Austin, TX 78704</p>
        <a
          href={VENUE_MAP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 border border-brown-900/30 hover:border-orange-600 hover:text-orange-600 px-3 py-1.5 text-sm transition-colors"
        >
          View on Google Maps
          <span aria-hidden>&rarr;</span>
        </a>
      </div>
    </SectionFrame>
  );
}

function Visas() {
  return (
    <SectionFrame id="visas" num="4" label="Visas">
      <p>
        Traveling internationally and need a visa? Apply for an invitation letter through Hack
        Club&apos;s visa service.
      </p>
      <a
        href="https://visas.hackclub.com/events/stasis/apply"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 border border-brown-900/30 hover:border-orange-600 hover:text-orange-600 px-3 py-1.5 text-sm transition-colors"
      >
        Apply for an invitation letter
        <span aria-hidden>&rarr;</span>
      </a>
    </SectionFrame>
  );
}

function Accommodation() {
  return (
    <SectionFrame id="accommodation" num="5" label="Accommodation">
      <p>
        Need to arrive a day early or leave a day late? Pre- and post-event accommodation is available
        for purchase in the Stasis shop.
      </p>
      <p className="text-brown-900/70 text-sm">
        Lodging during the event itself is provided — this only covers the buffer days around it.
      </p>
    </SectionFrame>
  );
}

function LateArrivals() {
  return (
    <SectionFrame id="late-arrivals" num="6" label="Late arrivals">
      <p>
        If you have an unavoidable conflict — an AP exam, for example — and need to arrive after Friday
        evening, that&apos;s okay. Let us know in advance so we can plan your pickup.
      </p>
    </SectionFrame>
  );
}

function Contact() {
  return (
    <section className="mt-16 md:mt-20 border-t border-cream-400 pt-8 md:pt-10">
      <h2 className="text-2xl md:text-[28px] font-medium tracking-[-0.01em] text-brown-900">
        Still stuck?
      </h2>
      <div className="mt-5 max-w-prose space-y-5 text-base md:text-[17px] leading-relaxed text-brown-800">
        <p>
          Ask in{' '}
          <a
            href={SLACK_SUPPORT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-orange-600 underline decoration-orange-600/40 underline-offset-4 hover:decoration-orange-600"
          >
            #stasis-support
          </a>{' '}
          in the Hack Club Slack, or email{' '}
          <a
            href="mailto:stasis@hackclub.com"
            className="text-orange-600 underline decoration-orange-600/40 underline-offset-4 hover:decoration-orange-600"
          >
            stasis@hackclub.com
          </a>
          . An organizer will get back to you.
        </p>
        <div className="flex flex-wrap gap-x-6 gap-y-2 pt-4 text-sm">
          <Link href="/docs" className="hover:text-orange-600">
            All docs &rarr;
          </Link>
          <Link href="/docs/faq" className="hover:text-orange-600">
            FAQ &rarr;
          </Link>
          <Link href="/dashboard" className="hover:text-orange-600">
            Dashboard &rarr;
          </Link>
        </div>
      </div>
    </section>
  );
}
