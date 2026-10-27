import { route } from '@/lib/auth';
import { saveInterviewer } from '@/lib/data';

export const dynamic = 'force-dynamic';
export const POST = route(body => saveInterviewer(body));
