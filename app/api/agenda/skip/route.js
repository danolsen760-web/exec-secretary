import { route } from '@/lib/auth';
import { skipSunday } from '@/lib/agendas';

export const dynamic = 'force-dynamic';
export const POST = route(body => skipSunday(body));
