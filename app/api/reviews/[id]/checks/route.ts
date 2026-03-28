import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/admin-auth';
import { Permission } from '@/lib/permissions';
import prisma from '@/lib/prisma';
import {
  type CheckResult,
  parseGitHubRepo,
  ghFetch,
  getRepoTree,
  getReadmeContent,
  IMAGE_PATTERN,
  THREE_D_EXTENSIONS,
  THREE_D_SOURCE_EXTENSIONS,
  FIRMWARE_EXTENSIONS,
  PCB_SOURCE_EXTENSIONS,
  PCB_FAB_EXTENSIONS,
} from '@/lib/github-checks';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authCheck = await requirePermission(Permission.REVIEW_PROJECTS);
    if ('error' in authCheck) return authCheck.error;

    const { id } = await params;

    // Try as project ID first (matches how the review route works), then submission ID
    let githubRepo: string | null = null;
    const project = await prisma.project.findUnique({
      where: { id },
      select: { githubRepo: true, deletedAt: true },
    });

    if (project && !project.deletedAt) {
      githubRepo = project.githubRepo;
    } else if (project && project.deletedAt) {
      return NextResponse.json({ error: 'Project not found - it may have been deleted' }, { status: 404 });
    } else {
      const submission = await prisma.projectSubmission.findUnique({
        where: { id },
        include: { project: { select: { githubRepo: true } } },
      });
      if (submission) {
        githubRepo = submission.project.githubRepo;
      } else {
        return NextResponse.json({ error: 'Project not found - it may have been deleted' }, { status: 404 });
      }
    }
    const checks: CheckResult[] = [];

    const allFailedChecks = (reason: string) => {
      checks.push({ key: 'checks_01_github_valid', label: 'GitHub repo valid', passed: false, detail: reason });
      checks.push({ key: 'checks_02_readme_exists', label: 'README exists', passed: false, detail: reason });
      checks.push({ key: 'checks_03_readme_has_photo', label: 'README has photo', passed: false, detail: reason });
      checks.push({ key: 'checks_05_3d_file', label: '3D model file', passed: false, detail: reason });
      checks.push({ key: 'checks_06_3d_source', label: '3D source file (F3D/STEP)', passed: false, detail: reason });
      checks.push({ key: 'checks_07_firmware_file', label: 'Firmware file', passed: false, detail: reason });
      checks.push({ key: 'checks_09_pcb_source', label: 'PCB source file', passed: false, detail: reason });
      checks.push({ key: 'checks_10_pcb_fab', label: 'PCB fabrication files', passed: false, detail: reason });
    };

    // Check 1: GitHub URL is valid and repo exists
    const parsed = githubRepo ? parseGitHubRepo(githubRepo) : null;
    if (!parsed) {
      allFailedChecks(githubRepo ? 'Could not parse GitHub URL' : 'No GitHub repo URL');
      return NextResponse.json({ checks });
    }

    const { owner, repo } = parsed;

    // Validate repo exists
    const repoRes = await ghFetch(`repos/${owner}/${repo}`);
    const repoValid = repoRes.ok;
    let repoDetail = `${owner}/${repo}`;
    if (!repoValid) {
      if (repoRes.status === 404) {
        repoDetail = `Repository "${owner}/${repo}" not found - it may be private, deleted, or the URL is incorrect`;
      } else if (repoRes.status === 403) {
        repoDetail = `Access denied to "${owner}/${repo}" - rate limit may be exceeded or the repo requires authentication`;
      } else if (repoRes.status >= 500) {
        repoDetail = `GitHub API error (${repoRes.status}) - try again in a few minutes`;
      } else {
        repoDetail = `Could not access repo "${owner}/${repo}" (HTTP ${repoRes.status})`;
      }
    }
    checks.push({
      key: 'checks_01_github_valid',
      label: 'GitHub repo valid',
      passed: repoValid,
      detail: repoDetail,
    });

    if (!repoValid) {
      const failDetail = repoRes.status === 404
        ? 'Repo not found'
        : repoRes.status === 403
          ? 'Access denied'
          : `GitHub unavailable (${repoRes.status})`;
      checks.push({ key: 'checks_02_readme_exists', label: 'README exists', passed: false, detail: failDetail });
      checks.push({ key: 'checks_03_readme_has_photo', label: 'README has photo', passed: false, detail: failDetail });
      checks.push({ key: 'checks_05_3d_file', label: '3D model file', passed: false, detail: failDetail });
      checks.push({ key: 'checks_06_3d_source', label: '3D source file (F3D/STEP)', passed: false, detail: failDetail });
      checks.push({ key: 'checks_07_firmware_file', label: 'Firmware file', passed: false, detail: failDetail });
      checks.push({ key: 'checks_09_pcb_source', label: 'PCB source file', passed: false, detail: failDetail });
      checks.push({ key: 'checks_10_pcb_fab', label: 'PCB fabrication files', passed: false, detail: failDetail });
      return NextResponse.json({ checks });
    }

    // Get file tree and README in parallel
    const [tree, readmeContent] = await Promise.all([
      getRepoTree(owner, repo),
      getReadmeContent(owner, repo),
    ]);

    const files = tree || [];
    const filePaths = files.map((f) => f.path.toLowerCase());

    // Check 2: README exists
    const readmeExists = readmeContent !== null;
    checks.push({
      key: 'checks_02_readme_exists',
      label: 'README exists',
      passed: readmeExists,
    });

    // Check 3: README has photo/image
    const readmeHasPhoto = readmeExists && readmeContent ? IMAGE_PATTERN.test(readmeContent) : false;
    checks.push({
      key: 'checks_03_readme_has_photo',
      label: 'README has photo',
      passed: readmeHasPhoto,
      detail: readmeHasPhoto ? undefined : readmeExists ? 'No images found in README' : 'No README',
    });

    // Check 5: 3D model files
    const found3d = filePaths.filter((p) => THREE_D_EXTENSIONS.some((ext) => p.endsWith(ext)));
    checks.push({
      key: 'checks_05_3d_file',
      label: '3D model file',
      passed: found3d.length > 0,
      detail: found3d.length > 0 ? found3d.slice(0, 3).join(', ') : 'No STL/OBJ/3MF files found',
    });

    // Check 6: 3D source files (F3D, STEP)
    const found3dSource = filePaths.filter((p) => THREE_D_SOURCE_EXTENSIONS.some((ext) => p.endsWith(ext)));
    checks.push({
      key: 'checks_06_3d_source',
      label: '3D source file (F3D/STEP)',
      passed: found3dSource.length > 0,
      detail: found3dSource.length > 0 ? found3dSource.slice(0, 3).join(', ') : 'No F3D/STEP/SCAD files found',
    });

    // Check 7: Firmware files
    const foundFirmware = filePaths.filter((p) => FIRMWARE_EXTENSIONS.some((ext) => p.endsWith(ext)));
    checks.push({
      key: 'checks_07_firmware_file',
      label: 'Firmware file',
      passed: foundFirmware.length > 0,
      detail: foundFirmware.length > 0 ? `${foundFirmware.length} file(s)` : 'No firmware files found',
    });

    // Check 9: PCB source files (KiCad, Altium, Fritzing)
    const foundPcbSource = filePaths.filter((p) => PCB_SOURCE_EXTENSIONS.some((ext) => p.endsWith(ext)));
    checks.push({
      key: 'checks_09_pcb_source',
      label: 'PCB source file',
      passed: foundPcbSource.length > 0,
      detail: foundPcbSource.length > 0 ? foundPcbSource.slice(0, 3).join(', ') : 'No KiCad/Altium/Fritzing files found',
    });

    // Check 10: PCB fabrication files (Gerbers, drill files)
    const foundPcbFab = filePaths.filter((p) => PCB_FAB_EXTENSIONS.some((ext) => p.endsWith(ext)));
    checks.push({
      key: 'checks_10_pcb_fab',
      label: 'PCB fabrication files',
      passed: foundPcbFab.length > 0,
      detail: foundPcbFab.length > 0 ? `${foundPcbFab.length} file(s)` : 'No Gerber/drill files found',
    });

    return NextResponse.json({ checks });
  } catch (err) {
    console.error('GitHub checks error:', err);
    const message = err instanceof TypeError && String(err).includes('fetch')
      ? 'Could not connect to GitHub - the proxy may be down or there is a network issue'
      : 'Failed to run GitHub repo checks';
    return NextResponse.json({ error: message, detail: String(err) }, { status: 500 });
  }
}
