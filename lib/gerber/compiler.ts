import type {
  AstNode,
  ApertureShape,
  MacroBlock,
  MacroExpr,
  BBox,
  Point,
  PathSeg,
  LineSeg,
  ArcSeg,
  DrawCmd,
  CompiledAperture,
  CompilationResult,
  InterpMode,
  Polarity,
} from './types';
import { emptyBBox, expandBBox } from './types';

const { PI, cos, sin, atan2, sqrt, abs, min, max, floor, round } = Math;
const TAU = 2 * PI;
const DEG = PI / 180;

// Hostile Gerber files can declare an enormous step-repeat (e.g. %SRX99999Y99999%)
// whose expansion is xRepeats * yRepeats * blockCommands. Left unbounded this hangs
// or OOMs the reviewer's browser. Cap both the repeat grid and the total emitted
// command count so a malicious file degrades to a partial render instead of a DoS.
const MAX_SR_INSTANCES = 10_000;
const MAX_TOTAL_COMMANDS = 2_000_000;

// --- Coordinate unpacking ---

function unpackCoord(
  raw: string,
  intDigits: number,
  decDigits: number,
  zeroSup: 'leading' | 'trailing',
): number {
  // Some generators include explicit decimal points
  if (raw.includes('.')) return parseFloat(raw);

  let sign = 1;
  let digits = raw;
  if (digits.startsWith('-') || digits.startsWith('+')) {
    sign = digits.startsWith('-') ? -1 : 1;
    digits = digits.slice(1);
  }

  const totalPlaces = intDigits + decDigits;
  if (zeroSup === 'leading') {
    digits = digits.padStart(totalPlaces, '0');
  } else {
    digits = digits.padEnd(totalPlaces, '0');
  }

  const intPart = digits.slice(0, intDigits);
  const decPart = digits.slice(intDigits, totalPlaces);
  return sign * parseFloat(`${intPart}.${decPart}`);
}

// --- Geometry helpers ---

function dist(a: Point, b: Point): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  return sqrt(dx * dx + dy * dy);
}

function angleBetween(from: Point, to: Point): number {
  return atan2(to[1] - from[1], to[0] - from[0]);
}

function makeCircleSegs(cx: number, cy: number, r: number): PathSeg[] {
  return [
    { kind: 'arc', start: [cx - r, cy], end: [cx + r, cy], center: [cx, cy], clockwise: true },
    { kind: 'arc', start: [cx + r, cy], end: [cx - r, cy], center: [cx, cy], clockwise: true },
  ];
}

function makeRectSegs(cx: number, cy: number, hw: number, hh: number): PathSeg[] {
  const l = cx - hw, r = cx + hw, b = cy - hh, t = cy + hh;
  return [
    { kind: 'line', start: [l, b], end: [r, b] },
    { kind: 'line', start: [r, b], end: [r, t] },
    { kind: 'line', start: [r, t], end: [l, t] },
    { kind: 'line', start: [l, t], end: [l, b] },
  ];
}

function makeObroundSegs(cx: number, cy: number, w: number, h: number): PathSeg[] {
  const hw = w / 2, hh = h / 2;
  if (w <= h) {
    // Taller than wide: arcs on top and bottom
    const delta = hw;
    const top = cy + hh - delta, bot = cy - hh + delta;
    return [
      { kind: 'arc', start: [cx - hw, bot], end: [cx + hw, bot], center: [cx, bot], clockwise: false },
      { kind: 'line', start: [cx + hw, bot], end: [cx + hw, top] },
      { kind: 'arc', start: [cx + hw, top], end: [cx - hw, top], center: [cx, top], clockwise: false },
      { kind: 'line', start: [cx - hw, top], end: [cx - hw, bot] },
    ];
  }
  // Wider than tall: arcs on left and right
  const delta = hh;
  const left = cx - hw + delta, right = cx + hw - delta;
  return [
    { kind: 'line', start: [left, cy - hh], end: [right, cy - hh] },
    { kind: 'arc', start: [right, cy - hh], end: [right, cy + hh], center: [right, cy], clockwise: false },
    { kind: 'line', start: [right, cy + hh], end: [left, cy + hh] },
    { kind: 'arc', start: [left, cy + hh], end: [left, cy - hh], center: [left, cy], clockwise: false },
  ];
}

function makePolygonSegs(cx: number, cy: number, outerDiameter: number, vertices: number, rotationDeg: number): PathSeg[] {
  const r = outerDiameter / 2;
  const segs: PathSeg[] = [];
  const baseAngle = rotationDeg * DEG;
  const step = TAU / vertices;

  for (let i = 0; i < vertices; i++) {
    const a1 = baseAngle + i * step;
    const a2 = baseAngle + (i + 1) * step;
    segs.push({
      kind: 'line',
      start: [cx + r * cos(a1), cy + r * sin(a1)],
      end: [cx + r * cos(a2), cy + r * sin(a2)],
    });
  }
  return segs;
}

function translateSegs(segs: PathSeg[], dx: number, dy: number): PathSeg[] {
  return segs.map(s => {
    if (s.kind === 'line') {
      return { kind: 'line', start: [s.start[0] + dx, s.start[1] + dy], end: [s.end[0] + dx, s.end[1] + dy] } as LineSeg;
    }
    return {
      kind: 'arc', clockwise: s.clockwise,
      start: [s.start[0] + dx, s.start[1] + dy],
      end: [s.end[0] + dx, s.end[1] + dy],
      center: [s.center[0] + dx, s.center[1] + dy],
    } as ArcSeg;
  });
}

function rotatePoint(x: number, y: number, angle: number): Point {
  const c = cos(angle), s = sin(angle);
  return [x * c - y * s, x * s + y * c];
}

function rotateSegs(segs: PathSeg[], angleDeg: number): PathSeg[] {
  if (angleDeg === 0) return segs;
  const a = angleDeg * DEG;
  return segs.map(s => {
    if (s.kind === 'line') {
      return { kind: 'line', start: rotatePoint(s.start[0], s.start[1], a), end: rotatePoint(s.end[0], s.end[1], a) } as LineSeg;
    }
    return {
      kind: 'arc', clockwise: s.clockwise,
      start: rotatePoint(s.start[0], s.start[1], a),
      end: rotatePoint(s.end[0], s.end[1], a),
      center: rotatePoint(s.center[0], s.center[1], a),
    } as ArcSeg;
  });
}

// --- Thick line / stroke shape generation ---

function makeThickLineSegs(start: Point, end: Point, width: number): PathSeg[] {
  const dx = end[0] - start[0], dy = end[1] - start[1];
  const len = sqrt(dx * dx + dy * dy);
  if (len < 1e-10) return [];
  const px = (-dy / len) * (width / 2);
  const py = (dx / len) * (width / 2);
  return [
    { kind: 'line', start: [start[0] + px, start[1] + py], end: [end[0] + px, end[1] + py] },
    { kind: 'line', start: [end[0] - px, end[1] - py], end: [start[0] - px, start[1] - py] },
  ];
}

// --- Macro expression evaluator ---

function evalMacroExpr(expr: MacroExpr, scope: Map<string, number>): number {
  switch (expr.kind) {
    case 'num': return expr.value;
    case 'var': return scope.get(expr.name) ?? 0;
    case 'neg': return -evalMacroExpr(expr.expr, scope);
    case 'op': {
      const l = evalMacroExpr(expr.left, scope);
      const r = evalMacroExpr(expr.right, scope);
      switch (expr.op) {
        case '+': return l + r;
        case '-': return l - r;
        case 'x': return l * r;
        case '/': return r !== 0 ? l / r : 0;
      }
    }
  }
}

// --- Aperture macro → DrawCmd[] ---

function compileMacro(blocks: MacroBlock[], params: number[]): DrawCmd[] {
  const scope = new Map<string, number>();
  for (let i = 0; i < params.length; i++) {
    scope.set(`$${i + 1}`, params[i]);
  }

  const cmds: DrawCmd[] = [];

  for (const block of blocks) {
    if (block.kind === 'comment') continue;
    if (block.kind === 'assignment') {
      scope.set(block.variable, evalMacroExpr(block.value, scope));
      continue;
    }

    const mods = block.modifiers.map(m => evalMacroExpr(m, scope));
    const negative = mods[0] === 0;
    const rotation = mods[mods.length - 1] ?? 0;

    switch (block.code) {
      case 1: {
        // Circle: exposure, diameter, cx, cy, [rotation]
        const d = mods[1], cx = mods[2] ?? 0, cy = mods[3] ?? 0;
        let segs = makeCircleSegs(cx, cy, d / 2);
        if (mods.length > 4 && rotation !== 0) segs = rotateSegs(segs, rotation);
        cmds.push({ kind: 'shape', segments: segs, negative });
        break;
      }
      case 20:
      case 2: {
        // Vector line: exposure, width, sx, sy, ex, ey, rotation
        const w = mods[1], sx = mods[2], sy = mods[3], ex = mods[4], ey = mods[5];
        let segs = makeThickLineSegs([sx, sy], [ex, ey], w);
        if (segs.length && rotation !== 0) segs = rotateSegs(segs, rotation);
        if (segs.length) cmds.push({ kind: 'shape', segments: segs, negative });
        break;
      }
      case 21: {
        // Center line: exposure, width, height, cx, cy, rotation
        const w = mods[1], h = mods[2], cx = mods[3] ?? 0, cy = mods[4] ?? 0;
        let segs = makeRectSegs(cx, cy, w / 2, h / 2);
        if (rotation !== 0) segs = rotateSegs(segs, rotation);
        cmds.push({ kind: 'shape', segments: segs, negative });
        break;
      }
      case 4: {
        // Outline: exposure, nVertices, sx, sy, ..., rotation
        const n = round(mods[1]);
        const points: Point[] = [];
        for (let i = 0; i <= n; i++) {
          points.push([mods[2 + i * 2], mods[3 + i * 2]]);
        }
        let segs: PathSeg[] = [];
        for (let i = 0; i < points.length - 1; i++) {
          segs.push({ kind: 'line', start: points[i], end: points[i + 1] });
        }
        segs.push({ kind: 'line', start: points[points.length - 1], end: points[0] });
        if (rotation !== 0) segs = rotateSegs(segs, rotation);
        cmds.push({ kind: 'shape', segments: segs, negative });
        break;
      }
      case 5: {
        // Polygon: exposure, nVertices, cx, cy, diameter, rotation
        const n = round(mods[1]);
        const cx = mods[2], cy = mods[3], d = mods[4];
        const segs = makePolygonSegs(cx, cy, d, n, rotation);
        cmds.push({ kind: 'shape', segments: segs, negative });
        break;
      }
      case 6: {
        // Moire: cx, cy, outerDiameter, ringThickness, ringGap, maxRings, crosshairThickness, crosshairLength, rotation
        // Moire has no exposure field — always dark
        const cx = mods[0], cy = mods[1];
        const outerD = mods[2], ringThick = mods[3], ringGap = mods[4];
        const maxRings = round(mods[5]);
        const crossThick = mods[6], crossLen = mods[7];
        const rot = mods[8] ?? 0;

        // Crosshairs
        let hSegs = makeThickLineSegs([cx - crossLen / 2, cy], [cx + crossLen / 2, cy], crossThick);
        let vSegs = makeThickLineSegs([cx, cy - crossLen / 2], [cx, cy + crossLen / 2], crossThick);
        if (rot !== 0) { hSegs = rotateSegs(hSegs, rot); vSegs = rotateSegs(vSegs, rot); }
        if (hSegs.length) cmds.push({ kind: 'shape', segments: hSegs, negative: false });
        if (vSegs.length) cmds.push({ kind: 'shape', segments: vSegs, negative: false });

        // Rings
        let currentOuterD = outerD;
        for (let i = 0; i < maxRings && currentOuterD > ringThick; i++) {
          const innerD = currentOuterD - 2 * ringThick;
          if (innerD < 0) {
            // Solid circle
            let segs = makeCircleSegs(cx, cy, currentOuterD / 2);
            if (rot !== 0) segs = rotateSegs(segs, rot);
            cmds.push({ kind: 'shape', segments: segs, negative: false });
            break;
          }
          // Outer circle
          let outerSegs = makeCircleSegs(cx, cy, currentOuterD / 2);
          if (rot !== 0) outerSegs = rotateSegs(outerSegs, rot);
          cmds.push({ kind: 'shape', segments: outerSegs, negative: false });
          // Inner circle (erase)
          let innerSegs = makeCircleSegs(cx, cy, innerD / 2);
          if (rot !== 0) innerSegs = rotateSegs(innerSegs, rot);
          cmds.push({ kind: 'shape', segments: innerSegs, negative: true });
          currentOuterD = innerD - 2 * ringGap;
        }
        break;
      }
      case 7: {
        // Thermal: cx, cy, outerDiameter, innerDiameter, gapThickness, rotation
        // No exposure field
        const cx = mods[0], cy = mods[1];
        const outerD = mods[2], innerD = mods[3], gap = mods[4];
        const rot = mods[5] ?? 0;

        // Outer ring
        let outerSegs = makeCircleSegs(cx, cy, outerD / 2);
        if (rot !== 0) outerSegs = rotateSegs(outerSegs, rot);
        cmds.push({ kind: 'shape', segments: outerSegs, negative: false });

        // Inner circle (erase)
        let innerSegs = makeCircleSegs(cx, cy, innerD / 2);
        if (rot !== 0) innerSegs = rotateSegs(innerSegs, rot);
        cmds.push({ kind: 'shape', segments: innerSegs, negative: true });

        // Gap lines (erase)
        const halfGap = gap / 2;
        const r = outerD / 2;
        // Horizontal gap
        let hGap = makeThickLineSegs([cx - r, cy], [cx + r, cy], gap);
        if (rot !== 0) hGap = rotateSegs(hGap, rot);
        cmds.push({ kind: 'shape', segments: hGap, negative: true });
        // Vertical gap
        let vGap = makeThickLineSegs([cx, cy - r], [cx, cy + r], gap);
        if (rot !== 0) vGap = rotateSegs(vGap, rot);
        cmds.push({ kind: 'shape', segments: vGap, negative: true });
        break;
      }
    }
  }
  return cmds;
}

// --- Aperture shape → DrawCmd[] ---

function compileApertureShape(shape: ApertureShape, macros: Map<string, MacroBlock[]>): DrawCmd[] {
  const cmds: DrawCmd[] = [];

  switch (shape.kind) {
    case 'circle': {
      cmds.push({ kind: 'shape', segments: makeCircleSegs(0, 0, shape.diameter / 2), negative: false });
      if (shape.holeDiameter && shape.holeDiameter > 0) {
        cmds.push({ kind: 'shape', segments: makeCircleSegs(0, 0, min(shape.holeDiameter, shape.diameter) / 2), negative: true });
      }
      break;
    }
    case 'rect': {
      cmds.push({ kind: 'shape', segments: makeRectSegs(0, 0, shape.width / 2, shape.height / 2), negative: false });
      if (shape.holeDiameter && shape.holeDiameter > 0) {
        cmds.push({ kind: 'shape', segments: makeCircleSegs(0, 0, min(shape.holeDiameter, shape.width, shape.height) / 2), negative: true });
      }
      break;
    }
    case 'obround': {
      cmds.push({ kind: 'shape', segments: makeObroundSegs(0, 0, shape.width, shape.height), negative: false });
      if (shape.holeDiameter && shape.holeDiameter > 0) {
        cmds.push({ kind: 'shape', segments: makeCircleSegs(0, 0, min(shape.holeDiameter, shape.width, shape.height) / 2), negative: true });
      }
      break;
    }
    case 'polygon': {
      cmds.push({ kind: 'shape', segments: makePolygonSegs(0, 0, shape.outerDiameter, shape.vertices, shape.rotation), negative: false });
      if (shape.holeDiameter && shape.holeDiameter > 0) {
        cmds.push({ kind: 'shape', segments: makeCircleSegs(0, 0, min(shape.holeDiameter, shape.outerDiameter) / 2), negative: true });
      }
      break;
    }
    case 'macro': {
      const macroDef = macros.get(shape.name);
      if (macroDef) {
        cmds.push(...compileMacro(macroDef, shape.params));
      }
      break;
    }
  }
  return cmds;
}

// --- Get aperture line width ---

function getApertureWidth(shape: ApertureShape): number {
  switch (shape.kind) {
    case 'circle': return shape.diameter;
    case 'rect': return min(shape.width, shape.height);
    case 'obround': return min(shape.width, shape.height);
    case 'polygon': return shape.outerDiameter;
    case 'macro': return 0;
  }
}

// --- Bounding box helpers for segments ---

function expandBBoxFromSeg(box: BBox, seg: PathSeg): void {
  expandBBox(box, seg.start[0], seg.start[1]);
  expandBBox(box, seg.end[0], seg.end[1]);
  if (seg.kind === 'arc') {
    // Conservative: expand by center ± radius
    const r = dist(seg.center, seg.start);
    expandBBox(box, seg.center[0] - r, seg.center[1] - r);
    expandBBox(box, seg.center[0] + r, seg.center[1] + r);
  }
}

function expandBBoxFromCmd(box: BBox, cmd: DrawCmd, apertures: Map<string, CompiledAperture>): void {
  if (cmd.kind === 'shape') {
    for (const seg of cmd.segments) expandBBoxFromSeg(box, seg);
  } else if (cmd.kind === 'stroke') {
    const hw = cmd.width / 2;
    for (const seg of cmd.segments) {
      expandBBox(box, seg.start[0] - hw, seg.start[1] - hw);
      expandBBox(box, seg.start[0] + hw, seg.start[1] + hw);
      expandBBox(box, seg.end[0] - hw, seg.end[1] - hw);
      expandBBox(box, seg.end[0] + hw, seg.end[1] + hw);
      if (seg.kind === 'arc') {
        const r = dist(seg.center, seg.start) + hw;
        expandBBox(box, seg.center[0] - r, seg.center[1] - r);
        expandBBox(box, seg.center[0] + r, seg.center[1] + r);
      }
    }
  } else if (cmd.kind === 'flash') {
    const ap = apertures.get(cmd.apertureId);
    if (ap) {
      expandBBox(box, cmd.x + ap.bounds.minX, cmd.y + ap.bounds.minY);
      expandBBox(box, cmd.x + ap.bounds.maxX, cmd.y + ap.bounds.maxY);
    } else {
      expandBBox(box, cmd.x, cmd.y);
    }
  }
}

// --- Main compiler ---

export function compile(ast: AstNode[]): CompilationResult {
  // State
  let xInt = 2, xDec = 6, yInt = 2, yDec = 6;
  let zeroSup: 'leading' | 'trailing' = 'leading';
  let coordMode: 'absolute' | 'incremental' = 'absolute';
  let units: 'mm' | 'in' = 'mm';
  let curX = 0, curY = 0;
  let interpMode: InterpMode = 'linear';
  let quadrantMode: 'single' | 'multi' = 'multi';
  let regionMode = false;
  let polarity: Polarity = 'dark';
  let currentApertureId: string | null = null;

  const apertureDefs = new Map<string, ApertureShape>();
  const macroDefs = new Map<string, MacroBlock[]>();
  const compiledApertures = new Map<string, CompiledAperture>();

  // Command output + step-repeat stack
  let commands: DrawCmd[] = [];
  const srStack: { commands: DrawCmd[]; xRepeats: number; yRepeats: number; xDelta: number; yDelta: number }[] = [];

  // Region accumulator
  let regionPath: PathSeg[] = [];

  // Aperture block state
  let abStack: { commands: DrawCmd[]; code: string }[] = [];

  const bounds = emptyBBox();

  function resolveCoord(raw: string | undefined, current: number, intD: number, decD: number): number {
    if (raw === undefined) return current;
    const val = unpackCoord(raw, intD, decD, zeroSup);
    return coordMode === 'absolute' ? val : current + val;
  }

  function resolveIJ(raw: string | undefined, intD: number, decD: number): number {
    if (raw === undefined) return 0;
    return unpackCoord(raw, intD, decD, zeroSup);
  }

  function getCompiledAperture(id: string): CompiledAperture | undefined {
    if (!compiledApertures.has(id)) {
      const shape = apertureDefs.get(id);
      if (!shape) return undefined;
      const apCmds = compileApertureShape(shape, macroDefs);
      const apBounds = emptyBBox();
      for (const cmd of apCmds) {
        if (cmd.kind === 'shape') {
          for (const seg of cmd.segments) expandBBoxFromSeg(apBounds, seg);
        }
      }
      compiledApertures.set(id, { id, commands: apCmds, bounds: apBounds });
    }
    return compiledApertures.get(id);
  }

  let totalEmitted = 0;

  function emit(cmd: DrawCmd): void {
    if (totalEmitted >= MAX_TOTAL_COMMANDS) return;
    totalEmitted++;
    commands.push(cmd);
    expandBBoxFromCmd(bounds, cmd, compiledApertures);
  }

  function flushRegion(): void {
    if (regionPath.length > 0) {
      emit({ kind: 'shape', segments: regionPath, negative: polarity === 'clear' });
      regionPath = [];
    }
  }

  function getCurrentWidth(): number {
    if (!currentApertureId) return 0;
    const shape = apertureDefs.get(currentApertureId);
    return shape ? getApertureWidth(shape) : 0;
  }

  for (const node of ast) {
    switch (node.type) {
      case 'formatSpec':
        xInt = node.xInt; xDec = node.xDec;
        yInt = node.yInt; yDec = node.yDec;
        zeroSup = node.zeros;
        coordMode = node.mode;
        break;

      case 'units':
        units = node.units;
        break;

      case 'apertureDef': {
        apertureDefs.set(node.code, node.shape);
        getCompiledAperture(node.code);
        break;
      }

      case 'apertureMacro':
        macroDefs.set(node.name, node.blocks);
        break;

      case 'apertureBlock':
        if (node.open) {
          abStack.push({ commands, code: node.code });
          commands = [];
        } else if (abStack.length > 0) {
          const abEntry = abStack.pop()!;
          const blockCmds = commands;
          commands = abEntry.commands;
          const apBounds = emptyBBox();
          for (const cmd of blockCmds) {
            if (cmd.kind === 'shape') {
              for (const seg of cmd.segments) expandBBoxFromSeg(apBounds, seg);
            }
          }
          compiledApertures.set(abEntry.code, { id: abEntry.code, commands: blockCmds, bounds: apBounds });
          apertureDefs.set(abEntry.code, { kind: 'macro', name: '', params: [] });
        }
        break;

      case 'toolChange':
        currentApertureId = node.code;
        break;

      case 'interpolateMode':
        interpMode = node.mode;
        break;

      case 'quadrantMode':
        quadrantMode = node.mode;
        break;

      case 'regionStart':
        regionMode = true;
        regionPath = [];
        break;

      case 'regionEnd':
        flushRegion();
        regionMode = false;
        break;

      case 'loadPolarity':
        polarity = node.polarity;
        break;

      case 'stepRepeatOpen':
        srStack.push({ commands, xRepeats: node.xRepeats, yRepeats: node.yRepeats, xDelta: node.xDelta, yDelta: node.yDelta });
        commands = [];
        break;

      case 'stepRepeatClose': {
        if (srStack.length > 0) {
          const sr = srStack.pop()!;
          const blockCmds = commands;
          commands = sr.commands;
          // Clamp the repeat grid so a malicious SR can't blow up expansion.
          // Non-positive / NaN counts fall back to 1 (a single placement).
          const xRepeats = max(1, min(sr.xRepeats || 1, MAX_SR_INSTANCES));
          const yRepeats = max(1, min(sr.yRepeats || 1, floor(MAX_SR_INSTANCES / xRepeats) || 1));
          for (let xi = 0; xi < xRepeats; xi++) {
            for (let yi = 0; yi < yRepeats; yi++) {
              const dx = xi * sr.xDelta;
              const dy = yi * sr.yDelta;
              for (const cmd of blockCmds) {
                if (cmd.kind === 'flash') {
                  emit({ kind: 'flash', apertureId: cmd.apertureId, x: cmd.x + dx, y: cmd.y + dy, negative: cmd.negative });
                } else if (cmd.kind === 'shape') {
                  emit({ kind: 'shape', segments: translateSegs(cmd.segments, dx, dy), negative: cmd.negative });
                } else if (cmd.kind === 'stroke') {
                  emit({ kind: 'stroke', segments: translateSegs(cmd.segments, dx, dy), width: cmd.width, negative: cmd.negative });
                }
              }
            }
          }
        }
        break;
      }

      case 'graphic': {
        const targetX = resolveCoord(node.coords.x, curX, xInt, xDec);
        const targetY = resolveCoord(node.coords.y, curY, yInt, yDec);
        const effInterp = node.interpMode ?? interpMode;
        if (node.interpMode) interpMode = node.interpMode;

        if (node.op === 'move') {
          if (regionMode) flushRegion();
          curX = targetX;
          curY = targetY;
          break;
        }

        if (node.op === 'flash') {
          if (currentApertureId) {
            getCompiledAperture(currentApertureId);
            emit({ kind: 'flash', apertureId: currentApertureId, x: targetX, y: targetY, negative: polarity === 'clear' });
          }
          curX = targetX;
          curY = targetY;
          break;
        }

        // Interpolate (D01)
        const startPt: Point = [curX, curY];
        const endPt: Point = [targetX, targetY];

        if (effInterp === 'linear') {
          if (regionMode) {
            regionPath.push({ kind: 'line', start: startPt, end: endPt });
          } else {
            const w = getCurrentWidth();
            if (w > 0) {
              emit({ kind: 'stroke', segments: [{ kind: 'line', start: startPt, end: endPt }], width: w, negative: polarity === 'clear' });
            }
          }
        } else {
          // Arc interpolation
          const offsetI = resolveIJ(node.coords.i, xInt, xDec);
          const offsetJ = resolveIJ(node.coords.j, yInt, yDec);
          const clockwise = effInterp === 'cwArc';

          let centerX: number, centerY: number;

          if (quadrantMode === 'multi') {
            centerX = curX + offsetI;
            centerY = curY + offsetJ;
          } else {
            // Single quadrant: I/J are unsigned offsets, try all 4 quadrant combos
            const candidates: Point[] = [
              [curX + abs(offsetI), curY + abs(offsetJ)],
              [curX - abs(offsetI), curY + abs(offsetJ)],
              [curX + abs(offsetI), curY - abs(offsetJ)],
              [curX - abs(offsetI), curY - abs(offsetJ)],
            ];
            // Pick candidate closest to endpoint at same radius
            const startR = sqrt(offsetI * offsetI + offsetJ * offsetJ);
            let bestCenter = candidates[0];
            let bestErr = Infinity;
            for (const c of candidates) {
              const endR = dist(c, endPt);
              const err = abs(endR - dist(c, startPt));
              // Verify arc is <= 90°
              const a1 = atan2(startPt[1] - c[1], startPt[0] - c[0]);
              const a2 = atan2(endPt[1] - c[1], endPt[0] - c[0]);
              let sweep = clockwise ? a1 - a2 : a2 - a1;
              if (sweep < 0) sweep += TAU;
              if (sweep <= PI / 2 + 0.01 && err < bestErr) {
                bestErr = err;
                bestCenter = c;
              }
            }
            centerX = bestCenter[0];
            centerY = bestCenter[1];
          }

          const center: Point = [centerX, centerY];

          if (regionMode) {
            // Full circle check
            if (abs(startPt[0] - endPt[0]) < 1e-10 && abs(startPt[1] - endPt[1]) < 1e-10) {
              const r = dist(center, startPt);
              const midPt: Point = [centerX + (centerX - startPt[0]), centerY + (centerY - startPt[1])];
              regionPath.push({ kind: 'arc', start: startPt, end: midPt, center, clockwise });
              regionPath.push({ kind: 'arc', start: midPt, end: endPt, center, clockwise });
            } else {
              regionPath.push({ kind: 'arc', start: startPt, end: endPt, center, clockwise });
            }
          } else {
            const w = getCurrentWidth();
            if (w > 0) {
              // Full circle: split into two arcs
              if (abs(startPt[0] - endPt[0]) < 1e-10 && abs(startPt[1] - endPt[1]) < 1e-10) {
                const r = dist(center, startPt);
                const midPt: Point = [centerX + (centerX - startPt[0]), centerY + (centerY - startPt[1])];
                emit({
                  kind: 'stroke',
                  segments: [
                    { kind: 'arc', start: startPt, end: midPt, center, clockwise },
                    { kind: 'arc', start: midPt, end: endPt, center, clockwise },
                  ],
                  width: w,
                  negative: polarity === 'clear',
                });
              } else {
                emit({
                  kind: 'stroke',
                  segments: [{ kind: 'arc', start: startPt, end: endPt, center, clockwise }],
                  width: w,
                  negative: polarity === 'clear',
                });
              }
            }
          }
        }

        curX = targetX;
        curY = targetY;
        break;
      }

      case 'endOfFile':
        break;
      case 'comment':
        break;
    }
  }

  return { units, apertures: compiledApertures, commands, bounds };
}
