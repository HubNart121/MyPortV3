'use client';

import { useRef, useState } from 'react';
import type { BackupCategoryCounts, BackupData } from '@/lib/types';
import { BACKUP_CATEGORY_LABELS, completeBackupData, getBackupCategoryCounts } from '@/lib/backup';
import { auth, isFirebaseConfigured } from '@/lib/firebase';
import { backupDataSchema } from '@/lib/security/backup-schema';
import { restoreResponseSchema } from '@/lib/security/restore-schema';
import { apiError } from '@/components/BackupExport';
import { useToast } from '@/components/Toast';
import { isOfflineMode } from '@/lib/app-mode';

const MAX_RESTORE_BYTES = 5 * 1024 * 1024;

function CountsGrid({ counts }: { counts: BackupCategoryCounts }) {
  return (
    <div className="restore-count-grid">
      {BACKUP_CATEGORY_LABELS.map(([key, label]) => (
        <div key={key} className="restore-count-card">
          <div>{label}</div>
          <strong>{counts[key].toLocaleString('th-TH')}</strong>
        </div>
      ))}
    </div>
  );
}

async function restoreApiFetch(backup: BackupData): Promise<Response> {
  if (isOfflineMode) {
    return fetch('/api/local/restore', {
      method: 'POST',
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(backup),
    });
  }
  const user = auth?.currentUser;
  if (!user) throw new Error('กรุณาเข้าสู่ระบบ Firebase ใหม่อีกครั้ง');

  const request = async (forceRefresh: boolean) => fetch('/api/restore', {
    method: 'POST',
    cache: 'no-store',
    credentials: 'same-origin',
    headers: {
      Authorization: `Bearer ${await user.getIdToken(forceRefresh)}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(backup),
  });
  const response = await request(false);
  return response.status === 401 ? request(true) : response;
}

export function JsonRestore({ onRestoreComplete }: { onRestoreComplete?: () => void | Promise<void> }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const selectionId = useRef(0);
  const restoreInFlight = useRef(false);
  const [sourceSchema, setSourceSchema] = useState<number | undefined>();
  const [checksumVerified, setChecksumVerified] = useState(false);
  const [fileName, setFileName] = useState('');
  const [backup, setBackup] = useState<BackupData | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifiedCounts, setVerifiedCounts] = useState<BackupCategoryCounts | null>(null);
  const toast = useToast();

  const resetSelection = () => {
    selectionId.current += 1;
    setFileName('');
    setBackup(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleFile = async (file?: File) => {
    setError(null);
    setVerifiedCounts(null);
    resetSelection();
    const currentSelection = selectionId.current;
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.json')) {
      setError('รองรับเฉพาะไฟล์ Backup นามสกุล .json');
      return;
    }
    if (file.size > MAX_RESTORE_BYTES) {
      setError('ไฟล์ Restore ต้องมีขนาดไม่เกิน 5 MB');
      return;
    }

    try {
      const json: unknown = JSON.parse(await file.text());
      if (currentSelection !== selectionId.current) return;
      const parsed = backupDataSchema.safeParse(json);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        setError(`ไฟล์ Backup ไม่ผ่านการตรวจสอบ (${issue.path.join('.') || 'ไฟล์'}): ${issue.message}`);
        return;
      }
      setSourceSchema(parsed.data.schema_version);
      setChecksumVerified(Boolean(parsed.data.manifest?.content_checksum));
      setFileName(file.name);
      setBackup(completeBackupData(parsed.data));
    } catch {
      if (currentSelection !== selectionId.current) return;
      setError('ไม่สามารถอ่านไฟล์ JSON ได้ กรุณาตรวจว่าไฟล์ไม่เสียหาย');
    }
  };

  const handleRestore = async () => {
    if (!backup || restoreInFlight.current) return;
    const counts = getBackupCategoryCounts(backup);
    const summary = BACKUP_CATEGORY_LABELS.map(([key, label]) => `${label} ${counts[key]}`).join(' · ');
    if (!confirm(
      `ยืนยัน Restore ข้อมูลจาก ${fileName}?\n\n${summary}\n\nข้อมูลทั้ง ${BACKUP_CATEGORY_LABELS.length} หมวดในบัญชีปัจจุบันจะถูกแทนที่ให้ตรงกับไฟล์นี้ รวมบัญชีธนาคาร หมวดที่ไม่มีข้อมูลในไฟล์จะถูกล้าง`,
    )) return;

    restoreInFlight.current = true;
    setRestoring(true);
    setError(null);
    setVerifiedCounts(null);
    try {
      const response = await restoreApiFetch(backup);
      if (!response.ok) throw await apiError(response, 'Restore ข้อมูลไม่สำเร็จ');
      const result = restoreResponseSchema.safeParse(await response.json());
      if (!result.success) throw new Error('Server ตอบกลับไม่ครบตามรูปแบบการตรวจรับ');
      setVerifiedCounts(result.data.counts);
      resetSelection();
      try {
        await onRestoreComplete?.();
      } catch {
        setError('Restore สำเร็จแล้ว แต่รีเฟรชหน้าจอไม่สำเร็จ กรุณาโหลดหน้าใหม่');
      }
      toast.show(`Restore และตรวจสอบข้อมูลครบทั้ง ${BACKUP_CATEGORY_LABELS.length} หมวดแล้ว`, 'success');
    } catch (caught: unknown) {
      const message = caught instanceof Error ? caught.message : 'Restore ข้อมูลไม่สำเร็จ';
      setError(message);
      toast.show(message, 'error');
    } finally {
      restoreInFlight.current = false;
      setRestoring(false);
    }
  };

  return (
    <div className="panel" style={{ borderColor: 'rgba(58,143,224,0.45)' }}>
      <div className="panel-header" style={{ borderBottomColor: 'rgba(58,143,224,0.3)' }}>
        <div className="panel-title" style={{ color: 'var(--blue)' }}>▦ Restore Backup JSON</div>
      </div>
      <div className="panel-body">
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
          เลือกไฟล์ Backup JSON เพื่อตรวจโครงสร้างและจำนวนข้อมูลก่อน Restore
        </p>
        <div className="operation-message operation-warning" style={{ marginTop: '0', marginBottom: '16px' }}>
          {isOfflineMode
            ? 'ระบบ Local จะ Restore ทั้ง 8 หมวดรวมบัญชีธนาคารใน Transaction เดียว หากตรวจไม่ผ่านฐานข้อมูลจะ Rollback อัตโนมัติ โดยไม่แก้ไข Activity Log เดิม'
            : 'ระบบจะสร้าง Recovery Snapshot ฝั่ง Server ก่อน แล้วแทนที่ข้อมูลทั้ง 8 หมวดรวมบัญชีธนาคารให้ตรงกับไฟล์ หากตรวจไม่ผ่านจะย้อนกลับข้อมูลเดิมอัตโนมัติ โดยไม่แก้ไข Activity Log เดิม'}
          <div>ไฟล์เก่าที่ไม่มีบัญชีธนาคารจะถือว่าหมวดนี้ว่าง และล้างบัญชีธนาคารปัจจุบันเมื่อยืนยัน Restore</div>
        </div>

        {!isFirebaseConfigured && !isOfflineMode ? (
          <div className="operation-message operation-error">Restore JSON ใช้งานได้เฉพาะระบบ Firebase</div>
        ) : (
          <>
            <input
              ref={inputRef}
              type="file"
              accept="application/json,.json"
              disabled={restoring}
              onChange={(event) => void handleFile(event.target.files?.[0])}
              style={{ display: 'none' }}
            />
            <button className="btn btn-secondary" onClick={() => inputRef.current?.click()} disabled={restoring}>
              📁 เลือกไฟล์ Backup JSON
            </button>

            {backup && (
              <div style={{ marginTop: '18px' }}>
                <div style={{ color: 'var(--text-secondary)', fontSize: '12px', marginBottom: '12px' }}>
                  <strong style={{ color: 'var(--text-primary)' }}>{fileName}</strong>
                  {' · '}เวอร์ชัน {backup.version}
                  {' · '}Schema ต้นฉบับ {sourceSchema ? `v${sourceSchema}` : 'ไม่ระบุ (ไฟล์เก่า)'}
                  {' · '}วันที่ Backup {backup.exported_at.slice(0, 10)}
                </div>
                <CountsGrid counts={getBackupCategoryCounts(backup)} />
                <div className="operation-message operation-success" style={{ marginTop: '12px' }}>
                  {checksumVerified
                    ? '✓ โครงสร้าง จำนวนข้อมูล และ checksum ผ่านการตรวจสอบ'
                    : '✓ โครงสร้างผ่านการตรวจสอบ · ไฟล์เก่าไม่มี checksum จึงตรวจความสมบูรณ์ของเนื้อหาส่วนนี้ไม่ได้'}
                </div>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '16px', flexWrap: 'wrap' }}>
                  <button
                    className="btn btn-primary"
                    onClick={handleRestore}
                    disabled={restoring}
                  >
                    {restoring ? 'กำลัง Restore และตรวจสอบ...' : '▦ RESTORE FILE'}
                  </button>
                  <button className="btn btn-ghost" onClick={resetSelection} disabled={restoring}>ยกเลิก</button>
                </div>
              </div>
            )}
          </>
        )}

        {verifiedCounts && (
          <div className="operation-message operation-success">
            ✓ Restore สำเร็จและตรวจสอบข้อมูลจากฐานข้อมูลแล้ว
            <CountsGrid counts={verifiedCounts} />
          </div>
        )}
        {error && <div className="operation-message operation-error">⚠ {error}</div>}
      </div>
    </div>
  );
}
