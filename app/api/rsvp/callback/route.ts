import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { createRSVP } from '@/lib/airtable';

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const rsvpDataCookie = cookieStore.get('rsvp_data');

    if (!rsvpDataCookie) {
      return NextResponse.redirect(new URL('/?error=missing_rsvp_data', request.url));
    }

    const rsvpData = JSON.parse(rsvpDataCookie.value);

    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.redirect(new URL('/?error=auth_failed', request.url));
    }

    try {
      await createRSVP({
        firstName: rsvpData.firstName,
        lastName: rsvpData.lastName,
        email: rsvpData.email,
        slackId: session.user.slackId || undefined,
        userId: session.user.id,
      });
    } catch (error) {
      console.error('Airtable submission error:', error);
    }

    cookieStore.delete('rsvp_data');

    return NextResponse.redirect(new URL('/dashboard', request.url));
  } catch (error) {
    console.error('RSVP callback error:', error);
    return NextResponse.redirect(new URL('/?error=rsvp_failed', request.url));
  }
}
