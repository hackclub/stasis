'use client';

export interface StatusStep {
  key: string;
  label: string;
}

interface OrderStatusBarProps {
  status: string;
  steps?: readonly StatusStep[];
  progressBetween?: {
    from: string;
    to: string;
    percent: number;
  };
}

export const ORDER_STATUS_STEPS: StatusStep[] = [
  { key: 'PLACED', label: 'Placed' },
  { key: 'IN_PROGRESS', label: 'In Progress' },
  { key: 'READY', label: 'Ready' },
  { key: 'COMPLETED', label: 'Completed' },
];

export const RENTAL_STATUS_STEPS: StatusStep[] = [
  { key: 'PLACED', label: 'Placed' },
  { key: 'IN_PROGRESS', label: 'In Progress' },
  { key: 'READY', label: 'Ready' },
  { key: 'CHECKED_OUT', label: 'Checked Out' },
];

export const RETURN_STATUS_STEPS: StatusStep[] = [
  { key: 'RETURN_REQUESTED', label: 'Return Started' },
  { key: 'RETURNED', label: 'Return Approved' },
];

export const PRINT_STATUS_STEPS: StatusStep[] = [
  { key: 'PENDING', label: 'Pending' },
  { key: 'QUEUED', label: 'Queued' },
  { key: 'TIME_APPROVAL_REQUESTED', label: 'Approve Estimate' },
  { key: 'READY_TO_PRINT', label: 'Ready To Print' },
  { key: 'PRINTING', label: 'Printing' },
  { key: 'READY', label: 'Ready' },
  { key: 'COMPLETED', label: 'Picked Up' },
];

export function OrderStatusBar({
  status,
  steps = ORDER_STATUS_STEPS,
  progressBetween,
}: OrderStatusBarProps) {
  const currentIndex = steps.findIndex(s => s.key === status);

  const connectorPercent = (index: number) => {
    if (index < currentIndex) return 100;
    const from = steps[index]?.key;
    const to = steps[index + 1]?.key;
    if (progressBetween && from === progressBetween.from && to === progressBetween.to) {
      return Math.max(0, Math.min(100, progressBetween.percent));
    }
    return 0;
  };

  return (
    <div className="flex w-full items-start">
      {steps.map((step, i) => {
        const filled = i <= currentIndex;
        return (
          <div key={step.key} className="flex flex-1 items-start last:flex-none">
            <div className="flex min-w-0 flex-col items-center">
              <div
                className={`flex h-6 w-6 items-center justify-center border-2 text-xs ${
                  filled
                    ? 'border-orange-500 bg-orange-500 text-cream-50'
                    : 'border-cream-400 bg-cream-200 text-brown-800/30'
                }`}
              >
                {i + 1}
              </div>
              <span
                className={`mt-1 max-w-20 text-center text-xs ${
                  filled ? 'text-orange-500' : 'text-brown-800/30'
                }`}
              >
                {step.label}
              </span>
            </div>

            {i < steps.length - 1 && (
              <div className="mx-1 mt-3 h-0.5 flex-1 bg-cream-400">
                <div
                  className="h-full bg-orange-500 transition-all"
                  style={{ width: `${connectorPercent(i)}%` }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
