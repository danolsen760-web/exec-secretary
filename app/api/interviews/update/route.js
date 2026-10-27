import { route } from '@/lib/auth';
import { updateAppointment } from '@/lib/interviews';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const POST = route(body => updateAppointment(body));
