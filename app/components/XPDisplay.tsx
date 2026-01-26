'use client';

import { useState, useEffect } from 'react';

interface XPData {
  totalXP: number;
  multiplier: number;
  dayStreak: number;
  weekStreak: number;
}

const PRIZES = [
  { name: 'Sticker', xpRequired: 50 },
  { name: 'Bandana', xpRequired: 150 },
  { name: 'T-Shirt', xpRequired: 300 },
  { name: 'Hoodie', xpRequired: 500 },
] as const;

export function XPDisplay() {
  const [data, setData] = useState<XPData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchXP() {
      try {
        const res = await fetch('/api/xp');
        if (res.ok) {
          const xpData = await res.json();
          setData(xpData);
        }
      } catch (error) {
        console.error('Failed to fetch XP:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchXP();
  }, []);

  if (loading) {
    return (
      <div className="bg-cream-900 border-2 border-cream-600 p-4">
        <p className="text-cream-300">Loading XP...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-cream-900 border-2 border-cream-600 p-4">
        <p className="text-cream-300">Failed to load XP data</p>
      </div>
    );
  }

  const currentPrizeIndex = PRIZES.findIndex(p => data.totalXP < p.xpRequired);
  const nextPrize = currentPrizeIndex === -1 ? null : PRIZES[currentPrizeIndex];
  const prevThreshold = currentPrizeIndex <= 0 ? 0 : PRIZES[currentPrizeIndex - 1].xpRequired;
  
  const progressPercent = nextPrize 
    ? ((data.totalXP - prevThreshold) / (nextPrize.xpRequired - prevThreshold)) * 100
    : 100;

  return (
    <div className="bg-cream-900 border-2 border-cream-600 p-4">
      <div className="mb-4">
        <h2 className="text-brand-500 text-lg uppercase tracking-wide">XP Progress</h2>
        <p className="text-cream-300 text-sm">Work on your projects and log a journal entry every day to earn XP and increase your multiplier. Get prizes like a Bandana, T-Shirt, and Hoodie!</p>
      </div>

      <div className="flex items-baseline gap-2 mb-4">
        <p className="text-cream-100 text-4xl font-bold">{data.totalXP.toLocaleString()}</p>
        <p className="text-cream-300 text-sm uppercase">XP</p>
      </div>

      <div className="flex items-start gap-8 mb-4">
        <div className="flex gap-6">
          <div>
            <p className="text-cream-300 text-xs uppercase">Day Streak</p>
            <p className="text-cream-100 text-xl">{data.dayStreak} day{data.dayStreak !== 1 ? 's' : ''}</p>
          </div>
          <div>
            <p className="text-cream-300 text-xs uppercase">Week Streak</p>
            <p className="text-cream-100 text-xl">{data.weekStreak} week{data.weekStreak !== 1 ? 's' : ''}</p>
          </div>
          <div className="bg-brand-500/20 border border-brand-500 px-4 py-2 -my-2">
            <p className="text-brand-400 text-xs uppercase">Multiplier</p>
            <p className="text-brand-400 text-2xl font-bold">{data.multiplier}x</p>
          </div>
        </div>

        {/* Prize milestones */}
        <div className="flex flex-col">
          <div className="flex items-center gap-0">
            {PRIZES.map((prize, i) => {
              const unlocked = data.totalXP >= prize.xpRequired;
              const isNext = currentPrizeIndex === i;
              return (
                <div key={prize.name} className="flex items-center">
                  <div className="flex flex-col items-center">
                    <div 
                      className={`px-2 py-1 flex items-center justify-center border-2 transition-all ${
                        unlocked 
                          ? 'bg-brand-500 border-brand-400' 
                          : isNext
                          ? 'bg-brand-500/20 border-brand-500 border-dashed'
                          : 'bg-cream-950 border-cream-700'
                      }`}
                      title={`${prize.xpRequired} XP`}
                    >
                      <span className={`text-[10px] uppercase tracking-wide font-medium ${unlocked ? 'text-white' : isNext ? 'text-brand-400' : 'text-cream-500'}`}>{prize.name}</span>
                    </div>
                    <p className={`text-[10px] mt-0.5 ${unlocked ? 'text-brand-400' : 'text-cream-600'}`}>
                      {prize.xpRequired}
                    </p>
                  </div>
                  {i < PRIZES.length - 1 && (
                    <div className={`w-4 h-0.5 mb-4 ${
                      data.totalXP >= PRIZES[i + 1].xpRequired 
                        ? 'bg-brand-500' 
                        : unlocked 
                        ? 'bg-brand-500/50' 
                        : 'bg-cream-700'
                    }`} />
                  )}
                </div>
              );
            })}
          </div>
          <p className={`text-xs mt-1 ${nextPrize ? 'text-cream-300' : 'text-brand-400'}`}>
            {nextPrize ? <><span className="text-sm font-medium text-cream-100">{nextPrize.xpRequired - data.totalXP}</span> XP to {nextPrize.name}</> : '✓ All unlocked'}
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-cream-950 border border-cream-800">
        <div 
          className="h-full bg-brand-500 transition-all duration-300"
          style={{ width: `${Math.min(progressPercent, 100)}%` }}
        />
      </div>
    </div>
  );
}
