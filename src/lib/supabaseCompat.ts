export function isSelfCareProfile(userId: string, careProfileId: string | null) {
  return !careProfileId || careProfileId === userId;
}

export function toLegacyProfileId(userId: string, careProfileId: string | null) {
  return isSelfCareProfile(userId, careProfileId) ? null : careProfileId;
}

export function isMissingCareProfileColumn(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const message = 'message' in error ? String(error.message) : '';
  const details = 'details' in error ? String(error.details) : '';
  const hint = 'hint' in error ? String(error.hint) : '';
  return [message, details, hint].some((value) => value.toLowerCase().includes('care_profile_id'));
}
