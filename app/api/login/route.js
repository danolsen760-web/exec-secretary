import { NextResponse } from 'next/server';
import { COOKIE, MAX_AGE, makeToken, sameString } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  const { passcode } = await req.json().catch(() => ({}));
  const expected = process.env.APP_PASSCODE;
  if (!expected || !process.env.SESSION_SECRET) {
    return NextResponse.json({ error: 'The app is missing APP_PASSCODE or SESSION_SECRET in Vercel.' }, { status: 500 });
  }
  if (typeof passcode !== 'string' || !sameString(passcode.trim(), expected)) {
    await new Promise(r => setTimeout(r, 1000)); // slows down guessing
    return NextResponse.json({ error: "That passcode isn't right." }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, await makeToken(), {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: MAX_AGE
  });
  return res;
}
