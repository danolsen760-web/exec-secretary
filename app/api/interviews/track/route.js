import { route } from '@/lib/auth';
import { saveTrack } from '@/lib/interviews';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const POST = route(body => saveTrack(body));
