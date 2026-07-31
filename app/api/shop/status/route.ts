import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import {
  getShopAccess,
  formatShopDate,
  SHOP_CLOSE_DATE,
  SHOP_CLOSED_MESSAGE,
  SHOP_GRACE_DAYS,
} from "@/lib/event"

export const dynamic = "force-dynamic"

// Reports the shop open/closed gate as it applies to the caller. The grace
// window depends on the caller's own review history, so unauthenticated
// callers just get the global close date.
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session) {
    const closed = new Date() >= SHOP_CLOSE_DATE
    return NextResponse.json({
      closed,
      closesAt: SHOP_CLOSE_DATE.toISOString(),
      closesAtLabel: formatShopDate(SHOP_CLOSE_DATE),
      pendingReview: false,
      graceUntil: null,
      graceUntilLabel: null,
      reason: closed ? "CLOSED" : "OPEN",
      graceDays: SHOP_GRACE_DAYS,
      message: closed ? SHOP_CLOSED_MESSAGE : null,
    })
  }

  const access = await getShopAccess(session.user.id)

  return NextResponse.json({
    closed: access.closed,
    closesAt: access.closesAt.toISOString(),
    closesAtLabel: formatShopDate(access.closesAt),
    pendingReview: access.pendingReview,
    graceUntil: access.graceUntil?.toISOString() ?? null,
    graceUntilLabel: access.graceUntil ? formatShopDate(access.graceUntil) : null,
    reason: access.reason,
    graceDays: SHOP_GRACE_DAYS,
    message: access.closed ? SHOP_CLOSED_MESSAGE : null,
  })
}
