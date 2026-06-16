import prisma from './prisma';
import { Prisma } from '@/app/generated/prisma/client';

// Cross-admin "last sync" history. One row per successful run; the attendance
// dashboard reads the most-recent row per syncKey to show "last sync N min ago".
// Keep keys stable — the UI matches them by literal string.
export type SyncKey = 'attend' | 'slack' | 'loops_categories' | 'replies' | 'review_checkin';

export async function recordSyncRun(
  syncKey: SyncKey,
  result: Prisma.InputJsonValue | null,
  actorId: string | null,
): Promise<void> {
  try {
    await prisma.syncRunLog.create({
      data: { syncKey, result: result ?? Prisma.JsonNull, actorId: actorId ?? null },
    });
  } catch (err) {
    // Logging is best-effort — never fail the sync because we couldn't write
    // the audit row. Surface to the server logs so it's still discoverable.
    console.error(`Failed to record sync run for ${syncKey}:`, err);
  }
}

export interface LatestSyncRun {
  syncKey: SyncKey;
  lastRunAt: string;
  result: unknown;
  actor: { id: string; name: string | null; email: string } | null;
}

/** Fetches the most-recent successful run per known syncKey. Missing keys are
 *  omitted from the returned array. */
export async function getLatestSyncRuns(): Promise<LatestSyncRun[]> {
  const keys: SyncKey[] = ['attend', 'slack', 'loops_categories', 'replies'];
  const rows = await Promise.all(
    keys.map((k) =>
      prisma.syncRunLog.findFirst({
        where: { syncKey: k },
        orderBy: { createdAt: 'desc' },
        include: { actor: { select: { id: true, name: true, email: true } } },
      }),
    ),
  );
  const out: LatestSyncRun[] = [];
  for (let i = 0; i < keys.length; i++) {
    const row = rows[i];
    if (!row) continue;
    out.push({
      syncKey: keys[i],
      lastRunAt: row.createdAt.toISOString(),
      result: row.result,
      actor: row.actor,
    });
  }
  return out;
}
