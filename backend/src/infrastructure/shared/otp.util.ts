import crypto from 'node:crypto';
import type { OtpType } from './enums.js';

const OTP_DERIVE_SECRET = process.env.OTP_SECRET ?? 'sol-dev-otp-hmac-key';

/**
 * Deterministically derives a 4-digit OTP (1000..9999) for a passenger assignment
 * without persisting plaintext OTP codes inside PostgreSQL or audit logs.
 */
export function deriveAssignmentOtp(
  organizationId: string,
  assignmentId: string,
  otpType: OtpType = 'BOARDING',
): string {
  const digest = crypto
    .createHmac('sha256', OTP_DERIVE_SECRET)
    .update(`${organizationId}:${assignmentId}:${otpType}`)
    .digest();
  const numeric = (digest.readUInt32BE(0) % 9000) + 1000;
  return String(numeric);
}

/**
 * Computes the salted SHA-256 digest stored in `otp_records.otp_code_hash`.
 */
export function hashOtpCode(organizationId: string, otpCode: string): string {
  return crypto
    .createHash('sha256')
    .update(`${organizationId}:${otpCode.trim()}`)
    .digest('hex');
}

export function verifyOtpCode(
  organizationId: string,
  candidateOtp: string,
  storedHash: string,
): boolean {
  const candidateHash = hashOtpCode(organizationId, candidateOtp);
  const a = Buffer.from(candidateHash, 'hex');
  const b = Buffer.from(storedHash, 'hex');
  if (a.length === 0 || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

