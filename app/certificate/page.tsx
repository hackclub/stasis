'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { PlatformNoiseOverlay } from '../components/PlatformNoiseOverlay';

const CODE_LENGTH = 6;

type Result =
  | { state: 'valid'; code: string; name: string; issuedAt: string | null }
  | { state: 'invalid'; code: string }
  | { state: 'error'; message: string };

function sanitize(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function formatIssued(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

/**
 * The corner-bracket frame from the dashboard certificate page: instrumented
 * corners with the label sitting on the top rule, rather than a card.
 */
function BracketFrame({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <div className="relative">
      <div className="absolute -top-[12px] left-0 right-0 flex items-center justify-center gap-3 z-10">
        <div className="w-[20px] h-px bg-[#d95d39]" />
        <span className="text-sm text-[#d95d39] bg-[#DAD2BF] px-2">{label}</span>
        <div className="w-[20px] h-px bg-[#d95d39]" />
      </div>
      <div className="absolute left-0 top-0 w-[14px] h-[14px] border-l-[2px] border-t-[2px] border-[#d95d39]" />
      <div className="absolute right-0 top-0 w-[14px] h-[14px] border-r-[2px] border-t-[2px] border-[#d95d39]" />
      <div className="absolute left-0 bottom-0 w-[14px] h-[14px] border-l-[2px] border-b-[2px] border-[#d95d39]" />
      <div className="absolute right-0 bottom-0 w-[14px] h-[14px] border-r-[2px] border-b-[2px] border-[#d95d39]" />
      <div className="px-6 py-7 pt-8">{children}</div>
    </div>
  );
}

function Verifier() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initial = sanitize(searchParams.get('id') ?? '').slice(0, CODE_LENGTH);

  // One real input holds the whole code; the six cells below are presentation.
  // Six separate inputs meant juggling focus between them on every keystroke,
  // which is what broke typing — and it can never express "type past the end"
  // or a mid-code backspace correctly. With a single field the browser handles
  // the caret, selection, paste, undo and mobile keyboards for free.
  const [code, setCode] = useState(initial);
  const [focused, setFocused] = useState(false);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const input = useRef<HTMLInputElement | null>(null);

  const verify = useCallback(async (code: string) => {
    setChecking(true);
    try {
      const res = await fetch(`/api/certificate/verify?id=${encodeURIComponent(code)}`);
      if (res.status === 503) {
        setResult({ state: 'error', message: 'Verification is temporarily unavailable.' });
        return;
      }
      const data = await res.json();
      setResult(
        data.valid
          ? { state: 'valid', code: data.code, name: data.name, issuedAt: data.issuedAt ?? null }
          : { state: 'invalid', code },
      );
    } catch {
      setResult({ state: 'error', message: 'Could not reach the server.' });
    } finally {
      setChecking(false);
    }
  }, []);

  // Arriving with ?id= set means the link off the certificate was followed —
  // resolve it without making the visitor retype what they already have.
  const autoRan = useRef(false);
  useEffect(() => {
    if (autoRan.current || initial.length !== CODE_LENGTH) return;
    autoRan.current = true;
    void verify(initial);
  }, [initial, verify]);

  const complete = code.length === CODE_LENGTH;

  const submit = useCallback(
    (value: string) => {
      if (value.length !== CODE_LENGTH || checking) return;
      router.replace(`/certificate?id=${value}`, { scroll: false });
      void verify(value);
    },
    [checking, router, verify],
  );

  const onChange = (value: string) => {
    const clean = sanitize(value).slice(0, CODE_LENGTH);
    setCode(clean);
    // Editing invalidates the answer on screen — don't leave a stale verdict
    // sitting under a code it no longer refers to.
    if (result) setResult(null);
    if (clean.length === CODE_LENGTH) void submit(clean);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submit(code);
  };

  return (
    <>
      <form onSubmit={onSubmit} className="mb-10">
        <label htmlFor="certificate-id" className="block text-[14px] text-brown-800 mb-4">
          Certificate ID
        </label>

        {/* Clicking anywhere on the row lands in the one real field. */}
        <div className="relative" onClick={() => input.current?.focus()}>
          <input
            id="certificate-id"
            ref={input}
            value={code}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            inputMode="text"
            autoComplete="one-time-code"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            maxLength={CODE_LENGTH}
            autoFocus={initial.length !== CODE_LENGTH}
            aria-label={`Certificate ID, ${CODE_LENGTH} characters`}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          <div className="grid grid-cols-6 gap-3 pointer-events-none">
            {Array.from({ length: CODE_LENGTH }, (_, i) => {
              const char = code[i] ?? '';
              // The cell the next keystroke lands in gets the orange edge, so
              // there is still a visible caret without a real focus ring.
              const active = focused && (i === code.length || (code.length === CODE_LENGTH && i === CODE_LENGTH - 1));
              return (
                <div
                  key={i}
                  className={`aspect-square w-full flex items-center justify-center
                              text-[24px] md:text-[30px] text-brown-800 transition-colors
                              ${char ? 'bg-cream-300 border-2' : 'bg-transparent border-2 border-dashed'}
                              ${active
                                ? 'border-orange-500 outline outline-2 outline-offset-2 outline-orange-500'
                                : 'border-cream-500'}`}
                >
                  {char}
                </div>
              );
            })}
          </div>
        </div>

        <button
          type="submit"
          disabled={!complete || checking}
          className="mt-6 bg-orange-500 hover:bg-orange-400 text-cream-100 px-8 py-2.5 text-sm
                     transition-colors cursor-pointer
                     disabled:bg-cream-300 disabled:text-brown-800/40 disabled:cursor-not-allowed"
        >
          {checking ? 'Checking' : 'Verify'}
        </button>
      </form>

      {result?.state === 'valid' && (
        <BracketFrame label="Issued to">
          <p className="text-[26px] md:text-[32px] text-brown-800 leading-tight">
            {result.name}
          </p>
          <p className="mt-3 text-[14px] text-brown-800/60">
            {result.code}
            {formatIssued(result.issuedAt) && <> &middot; {formatIssued(result.issuedAt)}</>}
          </p>
        </BracketFrame>
      )}

      {result?.state === 'invalid' && (
        <BracketFrame label="No match">
          <p className="text-[14px] md:text-[18px] leading-snug text-brown-800">
            No certificate was issued under <strong>{result.code}</strong>.
          </p>
        </BracketFrame>
      )}

      {result?.state === 'error' && (
        <BracketFrame label="Unavailable">
          <p className="text-[14px] md:text-[18px] leading-snug text-brown-800">{result.message}</p>
        </BracketFrame>
      )}
    </>
  );
}

export default function CertificateVerificationPage() {
  return (
    <div className="min-h-screen bg-[linear-gradient(#DAD2BF99,#DAD2BF99),url(/noise-smooth.png)] font-sans relative overflow-hidden">
      <div className="pl-3 pr-6 py-2 flex items-center justify-between border-b border-cream-400">
        <Link href="/" className="hover:opacity-80 transition-opacity">
          <Image src="/stasis-logo.svg" alt="Stasis" width={120} height={40} className="h-10 w-auto" />
        </Link>
        <Link href="/dashboard" className="text-orange-500 hover:text-orange-400 text-sm">
          Dashboard &rarr;
        </Link>
      </div>

      <main className="max-w-2xl mx-auto px-6 py-16">
        <h1 className="text-[24px] md:text-[30px] text-brown-800 leading-tight">
          Stasis certificate verification
        </h1>

        <p className="mt-4 mb-10 text-[14px] md:text-[18px] leading-snug text-brown-800/70">
          Enter the ID printed on a Stasis certificate to check that it is genuine and see who it
          was issued to.
        </p>

        <Suspense fallback={null}>
          <Verifier />
        </Suspense>
      </main>

      <PlatformNoiseOverlay />
    </div>
  );
}
