'use client';

import { useState, useEffect } from 'react';

export interface EventStatus {
  closed: boolean;
  // Set when submissions are open for this user/project only because an
  // admin granted an extension (ISO timestamp of when it expires).
  extensionUntil: string | null;
}

export function useSubmissionsClosed(projectId?: string): EventStatus {
  const [status, setStatus] = useState<EventStatus>({ closed: false, extensionUntil: null });

  useEffect(() => {
    const url = projectId
      ? `/api/event-status?projectId=${encodeURIComponent(projectId)}`
      : '/api/event-status';
    fetch(url)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setStatus({
            closed: Boolean(data.submissionsClosed),
            extensionUntil: data.extensionUntil ?? null,
          });
        }
      })
      .catch(() => {});
  }, [projectId]);

  return status;
}
