'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { fetchCadFileContent } from '@/lib/cad-fetch';
import type { EasyEdaDocumentKind, EasyEdaJsonInspection } from '@/lib/easyeda/easyeda';
import type { EasyEdaVisualDocument, EasyEdaVisualPrimitive } from '@/lib/easyeda/easyedaVisual';

interface ViewBoxState { x: number; y: number; width: number; height: number }
interface PanState { pointerId: number; startClientX: number; startClientY: number; startViewBox: ViewBoxState }
interface ProSheet { id: string; label: string; kind: EasyEdaDocumentKind; build: () => EasyEdaVisualDocument | null }

function clamp(v: number, min: number, max: number) { return Math.min(max, Math.max(min, v)); }

function EasyEdaCanvas({ document: doc }: Readonly<{ document: EasyEdaVisualDocument }>) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const panRef = useRef<PanState | null>(null);
  const fitVb = useMemo(() => {
    const w = Math.max(1, doc.bounds.width * 1.06);
    const h = Math.max(1, doc.bounds.height * 1.06);
    return { x: doc.bounds.minX - (w - doc.bounds.width) / 2, y: doc.bounds.minY - (h - doc.bounds.height) / 2, width: w, height: h };
  }, [doc]);
  const [vb, setVb] = useState<ViewBoxState>(fitVb);
  const [panning, setPanning] = useState(false);
  useEffect(() => { setVb(fitVb); }, [fitVb]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      if (rect.width <= 0) return;
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const scale = e.deltaY < 0 ? 0.9 : 1.1;
      setVb((prev) => {
        const cx = prev.x + (mx / rect.width) * prev.width;
        const cy = prev.y + (my / rect.height) * prev.height;
        const nw = clamp(prev.width * scale, doc.bounds.width * 0.01, doc.bounds.width * 100);
        const f = nw / prev.width;
        return { x: cx - (cx - prev.x) * f, y: cy - (cy - prev.y) * f, width: nw, height: prev.height * f };
      });
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [doc.bounds.width]);

  const onDown = useCallback((e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    svgRef.current?.setPointerCapture(e.pointerId);
    panRef.current = { pointerId: e.pointerId, startClientX: e.clientX, startClientY: e.clientY, startViewBox: vb };
    setPanning(true);
  }, [vb]);
  const onMove = useCallback((e: ReactPointerEvent<SVGSVGElement>) => {
    const p = panRef.current;
    const svg = svgRef.current;
    if (!p || !svg || p.pointerId !== e.pointerId) return;
    const rect = svg.getBoundingClientRect();
    const dx = e.clientX - p.startClientX, dy = e.clientY - p.startClientY;
    setVb({ x: p.startViewBox.x - dx * (p.startViewBox.width / rect.width), y: p.startViewBox.y - dy * (p.startViewBox.height / rect.height), width: p.startViewBox.width, height: p.startViewBox.height });
  }, []);
  const onUp = useCallback((e: ReactPointerEvent<SVGSVGElement>) => {
    if (!panRef.current || panRef.current.pointerId !== e.pointerId) return;
    panRef.current = null; setPanning(false);
  }, []);

  return (
    <div className="flex-1 min-h-0 relative">
      <svg ref={svgRef} className={panning ? 'cursor-grabbing' : 'cursor-grab'}
        viewBox={`${vb.x} ${vb.y} ${vb.width} ${vb.height}`}
        style={{ width: '100%', height: '100%', display: 'block' }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
      >
        <rect x={doc.bounds.minX} y={doc.bounds.minY} width={doc.bounds.width} height={doc.bounds.height} fill="#2A2219" />
        {doc.primitives.map((p, i) => renderPrimitive(p, i))}
      </svg>
    </div>
  );
}

function renderPrimitive(p: EasyEdaVisualPrimitive, i: number) {
  if (p.kind === 'polyline') {
    const pts = p.points.map((pt) => `${pt.x},${pt.y}`).join(' ');
    return p.closed
      ? <polygon key={i} points={pts} stroke={p.stroke} strokeWidth={p.strokeWidth} fill={p.fill ?? 'none'} opacity={p.opacity} strokeLinejoin="round" strokeLinecap="round" />
      : <polyline key={i} points={pts} stroke={p.stroke} strokeWidth={p.strokeWidth} fill="none" opacity={p.opacity} strokeLinejoin="round" strokeLinecap="round" />;
  }
  if (p.kind === 'path') return <path key={i} d={p.path} stroke={p.stroke} strokeWidth={p.strokeWidth} fill={p.fill ?? 'none'} opacity={p.opacity} strokeLinejoin="round" strokeLinecap="round" />;
  if (p.kind === 'circle') return <circle key={i} cx={p.cx} cy={p.cy} r={p.r} stroke={p.stroke} strokeWidth={p.strokeWidth} fill={p.fill ?? 'none'} opacity={p.opacity} />;
  if (p.kind === 'rect') {
    const cx = p.x + p.width / 2, cy = p.y + p.height / 2;
    const t = p.rotation ? `rotate(${p.rotation} ${cx} ${cy})` : undefined;
    return <rect key={i} x={p.x} y={p.y} width={p.width} height={p.height} rx={p.rx} ry={p.ry} transform={t} stroke={p.stroke} strokeWidth={p.strokeWidth} fill={p.fill ?? 'none'} opacity={p.opacity} />;
  }
  const t = p.rotation ? `rotate(${p.rotation} ${p.x} ${p.y})` : undefined;
  return <text key={i} x={p.x} y={p.y} transform={t} fill="#a0b6e8" opacity={p.opacity} fontSize={p.size} textAnchor={p.anchor} dominantBaseline="middle" style={{ userSelect: 'none', pointerEvents: 'none' }}>{p.text.length > 120 ? p.text.slice(0, 117) + '...' : p.text}</text>;
}

type ViewState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; sheets: ProSheet[]; defaultIndex: number };

export default function EasyEdaViewer({
  url,
  fileName,
  fileType,
  height,
}: Readonly<{ url: string; fileName: string; fileType: string; height?: number }>) {
  const [state, setState] = useState<ViewState>({ status: 'loading' });
  const [selectedSheet, setSelectedSheet] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    setState({ status: 'loading' });

    (async () => {
      try {
        const { analyzeEasyEdaJson, extractPrimaryEasyEdaArchiveJsonDocument, tryParseJsonContent } = await import('@/lib/easyeda/easyeda');
        const { buildEasyEdaVisualDocument } = await import('@/lib/easyeda/easyedaVisual');
        const { extractEasyEdaProArchive, parseProDocument, buildEasyEdaProPcbVisual, buildEasyEdaProSchematicVisual } = await import('@/lib/easyeda/easyedaPro');

        const buf = await fetchCadFileContent(url, ctrl.signal);
        if (cancelled) return;

        const isPro = fileType === 'easyeda_epro' || fileType === 'easyeda_eproproject' || fileName.endsWith('.epro') || fileName.endsWith('.eproproject');
        const isNdjson = fileName.endsWith('.esch') || fileName.endsWith('.epcb');

        if (isPro) {
          try {
            const archive = await extractEasyEdaProArchive(buf);
            const sheets: ProSheet[] = [];
            for (const [id, doc] of archive.pcbs) {
              const name = archive.projectInfo?.pcbs.find((e: any) => e.uuid === id)?.name ?? id;
              sheets.push({ id: `pcb:${id}`, label: `PCB · ${name}`, kind: 'pcb', build: () => buildEasyEdaProPcbVisual(archive, doc, name) });
            }
            const orderedKeys = [...archive.schematicSheets.keys()];
            for (const key of orderedKeys) {
              const doc = archive.schematicSheets.get(key);
              if (!doc) continue;
              sheets.push({ id: `sch:${key}`, label: `Schematic · ${key}`, kind: 'schematic', build: () => buildEasyEdaProSchematicVisual(archive, doc, key) });
            }
            if (sheets.length > 0) {
              const defaultIdx = Math.max(0, sheets.findIndex((s) => s.kind === 'pcb'));
              if (!cancelled) setState({ status: 'ready', sheets, defaultIndex: defaultIdx });
              return;
            }
          } catch { /* fall through */ }
        }

        if (isNdjson) {
          const text = new TextDecoder().decode(buf);
          const doc = parseProDocument(text);
          if (doc) {
            const isPcb = fileName.endsWith('.epcb');
            const dummyArchive = { projectInfo: null, pcbs: new Map(), schematicSheets: new Map(), footprints: new Map(), symbols: new Map() };
            const sheet: ProSheet = isPcb
              ? { id: 'pcb:0', label: fileName, kind: 'pcb', build: () => buildEasyEdaProPcbVisual(dummyArchive, doc, fileName) }
              : { id: 'sch:0', label: fileName, kind: 'schematic', build: () => buildEasyEdaProSchematicVisual(dummyArchive, doc, fileName) };
            if (!cancelled) setState({ status: 'ready', sheets: [sheet], defaultIndex: 0 });
            return;
          }
        }

        const parsed = tryParseJsonContent(buf);
        if (parsed) {
          const inspection = analyzeEasyEdaJson(parsed.value, fileName);
          const vis = buildEasyEdaVisualDocument(parsed.value, fileName, inspection.documentKind);
          if (vis) {
            const sheet: ProSheet = { id: 'json:0', label: fileName, kind: inspection.documentKind, build: () => vis };
            if (!cancelled) setState({ status: 'ready', sheets: [sheet], defaultIndex: 0 });
            return;
          }
        }

        const archiveDoc = await extractPrimaryEasyEdaArchiveJsonDocument(buf);
        if (archiveDoc) {
          const inspection = analyzeEasyEdaJson(archiveDoc.value, archiveDoc.name);
          const vis = buildEasyEdaVisualDocument(archiveDoc.value, archiveDoc.name, inspection.documentKind);
          if (vis) {
            const sheet: ProSheet = { id: 'archive:0', label: archiveDoc.name, kind: inspection.documentKind, build: () => vis };
            if (!cancelled) setState({ status: 'ready', sheets: [sheet], defaultIndex: 0 });
            return;
          }
        }

        if (!cancelled) setState({ status: 'error', message: 'Could not parse EasyEDA file' });
      } catch (e) {
        if (!cancelled) setState({ status: 'error', message: e instanceof Error ? e.message : 'Failed to load' });
      }
    })();

    return () => { cancelled = true; ctrl.abort(); };
  }, [url, fileName, fileType]);

  if (state.status === 'loading') {
    return <div className="flex items-center justify-center text-cream-200 text-xs" style={height ? { height } : { height: '100%' }}>Reading EasyEDA file...</div>;
  }
  if (state.status === 'error') {
    return <div className="flex items-center justify-center text-red-400 text-xs p-4" style={height ? { height } : { height: '100%' }}>{state.message}</div>;
  }

  const sheet = state.sheets[selectedSheet] ?? state.sheets[0];
  const doc = sheet.build();

  return (
    <div className="flex flex-col bg-brown-900 overflow-hidden" style={height ? { height } : { height: '100%' }}>
      {state.sheets.length > 1 && (
        <div className="flex gap-1 px-2 py-1.5 border-b border-cream-500/10 overflow-x-auto shrink-0">
          {state.sheets.map((s, i) => (
            <button key={s.id} onClick={() => setSelectedSheet(i)}
              className={`text-[10px] px-2 py-0.5 border-b-2 whitespace-nowrap cursor-pointer ${i === selectedSheet ? 'text-orange-400 border-orange-400' : 'text-cream-200 border-transparent hover:text-cream-50'}`}
            >{s.label}</button>
          ))}
        </div>
      )}
      {doc ? <EasyEdaCanvas document={doc} /> : (
        <div className="flex-1 flex items-center justify-center text-cream-300 text-xs">Sheet could not be rendered</div>
      )}
    </div>
  );
}
