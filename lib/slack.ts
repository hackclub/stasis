export async function getSlackProfilePicture(slackId: string): Promise<string | null> {
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

    // Prefer highest quality image available
    return data.user?.profile?.image_original 
      || data.user?.profile?.image_512 
      || data.user?.profile?.image_192 
      || null;
  } catch (error) {
    console.error('Failed to fetch Slack profile picture:', error);
    return null;
  }
}
