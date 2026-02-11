'use client';

import { useState, useEffect } from 'react';

type GuidePage = 'submission-guidelines' | 'faq'

const GUIDE_PAGES: { id: GuidePage; label: string; section: 'guides' | 'faq' }[] = [
  { id: 'submission-guidelines', label: 'Submission Guidelines', section: 'guides' },
  { id: 'faq', label: 'General FAQ', section: 'faq' },
];

export default function GuidesContent() {
  const [activeGuidePage, setActiveGuidePage] = useState<GuidePage>('submission-guidelines');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash === 'submission-guidelines') {
      setActiveGuidePage('submission-guidelines');
    } else if (hash === 'faq') {
      setActiveGuidePage('faq');
    }
  }, []);

  const currentPage = GUIDE_PAGES.find(p => p.id === activeGuidePage);

  return (
    <div className="flex flex-col md:flex-row gap-4 md:gap-6">
      {/* Sidebar Navigation - dropdown on mobile, vertical sidebar on desktop */}
      <div className="w-full md:w-56 shrink-0">
        <nav className="bg-cream-100 border-2 border-cream-400 p-3 md:p-4 md:sticky md:top-8">
          {/* Mobile: dropdown menu */}
          <div className="md:hidden relative">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="w-full flex items-center justify-between px-3 py-2 text-sm text-brand-500 bg-cream-200 cursor-pointer"
            >
              <div className="flex items-center gap-2">
                {/* Hamburger icon */}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
                <span>{currentPage?.label}</span>
              </div>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className={`transition-transform ${mobileMenuOpen ? 'rotate-180' : ''}`}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {mobileMenuOpen && (
              <div className="absolute top-full left-0 right-0 bg-cream-100 border-2 border-t-0 border-cream-400 z-10">
                {GUIDE_PAGES.map((page) => (
                  <button
                    key={page.id}
                    onClick={() => {
                      setActiveGuidePage(page.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-sm transition-colors cursor-pointer ${
                      activeGuidePage === page.id
                        ? 'text-brand-500 bg-cream-200'
                        : 'text-cream-800 hover:text-brand-500 hover:bg-cream-200'
                    }`}
                  >
                    {page.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Desktop: vertical sidebar */}
          <div className="hidden md:block space-y-1">
            <p className="text-cream-700 text-xs uppercase mb-3 tracking-wide">Guides</p>
            <button
              onClick={() => setActiveGuidePage('submission-guidelines')}
              className={`w-full text-left px-3 py-2 text-sm transition-colors cursor-pointer ${
                activeGuidePage === 'submission-guidelines'
                  ? 'text-brand-500 bg-cream-200'
                  : 'text-cream-800 hover:text-brand-500 hover:bg-cream-200'
              }`}
            >
              Submission Guidelines
            </button>
            <div className="border-t border-cream-400 my-3" />
            <p className="text-cream-700 text-xs uppercase mb-3 tracking-wide">FAQ</p>
            <button
              onClick={() => setActiveGuidePage('faq')}
              className={`w-full text-left px-3 py-2 text-sm transition-colors cursor-pointer ${
                activeGuidePage === 'faq'
                  ? 'text-brand-500 bg-cream-200'
                  : 'text-cream-800 hover:text-brand-500 hover:bg-cream-200'
              }`}
            >
              General FAQ
            </button>
          </div>
        </nav>
      </div>

      {/* Content Area */}
      <div className="flex-1 min-w-0">
        {activeGuidePage === 'submission-guidelines' && (
          <div className="bg-cream-100 border-2 border-cream-400 p-4 md:p-6">
            <h1 className="text-brand-500 text-xl md:text-2xl uppercase tracking-wide mb-4 md:mb-6">Submission Guidelines</h1>
            <div className="prose max-w-none space-y-6 text-cream-800">
              <p className="text-cream-700">Ready to submit your project? Right this way!</p>
              <p className="text-cream-700">
                The main thing we check for is whether or not your project is shipped. The requirements below are a bare <em>minimum</em>, not the goal - you&apos;re encouraged to go above and beyond! Add a 3D render, custom logo, and more!
              </p>

              <h2 className="text-brand-400 text-xl uppercase mt-8 mb-4">Requirements</h2>

              <h3 className="text-cream-800 text-lg mt-6 mb-3">1. Your project is original</h3>
              <p className="text-cream-700">
                If you follow guides from online or even from the guides section, that&apos;s fine! However, you need to have an original touch to the project. This is something different for every project. For the split keyboard, maybe add lights that flash different colors based on the program, etc. We WILL verify that your project is original even if you create it from some obscure guide.
              </p>

              <h3 className="text-cream-800 text-lg mt-6 mb-3">2. Your project is actually shipped & complete</h3>
              <p className="text-cream-700">The tl;dr of what this means is:</p>

              <h4 className="text-cream-800 font-medium mt-4 mb-2">YOUR PROJECT IS ACTUALLY COMPLETE:</h4>
              <ul className="list-disc list-inside text-cream-700 space-y-1">
                <li>It has a complete CAD assembly, with all components (including electronics)</li>
                <li>You have firmware present, even if it&apos;s untested</li>
                <li>You have sanity checked your design with someone else</li>
                <li>(optional) you have a 3D render of your project!</li>
              </ul>

              <h4 className="text-cream-800 font-medium mt-4 mb-2">YOUR GITHUB REPOSITORY CONTAINS ALL OF YOUR PROJECT FILES:</h4>
              <ul className="list-disc list-inside text-cream-700 space-y-1">
                <li>a BOM, in CSV format in the root directory, WITH LINKS</li>
                <li>the source files for your PCB, if you have one (.kicad_pro, .kicad_sch, gerbers.zip, etc)</li>
                <li><strong>A .STEP file of your project&apos;s 3D CAD model (and ideally the source design file format as well - .f3d, .FCStd, etc)</strong></li>
                <li>ANY other files that are part of your project (firmware, libraries, references, etc)</li>
                <li>You have everything easily readable and organized into folders.</li>
              </ul>
              <p className="text-cream-800 italic text-sm">*if you&apos;re missing a .STEP file with all of your electronics and CAD, your project will not be approved*</p>

              <h4 className="text-cream-800 font-medium mt-4 mb-2">YOUR README.md FILE CONTAINS THE FOLLOWING:</h4>
              <ul className="list-disc list-inside text-cream-700 space-y-1">
                <li>A short description of what your project is</li>
                <li>A couple sentences on <em>why</em> you made the project</li>
                <li><strong>PICTURES OF YOUR PROJECT</strong></li>
                <li>A screenshot of a full 3D model with your project</li>
                <li>A screenshot of your PCB, if you have one</li>
                <li>A wiring diagram, if you&apos;re doing any wiring that isn&apos;t on a PCB</li>
                <li>A BOM in table format at the end of the README</li>
              </ul>

              <h4 className="text-cream-800 font-medium mt-4 mb-2">YOU DO NOT HAVE:</h4>
              <ul className="list-disc list-inside text-cream-700 space-y-1">
                <li>AI Generated READMEs or Journal entries</li>
                <li>Stolen work from other people</li>
                <li>Missing firmware/software</li>
              </ul>
              <p className="text-red-500 text-sm mt-2">
                Any project that includes stolen content, AI-generated readmes or journals, or other fraudulent/dishonest material may be permanently rejected and could result in a ban from Stasis and other Hack Club programs!
              </p>

              <h3 className="text-cream-800 text-lg mt-6 mb-3">3. You have a quality journal</h3>
              <p className="text-cream-700">
                Your journal is very important for Stasis! Not only does it allow us to verify the hours you spent, it also allows for other people to look back at your project and follow its journey. Here are some important things to keep in mind while journaling:
              </p>
              <ul className="list-disc list-inside text-cream-700 space-y-1">
                <li>Try to keep each entry under 5 hours, this is not a hard requirement but your project will be more likely to be rejected</li>
                <li>Take into account your thoughts while making a project</li>
                <li>Don&apos;t just log the steps that led to your final project! You should have all of your failures and rabbit holes that didn&apos;t end up making it to the final piece.</li>
              </ul>

              <h4 className="text-cream-800 font-medium mt-4 mb-2">MEDIA REQUIREMENTS:</h4>
              <ul className="list-disc list-inside text-cream-700 space-y-1">
                <li><strong>Images are required</strong> for every journal entry submission</li>
                <li><strong>Sessions over 7 hours require a timelapse</strong> recording of your work session</li>
              </ul>

              <p className="text-cream-800 italic text-sm mt-4">There is no magic bullet, but as long as you put an honest effort forward you will almost certainly be approved.</p>

              <h3 className="text-cream-800 text-lg mt-6 mb-3">4. Your project is cost optimized!</h3>
              <p className="text-cream-700">You should always aim to make your project as cheap as possible!</p>
              <ul className="list-disc list-inside text-cream-700 space-y-1">
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
          <div className="bg-cream-100 border-2 border-cream-400 p-4 md:p-6">
            <h1 className="text-brand-500 text-xl md:text-2xl uppercase tracking-wide mb-4 md:mb-6">Frequently Asked Questions</h1>
            <div className="space-y-4">
              <div className="border-b border-cream-400 pb-4">
                <h3 className="text-cream-800 text-base md:text-lg mb-2">What is Stasis?</h3>
                <p className="text-cream-700">Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.</p>
              </div>
              <div className="border-b border-cream-400 pb-4">
                <h3 className="text-cream-800 text-base md:text-lg mb-2">How do I get started?</h3>
                <p className="text-cream-700">Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.</p>
              </div>
              <div className="border-b border-cream-400 pb-4">
                <h3 className="text-cream-800 text-base md:text-lg mb-2">How long does review take?</h3>
                <p className="text-cream-700">Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo.</p>
              </div>
              <div className="border-b border-cream-400 pb-4">
                <h3 className="text-cream-800 text-base md:text-lg mb-2">What counts as a shipped project?</h3>
                <p className="text-cream-700">Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt.</p>
              </div>
              <div className="border-b border-cream-400 pb-4">
                <h3 className="text-cream-800 text-base md:text-lg mb-2">Can I use online tutorials?</h3>
                <p className="text-cream-700">Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet, consectetur, adipisci velit, sed quia non numquam eius modi tempora incidunt ut labore et dolore magnam aliquam quaerat voluptatem.</p>
              </div>
              <div className="border-b border-cream-400 pb-4">
                <h3 className="text-cream-800 text-base md:text-lg mb-2">What if my project gets rejected?</h3>
                <p className="text-cream-700">Ut enim ad minima veniam, quis nostrum exercitationem ullam corporis suscipit laboriosam, nisi ut aliquid ex ea commodi consequatur? Quis autem vel eum iure reprehenderit qui in ea voluptate velit esse quam nihil molestiae consequatur.</p>
              </div>
              <div className="border-b border-cream-400 pb-4">
                <h3 className="text-cream-800 text-base md:text-lg mb-2">How are badges awarded?</h3>
                <p className="text-cream-700">At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis praesentium voluptatum deleniti atque corrupti quos dolores et quas molestias excepturi sint occaecati cupiditate non provident.</p>
              </div>
              <div className="border-b border-cream-400 pb-4">
                <h3 className="text-cream-800 text-base md:text-lg mb-2">What is Hackatime?</h3>
                <p className="text-cream-700">Similique sunt in culpa qui officia deserunt mollitia animi, id est laborum et dolorum fuga. Et harum quidem rerum facilis est et expedita distinctio.</p>
              </div>
              <div className="pb-4">
                <h3 className="text-cream-800 text-base md:text-lg mb-2">Where can I get help?</h3>
                <p className="text-cream-700">Nam libero tempore, cum soluta nobis est eligendi optio cumque nihil impedit quo minus id quod maxime placeat facere possimus, omnis voluptas assumenda est, omnis dolor repellendus.</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
