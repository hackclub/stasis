import { NextRequest, NextResponse } from 'next/server';
import { cookies, headers } from 'next/headers';
import { createRSVP } from '@/lib/airtable';
import { sanitize } from '@/lib/sanitize';

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    const headersList = await headers();
    const ip = headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ||
               headersList.get('x-real-ip') ||
               'unknown';

    const safeEmail = sanitize(email);

    // Create RSVP in Airtable with email only (name will be filled after HCA auth)
    try {
      await createRSVP({ email: safeEmail, ip });
    } catch (error) {
      console.error('Airtable submission error:', error);
    }

    // Set login hint for OAuth
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
