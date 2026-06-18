'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import StatusPill, { statusBannerClass } from '@/app/components/StatusPill';
import CopyableField from '@/app/components/CopyableField';
import { useToast } from '@/app/components/Toast';
import type { ShopOrderStatus } from '@/app/generated/prisma/enums';
import type { HcaAddress } from '@/lib/hca';
import type { TrackingCarrier } from '@/lib/tracking';
import ShopOrderActions from './ShopOrderActions';
import ShopOrderFulfill from './ShopOrderFulfill';
import NotesThread from './NotesThread';

interface NoteRow {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string | null; email: string; image: string | null };
}

export interface OrderDetail {
  id: string;
  orderNumber: number;
  quantity: number;
  unitBitsCost: number;
  totalBitsCost: number;
  estimatedUsdCents: number;
  fulfillmentUsdCents: number | null;
  status: ShopOrderStatus;
  trackingNumber: string | null;
  trackingCarrier: TrackingCarrier | null;
  holdReason: string | null;
  rejectionReason: string | null;
  placedAt: string;
  heldAt: string | null;
  rejectedAt: string | null;
  fulfilledAt: string | null;
  lastActorId: string | null;
  lastActor: { id: string; name: string | null; email: string; image: string | null } | null;
  phone: string | null;
  address: HcaAddress | null;
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
    slackId: string | null;
    verificationStatus: string | null;
    fraudConvicted: boolean;
    createdAt: string;
  };
  shopItem: { id: string; name: string; imageUrl: string | null; price: number };
  notes: NoteRow[];
}

interface UserStats {
  bitsBalance: number;
  totalOrders: number;
  projectCount: number;
  bitsSpentOnParts: number;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function statusBannerHeadline(status: OrderDetail['status']): string {
  switch (status) {
    case 'PENDING':   return 'This order is pending.';
    case 'ON_HOLD':   return 'This order is on hold.';
    case 'FULFILLED': return 'This order has been fulfilled.';
    case 'REJECTED':  return 'This order has been rejected.';
    case 'CANCELLED': return 'This order was cancelled.';
  }
}

// HCA stores country as an ISO 3166-1 alpha-2 code (e.g. "US"). Render the full
// name when it resolves to a known region, otherwise fall back to the raw value.
const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
function countryName(country: string | null): string | null {
  if (!country) return null;
  const code = country.trim();
  if (/^[A-Za-z]{2}$/.test(code)) {
    try {
      return regionNames.of(code.toUpperCase()) ?? country;
    } catch {
      return country;
    }
  }
  return country;
}

function formatAddressBlock(a: HcaAddress): string {
  const name = [a.first_name, a.last_name].filter(Boolean).join(' ');
  const lines = [
    name,
    a.line_1,
    a.line_2,
    [a.city, a.state, a.postal_code].filter(Boolean).join(', '),
    countryName(a.country),
    a.phone_number,
  ].filter(Boolean);
  return lines.join('\n');
}

export default function ShopOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { showToast } = useToast();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrder = useCallback(async () => {
    if (!params?.id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/shop-orders/${params.id}`);
      if (res.status === 404) {
        setError('Order not found.');
        return;
      }
      if (!res.ok) {
        setError('Failed to load order.');
        return;
      }
      const data = await res.json();
      setOrder(data.order);
      setStats(data.userStats);
    } catch {
      setError('Network error.');
    } finally {
      setLoading(false);
    }
  }, [params?.id]);

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  if (loading && !order) {
    return (
      <div className="space-y-8">
        <Link href="/admin/shop-orders" className="text-cream-200 hover:text-orange-500 text-sm uppercase tracking-wide">← Back to orders</Link>
        <div className="bg-brown-800 border-2 border-cream-500/20 p-12 flex items-center justify-center">
          <div className="loader" />
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="space-y-8">
        <Link href="/admin/shop-orders" className="text-cream-200 hover:text-orange-500 text-sm uppercase tracking-wide">← Back to orders</Link>
        <div className="bg-brown-800 border-2 border-red-600/50 p-8 text-center">
          <p className="text-red-600">{error ?? 'Unknown error'}</p>
        </div>
      </div>
    );
  }

  const slackUrl = order.user.slackId
    ? `slack://user?team=T0266FRGM&id=${order.user.slackId}`
    : null;

  const addressBlock = order.address ? formatAddressBlock(order.address) : null;

  const copyAddressBlock = async () => {
    if (!addressBlock) return;
    try {
      await navigator.clipboard.writeText(addressBlock);
      showToast('Shipping address copied', { variant: 'success' });
    } catch {
      showToast('Copy failed', { variant: 'error' });
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href={`/admin/shop-orders?highlight=${order.id}`} className="text-cream-200 hover:text-orange-500 text-xs uppercase tracking-wide">← Back to orders</Link>
          <h1 className="text-orange-500 text-2xl uppercase tracking-wide mt-1">
            Order #{order.orderNumber}
          </h1>
          <p className="text-cream-200 text-sm mt-1">
            Placed {formatDateTime(order.placedAt)}
          </p>
        </div>
        <StatusPill status={order.status} className="text-sm px-3 py-1" />
      </div>

      {/* Status banner */}
      <div className={`p-4 ${statusBannerClass(order.status)}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-base font-bold">{statusBannerHeadline(order.status)}</p>
            {order.status === 'ON_HOLD' && order.holdReason && (
              <p className="text-sm mt-1 opacity-90">Hold reason: {order.holdReason}</p>
            )}
            {order.status === 'REJECTED' && order.rejectionReason && (
              <p className="text-sm mt-1 opacity-90">Rejection reason: {order.rejectionReason}</p>
            )}
            {order.status === 'FULFILLED' && (
              <div className="text-sm mt-1 space-y-1 opacity-90">
                {order.trackingNumber && (
                  <p>Tracking: <span className="font-mono">{order.trackingNumber}</span>{order.trackingCarrier && <span className="ml-2 opacity-60">({order.trackingCarrier.toUpperCase()})</span>}</p>
                )}
                {order.fulfillmentUsdCents != null && (
                  <p>Fulfillment cost: <span className="font-mono">${(order.fulfillmentUsdCents / 100).toFixed(2)}</span></p>
                )}
              </div>
            )}
          </div>
          {(order.status === 'FULFILLED' || order.status === 'REJECTED' || (order.status === 'ON_HOLD' && order.heldAt)) && (
            <div className="text-xs opacity-70 font-mono whitespace-nowrap text-right">
              {order.status === 'FULFILLED' && order.fulfilledAt && (
                <p>fulfilled {formatDateTime(order.fulfilledAt)}</p>
              )}
              {order.status === 'REJECTED' && order.rejectedAt && (
                <p>rejected {formatDateTime(order.rejectedAt)}</p>
              )}
              {order.status === 'ON_HOLD' && order.heldAt && (
                <p>held {formatDateTime(order.heldAt)}</p>
              )}
              {order.lastActor && (
                <p className="mt-0.5">by {order.lastActor.name || order.lastActor.email}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {order.user.fraudConvicted && (
        <div className="bg-red-600/10 border-l-4 border-red-600 p-4">
          <p className="text-red-600 text-sm uppercase tracking-wide font-bold">⚠ User is flagged for fraud</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: order + shipping + actions + fulfill */}
        <div className="lg:col-span-2 space-y-6">
          {/* Order card */}
          <div className="bg-brown-800 border-2 border-cream-500/20 p-5 space-y-4">
            <h2 className="text-orange-500 text-sm uppercase tracking-wide">Order</h2>
            <div className="flex items-start gap-4">
              {order.shopItem.imageUrl ? (
                <img src={order.shopItem.imageUrl} alt="" className="w-20 h-20 object-contain border border-cream-500/20 bg-brown-900" />
              ) : (
                <div className="w-20 h-20 border border-cream-500/20 bg-brown-900 flex items-center justify-center text-cream-500 text-xs uppercase">No image</div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-cream-50 text-lg">{order.shopItem.name}</p>
                <p className="text-cream-200 text-sm mt-1">{order.quantity} × {order.unitBitsCost.toLocaleString()} bits</p>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 -mx-2 pt-2 border-t border-cream-500/10">
              <CopyableField label="Order #" value={`#${order.orderNumber}`} toastLabel="Order number" />
              <CopyableField label="Quantity" value={String(order.quantity)} />
              <CopyableField label="Total Bits" value={order.totalBitsCost.toLocaleString()} toastLabel="Bits" />
              <CopyableField label="Est. USD" value={`$${(order.estimatedUsdCents / 100).toFixed(2)}`} toastLabel="Estimated USD" />
            </div>
          </div>

          {/* Shipping card */}
          <div className="bg-brown-800 border-2 border-cream-500/20 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-orange-500 text-sm uppercase tracking-wide">Shipping</h2>
              {addressBlock && (
                <button
                  onClick={copyAddressBlock}
                  className="text-xs uppercase tracking-wide text-cream-200 hover:text-orange-500 cursor-pointer"
                >
                  Copy all
                </button>
              )}
            </div>
            {order.address ? (
              <div className="space-y-0">
                <CopyableField label="Name" value={[order.address.first_name, order.address.last_name].filter(Boolean).join(' ') || null} />
                <CopyableField label="Address line 1" value={order.address.line_1} />
                {order.address.line_2 && (
                  <CopyableField label="Address line 2" value={order.address.line_2} />
                )}
                <CopyableField label="City" value={order.address.city} />
                <CopyableField label="State" value={order.address.state} />
                <CopyableField label="Postal code" value={order.address.postal_code} toastLabel="Postal code" />
                <CopyableField label="Country" value={countryName(order.address.country)} />
                <CopyableField label="Phone" value={order.phone} />
              </div>
            ) : (
              <p className="text-cream-500 text-sm italic">No shipping snapshot on this order (legacy record).</p>
            )}
          </div>

          {/* Actions: hold / reject */}
          <ShopOrderActions order={order} onChange={fetchOrder} />

          {/* Fulfill (only when not terminal) */}
          {!(order.status === 'FULFILLED' || order.status === 'REJECTED' || order.status === 'CANCELLED') && (
            <ShopOrderFulfill order={order} onChange={fetchOrder} />
          )}
        </div>

        {/* Right column: user → stats → notes. Notes is `position: sticky` so
            once the user/stats cards scroll out of view, notes pins to the top
            of the viewport until the aside's bottom passes — scrolling back up
            reveals user/stats again. */}
        <aside className="space-y-6">
          <div className="bg-brown-800 border-2 border-cream-500/20 p-5 space-y-4">
            <h2 className="text-orange-500 text-sm uppercase tracking-wide">User</h2>
            <Link
              href={`/dashboard/profile/${order.user.id}`}
              className="flex items-center gap-3 group"
            >
              <img src={order.user.image || '/default_slack.png'} alt="" className="w-12 h-12 border border-cream-500/20" />
              <div className="min-w-0 flex-1">
                <p className="text-cream-50 truncate group-hover:text-orange-500 group-hover:underline transition-colors">{order.user.name || order.user.email}</p>
                <p className="text-cream-200 text-xs truncate">{order.user.email}</p>
              </div>
            </Link>
            <div className="flex flex-wrap gap-2">
              <a
                href={`mailto:${order.user.email}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs uppercase tracking-wide bg-brown-900 border border-cream-500/30 hover:border-orange-500 hover:text-orange-500 text-cream-50 cursor-pointer transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
                Email
              </a>
              {slackUrl && (
                <a
                  href={slackUrl}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs uppercase tracking-wide bg-brown-900 border border-cream-500/30 hover:border-orange-500 hover:text-orange-500 text-cream-50 cursor-pointer transition-colors"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path d="M14.5 10c-.83 0-1.5-.67-1.5-1.5v-5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5v5c0 .83-.67 1.5-1.5 1.5z" />
                    <path d="M20.5 10H19V8.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" />
                    <path d="M9.5 14c.83 0 1.5.67 1.5 1.5v5c0 .83-.67 1.5-1.5 1.5S8 21.33 8 20.5v-5c0-.83.67-1.5 1.5-1.5z" />
                    <path d="M3.5 14H5v1.5C5 16.33 4.33 17 3.5 17S2 16.33 2 15.5 2.67 14 3.5 14z" />
                    <path d="M14 14.5c0-.83.67-1.5 1.5-1.5h5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-5c-.83 0-1.5-.67-1.5-1.5z" />
                    <path d="M15.5 19H14v1.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5-.67-1.5-1.5-1.5z" />
                    <path d="M10 9.5C10 8.67 9.33 8 8.5 8h-5C2.67 8 2 8.67 2 9.5S2.67 11 3.5 11h5c.83 0 1.5-.67 1.5-1.5z" />
                    <path d="M8.5 5H10V3.5C10 2.67 9.33 2 8.5 2S7 2.67 7 3.5 7.67 5 8.5 5z" />
                  </svg>
                  Open in Slack
                </a>
              )}
            </div>
            {order.user.verificationStatus === 'verified' && (
              <p className="text-xs uppercase tracking-wide text-green-600">✓ HCA verified</p>
            )}
            <div className="space-y-0">
              <CopyableField label="Slack ID" value={order.user.slackId} />
              <CopyableField label="User ID" value={order.user.id} toastLabel="User ID" />
            </div>
          </div>

          {stats && (
            <div className="bg-brown-800 border-2 border-cream-500/20 p-5 space-y-2">
              <h2 className="text-orange-500 text-sm uppercase tracking-wide mb-1">Stats</h2>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-cream-500 text-xs uppercase tracking-wide">Balance</p>
                  <p className="text-cream-50 font-mono">{stats.bitsBalance.toLocaleString()} bits</p>
                </div>
                <div>
                  <p className="text-cream-500 text-xs uppercase tracking-wide">Orders</p>
                  <Link href={`/admin/shop-orders?search=${encodeURIComponent(order.user.email)}`} className="text-cream-50 font-mono hover:text-orange-500">
                    {stats.totalOrders}
                  </Link>
                </div>
                <div>
                  <p className="text-cream-500 text-xs uppercase tracking-wide">Projects</p>
                  <p className="text-cream-50 font-mono">{stats.projectCount}</p>
                </div>
                <div>
                  <p className="text-cream-500 text-xs uppercase tracking-wide">Parts spend</p>
                  <p className="text-cream-50 font-mono">{stats.bitsSpentOnParts.toLocaleString()} bits</p>
                </div>
              </div>
              <p className="text-cream-500 text-xs mt-3 uppercase tracking-wide">Member since {new Date(order.user.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short' })}</p>
            </div>
          )}

          <div className="lg:sticky lg:top-4">
            <NotesThread orderId={order.id} initialNotes={order.notes} />
          </div>
        </aside>
      </div>
    </div>
  );
}
