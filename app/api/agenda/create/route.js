import { route } from '@/lib/auth';
import { createAgenda } from '@/lib/agendas';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const POST = route(body => createAgenda(body));
