import { route } from '@/lib/auth';
import { saveHousehold } from '@/lib/data';

export const dynamic = 'force-dynamic';
export const POST = route(body => saveHousehold(body));
