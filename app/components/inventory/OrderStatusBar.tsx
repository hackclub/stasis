'use client';

type OrderStatus = 'PLACED' | 'IN_PROGRESS' | 'READY' | 'COMPLETED';

interface OrderStatusBarProps {
  status: OrderStatus;
}

const STEPS: { key: OrderStatus; label: string }[] = [
  { key: 'PLACED', label: 'Placed' },
  { key: 'IN_PROGRESS', label: 'In Progress' },
  { key: 'READY', label: 'Ready' },
  { key: 'COMPLETED', label: 'Completed' },
];

export function OrderStatusBar({ status }: OrderStatusBarProps) {
  const currentIndex = STEPS.findIndex(s => s.key === status);

  return (
    <div className="flex items-center w-full">
      {STEPS.map((step, i) => {
        const filled = i <= currentIndex;
        return (
          <div key={step.key} className="flex items-center flex-1 last:flex-none">
            {/* Step dot + label */}
            <div className="flex flex-col items-center">
              <div
                className={`w-6 h-6 border-2 flex items-center justify-center text-xs ${
                  filled
                    ? 'border-orange-500 bg-orange-500 text-cream-50'
                    : 'border-cream-400 bg-cream-200 text-brown-800/30'
                }`}
              >
                {i + 1}
              </div>
              <span
                className={`text-xs mt-1 whitespace-nowrap ${
                  filled ? 'text-orange-500' : 'text-brown-800/30'
                }`}
              >
                {step.label}
              </span>
            </div>

            {/* Connector line */}
            {i < STEPS.length - 1 && (
              <div
                className={`flex-1 h-0.5 mx-1 mt-[-1rem] ${
                  i < currentIndex ? 'bg-orange-500' : 'bg-cream-400'
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
