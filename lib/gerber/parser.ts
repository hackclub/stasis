import type {
  AstNode,
  ApertureShape,
  MacroBlock,
  MacroExpr,
  RawCoords,
  InterpMode,
  ZeroSuppression,
  CoordMode,
} from './types';

// --- Macro expression parser ---

function parseMacroExpr(input: string): MacroExpr {
  let pos = 0;
  const s = input.replace(/\s/g, '');

  function peek(): string { return s[pos] ?? ''; }
  function advance(): string { return s[pos++]; }

  function parseAtom(): MacroExpr {
    if (peek() === '(') {
      advance(); // skip (
      const expr = parseAddSub();
      if (peek() === ')') advance();
      return expr;
    }
    if (peek() === '$') {
      advance();
      let name = '';
      while (pos < s.length && /\d/.test(s[pos])) name += advance();
      return { kind: 'var', name: `$${name}` };
    }
    // unary minus
    if (peek() === '-') {
      advance();
      return { kind: 'neg', expr: parseAtom() };
    }
    // unary plus
    if (peek() === '+') advance();
    // number
    let num = '';
    while (pos < s.length && (/[\d.]/.test(s[pos]))) num += advance();
    return { kind: 'num', value: parseFloat(num) || 0 };
  }

  function parseMulDiv(): MacroExpr {
    let left = parseAtom();
    while (pos < s.length && (peek() === 'x' || peek() === 'X' || peek() === '/' || peek() === '*')) {
      const ch = advance();
      const op = (ch === '/' ? '/' : 'x') as '+' | '-' | 'x' | '/';
      left = { kind: 'op', op, left, right: parseAtom() };
    }
    return left;
  }

  function parseAddSub(): MacroExpr {
    let left = parseMulDiv();
    while (pos < s.length && (peek() === '+' || peek() === '-')) {
      const op = advance() as '+' | '-';
      left = { kind: 'op', op, left, right: parseMulDiv() };
    }
    return left;
  }

  return parseAddSub();
}

function parseMacroBlocks(body: string): MacroBlock[] {
  const blocks: MacroBlock[] = [];
  const parts = body.split('*').map(s => s.trim()).filter(Boolean);

  for (const part of parts) {
    if (part.startsWith('0 ') || part === '0') {
      blocks.push({ kind: 'comment', text: part.slice(2) });
      continue;
    }
    // Variable assignment: $N=expr
    const assignMatch = part.match(/^(\$\d+)=(.+)$/);
    if (assignMatch) {
      blocks.push({
        kind: 'assignment',
        variable: assignMatch[1],
        value: parseMacroExpr(assignMatch[2]),
      });
      continue;
    }
    // Primitive: code,mod1,mod2,...
    const mods = part.split(',');
    const code = parseInt(mods[0], 10);
    if (isNaN(code)) continue;
    blocks.push({
      kind: 'primitive',
      code,
      modifiers: mods.slice(1).map(m => parseMacroExpr(m)),
    });
  }
  return blocks;
}

// --- Aperture definition parsing ---

function parseApertureParams(paramStr: string): number[] {
  if (!paramStr) return [];
  return paramStr.split(/[Xx]/).map(s => parseFloat(s)).filter(v => !isNaN(v));
}

function parseApertureShape(shapeType: string, paramStr: string): ApertureShape {
  const params = parseApertureParams(paramStr);

  switch (shapeType) {
    case 'C':
      return { kind: 'circle', diameter: params[0] ?? 0, holeDiameter: params[1] };
    case 'R':
      return { kind: 'rect', width: params[0] ?? 0, height: params[1] ?? 0, holeDiameter: params[2] };
    case 'O':
      return { kind: 'obround', width: params[0] ?? 0, height: params[1] ?? 0, holeDiameter: params[2] };
    case 'P':
      return { kind: 'polygon', outerDiameter: params[0] ?? 0, vertices: params[1] ?? 3, rotation: params[2] ?? 0, holeDiameter: params[3] };
    default:
      // Macro reference
      return { kind: 'macro', name: shapeType, params };
  }
}

// --- Coordinate parsing from graphic commands ---

const COORD_RE = /([XYIJ])([+-]?\d+)/g;

function parseCoords(str: string): RawCoords {
  const coords: RawCoords = {};
  let m: RegExpExecArray | null;
  COORD_RE.lastIndex = 0;
  while ((m = COORD_RE.exec(str)) !== null) {
    const key = m[1].toLowerCase() as 'x' | 'y' | 'i' | 'j';
    coords[key] = m[2];
  }
  return coords;
}

// --- Main parser ---

export function parse(gerber: string): AstNode[] {
  const nodes: AstNode[] = [];

  // Normalize line endings, strip carriage returns
  const input = gerber.replace(/\r\n?/g, '\n');

  // Split into commands. Gerber uses * as command terminator.
  // Extended commands are wrapped in %...%. We need to handle them specially.
  let pos = 0;
  const len = input.length;

  while (pos < len) {
    // Skip whitespace and newlines between commands
    while (pos < len && /[\s\n]/.test(input[pos])) pos++;
    if (pos >= len) break;

    if (input[pos] === '%') {
      // Extended command block
      pos++; // skip %
      const start = pos;
      // Find closing %
      while (pos < len && input[pos] !== '%') pos++;
      const block = input.slice(start, pos).replace(/[\n\r]/g, '');
      pos++; // skip closing %

      parseExtendedBlock(block, nodes);
    } else {
      // Regular command — read until *
      const start = pos;
      while (pos < len && input[pos] !== '*' && input[pos] !== '%') pos++;
      const cmd = input.slice(start, pos).replace(/[\n\r\s]/g, '');
      if (input[pos] === '*') pos++; // skip *

      if (cmd.length > 0) {
        parseRegularCommand(cmd, nodes);
      }
    }
  }

  return nodes;
}

function parseExtendedBlock(block: string, nodes: AstNode[]): void {
  // Extended block may contain multiple *-separated commands
  // e.g. %AMTHERM*1,1,0.060,...*%
  const cmds = block.split('*').map(s => s.trim()).filter(Boolean);
  if (cmds.length === 0) return;

  const first = cmds[0];

  // Format Specification
  const fsMatch = first.match(/^FS([LT])([AI])X(\d)(\d)Y(\d)(\d)/);
  if (fsMatch) {
    nodes.push({
      type: 'formatSpec',
      zeros: (fsMatch[1] === 'L' ? 'leading' : 'trailing') as ZeroSuppression,
      mode: (fsMatch[2] === 'A' ? 'absolute' : 'incremental') as CoordMode,
      xInt: parseInt(fsMatch[3], 10),
      xDec: parseInt(fsMatch[4], 10),
      yInt: parseInt(fsMatch[5], 10),
      yDec: parseInt(fsMatch[6], 10),
    });
    return;
  }

  // Units
  const moMatch = first.match(/^MO(IN|MM)/);
  if (moMatch) {
    nodes.push({ type: 'units', units: moMatch[1] === 'IN' ? 'in' : 'mm' });
    return;
  }

  // Aperture Definition
  const adMatch = first.match(/^ADD(\d+)([A-Za-z_.$][\w.$-]*),?(.*)/);
  if (adMatch) {
    nodes.push({
      type: 'apertureDef',
      code: `D${adMatch[1]}`,
      shape: parseApertureShape(adMatch[2], adMatch[3]),
    });
    return;
  }

  // Aperture Macro
  const amMatch = first.match(/^AM([A-Za-z_.$][\w.$-]*)/);
  if (amMatch) {
    const macroBody = cmds.slice(1).join('*');
    nodes.push({
      type: 'apertureMacro',
      name: amMatch[1],
      blocks: parseMacroBlocks(macroBody),
    });
    return;
  }

  // Load Polarity
  const lpMatch = first.match(/^LP([DC])/);
  if (lpMatch) {
    nodes.push({ type: 'loadPolarity', polarity: lpMatch[1] === 'D' ? 'dark' : 'clear' });
    return;
  }

  // Step Repeat
  if (first.startsWith('SR')) {
    const srMatch = first.match(/^SRX(\d+)Y(\d+)I([+-]?[\d.]+)J([+-]?[\d.]+)/);
    if (srMatch) {
      nodes.push({
        type: 'stepRepeatOpen',
        xRepeats: parseInt(srMatch[1], 10),
        yRepeats: parseInt(srMatch[2], 10),
        xDelta: parseFloat(srMatch[3]),
        yDelta: parseFloat(srMatch[4]),
      });
    } else {
      nodes.push({ type: 'stepRepeatClose' });
    }
    return;
  }

  // Aperture Block
  if (first.startsWith('AB')) {
    const abMatch = first.match(/^ABD(\d+)/);
    if (abMatch) {
      nodes.push({ type: 'apertureBlock', code: `D${abMatch[1]}`, open: true });
    } else {
      nodes.push({ type: 'apertureBlock', code: '', open: false });
    }
    // Process any remaining commands in the block
    for (let i = 1; i < cmds.length; i++) {
      parseRegularCommand(cmds[i], nodes);
    }
    return;
  }

  // TF, TA, TO, TD — attribute commands (ignored for rendering)
  if (/^T[FAOD]/.test(first)) return;

  // IF, IN, IP, IR, AS, MI, OF, SF — deprecated/legacy (ignored)
  if (/^(IF|IN|IP|IR|AS|MI|OF|SF)/.test(first)) return;

  // LN, LR, LM, LS — layer name, rotation, mirroring, scaling
  // LR/LM/LS affect transforms but are rarely used; skip for now
  if (/^L[NRMS]/.test(first)) return;
}

function parseRegularCommand(cmd: string, nodes: AstNode[]): void {
  // End of file
  if (/^M0[02]/.test(cmd)) {
    nodes.push({ type: 'endOfFile' });
    return;
  }

  // Comment
  const commentMatch = cmd.match(/^G0?4(.*)/);
  if (commentMatch) {
    nodes.push({ type: 'comment', text: commentMatch[1] });
    return;
  }

  // Region mode
  if (cmd === 'G36') { nodes.push({ type: 'regionStart' }); return; }
  if (cmd === 'G37') { nodes.push({ type: 'regionEnd' }); return; }

  // Quadrant mode
  if (cmd === 'G74') { nodes.push({ type: 'quadrantMode', mode: 'single' }); return; }
  if (cmd === 'G75') { nodes.push({ type: 'quadrantMode', mode: 'multi' }); return; }

  // Deprecated unit commands (G70=inches, G71=mm)
  if (cmd === 'G70') { nodes.push({ type: 'units', units: 'in' }); return; }
  if (cmd === 'G71') { nodes.push({ type: 'units', units: 'mm' }); return; }

  // Deprecated coordinate mode (G90=absolute, G91=incremental)
  if (cmd === 'G90' || cmd === 'G91') return;

  // Standalone interpolation mode change
  if (/^G0?1$/.test(cmd)) { nodes.push({ type: 'interpolateMode', mode: 'linear' }); return; }
  if (/^G0?2$/.test(cmd)) { nodes.push({ type: 'interpolateMode', mode: 'cwArc' }); return; }
  if (/^G0?3$/.test(cmd)) { nodes.push({ type: 'interpolateMode', mode: 'ccwArc' }); return; }

  // Tool change: D10+ (not D01/D02/D03)
  const toolMatch = cmd.match(/^(?:G54)?D(\d+)$/);
  if (toolMatch) {
    const code = parseInt(toolMatch[1], 10);
    if (code >= 10) {
      nodes.push({ type: 'toolChange', code: `D${code}` });
      return;
    }
  }

  // Graphic command: optional G-code prefix, coordinates, optional D-code
  // Examples: G01X100Y200D01, X100Y200D03, G02X100Y200I50J0D01, D01
  const graphicMatch = cmd.match(
    /^(?:G0?([1-3]))?((?:[XYIJ][+-]?\d+)*)(D0?[1-3])?$/
  );
  if (graphicMatch) {
    const gCode = graphicMatch[1];
    const coordStr = graphicMatch[2] || '';
    const dCode = graphicMatch[3];

    let interpMode: InterpMode | undefined;
    if (gCode === '1') interpMode = 'linear';
    else if (gCode === '2') interpMode = 'cwArc';
    else if (gCode === '3') interpMode = 'ccwArc';

    let op: 'interp' | 'move' | 'flash' | undefined;
    if (dCode) {
      const d = parseInt(dCode.replace('D0', 'D').replace('D', ''), 10);
      if (d === 1) op = 'interp';
      else if (d === 2) op = 'move';
      else if (d === 3) op = 'flash';
    }

    // If we have only a G-code and no coordinates/D-code, it's just a mode change
    if (!op && !coordStr && interpMode) {
      nodes.push({ type: 'interpolateMode', mode: interpMode });
      return;
    }

    if (op) {
      nodes.push({
        type: 'graphic',
        op,
        coords: parseCoords(coordStr),
        interpMode,
      });
      return;
    }

    // Has coordinates but no D-code — some generators omit D01 for continuation
    if (coordStr) {
      nodes.push({
        type: 'graphic',
        op: 'interp',
        coords: parseCoords(coordStr),
        interpMode,
      });
      return;
    }
  }

  // Unrecognized — silently skip
}
