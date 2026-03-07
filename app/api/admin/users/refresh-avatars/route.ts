import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requirePermission } from "@/lib/admin-auth"
import { Permission } from "@/lib/permissions"
import { getSlackProfilePicture } from "@/lib/slack"

export async function POST() {
  const authCheck = await requirePermission(Permission.MANAGE_USERS)
  if (authCheck.error) return authCheck.error

  // Clear gravatar URLs
  const gravatarUsers = await prisma.user.findMany({
    where: { image: { contains: "gravatar.com" } },
    select: { id: true },
  })

  if (gravatarUsers.length > 0) {
    await prisma.user.updateMany({
      where: { id: { in: gravatarUsers.map((u) => u.id) } },
      data: { image: null },
    })
  }

  // Find users with slackId but no image
  const users = await prisma.user.findMany({
    where: {
      slackId: { not: null },
      image: null,
    },
    select: { id: true, slackId: true },
  })

  // Run in background
  refreshAvatars(users).catch((err) =>
    console.error("[refresh-avatars] Unexpected error:", err)
  )

  return NextResponse.json({
    message: "Avatar refresh started",
    cleared: gravatarUsers.length,
    toFetch: users.length,
  })
}

async function refreshAvatars(users: Array<{ id: string; slackId: string | null }>) {
  console.log(`[refresh-avatars] Fetching avatars for ${users.length} users`)

  let updated = 0
  let skipped = 0

  for (let i = 0; i < users.length; i++) {
    const user = users[i]
    if (!user.slackId) continue

    if (i > 0) await new Promise((r) => setTimeout(r, 100))

    try {
      const image = await getSlackProfilePicture(user.slackId)
      if (image) {
        await prisma.user.update({
          where: { id: user.id },
          data: { image },
        })
        updated++
      } else {
        skipped++
      }
    } catch (err) {
      console.error(`[refresh-avatars] Failed for user ${user.id}:`, err)
    }
  }

  console.log(`[refresh-avatars] Complete: ${updated} updated, ${skipped} no avatar`)
}
