'use client';

import { useState } from 'react';

type GuidePage = 'submission-guidelines' | 'faq'

export default function GuidesPage() {
  const [activeGuidePage, setActiveGuidePage] = useState<GuidePage>('submission-guidelines');

  return (
    <div className="flex gap-6">
      {/* Sidebar Navigation */}
      <div className="w-56 shrink-0">
        <nav className="bg-cream-900 border-2 border-cream-600 p-4 space-y-1 sticky top-8">
          <p className="text-cream-300 text-xs uppercase mb-3 tracking-wide">Guides</p>
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
          <p className="text-cream-300 text-xs uppercase mb-3 tracking-wide">FAQ</p>
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
              <p className="text-cream-200 italic text-sm">*if you&apos;re missing a .STEP file with all of your electronics and CAD, your project will not be approved*</p>

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
              <p className="text-cream-200 italic text-sm">There is no magic bullet, but as long as you put an honest effort forward you will almost certainly be approved.</p>

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
  );
}
