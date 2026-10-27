// Signed sign-in cookie. Works in middleware (Edge) and API routes (Node).
export const COOKIE = 'es_session';
export const MAX_AGE = 60 * 60 * 24 * 180; // stay signed in for 180 days

const enc = new TextEncoder();

async function hmac(value) {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(process.env.SESSION_SECRET || ''), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(value));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function sameString(a, b) {
  a = String(a); b = String(b);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export async function makeToken() {
  const expires = String(Date.now() + MAX_AGE * 1000);
  return `${expires}.${await hmac(expires)}`;
}

export async function validToken(token) {
  if (!token || !process.env.SESSION_SECRET) return false;
  const [expires, sig] = String(token).split('.');
  if (!expires || !sig || Number(expires) < Date.now()) return false;
  return sameString(await hmac(expires), sig);
}
