'use client';

import { useState } from 'react';
import { isOfflineMode } from '@/lib/app-mode';
import type { BackupCategoryCounts, BackupData } from '@/lib/types';
import { BACKUP_CATEGORY_LABELS, completeBackupData, getBackupCategoryCounts } from '@/lib/backup';
import { backupDataSchema } from '@/lib/security/backup-schema';
import { auth, isFirebaseConfigured } from '@/lib/firebase';
import { fetchFiles } from '@/lib/services/fileService';
import { fetchInformations } from '@/lib/services/infoService';
import { fetchCashTransactions } from '@/lib/services/cashTransactionService';
import { fetchPortfolio } from '@/lib/services/portfolioService';
import { fetchBankAccounts } from '@/lib/services/bankAccountService';

export async function apiError(response: Response, fallback: string): Promise<Error> {
  try {
    const body = await response.json() as { error?: { message?: string } };
    return new Error(body.error?.message || fallback);
  } catch {
    return new Error(fallback);
  }
}

async function backupApiFetch(): Promise<Response> {
  const user = auth?.currentUser;
  if (!user) throw new Error('กรุณาเข้าสู่ระบบ Firebase ใหม่อีกครั้ง');

  const request = async (forceRefresh: boolean) => fetch('/api/backup', {
    method: 'GET',
    cache: 'no-store',
    credentials: 'same-origin',
    headers: { Authorization: `Bearer ${await user.getIdToken(forceRefresh)}` },
  });
  const response = await request(false);
  return response.status === 401 ? request(true) : response;
}

function downloadBackup(backup: BackupData): void {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `my-port-v2-backup-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function BackupExport() {
  const [exporting, setExporting] = useState(false);
  const [exportCounts, setExportCounts] = useState<BackupCategoryCounts | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setExporting(true);
    setError(null);
    setExportCounts(null);
    try {
      let backup: BackupData;
      if (isOfflineMode) {
        const response = await fetch('/api/local/backup', { cache: 'no-store' });
        if (!response.ok) throw await apiError(response, 'Export Backup จาก Local PostgreSQL ไม่สำเร็จ');
        const parsed = backupDataSchema.safeParse(await response.json());
        if (!parsed.success) throw new Error('ข้อมูล Local Backup ไม่ครบตามรูปแบบที่กำหนด');
        backup = completeBackupData(parsed.data);
      } else if (isFirebaseConfigured) {
        const response = await backupApiFetch();
        if (!response.ok) throw await apiError(response, 'Export Backup จาก Firebase ไม่สำเร็จ');
        const parsed = backupDataSchema.safeParse(await response.json());
        if (!parsed.success) throw new Error('ข้อมูล Backup จาก Server ไม่ครบตามรูปแบบที่กำหนด');
        backup = completeBackupData(parsed.data);
      } else {
        const [stocks, files, informations, cashTransactions, bankAccounts] = await Promise.all([
          fetchPortfolio(),
          fetchFiles(),
          fetchInformations(),
          fetchCashTransactions(),
          fetchBankAccounts(),
        ]);
        backup = completeBackupData({
          version: '7.0 (Integrity-checked Local account backup)',
          exported_at: new Date().toISOString(),
          stocks,
          files,
          informations,
          cash_transactions: cashTransactions,
          bank_accounts: bankAccounts,
        });
      }
      setExportCounts(getBackupCategoryCounts(backup));
      downloadBackup(backup);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'Export ไม่สำเร็จ');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="panel">
      <div className="panel-header"><div className="panel-title">⊡ Export Backup</div></div>
      <div className="panel-body">
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
          ดาวน์โหลดข้อมูลครบทุกหมวดของบัญชีที่กำลังใช้งานเป็น JSON ไฟล์เดียว
        </p>
        <div style={{ marginBottom: '16px', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.7 }}>
          หุ้น · รอบซื้อ · รายการขาย · เงินปันผล · ฝาก/ถอน · รายการไฟล์ · คลังความรู้ · บัญชีธนาคาร
          <br />ข้อมูลหุ้นรวมประเทศ Risk Category และเงินปันผลคาดการณ์/ปี · Activity Log จะไม่ถูก Export หรือแทนที่ตอน Restore
          <br />ไฟล์อัปโหลดสำรองเฉพาะชื่อ รายละเอียด และลิงก์ ไม่ฝังไฟล์ไบนารีลง JSON
        </div>
        <button className="btn btn-primary" onClick={handleExport} disabled={exporting}>
          {exporting ? 'กำลัง Export...' : '⊡ Download Backup JSON'}
        </button>
        {exportCounts && (
          <div style={{ marginTop: '14px', fontSize: '11px', color: 'var(--green)' }}>
            ✓ ตรวจโครงสร้าง จำนวนข้อมูล และลายนิ้วมือไฟล์แล้ว: {BACKUP_CATEGORY_LABELS.map(([key, label]) => `${label} ${exportCounts[key]}`).join(' · ')}
          </div>
        )}
        {error && <div className="operation-message operation-error">⚠ {error}</div>}
      </div>
    </div>
  );
}
