'use client';

import { useState, useEffect, use } from 'react';
import { useSession } from "@/lib/auth-client";
import { useRouter } from 'next/navigation';
import { NoiseOverlay } from '@/app/components/NoiseOverlay';
import Link from 'next/link';

type SessionCategory = 
  | "FIRMWARE"
  | "DESIGN_PLANNING"
  | "PHYSICAL_BUILDING"
  | "SCHEMATIC"
  | "PCB_DESIGN"
  | "CADING"

interface MediaItem {
  type: "IMAGE" | "VIDEO"
  url: string
  file?: File
}

interface Project {
  id: string
  title: string
  githubRepo: string | null
}

const CATEGORIES: { value: SessionCategory; label: string }[] = [
  { value: "FIRMWARE", label: "Firmware" },
  { value: "DESIGN_PLANNING", label: "Design / Planning" },
  { value: "PHYSICAL_BUILDING", label: "Physical Building" },
  { value: "SCHEMATIC", label: "Schematic" },
  { value: "PCB_DESIGN", label: "PCB Design" },
  { value: "CADING", label: "CADing" },
]

export default function NewSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);
  const { data: session, isPending } = useSession();
  const router = useRouter();
  
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [hours, setHours] = useState<string>('');
  const [content, setContent] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<SessionCategory[]>([]);
  const [media, setMedia] = useState<MediaItem[]>([]);

  useEffect(() => {
    async function fetchProject() {
      try {
        const res = await fetch(`/api/projects/${projectId}`);
        if (res.ok) {
          const data = await res.json();
          setProject(data);
        } else if (res.status === 404) {
          router.push('/dashboard');
        }
      } catch (err) {
        console.error('Failed to fetch project:', err);
      } finally {
        setLoading(false);
      }
    }

    if (session) {
      fetchProject();
    } else if (!isPending) {
      router.push('/dashboard');
    }
  }, [session, isPending, projectId, router]);

  const hoursNum = parseFloat(hours) || 0;
  const requiredVideos = Math.floor(hoursNum / 4);
  const imageCount = media.filter(m => m.type === "IMAGE").length;
  const videoCount = media.filter(m => m.type === "VIDEO").length;

  const handleCategoryToggle = (cat: SessionCategory) => {
    setSelectedCategories(prev =>
      prev.includes(cat)
        ? prev.filter(c => c !== cat)
        : [...prev, cat]
    );
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: "IMAGE" | "VIDEO") => {
    const files = e.target.files;
    if (!files) return;

    for (const file of Array.from(files)) {
      // TODO: Upload to actual file storage (S3, Cloudflare R2, etc.)
      // For now, create a local object URL as placeholder
      const url = URL.createObjectURL(file);
      setMedia(prev => [...prev, { type, url, file }]);
    }
    
    e.target.value = '';
  };

  const removeMedia = (index: number) => {
    setMedia(prev => {
      const item = prev[index];
      if (item.url.startsWith('blob:')) {
        URL.revokeObjectURL(item.url);
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (hoursNum <= 0 || hoursNum > 24) {
      setError('Hours must be between 0 and 24');
      return;
    }

    if (!content.trim()) {
      setError('Journal content is required');
      return;
    }

    if (selectedCategories.length === 0) {
      setError('Select at least one category');
      return;
    }

    if (imageCount === 0) {
      setError('At least one image is required');
      return;
    }

    if (requiredVideos > 0 && videoCount < requiredVideos) {
      setError(`Sessions over 4 hours require video clips. You need ${requiredVideos} video(s).`);
      return;
    }

    setSubmitting(true);

    try {
      // TODO: Upload files to storage and get real URLs
      // For now, using placeholder URLs
      const mediaWithUrls = media.map(m => ({
        type: m.type,
        url: m.url.startsWith('blob:') ? `https://placeholder.com/${Date.now()}` : m.url,
      }));

      const res = await fetch(`/api/projects/${projectId}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hoursClaimed: hoursNum,
          content: content.trim(),
          categories: selectedCategories,
          media: mediaWithUrls,
        }),
      });

      if (res.ok) {
        router.push('/dashboard');
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to create session');
      }
    } catch (err) {
      console.error('Failed to create session:', err);
      setError('Failed to create session');
    } finally {
      setSubmitting(false);
    }
  };

  if (isPending || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream-950 font-mono">
        <p className="text-cream-500">Loading...</p>
      </div>
    );
  }

  if (!project) {
    return null;
  }

  return (
    <>
      <div className="min-h-screen bg-cream-950 font-mono">
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-cream-800">
          <Link href="/dashboard" className="text-cream-500 hover:text-brand-500 transition-colors flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            Back to Dashboard
          </Link>
        </div>

        <div className="max-w-3xl mx-auto px-4 py-8">
          <div className="mb-6">
            <h1 className="text-brand-500 text-2xl uppercase tracking-wide">New Journal Entry</h1>
            <p className="text-cream-500 text-sm mt-1">Project: {project.title}</p>
          </div>

          {error && (
            <div className="mb-6 bg-red-600/20 border-2 border-red-600/50 p-4">
              <p className="text-red-500">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Hours */}
            <div className="bg-cream-900 border-2 border-cream-600 p-4">
              <label className="block text-cream-500 text-sm uppercase mb-2">
                Hours Spent This Session
              </label>
              <input
                type="number"
                step="0.5"
                min="0.5"
                max="24"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                className="w-full bg-cream-950 border-2 border-cream-600 text-cream-100 px-3 py-2 text-2xl focus:border-brand-500 focus:outline-none transition-colors"
                placeholder="0"
                required
              />
              {hoursNum > 4 && (
                <p className="text-brand-500 text-sm mt-2">
                  ⚠ Sessions over 4 hours require {requiredVideos} video clip{requiredVideos > 1 ? 's' : ''} (10-30 seconds each)
                </p>
              )}
            </div>

            {/* Categories */}
            <div className="bg-cream-900 border-2 border-cream-600 p-4">
              <label className="block text-cream-500 text-sm uppercase mb-3">
                Categories (select all that apply)
              </label>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.value}
                    type="button"
                    onClick={() => handleCategoryToggle(cat.value)}
                    className={`px-4 py-2 text-sm uppercase transition-colors cursor-pointer ${
                      selectedCategories.includes(cat.value)
                        ? 'bg-brand-500 text-brand-900'
                        : 'bg-cream-850 text-cream-500 hover:bg-cream-800'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Journal Content */}
            <div className="bg-cream-900 border-2 border-cream-600 p-4">
              <label className="block text-cream-500 text-sm uppercase mb-2">
                What Did You Work On?
              </label>
              <p className="text-cream-600 text-xs mb-3">
                Write in Markdown. This will be saved to your project&apos;s JOURNAL.md on GitHub.
              </p>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full bg-cream-950 border-2 border-cream-600 text-cream-100 px-3 py-2 focus:border-brand-500 focus:outline-none transition-colors resize-none font-mono text-sm"
                placeholder="Describe what you accomplished this session..."
                rows={12}
                required
              />
            </div>

            {/* Images */}
            <div className="bg-cream-900 border-2 border-cream-600 p-4">
              <label className="block text-cream-500 text-sm uppercase mb-2">
                Images <span className="text-red-500">*</span>
              </label>
              <p className="text-cream-600 text-xs mb-3">
                Upload photos of your progress. At least one image is required.
              </p>
              
              <div className="flex flex-wrap gap-3 mb-3">
                {media.filter(m => m.type === "IMAGE").map((item, index) => {
                  const actualIndex = media.findIndex(m => m === item);
                  return (
                    <div key={index} className="relative w-24 h-24 bg-cream-950 border border-cream-800">
                      <img src={item.url} alt="" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeMedia(actualIndex)}
                        className="absolute -top-2 -right-2 w-6 h-6 bg-red-600 text-white flex items-center justify-center cursor-pointer"
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>

              <label className="inline-block bg-cream-850 hover:bg-cream-800 text-cream-100 px-4 py-2 text-sm uppercase cursor-pointer transition-colors">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => handleFileUpload(e, "IMAGE")}
                  className="hidden"
                />
                + Add Images
              </label>
              
              {imageCount === 0 && (
                <p className="text-red-500 text-xs mt-2">At least one image is required</p>
              )}
            </div>

            {/* Videos (conditional) */}
            {requiredVideos > 0 && (
              <div className="bg-cream-900 border-2 border-cream-600 p-4">
                <label className="block text-cream-500 text-sm uppercase mb-2">
                  Video Clips <span className="text-red-500">*</span>
                </label>
                <p className="text-cream-600 text-xs mb-3">
                  Record a 10-30 second video explaining what you did. 
                  You need {requiredVideos} video{requiredVideos > 1 ? 's' : ''} for this session length.
                </p>
                
                <div className="flex flex-wrap gap-3 mb-3">
                  {media.filter(m => m.type === "VIDEO").map((item, index) => {
                    const actualIndex = media.findIndex(m => m === item);
                    return (
                      <div key={index} className="relative w-32 h-24 bg-cream-950 border border-cream-800">
                        <video src={item.url} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => removeMedia(actualIndex)}
                          className="absolute -top-2 -right-2 w-6 h-6 bg-red-600 text-white flex items-center justify-center cursor-pointer"
                        >
                          ×
                        </button>
                        <div className="absolute bottom-1 left-1 bg-cream-950/80 px-1 text-xs text-cream-500">
                          Video
                        </div>
                      </div>
                    );
                  })}
                </div>

                <label className="inline-block bg-cream-850 hover:bg-cream-800 text-cream-100 px-4 py-2 text-sm uppercase cursor-pointer transition-colors">
                  <input
                    type="file"
                    accept="video/*"
                    multiple
                    onChange={(e) => handleFileUpload(e, "VIDEO")}
                    className="hidden"
                  />
                  + Add Video
                </label>
                
                {videoCount < requiredVideos && (
                  <p className="text-red-500 text-xs mt-2">
                    {videoCount}/{requiredVideos} videos uploaded
                  </p>
                )}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-brand-500 hover:bg-brand-400 disabled:bg-cream-600 disabled:cursor-not-allowed text-brand-900 py-4 text-lg uppercase tracking-wider transition-colors cursor-pointer"
            >
              {submitting ? 'Saving...' : 'Save Journal Entry'}
            </button>
          </form>
        </div>
      </div>
      <NoiseOverlay />
    </>
  );
}
