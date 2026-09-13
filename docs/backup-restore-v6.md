# Backup / Restore v6

สำรองข้อมูล 8 หมวด: หุ้น (รวมประเทศ), รอบซื้อ, รายการขาย, ปันผล,
ฝาก/ถอน, รายการไฟล์, คลังความรู้ และบัญชีธนาคาร

Restore เป็นการแทนที่ข้อมูลทั้งบัญชี ไม่ใช่การรวมข้อมูล ไฟล์เก่าที่ไม่มี
บัญชีธนาคารจะถูกตีความเป็นรายการว่าง จึงล้างบัญชีธนาคารปัจจุบันเมื่อยืนยัน
Activity Log ไม่ถูกแทนที่ ส่วนไฟล์แนบสำรองเฉพาะ metadata และลิงก์
ต้องเก็บไฟล์ไบนารี/volume uploads แยกต่างหาก

Firebase สร้าง recovery snapshot ก่อนแทนที่ และอ่านกลับมาตรวจจำนวนกับเนื้อหา
PostgreSQL ทำงานใน transaction และตรวจจำนวนทั้ง 8 หมวดก่อน commit
PostgreSQL เปลี่ยน IDs เป็น UUID ใหม่ จึงไม่ใช้ signature ที่รวม IDs ของ Firebase

## อัปเดต PostgreSQL ที่มีข้อมูลอยู่แล้ว

สคริปต์ init ของ Docker ไม่รันซ้ำกับ volume เดิม ให้ผู้ดูแลรัน SQL ตามลำดับ:

1. `docker/db/11-bank-accounts.sql`
2. `docker/db/12-stock-country.sql`
3. `docker/db/13-platform-trade.sql`
4. `docker/db/09-offline-restore.sql`

ขั้นตอนที่ 4 อัปเดตฟังก์ชัน `restore_backup_v5` ให้รองรับ payload v6
ชื่อฟังก์ชันเดิมคงไว้สำหรับ API สคริปต์นี้เพียงสร้างฟังก์ชัน ไม่เรียก Restore
ห้ามลบ volume เพื่อบังคับรัน init เพราะจะทำให้ข้อมูลเดิมหาย

## ตรวจสอบ

`npm.cmd run test:backup` ตรวจ schema, legacy defaults, manifest,
หุ้นซ้ำ, parent references และ JSON round trip รวมบัญชีธนาคารและประเทศ
ไม่ใช่การทดสอบ Restore กับบัญชี production หรือ PostgreSQL จริง

PlatformTrade เก็บใน platform_trade เป็นข้อความ รองรับชื่อใหม่โดยไม่ต้องเพิ่ม enum; backup เก่าที่ไม่มีฟิลด์นี้ใช้ null และยังใช้ schema v6 ได้
