'use client';

import { useState, useEffect } from 'react';

interface CurrencyTransaction {
  id: string;
  amount: number;
  type: string;
  description: string | null;
  createdAt: string;
}

interface CurrencyData {
  currencyName: string;
  balance: number;
  totalEarned: number;
  totalSpent: number;
  totalBuildHoursEarned: number;
  totalApprovedBuildHours: number;
  buildHoursThreshold: number;
  currencyPerHour: number;
  recentTransactions: CurrencyTransaction[];
}

function formatTransactionType(type: string): string {
  switch (type) {
    case 'BUILD_HOURS_CONVERSION':
      return 'Build Hours';
    case 'SHOP_PURCHASE':
      return 'Shop Purchase';
    case 'ADMIN_ADJUSTMENT':
      return 'Adjustment';
    case 'REFUND':
      return 'Refund';
    default:
      return type;
  }
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function CurrencyDisplay() {
  const [data, setData] = useState<CurrencyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showTransactions, setShowTransactions] = useState(false);

  useEffect(() => {
    async function fetchCurrency() {
      try {
        const res = await fetch('/api/currency');
        if (res.ok) {
          const currencyData = await res.json();
          setData(currencyData);
        }
      } catch (error) {
        console.error('Failed to fetch currency:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchCurrency();
  }, []);

  if (loading) {
    return (
      <div className="bg-cream-100 border-2 border-cream-400 p-4">
        <p className="text-cream-600">Loading currency...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-cream-100 border-2 border-cream-400 p-4">
        <p className="text-cream-600">Failed to load currency data</p>
      </div>
    );
  }

  const hoursUntilEarning = Math.max(0, data.buildHoursThreshold - data.totalApprovedBuildHours);
  const isEarningCurrency = data.totalApprovedBuildHours >= data.buildHoursThreshold;

  return (
    <div className="bg-cream-100 border-2 border-cream-400 p-4">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-brand-500 text-lg uppercase tracking-wide">{data.currencyName}</h2>
          <p className="text-cream-700 text-sm">
            {isEarningCurrency 
              ? `Earn ${data.currencyPerHour} ${data.currencyName} per approved build hour. Spend in the shop or on travel stipends!`
              : `Complete ${hoursUntilEarning.toFixed(1)} more build hours to start earning ${data.currencyName}!`
            }
          </p>
        </div>
      </div>

      <div className="flex items-baseline gap-2 mb-4">
        <p className="text-cream-800 text-4xl font-bold">{data.balance.toLocaleString()}</p>
        <p className="text-cream-600 text-sm uppercase">{data.currencyName}</p>
      </div>

      {/* Progress to threshold or earnings stats */}
      {!isEarningCurrency ? (
        <div className="mb-4">
          <div className="flex justify-between text-xs text-cream-600 mb-1">
            <span>Progress to earning {data.currencyName}</span>
            <span>{data.totalApprovedBuildHours.toFixed(1)} / {data.buildHoursThreshold} hours</span>
          </div>
          <div className="h-3 bg-cream-300 overflow-hidden">
            <div 
              className="h-full bg-brand-500 transition-all duration-300"
              style={{ width: `${Math.min((data.totalApprovedBuildHours / data.buildHoursThreshold) * 100, 100)}%` }}
            />
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-4 sm:gap-6 mb-4">
          <div>
            <p className="text-cream-600 text-xs uppercase">Hours Converted</p>
            <p className="text-cream-800 text-lg sm:text-xl">{data.totalBuildHoursEarned.toFixed(1)}h</p>
          </div>
          <div>
            <p className="text-cream-600 text-xs uppercase">Total Earned</p>
            <p className="text-cream-800 text-lg sm:text-xl">{data.totalEarned.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-cream-600 text-xs uppercase">Total Spent</p>
            <p className="text-cream-800 text-lg sm:text-xl">{data.totalSpent.toLocaleString()}</p>
          </div>
        </div>
      )}

      {/* Recent Transactions */}
      {data.recentTransactions.length > 0 && (
        <div>
          <button
            onClick={() => setShowTransactions(!showTransactions)}
            className="text-brand-500 text-sm uppercase tracking-wide hover:text-brand-400 transition-colors flex items-center gap-1"
          >
            {showTransactions ? 'Hide' : 'Show'} Recent Transactions
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              width="14" 
              height="14" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2"
              className={`transition-transform ${showTransactions ? 'rotate-180' : ''}`}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {showTransactions && (
            <div className="mt-3 space-y-2">
              {data.recentTransactions.map((tx) => (
                <div 
                  key={tx.id} 
                  className="flex items-center justify-between py-2 border-b border-cream-300 last:border-0"
                >
                  <div>
                    <p className="text-cream-800 text-sm">
                      {tx.description || formatTransactionType(tx.type)}
                    </p>
                    <p className="text-cream-600 text-xs">{formatDate(tx.createdAt)}</p>
                  </div>
                  <p className={`text-lg font-medium ${tx.amount >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {tx.amount >= 0 ? '+' : ''}{tx.amount.toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
