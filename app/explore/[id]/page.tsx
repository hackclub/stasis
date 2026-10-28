import type { Metadata } from 'next';
import prisma from '@/lib/prisma';
import DiscoverProjectView from '@/app/components/discover/DiscoverProjectView';

type Params = { params: Promise<{ id: string }> };

// Project descriptions are markdown; link previews want a plain sentence or two.
function plainText(markdown: string): string {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/[#*_`>~|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const project = await prisma.project
    .findUnique({
      where: { id },
      select: {
        title: true,
        description: true,
        coverImage: true,
        deletedAt: true,
        hiddenFromGallery: true,
        user: { select: { name: true, slackDisplayName: true } },
      },
    })
    .catch(() => null);

  if (!project || project.deletedAt || project.hiddenFromGallery) {
    return { title: "Project not found | Stasis" };
  }

  const author = project.user.slackDisplayName || project.user.name;
  const title = `${project.title}${author ? ` by ${author}` : ''} | Stasis`;
  const text = project.description ? plainText(project.description) : '';
  const description = text
    ? text.length > 160 ? `${text.slice(0, 157)}...` : text
    : `A hardware project built for Stasis, a Hack Club hackathon.`;
  const images = project.coverImage ? [project.coverImage] : ["/og-image.jpg"];

  return {
    title,
    description,
    alternates: { canonical: `https://stasis.hackclub.com/explore/${id}` },
    openGraph: { title, description, siteName: "Stasis", type: "article", images },
    twitter: { card: "summary_large_image", title, description, images },
  };
}

export default async function ExploreProjectPage({ params }: Params) {
  const { id } = await params;
  return <DiscoverProjectView projectId={id} basePath="/explore" backLabel="Back to Explore" publicView />;
}
