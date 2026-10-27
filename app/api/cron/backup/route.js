import { NextResponse } from 'next/server';
import { backupToDrive } from '@/lib/interviews';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Called by Vercel every Monday (see vercel.json). Vercel sends CRON_SECRET.
export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 401 });
  }
  try { return NextResponse.json(await backupToDrive()); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
