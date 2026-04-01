'use client';

import { use } from 'react';
import { notFound } from 'next/navigation';
import GuidesContent, { GUIDE_PAGES, type GuidePage } from '../../components/GuidesContent';

export default function DocsSlugPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const pageId = slug as GuidePage;

  if (!GUIDE_PAGES.some(p => p.id === pageId)) {
    notFound();
  }

  return <GuidesContent activePage={pageId} basePath="/docs" />;
}
