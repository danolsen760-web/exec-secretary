import { route } from '@/lib/auth';
import { saveSettings } from '@/lib/data';

export const dynamic = 'force-dynamic';
export const POST = route(body => saveSettings(body));
