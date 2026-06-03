import prisma from "@/lib/prisma";
import { Prisma } from "@/app/generated/prisma/client";
import type {
  ShopOrderModel as ShopOrder,
  ShopOrderNoteModel as ShopOrderNote,
} from "@/app/generated/prisma/models";
import {
  ShopOrderStatus,
  CurrencyTransactionType,
  AuditAction,
} from "@/app/generated/prisma/enums";
import { encryptPII, decryptPII } from "@/lib/pii";
import { fetchHcaIdentity, type HcaAddress } from "@/lib/hca";
import { sendSlackDM } from "@/lib/slack";
import { logAdminAction } from "@/lib/audit";
import { sanitize } from "@/lib/sanitize";
import { detectCarrier, trackingUrl, carrierLabel, type TrackingCarrier } from "@/lib/tracking";

const SUPPORT_CHANNEL_URL = "https://hackclub.enterprise.slack.com/archives/C09JP51FHNE";
const SUPPORT_CHANNEL_LINK = `<${SUPPORT_CHANNEL_URL}|#stasis-support>`;

export class ShopOrderError extends Error {
  constructor(public code: ShopOrderErrorCode, message?: string) {
    super(message ?? code);
    this.name = "ShopOrderError";
  }
}

export type ShopOrderErrorCode =
  | "NOT_FOUND"
  | "ITEM_NOT_FOUND"
  | "ITEM_INACTIVE"
  | "INVALID_QUANTITY"
  | "EXCEEDS_PER_USER_LIMIT"
  | "INSUFFICIENT_BITS"
  | "INVALID_ADDRESS"
  | "NO_HCA_IDENTITY"
  | "INVALID_STATE"
  | "INVALID_INPUT";

interface PlaceShopOrderParams {
  userId: string;
  shopItemId: string;
  quantity: number;
  addressId: string;
  phoneOverride?: string;
}

export interface PlacedShopOrder {
  orderId: string;
  orderNumber: number;
  bitsSpent: number;
  newBalance: number;
}

/**
 * Place a user-initiated shop order. Captures a snapshot of the selected HCA
 * address + phone, debits bits across `quantity` SHOP_PURCHASE ledger rows,
 * links them to the ShopOrder, and fires an "Order placed" Slack DM.
 */
export async function placeShopOrder(params: PlaceShopOrderParams): Promise<PlacedShopOrder> {
  const quantity = Math.floor(params.quantity);
  if (!Number.isFinite(quantity) || quantity < 1) {
    throw new ShopOrderError("INVALID_QUANTITY");
  }

  const item = await prisma.shopItem.findUnique({
    where: { id: params.shopItemId },
    select: { id: true, name: true, price: true, discountPrice: true, maxPerUser: true, active: true, imageUrl: true },
  });
  if (!item) throw new ShopOrderError("ITEM_NOT_FOUND");
  if (!item.active) throw new ShopOrderError("ITEM_INACTIVE");

  const identity = await fetchHcaIdentity(params.userId);
  if (!identity) throw new ShopOrderError("NO_HCA_IDENTITY");
  const address = identity.addresses.find((a) => a.id === params.addressId);
  if (!address) throw new ShopOrderError("INVALID_ADDRESS");

  const phoneRaw = (params.phoneOverride ?? address.phone_number ?? "").trim();
  if (!phoneRaw) {
    throw new ShopOrderError("INVALID_INPUT", "Phone number is required");
  }

  const effectivePrice = item.discountPrice ?? item.price;
  const totalBitsCost = effectivePrice * quantity;

  const result = await prisma.$transaction(
    async (tx) => {
      if (item.maxPerUser > 0) {
        const existing = await tx.currencyTransaction.count({
          where: {
            userId: params.userId,
            type: CurrencyTransactionType.SHOP_PURCHASE,
            shopItemId: item.id,
          },
        });
        if (existing >= item.maxPerUser) {
          throw new ShopOrderError("EXCEEDS_PER_USER_LIMIT");
        }
        if (existing + quantity > item.maxPerUser) {
          throw new ShopOrderError("EXCEEDS_PER_USER_LIMIT");
        }
      }

      const agg = await tx.currencyTransaction.aggregate({
        where: { userId: params.userId },
        _sum: { amount: true },
      });
      const balance = agg._sum.amount ?? 0;

      const pendingRows = await tx.$queryRaw<{ pending: bigint | null }[]>`
        SELECT COALESCE(SUM(amount), 0) as pending
        FROM currency_transaction
        WHERE "userId" = ${params.userId} AND type::text = 'DESIGN_APPROVED'
      `;
      const pendingBits = Number(pendingRows[0]?.pending ?? 0);
      const effectiveBalance = balance - pendingBits;

      if (effectiveBalance < totalBitsCost) {
        throw new ShopOrderError("INSUFFICIENT_BITS");
      }

      const order = await tx.shopOrder.create({
        data: {
          userId: params.userId,
          shopItemId: item.id,
          quantity,
          unitBitsCost: effectivePrice,
          totalBitsCost,
          estimatedUsdCents: totalBitsCost * 50,
          status: ShopOrderStatus.PENDING,
          encryptedPhone: encryptPII(phoneRaw),
          encryptedAddress: encryptPII(JSON.stringify(address)),
        },
      });

      let currentBalance = balance;
      for (let i = 0; i < quantity; i++) {
        await tx.currencyTransaction.create({
          data: {
            userId: params.userId,
            amount: -effectivePrice,
            type: CurrencyTransactionType.SHOP_PURCHASE,
            shopItemId: item.id,
            shopOrderId: order.id,
            note: item.discountPrice
              ? `Purchased: ${item.name} (discounted from ${item.price} bits)`
              : `Purchased: ${item.name}`,
            balanceBefore: currentBalance,
            balanceAfter: currentBalance - effectivePrice,
          },
        });
        currentBalance -= effectivePrice;
      }

      await tx.userGoalPrize.deleteMany({
        where: { userId: params.userId, shopItemId: item.id },
      });

      return {
        orderId: order.id,
        orderNumber: order.orderNumber,
        bitsSpent: totalBitsCost,
        newBalance: currentBalance,
        itemName: item.name,
        itemImageUrl: item.imageUrl ?? null,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );

  sendOrderPlacedDm({
    userId: params.userId,
    orderNumber: result.orderNumber,
    itemName: result.itemName,
    itemImageUrl: result.itemImageUrl,
    quantity,
    totalBits: totalBitsCost,
    newBalance: result.newBalance,
  }).catch((err) => console.error("[shop-orders] placed DM failed:", err));

  return {
    orderId: result.orderId,
    orderNumber: result.orderNumber,
    bitsSpent: result.bitsSpent,
    newBalance: result.newBalance,
  };
}

interface AdminActionParams {
  adminId: string;
  adminEmail?: string | null;
  orderId: string;
}

export async function holdShopOrder(
  params: AdminActionParams & { reason?: string }
): Promise<ShopOrder> {
  const reason = params.reason ? sanitize(params.reason) : null;
  const order = await prisma.shopOrder.findUnique({ where: { id: params.orderId } });
  if (!order) throw new ShopOrderError("NOT_FOUND");
  if (order.status !== ShopOrderStatus.PENDING) {
    throw new ShopOrderError("INVALID_STATE", `Cannot hold an order in state ${order.status}`);
  }

  const updated = await prisma.shopOrder.update({
    where: { id: params.orderId },
    data: {
      status: ShopOrderStatus.ON_HOLD,
      holdReason: reason,
      heldAt: new Date(),
      lastActorId: params.adminId,
    },
  });

  await logAdminAction(
    AuditAction.SHOP_ORDER_HOLD,
    params.adminId,
    params.adminEmail ?? undefined,
    "ShopOrder",
    order.id,
    { reason: reason ?? null, orderNumber: order.orderNumber }
  );

  return updated;
}

export async function unholdShopOrder(params: AdminActionParams): Promise<ShopOrder> {
  const order = await prisma.shopOrder.findUnique({ where: { id: params.orderId } });
  if (!order) throw new ShopOrderError("NOT_FOUND");
  if (order.status !== ShopOrderStatus.ON_HOLD) {
    throw new ShopOrderError("INVALID_STATE", `Cannot unhold an order in state ${order.status}`);
  }

  const updated = await prisma.shopOrder.update({
    where: { id: params.orderId },
    data: {
      status: ShopOrderStatus.PENDING,
      holdReason: null,
      heldAt: null,
      lastActorId: params.adminId,
    },
  });

  await logAdminAction(
    AuditAction.SHOP_ORDER_UNHOLD,
    params.adminId,
    params.adminEmail ?? undefined,
    "ShopOrder",
    order.id,
    { orderNumber: order.orderNumber }
  );

  return updated;
}

export async function rejectShopOrder(
  params: AdminActionParams & { reason?: string }
): Promise<ShopOrder> {
  const reason = params.reason ? sanitize(params.reason) : null;

  const result = await prisma.$transaction(
    async (tx) => {
      const order = await tx.shopOrder.findUnique({
        where: { id: params.orderId },
        include: { shopItem: { select: { name: true } } },
      });
      if (!order) throw new ShopOrderError("NOT_FOUND");
      if (
        order.status !== ShopOrderStatus.PENDING &&
        order.status !== ShopOrderStatus.ON_HOLD
      ) {
        throw new ShopOrderError("INVALID_STATE", `Cannot reject an order in state ${order.status}`);
      }

      const agg = await tx.currencyTransaction.aggregate({
        where: { userId: order.userId },
        _sum: { amount: true },
      });
      const balance = agg._sum.amount ?? 0;

      await tx.currencyTransaction.create({
        data: {
          userId: order.userId,
          amount: order.totalBitsCost,
          type: CurrencyTransactionType.SHOP_REFUND,
          shopItemId: order.shopItemId,
          shopOrderId: order.id,
          note: `Refund: Order #${order.orderNumber}`,
          balanceBefore: balance,
          balanceAfter: balance + order.totalBitsCost,
          createdBy: params.adminId,
        },
      });

      const updated = await tx.shopOrder.update({
        where: { id: order.id },
        data: {
          status: ShopOrderStatus.REJECTED,
          rejectionReason: reason,
          rejectedAt: new Date(),
          lastActorId: params.adminId,
        },
      });

      return { order: updated, itemName: order.shopItem.name, newBalance: balance + order.totalBitsCost };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );

  await logAdminAction(
    AuditAction.SHOP_ORDER_REJECT,
    params.adminId,
    params.adminEmail ?? undefined,
    "ShopOrder",
    params.orderId,
    { reason: reason ?? null, orderNumber: result.order.orderNumber, refundedBits: result.order.totalBitsCost }
  );

  sendOrderRejectedDm({
    userId: result.order.userId,
    orderNumber: result.order.orderNumber,
    itemName: result.itemName,
    refundedBits: result.order.totalBitsCost,
    newBalance: result.newBalance,
  }).catch((err) => console.error("[shop-orders] reject DM failed:", err));

  return result.order;
}

export async function fulfillShopOrder(
  params: AdminActionParams & { fulfillmentUsdCents: number; trackingNumber?: string | null }
): Promise<ShopOrder> {
  if (!Number.isInteger(params.fulfillmentUsdCents) || params.fulfillmentUsdCents < 0) {
    throw new ShopOrderError("INVALID_INPUT", "fulfillmentUsdCents must be a non-negative integer");
  }
  const tracking = params.trackingNumber?.trim() || null;
  const carrier: TrackingCarrier | null = tracking ? detectCarrier(tracking) : null;

  const result = await prisma.$transaction(async (tx) => {
    const order = await tx.shopOrder.findUnique({
      where: { id: params.orderId },
      include: { shopItem: { select: { name: true, imageUrl: true } } },
    });
    if (!order) throw new ShopOrderError("NOT_FOUND");
    if (
      order.status !== ShopOrderStatus.PENDING &&
      order.status !== ShopOrderStatus.ON_HOLD
    ) {
      throw new ShopOrderError("INVALID_STATE", `Cannot fulfill an order in state ${order.status}`);
    }

    const updated = await tx.shopOrder.update({
      where: { id: order.id },
      data: {
        status: ShopOrderStatus.FULFILLED,
        fulfilledAt: new Date(),
        fulfillmentUsdCents: params.fulfillmentUsdCents,
        trackingNumber: tracking,
        trackingCarrier: carrier,
        lastActorId: params.adminId,
      },
    });

    // Keep the legacy CurrencyTransaction.fulfilledAt in sync for any dashboards
    // that still read it.
    await tx.currencyTransaction.updateMany({
      where: { shopOrderId: order.id, type: CurrencyTransactionType.SHOP_PURCHASE, fulfilledAt: null },
      data: { fulfilledAt: updated.fulfilledAt },
    });

    return { order: updated, itemName: order.shopItem.name, itemImageUrl: order.shopItem.imageUrl };
  });

  await logAdminAction(
    AuditAction.SHOP_ORDER_FULFILL,
    params.adminId,
    params.adminEmail ?? undefined,
    "ShopOrder",
    params.orderId,
    {
      orderNumber: result.order.orderNumber,
      fulfillmentUsdCents: params.fulfillmentUsdCents,
      trackingNumber: tracking,
      trackingCarrier: carrier,
    }
  );

  sendOrderFulfilledDm({
    userId: result.order.userId,
    orderNumber: result.order.orderNumber,
    itemName: result.itemName,
    itemImageUrl: result.itemImageUrl,
    trackingNumber: tracking,
    trackingCarrier: carrier,
  }).catch((err) => console.error("[shop-orders] fulfill DM failed:", err));

  return result.order;
}

export async function revertShopOrder(params: AdminActionParams): Promise<ShopOrder> {
  const result = await prisma.$transaction(async (tx) => {
    const order = await tx.shopOrder.findUnique({ where: { id: params.orderId } });
    if (!order) throw new ShopOrderError("NOT_FOUND");
    if (
      order.status !== ShopOrderStatus.FULFILLED &&
      order.status !== ShopOrderStatus.REJECTED
    ) {
      throw new ShopOrderError("INVALID_STATE", `Cannot revert an order in state ${order.status}`);
    }

    if (order.status === ShopOrderStatus.REJECTED) {
      const agg = await tx.currencyTransaction.aggregate({
        where: { userId: order.userId },
        _sum: { amount: true },
      });
      const balance = agg._sum.amount ?? 0;

      if (balance < order.totalBitsCost) {
        throw new ShopOrderError(
          "INSUFFICIENT_BITS",
          "User has spent the refunded bits; cannot reverse refund"
        );
      }

      await tx.currencyTransaction.create({
        data: {
          userId: order.userId,
          amount: -order.totalBitsCost,
          type: CurrencyTransactionType.SHOP_REFUND_REVERSED,
          shopItemId: order.shopItemId,
          shopOrderId: order.id,
          note: `Refund reversed: Order #${order.orderNumber}`,
          balanceBefore: balance,
          balanceAfter: balance - order.totalBitsCost,
          createdBy: params.adminId,
        },
      });
    }

    const updated = await tx.shopOrder.update({
      where: { id: order.id },
      data: {
        status: ShopOrderStatus.PENDING,
        heldAt: null,
        rejectedAt: null,
        fulfilledAt: null,
        rejectionReason: null,
        holdReason: null,
        trackingNumber: null,
        trackingCarrier: null,
        fulfillmentUsdCents: null,
        lastActorId: params.adminId,
      },
    });

    // Clear fulfilledAt we may have set on the legacy ledger rows.
    await tx.currencyTransaction.updateMany({
      where: { shopOrderId: order.id, type: CurrencyTransactionType.SHOP_PURCHASE },
      data: { fulfilledAt: null },
    });

    return updated;
  });

  await logAdminAction(
    AuditAction.SHOP_ORDER_REVERT,
    params.adminId,
    params.adminEmail ?? undefined,
    "ShopOrder",
    params.orderId,
    { orderNumber: result.orderNumber }
  );

  return result;
}

export async function addShopOrderNote(
  params: AdminActionParams & { body: string }
): Promise<ShopOrderNote> {
  const body = sanitize(params.body).trim();
  if (!body) throw new ShopOrderError("INVALID_INPUT", "Note body is required");

  const order = await prisma.shopOrder.findUnique({
    where: { id: params.orderId },
    select: { id: true, orderNumber: true },
  });
  if (!order) throw new ShopOrderError("NOT_FOUND");

  const note = await prisma.shopOrderNote.create({
    data: {
      orderId: order.id,
      authorId: params.adminId,
      body,
    },
  });

  await logAdminAction(
    AuditAction.SHOP_ORDER_NOTE_ADD,
    params.adminId,
    params.adminEmail ?? undefined,
    "ShopOrder",
    order.id,
    { orderNumber: order.orderNumber, noteId: note.id }
  );

  return note;
}

/**
 * Decrypt a ShopOrder's encryptedAddress JSON blob back into an HcaAddress.
 * Returns null if the snapshot is empty (e.g. legacy backfilled rows).
 */
export function decryptShopOrderAddress(encrypted: string): HcaAddress | null {
  if (!encrypted) return null;
  try {
    return JSON.parse(decryptPII(encrypted)) as HcaAddress;
  } catch {
    return null;
  }
}

export function decryptShopOrderPhone(encrypted: string): string | null {
  if (!encrypted) return null;
  try {
    return decryptPII(encrypted);
  } catch {
    return null;
  }
}

// ── Slack DM formatting ──────────────────────────────────────────────────────

async function getSlackIdForUser(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { slackId: true },
  });
  return user?.slackId ?? null;
}

interface PlacedDmParams {
  userId: string;
  orderNumber: number;
  itemName: string;
  itemImageUrl: string | null;
  quantity: number;
  totalBits: number;
  newBalance: number;
}

async function sendOrderPlacedDm(p: PlacedDmParams): Promise<void> {
  const slackId = await getSlackIdForUser(p.userId);
  if (!slackId) return;
  const text = `Your Stasis shop order #${p.orderNumber} is in! We'll DM you again when it ships.`;
  const blocks: Record<string, unknown>[] = [
    {
      type: "header",
      text: { type: "plain_text", text: "🛒 Your Stasis shop order is in!" },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Order #${p.orderNumber}*\n${p.itemName}${p.quantity > 1 ? `  ·  Qty ${p.quantity}` : ""}`,
      },
      ...(p.itemImageUrl ? { accessory: { type: "image", image_url: p.itemImageUrl, alt_text: p.itemName } } : {}),
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Total spent:*\n${p.totalBits.toLocaleString()} bits` },
      ],
    },
    {
      type: "context",
      elements: [
        { type: "mrkdwn", text: `We'll DM you again when it ships. Questions? Reach out in ${SUPPORT_CHANNEL_LINK}.` },
      ],
    },
  ];
  await sendSlackDM(slackId, text, { blocks });
}

interface FulfilledDmParams {
  userId: string;
  orderNumber: number;
  itemName: string;
  itemImageUrl: string | null;
  trackingNumber: string | null;
  trackingCarrier: TrackingCarrier | null;
}

async function sendOrderFulfilledDm(p: FulfilledDmParams): Promise<void> {
  const slackId = await getSlackIdForUser(p.userId);
  if (!slackId) return;

  const hasTracking = !!p.trackingNumber;
  const headerText = hasTracking
    ? "🚚 Your Stasis order is on the way!"
    : "📦 Your Stasis order has been fulfilled";

  const text = hasTracking
    ? `Your Stasis order #${p.orderNumber} is on its way! Tracking: ${p.trackingNumber}`
    : `Your Stasis order #${p.orderNumber} has been fulfilled.`;

  const blocks: Record<string, unknown>[] = [
    {
      type: "header",
      text: { type: "plain_text", text: headerText },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Order #${p.orderNumber}*\n${p.itemName}`,
      },
      ...(p.itemImageUrl ? { accessory: { type: "image", image_url: p.itemImageUrl, alt_text: p.itemName } } : {}),
    },
  ];

  if (hasTracking) {
    const url = p.trackingCarrier ? trackingUrl(p.trackingCarrier, p.trackingNumber!) : null;
    const label = p.trackingCarrier ? carrierLabel(p.trackingCarrier) : "Tracking";
    blocks.push({
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Carrier:*\n${label}` },
        {
          type: "mrkdwn",
          text: url
            ? `*Tracking:*\n<${url}|${p.trackingNumber}>`
            : `*Tracking:*\n${p.trackingNumber}`,
        },
      ],
    });
  }

  blocks.push({
    type: "context",
    elements: [
      { type: "mrkdwn", text: `Questions? Reach out in ${SUPPORT_CHANNEL_LINK}.` },
    ],
  });

  await sendSlackDM(slackId, text, { blocks });
}

interface RejectedDmParams {
  userId: string;
  orderNumber: number;
  itemName: string;
  refundedBits: number;
  newBalance: number;
}

async function sendOrderRejectedDm(p: RejectedDmParams): Promise<void> {
  const slackId = await getSlackIdForUser(p.userId);
  if (!slackId) return;
  const text = `Your order #${p.orderNumber} for ${p.itemName} has been cancelled. ${p.refundedBits.toLocaleString()} bits have been refunded.`;
  const blocks: Record<string, unknown>[] = [
    {
      type: "header",
      text: { type: "plain_text", text: "Order cancelled" },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `Your order *#${p.orderNumber}* for *${p.itemName}* has been cancelled.`,
      },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Refunded:*\n${p.refundedBits.toLocaleString()} bits` },
      ],
    },
    {
      type: "context",
      elements: [
        { type: "mrkdwn", text: `Questions? Reach out in ${SUPPORT_CHANNEL_LINK}.` },
      ],
    },
  ];
  await sendSlackDM(slackId, text, { blocks });
}

