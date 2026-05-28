import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { requireAdmin } from "@/lib/admin-auth";

// Admin-only preference toggle: when `useV2` is true, /admin/review/[id]
// redirects to /admin/review/[id]/v2 (the redesigned review-detail page).

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { reviewerUiV2: true },
  });

  return NextResponse.json({ useV2: user?.reviewerUiV2 ?? false });
}

export async function POST(request: NextRequest) {
  const gate = await requireAdmin();
  if ("error" in gate) return gate.error;
  const { session } = gate;

  const body = await request.json().catch(() => ({}));
  if (typeof body.useV2 !== "boolean") {
    return NextResponse.json({ error: "useV2 must be a boolean" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { reviewerUiV2: body.useV2 },
  });

  return NextResponse.json({ success: true });
}
