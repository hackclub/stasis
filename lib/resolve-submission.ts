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
      submissions: {
        orderBy: { createdAt: "desc" as const },
        take: 1,
        select: { id: true, stage: true },
      },
    },
  })
  if (!project) return null

  const designInReview = project.designStatus === "in_review"
  const buildInReview = project.buildStatus === "in_review"
  const activeStage = buildInReview ? "BUILD" : designInReview ? "DESIGN" : null

  if (!activeStage) return null

  // Use existing submission for this stage
  const existing = project.submissions.find((s) => s.stage === activeStage)
  if (existing) return existing.id

  // Auto-create one
  const newSub = await prisma.projectSubmission.create({
    data: { projectId: project.id, stage: activeStage },
  })
  return newSub.id
}
