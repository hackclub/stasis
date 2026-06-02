'use client';

import { useState, useCallback, useEffect, useRef, type KeyboardEvent } from 'react';
import dynamic from 'next/dynamic';
import type { CadFilesPayload, CadFile, CadFileKind, KiCadProject, GerberGroup } from '@/lib/cad-discovery';
import { rawGitHubUrl, fetchCadFileContent } from '@/lib/cad-fetch';

const KiCanvasEmbed = dynamic(() => import('@/app/components/KiCanvasEmbed'), { ssr: false });
const ModelViewer = dynamic(() => import('@/app/components/cad-viewers/ModelViewer'), { ssr: false });
const StepViewer = dynamic(() => import('@/app/components/cad-viewers/StepViewer'), { ssr: false });
const GerberViewer = dynamic(() => import('@/app/components/cad-viewers/GerberViewer'), { ssr: false });
const EasyEdaViewer = dynamic(() => import('@/app/components/cad-viewers/EasyEdaViewer'), { ssr: false });
const CodeViewer = dynamic(() => import('@/app/components/cad-viewers/CodeViewer'), { ssr: false });
const MDPreview = dynamic(() => import('@uiw/react-md-editor').then((mod) => mod.default.Markdown), { ssr: false });

const KIND_LABEL: Record<CadFileKind, string> = {
  'kicad': 'KICAD', 'easyeda': 'EDA', '3d': '3D', '3d-source': 'CAD',
  'pcb-source': 'PCB', 'pcb-fab': 'GBR', 'firmware': 'FW',
};
const KIND_COLOR: Record<CadFileKind, string> = {
  'kicad': 'text-green-400', 'easyeda': 'text-blue-400', '3d': 'text-orange-400',
  '3d-source': 'text-yellow-400', 'pcb-source': 'text-green-400', 'pcb-fab': 'text-cyan-400',
  'firmware': 'text-pink-300',
};
const KIND_ORDER: CadFileKind[] = ['kicad', 'easyeda', '3d', '3d-source', 'pcb-source', 'pcb-fab', 'firmware'];
const STEP_EXTS = new Set(['.step', '.stp']);
const VIEWABLE_3D = new Set(['.stl', '.obj', '.3mf', '.gltf', '.glb', '.ply']);
const CODE_EXTS = new Set(['.ino', '.c', '.cpp', '.h', '.py', '.rs', '.scad']);

type Selection =
  | { type: 'readme' }
  | { type: 'file'; file: CadFile }
  | { type: 'kicad'; project: KiCadProject; idx: number }
  | { type: 'gerber'; group: GerberGroup; idx: number };

function selKey(s: Selection): string {
  if (s.type === 'readme') return 'readme';
  if (s.type === 'file') return `file:${s.file.path}`;
  if (s.type === 'kicad') return `kicad:${s.idx}`;
  return `gerber:${s.idx}`;
}

const GERBER_ZIP_EXT = '.zip';

function isViewable(file: CadFile): boolean {
  return VIEWABLE_3D.has(file.extension) || STEP_EXTS.has(file.extension)
    || file.kind === 'easyeda' || CODE_EXTS.has(file.extension)
    || (file.kind === 'pcb-fab' && file.extension === GERBER_ZIP_EXT);
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fName(path: string) { const s = path.lastIndexOf('/'); return s === -1 ? path : path.slice(s + 1); }
function fDir(path: string) { const s = path.lastIndexOf('/'); return s === -1 ? '' : path.slice(0, s); }

function InventoryRow({
  label,
  sublabel,
  tag,
  tagColor,
  size,
  selected,
  viewable,
  onClick,
  githubUrl,
}: Readonly<{
  label: string;
  sublabel?: string;
  tag: string;
  tagColor?: string;
  size?: string;
  selected: boolean;
  viewable: boolean;
  onClick: () => void;
  githubUrl?: string;
}>) {
  const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } };
  return (
    <div
      role="button"
      tabIndex={0}
      aria-selected={selected}
      onClick={onClick}
      onKeyDown={onKeyDown}
      className={`flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer transition-[color,background-color] duration-150 focus-visible:ring-2 focus-visible:ring-orange-500/60 focus-visible:ring-inset outline outline-1 -outline-offset-1 outline-transparent group ${
        selected
          ? 'bg-orange-500/15 outline-orange-500/60 text-cream-50'
          : viewable
            ? 'hover:bg-orange-500/5 text-cream-100'
            : 'text-cream-300 hover:bg-orange-500/5'
      }`}
    >
      <span className={`text-[9px] font-medium tracking-widest uppercase shrink-0 w-8 text-center tabular-nums ${tagColor ?? 'text-cream-400'}`}>
        {tag}
      </span>
      <div className="flex-1 min-w-0 flex items-baseline gap-1.5">
        <span className="truncate">{label}</span>
        {sublabel && <span className="text-cream-400 text-[10px] truncate shrink-0">{sublabel}</span>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {size && <span className="text-cream-400 tabular-nums text-[10px]">{size}</span>}
        {githubUrl && (
          <a href={githubUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
            className="text-cream-400 hover:text-cream-50 text-[10px] underline opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity focus-visible:ring-2 focus-visible:ring-orange-500/60">
            ↗
          </a>
        )}
      </div>
    </div>
  );
}

function ActiveViewer({
  selection,
  cadData,
  onImageHover,
}: Readonly<{ selection: Selection; cadData: CadFilesPayload; onImageHover?: (url: string | null, e?: MouseEvent) => void }>) {
  const { owner, repo, branch } = cadData;

  if (selection.type === 'readme') {
    return <ReadmePane owner={owner} repo={repo} branch={branch} onImageHover={onImageHover} />;
  }

  if (selection.type === 'kicad') {
    const proj = selection.project;
    const rawBase = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}`;
    const paths = [...(proj.projectFile ? [proj.projectFile] : []), ...proj.schematics, ...proj.boards];
    const sources = paths.map((p) => `${rawBase}/${p}`);
    return (
      <div className="flex-1 flex flex-col min-h-0">
        <KiCanvasEmbed sources={sources} controls="full" />
      </div>
    );
  }

  if (selection.type === 'gerber') {
    const files = selection.group.files.map((p) => ({ name: fName(p), url: rawGitHubUrl(owner, repo, branch, p) }));
    return (
      <div className="flex-1 flex flex-col min-h-0">
        <GerberViewer files={files} />
      </div>
    );
  }

  const file = selection.file;
  const url = rawGitHubUrl(owner, repo, branch, file.path);

  if (STEP_EXTS.has(file.extension)) {
    return <div className="flex-1 min-h-0"><StepViewer url={url} /></div>;
  }
  if (VIEWABLE_3D.has(file.extension)) {
    return <div className="flex-1 min-h-0"><ModelViewer url={url} extension={file.extension} /></div>;
  }
  if (file.kind === 'easyeda') {
    return <div className="flex-1 min-h-0"><EasyEdaViewer url={url} fileName={fName(file.path)} fileType={`easyeda_${file.extension.slice(1)}`} /></div>;
  }
  if (CODE_EXTS.has(file.extension)) {
    return <div className="flex-1 min-h-0"><CodeViewer url={url} extension={file.extension} /></div>;
  }
  if (file.kind === 'pcb-fab' && file.extension === GERBER_ZIP_EXT) {
    return <div className="flex-1 flex flex-col min-h-0"><GerberViewer zipUrl={url} /></div>;
  }

  return (
    <div className="flex-1 flex items-center justify-center text-cream-300 text-xs">
      No preview available for {file.extension} files
    </div>
  );
}

function resolveReadmeUrls(md: string, owner: string, repo: string, branch: string): string {
  const rawBase = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}`;
  const ghBase = `https://github.com/${owner}/${repo}/blob/${branch}`;
  return md
    .replace(/([^\n])\n(!\[)/g, '$1\n\n$2')
    .replace(/(!\[.*?\]\(.*?\))\n([^\n])/g, '$1\n\n$2')
    .replace(/!\[([^\]]*)\]\((?!https?:\/\/)([^)]+)\)/g, `![$1](${rawBase}/$2)`)
    .replace(/\[([^\]]*)\]\((?!https?:\/\/)([^)]+)\)/g, `[$1](${ghBase}/$2)`);
}

function ReadmePane({ owner, repo, branch, onImageHover }: Readonly<{ owner: string; repo: string; branch: string; onImageHover?: (url: string | null, e?: MouseEvent) => void }>) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !onImageHover) return;
    const onOver = (e: MouseEvent) => {
      const img = (e.target as HTMLElement).closest('img') as HTMLImageElement | null;
      if (img?.src) onImageHover(img.src, e);
    };
    const onMove = (e: MouseEvent) => {
      const img = (e.target as HTMLElement).closest('img') as HTMLImageElement | null;
      if (img?.src) onImageHover(img.src, e);
    };
    const onOut = (e: MouseEvent) => {
      const related = e.relatedTarget as HTMLElement | null;
      if (!related?.closest('img')) onImageHover(null);
    };
    el.addEventListener('mouseover', onOver);
    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseout', onOut);
    return () => {
      el.removeEventListener('mouseover', onOver);
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseout', onOut);
    };
  }, [onImageHover]);
  const [md, setMd] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    setLoading(true); setMd(null);

    (async () => {
      try {
        const buf = await fetchCadFileContent(rawGitHubUrl(owner, repo, branch, 'README.md'), ctrl.signal);
        if (!cancelled) setMd(resolveReadmeUrls(new TextDecoder().decode(buf), owner, repo, branch));
      } catch {
        if (!cancelled) setMd(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; ctrl.abort(); };
  }, [owner, repo, branch]);

  if (loading) return <div className="flex-1 flex items-center justify-center text-cream-300 text-xs">Loading README...</div>;
  if (!md) return <div className="flex-1 flex items-center justify-center text-cream-400 text-xs">No README found</div>;

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto p-4 wmde-markdown-var [&_.wmde-markdown]:!bg-transparent [&_.wmde-markdown]:!text-cream-100 [&_.wmde-markdown]:!text-sm [&_.wmde-markdown]:!leading-relaxed [&_.wmde-markdown]:!font-[inherit] [&_.wmde-markdown_p]:my-1.5 [&_.wmde-markdown_pre]:!bg-brown-950 [&_.wmde-markdown_pre]:!border-cream-200/10 [&_.wmde-markdown_code]:!bg-brown-950 [&_.wmde-markdown_code]:!text-cream-200 [&_.wmde-markdown_img]:!max-w-full [&_.wmde-markdown_img]:!max-h-48 [&_.wmde-markdown_img]:!block [&_.wmde-markdown_img]:my-2 [&_.wmde-markdown_img]:cursor-zoom-in [&_.wmde-markdown_h1]:!text-cream-50 [&_.wmde-markdown_h2]:!text-cream-50 [&_.wmde-markdown_h3]:!text-cream-50 [&_.wmde-markdown_a]:!text-orange-400 [&_.wmde-markdown_a]:hover:!text-orange-300 [&_.wmde-markdown_hr]:!border-cream-200/10 [&_.wmde-markdown_table]:!border-cream-200/10 [&_.wmde-markdown_th]:!bg-brown-900 [&_.wmde-markdown_th]:!text-cream-50 [&_.wmde-markdown_th]:!border-cream-200/10 [&_.wmde-markdown_td]:!border-cream-200/10 [&_.wmde-markdown_td]:!text-cream-200 [&_.wmde-markdown_tr]:!bg-transparent [&_.wmde-markdown_tr]:even:!bg-brown-900/30 [&_.wmde-markdown_blockquote]:!border-cream-200/20 [&_.wmde-markdown_blockquote]:!text-cream-300 [&_.wmde-markdown_li]:!text-cream-100 [&_.wmde-markdown_strong]:!text-cream-50"
      data-color-mode="dark"
    >
      <MDPreview source={md} />
    </div>
  );
}

function viewerLabel(selection: Selection): string {
  if (selection.type === 'readme') return 'README.md';
  if (selection.type === 'kicad') return selection.project.name;
  if (selection.type === 'gerber') return selection.group.dir || 'root';
  return fName(selection.file.path);
}

function viewerTag(selection: Selection): string {
  if (selection.type === 'readme') return 'DOC';
  if (selection.type === 'kicad') return 'KICAD';
  if (selection.type === 'gerber') return 'GBR';
  return KIND_LABEL[selection.file.kind] ?? '';
}

function pickDefault(cadData: CadFilesPayload): Selection | null {
  if (cadData.kicadProjects.length > 0) {
    return { type: 'kicad', project: cadData.kicadProjects[0], idx: 0 };
  }
  const easyeda = cadData.files.filter((f) => f.kind === 'easyeda');
  if (easyeda.length > 0) {
    return { type: 'file', file: easyeda[0] };
  }
  const models = cadData.files
    .filter((f) => VIEWABLE_3D.has(f.extension) || STEP_EXTS.has(f.extension))
    .sort((a, b) => b.size - a.size);
  if (models.length > 0) {
    return { type: 'file', file: models[0] };
  }
  const gerberGroups = cadData.gerberGroups ?? [];
  if (gerberGroups.length > 0) {
    const best = gerberGroups.reduce((a, b) => b.files.length > a.files.length ? b : a);
    return { type: 'gerber', group: best, idx: gerberGroups.indexOf(best) };
  }
  const viewable = cadData.files.find((f) => isViewable(f));
  if (viewable) return { type: 'file', file: viewable };
  return null;
}

export default function FileBrowser({ cadData, focusKind, onFocusKindConsumed, onImageHover }: Readonly<{
  cadData: CadFilesPayload | null;
  focusKind?: CadFileKind | null;
  onFocusKindConsumed?: () => void;
  onImageHover?: (url: string | null, e?: MouseEvent) => void;
}>) {
  const [selection, setSelection] = useState<Selection | null>({ type: 'readme' });

  const select = useCallback((s: Selection) => {
    setSelection((prev) => prev && selKey(prev) === selKey(s) ? null : s);
  }, []);

  useEffect(() => {
    if (!focusKind || !cadData) return;
    const file = cadData.files.find((f) => f.kind === focusKind);
    if (file) {
      setSelection({ type: 'file', file });
    } else if (focusKind === 'pcb-fab' && cadData.gerberGroups?.length) {
      setSelection({ type: 'gerber', group: cadData.gerberGroups[0], idx: 0 });
    } else if ((focusKind === 'kicad' || focusKind === 'pcb-source') && cadData.kicadProjects.length) {
      setSelection({ type: 'kicad', project: cadData.kicadProjects[0], idx: 0 });
    }
    onFocusKindConsumed?.();
  }, [focusKind, cadData, onFocusKindConsumed]);

  if (!cadData || cadData.files.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-cream-300 text-xs px-4 text-center">
        No CAD files found
      </div>
    );
  }

  const { owner, repo, branch } = cadData;
  const gerberGroups = cadData.gerberGroups ?? [];

  const grouped = new Map<CadFileKind, CadFile[]>();
  const gerberZips: CadFile[] = [];
  for (const file of cadData.files) {
    if (file.kind === 'kicad') continue;
    if (file.kind === 'pcb-fab' && file.extension !== GERBER_ZIP_EXT) continue;
    if (file.kind === 'pcb-fab' && file.extension === GERBER_ZIP_EXT) { gerberZips.push(file); continue; }
    const existing = grouped.get(file.kind) ?? [];
    existing.push(file);
    grouped.set(file.kind, existing);
  }

  const activeKinds = KIND_ORDER.filter((k) => {
    if (k === 'kicad') return cadData.kicadProjects.length > 0;
    if (k === 'pcb-fab') return gerberGroups.length > 0 || gerberZips.length > 0;
    return grouped.has(k);
  });

  const currentKey = selection ? selKey(selection) : null;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* ── File inventory ── */}
      <div className={`shrink-0 overflow-y-auto ${selection ? 'max-h-[40%]' : ''}`}>
        <InventoryRow
          tag="DOC"
          tagColor="text-cream-200"
          label="README.md"
          selected={currentKey === 'readme'}
          viewable
          onClick={() => select({ type: 'readme' })}
          githubUrl={`https://github.com/${owner}/${repo}/blob/${branch}/README.md`}
        />
        {activeKinds.map((kind, ki) => (
          <div key={kind}>
            {ki === 0 && <div className="border-t border-cream-200/10" />}
            {ki > 0 && <div className="border-t border-cream-200/10" />}

            {kind === 'kicad' && cadData.kicadProjects.map((proj, idx) => (
              <InventoryRow
                key={`kicad-${idx}`}
                tag={KIND_LABEL.kicad}
                tagColor={KIND_COLOR.kicad}
                label={proj.name}
                sublabel={proj.dir ? proj.dir + '/' : undefined}
                size={`${proj.schematics.length}s ${proj.boards.length}b`}
                selected={currentKey === `kicad:${idx}`}
                viewable
                onClick={() => select({ type: 'kicad', project: proj, idx })}
                githubUrl={`https://github.com/${owner}/${repo}/tree/${branch}/${proj.dir || ''}`}
              />
            ))}

            {kind === 'pcb-fab' && (
              <>
                {gerberGroups.map((group, idx) => (
                  <InventoryRow
                    key={`gerber-${idx}`}
                    tag={KIND_LABEL['pcb-fab']}
                    tagColor={KIND_COLOR['pcb-fab']}
                    label={group.dir || '(root)'}
                    sublabel={`${group.files.length} layers`}
                    selected={currentKey === `gerber:${idx}`}
                    viewable
                    onClick={() => select({ type: 'gerber', group, idx })}
                    githubUrl={`https://github.com/${owner}/${repo}/tree/${branch}/${group.dir || ''}`}
                  />
                ))}
                {gerberZips.map((file) => (
                  <InventoryRow
                    key={file.path}
                    tag={KIND_LABEL['pcb-fab']}
                    tagColor={KIND_COLOR['pcb-fab']}
                    label={fName(file.path)}
                    sublabel={fDir(file.path) ? fDir(file.path) + '/' : undefined}
                    size={formatSize(file.size)}
                    selected={currentKey === `file:${file.path}`}
                    viewable
                    onClick={() => select({ type: 'file', file })}
                    githubUrl={`https://github.com/${owner}/${repo}/blob/${branch}/${file.path}`}
                  />
                ))}
              </>
            )}

            {kind !== 'kicad' && kind !== 'pcb-fab' && (grouped.get(kind) ?? []).map((file) => (
              <InventoryRow
                key={file.path}
                tag={KIND_LABEL[kind]}
                tagColor={KIND_COLOR[kind]}
                label={fName(file.path)}
                sublabel={fDir(file.path) ? fDir(file.path) + '/' : undefined}
                size={formatSize(file.size)}
                selected={currentKey === `file:${file.path}`}
                viewable={isViewable(file)}
                onClick={() => select({ type: 'file', file })}
                githubUrl={`https://github.com/${owner}/${repo}/blob/${branch}/${file.path}`}
              />
            ))}
          </div>
        ))}
      </div>

      {/* ── Viewer area ── */}
      {selection ? (
        <div className="flex-1 flex flex-col min-h-0 border-t border-cream-200/10">
          <div className="flex items-center justify-between px-3 py-1.5 bg-brown-900 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-orange-400 text-[9px] font-medium tracking-widest uppercase tabular-nums shrink-0">{viewerTag(selection)}</span>
              <span className="text-cream-50 text-[10px] font-medium truncate">{viewerLabel(selection)}</span>
            </div>
            <button
              onClick={() => setSelection(null)}
              className="text-xs uppercase tracking-widest font-medium text-cream-400 hover:text-cream-50 px-2 py-1 transition-[color,background-color,transform] duration-150 cursor-pointer active:scale-[0.97] hover:bg-brown-700/40 focus-visible:ring-2 focus-visible:ring-orange-500/60 focus-visible:ring-inset shrink-0 ml-2"
            >
              Close
            </button>
          </div>
          <ActiveViewer selection={selection} cadData={cadData} onImageHover={onImageHover} />
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-cream-400 text-xs border-t border-cream-200/10">
          Select a file to preview
        </div>
      )}
    </div>
  );
}
