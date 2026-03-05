import { NoiseOverlay } from '../components/NoiseOverlay';
import { DottedLine } from '../components/DottedLine';

export const metadata = {
  title: 'Stasis - Maintenance',
};

export default function DowntimePage() {
  return (
    <div className="bg-[linear-gradient(#DAD2BF99,#DAD2BF99),url(/noise-smooth.png)] font-mono text-brown-800 min-h-screen flex items-center justify-center overflow-hidden">
      <div className="relative max-w-[460px] w-full mx-auto px-5 md:px-0">
        {/* Vertical dotted lines (desktop) */}
        <div className="absolute left-0 top-0 h-full pointer-events-none hidden md:block">
          <DottedLine orientation="vertical" />
        </div>
        <div className="absolute right-0 top-0 h-full pointer-events-none hidden md:block">
          <DottedLine orientation="vertical" />
        </div>

        <div className="text-center space-y-8">
          {/* Logo */}
          <div className="w-full relative" style={{ aspectRatio: '625/81' }}>
            <img
              src="/stasis-logo.svg"
              alt="Stasis"
              width={727}
              height={147}
              className="absolute -translate-x-[2%] md:-translate-x-4 scale-105 md:scale-[107%] -translate-y-[28%] origin-bottom md:origin-bottom-right select-none pointer-events-none"
            />
            <div className="opacity-0 pointer-events-none select-none" style={{ aspectRatio: '625/81', width: '100%' }} />
          </div>

          <div className="w-full h-px">
            <DottedLine orientation="horizontal" />
          </div>

          {/* Maintenance message */}
          <div className="space-y-4 py-4">
            <h1 className="text-[24px] md:text-[28px] uppercase tracking-wider text-orange-500">
              {'>>:'} Under Maintenance
            </h1>
            <p className="text-[14px] md:text-[18px] leading-relaxed text-brown-800">
              The platform is undergoing maintenance and will be back soon. Check back shortly!
            </p>
          </div>

          <div className="w-full h-px">
            <DottedLine orientation="horizontal" />
          </div>

          <p className="text-[14px] text-cream-400">
            Questions? Email{' '}
            <a href="mailto:stasis@hackclub.com" className="text-orange-500 underline hover:bg-orange-500 hover:text-cream-100 transition-colors">
              stasis@hackclub.com
            </a>
          </p>
        </div>
      </div>

      <NoiseOverlay />
    </div>
  );
}
