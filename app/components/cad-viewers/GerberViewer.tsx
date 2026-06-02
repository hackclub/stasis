'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import DOMPurify from 'isomorphic-dompurify';
import { fetchCadFileContent } from '@/lib/cad-fetch';

const GERBER_EXTENSIONS = /\.(gbr|ger|gtl|gbl|gts|gbs|gto|gbo|gtp|gbp|gm1|gm2|gko|drl|xln)$/i;

async function extractZipTextEntries(buffer: ArrayBuffer): Promise<{ name: string; text: string }[]> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const entries: { name: string; text: string }[] = [];
  let eocdOffset = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocdOffset = i; break; }
  }
  if (eocdOffset < 0) return entries;
  const entryCount = view.getUint16(eocdOffset + 10, true);
  let cursor = view.getUint32(eocdOffset + 16, true);
  for (let i = 0; i < entryCount; i++) {
    if (cursor + 46 > bytes.length || view.getUint32(cursor, true) !== 0x02014b50) break;
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const filenameLen = view.getUint16(cursor + 28, true);
    const extraLen = view.getUint16(cursor + 30, true);
    const commentLen = view.getUint16(cursor + 32, true);
    const localHeaderOffset = view.getUint32(cursor + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(cursor + 46, cursor + 46 + filenameLen));
    cursor = cursor + 46 + filenameLen + extraLen + commentLen;
    if (name.endsWith('/') || !GERBER_EXTENSIONS.test(name)) continue;
    if (localHeaderOffset + 30 > bytes.length) continue;
    const localFilenameLen = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
    const dataOffset = localHeaderOffset + 30 + localFilenameLen + localExtraLen;
    const raw = bytes.subarray(dataOffset, dataOffset + compressedSize);
    let data: Uint8Array;
    if (method === 0) { data = raw; }
    else if (method === 8) {
      try {
        const stream = new Blob([raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength)])
          .stream().pipeThrough(new DecompressionStream('deflate-raw'));
        data = new Uint8Array(await new Response(stream).arrayBuffer());
      } catch { continue; }
    } else { continue; }
    entries.push({ name: name.split('/').pop()!, text: new TextDecoder().decode(data) });
  }
  return entries;
}

interface LayerInfo { type: string | null; side: string | null }

interface HastNode {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
  value?: string;
}

interface GerberLayer {
  name: string;
  svg: string;
  info: LayerInfo | null;
  color: string;
  tone: string;
  visible: boolean;
}

type ViewBox = [number, number, number, number];

const COLOR_BY_TYPE: Record<string, string> = {
  copper: '#f39c12', mask: '#2ecc71', silkscreen: '#f2f2f2',
  paste: '#a6c8ff', drill: '#66d9ef', mechanical: '#ffd166', outline: '#ffd166',
};

function formatLayerInfo(info: LayerInfo): string {
  const side = info.side ? info.side.charAt(0).toUpperCase() + info.side.slice(1) : '';
  const type = info.type ? info.type.charAt(0).toUpperCase() + info.type.slice(1) : '';
  if (side && type) return `${side} ${type}`;
  return type || side || 'Unknown Layer';
}

function getTone(info: LayerInfo | null, name: string): string {
  const type = (info?.type ?? '').toLowerCase();
  if (type in COLOR_BY_TYPE) return type;
  const lower = name.toLowerCase();
  if (lower.includes('edge') || lower.includes('outline') || lower.includes('cuts')) return 'outline';
  if (lower.endsWith('.drl') || lower.endsWith('.xln')) return 'drill';
  return 'default';
}

function getColor(info: LayerInfo | null, name: string): string {
  const tone = getTone(info, name);
  return COLOR_BY_TYPE[tone] ?? '#9aa6c1';
}

function parseViewBox(svg: string): ViewBox | null {
  const m = svg.match(/\bviewBox="([^"]+)"/i);
  if (!m) return null;
  const parts = m[1].trim().split(/\s+/).map(Number);
  if (parts.length !== 4 || parts.some((v) => !Number.isFinite(v))) return null;
  return parts as ViewBox;
}

function mergeViewBoxes(vbs: ViewBox[]): ViewBox | null {
  if (!vbs.length) return null;
  let [minX, minY, maxX, maxY] = [vbs[0][0], vbs[0][1], vbs[0][0] + vbs[0][2], vbs[0][1] + vbs[0][3]];
  for (let i = 1; i < vbs.length; i++) {
    const [x, y, w, h] = vbs[i];
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h);
  }
  return [minX, minY, maxX - minX, maxY - minY];
}

function normalizeSvg(svg: string, color: string, merged: ViewBox | null): string {
  let s = svg.replace(/<rect\b[^>]*\bfill="black"[^>]*>\s*<\/rect>/gi, '');
  if (merged) {
    const vb = `${merged[0]} ${merged[1]} ${merged[2]} ${merged[3]}`;
    s = s.replace(/\bviewBox="[^"]*"/i, `viewBox="${vb}"`);
  }
  s = s.replace(/\bwidth="[^"]*"/i, 'width="100%"');
  s = s.replace(/\bheight="[^"]*"/i, 'height="100%"');
  if (!/\bpreserveAspectRatio="[^"]*"/i.test(s)) s = s.replace(/<svg\b/i, '<svg preserveAspectRatio="xMidYMid meet"');
  s = s.replace(/\bfill="(black|currentColor)"/gi, `fill="${color}"`);
  s = s.replace(/\bstroke="(black|currentColor)"/gi, `stroke="${color}"`);
  return s;
}

function escapeHtml(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function serializeHast(node: HastNode): string {
  if (node.type === 'text') return escapeHtml(node.value ?? '');
  if (node.type !== 'element' || !node.tagName) return '';
  const attrs = Object.entries(node.properties ?? {})
    .filter(([, v]) => v !== null && v !== undefined && v !== false)
    .map(([k, v]) => {
      const attr = k === 'className' ? 'class' : k;
      if (v === true) return attr;
      const val = Array.isArray(v) ? v.join(' ') : String(v);
      return `${attr}="${escapeHtml(val)}"`;
    }).join(' ');
  const children = (node.children ?? []).map(serializeHast).join('');
  return attrs ? `<${node.tagName} ${attrs}>${children}</${node.tagName}>` : `<${node.tagName}>${children}</${node.tagName}>`;
}

async function renderGerberToSvg(text: string, id: string): Promise<string> {
  const { createParser } = await import('@tracespace/parser');
  const { plot } = await import('@tracespace/plotter');
  const { render } = await import('@tracespace/renderer');
  const parser = createParser();
  parser.feed(text);
  const tree = parser.results();
  const imageTree = plot(tree as any);
  const svgTree = render(imageTree) as unknown as HastNode;
  if (!svgTree.properties) svgTree.properties = {};
  svgTree.properties.id = id.replace(/[^a-zA-Z0-9_-]/g, '_');
  return serializeHast(svgTree);
}

export default function GerberViewer({
  files,
  zipUrl,
  height,
}: Readonly<{ files?: { name: string; url: string }[]; zipUrl?: string; height?: number }>) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [layers, setLayers] = useState<GerberLayer[]>([]);

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    setLoading(true); setError(null); setLayers([]);

    (async () => {
      try {
        const whatsThatGerber = (await import('whats-that-gerber')).default;
        let filesToRender: { name: string; text: string }[] = [];

        if (zipUrl) {
          const buf = await fetchCadFileContent(zipUrl, ctrl.signal);
          if (cancelled) return;
          filesToRender = await extractZipTextEntries(buf);
          if (!filesToRender.length) throw new Error('No Gerber files found in ZIP');
        } else if (files) {
          for (const file of files) {
            if (cancelled) return;
            try {
              const buf = await fetchCadFileContent(file.url, ctrl.signal);
              filesToRender.push({ name: file.name, text: new TextDecoder().decode(buf) });
            } catch { /* skip */ }
          }
        }

        if (cancelled) return;
        if (!filesToRender.length) throw new Error('No Gerber files to render');

        const layerMap = whatsThatGerber(filesToRender.map((f) => f.name));
        const rendered: GerberLayer[] = [];
        const viewBoxes: ViewBox[] = [];

        for (const entry of filesToRender) {
          if (cancelled) return;
          try {
            const svg = await renderGerberToSvg(entry.text, entry.name);
            const info = (layerMap[entry.name] as LayerInfo | undefined) ?? null;
            const vb = parseViewBox(svg);
            if (vb) viewBoxes.push(vb);
            rendered.push({
              name: entry.name, svg, info,
              color: getColor(info, entry.name),
              tone: getTone(info, entry.name),
              visible: true,
            });
          } catch { /* skip unrenderable */ }
        }
        if (cancelled) return;
        if (!rendered.length) throw new Error('No Gerber layers could be rendered');

        const merged = mergeViewBoxes(viewBoxes);
        setLayers(rendered.map((l) => ({
          ...l,
          svg: DOMPurify.sanitize(normalizeSvg(l.svg, l.color, merged), { USE_PROFILES: { svg: true }, ADD_TAGS: ['svg'], ADD_ATTR: ['viewBox', 'preserveAspectRatio'] }),
        })));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to render');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; ctrl.abort(); };
  }, [files, zipUrl]);

  const toggleLayer = (i: number) =>
    setLayers((prev) => prev.map((l, idx) => (idx === i ? { ...l, visible: !l.visible } : l)));
  const setAll = (visible: boolean) => setLayers((prev) => prev.map((l) => ({ ...l, visible })));

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; startPan: { x: number; y: number } } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const factor = e.deltaY < 0 ? 1.15 : 0.87;
      const cx = rect.width / 2, cy = rect.height / 2;
      const mx = e.clientX - rect.left - cx, my = e.clientY - rect.top - cy;
      setZoom((z) => {
        const nz = Math.min(20, Math.max(0.1, z * factor));
        const r = 1 - nz / z;
        setPan((p) => ({ x: p.x + (mx - p.x) * r, y: p.y + (my - p.y) * r }));
        return nz;
      });
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [loading]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, startPan: { ...pan } };
  }, [pan]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    setPan({ x: dragRef.current.startPan.x + (e.clientX - dragRef.current.startX), y: dragRef.current.startPan.y + (e.clientY - dragRef.current.startY) });
  }, []);

  const onPointerUp = useCallback(() => { dragRef.current = null; }, []);

  const resetView = useCallback(() => { setZoom(1); setPan({ x: 0, y: 0 }); }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center text-cream-200 text-xs" style={height ? { height } : { height: '100%' }}>
        Rendering Gerber layers...
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex items-center justify-center text-red-400 text-xs p-4" style={height ? { height } : { height: '100%' }}>
        {error}
      </div>
    );
  }

  const visible = layers.filter((l) => l.visible);

  return (
    <div style={height ? { height } : { height: '100%' }} className="flex flex-col bg-brown-900 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-cream-200/10 shrink-0">
        <span className="text-cream-300 text-[10px] uppercase tracking-widest font-medium tabular-nums">
          {visible.length}/{layers.length} layers
        </span>
        <div className="flex gap-1">
          <button onClick={resetView} className="text-xs uppercase tracking-widest font-medium text-cream-300 hover:text-cream-50 px-2 py-0.5 cursor-pointer transition-[color,background-color,transform] duration-150 active:scale-[0.97] hover:bg-brown-700/40 focus-visible:ring-2 focus-visible:ring-orange-500/60 focus-visible:ring-inset">fit</button>
          <button onClick={() => setAll(true)} className="text-xs uppercase tracking-widest font-medium text-cream-300 hover:text-cream-50 px-2 py-0.5 cursor-pointer transition-[color,background-color,transform] duration-150 active:scale-[0.97] hover:bg-brown-700/40 focus-visible:ring-2 focus-visible:ring-orange-500/60 focus-visible:ring-inset">all</button>
          <button onClick={() => setAll(false)} className="text-xs uppercase tracking-widest font-medium text-cream-300 hover:text-cream-50 px-2 py-0.5 cursor-pointer transition-[color,background-color,transform] duration-150 active:scale-[0.97] hover:bg-brown-700/40 focus-visible:ring-2 focus-visible:ring-orange-500/60 focus-visible:ring-inset">none</button>
        </div>
      </div>
      <div className="flex flex-1 min-h-0">
        {layers.length > 1 && (
          <div className="w-32 shrink-0 border-r border-cream-200/10 overflow-y-auto py-1">
            {layers.map((l, i) => (
              <button
                key={l.name}
                onClick={() => toggleLayer(i)}
                className={`w-full flex items-center gap-1.5 px-2 py-1 text-[10px] text-left cursor-pointer hover:bg-brown-700/40 focus-visible:ring-2 focus-visible:ring-orange-500/60 focus-visible:ring-inset ${l.visible ? 'text-cream-50' : 'text-cream-400 line-through'}`}
              >
                <span aria-hidden="true" className="w-2 h-2 shrink-0" style={{ background: l.color, opacity: l.visible ? 1 : 0.3 }} />
                <span className="truncate">{l.info ? formatLayerInfo(l.info) : l.name}</span>
              </button>
            ))}
          </div>
        )}
        <div
          ref={canvasRef}
          className={`flex-1 relative bg-brown-950 overflow-hidden ${dragRef.current ? 'cursor-grabbing' : 'cursor-grab'}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div
            className="absolute inset-0"
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: 'center center' }}
          >
            {visible.map((l) => (
              <div
                key={l.name}
                className="absolute inset-0"
                style={{ opacity: l.tone === 'mask' ? 0.5 : 1 }}
                dangerouslySetInnerHTML={{ __html: l.svg }}
              />
            ))}
          </div>
          {!visible.length && (
            <div className="absolute inset-0 flex items-center justify-center text-cream-300 text-xs">
              No layers selected
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
