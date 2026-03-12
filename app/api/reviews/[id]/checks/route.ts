import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/admin-auth';
import { Permission } from '@/lib/permissions';
import prisma from '@/lib/prisma';

const GH_PROXY = 'https://gh-proxy.hackclub.com/gh';
const API_KEY = process.env.GH_PROXY_API_KEY || '';

interface CheckResult {
  key: string;
  label: string;
  passed: boolean;
  detail?: string;
}

function parseGitHubRepo(url: string): { owner: string; repo: string } | null {
  try {
    const u = new URL(url);
    if (!u.hostname.includes('github.com')) return null;
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return null;
    return { owner: parts[0], repo: parts[1].replace(/\.git$/, '') };
  } catch {
    return null;
  }
}

async function ghFetch(path: string) {
  const headers: Record<string, string> = {};
  if (API_KEY) headers['X-API-Key'] = API_KEY;
  const res = await fetch(`${GH_PROXY}/${path}`, { headers });
  return res;
}

async function getRepoTree(owner: string, repo: string): Promise<Array<{ path: string; type: string }> | null> {
  // Get default branch first
  const repoRes = await ghFetch(`repos/${owner}/${repo}`);
  if (!repoRes.ok) return null;
  const repoData = await repoRes.json();
  const branch = repoData.default_branch || 'main';

  // Get recursive tree
  const treeRes = await ghFetch(`repos/${owner}/${repo}/git/trees/${branch}?recursive=1`);
  if (!treeRes.ok) return null;
  const treeData = await treeRes.json();
  return treeData.tree || [];
}

async function getReadmeContent(owner: string, repo: string): Promise<string | null> {
  const res = await ghFetch(`repos/${owner}/${repo}/readme`);
  if (!res.ok) return null;
  const data = await res.json();
  if (data.content && data.encoding === 'base64') {
    return Buffer.from(data.content, 'base64').toString('utf-8');
  }
  return null;
}

const IMAGE_PATTERN = /!\[.*?\]\(.*?\)|<img\s+[^>]*src\s*=|\.png|\.jpg|\.jpeg|\.gif|\.webp|\.svg/i;

const THREE_D_EXTENSIONS = ['.stl', '.obj', '.3mf', '.iges', '.igs'];
const THREE_D_SOURCE_EXTENSIONS = ['.f3d', '.step', '.stp', '.fcstd', '.scad', '.blend'];
const FIRMWARE_EXTENSIONS = ['.ino', '.c', '.cpp', '.h', '.py', '.rs', '.uf2', '.hex', '.bin'];
const BOM_PATTERNS = ['bom', 'bill.of.materials', 'bill_of_materials', 'parts.list', 'parts_list'];

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authCheck = await requirePermission(Permission.REVIEW_PROJECTS);
    if ('error' in authCheck) return authCheck.error;

    const { id } = await params;

    // Get submission with project
    const submission = await prisma.projectSubmission.findUnique({
      where: { id },
      include: { project: { select: { githubRepo: true } } },
    });

    if (!submission) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const githubRepo = submission.project.githubRepo;
    const checks: CheckResult[] = [];

    const allFailedChecks = (reason: string) => {
      checks.push({ key: 'checks_01_github_valid', label: 'GitHub repo valid', passed: false, detail: reason });
      checks.push({ key: 'checks_02_readme_exists', label: 'README exists', passed: false, detail: reason });
      checks.push({ key: 'checks_03_readme_has_photo', label: 'README has photo', passed: false, detail: reason });
      checks.push({ key: 'checks_05_3d_file', label: '3D model file', passed: false, detail: reason });
      checks.push({ key: 'checks_06_3d_source', label: '3D source file (F3D/STEP)', passed: false, detail: reason });
      checks.push({ key: 'checks_07_firmware_file', label: 'Firmware file', passed: false, detail: reason });
      checks.push({ key: 'checks_08_bom_file', label: 'BOM file', passed: false, detail: reason });
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
    checks.push({
      key: 'checks_01_github_valid',
      label: 'GitHub repo valid',
      passed: repoValid,
      detail: repoValid ? `${owner}/${repo}` : `Repo not found (${repoRes.status})`,
    });

    if (!repoValid) {
      checks.push({ key: 'checks_02_readme_exists', label: 'README exists', passed: false, detail: 'Repo not accessible' });
      checks.push({ key: 'checks_03_readme_has_photo', label: 'README has photo', passed: false, detail: 'Repo not accessible' });
      checks.push({ key: 'checks_05_3d_file', label: '3D model file', passed: false, detail: 'Repo not accessible' });
      checks.push({ key: 'checks_06_3d_source', label: '3D source file (F3D/STEP)', passed: false, detail: 'Repo not accessible' });
      checks.push({ key: 'checks_07_firmware_file', label: 'Firmware file', passed: false, detail: 'Repo not accessible' });
      checks.push({ key: 'checks_08_bom_file', label: 'BOM file', passed: false, detail: 'Repo not accessible' });
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

    // Check 8: BOM file
    const foundBom = filePaths.filter((p) => BOM_PATTERNS.some((pat) => p.includes(pat)));
    checks.push({
      key: 'checks_08_bom_file',
      label: 'BOM file',
      passed: foundBom.length > 0,
      detail: foundBom.length > 0 ? foundBom.slice(0, 3).join(', ') : 'No BOM file found',
    });

    return NextResponse.json({ checks });
  } catch (err) {
    console.error('GitHub checks error:', err);
    return NextResponse.json({ error: 'Failed to run checks', detail: String(err) }, { status: 500 });
  }
}
