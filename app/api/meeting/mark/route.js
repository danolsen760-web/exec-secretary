import { route } from '@/lib/auth';
import { saveMark } from '@/lib/meeting';

export const dynamic = 'force-dynamic';
export const POST = route(body => saveMark(body));
