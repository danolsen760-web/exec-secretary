import { NextResponse } from 'next/server';
import { COOKIE, validToken } from './lib/session';

export async function middleware(req) {
  if (await validToken(req.cookies.get(COOKIE)?.value)) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  return NextResponse.redirect(url);
}

// Everything is private except the sign-in page, its API, and the app icons/manifest.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon-192.png|icon-512.png|apple-touch-icon.png|manifest.webmanifest|login|api/login|api/cron).*)']
};
