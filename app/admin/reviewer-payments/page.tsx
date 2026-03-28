'use client';

import { useState, useEffect, useCallback, Fragment } from 'react';

interface ReviewDetail {
  id: string;
  projectId: string;
  projectName: string;
  stage: string;
  result: string;
  feedback: string;
  createdAt: string;
  willBePaid: boolean;
}

interface ReviewerPayment {
  reviewerId: string;
  name: string | null;
  email: string;
  unpaidCount: number;
  payout: number;
  lastPaidAt: string | null;
  reviews: ReviewDetail[];
}

const RESULT_STYLES: Record<string, string> = {
  APPROVED: 'bg-green-100 border-green-600 text-green-700',
  RETURNED: 'bg-orange-500/10 border-orange-500/50 text-orange-500',
  REJECTED: 'bg-red-100 border-red-600 text-red-700',
};

export default function ReviewerPaymentsPage() {
  const [reviewers, setReviewers] = useState<ReviewerPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState<string | null>(null); // reviewerId or 'all'
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [lastResult, setLastResult] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/reviewer-payments');
      if (res.ok) {
        const data = await res.json();
        setReviewers(data.reviewers);
      } else {
        setError('Failed to load reviewer payments.');
      }
    } catch {
      setError('Network error — could not load data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleExpanded = (reviewerId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(reviewerId)) {
        next.delete(reviewerId);
      } else {
        next.add(reviewerId);
      }
      return next;
    });
  };

  const handlePay = async (reviewerIds: string[]) => {
    const key = reviewerIds.length === 1 ? reviewerIds[0] : 'all';
    setPaying(key);
    setLastResult(null);
    try {
      const res = await fetch('/api/admin/reviewer-payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewerIds }),
      });
      if (res.ok) {
        const data = await res.json();
        const paid = data.results?.length ?? 0;
        const totalBits = data.results?.reduce((s: number, r: { amount: number }) => s + r.amount, 0) ?? 0;
        const errCount = data.errors?.length ?? 0;
        const parts: string[] = [];
        if (paid > 0) parts.push(`Paid ${totalBits} bits to ${paid} reviewer${paid > 1 ? 's' : ''}`);
        if (errCount > 0) parts.push(`${errCount} skipped`);
        setLastResult(parts.join('. ') || 'No payments made.');
        fetchData();
      } else {
        const data = await res.json().catch(() => ({}));
        setLastResult(typeof data.error === 'string' ? data.error.slice(0, 200) : 'Payment failed.');
      }
    } catch {
      setLastResult('Network error during payment.');
    } finally {
      setPaying(null);
    }
  };

  const payableReviewers = reviewers.filter((r) => r.payout > 0);
  const totalPendingBits = payableReviewers.reduce((s, r) => s + r.payout, 0);

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-orange-500 text-2xl uppercase tracking-wide">Reviewer Payments</h1>
          <p className="text-cream-50 text-sm mt-1">
            Reviewers earn 0.5 bits per review. {reviewers.length} reviewer{reviewers.length !== 1 ? 's' : ''} with
            unpaid reviews, {totalPendingBits} bits pending.
          </p>
        </div>
        {payableReviewers.length > 0 && (
          <button
            onClick={() => {
              if (confirm(`Pay ${totalPendingBits} bits to ${payableReviewers.length} reviewer${payableReviewers.length > 1 ? 's' : ''}?`)) {
                handlePay(payableReviewers.map((r) => r.reviewerId));
              }
            }}
            disabled={paying !== null}
            className="bg-orange-500 hover:bg-orange-400 text-white px-6 py-2 text-sm uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-50"
          >
            {paying === 'all' ? 'Paying...' : `Pay All (${totalPendingBits} bits)`}
          </button>
        )}
      </div>

      {lastResult && (
        <div className="bg-brown-800 border-2 border-cream-500/20 p-4">
          <p className="text-cream-50 text-sm">{lastResult}</p>
        </div>
      )}

      <div className="bg-brown-800 border-2 border-cream-500/20 overflow-x-auto">
        {loading ? (
          <div className="p-8 text-center">
            <div className="flex items-center justify-center"><div className="loader" /></div>
          </div>
        ) : error ? (
          <div className="p-8 text-center">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        ) : reviewers.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-cream-50">No unpaid reviews.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-cream-500/20">
                <th className="text-left text-cream-50 text-xs uppercase px-4 py-3 w-8"></th>
                <th className="text-left text-cream-50 text-xs uppercase px-4 py-3">Reviewer</th>
                <th className="text-right text-cream-50 text-xs uppercase px-4 py-3">Unpaid Reviews</th>
                <th className="text-right text-cream-50 text-xs uppercase px-4 py-3">Payout</th>
                <th className="text-left text-cream-50 text-xs uppercase px-4 py-3">Last Paid</th>
                <th className="text-right text-cream-50 text-xs uppercase px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {reviewers.map((reviewer) => {
                const isExpanded = expandedIds.has(reviewer.reviewerId);
                return (
                  <Fragment key={reviewer.reviewerId}>
                    <tr
                      className="border-b border-cream-500/10 hover:bg-cream-500/5 cursor-pointer"
                      onClick={() => toggleExpanded(reviewer.reviewerId)}
                    >
                      <td className="text-cream-50 px-4 py-3">
                        <span className="text-xs">{isExpanded ? '▼' : '▶'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-cream-50 font-medium">{reviewer.name ?? '—'}</p>
                        <p className="text-cream-200 text-xs">{reviewer.email}</p>
                      </td>
                      <td className="text-right text-cream-50 px-4 py-3 font-mono">
                        {reviewer.unpaidCount}
                      </td>
                      <td className="text-right px-4 py-3 font-mono font-medium">
                        {reviewer.payout > 0 ? (
                          <span className="text-green-600">+{reviewer.payout}</span>
                        ) : (
                          <span className="text-cream-200">0</span>
                        )}
                      </td>
                      <td className="text-cream-50 px-4 py-3 whitespace-nowrap">
                        {reviewer.lastPaidAt
                          ? new Date(reviewer.lastPaidAt).toLocaleDateString('en-US', {
                              month: 'short', day: 'numeric', year: 'numeric',
                            })
                          : '—'}
                      </td>
                      <td className="text-right px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => handlePay([reviewer.reviewerId])}
                          disabled={paying !== null || reviewer.payout === 0}
                          className="bg-orange-500 hover:bg-orange-400 text-white px-4 py-1 text-xs uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-40"
                        >
                          {paying === reviewer.reviewerId ? 'Paying...' : reviewer.payout === 0 ? 'Needs 2+' : 'Pay'}
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={6} className="px-0 py-0">
                          <div className="bg-brown-900 border-t border-cream-500/10">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-cream-500/10">
                                  <th className="text-left text-cream-200 uppercase px-6 py-2">Project</th>
                                  <th className="text-left text-cream-200 uppercase px-4 py-2">Stage</th>
                                  <th className="text-left text-cream-200 uppercase px-4 py-2">Result</th>
                                  <th className="text-left text-cream-200 uppercase px-4 py-2">Feedback</th>
                                  <th className="text-left text-cream-200 uppercase px-4 py-2">Date</th>
                                  <th className="text-left text-cream-200 uppercase px-4 py-2">Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {reviewer.reviews.map((review) => (
                                  <tr
                                    key={review.id}
                                    className={`border-b border-cream-500/5 last:border-b-0 ${
                                      review.willBePaid ? '' : 'opacity-50'
                                    }`}
                                  >
                                    <td className="text-cream-50 px-6 py-2">
                                      {review.projectName}
                                    </td>
                                    <td className="text-cream-50 px-4 py-2 capitalize">
                                      {review.stage.toLowerCase()}
                                    </td>
                                    <td className="px-4 py-2">
                                      <span className={`px-2 py-0.5 text-xs uppercase border ${
                                        RESULT_STYLES[review.result] ?? 'text-cream-50'
                                      }`}>
                                        {review.result}
                                      </span>
                                    </td>
                                    <td className="text-cream-200 px-4 py-2 max-w-xs truncate">
                                      {review.feedback}
                                    </td>
                                    <td className="text-cream-50 px-4 py-2 whitespace-nowrap">
                                      {new Date(review.createdAt).toLocaleDateString('en-US', {
                                        month: 'short', day: 'numeric', year: 'numeric',
                                      })}
                                    </td>
                                    <td className="px-4 py-2">
                                      {review.willBePaid ? (
                                        <span className="text-green-600 text-xs">Will be paid</span>
                                      ) : (
                                        <span className="text-cream-200 text-xs">Carried over</span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
