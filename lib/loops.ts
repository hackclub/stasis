import { LoopsClient } from "loops";

let loopsClient: LoopsClient | null = null;

function getLoopsClient(): LoopsClient | null {
  if (loopsClient) return loopsClient;

  const apiKey = process.env.LOOPS_API_KEY;
  if (!apiKey) {
    console.warn("LOOPS_API_KEY not configured, skipping email send");
    return null;
  }

  loopsClient = new LoopsClient(apiKey);
  return loopsClient;
}

export async function sendReferralNotification({
  referrerEmail,
  referralLink,
  totalReferrals,
}: {
  referrerEmail: string;
  referralLink: string;
  totalReferrals: number;
}) {
  const client = getLoopsClient();
  if (!client) return;

  const transactionalId = process.env.LOOPS_REFERRAL_TRANSACTIONAL_ID;
  if (!transactionalId) {
    console.warn(
      "LOOPS_REFERRAL_TRANSACTIONAL_ID not configured, skipping referral notification"
    );
    return;
  }

  try {
    await client.sendTransactionalEmail({
      transactionalId,
      email: referrerEmail,
      dataVariables: {
        referralLink,
        totalReferrals,
      },
    });
  } catch (error) {
    console.error("Failed to send referral notification email:", error);
  }
}
