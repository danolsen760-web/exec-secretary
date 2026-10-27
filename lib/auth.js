import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { COOKIE, validToken } from './session';

export async function signedIn() {
  return validToken(cookies().get(COOKIE)?.value);
}

// Wraps an API route: checks sign-in, parses JSON, returns JSON or a readable error.
export function route(fn) {
  return async function handler(req) {
    if (!(await signedIn())) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
    try {
      const body = req.method === 'POST' ? await req.json().catch(() => ({})) : null;
      const out = await fn(body, req);
      return out instanceof Response ? out : NextResponse.json(out);
    } catch (e) {
      return NextResponse.json({ error: e.message || 'Something went wrong on the server.' }, { status: e.status || 500 });
    }
  };
}

export function fail(message, status = 400) {
  const e = new Error(message);
  e.status = status;
  return e;
}
