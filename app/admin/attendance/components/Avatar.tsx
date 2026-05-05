'use client';

import Image from 'next/image';

/**
 * Identity bubble. Falls back through:
 *   1. Provided image URL (Slack avatar pulled into User.image)
 *   2. Generated geometric initials with a deterministic background color
 */
export function Avatar({
  name,
  email,
  image,
  size = 32,
}: Readonly<{ name: string | null; email: string | null; image: string | null; size?: number }>) {
  const seed = (email ?? name ?? 'x').toLowerCase();
  const initials = deriveInitials(name, email);
  const bg = deriveColor(seed);

  if (image) {
    return (
      <Image
        src={image}
        alt={name ?? email ?? ''}
        width={size}
        height={size}
        unoptimized
        className="object-cover bg-brown-800"
      />
    );
  }

  return (
    <div
      style={{ width: size, height: size, backgroundColor: bg, fontSize: Math.round(size * 0.42) }}
      className="flex items-center justify-center text-brown-900 font-semibold uppercase tracking-tight"
    >
      {initials}
    </div>
  );
}

function deriveInitials(name: string | null, email: string | null): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2);
    return (parts[0][0] + parts[parts.length - 1][0]).slice(0, 2);
  }
  if (email) return email.slice(0, 2);
  return '??';
}

// Deterministic pick from a brand-aligned warm-monochrome palette.
function deriveColor(seed: string): string {
  const palette = ['#D5CCB7', '#EBE8E0', '#9C8F88', '#E1AB55', '#FC8A58', '#D5BCA0'];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return palette[Math.abs(h) % palette.length];
}
