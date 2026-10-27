import { createClient } from '@supabase/supabase-js';

let client;

export function db() {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('The app is missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in Vercel.');
    client = createClient(url, key, {
      auth: { persistSession: false },
      // Always read fresh data (no Next.js fetch caching)
      global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) }
    });
  }
  return client;
}
