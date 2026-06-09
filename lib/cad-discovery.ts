import prisma from '@/lib/prisma';
import {
  parseGitHubRepo,
  ghFetch,
  THREE_D_EXTENSIONS,
  THREE_D_SOURCE_EXTENSIONS,
  PCB_SOURCE_EXTENSIONS,
  PCB_FAB_EXTENSIONS,
  FIRMWARE_EXTENSIONS,
  BOM_PATTERN,
} from '@/lib/github-checks';

export type CadFileKind = 'kicad' | '3d' | '3d-source' | 'pcb-source' | 'pcb-fab' | 'firmware' | 'easyeda' | 'bom';

export interface CadFile {
  path: string;
  size: number;
  kind: CadFileKind;
  extension: string;
}

export interface KiCadProject {
  name: string;
  dir: string;
  projectFile: string | null;
  schematics: string[];
  boards: string[];
}

export interface GerberGroup {
  dir: string;
  files: string[];
}

export interface CadFilesPayload {
  owner: string;
  repo: string;
  branch: string;
  files: CadFile[];
  kicadProjects: KiCadProject[];
  gerberGroups: GerberGroup[];
}

const KICAD_EXTENSIONS = ['.kicad_pro', '.kicad_sch', '.kicad_pcb'];
const EASYEDA_EXTENSIONS = ['.epro', '.eproproject', '.esch', '.epcb'];

function classifyFile(path: string): { kind: CadFileKind; extension: string } | null {
  const lower = path.toLowerCase();
  if (BOM_PATTERN.test(lower)) return { kind: 'bom', extension: '.csv' };
  for (const ext of KICAD_EXTENSIONS) {
    if (lower.endsWith(ext)) return { kind: 'kicad', extension: ext };
  }
  for (const ext of EASYEDA_EXTENSIONS) {
    if (lower.endsWith(ext)) return { kind: 'easyeda', extension: ext };
  }
  for (const ext of THREE_D_EXTENSIONS) {
    if (lower.endsWith(ext)) return { kind: '3d', extension: ext };
  }
  for (const ext of THREE_D_SOURCE_EXTENSIONS) {
    if (lower.endsWith(ext)) return { kind: '3d-source', extension: ext };
  }
  for (const ext of PCB_SOURCE_EXTENSIONS) {
    if (lower.endsWith(ext) && !KICAD_EXTENSIONS.some((k) => lower.endsWith(k))) {
      return { kind: 'pcb-source', extension: ext };
    }
  }
  for (const ext of PCB_FAB_EXTENSIONS) {
    if (lower.endsWith(ext)) return { kind: 'pcb-fab', extension: ext };
  }
  for (const ext of FIRMWARE_EXTENSIONS) {
    if (lower.endsWith(ext)) return { kind: 'firmware', extension: ext };
  }
  return null;
}

function groupGerberFiles(files: CadFile[]): GerberGroup[] {
  const byDir = new Map<string, string[]>();
  for (const f of files) {
    if (f.kind !== 'pcb-fab') continue;
    const slash = f.path.lastIndexOf('/');
    const dir = slash === -1 ? '' : f.path.slice(0, slash);
    const arr = byDir.get(dir) ?? [];
    arr.push(f.path);
    byDir.set(dir, arr);
  }
  return [...byDir.entries()]
    .map(([dir, paths]) => ({ dir, files: paths.sort() }))
    .sort((a, b) => a.dir.localeCompare(b.dir));
}

function groupKicadProjects(files: string[]): KiCadProject[] {
  const byDir: Record<string, { pro: string[]; sch: string[]; pcb: string[] }> = {};

  for (const path of files) {
    const lower = path.toLowerCase();
    const isPro = lower.endsWith('.kicad_pro');
    const isSch = lower.endsWith('.kicad_sch');
    const isPcb = lower.endsWith('.kicad_pcb');
    if (!isPro && !isSch && !isPcb) continue;

    const slash = path.lastIndexOf('/');
    const dir = slash === -1 ? '' : path.slice(0, slash);
    if (!byDir[dir]) byDir[dir] = { pro: [], sch: [], pcb: [] };
    if (isPro) byDir[dir].pro.push(path);
    else if (isSch) byDir[dir].sch.push(path);
    else if (isPcb) byDir[dir].pcb.push(path);
  }

  const projects: KiCadProject[] = [];
  for (const [dir, group] of Object.entries(byDir)) {
    if (group.pro.length > 0) {
      for (const pro of group.pro) {
        const baseName = pro.slice(pro.lastIndexOf('/') + 1).replace(/\.kicad_pro$/i, '');
        projects.push({
          name: baseName || dir || 'project',
          dir,
          projectFile: pro,
          schematics: group.sch,
          boards: group.pcb,
        });
      }
    } else {
      for (const sch of group.sch) {
        const baseName = sch.slice(sch.lastIndexOf('/') + 1).replace(/\.kicad_sch$/i, '');
        projects.push({
          name: baseName || dir || 'schematic',
          dir,
          projectFile: null,
          schematics: [sch],
          boards: [],
        });
      }
      for (const pcb of group.pcb) {
        const baseName = pcb.slice(pcb.lastIndexOf('/') + 1).replace(/\.kicad_pcb$/i, '');
        projects.push({
          name: baseName || dir || 'board',
          dir,
          projectFile: null,
          schematics: [],
          boards: [pcb],
        });
      }
    }
  }

  projects.sort((a, b) => (a.dir + a.name).localeCompare(b.dir + b.name));
  return projects;
}

export async function discoverCadFiles(githubRepo: string | null): Promise<CadFilesPayload | null> {
  const parsed = githubRepo ? parseGitHubRepo(githubRepo) : null;
  if (!parsed) return null;

  const { owner, repo } = parsed;
  const repoRes = await ghFetch(`repos/${owner}/${repo}`);
  if (!repoRes.ok) return null;
  const repoData = await repoRes.json();
  const branch: string = repoData.default_branch || 'main';

  const treeRes = await ghFetch(`repos/${owner}/${repo}/git/trees/${branch}?recursive=1`);
  if (!treeRes.ok) return null;
  const treeData = await treeRes.json();
  const tree: Array<{ path: string; type: string; size?: number }> = treeData.tree || [];

  const files: CadFile[] = [];
  const kicadPaths: string[] = [];

  for (const entry of tree) {
    if (entry.type !== 'blob') continue;
    const classification = classifyFile(entry.path);
    if (!classification) continue;
    files.push({
      path: entry.path,
      size: entry.size ?? 0,
      kind: classification.kind,
      extension: classification.extension,
    });
    if (classification.kind === 'kicad') {
      kicadPaths.push(entry.path);
    }
  }

  const kicadProjects = groupKicadProjects(kicadPaths);
  const gerberGroups = groupGerberFiles(files);

  return { owner, repo, branch, files, kicadProjects, gerberGroups };
}

export async function cacheCadFiles(submissionId: string, githubRepo: string | null) {
  try {
    const payload = await discoverCadFiles(githubRepo);
    await prisma.projectSubmission.update({
      where: { id: submissionId },
      data: {
        cadFiles: payload as object ?? undefined,
        cadFilesAt: new Date(),
      },
    });
  } catch (err) {
    console.error('[cad-discovery] failed for submission', submissionId, err);
  }
}
