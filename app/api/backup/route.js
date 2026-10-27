import { route } from '@/lib/auth';
import { exportAll, todayPhoenix } from '@/lib/data';

export const dynamic = 'force-dynamic';
export const GET = route(async () => {
  const data = await exportAll();
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="exec-secretary-backup-${todayPhoenix()}.json"`
    }
  });
});
