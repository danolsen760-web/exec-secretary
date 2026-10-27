import { route } from '@/lib/auth';
import { openings } from '@/lib/interviews';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const GET = route((_, req) => {
  const p = new URL(req.url).searchParams;
  return openings({ interviewerId: p.get('iv'), days: p.get('days') });
});
