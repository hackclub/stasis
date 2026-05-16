'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession } from '@/lib/auth-client';
import { useInventorySSE } from '@/lib/inventory/useInventorySSE';
import {
  OrderStatusBar,
  ORDER_STATUS_STEPS,
  PRINT_STATUS_STEPS,
  RENTAL_STATUS_STEPS,
  RETURN_STATUS_STEPS,
} from '@/app/components/inventory/OrderStatusBar';
import { RentalTimer } from '@/app/components/inventory/RentalTimer';
import { TeamPanel } from '@/app/components/inventory/TeamPanel';
import { minutesToHuman, printReadyForStart, statusLabel, type ManufacturingJob, type ManufacturingState } from '@/app/components/inventory/manufacturing/ManufacturingUI';
import { useInventoryAccess } from '../InventoryAccessContext';

interface OrderItem {
  id: string;
  quantity: number;
  item: { id: string; name: string; imageUrl?: string };
}

interface Order {
  id: string;
  status: 'PLACED' | 'IN_PROGRESS' | 'READY' | 'COMPLETED' | 'CANCELLED';
  floor: number;
  location: string;
  items: OrderItem[];
  placedBy: { id: string; name: string; email: string };
  createdAt: string;
}

interface Rental {
  id: string;
  status: 'PLACED' | 'IN_PROGRESS' | 'READY' | 'CHECKED_OUT' | 'RETURN_REQUESTED' | 'RETURNED' | 'CANCELLED';
  floor: number;
  location: string;
  dueAt: string | null;
  createdAt: string;
  returnRequestedAt: string | null;
  returnedAt: string | null;
  tool: { id: string; name: string };
  rentedBy: { id: string; name: string; email: string };
}

const ACTIVE_RENTAL_STATUSES = ['PLACED', 'IN_PROGRESS', 'READY', 'CHECKED_OUT'] as const;
const ACTIVE_RETURN_STATUSES = ['RETURN_REQUESTED'] as const;
const ACTIVE_PRINT_STATUSES = ['PENDING', 'TIME_APPROVAL_REQUESTED', 'QUEUED', 'PRINTING', 'READY'] as const;
const REJECTED_PRINT_STATUSES = ['TIME_REJECTED_BY_TEAM', 'REJECTED', 'REJECTED_BY_ORGANIZER', 'REJECTED_BY_PRINTER', 'CANCELLED'] as const;

export default function DashboardPage() {
  const { data: session } = useSession();
  const access = useInventoryAccess();
  const [orders, setOrders] = useState<Order[]>([]);
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [manufacturing, setManufacturing] = useState<ManufacturingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [cancellingOrderIds, setCancellingOrderIds] = useState<Set<string>>(new Set());
  const [pickingUpOrderIds, setPickingUpOrderIds] = useState<Set<string>>(new Set());
  const [returningRentalIds, setReturningRentalIds] = useState<Set<string>>(new Set());
  const [approvingPrintTimeIds, setApprovingPrintTimeIds] = useState<Set<string>>(new Set());
  const [pickingUpPrintId, setPickingUpPrintId] = useState<string | null>(null);
  const [dismissingPrintId, setDismissingPrintId] = useState<string | null>(null);
  const [now, setNow] = useState<number | null>(null);

  const lastEvent = useInventorySSE(access?.teamId ?? null);

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 5000);
  };

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch('/api/inventory/orders');
      if (res.ok) setOrders(await res.json());
    } catch (error) {
      console.error('Failed to load orders', error);
      setError('Failed to load orders.');
    }
  }, []);

  const fetchRentals = useCallback(async () => {
    try {
      const res = await fetch('/api/inventory/rentals');
      if (res.ok) setRentals(await res.json());
    } catch (error) {
      console.error('Failed to load rentals', error);
      setError('Failed to load tool requests.');
    }
  }, []);

  const fetchManufacturing = useCallback(async () => {
    try {
      const res = await fetch('/api/inventory/manufacturing/state');
      if (res.ok) setManufacturing(await res.json());
    } catch (error) {
      console.error('Failed to load print requests', error);
      setError('Failed to load print requests.');
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    if (access?.teamId) {
      await Promise.all([fetchOrders(), fetchRentals(), fetchManufacturing()]);
    }
    setLoading(false);
  }, [access?.teamId, fetchOrders, fetchRentals, fetchManufacturing]);

  useEffect(() => {
    if (!session) return;
    loadData();
  }, [session, loadData]);

  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    const interval = window.setInterval(update, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!lastEvent) return;
    const type = lastEvent.type;
    if (type === 'order_placed' || type === 'order_status_updated') {
      fetchOrders();
    }
    if (type === 'rental_created' || type === 'rental_returned') {
      fetchRentals();
    }
    if (type === 'rental_status_updated' || type === 'manufacturing_job_updated' || type === 'manufacturing_job_created') {
      fetchRentals();
      fetchManufacturing();
    }
  }, [lastEvent, fetchOrders, fetchRentals, fetchManufacturing]);

  const cancelOrder = async (orderId: string) => {
    setCancellingOrderIds(prev => new Set(prev).add(orderId));
    setError(null);
    try {
      const res = await fetch(`/api/inventory/orders/${orderId}/cancel`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Failed to cancel order');
      }
      showSuccess('Order cancelled.');
      fetchOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel order');
    } finally {
      setCancellingOrderIds(prev => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    }
  };

  const markOrderPickedUp = async (orderId: string) => {
    setPickingUpOrderIds(prev => new Set(prev).add(orderId));
    setError(null);
    try {
      const res = await fetch(`/api/inventory/orders/${orderId}/pickup`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Failed to mark order picked up');
      }
      showSuccess('Order marked picked up.');
      fetchOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark order picked up');
    } finally {
      setPickingUpOrderIds(prev => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    }
  };

  const startRentalReturn = async (rentalId: string) => {
    setReturningRentalIds(prev => new Set(prev).add(rentalId));
    setError(null);
    try {
      const res = await fetch(`/api/inventory/rentals/${rentalId}/return`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Failed to start tool return');
      }
      showSuccess('Tool marked returned. Waiting for organizer approval.');
      fetchRentals();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start tool return');
    } finally {
      setReturningRentalIds(prev => {
        const next = new Set(prev);
        next.delete(rentalId);
        return next;
      });
    }
  };

  const updatePrintTimeApproval = async (job: ManufacturingJob, approved: boolean) => {
    setApprovingPrintTimeIds(prev => new Set(prev).add(job.id));
    setError(null);
    try {
      const res = await fetch(`/api/inventory/manufacturing/jobs/${job.id}/time-approval`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Failed to update print time approval');
      }
      showSuccess(approved ? 'Print estimate approved.' : 'Print estimate rejected.');
      fetchManufacturing();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update print time approval');
    } finally {
      setApprovingPrintTimeIds(prev => {
        const next = new Set(prev);
        next.delete(job.id);
        return next;
      });
    }
  };

  const markPrintPickedUp = async (job: ManufacturingJob) => {
    setPickingUpPrintId(job.id);
    setError(null);
    try {
      const res = await fetch(`/api/inventory/manufacturing/jobs/${job.id}/pickup`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Failed to mark print picked up');
      }
      showSuccess('Print marked picked up.');
      fetchManufacturing();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark print picked up');
    } finally {
      setPickingUpPrintId(null);
    }
  };

  const dismissRejectedPrint = async (job: ManufacturingJob) => {
    setDismissingPrintId(job.id);
    setError(null);
    try {
      const res = await fetch(`/api/inventory/manufacturing/jobs/${job.id}/dismiss`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Failed to dismiss print');
      }
      showSuccess('Print dismissed.');
      fetchManufacturing();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to dismiss print');
    } finally {
      setDismissingPrintId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="loader" />
      </div>
    );
  }

  // No team -- delegate entirely to TeamPanel
  if (!access?.teamId) {
    return (
      <TeamPanel
        teamId={undefined}
        currentUserId={session?.user.id ?? ''}
        onTeamChanged={loadData}
      />
    );
  }

  const activeOrders = orders.filter(o => o.status !== 'COMPLETED' && o.status !== 'CANCELLED');
  const pastOrders = orders.filter(o => o.status === 'COMPLETED' || o.status === 'CANCELLED');
  const activeRentals = rentals.filter(r => ACTIVE_RENTAL_STATUSES.includes(r.status as typeof ACTIVE_RENTAL_STATUSES[number]));
  const activeReturns = rentals.filter(r => ACTIVE_RETURN_STATUSES.includes(r.status as typeof ACTIVE_RETURN_STATUSES[number]));
  const pastRentals = rentals.filter(r => r.status === 'RETURNED' || r.status === 'CANCELLED');
  const teamPrints = (manufacturing?.jobs ?? []).filter(job => job.teamId === access.teamId);
  const activePrints = teamPrints.filter(job => ACTIVE_PRINT_STATUSES.includes(job.status as typeof ACTIVE_PRINT_STATUSES[number]));
  const rejectedPrints = teamPrints.filter(job => (
    REJECTED_PRINT_STATUSES.includes(job.status as typeof REJECTED_PRINT_STATUSES[number]) && !job.dismissedAt
  ));
  const printRequests = [...activePrints, ...rejectedPrints]
    .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());

  return (
    <div className="space-y-8">
      {successMessage && (
        <div className="border-2 border-green-600 bg-green-50 px-4 py-3 text-green-800 text-sm">
          {successMessage}
        </div>
      )}
      {error && (
        <div className="border-2 border-red-600 bg-red-50 px-4 py-3 text-red-800 text-sm">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline cursor-pointer">Dismiss</button>
        </div>
      )}

      {/* Active Orders */}
      <section>
        <h2 className="text-brown-800 font-bold text-sm uppercase tracking-wide mb-4">Active Orders</h2>
        {activeOrders.length > 0 ? (
          <div className="space-y-3">
            {activeOrders.map(order => (
              <div key={order.id} className="border-2 border-brown-800 bg-cream-100 p-6">
                <div className="mb-4">
                  <OrderStatusBar status={order.status} steps={ORDER_STATUS_STEPS} />
                </div>
                <div className="flex flex-wrap gap-4 text-xs text-brown-800/60 mb-4">
                  <span className="font-bold text-brown-800/80">#{order.id.slice(-6).toUpperCase()}</span>
                  <span className="uppercase text-orange-600">{statusLabel(order.status)}</span>
                  <span>{formatLocation(order.floor, order.location)}</span>
                  <span>Placed by {order.placedBy.name}</span>
                  <span>{new Date(order.createdAt).toLocaleString()}</span>
                </div>
                <ul className="space-y-1">
                  {order.items.map(oi => (
                    <li key={oi.id} className="flex justify-between text-sm text-brown-800">
                      <span>{oi.item.name}</span>
                      <span className="text-brown-800/60">x{oi.quantity}</span>
                    </li>
                  ))}
                </ul>
                {(order.status === 'PLACED' || order.status === 'IN_PROGRESS' || order.status === 'READY') && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {(order.status === 'PLACED' || order.status === 'IN_PROGRESS') && (
                      <button
                        type="button"
                        onClick={() => void cancelOrder(order.id)}
                        disabled={cancellingOrderIds.has(order.id)}
                        className="border-2 border-orange-500 px-4 py-2 text-sm uppercase tracking-wider text-orange-500 transition-colors hover:bg-orange-500 hover:text-cream-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {cancellingOrderIds.has(order.id) ? 'Cancelling...' : 'Cancel Order'}
                      </button>
                    )}
                    {order.status === 'READY' && (
                      <button
                        type="button"
                        onClick={() => void markOrderPickedUp(order.id)}
                        disabled={pickingUpOrderIds.has(order.id)}
                        className="border-2 border-orange-500 bg-orange-500 px-4 py-2 text-sm uppercase tracking-wider text-cream-50 transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {pickingUpOrderIds.has(order.id) ? 'Saving...' : 'Mark Picked Up'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-brown-800/50 text-sm">No active orders.</p>
        )}
      </section>

      {/* Team Prints */}
      <section>
        <h2 className="text-brown-800 font-bold text-sm uppercase tracking-wide mb-4">Team Prints</h2>
        {printRequests.length > 0 ? (
          <div className="space-y-3">
            {printRequests.map(job => {
              const rejected = isRejectedPrintStatus(job.status);
              const displayStatus = job.status === 'QUEUED' && printReadyForStart(job)
                ? 'READY_TO_PRINT'
                : job.status;
              const team = manufacturing?.teams.find(candidate => candidate.id === job.teamId) ?? null;
              return (
                <div
                  key={job.id}
                  className={`w-full border-2 p-4 ${
                    rejected
                      ? 'border-red-700 bg-red-50'
                      : 'border-brown-800 bg-cream-100'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="mb-2 flex flex-wrap items-center gap-3 text-xs text-brown-800/60">
                        <span className="font-bold text-brown-800/80">#{job.id.slice(-6).toUpperCase()}</span>
                        <span className={`uppercase ${rejected ? 'text-red-700' : 'text-orange-600'}`}>
                          {statusLabel(displayStatus)}
                        </span>
                        <span>{job.estimatedMinutes ? `${minutesToHuman(job.estimatedMinutes)} team print allocation` : 'Waiting for print estimate'}</span>
                        {job.overBudgetApprovedAt && (
                          <span className="font-bold uppercase text-red-700">Over-budget estimate</span>
                        )}
                        {job.urgent && (
                          <span className="font-bold uppercase text-red-700">Urgent</span>
                        )}
                        <span>Requested by {job.submittedBy.name || job.submittedBy.slackDisplayName || 'Unknown'}</span>
                      </div>
                      <h3 className="truncate text-sm font-bold uppercase tracking-wide text-brown-800">
                        {job.projectName}
                      </h3>
                      <p className="mt-1 line-clamp-2 text-sm text-brown-800/70">{job.description}</p>
                      <p className="mt-1 text-xs text-brown-800/50">{job.material} | {job.colour}</p>
                    </div>
                  </div>

                  {!rejected && (
                    <div className="mt-4">
                      <OrderStatusBar
                        status={displayStatus}
                        steps={PRINT_STATUS_STEPS}
                        progressBetween={
                          job.status === 'PRINTING'
                            ? { from: 'PRINTING', to: 'READY', percent: printElapsedPercent(job, now) }
                            : undefined
                        }
                      />
                      {job.status === 'PRINTING' && (
                        <p className="mt-2 text-xs uppercase tracking-wider text-brown-800/50">
                          {printProgressText(job, now)}
                        </p>
                      )}
                      {job.status === 'TIME_APPROVAL_REQUESTED' && (
                        <PrintEstimateApprovalPanel job={job} team={team} />
                      )}
                    </div>
                  )}

                  {job.staffNotes && (
                    <p className="mt-3 text-xs text-red-700">{job.staffNotes}</p>
                  )}
                  <div className="mt-4 flex flex-wrap gap-2">
                    {job.status === 'READY' && (
                      <button
                        type="button"
                        disabled={pickingUpPrintId === job.id}
                        onClick={() => void markPrintPickedUp(job)}
                        className="border-2 border-orange-500 bg-orange-500 px-4 py-2 text-sm uppercase tracking-wider text-cream-50 transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {pickingUpPrintId === job.id ? 'Saving...' : 'Mark Picked Up'}
                      </button>
                    )}
                    {job.status === 'TIME_APPROVAL_REQUESTED' && (
                      <>
                        <button
                          type="button"
                          disabled={approvingPrintTimeIds.has(job.id)}
                          onClick={() => void updatePrintTimeApproval(job, true)}
                          className="border-2 border-orange-500 bg-orange-500 px-4 py-2 text-sm uppercase tracking-wider text-cream-50 transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {approvingPrintTimeIds.has(job.id) ? 'Saving...' : 'Approve Estimate'}
                        </button>
                        <button
                          type="button"
                          disabled={approvingPrintTimeIds.has(job.id)}
                          onClick={() => void updatePrintTimeApproval(job, false)}
                          className="border-2 border-red-700 px-4 py-2 text-sm uppercase tracking-wider text-red-700 transition-colors hover:bg-red-700 hover:text-cream-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {approvingPrintTimeIds.has(job.id) ? 'Saving...' : 'Reject Estimate'}
                        </button>
                      </>
                    )}
                    {rejected && (
                      <button
                        type="button"
                        disabled={dismissingPrintId === job.id}
                        onClick={() => void dismissRejectedPrint(job)}
                        className="border-2 border-red-700 px-4 py-2 text-sm uppercase tracking-wider text-red-700 transition-colors hover:bg-red-700 hover:text-cream-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {dismissingPrintId === job.id ? 'Dismissing...' : 'Dismiss'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-brown-800/50 text-sm">No print requests yet.</p>
        )}
      </section>

      {/* Active Rentals */}
      <section>
        <h2 className="text-brown-800 font-bold text-sm uppercase tracking-wide mb-4">Tool Requests</h2>
        {activeRentals.length > 0 ? (
          <div className="space-y-3">
            {activeRentals.map(rental => (
              <div
                key={rental.id}
                className="border-2 border-brown-800 bg-cream-100 p-4"
              >
                <div className="mb-4">
                  <OrderStatusBar status={rental.status} steps={RENTAL_STATUS_STEPS} />
                </div>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <span className="text-brown-800 font-bold text-sm">{rental.tool.name}</span>
                    <div className="flex flex-wrap gap-3 text-xs text-brown-800/60 mt-1">
                      <span>{formatLocation(rental.floor, rental.location)}</span>
                      <span>by {rental.rentedBy.name}</span>
                      <span className="uppercase">{statusLabel(rental.status)}</span>
                    </div>
                  </div>
                  {rental.status === 'CHECKED_OUT' && <RentalTimer dueAt={rental.dueAt} />}
                </div>
                {rental.status === 'CHECKED_OUT' && (
                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={() => void startRentalReturn(rental.id)}
                      disabled={returningRentalIds.has(rental.id)}
                      className="border-2 border-orange-500 bg-orange-500 px-4 py-2 text-sm uppercase tracking-wider text-cream-50 transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {returningRentalIds.has(rental.id) ? 'Saving...' : 'Start Return'}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-brown-800/50 text-sm">No active tool requests.</p>
        )}
      </section>

      {activeReturns.length > 0 && (
        <section>
          <h2 className="text-brown-800 font-bold text-sm uppercase tracking-wide mb-4">Tool Returns</h2>
          <div className="space-y-3">
            {activeReturns.map(rental => (
              <div
                key={rental.id}
                className="border-2 border-orange-500 bg-orange-500/10 p-4"
              >
                <div className="mb-4">
                  <OrderStatusBar status={rental.status} steps={RETURN_STATUS_STEPS} />
                </div>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <span className="text-brown-800 font-bold text-sm">{rental.tool.name}</span>
                    <div className="flex flex-wrap gap-3 text-xs text-brown-800/60 mt-1">
                      <span>{formatLocation(rental.floor, rental.location)}</span>
                      <span>by {rental.rentedBy.name}</span>
                      <span className="uppercase">{statusLabel(rental.status)}</span>
                      {rental.returnRequestedAt && (
                        <span>started {new Date(rental.returnRequestedAt).toLocaleString()}</span>
                      )}
                    </div>
                    <p className="mt-2 text-xs text-orange-700">
                      Waiting for organizer approval.
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Team */}
      <TeamPanel
        teamId={access.teamId}
        currentUserId={session?.user.id ?? ''}
        onTeamChanged={loadData}
      />

      {/* Order History */}
      <section>
        <h2 className="text-brown-800 font-bold text-sm uppercase tracking-wide mb-4">Order History</h2>
        {pastOrders.length > 0 ? (
          <div className="border-2 border-brown-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-cream-200 text-brown-800 text-xs uppercase tracking-wider">
                  <th className="text-left px-4 py-2">Order</th>
                  <th className="text-left px-4 py-2">Date</th>
                  <th className="text-left px-4 py-2">Items</th>
                  <th className="text-left px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {pastOrders.map(order => (
                  <tr key={order.id} className="border-t border-cream-400 bg-cream-100">
                    <td className="px-4 py-2 text-brown-800 font-bold whitespace-nowrap">
                      #{order.id.slice(-6).toUpperCase()}
                    </td>
                    <td className="px-4 py-2 text-brown-800/70 whitespace-nowrap">
                      {new Date(order.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2 text-brown-800">
                      {order.items.map(oi => `${oi.item.name} x${oi.quantity}`).join(', ')}
                    </td>
                    <td className="px-4 py-2 text-brown-800/70 text-xs uppercase">
                      {order.status === 'CANCELLED' ? 'Cancelled' : 'Completed'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-brown-800/50 text-sm">No past orders.</p>
        )}
      </section>

      {/* Rental History */}
      <section>
        <h2 className="text-brown-800 font-bold text-sm uppercase tracking-wide mb-4">Rental History</h2>
        {pastRentals.length > 0 ? (
          <div className="border-2 border-brown-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-cream-200 text-brown-800 text-xs uppercase tracking-wider">
                  <th className="text-left px-4 py-2">Tool</th>
                  <th className="text-left px-4 py-2">Rented</th>
                  <th className="text-left px-4 py-2">Returned</th>
                  <th className="text-left px-4 py-2">By</th>
                </tr>
              </thead>
              <tbody>
                {pastRentals.map(rental => (
                  <tr key={rental.id} className="border-t border-cream-400 bg-cream-100">
                    <td className="px-4 py-2 text-brown-800">{rental.tool.name}</td>
                    <td className="px-4 py-2 text-brown-800/70 whitespace-nowrap">
                      {new Date(rental.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2 text-brown-800/70 whitespace-nowrap">
                      {rental.returnedAt ? new Date(rental.returnedAt).toLocaleDateString() : '-'}
                    </td>
                    <td className="px-4 py-2 text-brown-800/70">{rental.rentedBy.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-brown-800/50 text-sm">No past rentals.</p>
        )}
      </section>

    </div>
  );
}

function formatLocation(floor: number, location: string): string {
  const parts = [];
  if (floor) parts.push(`Floor ${floor}`);
  if (location) parts.push(location);
  return parts.join(' | ') || 'No location';
}

function isRejectedPrintStatus(status: ManufacturingJob['status']) {
  return REJECTED_PRINT_STATUSES.includes(status as typeof REJECTED_PRINT_STATUSES[number]);
}

function PrintEstimateApprovalPanel({
  job,
  team,
}: Readonly<{
  job: ManufacturingJob;
  team: ManufacturingState['teams'][number] | null;
}>) {
  const estimate = job.estimatedMinutes ?? 0;
  const remainingNow = team
    ? Math.max(0, team.allowanceMinutes - team.usedMinutes - team.reservedMinutes)
    : null;
  const remainingBeforeThisEstimate = remainingNow === null ? null : remainingNow + estimate;
  const remainingAfterApproval = remainingBeforeThisEstimate === null
    ? null
    : Math.max(0, remainingBeforeThisEstimate - estimate);
  const isOverride = Boolean(job.overBudgetApprovedAt);
  const isOverBudget = isOverride || (
    remainingBeforeThisEstimate !== null && estimate > remainingBeforeThisEstimate
  );
  const beforeLabel = remainingBeforeThisEstimate === null
    ? null
    : minutesToHuman(remainingBeforeThisEstimate);
  const afterLabel = remainingAfterApproval === null
    ? null
    : minutesToHuman(remainingAfterApproval);

  return (
    <div className={`mt-3 border-2 p-4 text-sm ${isOverBudget ? 'border-red-700 bg-red-50 text-red-900' : 'border-orange-500 bg-orange-50 text-brown-800'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider">
            {isOverBudget ? 'Team Decision Required: Over-Budget Estimate' : 'Team Decision Required: Print Estimate'}
          </p>
          <p className="mt-2">
            An organizer estimated this print at <span className="font-bold">{minutesToHuman(estimate)}</span>.
          </p>
        </div>
        <span className={`border-2 px-2 py-1 text-xs font-bold uppercase tracking-wider ${isOverBudget ? 'border-red-700 text-red-700' : 'border-orange-500 text-orange-700'}`}>
          {isOverBudget ? 'Override Sent' : 'Budget Check'}
        </span>
      </div>
      {remainingBeforeThisEstimate !== null && remainingAfterApproval !== null && (
        <div className="mt-3 grid gap-2 text-xs uppercase tracking-wider sm:grid-cols-3">
          <div className="border border-current bg-cream-50 p-2">
            <span className="block opacity-70">Team Budget Before</span>
            <span className="mt-1 block font-bold">{beforeLabel}</span>
          </div>
          <div className="border border-current bg-cream-50 p-2">
            <span className="block opacity-70">Estimate</span>
            <span className="mt-1 block font-bold">{minutesToHuman(estimate)}</span>
          </div>
          <div className="border border-current bg-cream-50 p-2">
            <span className="block opacity-70">Budget If Approved</span>
            <span className="mt-1 block font-bold">{afterLabel}</span>
          </div>
        </div>
      )}
      {isOverBudget && (
        <div className="mt-3 border border-red-700 bg-cream-50 p-3 text-xs uppercase tracking-wider">
          <p className="font-bold">What the override means</p>
          <p className="mt-1">
            An organizer allowed this estimate to reach your team even though it is over budget. Your team still decides.
            Approving spends the remaining team print budget and leaves {afterLabel ?? '0m'} available. There is no negative balance and no debt.
          </p>
        </div>
      )}
      <p className="mt-3 text-xs uppercase tracking-wider opacity-80">
        Approve Estimate moves the print into the approved printer queue. Reject Estimate cancels the print request and frees this reserved estimate from your team budget.
      </p>
    </div>
  );
}

function printElapsedPercent(job: ManufacturingJob, now: number | null) {
  const startedAt = job.startedAt ? new Date(job.startedAt).getTime() : null;
  const elapsedMinutes = startedAt && now ? Math.max(0, (now - startedAt) / 60000) : 0;
  return !job.estimatedMinutes || job.estimatedMinutes <= 0
    ? 0
    : Math.min(90, (elapsedMinutes / job.estimatedMinutes) * 100);
}

function printProgressText(job: ManufacturingJob, now: number | null) {
  if (!job.estimatedMinutes) return 'Waiting for estimate';
  const startedAt = job.startedAt ? new Date(job.startedAt).getTime() : null;
  const elapsedMinutes = startedAt && now ? Math.max(0, (now - startedAt) / 60000) : 0;
  const over = elapsedMinutes > job.estimatedMinutes;

  return over
    ? 'Past estimate'
    : `${minutesToHuman(Math.max(0, job.estimatedMinutes - elapsedMinutes))} estimated remaining`;
}
