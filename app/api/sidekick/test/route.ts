import { NextResponse } from "next/server";
import { requireRole } from "@/lib/admin-auth";
import { Role } from "@/app/generated/prisma/client";
import { sendSlackDM } from "@/lib/slack";
import { findLeastLoadedSidekick } from "@/lib/sidekick";
import prisma from "@/lib/prisma";

export async function GET() {
  const auth = await requireRole(Role.SIDEKICK);
  if ("error" in auth && auth.error) return auth.error;

  const { session } = auth;
  const userId = session!.user.id;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, slackId: true },
  });

  if (!user?.slackId) {
    return NextResponse.json({ error: "You don't have a slackId set" }, { status: 400 });
  }

  const leastLoaded = await findLeastLoadedSidekick();

  const dmResult = await sendSlackDM(
    user.slackId,
    `Thanks for signing up for Stasis! Your Stasis Sidekick is <@${user.slackId}>. They're your go-to person if you need any help with building and shipping your hardware projects. Go DM them and say hi!`
  );

  return NextResponse.json({
    slackId: user.slackId,
    dmResult,
    leastLoadedSidekick: leastLoaded,
  });
}
