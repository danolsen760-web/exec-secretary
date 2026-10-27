import { route } from '@/lib/auth';
import { loadAll } from '@/lib/data';

export const dynamic = 'force-dynamic';
export const GET = route(() => loadAll());
