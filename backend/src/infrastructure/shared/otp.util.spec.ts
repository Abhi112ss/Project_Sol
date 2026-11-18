import { describe, expect, it } from 'vitest';
import { deriveAssignmentOtp, hashOtpCode, verifyOtpCode } from './otp.util.js';

describe('otp.util', () => {
  const orgId = '11111111-1111-4111-8111-111111111101';
  const assignmentId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa99';

  it('derives deterministic 4-digit OTPs scoped by org, assignment, and type', () => {
    const boardingA = deriveAssignmentOtp(orgId, assignmentId, 'BOARDING');
    const boardingB = deriveAssignmentOtp(orgId, assignmentId, 'BOARDING');
    const deboarding = deriveAssignmentOtp(orgId, assignmentId, 'DEBOARDING');

    expect(boardingA).toMatch(/^\d{4}$/);
    expect(Number(boardingA)).toBeGreaterThanOrEqual(1000);
    expect(boardingA).toBe(boardingB);
    expect(deboarding).not.toBe(boardingA);
  });

  it('verifies matching SHA-256 OTP hashes without plaintext persistence', () => {
    const otp = deriveAssignmentOtp(orgId, assignmentId, 'BOARDING');
    const storedHash = hashOtpCode(orgId, otp);

    expect(storedHash).not.toContain(otp);
    expect(verifyOtpCode(orgId, otp, storedHash)).toBe(true);
    expect(verifyOtpCode(orgId, '0000', storedHash)).toBe(false);
    expect(verifyOtpCode('22222222-2222-4222-8222-222222222201', otp, storedHash)).toBe(false);
  });
});

