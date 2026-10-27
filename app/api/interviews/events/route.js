import { route } from '@/lib/auth';
import { unlinkedEvents } from '@/lib/interviews';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const GET = route(() => unlinkedEvents());
