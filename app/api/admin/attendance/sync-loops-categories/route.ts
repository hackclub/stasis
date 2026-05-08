import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/admin-auth';
import { Permission } from '@/lib/permissions';
import { syncLoopsCategories } from '@/lib/loops-categories';
import { recordSyncRun } from '@/lib/sync-run-log';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * POST /api/admin/attendance/sync-loops-categories
 *
 * Pushes every /admin/attendance candidate's email into the Airtable
 * "Loops Categories" table, tagging girls in the CONTACTED column with
 * `Loops - stasisIsGirlReachedOut = "1"` (others get an empty value).
 *
 * Idempotent — safe to wire to cron.
 */
export async function POST() {
  const authCheck = await requirePermission(Permission.MANAGE_ATTENDANCE);
  if (authCheck.error) return authCheck.error;

  try {
    const result = await syncLoopsCategories();
    await recordSyncRun('loops_categories', {
      scanned: result.scanned,
      created: result.created,
      updated: result.updated,
      unchanged: result.unchanged,
      girlsReachedOut: result.girlsReachedOut,
      skippedNoWriteAccess: result.skippedNoWriteAccess,
      errorCount: result.errors.length,
    }, authCheck.session?.user.id ?? null);
    return NextResponse.json({ ...result, syncedAt: new Date().toISOString() });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
