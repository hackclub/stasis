import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createRSVP } from '@/lib/airtable';
import { sanitize } from '@/lib/sanitize';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

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

    const headersList = await headers();
    const ip = headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ||
               headersList.get('x-real-ip') ||
               'unknown';

    try {
      await createRSVP({ email: safeEmail, ip });
    } catch (error) {
      console.error('Airtable submission error:', error);
      return NextResponse.json(
        { error: 'Failed to save RSVP' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('RSVP error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
