import { NextResponse } from 'next/server';
import { cookies, headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { markAccountCreationFinished, updateRSVPName } from '@/lib/airtable';
import prisma from '@/lib/prisma';

export async function GET() {
  const baseUrl = process.env.BETTER_AUTH_URL || 'http://localhost:3000';
  
  try {
    const headersList = await headers();

    const session = await auth.api.getSession({
      headers: headersList,
    });

    if (!session?.user?.email) {
      return NextResponse.redirect(new URL('/?error=auth_failed', baseUrl));
    }

    // Update name and mark account creation finished in Airtable
    try {
      if (session.user.name) {
        await updateRSVPName(session.user.email, session.user.name);
      }
      await markAccountCreationFinished(session.user.email);
    } catch (error) {
      console.error('Airtable update error:', error);
    }

    // Set event preference from signup source
    const cookieStore = await cookies();
    const signupPage = cookieStore.get('signup_page')?.value;
    if (signupPage) {
      const eventPreference = signupPage === 'Open Sauce' ? 'opensauce' : 'stasis';
      try {
        await prisma.user.update({
          where: { id: session.user.id },
          data: { eventPreference },
        });
      } catch (error) {
        console.error('Failed to set event preference:', error);
      }
      cookieStore.delete('signup_page');
    }

    // Clean up cookies
    cookieStore.delete('rsvp_login_hint');

    return NextResponse.redirect(new URL('/dashboard', baseUrl));
  } catch (error) {
    console.error('RSVP callback error:', error);
    return NextResponse.redirect(new URL('/?error=rsvp_failed', baseUrl));
  }
}
