import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/admin-auth";
import { Permission } from "@/lib/permissions";
import { CurrencyTransactionType } from "@/app/generated/prisma/enums";
import {
  decryptShopOrderAddress,
  decryptShopOrderPhone,
  editShopOrderShipping,
  EDITABLE_ADDRESS_FIELDS,
  ShopOrderError,
  type EditableAddressField,
} from "@/lib/shop-orders";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCheck = await requirePermission(Permission.MANAGE_CURRENCY);
  if (authCheck.error) return authCheck.error;

  const { id } = await params;

  const order = await prisma.shopOrder.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          slackId: true,
          verificationStatus: true,
          fraudConvicted: true,
          createdAt: true,
        },
      },
      shopItem: {
        select: { id: true, name: true, imageUrl: true, price: true },
      },
      notes: {
        orderBy: { createdAt: "asc" },
        include: {
          author: { select: { id: true, name: true, email: true, image: true } },
        },
      },
    },
  });

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // Aggregate quick user stats for the right-rail + look up the admin who
  // most recently changed the status (for the banner attribution).
  const [balanceAgg, totalOrders, projectCount, bomSpent, lastActor] = await Promise.all([
    prisma.currencyTransaction.aggregate({
      where: { userId: order.userId },
      _sum: { amount: true },
    }),
    prisma.shopOrder.count({ where: { userId: order.userId } }),
    prisma.project.count({ where: { userId: order.userId, deletedAt: null } }),
    prisma.currencyTransaction.aggregate({
      where: {
        userId: order.userId,
        type: CurrencyTransactionType.SHOP_PURCHASE,
        amount: { lt: 0 },
      },
      _sum: { amount: true },
    }),
    order.lastActorId
      ? prisma.user.findUnique({
          where: { id: order.lastActorId },
          select: { id: true, name: true, email: true, image: true },
        })
      : Promise.resolve(null),
  ]);

  const address = decryptShopOrderAddress(order.encryptedAddress);
  const phone = decryptShopOrderPhone(order.encryptedPhone);

  return NextResponse.json({
    order: {
      id: order.id,
      orderNumber: order.orderNumber,
      quantity: order.quantity,
      unitBitsCost: order.unitBitsCost,
      totalBitsCost: order.totalBitsCost,
      estimatedUsdCents: order.estimatedUsdCents,
      fulfillmentUsdCents: order.fulfillmentUsdCents,
      status: order.status,
      trackingNumber: order.trackingNumber,
      trackingCarrier: order.trackingCarrier,
      holdReason: order.holdReason,
      rejectionReason: order.rejectionReason,
      placedAt: order.placedAt.toISOString(),
      heldAt: order.heldAt?.toISOString() ?? null,
      rejectedAt: order.rejectedAt?.toISOString() ?? null,
      fulfilledAt: order.fulfilledAt?.toISOString() ?? null,
      lastActorId: order.lastActorId,
      lastActor,
      phone,
      address,
      user: {
        ...order.user,
        createdAt: order.user.createdAt.toISOString(),
      },
      shopItem: order.shopItem,
      notes: order.notes.map((n) => ({
        id: n.id,
        body: n.body,
        createdAt: n.createdAt.toISOString(),
        author: n.author,
      })),
    },
    userStats: {
      bitsBalance: balanceAgg._sum.amount ?? 0,
      totalOrders,
      projectCount,
      bitsSpentOnParts: Math.abs(bomSpent._sum.amount ?? 0),
    },
  });
}

/**
 * PATCH /api/admin/shop-orders/[id]
 * Edit the shipping snapshot on a PENDING / ON_HOLD order. No admin UI —
 * intended for API use (e.g. a browser-console fetch from the admin panel).
 *
 * Body: { address?: { line_1?, line_2?, city?, state?, postal_code?, country?,
 *         first_name?, last_name? }, phone?: string }
 * Address fields merge onto the existing snapshot; null or "" clears a field.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCheck = await requirePermission(Permission.MANAGE_CURRENCY);
  if (authCheck.error) return authCheck.error;

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as {
    address?: Record<string, unknown>;
    phone?: unknown;
  } | null;

  if (!body || (body.address === undefined && body.phone === undefined)) {
    return NextResponse.json(
      { error: "Provide address and/or phone to edit", code: "INVALID_INPUT" },
      { status: 400 }
    );
  }

  let address: Partial<Record<EditableAddressField, string | null>> | undefined;
  if (body.address !== undefined) {
    if (typeof body.address !== "object" || body.address === null || Array.isArray(body.address)) {
      return NextResponse.json(
        { error: "address must be an object", code: "INVALID_INPUT" },
        { status: 400 }
      );
    }
    address = {};
    for (const [key, value] of Object.entries(body.address)) {
      if (!(EDITABLE_ADDRESS_FIELDS as readonly string[]).includes(key)) {
        return NextResponse.json(
          {
            error: `Unknown address field "${key}". Allowed: ${EDITABLE_ADDRESS_FIELDS.join(", ")}`,
            code: "INVALID_INPUT",
          },
          { status: 400 }
        );
      }
      if (value !== null && typeof value !== "string") {
        return NextResponse.json(
          { error: `address.${key} must be a string or null`, code: "INVALID_INPUT" },
          { status: 400 }
        );
      }
      address[key as EditableAddressField] = value;
    }
  }

  if (body.phone !== undefined && typeof body.phone !== "string") {
    return NextResponse.json(
      { error: "phone must be a string", code: "INVALID_INPUT" },
      { status: 400 }
    );
  }

  try {
    const result = await editShopOrderShipping({
      adminId: authCheck.session.user.id,
      adminEmail: authCheck.session.user.email,
      orderId: id,
      address,
      phone: body.phone as string | undefined,
    });

    return NextResponse.json({
      order: {
        id: result.order.id,
        orderNumber: result.order.orderNumber,
        status: result.order.status,
      },
      address: result.address,
      phone: result.phone,
    });
  } catch (err) {
    if (err instanceof ShopOrderError) {
      const status =
        err.code === "NOT_FOUND" ? 404 : err.code === "INVALID_STATE" ? 409 : 400;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    console.error("[shop-orders/edit-shipping]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
