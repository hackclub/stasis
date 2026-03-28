const GH_PROXY = 'https://gh-proxy.hackclub.com/gh';
const API_KEY = process.env.GH_PROXY_API_KEY || '';

// --- Shared types ---

export interface CheckResult {
  key: string;
  label: string;
  passed: boolean;
  detail?: string;
}

export interface PreflightCheck {
  key: string;
  label: string;
  status: 'pass' | 'fail' | 'warn' | 'info';
  detail?: string;
  blocking?: boolean;
}

// --- File extension constants ---

export const THREE_D_EXTENSIONS = ['.stl', '.obj', '.3mf', '.iges', '.igs'];
export const THREE_D_SOURCE_EXTENSIONS = ['.f3d', '.step', '.stp', '.fcstd', '.scad', '.blend'];
export const FIRMWARE_EXTENSIONS = ['.ino', '.c', '.cpp', '.h', '.py', '.rs', '.uf2', '.hex', '.bin'];
export const PCB_SOURCE_EXTENSIONS = ['.kicad_pcb', '.kicad_sch', '.kicad_pro', '.brd', '.sch', '.pcbdoc', '.schdoc', '.fzz', '.fzpz'];
export const PCB_FAB_EXTENSIONS = ['.gbr', '.gbl', '.gtl', '.gbs', '.gts', '.gbo', '.gto', '.gko', '.drl', '.zip'];
export const IMAGE_PATTERN = /!\[.*?\]\(.*?\)|<img\s+[^>]*src\s*=|\.png|\.jpg|\.jpeg|\.gif|\.webp|\.svg/i;

// --- GitHub API helpers ---

export function parseGitHubRepo(url: string): { owner: string; repo: string } | null {
  try {
    const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    const u = new URL(normalized);
    if (!u.hostname.includes('github.com')) return null;
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return null;
    return { owner: parts[0], repo: parts[1].replace(/\.git$/, '') };
  } catch {
    return null;
  }
}

export async function ghFetch(path: string) {
  const headers: Record<string, string> = {};
  if (API_KEY) headers['X-API-Key'] = API_KEY;
  const res = await fetch(`${GH_PROXY}/${path}`, { headers });
  return res;
}

export async function getRepoTree(owner: string, repo: string): Promise<Array<{ path: string; type: string }> | null> {
  const repoRes = await ghFetch(`repos/${owner}/${repo}`);
  if (!repoRes.ok) return null;
  const repoData = await repoRes.json();
  const branch = repoData.default_branch || 'main';

  const treeRes = await ghFetch(`repos/${owner}/${repo}/git/trees/${branch}?recursive=1`);
  if (!treeRes.ok) return null;
  const treeData = await treeRes.json();
  return treeData.tree || [];
}

export async function getReadmeContent(owner: string, repo: string): Promise<string | null> {
  const res = await ghFetch(`repos/${owner}/${repo}/readme`);
  if (!res.ok) return null;
  const data = await res.json();
  if (data.content && data.encoding === 'base64') {
    return Buffer.from(data.content, 'base64').toString('utf-8');
  }
  return null;
}

// --- Preflight checks for user-facing submission ---

export async function runPreflightChecks(
  githubRepo: string | null,
  projectTypes: { pcb: boolean; cad: boolean; firmware: boolean },
): Promise<{ checks: PreflightCheck[]; canSubmit: boolean }> {
  const checks: PreflightCheck[] = [];

  // Check 1: GitHub repo is valid and accessible
  const parsed = githubRepo ? parseGitHubRepo(githubRepo) : null;
  if (!parsed) {
    checks.push({
      key: 'github_valid',
      label: 'GitHub repo invalid',
      status: 'fail',
      detail: githubRepo ? 'Could not parse GitHub URL' : 'No GitHub repo URL set',
      blocking: true,
    });
    return { checks, canSubmit: false };
  }

  const { owner, repo } = parsed;
  const repoRes = await ghFetch(`repos/${owner}/${repo}`);
  if (!repoRes.ok) {
    let detail = `Could not access repo "${owner}/${repo}"`;
    if (repoRes.status === 404) detail = `Repository "${owner}/${repo}" not found - it may be private or the URL is incorrect`;
    else if (repoRes.status === 403) detail = 'Rate limit exceeded - try again in a few minutes';
    else if (repoRes.status >= 500) detail = `GitHub API error (${repoRes.status}) - try again later`;

    checks.push({ key: 'github_valid', label: 'GitHub repo not accessible', status: 'fail', detail, blocking: true });
    return { checks, canSubmit: false };
  }

  checks.push({ key: 'github_valid', label: 'GitHub repo valid', status: 'pass', detail: `${owner}/${repo}` });

  // Fetch tree and README in parallel
  const [tree, readmeContent] = await Promise.all([
    getRepoTree(owner, repo),
    getReadmeContent(owner, repo),
  ]);

  const filePaths = (tree || []).map((f) => f.path.toLowerCase());

  // Check 2: README exists (blocking)
  const readmeExists = readmeContent !== null;
  checks.push({
    key: 'readme_exists',
    label: readmeExists ? 'README found' : 'README missing',
    status: readmeExists ? 'pass' : 'fail',
    detail: readmeExists ? undefined : 'No README found in repository - a README is required to submit',
    blocking: true,
  });

  // Check 3: README has photos (blocking)
  if (readmeExists) {
    const hasPhoto = IMAGE_PATTERN.test(readmeContent!);
    checks.push({
      key: 'readme_has_photo',
      label: hasPhoto ? 'README has photos' : 'README photos missing',
      status: hasPhoto ? 'pass' : 'fail',
      detail: hasPhoto ? undefined : 'No images found in README - photos of your project are required to submit',
      blocking: true,
    });
  } else {
    checks.push({
      key: 'readme_has_photo',
      label: 'README photos missing',
      status: 'fail',
      detail: 'No README to check',
      blocking: true,
    });
  }

  // Scan for file types
  const found3d = filePaths.filter((p) => THREE_D_EXTENSIONS.some((ext) => p.endsWith(ext)));
  const found3dSource = filePaths.filter((p) => THREE_D_SOURCE_EXTENSIONS.some((ext) => p.endsWith(ext)));
  const foundPcbSource = filePaths.filter((p) => PCB_SOURCE_EXTENSIONS.some((ext) => p.endsWith(ext)));
  const foundPcbFab = filePaths.filter((p) => PCB_FAB_EXTENSIONS.some((ext) => p.endsWith(ext)));
  const foundFirmware = filePaths.filter((p) => FIRMWARE_EXTENSIONS.some((ext) => p.endsWith(ext)));

  // Check 4: CAD source files (blocking if CAD project)
  if (projectTypes.cad) {
    if (found3dSource.length > 0) {
      checks.push({
        key: 'cad_source',
        label: 'CAD source files found',
        status: 'pass',
        detail: found3dSource.slice(0, 3).join(', '),
      });
    } else {
      checks.push({
        key: 'cad_source',
        label: 'CAD source files missing',
        status: 'fail',
        detail: 'No source design files (.STEP, .F3D, .SCAD, etc.) found - these are required for CAD projects',
        blocking: true,
      });
    }
    if (found3d.length > 0) {
      checks.push({
        key: 'cad_models',
        label: '3D model files found',
        status: 'pass',
        detail: found3d.slice(0, 3).join(', '),
      });
    }
  }

  // Check 5: PCB source files (blocking if PCB project)
  if (projectTypes.pcb) {
    if (foundPcbSource.length > 0) {
      checks.push({
        key: 'pcb_source',
        label: 'PCB source files found',
        status: 'pass',
        detail: foundPcbSource.slice(0, 3).join(', '),
      });
    } else {
      checks.push({
        key: 'pcb_source',
        label: 'PCB source files missing',
        status: 'fail',
        detail: 'No PCB source files (.kicad_pcb, .brd, etc.) found - these are required for PCB projects',
        blocking: true,
      });
    }
    if (foundPcbFab.length > 0) {
      checks.push({
        key: 'pcb_fab',
        label: 'PCB fabrication files found',
        status: 'pass',
        detail: `${foundPcbFab.length} file(s)`,
      });
    }
  }

  // Check 6: Firmware files (blocking if firmware project)
  if (projectTypes.firmware) {
    if (foundFirmware.length > 0) {
      checks.push({
        key: 'firmware',
        label: 'Firmware files found',
        status: 'pass',
        detail: `${foundFirmware.length} file(s)`,
      });
    } else {
      checks.push({
        key: 'firmware',
        label: 'Firmware files missing',
        status: 'fail',
        detail: 'No firmware files (.ino, .c, .cpp, .py, etc.) found - these are required for projects with firmware',
        blocking: true,
      });
    }
  }

  const canSubmit = !checks.some((c) => c.blocking && c.status === 'fail');
  return { checks, canSubmit };
}
