import prisma from "@/lib/prisma"
import { Prisma } from "@/app/generated/prisma/client"
import { AuditAction } from "@/app/generated/prisma/enums"
import { headers } from "next/headers"

interface AuditLogParams {
  action: AuditAction
  actorId?: string | null
  actorEmail?: string | null
  targetType?: string
  targetId?: string
  metadata?: Prisma.InputJsonValue
}

export async function extractRequestInfo(): Promise<{
  ip: string | null
  userAgent: string | null
}> {
  const headersList = await headers()

  const ip =
    headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headersList.get("x-real-ip") ||
    headersList.get("cf-connecting-ip") ||
    null

  const userAgent = headersList.get("user-agent") || null

  return { ip, userAgent }
}

export async function logAudit(params: AuditLogParams): Promise<void> {
  const { ip, userAgent } = await extractRequestInfo()

  try {
    await prisma.auditLog.create({
      data: {
        action: params.action,
        actorId: params.actorId ?? null,
        actorEmail: params.actorEmail ?? null,
        actorIp: ip,
        actorUserAgent: userAgent,
        targetType: params.targetType ?? null,
        targetId: params.targetId ?? null,
        metadata: params.metadata ?? undefined,
      },
    })
  } catch (error) {
    console.error("[AUDIT] Failed to log audit event:", error, params)
  }
}

export async function logAdminAction(
  action: AuditAction,
  adminId: string,
  adminEmail: string | null | undefined,
  targetType?: string,
  targetId?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  await logAudit({
    action,
    actorId: adminId,
    actorEmail: adminEmail,
    targetType,
    targetId,
    metadata: metadata as Prisma.InputJsonValue,
  })
}

// Re-export AuditAction for convenience
export { AuditAction }
