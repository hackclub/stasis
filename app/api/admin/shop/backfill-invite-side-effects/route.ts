import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requirePermission } from "@/lib/admin-auth"
import { Permission } from "@/lib/permissions"
import { runInvitePurchaseSideEffects } from "@/lib/attend"
import { SHOP_ITEM_IDS } from "@/lib/shop"

export async function POST() {
  const authCheck = await requirePermission(Permission.MANAGE_USERS)
  if (authCheck.error) return authCheck.error

  // Find users who paid for a Stasis Event Invite but aren't yet on Attend.
  // Granted users go through the GRANT route directly, so this is strictly
  // the "paid but registration failed" retry path.
  const candidates = await prisma.user.findMany({
    where: {
      attendRegisteredAt: null,
      currencyTransactions: {
        some: {
          type: "SHOP_PURCHASE",
          shopItemId: SHOP_ITEM_IDS.STASIS_EVENT_INVITE,
          amount: { lt: 0 },
        },
      },
    },
    select: { id: true, email: true, name: true },
  })

  // Respond immediately, run in background
  runBackfill(candidates).catch((err) =>
    console.error("[backfill-invite-side-effects] Unexpected error:", err)
  )

  return NextResponse.json({
    message: "Backfill started",
    processing: candidates.length,
    skipped: 0,
    total: candidates.length,
  })
}

async function runBackfill(
  users: Array<{ id: string; email: string; name: string | null }>
) {
  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

  console.log(
    `[backfill-invite-side-effects] Starting for ${users.length} users`
  )

  let succeeded = 0
  let failed = 0

  for (let i = 0; i < users.length; i++) {
    const user = users[i]

    if (i > 0) await delay(500)

    try {
      console.log(
        `[backfill-invite-side-effects] (${i + 1}/${users.length}) Processing user ${user.id}`
      )

      await runInvitePurchaseSideEffects({
        userId: user.id,
        email: user.email,
        name: user.name,
      })

      const after = await prisma.user.findUnique({
        where: { id: user.id },
        select: { attendRegisteredAt: true },
      })
      if (after?.attendRegisteredAt) succeeded++
      else failed++
    } catch (err) {
      console.error(
        `[backfill-invite-side-effects] Error for user ${user.id}:`,
        err
      )
      failed++
    }
  }

  console.log(
    `[backfill-invite-side-effects] Complete: ${succeeded} succeeded, ${failed} failed out of ${users.length} total`
  )
}
