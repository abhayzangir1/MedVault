import { format } from 'date-fns';
import type { BillingRegion, PlanType } from '@/types';

export function formatDate(value: string | Date, pattern = 'dd MMM yyyy') {
  return format(new Date(value), pattern);
}

export function resolveBillingRegion(countryCode?: string | null): BillingRegion {
  return countryCode?.toUpperCase() === 'IN' ? 'IN' : 'INTL';
}

export function isProPlan(plan?: PlanType | null) {
  return plan === 'pro';
}
