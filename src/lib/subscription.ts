import { SUBSCRIPTION_LIMITS } from '@/lib/constants';
import type { BillingRegion, Profile } from '@/types';

export interface FeatureGateResult {
  allowed: boolean;
  reason: string | null;
}

export function getBillingRegion(country?: string | null): BillingRegion {
  return country?.toUpperCase() === 'IN' ? 'IN' : 'INTL';
}

export function getProPriceLabel(region: BillingRegion) {
  return region === 'IN'
    ? `INR ${SUBSCRIPTION_LIMITS.proIndiaMonthlyInr}/month`
    : `USD ${SUBSCRIPTION_LIMITS.proInternationalMonthlyUsd}/month`;
}

export function isProProfile(profile?: Pick<Profile, 'plan' | 'subscription_status'> | null) {
  const isPaidPlan = profile?.plan === 'pro' || profile?.plan === 'pro_family';
  const activeStatuses = new Set(['active', 'trialing', 'in_grace_period']);
  return isPaidPlan && activeStatuses.has(profile?.subscription_status ?? '');
}

export function canAddFamilyMember(profile: Profile | null, currentFamilyCount: number): FeatureGateResult {
  const limit = isProProfile(profile)
    ? SUBSCRIPTION_LIMITS.proAdditionalCareProfiles
    : SUBSCRIPTION_LIMITS.freeAdditionalCareProfiles;

  if (currentFamilyCount < limit) {
    return { allowed: true, reason: null };
  }

  return {
    allowed: false,
    reason: isProProfile(profile)
      ? `Pro Family includes up to ${SUBSCRIPTION_LIMITS.proAdditionalCareProfiles} additional active care profiles. Family Plus is planned for larger households.`
      : `Free includes ${SUBSCRIPTION_LIMITS.freeAdditionalCareProfiles} additional care profile. Upgrade to Pro Family for up to ${SUBSCRIPTION_LIMITS.proAdditionalCareProfiles} additional active profiles.`
  };
}

export function canUseAi(profile: Profile | null): FeatureGateResult {
  const limit = isProProfile(profile)
    ? SUBSCRIPTION_LIMITS.proAiOrOcrUsesPerMonth
    : SUBSCRIPTION_LIMITS.freeAiOrOcrUsesPerMonth;

  const used = profile?.ai_interpretations_used ?? 0;
  if (used < limit) {
    return { allowed: true, reason: null };
  }

  return {
    allowed: false,
    reason: isProProfile(profile)
      ? `Pro Family includes ${SUBSCRIPTION_LIMITS.proAiOrOcrUsesPerMonth} AI/OCR uses per month.`
      : `Free includes ${SUBSCRIPTION_LIMITS.freeAiOrOcrUsesPerMonth} AI/OCR uses per month. Upgrade to Pro Family for ${SUBSCRIPTION_LIMITS.proAiOrOcrUsesPerMonth} monthly uses.`
  };
}

export function canCreateDoctorPacket(profile: Profile | null, currentBasicPacketsThisMonth: number, includesFamily: boolean): FeatureGateResult {
  if (isProProfile(profile)) return { allowed: true, reason: null };

  if (!includesFamily && currentBasicPacketsThisMonth < SUBSCRIPTION_LIMITS.freeBasicDoctorPacketsPerMonth) {
    return { allowed: true, reason: null };
  }

  return {
    allowed: false,
    reason: 'Free includes one basic self Doctor Packet per month. Upgrade to Pro Family for family packets, polished PDFs, attachments, AI summaries, and scheduled packets.'
  };
}
