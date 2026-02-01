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
      <div className="bg-cream-100 border-2 border-cream-400 p-4">
        <p className="text-cream-600">Loading XP...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-cream-100 border-2 border-cream-400 p-4">
        <p className="text-cream-600">Failed to load XP data</p>
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
    <div className="bg-cream-100 border-2 border-cream-400 p-4">
      <div className="mb-4">
        <h2 className="text-brand-500 text-lg uppercase tracking-wide">Your XP</h2>
        <p className="text-cream-700 text-sm">Work on your projects and log a journal entry every day to earn XP and increase your multiplier. Get prizes like a Bandana, T-Shirt, and Hoodie!</p>
      </div>

      <div className="flex items-baseline gap-2 mb-4">
        <p className="text-cream-800 text-4xl font-bold">{data.totalXP.toLocaleString()}</p>
        <p className="text-cream-600 text-sm uppercase">XP</p>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-start gap-4 lg:gap-8 mb-4">
        <div className="flex gap-4 sm:gap-6 flex-wrap">
          <div>
            <p className="text-cream-600 text-xs uppercase">Day Streak</p>
            <p className="text-cream-800 text-lg sm:text-xl">{data.dayStreak} day{data.dayStreak !== 1 ? 's' : ''}</p>
          </div>
          <div>
            <p className="text-cream-600 text-xs uppercase">Week Streak</p>
            <p className="text-cream-800 text-lg sm:text-xl">{data.weekStreak} week{data.weekStreak !== 1 ? 's' : ''}</p>
          </div>
          <div className="bg-brand-500/20 border border-brand-500 px-3 sm:px-4 py-2 -my-2">
            <p className="text-brand-400 text-xs uppercase">Multiplier</p>
            <p className="text-brand-400 text-xl sm:text-2xl font-bold">{data.multiplier}x</p>
          </div>
        </div>

        {/* Prize milestones */}
        <div className="flex flex-col overflow-x-auto">
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
                          : 'bg-cream-200 border-cream-400'
                      }`}
                      title={`${prize.xpRequired} XP`}
                    >
                      <span className={`text-[10px] uppercase tracking-wide font-medium whitespace-nowrap ${unlocked ? 'text-white' : isNext ? 'text-brand-500' : 'text-cream-600'}`}>{prize.name}</span>
                    </div>
                    <p className={`text-[10px] mt-0.5 ${unlocked ? 'text-brand-500' : 'text-cream-500'}`}>
                      {prize.xpRequired}
                    </p>
                  </div>
                  {i < PRIZES.length - 1 && (
                    <div className={`w-3 sm:w-4 h-0.5 mb-4 ${
                      data.totalXP >= PRIZES[i + 1].xpRequired 
                        ? 'bg-brand-500' 
                        : unlocked 
                        ? 'bg-brand-500/50' 
                        : 'bg-cream-400'
                    }`} />
                  )}
                </div>
              );
            })}
          </div>
          <p className={`text-xs mt-1 ${nextPrize ? 'text-cream-600' : 'text-brand-500'}`}>
            {nextPrize ? <><span className="text-sm font-medium text-cream-800">{nextPrize.xpRequired - data.totalXP}</span> XP to {nextPrize.name}</> : '✓ All unlocked'}
          </p>
        </div>
      </div>

      {/* Progress bar - solid orange with dotted line markers for incentives */}
      <div className="relative h-8 bg-brand-500 overflow-visible">
        {/* Unfilled portion overlay */}
        <div 
          className="absolute top-0 h-full bg-cream-300/80 transition-all duration-300"
          style={{ 
            left: `${Math.min((data.totalXP / PRIZES[PRIZES.length - 1].xpRequired) * 100, 100)}%`,
            right: 0
          }}
        />
        {/* Dotted line markers for each prize threshold */}
        {PRIZES.map((prize, index) => {
          const maxXP = PRIZES[PRIZES.length - 1].xpRequired;
          const position = (prize.xpRequired / maxXP) * 100;
          const unlocked = data.totalXP >= prize.xpRequired;
          const isLast = index === PRIZES.length - 1;
          return (
            <div
              key={prize.name}
              className="absolute top-0 h-full flex flex-col items-center"
              style={{ left: `${position}%`, transform: isLast ? 'translateX(-100%)' : 'translateX(-50%)' }}
              title={`${prize.name}: ${prize.xpRequired} XP`}
            >
              {/* Dotted vertical line */}
              <div className={`w-0.5 h-full border-l-2 border-dashed ${unlocked ? 'border-white' : 'border-cream-600'}`} />
              {/* Prize label below bar */}
              <span className={`absolute -bottom-5 text-[10px] font-medium whitespace-nowrap ${unlocked ? 'text-brand-500' : 'text-cream-600'} ${isLast ? 'right-0' : ''}`}>
                {prize.name} ({prize.xpRequired})
              </span>
            </div>
          );
        })}
      </div>
      {/* Spacer for labels below the bar */}
      <div className="h-4" />
    </div>
  );
}
