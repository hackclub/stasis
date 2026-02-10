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

function getEnvironmentName(): string {
  if (process.env.NODE_ENV === 'production') return 'prod';
  if (process.env.NODE_ENV === 'development') return 'dev';
  return process.env.NODE_ENV || 'dev';
}

export async function addContactToLoops({
  email,
  referralCode,
}: {
  email: string;
  referralCode?: number;
}) {
  const client = getLoopsClient();
  if (!client) return;

  const env = getEnvironmentName();

  await client.updateContact({
    email,
    properties: {
      userGroup: "Hack Clubber",
      source: `Stasis Platform - ${env.charAt(0).toUpperCase() + env.slice(1)}`,
      stasisSignUpAt: new Date().toISOString(),
      ...(referralCode !== undefined && { stasisReferralCode: referralCode }),
    },
    mailingLists: {
      cmlbo3ill3ok30j27gwlyg2ew: true,
      cm03y2mi000ha0lmhff7pczm4: true,
    },
  });
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
