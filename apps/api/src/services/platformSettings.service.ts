// ─────────────────────────────────────────────────────────────────────────────
// Platform-wide configurable rules for the Verification Marketplace (Phase 3).
//
// A fixed-id ('default') singleton row — `getPlatformSettings()` upserts it
// on first read, so every caller can always assume exactly one row exists
// without a separate seed/migration-data step. Every business number the
// Verification Marketplace needs (minimum quote, platform commission,
// cancellation fee rate) is read through here, never hardcoded at the call
// site — see verification.service.ts.
// ─────────────────────────────────────────────────────────────────────────────
import type { PlatformSetting } from '@prisma/client'
import prisma from '../lib/prisma.js'

const SETTINGS_ID = 'default'

export async function getPlatformSettings(): Promise<PlatformSetting> {
  return prisma.platformSetting.upsert({
    where: { id: SETTINGS_ID },
    update: {},
    create: { id: SETTINGS_ID },
  })
}

export interface UpdatePlatformSettingsInput {
  minVerificationFee?: number
  verificationPlatformCommissionRate?: number
  cancellationFeeRateAfterAcceptance?: number
  reporterRewardPointsPerApprovedProperty?: number
}

export async function updatePlatformSettings(
  data: UpdatePlatformSettingsInput,
  adminId: string
): Promise<PlatformSetting> {
  // Ensure the singleton exists before updating it — an update-only call on
  // a never-read settings row would 404 rather than create it.
  await getPlatformSettings()

  return prisma.platformSetting.update({
    where: { id: SETTINGS_ID },
    data: { ...data, updatedBy: adminId },
  })
}
