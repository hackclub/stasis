import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin-auth";
import { Permission } from "@/lib/permissions";
import prisma from "@/lib/prisma";
import {
  computeAiReadmeVerdict,
  type AiReadmeVerdict,
} from "@/lib/ai-readme-check";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authCheck = await requirePermission(Permission.REVIEW_PROJECTS);
    if ("error" in authCheck) return authCheck.error;

    const { id } = await params;
    const refresh = new URL(request.url).searchParams.get("refresh") === "1";

    // Same id-can-be-either logic as /checks: route param may be a project ID
    // or a submission ID. We need the submission row to read/write the verdict.
    let submissionId: string | null = null;
    let githubRepo: string | null = null;
    let projectTitle = "";
    let cached: {
      verdict: AiReadmeVerdict | null;
      verdictAt: Date | null;
      status: string | null;
    } = { verdict: null, verdictAt: null, status: null };

    const submission = await prisma.projectSubmission.findUnique({
      where: { id },
      include: {
        project: {
          select: { githubRepo: true, title: true, deletedAt: true },
        },
      },
    });

    if (submission) {
      if (submission.project.deletedAt) {
        return NextResponse.json(
          { error: "Project not found - it may have been deleted" },
          { status: 404 }
        );
      }
      submissionId = submission.id;
      githubRepo = submission.project.githubRepo;
      projectTitle = submission.project.title;
      cached = {
        verdict: (submission.aiReadmeVerdict as AiReadmeVerdict | null) ?? null,
        verdictAt: submission.aiReadmeVerdictAt,
        status: submission.aiReadmeStatus,
      };
    } else {
      const project = await prisma.project.findUnique({
        where: { id },
        select: { githubRepo: true, title: true, deletedAt: true },
      });
      if (!project || project.deletedAt) {
        return NextResponse.json(
          { error: "Project not found - it may have been deleted" },
          { status: 404 }
        );
      }
      githubRepo = project.githubRepo;
      projectTitle = project.title;

      const latest = await prisma.projectSubmission.findFirst({
        where: { projectId: id },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          aiReadmeVerdict: true,
          aiReadmeVerdictAt: true,
          aiReadmeStatus: true,
        },
      });
      if (latest) {
        submissionId = latest.id;
        cached = {
          verdict: (latest.aiReadmeVerdict as AiReadmeVerdict | null) ?? null,
          verdictAt: latest.aiReadmeVerdictAt,
          status: latest.aiReadmeStatus,
        };
      }
    }

    // Default: return cached. Reviewer hits refresh to re-run synchronously.
    if (!refresh) {
      return NextResponse.json({
        verdict: cached.verdict,
        verdictAt: cached.verdictAt,
        status: cached.status,
        cached: true,
      });
    }

    if (!submissionId) {
      return NextResponse.json(
        { error: "No submission exists for this project yet" },
        { status: 404 }
      );
    }

    // Synchronous re-run when reviewer explicitly asks. Mark pending first so
    // anyone else watching sees the in-flight state.
    await prisma.projectSubmission.update({
      where: { id: submissionId },
      data: { aiReadmeStatus: "pending" },
    });

    if (!process.env.ANTHROPIC_API_KEY) {
      await prisma.projectSubmission.update({
        where: { id: submissionId },
        data: {
          aiReadmeStatus: "skipped",
          aiReadmeVerdictAt: new Date(),
          aiReadmeVerdict: { reason: "ANTHROPIC_API_KEY not configured" },
        },
      });
      return NextResponse.json({
        verdict: null,
        verdictAt: new Date(),
        status: "skipped",
        cached: false,
        reason: "ANTHROPIC_API_KEY not configured",
      });
    }

    const result = await computeAiReadmeVerdict({ githubRepo, projectTitle });
    const verdictAt = new Date();

    if (!result.ok) {
      await prisma.projectSubmission.update({
        where: { id: submissionId },
        data: {
          aiReadmeStatus: "failed",
          aiReadmeVerdictAt: verdictAt,
          aiReadmeVerdict: { reason: result.reason },
        },
      });
      return NextResponse.json({
        verdict: null,
        verdictAt,
        status: "failed",
        cached: false,
        reason: result.reason,
      });
    }

    await prisma.projectSubmission.update({
      where: { id: submissionId },
      data: {
        aiReadmeStatus: "done",
        aiReadmeVerdictAt: verdictAt,
        aiReadmeVerdict: result.verdict as object,
      },
    });

    return NextResponse.json({
      verdict: result.verdict,
      verdictAt,
      status: "done",
      cached: false,
    });
  } catch (err) {
    console.error("AI README check error:", err);
    return NextResponse.json(
      {
        error: "Failed to run AI README audit",
        detail: String(err).slice(0, 500),
      },
      { status: 500 }
    );
  }
}
