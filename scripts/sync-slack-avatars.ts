import 'dotenv/config';
import { PrismaClient } from '../app/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });

async function getSlackProfilePicture(slackId: string): Promise<string | null> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) {
    console.warn('SLACK_BOT_TOKEN not configured');
    return null;
  }

  try {
    const response = await fetch(`https://slack.com/api/users.info?user=${slackId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await response.json();
    
    if (!data.ok) {
      console.error('Slack API error:', data.error);
      return null;
    }

    return data.user?.profile?.image_original
      || data.user?.profile?.image_512
      || data.user?.profile?.image_192
      || data.user?.profile?.image_72
      || data.user?.profile?.image_48
      || null;
  } catch (error) {
    console.error('Failed to fetch Slack profile picture:', error);
    return null;
  }
}

async function syncSlackAvatars() {
  const usersWithoutImages = await prisma.user.findMany({
    where: {
      slackId: { not: null },
      image: null,
    },
    select: {
      id: true,
      email: true,
      slackId: true,
    },
  });

  console.log(`Found ${usersWithoutImages.length} users with slackId but no image`);

  let updated = 0;
  let failed = 0;

  for (const user of usersWithoutImages) {
    if (!user.slackId) continue;

    console.log(`Fetching avatar for ${user.email}...`);
    
    try {
      const image = await getSlackProfilePicture(user.slackId);
      
      if (image) {
        await prisma.user.update({
          where: { id: user.id },
          data: { image },
        });
        console.log(`  ✓ Updated ${user.email}`);
        updated++;
      } else {
        console.log(`  - No image found for ${user.email}`);
      }
    } catch (error) {
      console.error(`  ✗ Failed for ${user.email}:`, error);
      failed++;
    }

    // Rate limit: Slack allows ~50 requests/minute for users.info
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log(`\nDone! Updated: ${updated}, Failed: ${failed}`);
}

syncSlackAvatars()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
