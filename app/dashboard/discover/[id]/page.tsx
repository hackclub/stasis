'use client';

import { use } from 'react';
import DiscoverProjectView from '@/app/components/discover/DiscoverProjectView';

export default function DiscoverProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <DiscoverProjectView projectId={id} basePath="/dashboard/discover" backLabel="Back to Discover" />;
}
