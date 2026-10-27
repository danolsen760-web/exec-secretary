import { route } from '@/lib/auth';
import { saveInterviewerFull } from '@/lib/interviews';

export const dynamic = 'force-dynamic';
export const POST = route(body => saveInterviewerFull(body));
