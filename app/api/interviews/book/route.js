import { route } from '@/lib/auth';
import { book } from '@/lib/interviews';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const POST = route(body => book(body));
