# Backup / Restore schema v7

Schema v7 สำรองข้อมูลพอร์ตแบบ replace-data ครบ 8 หมวด:

1. หุ้น (รวมประเทศ, Platform Trade, Risk Category และปันผลคาดการณ์ต่อปี)
2. รอบซื้อ
3. รายการขาย
4. เงินปันผล
5. ฝาก / ถอน
6. รายการไฟล์ (metadata และลิงก์ ไม่รวมไฟล์ไบนารี)
7. คลังความรู้
8. บัญชีธนาคาร

`activity_logs` ไม่รวมอยู่ในไฟล์สำรองและไม่ถูกแทนที่ระหว่าง Restore

## การตรวจความถูกต้อง

Manifest เก็บจำนวนข้อมูลของทุกหมวดและ `content_checksum` แบบ `fnv1a64` ซึ่งคำนวณจากข้อมูลที่จัดลำดับ key และรายการตาม ID แล้ว ระบบตรวจทั้งสองส่วนก่อน Restore เพื่อจับไฟล์ที่ถูกแก้ไขหรือตัดข้อมูลโดยไม่ตั้งใจ ค่า checksum ใช้ตรวจความสมบูรณ์ของไฟล์ ไม่ใช่ลายเซ็นยืนยันผู้สร้างไฟล์

หลังเขียนข้อมูล Firebase ระบบอ่านกลับมาตรวจจำนวนและเนื้อหา หากไม่ตรงจะกู้คืน Recovery Snapshot อัตโนมัติ ระบบ Local PostgreSQL ทำงานใน transaction เดียวและ rollback เมื่อเกิดข้อผิดพลาด

## ความเข้ากันได้ย้อนหลัง

- รองรับไฟล์ schema v4-v6 และเติมค่าเริ่มต้นก่อน Restore
- ไฟล์ v6 และเก่ากว่าไม่บังคับมี `content_checksum`
- ประเทศหุ้นที่ไม่มีค่าใช้ `THAI`
- `platform_trade` ที่ไม่มีค่าใช้ `null`
- ไฟล์เก่าที่ไม่มี `bank_accounts` ถือว่าหมวดบัญชีธนาคารว่าง ดังนั้น Restore แบบแทนที่จะล้างบัญชีธนาคารปัจจุบัน

## Local PostgreSQL เดิม

Volume ที่มีอยู่แล้วต้องใช้ migration ตามลำดับ:

1. `docker/db/11-bank-accounts.sql`
2. `docker/db/12-stock-country.sql`
3. `docker/db/13-platform-trade.sql`
4. `docker/db/09-offline-restore.sql`

Docker init scripts จะไม่รันซ้ำเองกับ volume เดิม ฟังก์ชันฐานข้อมูลยังใช้ชื่อ `restore_backup_v5(JSONB)` เพื่อคง compatibility ของ API แต่รองรับ payload v7 เพราะ API ตรวจ schema และ checksum ก่อนเรียกฟังก์ชัน

## การตรวจสอบ

การแก้บั๊กเพิ่มเติม: ตรวจผลของแต่ละ BulkWriter write ก่อนให้ snapshot พร้อมใช้งาน และรอให้งานลบทุกตัวใน batch จบก่อนเริ่ม rollback ป้องกันงานลบเดิมไปลบข้อมูลที่เพิ่งกู้กลับมา ความล้มเหลวในการอัปเดตสถานะ snapshot หลังตรวจข้อมูลสำเร็จจะไม่ทำให้ย้อนข้อมูลซ้ำ

หน้าจอแสดง schema ของไฟล์ต้นฉบับและแยกไฟล์เก่าที่ไม่มี checksum ออกจากไฟล์ที่ตรวจ checksum แล้ว ป้องกันผลอ่านไฟล์เก่าทับไฟล์ที่เลือกใหม่และการส่ง Restore ซ้ำ พร้อมแสดงผล Restore สำเร็จแยกจากความล้มเหลวในการรีเฟรชหน้าจอ

ใช้ `npm.cmd run test:backup` เพื่อตรวจ legacy defaults, manifest counts, checksum, duplicate IDs, parent-child references, country identity และการ round trip ทั้ง 8 หมวด จากนั้นใช้ `npm.cmd run build` เพื่อตรวจ TypeScript และ Next.js routes
