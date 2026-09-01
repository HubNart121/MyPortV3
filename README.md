# MyPortV3

This is a [Next.js](https://nextjs.org) project for managing stock portfolios.

## Getting Started

First, run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## ใช้งานแบบ Offline บน Docker Desktop

โหมด Offline แยกจาก Firebase Production โดยสมบูรณ์ ใช้ฐานข้อมูล PostgreSQL และที่เก็บไฟล์ภายใน Docker ของเครื่องนี้ เข้าระบบได้ทันทีโดยไม่ต้อง Login และเปิดให้เข้าถึงเฉพาะ `http://localhost:3020`

### ติดตั้งครั้งแรก

1. เปิด Docker Desktop และรอจนสถานะพร้อมใช้งาน
2. เปิด PowerShell ในโฟลเดอร์โปรเจกต์
3. เรียกสคริปต์ติดตั้งพร้อมระบุไฟล์ Backup JSON v5 ล่าสุด (ยังรองรับไฟล์ v1-v4):

```powershell
.\scripts\offline\Install-MyPort-Offline.ps1 -BackupJson ".\tmp\offline-safety-2026-08-02\firebase-backup-latest-2026-08-02.json"
```

ระบบจะ Build Image, เปิด PostgreSQL แบบ Local, Restore ข้อมูลทั้ง 7 หมวด และพยายามดาวน์โหลดไฟล์แนบเดิมจาก Firebase Storage เข้า Local Volume ขณะที่ยังออนไลน์

### เปิด หยุด และสำรองข้อมูล

```powershell
.\scripts\offline\Start-MyPort-Offline.ps1
.\scripts\offline\Stop-MyPort-Offline.ps1
.\scripts\offline\Backup-MyPort-Offline.ps1
```

- การ Stop จะไม่ลบข้อมูลหรือ Volume
- Backup เป็น ZIP ชุดเดียว มี PostgreSQL dump, Backup JSON v5, ไฟล์อัปโหลด และ SHA-256 checksum
- Restore ZIP รองรับทั้ง `backup-v5.json` และชุดเดิมที่มี `backup-v4.json`
- ห้ามใช้ `docker compose down -v` เพราะ `-v` จะลบข้อมูล Offline

### กู้คืนจาก Offline Backup ZIP

```powershell
.\scripts\offline\Restore-MyPort-Offline.ps1 -BackupZip "C:\path\my-port-offline-yyyyMMdd-HHmmss.zip" -Confirm RESTORE
```

สคริปต์จะตรวจ Checksum และทดลองกู้ลง Volume ชั่วคราวก่อน จากนั้นสร้าง Backup ฉุกเฉินแล้วจึงแทนที่ฐานข้อมูลและไฟล์หลัก

### ข้อจำกัดสำคัญ

- Offline และ Firebase ไม่ Sync กันอัตโนมัติหลังย้ายข้อมูล
- ไฟล์ JSON เก็บ Metadata เท่านั้น ส่วนไฟล์จริงอยู่ใน Docker Volume และรวมอยู่ใน Offline Backup ZIP
- หลัง Build และย้ายข้อมูลสำเร็จ แอปทำงานได้โดยไม่ใช้อินเทอร์เน็ต แต่ Docker Desktop ต้องเปิดอยู่
- Firebase Production ไม่ถูกแก้ไขหรือลบโดยขั้นตอน Offline นี้

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Deploy to Google Firebase

The application supports two data modes:

- Local development without Firebase variables uses the existing Supabase/PostgreSQL service.
- When Firebase variables are present, the app uses Firebase Authentication and
  Cloud Firestore. Cloud Storage is used for direct binary uploads when a bucket
  has been provisioned.

> The `myport-v2` Firebase project is on the Blaze plan with a THB 300 monthly
> budget alert. The production backend is deployed in Singapore at
> `https://my-port-v2--myport-v2.asia-southeast1.hosted.app`.

### 1. Create Firebase services

In the Firebase console:

1. Create a Firebase project and a Web app.
2. Enable Authentication providers: Google and/or Email/Password.
3. Create a Cloud Firestore database.
4. Create a Cloud Storage bucket (Blaze).
5. Create an App Hosting backend with backend ID `my-port-v2` (Blaze).

### 2. Configure App Hosting variables

Add all `NEXT_PUBLIC_FIREBASE_*` variables listed in `.env.example` to the App
Hosting backend. They must be available at both build time and runtime.

For local Docker development, put the values in `.env.local` and start with
`docker compose -f docker-compose.dev.yml up -d`. The development compose file
loads `.env.local` after `.env`, so the Firebase values take precedence.

### 3. Deploy rules and application

```bash
npx firebase-tools login
npx firebase-tools use --add
npx firebase-tools deploy --only firestore:rules,storage
npx firebase-tools deploy --only apphosting:my-port-v2
```

### 4. Backup and Restore portfolio data

Open **Backup / Restore** to download a JSON snapshot of the current account or
restore a JSON backup. Restore validates the file, shows counts for all seven
categories, creates a server-side recovery snapshot, replaces the current
account data, and verifies the stored counts. If verification fails, the server
automatically restores the previous snapshot.

Backup JSON v5 includes `expected_dividend_per_year`, remains compatible with
older v1-v4 files, and intentionally excludes Activity Log so a portfolio
restore cannot erase the audit trail.

Restore is JSON-only, requires an authorized Firebase account and a final
confirmation dialog after pressing `RESTORE FILE`, and accepts files up to 5 MB. Uploaded file
records contain metadata and links only; binary files are not embedded in JSON.

Firestore and Storage rules keep each user's data under their authenticated UID.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.
