'use client';

import { useEffect, useState } from 'react';
import { fetchCadFileContent } from '@/lib/cad-fetch';

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
  height = 480,
}: Readonly<{ files: { name: string; url: string }[]; height?: number }>) {
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
        const layerMap = whatsThatGerber(files.map((f) => f.name));
        const rendered: GerberLayer[] = [];
        const viewBoxes: ViewBox[] = [];

        for (const file of files) {
          if (cancelled) return;
          try {
            const buf = await fetchCadFileContent(file.url, ctrl.signal);
            const text = new TextDecoder().decode(buf);
            const svg = await renderGerberToSvg(text, file.name);
            const info = (layerMap[file.name] as LayerInfo | undefined) ?? null;
            const vb = parseViewBox(svg);
            if (vb) viewBoxes.push(vb);
            rendered.push({
              name: file.name, svg, info,
              color: getColor(info, file.name),
              tone: getTone(info, file.name),
              visible: true,
            });
          } catch { /* skip unrenderable files */ }
        }
        if (cancelled) return;
        if (!rendered.length) throw new Error('No Gerber layers could be rendered');

        const merged = mergeViewBoxes(viewBoxes);
        setLayers(rendered.map((l) => ({ ...l, svg: normalizeSvg(l.svg, l.color, merged) })));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to render');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; ctrl.abort(); };
  }, [files]);

  const toggleLayer = (i: number) =>
    setLayers((prev) => prev.map((l, idx) => (idx === i ? { ...l, visible: !l.visible } : l)));
  const setAll = (visible: boolean) => setLayers((prev) => prev.map((l) => ({ ...l, visible })));

  if (loading) {
    return (
      <div className="flex items-center justify-center text-cream-200 text-xs" style={{ height }}>
        Rendering Gerber layers...
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex items-center justify-center text-red-400 text-xs p-4" style={{ height }}>
        {error}
      </div>
    );
  }

  const visible = layers.filter((l) => l.visible);

  return (
    <div style={{ height }} className="flex flex-col bg-brown-900 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-cream-500/10 shrink-0">
        <span className="text-cream-200 text-[10px]">
          {visible.length}/{layers.length} layers
        </span>
        <div className="flex gap-2">
          <button onClick={() => setAll(true)} className="text-cream-300 hover:text-cream-50 text-[10px] cursor-pointer">show all</button>
          <button onClick={() => setAll(false)} className="text-cream-300 hover:text-cream-50 text-[10px] cursor-pointer">hide all</button>
        </div>
      </div>
      <div className="flex flex-1 min-h-0">
        {layers.length > 1 && (
          <div className="w-32 shrink-0 border-r border-cream-500/10 overflow-y-auto py-1">
            {layers.map((l, i) => (
              <button
                key={l.name}
                onClick={() => toggleLayer(i)}
                className={`w-full flex items-center gap-1.5 px-2 py-1 text-[10px] text-left cursor-pointer hover:bg-brown-800 ${l.visible ? 'text-cream-50' : 'text-cream-400 line-through'}`}
              >
                <span className="w-2 h-2 shrink-0" style={{ background: l.color, opacity: l.visible ? 1 : 0.3 }} />
                <span className="truncate">{l.info ? formatLayerInfo(l.info) : l.name}</span>
              </button>
            ))}
          </div>
        )}
        <div className="flex-1 relative bg-[#1a1612]">
          {visible.map((l) => (
            <div
              key={l.name}
              className="absolute inset-0"
              style={{ opacity: l.tone === 'mask' ? 0.5 : 1 }}
              dangerouslySetInnerHTML={{ __html: l.svg }}
            />
          ))}
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
