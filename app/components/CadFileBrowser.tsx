'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import type { CadFilesPayload, CadFile, CadFileKind, KiCadProject, GerberGroup } from '@/lib/cad-discovery';
import { rawGitHubUrl } from '@/lib/cad-fetch';

const KiCanvasEmbed = dynamic(() => import('@/app/components/KiCanvasEmbed'), { ssr: false });
const ModelViewer = dynamic(() => import('@/app/components/cad-viewers/ModelViewer'), { ssr: false });
const StepViewer = dynamic(() => import('@/app/components/cad-viewers/StepViewer'), { ssr: false });
const GerberViewer = dynamic(() => import('@/app/components/cad-viewers/GerberViewer'), { ssr: false });
const EasyEdaViewer = dynamic(() => import('@/app/components/cad-viewers/EasyEdaViewer'), { ssr: false });

const KIND_META: Record<CadFileKind, { label: string; icon: string }> = {
  'kicad': { label: 'KiCad Projects', icon: '⌁' },
  '3d': { label: '3D Models', icon: '⬡' },
  '3d-source': { label: '3D Source', icon: '◇' },
  'pcb-source': { label: 'PCB Source', icon: '▦' },
  'pcb-fab': { label: 'Fabrication', icon: '▤' },
  'firmware': { label: 'Firmware', icon: '⟐' },
  'easyeda': { label: 'EasyEDA', icon: '◈' },
};

const KIND_ORDER: CadFileKind[] = ['kicad', 'easyeda', '3d', '3d-source', 'pcb-source', 'pcb-fab', 'firmware'];

const STEP_EXTS = new Set(['.step', '.stp']);
const VIEWABLE_3D = new Set(['.stl', '.obj', '.3mf', '.gltf', '.glb', '.ply']);

function formatSize(bytes: number): string {
  if (bytes === 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fName(path: string) { const s = path.lastIndexOf('/'); return s === -1 ? path : path.slice(s + 1); }
function fDir(path: string) { const s = path.lastIndexOf('/'); return s === -1 ? '' : path.slice(0, s); }

function KiCadSection({ projects, owner, repo, branch }: Readonly<{ projects: KiCadProject[]; owner: string; repo: string; branch: string }>) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  return (
    <div className="space-y-1">
      {projects.map((proj, idx) => {
        const isOpen = expanded.has(idx);
        const rawBase = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}`;
        const paths = [...(proj.projectFile ? [proj.projectFile] : []), ...proj.schematics, ...proj.boards];
        const sources = paths.map((p) => `${rawBase}/${p}`);
        const count = proj.schematics.length + proj.boards.length;
        return (
          <div key={`${proj.dir}/${proj.name}/${idx}`} className="border border-cream-500/10">
            <button onClick={() => setExpanded((prev) => { const n = new Set(prev); n.has(idx) ? n.delete(idx) : n.add(idx); return n; })}
              className="w-full flex items-center justify-between px-3 py-2 text-xs text-left hover:bg-brown-900/40 cursor-pointer">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-orange-500">{isOpen ? '▼' : '▶'}</span>
                <span className="text-cream-50 truncate">{proj.dir ? `${proj.dir}/` : ''}{proj.name}</span>
                <span className="text-cream-200">({proj.schematics.length} sch, {proj.boards.length} pcb{proj.projectFile ? ', project' : ''})</span>
              </div>
            </button>
            {isOpen && (
              <div className="p-2 border-t border-cream-500/10">
                <KiCanvasEmbed sources={sources} controls="full" height={560} />
                <p className="text-cream-200 text-[10px] mt-1">{count} file{count === 1 ? '' : 's'} · branch <span className="text-cream-50">{branch}</span></p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function GerberSection({ groups, owner, repo, branch }: Readonly<{ groups: GerberGroup[]; owner: string; repo: string; branch: string }>) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  return (
    <div className="space-y-1">
      {groups.map((group, idx) => {
        const isOpen = expanded.has(idx);
        const gerberFiles = group.files.map((p) => ({ name: fName(p), url: rawGitHubUrl(owner, repo, branch, p) }));
        return (
          <div key={group.dir || 'root'} className="border border-cream-500/10">
            <button onClick={() => setExpanded((prev) => { const n = new Set(prev); n.has(idx) ? n.delete(idx) : n.add(idx); return n; })}
              className="w-full flex items-center justify-between px-3 py-2 text-xs text-left hover:bg-brown-900/40 cursor-pointer">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-orange-500">{isOpen ? '▼' : '▶'}</span>
                <span className="text-cream-50 truncate">{group.dir || '(root)'}</span>
                <span className="text-cream-200">({group.files.length} file{group.files.length === 1 ? '' : 's'})</span>
              </div>
            </button>
            {isOpen && (
              <div className="border-t border-cream-500/10">
                <GerberViewer files={gerberFiles} height={480} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ViewableFileRow({ file, owner, repo, branch }: Readonly<{ file: CadFile; owner: string; repo: string; branch: string }>) {
  const [open, setOpen] = useState(false);
  const url = rawGitHubUrl(owner, repo, branch, file.path);
  const isStep = STEP_EXTS.has(file.extension);
  const is3d = VIEWABLE_3D.has(file.extension);
  const isEasyEda = file.kind === 'easyeda';
  const hasViewer = isStep || is3d || isEasyEda;

  return (
    <div>
      <div className={`flex items-center justify-between px-3 py-1.5 text-xs group ${hasViewer ? 'hover:bg-brown-900/40 cursor-pointer' : ''}`}
        onClick={hasViewer ? () => setOpen((v) => !v) : undefined}>
        <div className="flex items-center gap-2 min-w-0">
          {hasViewer && <span className="text-orange-500 text-[10px]">{open ? '▼' : '▶'}</span>}
          <span className="text-cream-50 truncate">{fName(file.path)}</span>
          {fDir(file.path) && <span className="text-cream-300 truncate">{fDir(file.path)}/</span>}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-cream-300">{formatSize(file.size)}</span>
          <a href={`https://github.com/${owner}/${repo}/blob/${branch}/${file.path}`}
            target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
            className="text-cream-300 hover:text-cream-50 underline opacity-0 group-hover:opacity-100 transition-opacity">
            view ↗
          </a>
        </div>
      </div>
      {open && hasViewer && (
        <div className="border-t border-cream-500/10">
          {isStep && <StepViewer url={url} height={480} />}
          {is3d && <ModelViewer url={url} extension={file.extension} height={480} />}
          {isEasyEda && <EasyEdaViewer url={url} fileName={fName(file.path)} fileType={`easyeda_${file.extension.slice(1)}`} height={480} />}
        </div>
      )}
    </div>
  );
}

function PlainFileRow({ file, owner, repo, branch }: Readonly<{ file: CadFile; owner: string; repo: string; branch: string }>) {
  return (
    <div className="flex items-center justify-between px-3 py-1.5 text-xs hover:bg-brown-900/40 group">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-cream-50 truncate">{fName(file.path)}</span>
        {fDir(file.path) && <span className="text-cream-300 truncate">{fDir(file.path)}/</span>}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className="text-cream-300">{formatSize(file.size)}</span>
        <a href={`https://github.com/${owner}/${repo}/blob/${branch}/${file.path}`}
          target="_blank" rel="noopener noreferrer"
          className="text-cream-300 hover:text-cream-50 underline opacity-0 group-hover:opacity-100 transition-opacity">
          view ↗
        </a>
      </div>
    </div>
  );
}

export default function CadFileBrowser({ cadData }: Readonly<{ cadData: CadFilesPayload | null }>) {
  const [collapsedKinds, setCollapsedKinds] = useState<Set<CadFileKind>>(new Set());

  if (!cadData || cadData.files.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-cream-200 text-xs px-4 text-center">
        No CAD files found in this repo
      </div>
    );
  }

  const grouped = new Map<CadFileKind, CadFile[]>();
  for (const file of cadData.files) {
    const existing = grouped.get(file.kind) ?? [];
    existing.push(file);
    grouped.set(file.kind, existing);
  }

  const toggleKind = (kind: CadFileKind) =>
    setCollapsedKinds((prev) => { const n = new Set(prev); n.has(kind) ? n.delete(kind) : n.add(kind); return n; });

  const gerberGroups = cadData.gerberGroups ?? [];

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-2 space-y-2">
        {KIND_ORDER.filter((k) => {
          if (k === 'kicad') return cadData.kicadProjects.length > 0;
          if (k === 'pcb-fab') return gerberGroups.length > 0 || grouped.has(k);
          return grouped.has(k);
        }).map((kind) => {
          const meta = KIND_META[kind];
          const files = grouped.get(kind) ?? [];
          const isCollapsed = collapsedKinds.has(kind);

          return (
            <div key={kind} className="border border-cream-500/10">
              <button onClick={() => toggleKind(kind)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-brown-900/40 cursor-pointer">
                <div className="flex items-center gap-2">
                  <span className="text-orange-500">{isCollapsed ? '▶' : '▼'}</span>
                  <span className="text-cream-300">{meta.icon}</span>
                  <span className="text-cream-50 uppercase tracking-wider">{meta.label}</span>
                </div>
                <span className="text-cream-300">
                  {kind === 'kicad' ? `${cadData.kicadProjects.length} project${cadData.kicadProjects.length === 1 ? '' : 's'}`
                    : kind === 'pcb-fab' ? `${gerberGroups.length} group${gerberGroups.length === 1 ? '' : 's'}`
                    : `${files.length} file${files.length === 1 ? '' : 's'}`}
                </span>
              </button>
              {!isCollapsed && (
                <div className="border-t border-cream-500/10">
                  {kind === 'kicad' ? (
                    <div className="p-2">
                      <KiCadSection projects={cadData.kicadProjects} owner={cadData.owner} repo={cadData.repo} branch={cadData.branch} />
                    </div>
                  ) : kind === 'pcb-fab' && gerberGroups.length > 0 ? (
                    <div className="p-2">
                      <GerberSection groups={gerberGroups} owner={cadData.owner} repo={cadData.repo} branch={cadData.branch} />
                    </div>
                  ) : (
                    files.map((f) => {
                      const hasViewer = VIEWABLE_3D.has(f.extension) || STEP_EXTS.has(f.extension) || f.kind === 'easyeda';
                      return hasViewer
                        ? <ViewableFileRow key={f.path} file={f} owner={cadData.owner} repo={cadData.repo} branch={cadData.branch} />
                        : <PlainFileRow key={f.path} file={f} owner={cadData.owner} repo={cadData.repo} branch={cadData.branch} />;
                    })
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
