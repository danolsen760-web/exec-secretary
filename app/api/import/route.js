import { route } from '@/lib/auth';
import { importFamilies } from '@/lib/importer';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const POST = route(body => importFamilies(body));
