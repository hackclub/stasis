export async function sendSlackDM(
  slackId: string,
  text: string,
  options?: { blocks?: Record<string, unknown>[] }
): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) {
    return { ok: false, error: "SLACK_BOT_TOKEN not configured" };
  }

  try {
    // Open a DM conversation with the user
    const openRes = await fetch("https://slack.com/api/conversations.open", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ users: slackId }),
    });
    const openData = await openRes.json();
    if (!openData.ok) {
      return { ok: false, error: `conversations.open: ${openData.error}` };
    }

    const channel = openData.channel.id;

    const blocks = options?.blocks ?? [
      { type: "section", text: { type: "mrkdwn", text } },
    ];

    const msgRes = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ channel, text, blocks }),
    });
    const msgData = await msgRes.json();
    if (!msgData.ok) {
      return { ok: false, error: `chat.postMessage: ${msgData.error}` };
    }

    return { ok: true };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

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
