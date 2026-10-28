import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/app/generated/prisma/client";
import { VALID_BADGE_TYPES } from "@/lib/badges";
import type { BadgeType } from "@/app/generated/prisma/enums";

const DEFAULT_LIMIT = 21;
const MAX_LIMIT = 48;

export type DiscoverSort = "top" | "recent";
export type DiscoverStatus = "all" | "approved" | "built";

const SORTS: DiscoverSort[] = ["top", "recent"];
const STATUSES: DiscoverStatus[] = ["all", "approved", "built"];

// "Top" ranking. Review outcome is a hard tier: every built project comes
// before every design-approved one, which come before the rest. Within a tier,
// effort and documentation decide. Hours and images are log-scaled and capped
// so one huge journal can't drown out everything else, and projects with no
// picture at all sink because they read as empty cards in the grid.
const TOP_SCORE = Prisma.sql`(
  8 * COALESCE(p.tier, 0)
  + 10 * LN(1 + LEAST(ws.hours, 100))
  + 6 * LN(1 + LEAST(COALESCE(img.count, 0), 30))
  + 5 * COALESCE(ku.count, 0)
  - CASE WHEN img.count IS NULL AND p."coverImage" IS NULL THEN 40 ELSE 0 END
)`;

// Public: the gallery is shown logged-out on /explore. Everything returned here
// is already public on the project detail and profile pages.
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id ?? null;

  const { searchParams } = new URL(request.url);
  const offset = Math.max(parseInt(searchParams.get("cursor") || "0", 10) || 0, 0);
  const search = searchParams.get("search")?.trim() || "";
  const limitParam = parseInt(searchParams.get("limit") || "", 10);
  const limit = Math.min(
    Number.isNaN(limitParam) || limitParam < 1 ? DEFAULT_LIMIT : limitParam,
    MAX_LIMIT
  );
  const sortParam = searchParams.get("sort") as DiscoverSort | null;
  const sort: DiscoverSort = sortParam && SORTS.includes(sortParam) ? sortParam : "top";
  const statusParam = searchParams.get("status") as DiscoverStatus | null;
  const status: DiscoverStatus = statusParam && STATUSES.includes(statusParam) ? statusParam : "all";
  const badgeParam = searchParams.get("badge") as BadgeType | null;
  const badge = badgeParam && VALID_BADGE_TYPES.includes(badgeParam) ? badgeParam : null;

  const filters: Prisma.Sql[] = [
    Prisma.sql`p."deletedAt" IS NULL`,
    Prisma.sql`NOT p."hiddenFromGallery"`,
  ];
  if (status === "approved") filters.push(Prisma.sql`p."designStatus" = 'approved'`);
  if (status === "built") filters.push(Prisma.sql`p."buildStatus" = 'approved'`);
  if (badge) {
    filters.push(Prisma.sql`EXISTS (
      SELECT 1 FROM project_badge pb WHERE pb."projectId" = p.id AND pb.badge::text = ${badge}
    )`);
  }
  if (search) {
    const pattern = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
    filters.push(Prisma.sql`(
      p.title ILIKE ${pattern} OR p.description ILIKE ${pattern}
      OR u.name ILIKE ${pattern} OR u."slackDisplayName" ILIKE ${pattern}
    )`);
  }

  const orderBy =
    sort === "recent"
      ? Prisma.sql`ws.last_at DESC, p.id`
      : Prisma.sql`p."buildStatus" = 'approved' DESC, p."designStatus" = 'approved' DESC,
          ${TOP_SCORE} DESC, ws.last_at DESC, p.id`;

  const rows = await prisma.$queryRaw<{ id: string }[]>`
    WITH ws AS (
      SELECT "projectId" AS pid, SUM("hoursClaimed") AS hours, MAX("createdAt") AS last_at
      FROM work_session GROUP BY 1
    ), img AS (
      SELECT w."projectId" AS pid, COUNT(*) AS count
      FROM session_media m JOIN work_session w ON w.id = m."workSessionId"
      WHERE m.type = 'IMAGE' GROUP BY 1
    ), ku AS (
      SELECT "projectId" AS pid, COUNT(*) AS count FROM kudos GROUP BY 1
    )
    SELECT p.id
    FROM project p
    JOIN ws ON ws.pid = p.id
    JOIN "user" u ON u.id = p."userId"
    LEFT JOIN img ON img.pid = p.id
    LEFT JOIN ku ON ku.pid = p.id
    WHERE ${Prisma.join(filters, " AND ")}
    ORDER BY ${orderBy}
    LIMIT ${limit + 1} OFFSET ${offset}
  `;

  const hasMore = rows.length > limit;
  const ids = rows.slice(0, limit).map((r) => r.id);

  const projects = await prisma.project.findMany({
    where: { id: { in: ids } },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          slackDisplayName: true,
          image: true,
        },
      },
      workSessions: {
        take: 4,
        orderBy: { createdAt: "desc" },
        select: {
          createdAt: true,
          stage: true,
          media: {
            where: { type: "IMAGE" },
            take: 1,
            select: { url: true },
          },
        },
      },
      _count: {
        select: {
          kudos: true,
          workSessions: true,
        },
      },
      ...(userId
        ? {
            kudos: {
              where: { userId },
              select: { id: true },
            },
          }
        : {}),
    },
  });
  const byId = new Map(projects.map((p) => [p.id, p]));

  const result = ids.flatMap((id) => {
    const p = byId.get(id);
    if (!p) return [];

    // Thumbnail first: the cover the builder chose, else recent journal images
    // build-stage first (usually photos of the real hardware; design-stage
    // ones are CAD and screenshots).
    const thumb = p.coverImage;
    const recent = [...p.workSessions]
      .sort((a, b) => Number(b.stage === "BUILD") - Number(a.stage === "BUILD"))
      .flatMap((ws) => ws.media.map((m) => m.url));
    const allImages = [...new Set([...(thumb ? [thumb] : []), ...recent])].slice(0, 4);

    const { slackDisplayName, ...userRest } = p.user;
    const displayUser = {
      ...userRest,
      name: slackDisplayName || p.user.name,
    };

    return [{
      id: p.id,
      title: p.title,
      description: p.description,
      coverImage: p.coverImage,
      images: allImages,
      tags: p.tags,
      designStatus: p.designStatus,
      buildStatus: p.buildStatus,
      user: displayUser,
      kudosCount: p._count.kudos,
      sessionCount: p._count.workSessions,
      lastActivity: p.workSessions[0]?.createdAt ?? p.updatedAt,
      hasGivenKudos: userId ? (p.kudos as { id: string }[]).length > 0 : false,
    }];
  });

  return NextResponse.json({
    projects: result,
    nextCursor: hasMore ? String(offset + limit) : null,
  });
}
