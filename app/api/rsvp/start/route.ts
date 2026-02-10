import { NextRequest, NextResponse } from 'next/server';
import { cookies, headers } from 'next/headers';
import { createRSVP, findRSVPByEmail, getReferrerByNumber } from '@/lib/airtable';
import { sanitize } from '@/lib/sanitize';
import { addContactToLoops, sendReferralNotification } from '@/lib/loops';

const EMAIL_REGEX = /^[^\s@'"]+@[^\s@'"]+\.[^\s@'"]+$/;
const isPrelaunch = process.env.NEXT_PUBLIC_PRELAUNCH_MODE === 'true';

// TODO: Add rate limiting - this is a public endpoint vulnerable to abuse
export async function POST(request: NextRequest) {
  try {
    const { email, referralType, referralCode: referredBy } = await request.json();

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    const safeEmail = sanitize(email.trim().toLowerCase());

    if (!EMAIL_REGEX.test(safeEmail)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    const alreadyRSVPed = await findRSVPByEmail(safeEmail);
    if (alreadyRSVPed) {
      return NextResponse.json(
        { error: 'This email has already been RSVPed' },
        { status: 409 }
      );
    }

    const safeReferralType = referralType ? sanitize(String(referralType)) : null;
    const safeReferredBy = referredBy ? sanitize(String(referredBy)) : null;

    const headersList = await headers();
    const ip = headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ||
               headersList.get('x-real-ip') ||
               'unknown';

    let newReferralCode: number | undefined;
    try {
      const rsvpResult = await createRSVP({
        email: safeEmail,
        ip,
        referralType: safeReferralType,
        referredBy: safeReferredBy,
      });
      if (rsvpResult?.referralCode) {
        newReferralCode = rsvpResult.referralCode;
      }
      if (safeReferredBy) {
        const referrerNumber = Number(safeReferredBy);
        if (!isNaN(referrerNumber)) {
          const referrer = await getReferrerByNumber(referrerNumber);
          if (referrer) {
            await sendReferralNotification({
              referrerEmail: referrer.email,
              referralLink: `https://stasis.hack.club/${referrerNumber}`,
              totalReferrals: referrer.totalReferrals + 1,
            }).catch((err) =>
              console.error('Referral notification error:', err)
            );
          }
        }
      }
    } catch (error) {
      console.error('Airtable submission error:', error);
      if (isPrelaunch) {
        return NextResponse.json(
          { error: 'Failed to save RSVP' },
          { status: 500 }
        );
      }
    }

    addContactToLoops({
      email: safeEmail,
      referralCode: newReferralCode,
    }).catch((err) => console.error('Loops contact creation error:', err));

    if (isPrelaunch) {
      return NextResponse.json({ success: true });
    }

    // Set login hint for OAuth (only when not in prelaunch mode)
    const cookieStore = await cookies();
    cookieStore.set('rsvp_login_hint', safeEmail, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 10,
      path: '/',
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('RSVP start error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
