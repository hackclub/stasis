'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import type { TimelineItem } from '@/app/api/projects/[id]/timeline/route';
import { getTierById } from '@/lib/tiers';

const MDPreview = dynamic(
  () => import('@uiw/react-md-editor').then((mod) => mod.default.Markdown),
  { ssr: false }
);

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffDay > 30) {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }
  if (diffDay > 0) return `${diffDay}d ago`;
  if (diffHour > 0) return `${diffHour}h ago`;
  if (diffMin > 0) return `${diffMin}m ago`;
  return 'just now';
}

function UserAvatar({ name, image }: { name: string | null; image: string | null }) {
  if (image) {
    return (
      <img 
        src={image} 
        alt="" 
        className="w-6 h-6 rounded-full flex-shrink-0"
      />
    );
  }
  return (
    <div className="w-6 h-6 rounded-full bg-cream-400 flex items-center justify-center flex-shrink-0">
      <span className="text-brown-800 text-xs">
        {name?.[0]?.toUpperCase() || '?'}
      </span>
    </div>
  );
}

function TimelineIcon({ type, decision }: { type: TimelineItem['type']; decision?: string }) {
  const baseClass = "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0";
  
  switch (type) {
    case 'PROJECT_CREATED':
      return (
        <div className={`${baseClass} bg-orange-500/20 border border-orange-500`}>
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-orange-400">
            <path d="M12 5v14M5 12h14"/>
          </svg>
        </div>
      );
    case 'WORK_SESSION':
      return (
        <div className={`${baseClass} bg-blue-500/20 border border-blue-500`}>
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-600">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
          </svg>
        </div>
      );
    case 'SUBMISSION':
      return (
        <div className={`${baseClass} bg-yellow-500/20 border border-yellow-500`}>
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-yellow-500">
            <polyline points="9 11 12 14 22 4"/>
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
          </svg>
        </div>
      );
    case 'REVIEW_ACTION':
      if (decision === 'APPROVED') {
        return (
          <div className={`${baseClass} bg-green-500/20 border border-green-500`}>
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-green-600">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
        );
      }
      return (
        <div className={`${baseClass} bg-yellow-500/20 border border-yellow-500`}>
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-yellow-600">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
      );
    default:
      return null;
  }
}

export function Timeline({ items, projectId }: Readonly<{ items: TimelineItem[]; projectId: string }>) {
  if (items.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-cream-600">No activity yet</p>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="absolute left-4 top-0 bottom-0 w-px bg-cream-400" />
      
      <div className="space-y-4">
        {items.map((item, idx) => (
          <div key={`${item.type}-${item.at}-${idx}`} className="relative pl-12">
            <div className="absolute left-0 top-0">
              <TimelineIcon 
                type={item.type} 
                decision={item.type === 'REVIEW_ACTION' ? item.decision : undefined} 
              />
            </div>
            
            {item.type === 'PROJECT_CREATED' && (
              <div className="bg-cream-100 border border-cream-400 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <UserAvatar name={item.user.name} image={item.user.image} />
                    <span className="text-brown-800 text-sm font-medium">{item.user.name || 'User'}</span>
                    <span className="text-cream-600 text-sm">started this project</span>
                  </div>
                  <span className="text-cream-600 text-xs">{formatRelativeTime(item.at)}</span>
                </div>
              </div>
            )}
            
            {item.type === 'WORK_SESSION' && (
              <div className="bg-cream-100 border border-cream-400 p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <UserAvatar name={item.user.name} image={item.user.image} />
                    <span className="text-brown-800 text-sm font-medium">{item.user.name || 'User'}</span>
                    <span className="text-cream-600 text-sm">added to the journal</span>
                    <span className={`px-2 py-0.5 text-xs uppercase ${
                      item.session.stage === "DESIGN" 
                        ? 'bg-purple-100 border border-yellow-500 text-purple-700' 
                        : 'bg-blue-100 border border-blue-500 text-blue-700'
                    }`}>
                      {item.session.stage}
                    </span>
                    <span className="text-brown-800 text-sm">
                      {item.session.hoursApproved !== null 
                        ? `${item.session.hoursApproved}/${item.session.hoursClaimed}h approved`
                        : `${item.session.hoursClaimed}h claimed`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {item.session.hoursApproved === null && (
                      <Link
                        href={`/dashboard/projects/${projectId}/session/${item.session.id}/edit`}
                        className="text-cream-500 hover:text-orange-500 transition-colors"
                        title="Edit journal entry"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </Link>
                    )}
                    <span className="text-cream-600 text-xs">{formatRelativeTime(item.at)}</span>
                  </div>
                </div>
                <div className="wmde-markdown-var [&_.wmde-markdown]:!bg-transparent [&_.wmde-markdown]:!text-brown-800 [&_.wmde-markdown]:!text-sm [&_.wmde-markdown]:!font-[inherit] [&_.wmde-markdown_img]:max-h-64 [&_.wmde-markdown_img]:border [&_.wmde-markdown_img]:border-cream-400 [&_.wmde-markdown_img]:my-2 [&_.wmde-markdown_p]:my-1 [&_.wmde-markdown_h1]:!text-xl [&_.wmde-markdown_h1]:!font-bold [&_.wmde-markdown_h1]:!text-brown-800 [&_.wmde-markdown_h1]:!mb-2" data-color-mode="light">
                  <MDPreview source={`# ${item.session.title}\n\n${item.session.content || ''}`} />
                </div>
                {(() => {
                  const extraMedia = item.session.media.filter(m => !item.session.content?.includes(m.url));
                  if (extraMedia.length === 0) return null;
                  return (
                    <div className="flex flex-col gap-2 mt-3">
                      {extraMedia.filter(m => m.type === "IMAGE").map((m) => (
                        <a key={m.id} href={m.url} target="_blank" rel="noopener noreferrer">
                          <img
                            src={m.url}
                            alt="Session media"
                            className="max-w-full max-h-64 border border-cream-400 hover:border-orange-500 transition-colors"
                          />
                        </a>
                      ))}
                      {extraMedia.filter(m => m.type === "VIDEO").map((m) => (
                        <video key={m.id} src={m.url} controls className="max-w-full max-h-64 border border-cream-400" />
                      ))}
                    </div>
                  );
                })()}
                {item.session.timelapses && item.session.timelapses.length > 0 && (
                  <div className="mt-3">
                    <p className="text-cream-500 text-xs uppercase mb-2">Lapse Timelapses</p>
                    <div className="flex flex-wrap gap-2">
                      {item.session.timelapses.map((t) => (
                        <a
                          key={t.timelapseId}
                          href={`https://lapse.hackclub.com/timelapse/${t.timelapseId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block hover:opacity-80 transition-opacity"
                        >
                          {t.thumbnailUrl ? (
                            <img
                              src={t.thumbnailUrl}
                              alt={t.name ?? 'Timelapse'}
                              className="w-24 h-16 rounded object-cover border border-cream-400"
                            />
                          ) : (
                            <div className="w-24 h-16 rounded bg-cream-300 border border-cream-400 flex items-center justify-center">
                              <span className="text-cream-600 text-xs">Timelapse</span>
                            </div>
                          )}
                          {t.name && <p className="text-xs text-cream-600 mt-1 w-24 truncate">{t.name}</p>}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {item.type === 'SUBMISSION' && (
              <div className="bg-cream-100 border border-yellow-500/50 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <UserAvatar name={item.user.name} image={item.user.image} />
                    <span className="text-brown-800 text-sm font-medium">{item.user.name || 'User'}</span>
                    <span className="text-yellow-500 text-sm">
                      submitted {item.stage.toLowerCase()} for review
                    </span>
                  </div>
                  <span className="text-cream-600 text-xs">{formatRelativeTime(item.at)}</span>
                </div>
                {item.notes && (
                  <div className="mt-2 wmde-markdown-var [&_.wmde-markdown]:!bg-transparent [&_.wmde-markdown]:!text-brown-800 [&_.wmde-markdown]:!text-sm [&_.wmde-markdown]:!font-[inherit] [&_.wmde-markdown_img]:max-h-64 [&_.wmde-markdown_img]:border [&_.wmde-markdown_img]:border-cream-400" data-color-mode="light">
                    <MDPreview source={item.notes} />
                  </div>
                )}
              </div>
            )}
            
            {item.type === 'REVIEW_ACTION' && (
              <div className={`bg-cream-100 border p-4 ${
                item.decision === 'APPROVED' 
                  ? 'border-green-600/50' 
                  : 'border-yellow-600/50'
              }`}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <UserAvatar name={item.reviewerName} image={item.reviewerImage} />
                    <span className="text-brown-800 text-sm font-medium">{item.reviewerName || 'Reviewer'}</span>
                    <span className={`text-sm ${
                      item.decision === 'APPROVED' ? 'text-green-600' : 'text-yellow-600'
                    }`}>
                      {item.decision === 'APPROVED' 
                        ? `approved ${item.stage.toLowerCase()}` 
                        : `requested changes for ${item.stage.toLowerCase()}`}
                    </span>
                  </div>
                  <span className="text-cream-600 text-xs">{formatRelativeTime(item.at)}</span>
                </div>
                {item.grantAmount !== null && (
                  <p className="text-green-600 text-sm font-medium">
                    Grant approved: ${item.grantAmount.toFixed(2)}
                  </p>
                )}
                {item.tier !== null && item.tierBefore !== null && item.tier !== item.tierBefore && (() => {
                  const oldTier = getTierById(item.tierBefore!);
                  const newTier = getTierById(item.tier!);
                  return oldTier && newTier ? (
                    <p className="text-orange-600 text-sm font-bold">
                      Tier changed: {oldTier.name} ({oldTier.bits} bits) &rarr; {newTier.name} ({newTier.bits} bits)
                    </p>
                  ) : null;
                })()}
                {item.tier !== null && (item.tierBefore === null || item.tier === item.tierBefore) && (() => {
                  const tierInfo = getTierById(item.tier!);
                  return tierInfo ? (
                    <p className="text-brown-800 text-sm">
                      Tier: {tierInfo.name} ({tierInfo.bits} bits)
                    </p>
                  ) : null;
                })()}
                {item.comments && (
                  <div className="mt-2 wmde-markdown-var [&_.wmde-markdown]:!bg-transparent [&_.wmde-markdown]:!text-brown-800 [&_.wmde-markdown]:!text-sm [&_.wmde-markdown]:!font-[inherit] [&_.wmde-markdown_img]:max-h-64 [&_.wmde-markdown_img]:border [&_.wmde-markdown_img]:border-cream-400" data-color-mode="light">
                    <MDPreview source={item.comments} />
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
