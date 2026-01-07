import { NextRequest, NextResponse } from 'next/server';
import { cookies, headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { markAccountCreationFinished } from '@/lib/airtable';

export async function GET(request: NextRequest) {
  try {
    const headersList = await headers();

    const session = await auth.api.getSession({
      headers: headersList,
    });

    if (!session?.user?.email) {
      return NextResponse.redirect(new URL('/?error=auth_failed', request.url));
    }

    // Mark "Finished Account Creation" in Airtable
    try {
      await markAccountCreationFinished(session.user.email);
    } catch (error) {
      console.error('Airtable update error:', error);
    }

    // Clean up cookies
    const cookieStore = await cookies();
    cookieStore.delete('rsvp_login_hint');

    return NextResponse.redirect(new URL('/dashboard', request.url));
  } catch (error) {
    console.error('RSVP callback error:', error);
    return NextResponse.redirect(new URL('/?error=rsvp_failed', request.url));
  }
}
