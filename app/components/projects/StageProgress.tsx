'use client';

type ProjectStatus = 'draft' | 'in_review' | 'approved' | 'rejected' | 'update_requested';

interface Props {
  designStatus: ProjectStatus;
  buildStatus: ProjectStatus;
  showMessages?: boolean;
}

type Step = {
  label: string;
  completed: boolean;
  active: boolean;
  rejected: boolean;
};

function getSteps(designStatus: ProjectStatus, buildStatus: ProjectStatus): Step[] {
  const isDesignSubmitted = designStatus === 'in_review' || designStatus === 'approved';
  const isDesignApproved = designStatus === 'approved';
  const isBuildSubmitted = buildStatus === 'in_review' || buildStatus === 'approved';
  const isBuildApproved = buildStatus === 'approved';

  return [
    {
      label: 'Draft',
      completed: isDesignSubmitted || isDesignApproved,
      active: designStatus === 'draft' || designStatus === 'rejected' || designStatus === 'update_requested',
      rejected: false,
    },
    {
      label: 'Design Review',
      completed: isDesignApproved,
      active: designStatus === 'in_review',
      rejected: designStatus === 'rejected',
    },
    {
      label: 'Design Approved',
      completed: isDesignApproved,
      active: false,
      rejected: false,
    },
    {
      label: 'Build Draft',
      completed: isBuildSubmitted || isBuildApproved,
      active: isDesignApproved && (buildStatus === 'draft' || buildStatus === 'rejected' || buildStatus === 'update_requested'),
      rejected: false,
    },
    {
      label: 'Build Review',
      completed: isBuildApproved,
      active: buildStatus === 'in_review',
      rejected: buildStatus === 'rejected',
    },
    {
      label: 'Finished!',
      completed: isBuildApproved,
      active: false,
      rejected: false,
    },
  ];
}

export function StageProgress({ designStatus, buildStatus, showMessages = true }: Readonly<Props>) {
  const steps = getSteps(designStatus, buildStatus);
  const isDesignComplete = designStatus === 'approved';
  const isBuildComplete = buildStatus === 'approved';

  return (
    <div className="space-y-4">
      {/* Progress Steps */}
      <div className="flex items-center">
        {steps.map((step, idx) => (
          <div key={step.label} className="flex items-center flex-1 last:flex-none">
            {/* Step Circle */}
            <div className="flex flex-col items-center">
              <div
                className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all text-xs font-bold ${
                  step.completed
                    ? 'border-green-400 bg-green-500 text-white'
                    : step.rejected
                    ? 'border-red-400 bg-red-500/30 text-red-300'
                    : step.active
                    ? 'border-yellow-400 bg-yellow-500/30 text-yellow-300'
                    : 'border-cream-500 bg-cream-800 text-cream-400'
                }`}
              >
                {step.completed ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : step.rejected ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : step.active ? (
                  <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
                ) : (
                  idx + 1
                )}
              </div>
              <span
                className={`text-[10px] mt-1.5 uppercase tracking-wide text-center max-w-16 leading-tight font-medium ${
                  step.completed
                    ? 'text-green-300'
                    : step.rejected
                    ? 'text-red-300'
                    : step.active
                    ? 'text-yellow-300'
                    : 'text-cream-400'
                }`}
              >
                {step.label}
              </span>
            </div>

            {/* Connector Line */}
            {idx < steps.length - 1 && (
              <div
                className={`h-0.5 flex-1 mx-1 -mt-5 transition-colors ${
                  step.completed ? 'bg-green-400' : 'bg-cream-600'
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Stage Messages */}
      {showMessages && (
        <div className="text-center">
          {designStatus === 'draft' && (
            <p className="text-cream-400 text-sm">
              Design your project and log your time. Upload all design files to your GitHub repo. Once your project is submitted and approved, you&apos;ll get money to build your project!
            </p>
          )}
          {designStatus === 'in_review' && (
            <p className="text-yellow-400 text-sm">
              Your design is being reviewed. You can still make changes while waiting.
            </p>
          )}
          {designStatus === 'rejected' && (
            <p className="text-red-400 text-sm">
              Your design needs changes. Review the feedback and resubmit.
            </p>
          )}
          {isDesignComplete && buildStatus === 'draft' && (
            <p className="text-green-400 text-sm">
              Design approved! Start building and log your work sessions. Check your email for a grant card from HCB.
            </p>
          )}
          {isDesignComplete && buildStatus === 'in_review' && (
            <p className="text-yellow-400 text-sm">
              Your build is being reviewed. Badges will be granted upon approval.
            </p>
          )}
          {isDesignComplete && buildStatus === 'rejected' && (
            <p className="text-red-400 text-sm">
              Your build needs changes. Review the feedback and resubmit.
            </p>
          )}
          {isBuildComplete && (
            <p className="text-green-400 text-sm">
              🎉 Project complete! Your badges have been granted.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
