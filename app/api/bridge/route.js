import { route } from '@/lib/auth';
import { checkBridge } from '@/lib/agendas';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const GET = route(() => checkBridge());
