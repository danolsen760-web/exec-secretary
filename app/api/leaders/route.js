import { route } from '@/lib/auth';
import { saveLeader } from '@/lib/data';

export const dynamic = 'force-dynamic';
export const POST = route(body => saveLeader(body));
