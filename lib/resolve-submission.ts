import prisma from "@/lib/prisma"

/**
 * Resolves an ID to a ProjectSubmission.
 * Tries submission ID first, then falls back to finding or creating
 * a submission for a project ID.
 */
export async function resolveSubmissionId(id: string): Promise<string | null> {
  // Try as submission ID
  const submission = await prisma.projectSubmission.findUnique({
    where: { id },
    select: { id: true },
  })
  if (submission) return submission.id

  // Try as project ID
  const project = await prisma.project.findUnique({
    where: { id },
    select: {
      id: true,
      designStatus: true,
      buildStatus: true,
    },
  })
  if (!project) return null

  const designInReview = project.designStatus === "in_review"
  const buildInReview = project.buildStatus === "in_review"
  const activeStage = buildInReview ? "BUILD" : designInReview ? "DESIGN" : null

  if (!activeStage) return null

  // Use the most recent existing submission FOR THE ACTIVE STAGE. Don't grab the
  // single newest submission and then filter by stage — if the newest happens to
  // be a different stage (e.g. a BUILD submission while design is back in review),
  // that filter misses the perfectly-good same-stage submission and we'd spawn a
  // duplicate below.
  const existing = await prisma.projectSubmission.findFirst({
    where: { projectId: project.id, stage: activeStage },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  })
  if (existing) return existing.id

  // Auto-create one
  const newSub = await prisma.projectSubmission.create({
    data: { projectId: project.id, stage: activeStage },
  })
  return newSub.id
}
