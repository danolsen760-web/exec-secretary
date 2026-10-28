import { route } from '@/lib/auth';
import { prayersAction } from '@/lib/prayerServer';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const POST = route(body => prayersAction(body));
