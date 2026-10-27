import { route } from '@/lib/auth';
import { readMeeting } from '@/lib/meeting';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const GET = route((_, req) => {
  const p = new URL(req.url).searchParams;
  return readMeeting(p.get('meeting'), p.get('date'));
});
