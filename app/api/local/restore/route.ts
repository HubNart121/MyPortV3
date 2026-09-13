import { completeBackupData } from '@/lib/backup';
import { requireOfflineRequest, offlineErrorResponse } from '@/lib/offline-security';
import { backupCategoryCountsSchema, backupDataSchema } from '@/lib/security/backup-schema';
import { getSupabase } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_RESTORE_BYTES = 5 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    requireOfflineRequest(request, true);
    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > MAX_RESTORE_BYTES) {
      return Response.json({ error: { message: 'ไฟล์ Restore ต้องมีขนาดไม่เกิน 5 MB' } }, { status: 413 });
    }

    const raw = await request.text();
    if (Buffer.byteLength(raw, 'utf8') > MAX_RESTORE_BYTES) {
      return Response.json({ error: { message: 'ไฟล์ Restore ต้องมีขนาดไม่เกิน 5 MB' } }, { status: 413 });
    }

    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return Response.json({ error: { message: 'ไฟล์ JSON ไม่ถูกต้อง' } }, { status: 400 });
    }

    const parsed = backupDataSchema.safeParse(json);
    if (!parsed.success) {
      return Response.json({ error: { message: 'โครงสร้างหรือจำนวนข้อมูลใน Backup ไม่ถูกต้อง' } }, { status: 400 });
    }

    const backup = completeBackupData(parsed.data);
    const { data, error } = await getSupabase().rpc('restore_backup_v5', { payload: backup });
    if (error) throw error;

    const counts = backupCategoryCountsSchema.safeParse(data);
    if (!counts.success) throw new Error('Database returned invalid restore counts');

    const { error: activityLogError } = await getSupabase().from('activity_logs').insert({
      actor_email: 'Local PostgreSQL',
      action: 'restore',
      category: 'system',
      target_label: 'Backup JSON',
      summary: `Restore JSON สำเร็จ ${counts.data.stocks} หุ้น`,
      metadata: {
        stocks: counts.data.stocks,
        buy_rounds: counts.data.buy_rounds,
        realized_trades: counts.data.realized_trades,
        dividend_payments: counts.data.dividend_payments,
        cash_transactions: counts.data.cash_transactions,
        files: counts.data.files,
        informations: counts.data.informations,
        bank_accounts: counts.data.bank_accounts,
        source: 'local_restore',
      },
    });
    if (activityLogError) console.warn('Local restore activity log failed:', activityLogError);

    return Response.json({
      ok: true,
      recovery_id: `local-${Date.now()}`,
      counts: counts.data,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (caught: unknown) {
    return offlineErrorResponse(caught, 'Restore Local PostgreSQL ไม่สำเร็จและข้อมูลเดิมถูก Rollback แล้ว');
  }
}
