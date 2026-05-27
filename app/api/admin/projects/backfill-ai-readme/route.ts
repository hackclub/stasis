import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/admin-auth";
import { Permission } from "@/lib/permissions";
import { runAiReadmeCheck } from "@/lib/ai-readme-check";

/**
 * POST /api/admin/projects/backfill-ai-readme
 *
 * Backfills the AI README audit for submissions that were created BEFORE the
 * feature shipped and are still sitting in the review queue.
 *
 * Body (all optional):
 *   commit:      false (default — dry run, just preview candidates)
 *                true  — actually run the audit and write verdicts
 *   limit:       max submissions to process this call (default 25). Run again
 *                if you need more — each call is bounded so the HTTP request
 *                doesn't time out.
 *   concurrency: number of audits to run in parallel (default 3). Anthropic
 *                requests take a few seconds each; modest concurrency keeps the
 *                wall-clock down without hammering the API.
 *
 * Scoping: only submissions whose project's relevant stage is currently
 * `in_review` AND whose `aiReadmeStatus` is NULL (i.e. never audited). This
 * deliberately skips submissions that already failed/skipped — re-run those
 * one-off from the reviewer UI's Re-run button.
 */
export async function POST(request: Request) {
  const authCheck = await requirePermission(Permission.REVIEW_PROJECTS);
  if ("error" in authCheck) return authCheck.error;

  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const commit = body.commit === true;
  const limit =
    typeof body.limit === "number" && body.limit > 0 && body.limit <= 200
      ? Math.floor(body.limit)
      : 25;
  const concurrency =
    typeof body.concurrency === "number" && body.concurrency > 0 && body.concurrency <= 10
      ? Math.floor(body.concurrency)
      : 3;

  // Find candidate submissions: never audited, project still in review for the
  // submission's stage.
  const candidates = await prisma.projectSubmission.findMany({
    where: {
      aiReadmeStatus: null,
      OR: [
        { stage: "DESIGN", project: { designStatus: "in_review", deletedAt: null } },
        { stage: "BUILD", project: { buildStatus: "in_review", deletedAt: null } },
      ],
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      stage: true,
      createdAt: true,
      project: {
        select: { id: true, title: true, githubRepo: true },
      },
    },
  });

  const totalCandidates = candidates.length;
  const batch = candidates.slice(0, limit);

  if (!commit) {
    return NextResponse.json({
      dryRun: true,
      totalCandidates,
      wouldProcess: batch.length,
      remaining: totalCandidates - batch.length,
      sample: batch.map((c) => ({
        submissionId: c.id,
        stage: c.stage,
        projectId: c.project.id,
        title: c.project.title,
        githubRepo: c.project.githubRepo,
        submittedAt: c.createdAt,
      })),
    });
  }

  // Mark this batch as pending up front so concurrent reviewer views show
  // the in-flight state instead of "Run now".
  await prisma.projectSubmission.updateMany({
    where: { id: { in: batch.map((c) => c.id) } },
    data: { aiReadmeStatus: "pending" },
  });

  // Bounded-concurrency worker pool. runAiReadmeCheck never throws — it writes
  // failure status to the row itself — so we just await all workers.
  const queue = [...batch];
  const processed: string[] = [];
  async function worker() {
    while (queue.length > 0) {
      const next = queue.shift();
      if (!next) return;
      await runAiReadmeCheck(next.id);
      processed.push(next.id);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, batch.length) }, worker));

  // Re-read statuses to summarize the batch outcome.
  const after = await prisma.projectSubmission.findMany({
    where: { id: { in: processed } },
    select: { id: true, aiReadmeStatus: true },
  });
  const summary = after.reduce<Record<string, number>>((acc, row) => {
    const key = row.aiReadmeStatus ?? "null";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  return NextResponse.json({
    dryRun: false,
    processed: processed.length,
    remaining: totalCandidates - processed.length,
    summary,
    ids: processed,
  });
}
