'use client';

import { useState, useEffect } from 'react';

export function useSubmissionsClosed(): boolean {
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    fetch('/api/event-status')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setClosed(Boolean(data.submissionsClosed));
      })
      .catch(() => {});
  }, []);

  return closed;
}
