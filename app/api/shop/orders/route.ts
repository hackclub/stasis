import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { placeShopOrder, ShopOrderError } from "@/lib/shop-orders";
import { sanitize } from "@/lib/sanitize";
import { getShopAccess, SHOP_CLOSED_MESSAGE } from "@/lib/event";

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const shopAccess = await getShopAccess(session.user.id);
  if (shopAccess.closed) {
    return NextResponse.json({ error: SHOP_CLOSED_MESSAGE, code: "SHOP_CLOSED" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({})) as {
    shopItemId?: string;
    quantity?: number;
    addressId?: string;
    phoneOverride?: string;
  };

  if (!body.shopItemId || typeof body.shopItemId !== "string") {
    return NextResponse.json({ error: "shopItemId is required" }, { status: 400 });
  }
  if (!body.addressId || typeof body.addressId !== "string") {
    return NextResponse.json({ error: "addressId is required" }, { status: 400 });
  }
  const quantity = Math.max(1, Math.floor(Number(body.quantity ?? 1)));

  try {
    const result = await placeShopOrder({
      userId: session.user.id,
      shopItemId: sanitize(body.shopItemId),
      quantity,
      addressId: sanitize(body.addressId),
      phoneOverride: body.phoneOverride ? sanitize(body.phoneOverride) : undefined,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ShopOrderError) {
      const code = err.code;
      const status =
        code === "ITEM_NOT_FOUND" || code === "NO_HCA_IDENTITY" ? 404 :
        code === "INVALID_STATE" ? 409 :
        400;
      return NextResponse.json({ error: err.message, code }, { status });
    }
    console.error("[shop/orders POST]", err);
    return NextResponse.json({ error: "Failed to place order" }, { status: 500 });
  }
}
