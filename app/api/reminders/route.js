import { route } from '@/lib/auth';
import { syncReminders } from '@/lib/interviews';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const POST = route((body, req) => syncReminders(body, new URL(req.url).origin));
