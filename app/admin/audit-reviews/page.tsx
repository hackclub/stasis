'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { getTierById } from '@/lib/tiers';

const TIER_COLORS: Record<number, string> = {
  1: 'bg-gray-200 text-gray-800',
  2: 'bg-green-200 text-green-800',
  3: 'bg-blue-200 text-blue-800',
  4: 'bg-purple-200 text-purple-800',
  5: 'bg-orange-200 text-orange-800',
};

const RESULT_COLORS: Record<string, string> = {
  APPROVED: 'bg-green-200 text-green-800',
  RETURNED: 'bg-orange-200 text-orange-800',
  REJECTED: 'bg-red-200 text-red-800',
};

interface Reviewer {
  id: string;
  name: string | null;
  image: string | null;
}

interface ReviewItem {
  id: string;
  result: string;
  feedback: string;
  reason: string | null;
  createdAt: string;
  invalidated: boolean;
  isAdminReview: boolean;
  reviewer: Reviewer;
  stage: string;
  frozenWorkUnits: number | null;
  frozenTier: number | null;
  frozenFundingAmount: number | null;
  tierOverride: number | null;
  grantOverride: number | null;
  workUnitsOverride: number | null;
  project: {
    id: string;
    title: string;
    tier: number | null;
    coverImage: string | null;
    author: { id: string; name: string | null; image: string | null };
    totalHours: number;
    bomCost: number;
    costPerHour: number;
    bitsPerHour: number | null;
    tierBits: number;
    entryCount: number;
  };
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function AuditReviewsPage() {
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [reviewers, setReviewers] = useState<Reviewer[]>([]);
  const [loading, setLoading] = useState(true);

  const [reviewerFilter, setReviewerFilter] = useState('');
  const [resultFilter, setResultFilter] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const fetchReviews = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      if (reviewerFilter) params.set('reviewer', reviewerFilter);
      if (resultFilter) params.set('result', resultFilter);
      if (stageFilter) params.set('stage', stageFilter);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      if (search) params.set('search', search);

      const res = await fetch(`/api/admin/audit-reviews?${params}`);
      if (res.ok) {
        const data = await res.json();
        setReviews(data.reviews);
        setPagination(data.pagination);
        setReviewers(data.reviewers);
      }
    } catch (error) {
      console.error('Failed to fetch reviews:', error);
    } finally {
      setLoading(false);
    }
  }, [page, reviewerFilter, resultFilter, stageFilter, startDate, endDate, search]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const hasFilters = reviewerFilter || resultFilter || stageFilter || startDate || endDate || search;

  return (
    <>
      {/* Filters */}
      <div className="mb-6 space-y-4">
        {/* Result filter buttons + stage filter */}
        <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
          <div className="flex gap-2 flex-wrap">
            {/* Result filters */}
            {['', 'APPROVED', 'RETURNED', 'REJECTED'].map((val) => (
              <button
                key={val}
                onClick={() => { setResultFilter(val); setPage(1); }}
                className={`px-3 py-1.5 text-xs uppercase tracking-wider border cursor-pointer ${
                  resultFilter === val
                    ? 'border-orange-500 text-orange-500 bg-orange-500/10'
                    : 'border-cream-400 text-brown-800 hover:border-orange-500'
                }`}
              >
                {val || 'All'}
              </button>
            ))}

            <span className="border-l border-cream-400 mx-1" />

            {/* Stage filters */}
            {['', 'DESIGN', 'BUILD'].map((val) => (
              <button
                key={`stage-${val}`}
                onClick={() => { setStageFilter(val); setPage(1); }}
                className={`px-3 py-1.5 text-xs uppercase tracking-wider border cursor-pointer ${
                  stageFilter === val
                    ? 'border-orange-500 text-orange-500 bg-orange-500/10'
                    : 'border-cream-400 text-brown-800 hover:border-orange-500'
                }`}
              >
                {val || 'All Stages'}
              </button>
            ))}
          </div>

          <p className="text-brown-800 text-sm uppercase">
            {pagination?.total ?? 0} review{(pagination?.total ?? 0) !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Second row: reviewer dropdown, dates, search */}
        <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
          <select
            value={reviewerFilter}
            onChange={(e) => { setReviewerFilter(e.target.value); setPage(1); }}
            className="bg-cream-100 border-2 border-cream-400 px-4 py-2 text-brown-800 focus:border-orange-500 focus:outline-none text-sm"
          >
            <option value="">All Reviewers</option>
            {reviewers.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name || r.id}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={startDate}
            onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
            className="bg-cream-100 border-2 border-cream-400 px-4 py-2 text-brown-800 focus:border-orange-500 focus:outline-none text-sm"
          />
          <input
            type="date"
            value={endDate}
            onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
            className="bg-cream-100 border-2 border-cream-400 px-4 py-2 text-brown-800 focus:border-orange-500 focus:outline-none text-sm"
          />
          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search project title..."
              className="px-3 py-2 text-sm border-2 border-cream-400 bg-cream-100 text-brown-800 placeholder:text-cream-600 focus:outline-none focus:border-orange-500 w-56"
            />
            <button
              type="submit"
              className="px-3 py-2 text-xs uppercase tracking-wider border border-orange-500 text-orange-500 hover:bg-orange-500/10 cursor-pointer"
            >
              Search
            </button>
          </form>
          {hasFilters && (
            <button
              onClick={() => {
                setReviewerFilter('');
                setResultFilter('');
                setStageFilter('');
                setStartDate('');
                setEndDate('');
                setSearch('');
                setSearchInput('');
                setPage(1);
              }}
              className="px-4 py-2 text-sm uppercase text-brown-800 hover:text-orange-500 transition-colors cursor-pointer"
            >
              Clear All
            </button>
          )}
        </div>
      </div>

      {/* Review Cards */}
      {loading ? (
        <div className="text-center py-8">
          <p className="text-brown-800">Loading reviews...</p>
        </div>
      ) : reviews.length === 0 ? (
        <div className="bg-cream-100 border-2 border-cream-400 p-8 text-center">
          <p className="text-brown-800">No reviews found</p>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {reviews.map((review) => {
              const tierInfo = review.project.tier ? getTierById(review.project.tier) : null;

              return (
                <Link
                  key={review.id}
                  href={`/admin/audit-reviews/${review.project.id}`}
                  className={`block bg-cream-100 border-2 border-cream-400 p-4 hover:border-orange-500 transition-colors ${
                    review.invalidated ? 'opacity-50' : ''
                  }`}
                >
                  {/* Header row */}
                  <div className="flex items-center gap-3 mb-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      {review.reviewer.image && (
                        <img src={review.reviewer.image} alt="" className="w-6 h-6 rounded-full" />
                      )}
                      <span className="text-brown-800 text-sm font-medium">
                        {review.reviewer.name || 'Unknown'}
                      </span>
                    </div>
                    <span className={`text-xs uppercase px-2 py-0.5 ${RESULT_COLORS[review.result] || ''}`}>
                      {review.result}
                    </span>
                    <span className={`text-xs uppercase px-2 py-0.5 ${
                      review.stage === 'DESIGN' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                    }`}>
                      {review.stage}
                    </span>
                    {review.isAdminReview && (
                      <span className="text-xs uppercase px-2 py-0.5 bg-purple-100 text-purple-800">Admin</span>
                    )}
                    {review.invalidated && (
                      <span className="text-xs uppercase px-2 py-0.5 bg-red-100 text-red-800">Invalidated</span>
                    )}
                    <span className="text-brown-800 text-xs ml-auto">
                      {new Date(review.createdAt).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>

                  {/* Project overview bar */}
                  <div className="flex items-center gap-3 mb-3 flex-wrap text-sm">
                    {review.project.coverImage && (
                      <img
                        src={review.project.coverImage}
                        alt=""
                        className="w-8 h-8 object-cover border border-cream-400"
                      />
                    )}
                    <span className="text-brown-800 font-medium">{review.project.title}</span>
                    <span className="text-cream-600">by</span>
                    <span className="text-brown-800">{review.project.author.name || 'Unknown'}</span>
                    {tierInfo && (
                      <span className={`text-xs px-2 py-0.5 ${TIER_COLORS[tierInfo.id] || ''}`}>
                        T{tierInfo.id} ({tierInfo.bits}b)
                      </span>
                    )}
                    <span className="text-brown-800">{review.project.totalHours}h</span>
                    <span className="text-brown-800">${review.project.bomCost.toFixed(2)} BOM</span>
                    {review.project.costPerHour > 0 && (
                      <span className="text-brown-800">${review.project.costPerHour.toFixed(2)}/h</span>
                    )}
                    {review.project.bitsPerHour !== null && (
                      <span className="text-orange-500">{review.project.bitsPerHour} bits/h</span>
                    )}
                    <span className="text-cream-600">{review.project.entryCount} entries</span>
                  </div>

                  {/* Feedback */}
                  <div className="mb-2">
                    <p className="text-brown-800 text-sm whitespace-pre-wrap">{review.feedback}</p>
                  </div>

                  {/* Internal reason */}
                  {review.reason && (
                    <div className="mb-2">
                      <span className="text-cream-600 text-xs uppercase">Internal: </span>
                      <span className="text-cream-600 text-sm">{review.reason}</span>
                    </div>
                  )}

                  {/* Overrides */}
                  {(review.tierOverride !== null || review.grantOverride !== null || review.workUnitsOverride !== null) && (
                    <div className="flex gap-2 flex-wrap">
                      {review.tierOverride !== null && (
                        <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-800">
                          Tier override: {review.tierOverride}
                        </span>
                      )}
                      {review.grantOverride !== null && (
                        <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-800">
                          Grant override: {review.grantOverride}b
                        </span>
                      )}
                      {review.workUnitsOverride !== null && (
                        <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-800">
                          Hours override: {review.workUnitsOverride}h
                        </span>
                      )}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 text-xs uppercase border border-cream-400 text-brown-800 hover:border-orange-500 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
              >
                Prev
              </button>
              <span className="text-sm text-brown-800">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                disabled={page >= pagination.totalPages}
                className="px-3 py-1.5 text-xs uppercase border border-cream-400 text-brown-800 hover:border-orange-500 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}
