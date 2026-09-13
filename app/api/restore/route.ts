import { completeBackupData } from '@/lib/backup';
import { backupDataSchema } from '@/lib/security/backup-schema';
import { requireAuthorizedUser } from '@/lib/security/authorization';
import { secureError, secureJson } from '@/lib/security/api-response';
import { SecurityConfigurationError } from '@/lib/security/config';
import { isSecurityAccessError } from '@/lib/security/errors';
import { enforceBackupRateLimit } from '@/lib/security/rate-limit';
import {
  RestoreInProgressError,
  RestoreRollbackFailedError,
  RestoreRolledBackError,
  restoreJsonBackupForEmail,
} from '@/lib/security/restore-store';
import { recordAdminActivityLogForEmail } from '@/lib/security/activity-log-admin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 300;

const MAX_RESTORE_BYTES = 5 * 1024 * 1024;

function validMutationOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;

  const configured = process.env.APP_ORIGIN?.trim();
  try {
    if (configured) return new URL(origin).origin === new URL(configured).origin;
    return process.env.NODE_ENV !== 'production'
      && new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

async function rateLimitResponse(request: Request, email: string) {
  const result = await enforceBackupRateLimit(request, email);
  const headers = {
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(result.reset),
  };
  if (result.unavailable) {
    return secureError(503, 'RATE_LIMIT_UNAVAILABLE', 'Restore protection is temporarily unavailable', {
      ...headers,
      'Retry-After': String(result.retryAfter),
    });
  }
  if (!result.allowed) {
    return secureError(429, 'RATE_LIMIT_EXCEEDED', 'Too many restore requests', {
      ...headers,
      'Retry-After': String(result.retryAfter),
    });
  }
  return null;
}

function handledRestoreError(error: unknown) {
  if (error instanceof RestoreInProgressError) {
    return secureError(409, 'RESTORE_IN_PROGRESS', 'Another restore is already in progress');
  }
  if (error instanceof RestoreRolledBackError) {
    return secureJson({
      ok: false,
      error: {
        code: 'RESTORE_ROLLED_BACK',
        message: 'Restore failed; the previous data was restored automatically',
        recovery_id: error.recoveryId,
      },
    }, { status: 500 });
  }
  if (error instanceof RestoreRollbackFailedError) {
    return secureJson({
      ok: false,
      error: {
        code: 'RESTORE_ROLLBACK_FAILED',
        message: 'Restore and automatic rollback failed; stop editing data and contact the administrator',
        recovery_id: error.recoveryId,
      },
    }, { status: 500 });
  }
  if (isSecurityAccessError(error)) {
    return secureError(error.status, error.code, error.message);
  }
  if (error instanceof SecurityConfigurationError) {
    return secureError(503, 'SECURITY_CONFIGURATION_ERROR', 'Security configuration is unavailable');
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const user = await requireAuthorizedUser(request);
    const limited = await rateLimitResponse(request, user.email);
    if (limited) return limited;

    if (!validMutationOrigin(request)) {
      return secureError(403, 'INVALID_ORIGIN', 'Request origin is not allowed');
    }
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
      return secureError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json');
    }

    const contentLength = Number.parseInt(request.headers.get('content-length') ?? '0', 10);
    if (contentLength > MAX_RESTORE_BYTES) {
      return secureError(413, 'RESTORE_TOO_LARGE', 'Restore file exceeds the 5 MB limit');
    }
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, 'utf8') > MAX_RESTORE_BYTES) {
      return secureError(413, 'RESTORE_TOO_LARGE', 'Restore file exceeds the 5 MB limit');
    }

    let json: unknown;
    try {
      json = JSON.parse(rawBody);
    } catch {
      return secureError(400, 'INVALID_JSON', 'Restore body must be valid JSON');
    }
    const parsed = backupDataSchema.safeParse(json);
    if (!parsed.success) {
      return secureError(400, 'INVALID_RESTORE_FILE', 'JSON data does not match the supported backup structure');
    }

    const result = await restoreJsonBackupForEmail(user.email, completeBackupData(parsed.data));
    await recordAdminActivityLogForEmail(user.email, {
      action: 'restore',
      category: 'system',
      target_label: 'Backup JSON',
      summary: `Restore JSON สำเร็จ ${result.counts.stocks} หุ้น`,
      metadata: {
        stocks: result.counts.stocks,
        buy_rounds: result.counts.buy_rounds,
        realized_trades: result.counts.realized_trades,
        dividend_payments: result.counts.dividend_payments,
        cash_transactions: result.counts.cash_transactions,
        files: result.counts.files,
        informations: result.counts.informations,
        bank_accounts: result.counts.bank_accounts,
        recovery_id: result.recoveryId,
      },
    });
    return secureJson({
      ok: true,
      counts: result.counts,
      recovery_id: result.recoveryId,
    });
  } catch (error) {
    return handledRestoreError(error)
      ?? secureError(500, 'RESTORE_FAILED', 'Unable to restore JSON backup');
  }
}
