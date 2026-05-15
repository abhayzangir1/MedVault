export const THEME = {
  colors: {
    bg: '#080d18',
    surface: '#0e1525',
    elevated: '#141c30',
    border: '#1e2d4a',
    teal: '#00d4aa',
    tealDark: '#00b894',
    amber: '#f59e0b',
    red: '#ef4444',
    green: '#22c55e',
    blue: '#3b82f6',
    purple: '#a855f7',
    text: '#e2e8f0',
    muted: '#94a3b8',
    faint: '#64748b'
  }
} as const;

export const SUBSCRIPTION_LIMITS = {
  freeAdditionalCareProfiles: 1,
  proAdditionalCareProfiles: 5,
  freeAiOrOcrUsesPerMonth: 3,
  proAiOrOcrUsesPerMonth: 100,
  proIndiaMonthlyInr: 299,
  proInternationalMonthlyUsd: 9.99,
  proFamilyMonthlyProductId: 'medvault_pro_family_monthly',
  freeBasicDoctorPacketsPerMonth: 1,
  freeActiveShareLinks: 1,
  proActiveShareLinks: 10,

  // Backward-compatible aliases while older slices are migrated.
  freeFamilyMembers: 1,
  freeAiUsesPerMonth: 3
} as const;

export const GOOGLE_PLAY_PRODUCT_IDS = {
  proFamilyMonthly: 'medvault_pro_family_monthly'
} as const;

export const LEGACY_RAZORPAY_PLAN_ENV_KEYS = {
  indiaMonthly: 'RAZORPAY_PLAN_PRO_INR_MONTHLY',
  internationalMonthly: 'RAZORPAY_PLAN_PRO_USD_MONTHLY'
} as const;

export const EVENT_CATEGORIES = [
  { id: 'diagnosis', label: 'Diagnosis' },
  { id: 'medication', label: 'Medication' },
  { id: 'surgery', label: 'Surgery' },
  { id: 'vaccination', label: 'Vaccination' },
  { id: 'allergy', label: 'Allergy' },
  { id: 'injury', label: 'Injury' },
  { id: 'lab_test', label: 'Lab Test' },
  { id: 'imaging', label: 'Imaging' },
  { id: 'consultation', label: 'Consultation' },
  { id: 'hospitalization', label: 'Hospitalization' },
  { id: 'other', label: 'Other' }
] as const;

export const DOCUMENT_CATEGORIES = [
  { id: 'lab_report', label: 'Lab Report' },
  { id: 'prescription', label: 'Prescription' },
  { id: 'insurance', label: 'Insurance' },
  { id: 'imaging', label: 'Imaging' },
  { id: 'discharge_summary', label: 'Discharge Summary' },
  { id: 'other', label: 'Other' }
] as const;

export const COST_CATEGORIES = [
  { id: 'consultation', label: 'Consultation' },
  { id: 'medication', label: 'Medication' },
  { id: 'lab', label: 'Lab' },
  { id: 'imaging', label: 'Imaging' },
  { id: 'surgery', label: 'Surgery' },
  { id: 'insurance_premium', label: 'Insurance' },
  { id: 'other', label: 'Other' }
] as const;

export const REIMBURSEMENT_STATUSES = [
  { id: 'not_applicable', label: 'N/A' },
  { id: 'pending', label: 'Pending' },
  { id: 'submitted', label: 'Submitted' },
  { id: 'reimbursed', label: 'Reimbursed' }
] as const;

export const RELATIONSHIP_OPTIONS = [
  { id: 'spouse', label: 'Spouse' },
  { id: 'parent', label: 'Parent' },
  { id: 'child', label: 'Child' },
  { id: 'sibling', label: 'Sibling' },
  { id: 'other', label: 'Other' }
] as const;

export const BLOOD_TYPE_OPTIONS = ['Unknown', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;
