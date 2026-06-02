import type { CompilationResult, DrawCmd, PathSeg, CompiledAperture, BBox } from './types';
import { bboxValid } from './types';

const { PI, atan2, sqrt, abs } = Math;

// --- Number formatting ---

function n(v: number): string {
  // Fixed precision, trim trailing zeros
  const s = v.toFixed(6);
  // strip trailing zeros after decimal point
  if (s.includes('.')) {
    let end = s.length;
    while (s[end - 1] === '0') end--;
    if (s[end - 1] === '.') end--;
    return s.slice(0, end);
  }
  return s;
}

// --- SVG arc conversion ---
// Convert center-parameterized arc to SVG endpoint-parameterized arc

function arcToSvgA(seg: {
  start: [number, number];
  end: [number, number];
  center: [number, number];
  clockwise: boolean;
}): string {
  const r = sqrt(
    (seg.start[0] - seg.center[0]) ** 2 +
    (seg.start[1] - seg.center[1]) ** 2,
  );

  if (r < 1e-10) {
    return `L${n(seg.end[0])} ${n(-seg.end[1])}`;
  }

  // Compute sweep angle
  const startAngle = atan2(seg.start[1] - seg.center[1], seg.start[0] - seg.center[0]);
  const endAngle = atan2(seg.end[1] - seg.center[1], seg.end[0] - seg.center[0]);

  let sweep = seg.clockwise ? startAngle - endAngle : endAngle - startAngle;
  if (sweep < 0) sweep += 2 * PI;
  if (sweep === 0) sweep = 2 * PI;

  const largeArc = sweep > PI ? 1 : 0;
  // SVG sweep: 1 = clockwise in SVG coords. Since we flip Y, CW in Gerber → CCW in SVG
  const sweepFlag = seg.clockwise ? 0 : 1;

  return `A${n(r)} ${n(r)} 0 ${largeArc} ${sweepFlag} ${n(seg.end[0])} ${n(-seg.end[1])}`;
}

// --- Path segment to SVG path data ---

function segsToPathD(segs: ReadonlyArray<PathSeg>): string {
  if (segs.length === 0) return '';
  const parts: string[] = [];
  let lastX = NaN, lastY = NaN;

  for (const seg of segs) {
    const sx = seg.start[0], sy = seg.start[1];
    if (sx !== lastX || sy !== lastY) {
      parts.push(`M${n(sx)} ${n(-sy)}`);
    }
    if (seg.kind === 'line') {
      parts.push(`L${n(seg.end[0])} ${n(-seg.end[1])}`);
    } else {
      parts.push(arcToSvgA(seg));
    }
    lastX = seg.end[0];
    lastY = seg.end[1];
  }

  parts.push('Z');
  return parts.join('');
}

// --- Aperture to SVG defs ---

function apertureToSvgDef(ap: CompiledAperture, pfx: string): string {
  const parts: string[] = [];
  const prefixedId = `${pfx}${ap.id}`;
  const hasClear = ap.commands.some(c => c.kind === 'shape' && c.negative);

  if (hasClear) {
    let clipId = 0;
    const darkPaths: string[] = [];
    const clearGroups: { clipPathId: string; paths: string[] }[] = [];

    for (const cmd of ap.commands) {
      if (cmd.kind !== 'shape') continue;
      if (cmd.negative) {
        const id = `${prefixedId}-clip-${clipId++}`;
        clearGroups.push({ clipPathId: id, paths: [segsToPathD(cmd.segments)] });
      } else {
        darkPaths.push(segsToPathD(cmd.segments));
      }
    }

    for (const cg of clearGroups) {
      const b = ap.bounds;
      const pad = 1;
      const clipRect = `M${n(b.minX - pad)} ${n(-(b.minY - pad))}h${n(b.maxX - b.minX + 2 * pad)}v${n(-(b.maxY - b.minY + 2 * pad))}h${n(-(b.maxX - b.minX + 2 * pad))}Z`;
      parts.push(`<clipPath id="${cg.clipPathId}"><path d="${clipRect}${cg.paths.join('')}" fill-rule="evenodd"/></clipPath>`);
    }

    let inner = darkPaths.map(d => `<path d="${d}"/>`).join('');
    for (const cg of clearGroups) {
      inner = `<g clip-path="url(#${cg.clipPathId})">${inner}</g>`;
    }
    parts.push(`<g id="${prefixedId}">${inner}</g>`);
  } else {
    const paths = ap.commands
      .filter((c): c is DrawCmd & { kind: 'shape' } => c.kind === 'shape')
      .map(c => `<path d="${segsToPathD(c.segments)}"/>`)
      .join('');
    parts.push(`<g id="${prefixedId}">${paths}</g>`);
  }

  return parts.join('');
}

// --- Main renderer ---

export function renderToSvgInner(
  result: CompilationResult,
  idPrefix = '',
): { innerSvg: string; viewBox: [number, number, number, number] | null } {
  if (!bboxValid(result.bounds) || result.commands.length === 0) {
    return { innerSvg: '', viewBox: null };
  }

  const out: string[] = [];

  // Build defs for all apertures that are actually used
  const usedApertures = new Set<string>();
  for (const cmd of result.commands) {
    if (cmd.kind === 'flash') usedApertures.add(cmd.apertureId);
  }

  const pfx = idPrefix ? `${idPrefix}-` : '';

  const defs: string[] = [];
  for (const [id, ap] of result.apertures) {
    if (usedApertures.has(id)) {
      defs.push(apertureToSvgDef(ap, pfx));
    }
  }

  // Split commands into polarity groups
  const groups: { negative: boolean; commands: DrawCmd[] }[] = [];
  let currentGroup: { negative: boolean; commands: DrawCmd[] } | null = null;

  for (const cmd of result.commands) {
    const neg = cmd.negative ?? false;
    if (!currentGroup || currentGroup.negative !== neg) {
      currentGroup = { negative: neg, commands: [] };
      groups.push(currentGroup);
    }
    currentGroup.commands.push(cmd);
  }

  // Render polarity groups
  // Build chunk-based masking for clear (negative) groups
  const b = result.bounds;
  const pad = (b.maxX - b.minX + b.maxY - b.minY) * 0.01;
  const maskBounds = {
    x: n(b.minX - pad),
    y: n(-(b.maxY + pad)),
    w: n(b.maxX - b.minX + 2 * pad),
    h: n(b.maxY - b.minY + 2 * pad),
  };

  let maskCounter = 0;
  const maskDefs: string[] = [];

  // Accumulate dark content; when a clear group appears, wrap preceding dark in a mask
  let darkAccum: string[] = [];

  for (const group of groups) {
    if (!group.negative) {
      const groupSvg = renderCommandGroup(group.commands, result.apertures, pfx);
      darkAccum.push(groupSvg);
    } else {
      const maskId = `${pfx}m${maskCounter++}`;
      const clearSvg = renderCommandGroup(group.commands, result.apertures, pfx);
      maskDefs.push(
        `<mask id="${maskId}" maskUnits="userSpaceOnUse" x="${maskBounds.x}" y="${maskBounds.y}" width="${maskBounds.w}" height="${maskBounds.h}">` +
        `<rect x="${maskBounds.x}" y="${maskBounds.y}" width="${maskBounds.w}" height="${maskBounds.h}" fill="white"/>` +
        `<g fill="black" stroke="black">${clearSvg}</g>` +
        `</mask>`,
      );

      const accumulated = darkAccum.join('');
      darkAccum = [`<g mask="url(#${maskId})">${accumulated}</g>`];
    }
  }

  // Emit
  if (defs.length > 0 || maskDefs.length > 0) {
    out.push('<defs>');
    out.push(...defs);
    out.push(...maskDefs);
    out.push('</defs>');
  }
  out.push(...darkAccum);

  // ViewBox: Y is flipped (we negate Y in path data)
  const viewBox: [number, number, number, number] = [
    b.minX - pad,
    -(b.maxY + pad),
    b.maxX - b.minX + 2 * pad,
    b.maxY - b.minY + 2 * pad,
  ];

  return { innerSvg: out.join(''), viewBox };
}

function renderCommandGroup(
  commands: ReadonlyArray<DrawCmd>,
  apertures: Map<string, CompiledAperture>,
  pfx: string,
): string {
  const parts: string[] = [];

  for (const cmd of commands) {
    switch (cmd.kind) {
      case 'flash': {
        const ap = apertures.get(cmd.apertureId);
        if (ap) {
          parts.push(`<use href="#${pfx}${ap.id}" x="${n(cmd.x)}" y="${n(-cmd.y)}"/>`);
        }
        break;
      }
      case 'shape': {
        const d = segsToPathD(cmd.segments);
        if (d) {
          parts.push(`<path d="${d}" fill-rule="evenodd"/>`);
        }
        break;
      }
      case 'stroke': {
        const d = strokeSegsToPathD(cmd.segments);
        if (d) {
          parts.push(`<path d="${d}" fill="none" stroke-width="${n(cmd.width)}" stroke-linecap="round" stroke-linejoin="round"/>`);
        }
        break;
      }
    }
  }

  return parts.join('');
}

function strokeSegsToPathD(segs: ReadonlyArray<PathSeg>): string {
  if (segs.length === 0) return '';
  const parts: string[] = [];
  let lastX = NaN, lastY = NaN;

  for (const seg of segs) {
    const sx = seg.start[0], sy = seg.start[1];
    if (sx !== lastX || sy !== lastY) {
      parts.push(`M${n(sx)} ${n(-sy)}`);
    }
    if (seg.kind === 'line') {
      parts.push(`L${n(seg.end[0])} ${n(-seg.end[1])}`);
    } else {
      parts.push(arcToSvgA(seg));
    }
    lastX = seg.end[0];
    lastY = seg.end[1];
  }

  // Strokes are open paths — no Z
  return parts.join('');
}
