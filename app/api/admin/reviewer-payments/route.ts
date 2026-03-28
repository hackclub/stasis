import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requirePermission } from "@/lib/admin-auth"
import { Permission } from "@/lib/permissions"
import { appendLedgerEntry, CurrencyTransactionType } from "@/lib/currency"
import { logAdminAction, AuditAction } from "@/lib/audit"

export async function GET() {
  const authCheck = await requirePermission(Permission.MANAGE_CURRENCY)
  if ("error" in authCheck) return authCheck.error

  // Fetch all unpaid, non-invalidated reviews with project details
  const unpaidReviews = await prisma.submissionReview.findMany({
    where: { paidAt: null, invalidated: false },
    select: {
      id: true,
      reviewerId: true,
      result: true,
      feedback: true,
      createdAt: true,
      submission: {
        select: {
          stage: true,
          project: {
            select: { id: true, title: true },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  })

  // Group by reviewer
  const reviewerIds = [...new Set(unpaidReviews.map((r) => r.reviewerId))]

  const users = await prisma.user.findMany({
    where: { id: { in: reviewerIds } },
    select: { id: true, name: true, email: true },
  })
  const userMap = new Map(users.map((u) => [u.id, u]))

  // Get last payment date per reviewer
  const lastPayments = await prisma.submissionReview.groupBy({
    by: ["reviewerId"],
    where: { paidAt: { not: null }, reviewerId: { in: reviewerIds } },
    _max: { paidAt: true },
  })
  const lastPaymentMap = new Map(
    lastPayments.map((lp) => [lp.reviewerId, lp._max.paidAt])
  )

  // Build response grouped by reviewer
  const byReviewer = new Map<
    string,
    {
      reviewerId: string
      name: string | null
      email: string
      unpaidCount: number
      payout: number
      lastPaidAt: Date | null
      reviews: {
        id: string
        projectId: string
        projectName: string
        stage: string
        result: string
        feedback: string
        createdAt: Date
        willBePaid: boolean
      }[]
    }
  >()

  for (const r of unpaidReviews) {
    if (!byReviewer.has(r.reviewerId)) {
      const user = userMap.get(r.reviewerId)
      byReviewer.set(r.reviewerId, {
        reviewerId: r.reviewerId,
        name: user?.name ?? null,
        email: user?.email ?? "unknown",
        unpaidCount: 0,
        payout: 0,
        lastPaidAt: lastPaymentMap.get(r.reviewerId) ?? null,
        reviews: [],
      })
    }

    const entry = byReviewer.get(r.reviewerId)!
    entry.reviews.push({
      id: r.id,
      projectId: r.submission.project.id,
      projectName: r.submission.project.title,
      stage: r.submission.stage,
      result: r.result,
      feedback: r.feedback,
      createdAt: r.createdAt,
      willBePaid: false, // set below
    })
  }

  // Calculate payouts and mark which reviews will be paid
  for (const entry of byReviewer.values()) {
    entry.unpaidCount = entry.reviews.length
    entry.payout = Math.floor(entry.unpaidCount * 0.5)
    const paidCount = entry.payout * 2
    for (let i = 0; i < entry.reviews.length; i++) {
      entry.reviews[i].willBePaid = i < paidCount
    }
  }

  const reviewers = [...byReviewer.values()].sort(
    (a, b) => b.payout - a.payout
  )

  return NextResponse.json({ reviewers })
}

export async function POST(request: Request) {
  const authCheck = await requirePermission(Permission.MANAGE_CURRENCY)
  if ("error" in authCheck) return authCheck.error

  const body = await request.json()
  const { reviewerIds } = body

  if (
    !Array.isArray(reviewerIds) ||
    reviewerIds.length === 0 ||
    !reviewerIds.every((id: unknown) => typeof id === "string")
  ) {
    return NextResponse.json(
      { error: "reviewerIds must be a non-empty array of strings" },
      { status: 400 }
    )
  }

  const results: {
    reviewerId: string
    reviewsPaid: number
    amount: number
  }[] = []
  const errors: { reviewerId: string; error: string }[] = []

  for (const reviewerId of reviewerIds) {
    try {
      const result = await prisma.$transaction(async (tx) => {
        const unpaidReviews = await tx.submissionReview.findMany({
          where: { reviewerId, paidAt: null, invalidated: false },
          select: { id: true },
          orderBy: { createdAt: "asc" },
        })

        const count = unpaidReviews.length
        const payout = Math.floor(count * 0.5)

        if (payout === 0) {
          return { reviewsPaid: 0, amount: 0, skipped: true }
        }

        // Mark exactly payout * 2 reviews as paid (even number)
        const reviewsToPay = unpaidReviews.slice(0, payout * 2)
        const now = new Date()

        await tx.submissionReview.updateMany({
          where: { id: { in: reviewsToPay.map((r) => r.id) } },
          data: { paidAt: now },
        })

        await appendLedgerEntry(tx, {
          userId: reviewerId,
          amount: payout,
          type: CurrencyTransactionType.REVIEWER_PAYMENT,
          note: `Payment for ${reviewsToPay.length} reviews (${payout} bits)`,
          createdBy: authCheck.session.user.id,
        })

        return {
          reviewsPaid: reviewsToPay.length,
          amount: payout,
          skipped: false,
        }
      })

      if (result.skipped) {
        errors.push({
          reviewerId,
          error: "No payable reviews (need at least 2 unpaid)",
        })
      } else {
        results.push({
          reviewerId,
          reviewsPaid: result.reviewsPaid,
          amount: result.amount,
        })
      }
    } catch (err) {
      errors.push({
        reviewerId,
        error: err instanceof Error ? err.message : "Unknown error",
      })
    }
  }

  // Audit log each successful payment
  for (const r of results) {
    await logAdminAction(
      AuditAction.ADMIN_PAY_REVIEWER,
      authCheck.session.user.id,
      authCheck.session.user.email,
      "User",
      r.reviewerId,
      { reviewsPaid: r.reviewsPaid, amount: r.amount }
    )
  }

  return NextResponse.json({ results, errors })
}
