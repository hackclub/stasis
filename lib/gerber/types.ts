// Geometry primitives
export type Point = [x: number, y: number];

export type LineSeg = { kind: 'line'; start: Point; end: Point };
export type ArcSeg = {
  kind: 'arc';
  start: Point;
  end: Point;
  center: Point;
  clockwise: boolean;
};
export type PathSeg = LineSeg | ArcSeg;

export type BBox = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export function emptyBBox(): BBox {
  return { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
}

export function expandBBox(box: BBox, x: number, y: number): void {
  if (x < box.minX) box.minX = x;
  if (y < box.minY) box.minY = y;
  if (x > box.maxX) box.maxX = x;
  if (y > box.maxY) box.maxY = y;
}

export function mergeBBox(a: BBox, b: BBox): BBox {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

export function bboxValid(box: BBox): boolean {
  return isFinite(box.minX) && isFinite(box.minY) && isFinite(box.maxX) && isFinite(box.maxY);
}

// --- Parser AST ---

export type Units = 'mm' | 'in';
export type ZeroSuppression = 'leading' | 'trailing';
export type CoordMode = 'absolute' | 'incremental';
export type InterpMode = 'linear' | 'cwArc' | 'ccwArc';
export type QuadrantMode = 'single' | 'multi';
export type Polarity = 'dark' | 'clear';

export interface RawCoords {
  x?: string;
  y?: string;
  i?: string;
  j?: string;
}

export type ApertureShape =
  | { kind: 'circle'; diameter: number; holeDiameter?: number }
  | { kind: 'rect'; width: number; height: number; holeDiameter?: number }
  | { kind: 'obround'; width: number; height: number; holeDiameter?: number }
  | { kind: 'polygon'; outerDiameter: number; vertices: number; rotation: number; holeDiameter?: number }
  | { kind: 'macro'; name: string; params: number[] };

// Macro expression tree
export type MacroExpr =
  | { kind: 'num'; value: number }
  | { kind: 'var'; name: string }
  | { kind: 'op'; op: '+' | '-' | 'x' | '/'; left: MacroExpr; right: MacroExpr }
  | { kind: 'neg'; expr: MacroExpr };

export type MacroBlock =
  | { kind: 'comment'; text: string }
  | { kind: 'assignment'; variable: string; value: MacroExpr }
  | { kind: 'primitive'; code: number; modifiers: MacroExpr[] };

export type AstNode =
  | { type: 'formatSpec'; xInt: number; xDec: number; yInt: number; yDec: number; zeros: ZeroSuppression; mode: CoordMode }
  | { type: 'units'; units: Units }
  | { type: 'apertureDef'; code: string; shape: ApertureShape }
  | { type: 'apertureMacro'; name: string; blocks: MacroBlock[] }
  | { type: 'apertureBlock'; code: string; open: boolean }
  | { type: 'toolChange'; code: string }
  | { type: 'interpolateMode'; mode: InterpMode }
  | { type: 'quadrantMode'; mode: QuadrantMode }
  | { type: 'regionStart' }
  | { type: 'regionEnd' }
  | { type: 'loadPolarity'; polarity: Polarity }
  | { type: 'stepRepeatOpen'; xRepeats: number; yRepeats: number; xDelta: number; yDelta: number }
  | { type: 'stepRepeatClose' }
  | { type: 'graphic'; op: 'interp' | 'move' | 'flash'; coords: RawCoords; interpMode?: InterpMode }
  | { type: 'comment'; text: string }
  | { type: 'endOfFile' };

// --- Compiler output ---

export type DrawCmd =
  | { kind: 'shape'; segments: PathSeg[]; negative: boolean }
  | { kind: 'stroke'; segments: PathSeg[]; width: number; negative: boolean }
  | { kind: 'flash'; apertureId: string; x: number; y: number; negative: boolean };

export interface CompiledAperture {
  id: string;
  commands: DrawCmd[];
  bounds: BBox;
}

export interface CompilationResult {
  units: Units;
  apertures: Map<string, CompiledAperture>;
  commands: DrawCmd[];
  bounds: BBox;
}
