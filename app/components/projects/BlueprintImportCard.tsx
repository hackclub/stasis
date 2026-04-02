'use client';

import { TIERS } from "@/lib/tiers"

interface BlueprintImportData {
  id: string
  blueprintProjectId: number
  blueprintTitle: string
  status: string
  rawData: {
    title: string
    description: string | null
    tier: number | null
    repoLink: string | null
    demoLink: string | null
    projectType: string | null
    ysws: string | null
    hoursLogged: number | null
    createdAt: string | null
    journalMarkdown: string | null
  }
}

interface Props {
  importData: BlueprintImportData
  onAccept: (importId: string) => void
  onDecline: (importId: string) => void
  accepting: boolean
  declining: boolean
}

export function BlueprintImportCard({ importData, onAccept, onDecline, accepting, declining }: Readonly<Props>) {
  const { rawData } = importData
  const tier = TIERS.find(t => t.id === rawData.tier)
  const busy = accepting || declining

  return (
    <div className="bg-cream-100 border-2 border-dashed border-orange-400 relative select-none w-full overflow-hidden">
      {/* Header */}
      <div className="aspect-video bg-gradient-to-br from-orange-100/40 to-orange-200/60 border-b border-cream-400 flex items-center justify-center relative">
        <div className="text-center px-4">
          <span className="text-orange-500 text-xs uppercase tracking-wide font-medium">From Blueprint</span>
        </div>
        <div className="absolute top-2 left-2 z-10">
          <span className="text-[10px] bg-orange-500 text-white font-medium px-1.5 py-0.5 uppercase">
            Blueprint Import
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="text-orange-500 font-bold text-lg font-mono uppercase tracking-wide truncate">
          {rawData.title}
        </h3>

        {tier && (
          <p className="text-brown-800 text-sm mt-1">
            {tier.name} ({tier.bits} bits)
          </p>
        )}

        {rawData.description && (
          <p className="text-cream-600 text-xs mt-2 line-clamp-2">
            {rawData.description}
          </p>
        )}

        {rawData.repoLink && (
          <p className="text-cream-600 text-xs mt-1 truncate">
            Repo: {rawData.repoLink}
          </p>
        )}

        {rawData.hoursLogged && (
          <p className="text-cream-600 text-xs mt-1">
            ~{rawData.hoursLogged}h logged on Blueprint
          </p>
        )}

        {rawData.journalMarkdown && (
          <p className="text-cream-600 text-xs mt-1">
            Includes journal entries
          </p>
        )}

        {/* Action buttons */}
        <div className="mt-3 pt-3 border-t border-cream-400 flex gap-2">
          <button
            onClick={() => onAccept(importData.id)}
            disabled={busy}
            className="flex-1 bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-3 py-1.5 text-xs uppercase tracking-wide transition-colors cursor-pointer"
          >
            {accepting ? "Importing..." : "Accept"}
          </button>
          <button
            onClick={() => onDecline(importData.id)}
            disabled={busy}
            className="flex-1 bg-cream-300 hover:bg-cream-400 disabled:opacity-40 disabled:cursor-not-allowed text-brown-800 px-3 py-1.5 text-xs uppercase tracking-wide transition-colors cursor-pointer"
          >
            {declining ? "Hiding..." : "Decline"}
          </button>
        </div>
      </div>
    </div>
  )
}
