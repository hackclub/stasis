'use client';

import { useState, useEffect, use } from 'react';
import { useSession } from "@/lib/auth-client";
import Link from 'next/link';
import Image from 'next/image';
import type { ProjectTag, BadgeType } from "@/app/generated/prisma/enums";
import { getBadgeImage } from "@/lib/badges";
import { TAG_LABELS } from "@/lib/tags";

interface ProfileProject {
  id: string;
  title: string;
  description: string | null;
  coverImage: string | null;
  tags: ProjectTag[];
  designStatus: string;
  buildStatus: string;
}

interface ProfileData {
  user: {
    id: string;
    name: string | null;
    image: string | null;
    bio: string | null;
    createdAt: string;
  };
  xp: { totalXP: number };
  bitsBalance: number;
  badges: { badge: BadgeType; grantedAt: string }[];
  projects: ProfileProject[];
}

const BADGE_LABELS: Record<string, string> = {
  I2C: "I2C", SPI: "SPI", WIFI: "WiFi", BLUETOOTH: "Bluetooth",
  OTHER_RF: "Other RF", ANALOG_SENSORS: "Analog Sensors",
  DIGITAL_SENSORS: "Digital Sensors", CAD: "CAD", DISPLAYS: "Displays",
  MOTORS: "Motors", CAMERAS: "Cameras", METAL_MACHINING: "Metal Machining",
  WOOD_FASTENERS: "Wood & Fasteners", MACHINE_LEARNING: "Machine Learning",
  MCU_INTEGRATION: "MCU Integration", FOUR_LAYER_PCB: "4-Layer PCB",
  SOLDERING: "Soldering",
};


const PRIZES = [
  { name: 'Sticker', xpRequired: 50 },
  { name: 'Bandana', xpRequired: 150 },
  { name: 'T-Shirt', xpRequired: 300 },
  { name: 'Hoodie', xpRequired: 500 },
] as const;



export default function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: session } = useSession();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingBio, setEditingBio] = useState(false);
  const [bioValue, setBioValue] = useState('');
  const [bioSaving, setBioSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function fetchProfile() {
      try {
        const res = await fetch(`/api/profile/${id}`);
        if (res.ok) {
          const data = await res.json();
          setProfile(data);
          setBioValue(data.user.bio || '');
        }
      } catch (err) {
        console.error('Failed to fetch profile:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchProfile();
  }, [id]);

  const isOwnProfile = session?.user?.id === profile?.user?.id;

  const handleSaveBio = async () => {
    setBioSaving(true);
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bio: bioValue }),
      });
      if (res.ok) {
        setProfile((prev) => prev ? { ...prev, user: { ...prev.user, bio: bioValue } } : prev);
        setEditingBio(false);
      }
    } catch (err) {
      console.error('Failed to save bio:', err);
    } finally {
      setBioSaving(false);
    }
  };

  const handleShare = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <p className="text-brown-800">Loading profile...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="text-center py-12">
        <p className="text-brown-800">Profile not found</p>
        <Link href="/dashboard" className="text-orange-500 hover:text-orange-400 mt-2 inline-block">
          ← Back to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div>
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1 text-brown-800 hover:text-orange-500 text-sm mb-4 transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
        Back to Dashboard
      </Link>

      <div className="flex flex-col lg:flex-row gap-10">
        {/* Left sidebar - Avatar, Bio, XP */}
        <div className="lg:w-80 flex-shrink-0">
          <div className="bg-cream-100 border-2 border-cream-400 p-6">
            {/* Avatar */}
            <div className="flex justify-center mb-4">
              {profile.user.image ? (
                <Image src={profile.user.image} alt="" width={160} height={160} className="w-40 h-40 rounded-full" />
              ) : (
                <div className="w-40 h-40 rounded-full bg-cream-400 flex items-center justify-center">
                  <span className="text-brown-800 text-5xl">
                    {profile.user.name?.[0]?.toUpperCase() || '?'}
                  </span>
                </div>
              )}
            </div>

            <h1 className="text-orange-500 text-xl uppercase tracking-wide text-center mb-3 font-bold">
              {profile.user.name || 'Anonymous'}
            </h1>

            {/* Bio */}
            {editingBio ? (
              <div className="mb-4">
                <textarea
                  value={bioValue}
                  onChange={(e) => setBioValue(e.target.value.slice(0, 160))}
                  maxLength={160}
                  rows={3}
                  className="w-full bg-cream-200 border border-cream-400 text-brown-800 text-sm p-2 resize-none focus:outline-none focus:border-orange-500"
                />
                <div className="flex items-center justify-between mt-1">
                  <span className="text-cream-600 text-xs">{bioValue.length}/160</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setEditingBio(false); setBioValue(profile.user.bio || ''); }}
                      className="text-brown-800 hover:text-brown-800 px-3 py-1 text-xs uppercase tracking-wide transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveBio}
                      disabled={bioSaving}
                      className="bg-orange-500 hover:bg-orange-400 text-white px-4 py-1 text-xs uppercase tracking-wide transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {bioSaving ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              profile.user.bio && (
                <p className="text-brown-800 text-sm mb-4 text-center">{profile.user.bio}</p>
              )
            )}

            {/* XP */}
            {(() => {
              const xp = profile.xp.totalXP;
              const nextPrize = PRIZES.find(p => p.xpRequired > xp);
              const prevThreshold = PRIZES.filter(p => p.xpRequired <= xp).at(-1)?.xpRequired ?? 0;
              const nextThreshold = nextPrize?.xpRequired ?? PRIZES[PRIZES.length - 1].xpRequired;
              const progress = nextPrize
                ? ((xp - prevThreshold) / (nextThreshold - prevThreshold)) * 100
                : 100;

              return (
                <div className="mb-4">
                  <div className="flex items-baseline justify-center gap-2 mb-1">
                    <span className="text-orange-500 text-3xl font-bold">{xp.toLocaleString()}</span>
                    <span className="text-cream-600 text-sm uppercase tracking-wide">XP</span>
                  </div>
                  <div className="w-full h-3 bg-cream-300 border border-cream-400">
                    <div
                      className="h-full bg-orange-500 transition-all"
                      style={{ width: `${Math.min(progress, 100)}%` }}
                    />
                  </div>

                </div>
              );
            })()}

            {/* Bits */}
            <div className="mb-4 flex items-baseline justify-center gap-2">
              <span className="text-orange-500 text-3xl font-bold">{profile.bitsBalance.toLocaleString()}</span>
              <span className="text-cream-600 text-sm uppercase tracking-wide">Bits</span>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2">
              {isOwnProfile && !editingBio && (
                <button
                  onClick={() => setEditingBio(true)}
                  className="w-full bg-orange-500 hover:bg-orange-400 text-white px-4 py-2 text-sm uppercase tracking-wide transition-colors cursor-pointer"
                >
                  Edit Bio
                </button>
              )}
              <button
                onClick={handleShare}
                className="w-full bg-cream-200 hover:bg-cream-300 text-brown-800 px-4 py-2 text-sm uppercase tracking-wide transition-colors cursor-pointer border border-cream-400"
              >
                {copied ? 'Copied!' : 'Share'}
              </button>
            </div>
          </div>
        </div>

        {/* Right content - Badges & Projects */}
        <div className="flex-1 min-w-0 flex flex-col gap-12">
          {/* Badges */}
          <div className="bg-cream-100 border-2 border-cream-400 p-6">
            <h2 className="text-orange-500 text-2xl uppercase tracking-wide mb-4 font-bold">Badges</h2>
            {profile.badges.length > 0 ? (
              <div className="flex flex-wrap justify-center gap-4">
                {profile.badges.map((b) => (
                  <div key={b.badge} className="flex flex-col items-center gap-2 bg-cream-200 border-2 border-cream-400 p-3">
                    <img src={getBadgeImage(b.badge)} alt={BADGE_LABELS[b.badge] || b.badge} className="w-full max-w-[120px] aspect-square object-contain" />
                    <span className="text-sm uppercase tracking-wide text-orange-500 font-bold text-center">
                      {BADGE_LABELS[b.badge] || b.badge}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-cream-600 text-sm">No badges yet</p>
            )}
          </div>

          {/* Projects */}
          <div className="bg-cream-100 border-2 border-cream-400 p-6">
            <h2 className="text-orange-500 text-2xl uppercase tracking-wide mb-4 font-bold">Projects</h2>
            {profile.projects.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {profile.projects.map((project) => (
                  <Link
                    key={project.id}
                    href={`/dashboard/discover/${project.id}`}
                    className="block bg-cream-200 border border-cream-400 hover:border-orange-500 transition-colors"
                  >
                    {project.coverImage ? (
                      <div className="aspect-video overflow-hidden">
                        <img src={project.coverImage} alt="" className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="aspect-video bg-cream-300 flex items-center justify-center">
                        <span className="text-cream-600 text-xs uppercase">No cover</span>
                      </div>
                    )}
                    <div className="p-4">
                      <h3 className="text-orange-500 text-sm uppercase tracking-wide mb-2 font-bold">{project.title}</h3>
                      {project.description && (
                        <p className="text-brown-800 text-sm">{project.description}</p>
                      )}
                      {project.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-3">
                          {project.tags.map((tag) => (
                            <span key={tag} className="px-2 py-1 text-xs bg-cream-100 border border-cream-400 text-brown-800 uppercase">
                              {TAG_LABELS[tag] || tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-cream-600 text-sm">No projects yet</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
