'use client';

import { use } from 'react';
import { notFound } from 'next/navigation';
import GuidesContent, { GUIDE_PAGES, type GuidePage } from '../../components/GuidesContent';

export default function HelpPage({ params }: { params: Promise<{ page?: string[] }> }) {
  const { page } = use(params);
  const pageId = (page?.[0] ?? 'overview') as GuidePage;

  if (!GUIDE_PAGES.some(p => p.id === pageId)) {
    notFound();
  }

  return <GuidesContent activePage={pageId} basePath="/help" />;
}
