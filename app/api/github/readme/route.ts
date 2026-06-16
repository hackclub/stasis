import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/admin-auth';
import { Permission } from '@/lib/permissions';
import { ghFetch } from '@/lib/github-checks';

// Resolves a repo's README regardless of casing, extension, or location
// (readme.md, Readme.txt, docs in a subfolder, …). GitHub's /readme endpoint
// does the detection for us — the raw-content URL the client used before only
// matched an exact, root-level `README.md`.
export async function GET(request: Request) {
  const authCheck = await requirePermission(Permission.REVIEW_PROJECTS);
  if ('error' in authCheck) return authCheck.error;

  const { searchParams } = new URL(request.url);
  const owner = searchParams.get('owner');
  const repo = searchParams.get('repo');
  const ref = searchParams.get('ref');

  if (!owner || !repo) {
    return NextResponse.json({ error: 'owner and repo required' }, { status: 400 });
  }

  // Guard against injecting extra path segments / query params into the proxy URL.
  const safe = /^[A-Za-z0-9._-]+$/;
  if (!safe.test(owner) || !safe.test(repo) || (ref && !/^[A-Za-z0-9._/-]+$/.test(ref))) {
    return NextResponse.json({ error: 'invalid owner/repo/ref' }, { status: 400 });
  }

  const path = `repos/${owner}/${repo}/readme${ref ? `?ref=${encodeURIComponent(ref)}` : ''}`;
  const res = await ghFetch(path);
  if (!res.ok) {
    return NextResponse.json({ error: 'README not found' }, { status: res.status === 404 ? 404 : 502 });
  }

  const data = await res.json();
  if (!data.content || data.encoding !== 'base64') {
    return NextResponse.json({ error: 'README not found' }, { status: 404 });
  }

  const content = Buffer.from(data.content, 'base64').toString('utf-8');
  const filePath: string = data.path || 'README.md';
  const dir = filePath.includes('/') ? filePath.slice(0, filePath.lastIndexOf('/')) : '';

  return NextResponse.json({ content, path: filePath, dir });
}
