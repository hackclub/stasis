import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/admin-auth';
import { Permission } from '@/lib/permissions';
import prisma from '@/lib/prisma';
import { parseGitHubRepo, ghFetch } from '@/lib/github-checks';

export interface KiCadProject {
  name: string;
  dir: string;
  projectFile: string | null;
  schematics: string[];
  boards: string[];
}

export interface KiCadFilesResponse {
  owner: string;
  repo: string;
  branch: string;
  projects: KiCadProject[];
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authCheck = await requirePermission(Permission.REVIEW_PROJECTS);
    if ('error' in authCheck) return authCheck.error;

    const { id } = await params;

    // Resolve the GitHub repo from either a project ID or a submission ID
    // (matches the lookup pattern used by the checks route).
    let githubRepo: string | null = null;
    const project = await prisma.project.findUnique({
      where: { id },
      select: { githubRepo: true, deletedAt: true },
    });

    if (project && !project.deletedAt) {
      githubRepo = project.githubRepo;
    } else if (project && project.deletedAt) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    } else {
      const submission = await prisma.projectSubmission.findUnique({
        where: { id },
        include: { project: { select: { githubRepo: true } } },
      });
      if (!submission) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      }
      githubRepo = submission.project.githubRepo;
    }

    const parsed = githubRepo ? parseGitHubRepo(githubRepo) : null;
    if (!parsed) {
      return NextResponse.json({ error: 'No GitHub repo' }, { status: 400 });
    }

    const { owner, repo } = parsed;
    const repoRes = await ghFetch(`repos/${owner}/${repo}`);
    if (!repoRes.ok) {
      return NextResponse.json({ error: `GitHub repo inaccessible (${repoRes.status})` }, { status: 502 });
    }
    const repoData = await repoRes.json();
    const branch: string = repoData.default_branch || 'main';

    const treeRes = await ghFetch(`repos/${owner}/${repo}/git/trees/${branch}?recursive=1`);
    if (!treeRes.ok) {
      return NextResponse.json({ error: `GitHub tree unavailable (${treeRes.status})` }, { status: 502 });
    }
    const treeData = await treeRes.json();
    const tree: Array<{ path: string; type: string }> = treeData.tree || [];

    const files = tree.filter((f) => f.type === 'blob').map((f) => f.path);

    // Group by directory: a directory with a .kicad_pro file forms a project
    // bundle (include all sibling .kicad_sch + .kicad_pcb). Orphan files (no
    // sibling .kicad_pro) become their own standalone "project" so the
    // reviewer can still open them in KiCanvas.
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
        // No project file here — emit one entry per schematic and per board
        // so they render independently.
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

    // Stable ordering — directory first, then name.
    projects.sort((a, b) => (a.dir + a.name).localeCompare(b.dir + b.name));

    const response: KiCadFilesResponse = { owner, repo, branch, projects };
    return NextResponse.json(response);
  } catch (err) {
    console.error('KiCad files lookup error:', err);
    return NextResponse.json({ error: 'Failed to list KiCad files', detail: String(err) }, { status: 500 });
  }
}
